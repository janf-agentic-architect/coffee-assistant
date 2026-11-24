import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app import tools as tools_module


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
async def test_place_order_creates_order_via_toolbox_and_updates_state(monkeypatch):
    calls = []

    async def fake_create_order(**kwargs):
        calls.append(("invoke", kwargs))
        return json.dumps(
            [
                {
                    "order_id": "ord-uuid-1",
                    "business_id": "biz-uuid-1",
                    "business_name": "Café Aroma",
                    "customer_id": "cust-uuid-1",
                    "customer_name": "María López",
                    "status": "pending",
                    "total_amount": "11.00",
                    "notes": "Para llevar",
                    "created_at": "2026-11-24T18:00:00Z",
                    "items": [
                        {
                            "product_id": "prod-1",
                            "product_name": "Oat Milk Latte",
                            "quantity": 2,
                            "unit_price": "5.50",
                            "notes": "sin azúcar",
                        }
                    ],
                }
            ]
        )

    monkeypatch.setattr(
        tools_module,
        "ToolboxClient",
        lambda url, **kwargs: _FakeToolboxClient(fake_create_order, calls),
    )

    state = {
        "business_id": "biz-uuid-1",
        "whatsapp_display_phone": "523311112222",
        "customer_id": "cust-uuid-1",
        "customer_name": "María López",
    }
    ctx = SimpleNamespace(state=state)

    result = await tools_module.place_order(
        ctx,
        items=[
            {"product_name": "Oat Milk Latte", "quantity": 2, "notes": "sin azúcar"}
        ],
        notes="Para llevar",
    )

    assert "error" not in result
    assert "warning" not in result
    assert result["order"]["order_id"] == "ord-uuid-1"
    assert result["order"]["business_name"] == "Café Aroma"
    assert result["order"]["total_amount"] == "11.00"
    assert state["current_order"] == result["order"]
    assert state["business_name"] == "Café Aroma"

    assert calls[0] == ("load_tool", "create-order")
    invoke_kwargs = calls[1][1]
    assert invoke_kwargs["business_id"] == "biz-uuid-1"
    assert invoke_kwargs["whatsapp_display_phone"] == "523311112222"
    assert invoke_kwargs["customer_id"] == "cust-uuid-1"
    assert invoke_kwargs["customer_name"] == "María López"
    assert invoke_kwargs["order_notes"] == "Para llevar"
    assert json.loads(invoke_kwargs["items_json"]) == [
        {
            "product_id": "",
            "product_name": "Oat Milk Latte",
            "quantity": 2,
            "notes": "sin azúcar",
        }
    ]


@pytest.mark.asyncio
async def test_place_order_reports_warning_for_missing_items(monkeypatch):
    calls = []

    async def fake_create_order(**kwargs):
        calls.append(("invoke", kwargs))
        return json.dumps(
            [
                {
                    "order_id": "ord-uuid-2",
                    "status": "pending",
                    "customer_name": "Cliente",
                    "total_amount": "3.50",
                    "items": [
                        {
                            "product_id": "prod-1",
                            "product_name": "Espresso",
                            "quantity": 1,
                            "unit_price": "3.50",
                            "notes": None,
                        }
                    ],
                }
            ]
        )

    monkeypatch.setattr(
        tools_module,
        "ToolboxClient",
        lambda url, **kwargs: _FakeToolboxClient(fake_create_order, calls),
    )

    ctx = SimpleNamespace(state={})
    result = await tools_module.place_order(ctx, items=["Espresso", "Unicorn Frappe"])

    assert result["order"]["order_id"] == "ord-uuid-2"
    assert "Unicorn Frappe" in result["warning"]


@pytest.mark.asyncio
async def test_place_order_returns_error_when_no_items_match(monkeypatch):
    calls = []

    async def fake_create_order(**kwargs):
        calls.append(("invoke", kwargs))
        return "[]"

    monkeypatch.setattr(
        tools_module,
        "ToolboxClient",
        lambda url, **kwargs: _FakeToolboxClient(fake_create_order, calls),
    )

    state = {}
    ctx = SimpleNamespace(state=state)
    result = await tools_module.place_order(
        ctx, items=[{"product_name": "Nonexistent Drink"}]
    )

    assert "error" in result
    assert "current_order" not in state


@pytest.mark.asyncio
async def test_place_order_rejects_empty_items_without_calling_toolbox(monkeypatch):
    mock_client = AsyncMock()
    monkeypatch.setattr(tools_module, "ToolboxClient", mock_client)

    ctx = SimpleNamespace(state={})
    result = await tools_module.place_order(ctx, items=[])

    assert "error" in result
    mock_client.assert_not_called()


@pytest.mark.asyncio
async def test_place_order_handles_toolbox_error_gracefully(monkeypatch):
    def failing_client(url, **kwargs):
        raise RuntimeError("toolbox unavailable")

    monkeypatch.setattr(tools_module, "ToolboxClient", failing_client)

    ctx = SimpleNamespace(state={})
    result = await tools_module.place_order(ctx, items=[{"product_name": "Latte"}])

    assert "error" in result
    assert "current_order" not in ctx.state
