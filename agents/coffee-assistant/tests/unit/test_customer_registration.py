import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app import callbacks as callbacks_module


class _FakeToolboxClient:
    def __init__(self, tool_callable, capture_calls):
        self._tool_callable = tool_callable
        self._capture_calls = capture_calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def load_tool(self, name: str):
        self._capture_calls.append(("load_tool", name))
        return self._tool_callable


@pytest.mark.asyncio
async def test_register_whatsapp_customer_upserts_once_and_populates_state(monkeypatch):
    calls = []

    async def fake_upsert(**kwargs):
        calls.append(("invoke", kwargs))
        return json.dumps(
            [
                {
                    "id": "cust-uuid-1",
                    "business_id": "biz-uuid-1",
                    "business_name": "Cafe Aroma",
                    "business_description": "Specialty coffee",
                    "business_instructions": "Always greet as Cafe Aroma",
                    "name": "Maria Lopez",
                    "phone": "+525512345678",
                    "favorite_drink": "Flat White",
                    "loyalty_points": 35,
                    "is_new": True,
                }
            ]
        )

    monkeypatch.setattr(
        callbacks_module,
        "ToolboxClient",
        lambda url: _FakeToolboxClient(fake_upsert, calls),
    )

    state = {
        "business_id": callbacks_module.DEFAULT_BUSINESS_ID,
        "whatsapp_phone_number_id": "998877",
        "whatsapp_display_phone": "523311112222",
        "customer_phone": "525512345678",
        "customer_name": "Maria Lopez",
    }
    ctx = SimpleNamespace(state=state)

    result = await callbacks_module.register_whatsapp_customer(ctx)
    assert result is None
    assert state["business_name"] == "Cafe Aroma"
    assert state["business_description"] == "Specialty coffee"
    assert state["business_instructions"] == "Always greet as Cafe Aroma"
    assert state["customer_id"] == "cust-uuid-1"
    assert state["customer_name"] == "Maria Lopez"
    assert state["customer_favorite_drink"] == "Flat White"
    assert state["customer_loyalty_points"] == 35
    assert state["whatsapp_customer_registered"] == "998877:525512345678"
    assert len([c for c in calls if c[0] == "invoke"]) == 1

    # Second call in same session should be a no-op
    await callbacks_module.register_whatsapp_customer(ctx)
    assert len([c for c in calls if c[0] == "invoke"]) == 1


@pytest.mark.asyncio
async def test_register_whatsapp_customer_skips_without_phone(monkeypatch):
    mock_client = AsyncMock()
    monkeypatch.setattr(callbacks_module, "ToolboxClient", mock_client)

    ctx = SimpleNamespace(state={"business_id": callbacks_module.DEFAULT_BUSINESS_ID})
    result = await callbacks_module.register_whatsapp_customer(ctx)
    assert result is None
    mock_client.assert_not_called()


@pytest.mark.asyncio
async def test_register_whatsapp_customer_handles_toolbox_error_gracefully(monkeypatch):
    def failing_client(url):
        raise RuntimeError("toolbox unavailable")

    monkeypatch.setattr(callbacks_module, "ToolboxClient", failing_client)

    state = {
        "business_id": callbacks_module.DEFAULT_BUSINESS_ID,
        "customer_phone": "525512345678",
        "customer_name": "Carlos",
    }
    ctx = SimpleNamespace(state=state)
    result = await callbacks_module.register_whatsapp_customer(ctx)
    assert result is None
    assert "whatsapp_customer_registered" not in state


def test_get_toolbox_auth_headers_local_vs_https(monkeypatch):
    assert callbacks_module.get_toolbox_auth_headers("http://127.0.0.1:5000") == {}

    called_args = []

    def fake_fetch_id_token(_request, audience, bind_id_token=None):
        called_args.append((audience, bind_id_token))
        return "fake-oidc-token"

    import google.oauth2.id_token as id_token_module

    monkeypatch.setattr(id_token_module, "fetch_id_token", fake_fetch_id_token)

    url = "https://coffee-assistant-toolbox-abc-ue.a.run.app"
    headers = callbacks_module.get_toolbox_auth_headers(url)
    assert "Authorization" in headers
    assert callable(headers["Authorization"])
    assert headers["Authorization"]() == "Bearer fake-oidc-token"
    assert called_args == [(url, False)]
