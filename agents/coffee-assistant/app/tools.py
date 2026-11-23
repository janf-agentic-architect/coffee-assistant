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

from google.adk.tools import ToolContext
from google.adk.tools.toolbox_toolset import ToolboxToolset

from app.callbacks import (
    TOOLBOX_URL,
    current_business_id,
    current_whatsapp_display_phone,
    get_toolbox_auth_headers,
)

toolbox_tools = ToolboxToolset(
    server_url=TOOLBOX_URL,
    toolset_name="coffee-toolset",
    bound_params={
        "business_id": lambda: current_business_id.get(),
        "whatsapp_display_phone": lambda: current_whatsapp_display_phone.get(),
    },
    additional_headers=get_toolbox_auth_headers(TOOLBOX_URL) or None,
)

CAFE_MENU = {
    "espresso": {
        "price": 3.50,
        "description": "Rich and bold single shot",
        "tags": ["vegan", "dairy-free", "gluten-free"],
    },
    "latte": {
        "price": 5.00,
        "description": "Espresso with steamed milk",
        "tags": ["gluten-free"],
    },
    "oat milk latte": {
        "price": 5.50,
        "description": "Espresso with steamed oat milk",
        "tags": ["vegan", "dairy-free", "gluten-free"],
    },
    "cappuccino": {
        "price": 4.50,
        "description": "Espresso with equal parts steamed milk and foam",
        "tags": ["gluten-free"],
    },
    "cold brew": {
        "price": 4.00,
        "description": "Slow-steeped for 12 hours, served over ice",
        "tags": ["vegan", "dairy-free", "gluten-free"],
    },
    "matcha latte": {
        "price": 5.50,
        "description": "Ceremonial grade matcha with steamed milk",
        "tags": ["gluten-free"],
    },
    "croissant": {
        "price": 3.00,
        "description": "Buttery, flaky French pastry",
        "tags": [],
    },
    "banana bread": {
        "price": 3.50,
        "description": "Homemade with walnuts",
        "tags": ["vegan"],
    },
}


def get_menu() -> dict:
    """Returns the full cafe menu with prices, descriptions, and dietary tags.

    Use this tool when the customer asks what's available, wants to see
    the menu, or asks about specific items.
    """
    return CAFE_MENU


def place_order(tool_context: ToolContext, items: list[str]) -> dict:
    """Places an order for the specified menu items.

    Use this tool when the customer confirms they want to order something.

    Args:
        tool_context: Provided automatically by ADK.
        items: A list of menu item names the customer wants to order.
    """
    valid_items = []
    invalid_items = []
    total = 0.0

    for item in items:
        item_lower = item.lower()
        if item_lower in CAFE_MENU:
            valid_items.append(item_lower)
            total += CAFE_MENU[item_lower]["price"]
        else:
            invalid_items.append(item)

    if not valid_items:
        return {"error": f"None of these items are on our menu: {invalid_items}"}

    order = {"items": valid_items, "total": round(total, 2)}
    tool_context.state["current_order"] = order

    result = {"order": order}
    if invalid_items:
        result["warning"] = f"These items are not on our menu: {invalid_items}"
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
