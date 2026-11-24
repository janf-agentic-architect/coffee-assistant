import base64
import os
import pytest
from fastapi.testclient import TestClient

# Configure environment before imports
os.environ["WHATSAPP_TOKEN"] = "test_token"
os.environ["WHATSAPP_PHONE_NUMBER_ID"] = "12345"
os.environ["WHATSAPP_VERIFY_TOKEN"] = "secret_verify_token"
os.environ["WHATSAPP_APP_SECRET"] = ""
os.environ["WHATSAPP_BUSINESS_ACCOUNT_ID"] = ""
os.environ["ADK_API_URL"] = "http://localhost:8000"
os.environ["ADK_APP_NAME"] = "chat_assistant"

from whatsapp.main import app
from whatsapp.adk_client import AdkAgentClient
from whatsapp.client import WhatsAppCloudApiClient, normalize_phone_number
from whatsapp.formatting import markdown_to_whatsapp


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["channel"] == "whatsapp"


def test_webhook_handshake_success(client):
    params = {
        "hub.mode": "subscribe",
        "hub.verify_token": "secret_verify_token",
        "hub.challenge": "123456789",
    }
    # Test both /webhook and /webhooks/whatsapp
    response = client.get("/webhook", params=params)
    assert response.status_code == 200
    assert response.text == "123456789"

    response_custom = client.get("/webhooks/whatsapp", params=params)
    assert response_custom.status_code == 200
    assert response_custom.text == "123456789"


def test_webhook_handshake_failure(client):
    params = {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong_token",
        "hub.challenge": "123456789",
    }
    response = client.get("/webhook", params=params)
    assert response.status_code == 403


