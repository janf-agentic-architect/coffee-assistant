import argparse
import asyncio
import os
import subprocess
import sys
import httpx
from .client import WhatsAppCloudApiClient
from .config import _TFVARS, _clean_val, settings


def _get_gcp_secret(secret_id: str, project_id: str) -> str:
    """Read latest secret version directly from GCP Secret Manager."""
    if not project_id:
        return ""
    try:
        res = subprocess.run(
            [
                "gcloud",
                "secrets",
                "versions",
                "access",
                "latest",
                f"--secret={secret_id}",
                f"--project={project_id}",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode == 0:
            return _clean_val(res.stdout)
    except Exception:
        pass
    return ""


async def detect_ngrok_webhook_url(retries: int = 10, delay: float = 1.0) -> str:
    """Query local ngrok API (http://127.0.0.1:4040/api/tunnels) to auto-detect public HTTPS URL."""
    async with httpx.AsyncClient(timeout=3.0) as client:
        for _ in range(retries):
            try:
                resp = await client.get("http://127.0.0.1:4040/api/tunnels")
                if resp.status_code == 200:
                    tunnels = resp.json().get("tunnels") or []
                    for t in tunnels:
                        pub_url = t.get("public_url", "")
                        if pub_url.startswith("https://"):
                            return f"{pub_url.rstrip('/')}/webhooks/whatsapp"
            except Exception:
                pass
            await asyncio.sleep(delay)
    return ""


async def subscribe_waba(
    webhook_url: str = "",
    verify_token: str = "",
    auto_ngrok: bool = False,
    from_gcp: bool = False,
    project_id: str = "",
) -> None:
    if from_gcp:
        proj = project_id or _clean_val(_TFVARS.get("project_id", ""))
        print(f"==> Leyendo credenciales de producción desde GCP Secret Manager / env.tfvars (proyecto: {proj or 'auto'})...")
        token = _get_gcp_secret("whatsapp-token", proj) or _clean_val(_TFVARS.get("whatsapp_token", ""))
        app_secret = _get_gcp_secret("whatsapp-app-secret", proj) or _clean_val(_TFVARS.get("whatsapp_app_secret", ""))
        phone_id_cfg = _get_gcp_secret("whatsapp-phone-number-id", proj) or _clean_val(
            _TFVARS.get("whatsapp_phone_number_id", "")
        )
        verify_token = (
            verify_token
            or _get_gcp_secret("whatsapp-verify-token", proj)
            or _clean_val(_TFVARS.get("whatsapp_verify_token", ""))
        ).strip()
        waba_id = _clean_val(_TFVARS.get("whatsapp_waba_id", ""))
    else:
        token = settings.WHATSAPP_TOKEN.strip()
        app_secret = settings.WHATSAPP_APP_SECRET.strip()
        waba_id = settings.WHATSAPP_BUSINESS_ACCOUNT_ID.strip()
        phone_id_cfg = settings.WHATSAPP_PHONE_NUMBER_ID.strip()
        verify_token = (verify_token or settings.WHATSAPP_VERIFY_TOKEN or "").strip()

    webhook_url = (webhook_url or os.getenv("WHATSAPP_WEBHOOK_URL", "")).strip()
    api_version = settings.formatted_api_version

    if not token:
        print("⚠️  WHATSAPP_TOKEN no está configurado (en GCP Secret Manager / infra/vars/env.tfvars). Omitiendo suscripción en Meta.")
        sys.exit(0)

    if auto_ngrok and not webhook_url:
        print("==> Esperando túnel de ngrok en http://127.0.0.1:4040 ...")
        webhook_url = await detect_ngrok_webhook_url()
        if webhook_url:
            print(f"✓ Túnel ngrok detectado: {webhook_url}")
        else:
            print("⚠️  No se detectó un túnel activo de ngrok en 127.0.0.1:4040.")

    wa_client = WhatsAppCloudApiClient(token=token)
    discovered = await wa_client.discover_account_info(waba_id_hint=waba_id)

    app_id = discovered.get("app_id", "")
    waba_id = waba_id or discovered.get("waba_id", "")
    phone_number_id = phone_id_cfg or discovered.get("phone_number_id", "")
    display_phone = discovered.get("display_phone_number", "")

    print(f"==> Meta Graph API Discovery ({api_version}):")
    print(f"  • App ID:          {app_id or '(no detectado)'}")
    print(f"  • WABA ID:         {waba_id or '(no detectado)'}")
    print(f"  • Phone Number ID: {phone_number_id or '(se autodescubrirá en el webhook)'} {f'({display_phone})' if display_phone else ''}")

    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. If webhook_url, app_id, app_secret, and verify_token are available, auto-configure the App Webhook URL
        if webhook_url and app_id and app_secret and verify_token:
            sub_url = f"https://graph.facebook.com/{api_version}/{app_id}/subscriptions"
            app_access_token = f"{app_id}|{app_secret}"
            print(f"==> Registrando Callback URL en Meta App ({app_id}): {webhook_url} ...")
            resp = await client.post(
                sub_url,
                data={
                    "object": "whatsapp_business_account",
                    "callback_url": webhook_url,
                    "verify_token": verify_token,
                    "fields": "messages",
                    "access_token": app_access_token,
                },
            )
            if resp.status_code == 200:
                print("✓ ¡Webhook URL y campo 'messages' configurados automáticamente en la App de Meta!")
            else:
                print(f"⚠️  No se pudo registrar automáticamente la URL en la App de Meta (status={resp.status_code}): {resp.text}")
                print(f"   Puedes configurarla manualmente en Meta Dashboard con:")
                print(f"   Callback URL: {webhook_url}")
                print(f"   Verify Token: {verify_token}")
        elif webhook_url:
            print("ℹ️  Para registrar el Callback URL automáticamente en la App de Meta, asegúrate de configurar `whatsapp_app_secret` en infra/vars/env.tfvars.")

        # 2. Subscribe the WABA to the Meta App to receive webhook events
        if not waba_id:
            print("❌ Error: No se pudo autodescubrir el WABA ID desde el token. Define `whatsapp_waba_id` en infra/vars/env.tfvars.")
            sys.exit(1)

        url = f"https://graph.facebook.com/{api_version}/{waba_id}/subscribed_apps"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        print(f"==> Suscribiendo WABA ID '{waba_id}' a los eventos de la App en Meta...")
        resp = await client.post(url, headers=headers)
        if resp.status_code == 200:
            print("✓ ¡Suscripción de WABA exitosa!")
        else:
            print(f"❌ Error al suscribir WABA (status={resp.status_code}): {resp.text}")
            sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-discover Meta WABA, configure webhook URL, and subscribe WABA.")
    parser.add_argument("--webhook-url", default="", help="Public Cloud Run or ngrok Webhook Callback URL")
    parser.add_argument("--verify-token", default="", help="Webhook Verify Token")
    parser.add_argument(
        "--auto-ngrok",
        action="store_true",
        help="Automatically detect running local ngrok tunnel and register its URL in Meta",
    )
    parser.add_argument(
        "--from-gcp",
        action="store_true",
        help="Read production credentials strictly from GCP Secret Manager / infra/vars/env.tfvars (ignores local .env)",
    )
    parser.add_argument("--project-id", default="", help="GCP Project ID for Secret Manager lookup")
    args = parser.parse_args()
    asyncio.run(
        subscribe_waba(
            webhook_url=args.webhook_url,
            verify_token=args.verify_token,
            auto_ngrok=args.auto_ngrok,
            from_gcp=args.from_gcp,
            project_id=args.project_id,
        )
    )


if __name__ == "__main__":
    main()
