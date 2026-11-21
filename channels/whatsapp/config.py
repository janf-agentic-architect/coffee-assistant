import os
import re
from pathlib import Path
from dotenv import load_dotenv

# Search and load .env files in order of precedence:
# 1. channels/whatsapp/.env
# 2. channels/.env
# 3. agents/coffee-assistant/.env
# 4. root .env
current_dir = Path(__file__).resolve().parent
repo_root = current_dir.parent.parent
search_paths = [
    current_dir / ".env",
    current_dir.parent / ".env",
    repo_root / "agents" / "coffee-assistant" / ".env",
    repo_root / "agents" / "chat-assistant" / ".env",
    repo_root / ".env",
]
for env_path in search_paths:
    if env_path.exists():
        load_dotenv(env_path, override=False)


def _load_tfvars_dict() -> dict[str, str]:
    """Parse simple key = "value" pairs from infra/vars/env.tfvars as local fallback."""
    tfvars_path = repo_root / "infra" / "vars" / "env.tfvars"
    result: dict[str, str] = {}
    if not tfvars_path.exists():
        return result
    try:
        pattern = re.compile(r'^\s*([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"')
        for line in tfvars_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("//"):
                continue
            match = pattern.match(stripped)
            if match:
                result[match.group(1)] = match.group(2).strip()
    except Exception:
        pass
    return result


_TFVARS = _load_tfvars_dict()
_PLACEHOLDERS = {"initial_placeholder", "auto", "eaag...", "your-meta-system-user-access-token", "your-meta-app-secret"}


def _clean_val(val: str) -> str:
    cleaned = (val or "").strip()
    if cleaned.lower() in _PLACEHOLDERS:
        return ""
    return cleaned


def _get_setting(env_keys: list[str], tfvars_key: str = "", default: str = "") -> str:
    for key in env_keys:
        if key in os.environ:
            cleaned = _clean_val(os.environ[key])
            return cleaned or default
    if tfvars_key and tfvars_key in _TFVARS:
        cleaned = _clean_val(_TFVARS[tfvars_key])
        if cleaned:
            return cleaned
    return default


class Settings:
    # Meta / WhatsApp Cloud API credentials (populated via Secret Manager in Cloud Run or env.tfvars locally)
    WHATSAPP_TOKEN: str = _get_setting(["WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN"], "whatsapp_token")
    WHATSAPP_PHONE_NUMBER_ID: str = _get_setting(["WHATSAPP_PHONE_NUMBER_ID"], "whatsapp_phone_number_id")
    WHATSAPP_BUSINESS_ACCOUNT_ID: str = _get_setting(
        ["WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_WABA_ID"], "whatsapp_waba_id"
    )
    WHATSAPP_BOT_PHONE_NUMBER: str = _get_setting(["WHATSAPP_BOT_PHONE_NUMBER", "WHATSAPP_TEST_PHONE_NUMBER"])
    WHATSAPP_TEST_RECIPIENT_PHONE_NUMBER: str = _get_setting(["WHATSAPP_TEST_RECIPIENT_PHONE_NUMBER"])
    WHATSAPP_VERIFY_TOKEN: str = _get_setting(
        ["WHATSAPP_VERIFY_TOKEN"], "whatsapp_verify_token", default="coffee_assistant_verify_token"
    )
    WHATSAPP_APP_SECRET: str = _get_setting(["WHATSAPP_APP_SECRET"], "whatsapp_app_secret")
    WHATSAPP_API_VERSION: str = os.getenv("WHATSAPP_API_VERSION", "v25.0")

    @property
    def formatted_api_version(self) -> str:
        ver = self.WHATSAPP_API_VERSION.strip()
        if not ver.startswith("v"):
            ver = f"v{ver}"
        if "." not in ver:
            ver = f"{ver}.0"
        return ver

    # ADK Agent Server Configuration
    ADK_API_URL: str = (
        os.getenv("ADK_API_URL")
        or os.getenv("AGENT_RUNTIME_API_URL")
        or "http://localhost:8000"
    ).rstrip("/")
    ADK_APP_NAME: str = os.getenv("ADK_APP_NAME", "chat_assistant")
    ADK_USER_PREFIX: str = os.getenv("ADK_USER_PREFIX", "wa_")

    # Optional GCP service account credentials for remote agent runtime
    GCP_SA_KEY_JSON: str = os.getenv("GCP_SA_KEY_JSON", "")


settings = Settings()
