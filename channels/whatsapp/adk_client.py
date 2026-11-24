import base64
from datetime import datetime
import json
import logging
import re
import time
from typing import Any, List, Optional
import httpx

from .config import settings

logger = logging.getLogger("whatsapp.adk_client")


class AdkAgentClient:
    def __init__(
        self,
        base_url: Optional[str] = None,
        app_name: Optional[str] = None,
        user_prefix: Optional[str] = None,
        session_ttl_seconds: Optional[int] = None,
    ):
        self.base_url = (base_url or settings.ADK_API_URL).rstrip("/")
        self.app_name = app_name or settings.ADK_APP_NAME
        self.user_prefix = user_prefix or settings.ADK_USER_PREFIX
        self.session_ttl_seconds = (
            settings.WHATSAPP_SESSION_TTL_SECONDS
            if session_ttl_seconds is None
            else session_ttl_seconds
        )
        self._credentials = None
        self._user_sessions: dict[str, str] = {}
        self._session_last_activity: dict[str, float] = {}

    def _get_auth_headers(self) -> dict[str, str]:
        """Obtain authorization headers for Google Cloud if calling Agent Runtime."""
        headers: dict[str, str] = {}
        # Only inject Bearer token if connecting to Google Cloud / Vertex AI Agent Runtime
        if "googleapis.com" in self.base_url or settings.GCP_SA_KEY_JSON:
            try:
                import google.auth
                from google.auth.transport.requests import Request

                if self._credentials is None:
                    if settings.GCP_SA_KEY_JSON:
                        from google.oauth2 import service_account
                        sa_info = json.loads(settings.GCP_SA_KEY_JSON)
                        self._credentials = service_account.Credentials.from_service_account_info(
                            sa_info,
                            scopes=["https://www.googleapis.com/auth/cloud-platform"],
                        )
                    else:
                        # Uses Cloud Run Application Default Credentials (ADC)
                        self._credentials, _ = google.auth.default(
                            scopes=["https://www.googleapis.com/auth/cloud-platform"]
                        )

                if not self._credentials.valid:
                    self._credentials.refresh(Request())

                if self._credentials.token:
                    headers["Authorization"] = f"Bearer {self._credentials.token}"
            except Exception as e:
                logger.warning("Could not obtain GCP OAuth2 token for Agent Runtime: %s", e)
        return headers

    @staticmethod
    def _parse_session_timestamp(session: dict[str, Any]) -> Optional[float]:
        """Extract Unix timestamp (seconds) from an ADK session payload."""
        for key in (
            "lastUpdateTime",
            "last_update_time",
            "updateTime",
            "update_time",
            "createTime",
            "create_time",
        ):
            val = session.get(key)
            if val is None or val == "":
                continue
            if isinstance(val, (int, float)):
                if val <= 0:
                    continue
                return float(val / 1000.0) if val > 1e12 else float(val)
            if isinstance(val, str):
                cleaned = val.strip()
                if not cleaned:
                    continue
                try:
                    num = float(cleaned)
                    if num <= 0:
                        continue
                    return float(num / 1000.0) if num > 1e12 else num
                except ValueError:
                    try:
                        return datetime.fromisoformat(
                            cleaned.replace("Z", "+00:00")
                        ).timestamp()
                    except ValueError:
                        continue
        return None

    def _is_session_expired(
        self, last_activity_ts: Optional[float], now: Optional[float] = None
    ) -> bool:
        """Return True if the session has been inactive longer than session_ttl_seconds."""
        if self.session_ttl_seconds <= 0 or last_activity_ts is None:
            return False
        current_ts = time.time() if now is None else now
        return (current_ts - last_activity_ts) > self.session_ttl_seconds

    async def get_or_create_session(self, user_id: str) -> str:
        """Get an existing active session or create a new session if none exists or it expired."""
        now = time.time()
        expired_cached_session_id: Optional[str] = None

        if user_id in self._user_sessions:
            cached_session_id = self._user_sessions[user_id]
            cached_last_ts = self._session_last_activity.get(user_id)
            if not self._is_session_expired(cached_last_ts, now):
                return cached_session_id
            logger.info(
                "Cached session %s for user %s exceeded %ds TTL; checking backend sessions",
                cached_session_id,
                user_id,
                self.session_ttl_seconds,
            )
            expired_cached_session_id = cached_session_id
            self._user_sessions.pop(user_id, None)
            self._session_last_activity.pop(user_id, None)

        headers = self._get_auth_headers()
        url = f"{self.base_url}/apps/{self.app_name}/users/{user_id}/sessions"

        # Try to find an existing non-expired session first
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    sessions = res.json()
                    if isinstance(sessions, list) and sessions:
                        latest = max(
                            enumerate(sessions),
                            key=lambda item: (
                                self._parse_session_timestamp(item[1])
                                if isinstance(item[1], dict)
                                and self._parse_session_timestamp(item[1]) is not None
                                else -1.0,
                                item[0],
                            ),
                        )[1]
                        if isinstance(latest, dict):
                            session_id = latest.get("id")
                            if session_id:
                                session_id_str = str(session_id)
                                last_ts = self._parse_session_timestamp(latest)
                                is_same_expired_without_ts = (
                                    last_ts is None
                                    and expired_cached_session_id == session_id_str
                                )
                                if not is_same_expired_without_ts and not self._is_session_expired(
                                    last_ts, now
                                ):
                                    self._user_sessions[user_id] = session_id_str
                                    self._session_last_activity[user_id] = (
                                        last_ts if last_ts is not None else now
                                    )
                                    logger.info(
                                        "Found active session %s for user %s",
                                        session_id_str,
                                        user_id,
                                    )
                                    return session_id_str
                                logger.info(
                                    "Latest session %s for user %s expired (> %ds); creating new session",
                                    session_id_str,
                                    user_id,
                                    self.session_ttl_seconds,
                                )
        except Exception as e:
            logger.debug("Failed to list sessions for user %s: %s", user_id, e)

        # Create new session
        return await self.create_session(user_id)

    async def create_session(self, user_id: str) -> str:
        """Create a new session in ADK."""
        headers = self._get_auth_headers()
        url = f"{self.base_url}/apps/{self.app_name}/users/{user_id}/sessions"
        now = time.time()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json={}, headers=headers)
                if res.status_code in (200, 201):
                    data = res.json()
                    session_id = str(data.get("id") or "")
                    if session_id:
                        self._user_sessions[user_id] = session_id
                        self._session_last_activity[user_id] = now
                        logger.info("Created new session %s for user %s", session_id, user_id)
                        return session_id
        except Exception as e:
            logger.error("Failed to create session for user %s: %s", user_id, e)

        # Fallback
        fallback_id = f"{self.user_prefix}{user_id}"
        self._user_sessions[user_id] = fallback_id
        self._session_last_activity[user_id] = now
        return fallback_id

    async def ensure_session(self, user_id: str, session_id: str) -> None:
        """Create session in ADK if it doesn't already exist."""
        await self.get_or_create_session(user_id)

    def build_multimodal_message(
        self,
        text: Optional[str] = None,
        media_bytes: Optional[bytes] = None,
        mime_type: Optional[str] = None,
    ) -> dict[str, Any]:
        """Build ADK types.Content compatible dictionary for multimodal input."""
        parts: List[dict[str, Any]] = []

        if text and text.strip():
            parts.append({"text": text.strip()})

        if media_bytes and mime_type:
            # Clean mime-type: e.g. "audio/ogg; codecs=opus" -> "audio/ogg"
            clean_mime = mime_type.split(";")[0].strip()
            # If WhatsApp sends voice as audio/ogg with opus, clean to audio/ogg
            b64_data = base64.b64encode(media_bytes).decode("utf-8")
            parts.append({
                "inline_data": {
                    "mime_type": clean_mime,
                    "data": b64_data,
                }
            })

        if not parts:
            parts.append({"text": "Hello"})

        return {
            "role": "user",
            "parts": parts,
        }

    def build_adk_user_id(
        self,
        phone_number: str,
        business_phone_number_id: Optional[str] = None,
    ) -> str:
        """Build an ADK user_id scoped by the business WhatsApp phone_number_id and customer phone.

        If the same customer chats with two different businesses on WhatsApp,
        each business has its own isolated session and conversation history.
        """
        biz_phone_id = (business_phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID or "").strip()
        if biz_phone_id:
            return f"{self.user_prefix}{biz_phone_id}_{phone_number}"
        return f"{self.user_prefix}{phone_number}"

    async def send_message(
        self,
        phone_number: str,
        text: Optional[str] = None,
        media_bytes: Optional[bytes] = None,
        mime_type: Optional[str] = None,
        business_phone_number_id: Optional[str] = None,
        business_display_phone: Optional[str] = None,
        business_id: Optional[str] = None,
        business_owner_id: Optional[str] = None,
        customer_name: Optional[str] = None,
    ) -> str:
        """Send multimodal message to the ADK Agent and return the response text."""
        resolved_wa_phone_id = (
            business_phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID or ""
        ).strip()
        normalized_display_phone = re.sub(r"\D+", "", business_display_phone or "")
        user_id = self.build_adk_user_id(phone_number, resolved_wa_phone_id)
        session_id = await self.get_or_create_session(user_id)

        new_message = self.build_multimodal_message(
            text=text,
            media_bytes=media_bytes,
            mime_type=mime_type,
        )

        state_delta: dict[str, Any] = {
            "business_id": business_id or settings.DEFAULT_BUSINESS_ID,
            "user_id": business_owner_id or settings.DEFAULT_USER_ID,
            "business_owner_id": business_owner_id or settings.DEFAULT_USER_ID,
        }
        if resolved_wa_phone_id:
            state_delta["whatsapp_phone_number_id"] = resolved_wa_phone_id
        if normalized_display_phone:
            state_delta["whatsapp_display_phone"] = normalized_display_phone
        if phone_number:
            state_delta["customer_phone"] = phone_number
        if customer_name and customer_name.strip():
            state_delta["customer_name"] = customer_name.strip()

        run_payload = {
            "app_name": self.app_name,
            "user_id": user_id,
            "session_id": session_id,
            "new_message": new_message,
            "state_delta": state_delta,
        }

        run_url = f"{self.base_url}/run"
        headers = self._get_auth_headers()

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(run_url, json=run_payload, headers=headers)

            # If session not found or expired (404), create fresh session and retry
            if response.status_code == 404:
                logger.info("Session %s not found on runner, recreating...", session_id)
                session_id = await self.create_session(user_id)
                run_payload["session_id"] = session_id
                response = await client.post(run_url, json=run_payload, headers=headers)

            if response.status_code >= 400:
                logger.error("ADK Agent error: %d %s", response.status_code, response.text)
                return "Disculpa, ha ocurrido un error al procesar tu solicitud con el asistente."

            self._session_last_activity[user_id] = time.time()
            events = response.json()
            return self._extract_response_text(events)

    def _extract_response_text(self, events: List[dict[str, Any]]) -> str:
        """Extract final text message from ADK returned events."""
        text_parts: List[str] = []

        for event in events:
            # Check content parts
            content = event.get("content") or {}
            parts = content.get("parts") or []
            for part in parts:
                # Exclude internal reasoning/thought parts
                if part.get("thought"):
                    continue
                text = part.get("text")
                if text:
                    text_parts.append(text)

        if not text_parts:
            # If no text was accumulated, check if there was any message attribute
            for event in reversed(events):
                msg = event.get("message")
                if msg and isinstance(msg, str):
                    return msg
            return "Listo."

        return "".join(text_parts).strip()
