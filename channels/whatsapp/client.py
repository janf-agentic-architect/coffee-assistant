import logging
from typing import Any, Optional, Tuple
import httpx

from .config import settings

logger = logging.getLogger("whatsapp.client")


def normalize_phone_number(phone: str) -> str:
    """Normalize phone number for WhatsApp Cloud API.

    In Mexico (+52):
    WhatsApp incoming messages often deliver the sender ID with an extra '1' between
    the country code (52) and the national number:
    - E.g. '52133XXXXXXXX' (Guadalajara, area code 33) or any Mexican mobile (total 13 digits).

    When sending messages via WhatsApp Cloud API or checking against Meta's
    recipient whitelist, the '1' must be omitted, leaving 12 digits: '52' + 10 digits
    (e.g., '5233XXXXXXXX').
    """
    if not phone:
        return ""

    digits = "".join(ch for ch in str(phone) if ch.isdigit())

    # For Mexico: 521 + 10 digits = 13 digits -> strip the '1'
    if digits.startswith("521") and len(digits) == 13:
        digits = f"52{digits[3:]}"

    return digits


class WhatsAppCloudApiClient:
    def __init__(
        self,
        token: Optional[str] = None,
        phone_number_id: Optional[str] = None,
        api_version: Optional[str] = None,
    ):
        self.token = token or settings.WHATSAPP_TOKEN
        raw_phone_id = (phone_number_id if phone_number_id is not None else settings.WHATSAPP_PHONE_NUMBER_ID) or ""
        if raw_phone_id.strip().lower() in ("auto", "initial_placeholder"):
            raw_phone_id = ""
        self.phone_number_id = raw_phone_id.strip()
        raw_version = api_version or settings.formatted_api_version
        if not raw_version.startswith("v"):
            raw_version = f"v{raw_version}"
        if "." not in raw_version:
            raw_version = f"{raw_version}.0"
        self.api_version = raw_version
        self.base_url = f"https://graph.facebook.com/{self.api_version}"

    @staticmethod
    def normalize_phone_number(phone: str) -> str:
        return normalize_phone_number(phone)

    def _get_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    async def discover_account_info(self, waba_id_hint: Optional[str] = None) -> dict[str, str]:
        """Auto-discover Meta App ID, WABA ID, and Phone Number ID using only WHATSAPP_TOKEN."""
        info: dict[str, str] = {
            "app_id": "",
            "waba_id": waba_id_hint or settings.WHATSAPP_BUSINESS_ACCOUNT_ID or "",
            "phone_number_id": self.phone_number_id or "",
            "display_phone_number": "",
        }
        if not self.token:
            return info

        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Inspect token via /debug_token to extract app_id and WABA target_ids from granular_scopes
            try:
                debug_resp = await client.get(
                    f"{self.base_url}/debug_token",
                    params={"input_token": self.token, "access_token": self.token},
                )
                if debug_resp.status_code == 200:
                    data = debug_resp.json().get("data", {})
                    if data.get("app_id"):
                        info["app_id"] = str(data["app_id"])
                    if not info["waba_id"]:
                        for scope_entry in data.get("granular_scopes", []):
                            if scope_entry.get("scope") in (
                                "whatsapp_business_management",
                                "whatsapp_business_messaging",
                            ):
                                target_ids = scope_entry.get("target_ids") or []
                                if target_ids:
                                    info["waba_id"] = str(target_ids[0])
                                    break
            except Exception as e:
                logger.debug("Could not inspect debug_token for auto-discovery: %s", e)

            # 2. If WABA ID is known, fetch its phone numbers to discover phone_number_id
            if info["waba_id"] and not info["phone_number_id"]:
                try:
                    phones_resp = await client.get(
                        f"{self.base_url}/{info['waba_id']}/phone_numbers",
                        headers=self._get_headers(),
                    )
                    if phones_resp.status_code == 200:
                        phones = phones_resp.json().get("data") or []
                        if phones:
                            info["phone_number_id"] = str(phones[0].get("id", ""))
                            info["display_phone_number"] = str(phones[0].get("display_phone_number", ""))
                except Exception as e:
                    logger.debug("Could not fetch phone_numbers for WABA %s: %s", info["waba_id"], e)

        return info

    async def ensure_phone_number_id(self) -> str:
        """Return configured phone_number_id or auto-discover and cache it from Meta Graph API."""
        if self.phone_number_id and self.phone_number_id.lower() not in ("auto", "initial_placeholder"):
            return self.phone_number_id

        info = await self.discover_account_info()
        if info.get("phone_number_id"):
            self.phone_number_id = info["phone_number_id"]
            logger.info("Auto-discovered WhatsApp Phone Number ID: %s", self.phone_number_id)
            return self.phone_number_id
        return ""

    async def send_text_message(self, to: str, text: str) -> dict[str, Any]:
        """Send a text message to a WhatsApp user."""
        phone_number_id = await self.ensure_phone_number_id()
        if not self.token or not phone_number_id:
            logger.warning("WhatsApp token or phone_number_id not configured. Message not sent.")
            return {"warning": "WhatsApp credentials not configured"}

        clean_to = self.normalize_phone_number(to)
        logger.info("Sending WhatsApp text message to: %s (original: %s, API version: %s)", clean_to, to, self.api_version)

        url = f"{self.base_url}/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": clean_to,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": text,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, json=payload, headers=self._get_headers())
                if response.status_code >= 400:
                    logger.error(
                        "Error sending WhatsApp message: status=%d response=%s",
                        response.status_code,
                        response.text,
                    )
                    return {"error": response.text, "status_code": response.status_code}
                return response.json()
        except Exception as e:
            logger.error("Exception while sending WhatsApp message to %s: %s", to, e)
            return {"error": str(e)}

    async def mark_as_read(self, message_id: str) -> bool:
        """Mark an incoming WhatsApp message as read (blue ticks)."""
        phone_number_id = await self.ensure_phone_number_id()
        if not self.token or not phone_number_id:
            return False

        url = f"{self.base_url}/{phone_number_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=self._get_headers())
                return response.status_code == 200
        except Exception as e:
            logger.debug("Failed to mark message %s as read: %s", message_id, e)
            return False

    async def get_media_url(self, media_id: str) -> Tuple[str, str]:
        """Fetch the download URL and mime-type for a media ID from Meta Graph API."""
        url = f"{self.base_url}/{media_id}"
        headers = {"Authorization": f"Bearer {self.token}"}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            media_url = data.get("url")
            mime_type = data.get("mime_type", "application/octet-stream")
            if not media_url:
                raise ValueError(f"No media URL returned for media ID: {media_id}")
            return media_url, mime_type

    async def download_media(self, media_id: str) -> Tuple[bytes, str]:
        """Download binary media (image, audio, voice) using media_id.

        Returns:
            Tuple of (binary_bytes, mime_type)
        """
        if not self.token:
            raise ValueError("WHATSAPP_TOKEN is required to download media.")

        media_url, mime_type = await self.get_media_url(media_id)

        headers = {
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "curl/7.68.0",
        }

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(media_url, headers=headers)
            response.raise_for_status()
            return response.content, mime_type
