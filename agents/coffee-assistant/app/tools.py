# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json
import logging
from typing import Any

from google.adk.tools import ToolContext
from google.adk.tools.toolbox_toolset import ToolboxToolset
from toolbox_core import ToolboxClient

from app.callbacks import (
    TOOLBOX_URL,
    _resolve_tenant_context,
    current_business_id,
    current_whatsapp_display_phone,
    get_toolbox_auth_headers,
    parse_toolbox_single_row,
)

logger = logging.getLogger("coffee_assistant.tools")

toolbox_tools = ToolboxToolset(
    server_url=TOOLBOX_URL,
    toolset_name="coffee-toolset",
    bound_params={
        "business_id": lambda: current_business_id.get(),
        "whatsapp_display_phone": lambda: current_whatsapp_display_phone.get(),
    },
    additional_headers=get_toolbox_auth_headers(TOOLBOX_URL) or None,
)


def _normalize_order_items(items: list[Any]) -> list[dict[str, Any]]:
    """Normalize LLM-provided order items into dicts expected by create-order."""
    normalized: list[dict[str, Any]] = []
    for raw_item in items:
        if isinstance(raw_item, str):
            name = raw_item.strip()
            if name:
                normalized.append({"product_name": name, "quantity": 1, "notes": ""})
        elif isinstance(raw_item, dict):
            product_id = str(raw_item.get("product_id") or "").strip()
            product_name = str(
                raw_item.get("product_name") or raw_item.get("name") or ""
            ).strip()
            if not product_id and not product_name:
                continue
            try:
                quantity = max(int(raw_item.get("quantity", 1)), 1)
            except (TypeError, ValueError):
                quantity = 1
            item_notes = str(raw_item.get("notes") or "").strip()
            normalized.append(
                {
                    "product_id": product_id,
                    "product_name": product_name,
                    "quantity": quantity,
                    "notes": item_notes,
                }
            )
    return normalized


async def place_order(
    tool_context: ToolContext,
    items: list[dict[str, Any]],
    customer_name: str = "",
    notes: str = "",
) -> dict[str, Any]:
    """Places an order in the database for the current business via MCP Toolbox.

    Use this tool when the customer confirms they want to order menu items.
    Always call `get-products-by-business` first to know exact product names/IDs.

    Args:
        tool_context: Provided automatically by ADK.
        items: A list of items to order. Each item should be a dict with
            `product_name` (str, or `product_id` UUID), optional `quantity` (int,
            defaults to 1), and optional `notes` (str, e.g. "oat milk, no sugar").
        customer_name: Customer's name (optional if already known in the session).
        notes: Optional order-level notes.
    """
    normalized_items = _normalize_order_items(items)
    if not normalized_items:
        return {"error": "No valid items were provided for the order."}

    effective_business_key, _, _, wa_display_phone = _resolve_tenant_context(
        tool_context.state
    )
    resolved_customer_id = str(tool_context.state.get("customer_id") or "").strip()
    resolved_customer_name = (
        customer_name.strip()
        or str(tool_context.state.get("customer_name") or "").strip()
        or "Cliente"
    )

    try:
        client_headers = get_toolbox_auth_headers(TOOLBOX_URL)
        client_kwargs = {"client_headers": client_headers} if client_headers else {}
        async with ToolboxClient(TOOLBOX_URL, **client_kwargs) as client:
            create_order_tool = await client.load_tool("create-order")
            raw_result = await create_order_tool(
                business_id=effective_business_key,
                whatsapp_display_phone=wa_display_phone,
                customer_id=resolved_customer_id,
                customer_name=resolved_customer_name,
                items_json=json.dumps(normalized_items),
                order_notes=notes.strip(),
            )
    except Exception as exc:
        logger.warning("Failed to place order via MCP Toolbox: %s", exc)
        return {
            "error": "Could not place the order right now due to a database error. Please try again."
        }

    order = parse_toolbox_single_row(raw_result)
    if not order:
        requested_labels = [
            item.get("product_name") or item.get("product_id")
            for item in normalized_items
        ]
        return {
            "error": (
                f"None of these items were found or available on the menu: {requested_labels}. "
                "Please check the menu with get-products-by-business."
            )
        }

    # Normalize nested JSON items if returned as a JSON string
    if isinstance(order.get("items"), str):
        try:
            order["items"] = json.loads(order["items"])
        except json.JSONDecodeError:
            order["items"] = []

    matched_items = order.get("items") if isinstance(order.get("items"), list) else []
    matched_names = {
        str(item.get("product_name", "")).lower() for item in matched_items
    }
    matched_ids = {str(item.get("product_id", "")) for item in matched_items}
    missing_items = [
        item.get("product_name") or item.get("product_id")
        for item in normalized_items
        if (
            not (
                item.get("product_id")
                and str(item["product_id"]) in matched_ids
            )
            and not (
                item.get("product_name")
                and str(item["product_name"]).lower() in matched_names
            )
        )
    ]

    tool_context.state["current_order"] = order
    if order.get("business_name"):
        tool_context.state["business_name"] = str(order["business_name"])

    result: dict[str, Any] = {"order": order}
    if missing_items:
        result["warning"] = (
            f"These items were not found or are unavailable: {missing_items}"
        )
    return result


def get_order_summary(tool_context: ToolContext) -> dict:
    """Returns the current order summary for this session.

    Use this tool when the customer asks about their current order,
    wants to review what they ordered, or asks for the total.

    Args:
        tool_context: Provided automatically by ADK.
    """
    order = tool_context.state.get("current_order")
    if order:
        return {"order": order}
    return {"message": "No order has been placed yet in this session."}


def set_dietary_preference(tool_context: ToolContext, preference: str) -> dict:
    """Saves a dietary preference that persists across all conversations.

    Use this tool when the customer mentions a dietary restriction or
    preference (e.g., "I'm vegan", "I'm lactose intolerant",
    "I have a nut allergy").

    Args:
        tool_context: Provided automatically by ADK.
        preference: The dietary preference to save (e.g., "vegan",
            "lactose intolerant", "nut allergy").
    """
    raw_existing = tool_context.state.get("user:dietary_preferences", [])
    existing = list(raw_existing) if isinstance(raw_existing, list) else []

    preference_lower = preference.lower().strip()
    if preference_lower not in existing:
        existing.append(preference_lower)

    tool_context.state["user:dietary_preferences"] = existing
    return {
        "saved": preference_lower,
        "all_preferences": existing,
    }


def get_dietary_preferences(tool_context: ToolContext) -> dict:
    """Retrieves the customer's saved dietary preferences.

    Use this tool when you need to check the customer's dietary
    restrictions before making recommendations.

    Args:
        tool_context: Provided automatically by ADK.
    """
    preferences = tool_context.state.get("user:dietary_preferences", [])
    if preferences:
        return {"preferences": preferences}
    return {"message": "No dietary preferences saved yet."}