def test_webhook_post_returns_immediate_200(client):
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "12345",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "123456",
                                "phone_number_id": "12345",
                            },
                            "contacts": [
                                {
                                    "wa_id": "1234567890",
                                    "profile": {"name": "Test User"},
                                }
                            ],
                            "messages": [
                                {
                                    "from": "1234567890",
                                    "id": "wamid.TEST1234",
                                    "timestamp": "1700000000",
                                    "type": "text",
                                    "text": {"body": "Hello ADK"},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_adk_client_build_multimodal_message():
    adk_client = AdkAgentClient("http://localhost:8000", "chat_assistant")

    # 1. Text only
    text_content = adk_client.build_multimodal_message(text="Hello")
    assert text_content["role"] == "user"
    assert len(text_content["parts"]) == 1
    assert text_content["parts"][0] == {"text": "Hello"}

    # 2. Text + Image
    fake_img = b"fake_png_data"
    img_content = adk_client.build_multimodal_message(
        text="Look at this",
        media_bytes=fake_img,
        mime_type="image/jpeg",
    )
    assert len(img_content["parts"]) == 2
    assert {"text": "Look at this"} in img_content["parts"]
    assert {
        "inline_data": {
            "mime_type": "image/jpeg",
            "data": base64.b64encode(fake_img).decode("utf-8"),
        }
    } in img_content["parts"]

    # 3. Audio with codec stripping
    fake_audio = b"fake_audio_data"
    audio_content = adk_client.build_multimodal_message(
        media_bytes=fake_audio,
        mime_type="audio/ogg; codecs=opus",
    )
    assert len(audio_content["parts"]) == 1
    assert audio_content["parts"][0]["inline_data"]["mime_type"] == "audio/ogg"


@pytest.mark.anyio
async def test_service_multimodal_image_flow(monkeypatch):
    from unittest.mock import AsyncMock
    from whatsapp.service import WhatsAppService
    from whatsapp.client import WhatsAppCloudApiClient
    from whatsapp.models import IncomingMessage, MediaItem

    mock_wa = AsyncMock(spec=WhatsAppCloudApiClient)
    mock_wa.download_media.return_value = (b"fake_image_bytes", "image/png")
    mock_wa.mark_as_read.return_value = True
    mock_wa.send_text_message.return_value = {"messages": [{"id": "res_123"}]}

    mock_adk = AsyncMock(spec=AdkAgentClient)
    mock_adk.send_message.return_value = "I see a picture of a cat."

    service = WhatsAppService(mock_wa, mock_adk)

    msg = IncomingMessage(
        from_="5215512345678",
        id="wamid.IMG999",
        timestamp="1700000000",
        type="image",
        image=MediaItem(id="meta_media_id_123", caption="What is in here?"),
    )

    await service.process_incoming_message(msg)

    # Verify flow
    mock_wa.mark_as_read.assert_awaited_once_with("wamid.IMG999")
    mock_wa.download_media.assert_awaited_once_with("meta_media_id_123")
    mock_adk.send_message.assert_awaited_once_with(
        phone_number="525512345678",
        text="What is in here?",
        media_bytes=b"fake_image_bytes",
        mime_type="image/png",
    )
    mock_wa.send_text_message.assert_awaited_once_with(
        to="525512345678",
        text="I see a picture of a cat.",
    )


def test_normalize_phone_number_mexico_guadalajara():
    # Guadalajara (33) with extra '1' between 52 and 33
    assert normalize_phone_number("5213312345678") == "523312345678"
    assert normalize_phone_number("+52 1 33 1234 5678") == "523312345678"
    # Already normalized
    assert normalize_phone_number("523312345678") == "523312345678"
    # Other Mexican states (e.g. CDMX 55)
    assert normalize_phone_number("5215512345678") == "525512345678"


def test_whatsapp_client_api_version_v25():
    client_v25 = WhatsAppCloudApiClient(api_version="v25")
    assert client_v25.api_version == "v25.0"
    assert client_v25.base_url == "https://graph.facebook.com/v25.0"

    client_25_raw = WhatsAppCloudApiClient(api_version="25")
    assert client_25_raw.api_version == "v25.0"
    assert client_25_raw.base_url == "https://graph.facebook.com/v25.0"


def test_adk_client_auth_headers_local():
    adk = AdkAgentClient(base_url="http://localhost:8000")
    assert adk._get_auth_headers() == {}


def test_adk_client_auth_headers_remote_with_mock(monkeypatch):
    class MockCredentials:
        valid = True
        token = "test_gcp_bearer_token"

        def refresh(self, request):
            pass

    import google.auth
    monkeypatch.setattr(google.auth, "default", lambda scopes: (MockCredentials(), "test-project"))

    adk = AdkAgentClient(base_url="https://us-east1-aiplatform.googleapis.com/reasoningEngines/v1/projects/123/locations/us-east1/reasoningEngines/456/api")
    headers = adk._get_auth_headers()
    assert headers.get("Authorization") == "Bearer test_gcp_bearer_token"


@pytest.mark.anyio
async def test_whatsapp_client_auto_discovers_phone_number_id(monkeypatch):
    import httpx

    class MockResponse:
        def __init__(self, status_code: int, json_data: dict):
            self.status_code = status_code
            self._json = json_data

        def json(self):
            return self._json

    async def mock_get(self, url, params=None, headers=None):
        if url.endswith("/debug_token"):
            return MockResponse(
                200,
                {
                    "data": {
                        "app_id": "99887766",
                        "granular_scopes": [
                            {
                                "scope": "whatsapp_business_messaging",
                                "target_ids": ["waba_112233"],
                            }
                        ],
                    }
                },
            )
        if url.endswith("/waba_112233/phone_numbers"):
            return MockResponse(
                200,
                {
                    "data": [
                        {
                            "id": "phone_id_445566",
                            "display_phone_number": "+52 33 1234 5678",
                        }
                    ]
                },
            )
        return MockResponse(404, {})

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)

    wa_client = WhatsAppCloudApiClient(token="test_token", phone_number_id="auto")
    resolved_id = await wa_client.ensure_phone_number_id()
    assert resolved_id == "phone_id_445566"
    assert wa_client.phone_number_id == "phone_id_445566"


def test_markdown_to_whatsapp_formatting():
    md = (
        "### Today's Menu\n\n"
        "* **Latte** - $5.00 (*with steamed milk*)\n"
        "* __Cold Brew__ - ~~$4.50~~ $4.00\n"
        "Visit [our website](https://cafe.example.com) and use `CAFE10`.\n\n"
        "```python\n"
        "print('**do not touch**')\n"
        "```"
    )
    expected = (
        "*Today's Menu*\n\n"
        "- *Latte* - $5.00 (_with steamed milk_)\n"
        "- *Cold Brew* - ~$4.50~ $4.00\n"
        "Visit our website (https://cafe.example.com) and use `CAFE10`.\n\n"
        "```\n"
        "print('**do not touch**')\n"
        "```"
    )
    assert markdown_to_whatsapp(md) == expected


def test_markdown_to_whatsapp_table():
    md = (
        "| Drink | Price |\n"
        "| --- | --- |\n"
        "| **Espresso** | $3.50 |\n"
        "| **Latte** | $5.00 |"
    )
    assert markdown_to_whatsapp(md) == "- *Espresso*: $3.50\n- *Latte*: $5.00"


@pytest.mark.anyio
async def test_send_text_message_formats_markdown_for_whatsapp(monkeypatch):
    import httpx

    captured = {}

    class MockResponse:
        status_code = 200

        def json(self):
            return {"messages": [{"id": "wamid.out1"}]}

    async def mock_post(self, url, json=None, headers=None):
        captured["url"] = url
        captured["json"] = json
        return MockResponse()

    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    wa_client = WhatsAppCloudApiClient(token="test_token", phone_number_id="12345")
    await wa_client.send_text_message("5213312345678", "### Total\n* **Latte**: $5.00")

    assert captured["json"]["to"] == "523312345678"
    assert captured["json"]["text"]["body"] == "*Total*\n- *Latte*: $5.00"


def test_webhook_passes_contact_profile_name_to_service(client, monkeypatch):
    from unittest.mock import AsyncMock
    from whatsapp import router as wa_router

    mock_process = AsyncMock()
    monkeypatch.setattr(wa_router.service, "process_incoming_message", mock_process)

    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "12345",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "523311112222",
                                "phone_number_id": "998877",
                            },
                            "contacts": [
                                {
                                    "wa_id": "5215512345678",
                                    "profile": {"name": "Maria Lopez"},
                                }
                            ],
                            "messages": [
                                {
                                    "from": "5215512345678",
                                    "id": "wamid.CONTACT_TEST",
                                    "timestamp": "1700000001",
                                    "type": "text",
                                    "text": {"body": "Hello!"},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    mock_process.assert_awaited_once()
    call_args = mock_process.await_args.args
    assert call_args[1] == "998877"
    assert call_args[2] == "523311112222"
    assert call_args[3] == "Maria Lopez"


@pytest.mark.anyio
async def test_adk_client_sends_customer_phone_and_name_in_state_delta(monkeypatch):
    import httpx

    captured_payloads = []

    class MockResponse:
        def __init__(self, status_code: int, json_data):
            self.status_code = status_code
            self._json = json_data
            self.text = ""

        def json(self):
            return self._json

    async def mock_get(self, url, headers=None):
        return MockResponse(200, [{"id": "sess_1"}])

    async def mock_post(self, url, json=None, headers=None):
        captured_payloads.append(json)
        return MockResponse(200, [{"content": {"parts": [{"text": "Hello Maria!"}]}}])

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adk = AdkAgentClient(base_url="http://localhost:8000", app_name="app")
    reply = await adk.send_message(
        phone_number="525512345678",
        text="Hello",
        business_phone_number_id="998877",
        business_display_phone="+52 33 1111 2222",
        customer_name="Maria Lopez",
    )

    assert reply == "Hello Maria!"
    assert len(captured_payloads) == 1
    state_delta = captured_payloads[0]["state_delta"]
    assert state_delta["customer_phone"] == "525512345678"
    assert state_delta["customer_name"] == "Maria Lopez"
    assert state_delta["whatsapp_phone_number_id"] == "998877"
    assert state_delta["whatsapp_display_phone"] == "523311112222"


@pytest.mark.anyio
async def test_adk_client_creates_new_session_when_backend_session_expired(monkeypatch):
    import time
    import httpx

    created_sessions = []
    now = time.time()
    expired_ts = now - (25 * 3600)  # 25 hours ago

    class MockResponse:
        def __init__(self, status_code: int, json_data):
            self.status_code = status_code
            self._json = json_data

        def json(self):
            return self._json

    async def mock_get(self, url, headers=None):
        return MockResponse(
            200,
            [{"id": "sess_old", "lastUpdateTime": expired_ts}],
        )

    async def mock_post(self, url, json=None, headers=None):
        created_sessions.append(url)
        return MockResponse(201, {"id": "sess_fresh"})

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adk = AdkAgentClient(
        base_url="http://localhost:8000",
        app_name="app",
        session_ttl_seconds=86400,
    )
    session_id = await adk.get_or_create_session("wa_525512345678")

    assert session_id == "sess_fresh"
    assert len(created_sessions) == 1


@pytest.mark.anyio
async def test_adk_client_reuses_most_recent_active_session(monkeypatch):
    import time
    import httpx

    now = time.time()

    class MockResponse:
        def __init__(self, status_code: int, json_data):
            self.status_code = status_code
            self._json = json_data

        def json(self):
            return self._json

    async def mock_get(self, url, headers=None):
        return MockResponse(
            200,
            [
                {"id": "sess_recent", "lastUpdateTime": now - 3600},  # 1h ago
                {"id": "sess_older", "lastUpdateTime": now - 90000},  # 25h ago
            ],
        )

    async def mock_post(self, url, json=None, headers=None):
        raise AssertionError("Should not create a new session when an active one exists")

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adk = AdkAgentClient(
        base_url="http://localhost:8000",
        app_name="app",
        session_ttl_seconds=86400,
    )
    session_id = await adk.get_or_create_session("wa_525512345678")

    assert session_id == "sess_recent"


@pytest.mark.anyio
async def test_adk_client_rotates_cached_session_after_24h_inactivity(monkeypatch):
    import time
    import httpx

    now = time.time()
    old_ts = now - (24 * 3600 + 60)  # 24h + 1m ago
    post_urls = []

    class MockResponse:
        def __init__(self, status_code: int, json_data):
            self.status_code = status_code
            self._json = json_data

        def json(self):
            return self._json

    async def mock_get(self, url, headers=None):
        return MockResponse(
            200,
            [{"id": "sess_cached", "lastUpdateTime": old_ts}],
        )

    async def mock_post(self, url, json=None, headers=None):
        post_urls.append(url)
        return MockResponse(201, {"id": "sess_new_after_24h"})

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adk = AdkAgentClient(
        base_url="http://localhost:8000",
        app_name="app",
        session_ttl_seconds=86400,
    )
    # Seed cache as if user last sent a message > 24h ago
    adk._user_sessions["wa_525512345678"] = "sess_cached"
    adk._session_last_activity["wa_525512345678"] = old_ts

    session_id = await adk.get_or_create_session("wa_525512345678")

    assert session_id == "sess_new_after_24h"
    assert adk._user_sessions["wa_525512345678"] == "sess_new_after_24h"
    assert len(post_urls) == 1


@pytest.mark.anyio
async def test_adk_client_ttl_disabled_when_zero(monkeypatch):
    import time
    import httpx

    old_ts = time.time() - (72 * 3600)  # 3 days ago

    class MockResponse:
        def __init__(self, status_code: int, json_data):
            self.status_code = status_code
            self._json = json_data

        def json(self):
            return self._json

    async def mock_get(self, url, headers=None):
        return MockResponse(
            200,
            [{"id": "sess_forever", "lastUpdateTime": old_ts}],
        )

    async def mock_post(self, url, json=None, headers=None):
        raise AssertionError("Should not create a new session when TTL is 0")

    monkeypatch.setattr(httpx.AsyncClient, "get", mock_get)
    monkeypatch.setattr(httpx.AsyncClient, "post", mock_post)

    adk = AdkAgentClient(
        base_url="http://localhost:8000",
        app_name="app",
        session_ttl_seconds=0,
    )
    session_id = await adk.get_or_create_session("wa_525512345678")

    assert session_id == "sess_forever"





