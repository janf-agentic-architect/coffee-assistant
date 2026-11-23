# ruff: noqa
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

from contextvars import ContextVar
import datetime
import json
import logging
import os
import re
from typing import Any
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.apps import App
from google.adk.models import Gemini
from google.genai import types
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.toolbox_toolset import ToolboxToolset
from toolbox_core import ToolboxClient


from app.rate_limiter import UpstashRateLimitPlugin

load_dotenv()

logger = logging.getLogger("coffee_assistant.agent")

MODEL = os.getenv("MODEL", "gemini-3.5-flash-lite")
TOOLBOX_URL = os.getenv("TOOLBOX_URL", "http://127.0.0.1:5000")
DEFAULT_BUSINESS_ID = os.getenv(
    "DEFAULT_BUSINESS_ID", "00000000-0000-0000-0000-000000000001"
)
DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "usr_demo_business")

# ContextVars populated from session state (tool_context.state) before tool execution
current_business_id: ContextVar[str] = ContextVar(
    "current_business_id", default=DEFAULT_BUSINESS_ID
)
current_user_id: ContextVar[str] = ContextVar(
    "current_user_id", default=DEFAULT_USER_ID
)
current_whatsapp_phone_number_id: ContextVar[str] = ContextVar(
    "current_whatsapp_phone_number_id", default=""
)
current_whatsapp_display_phone: ContextVar[str] = ContextVar(
    "current_whatsapp_display_phone", default=""
)


def _resolve_tenant_context(state: Any) -> tuple[str, str, str, str]:
    """Resolve (effective_business_key, user_id, wa_phone_id, wa_display_phone) from ADK state."""
    wa_phone_id = (state.get("whatsapp_phone_number_id") or "").strip()
    wa_display_phone = re.sub(
        r"\D+", "", str(state.get("whatsapp_display_phone") or "")
    )
    business_id = state.get("business_id") or DEFAULT_BUSINESS_ID
    user_id = (
        state.get("user_id")
        or state.get("business_owner_id")
        or DEFAULT_USER_ID
    )
    # If the message arrived from a specific WhatsApp business phone number, pass it unless an explicit non-default business_id was set
    effective_business_key = (
        wa_phone_id
        if (wa_phone_id and str(business_id) == DEFAULT_BUSINESS_ID)
        else str(business_id)
    )
    return effective_business_key, str(user_id), wa_phone_id, wa_display_phone


def _parse_toolbox_customer_row(raw_result: Any) -> dict[str, Any] | None:
    """Normalize MCP Toolbox SQL result (JSON string, list, or dict) into a single customer dict."""
    data = raw_result
    if isinstance(data, str):
        text = data.strip()
        if not text:
            return None
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return None
    if isinstance(data, list):
        return data[0] if data and isinstance(data[0], dict) else None
    if isinstance(data, dict):
        return data
    return None


async def register_whatsapp_customer(
    callback_context: CallbackContext,
) -> types.Content | None:
    """Automatically register or load a WhatsApp customer in Postgres once per session."""
    state = callback_context.state
    customer_phone = str(state.get("customer_phone") or "").strip()
    if not customer_phone:
        return None

    effective_business_key, _, _, wa_display_phone = _resolve_tenant_context(state)
    registered_key = f"{effective_business_key}:{customer_phone}"
    if state.get("whatsapp_customer_registered") == registered_key:
        return None

    customer_name = str(state.get("customer_name") or "").strip()
    try:
        async with ToolboxClient(TOOLBOX_URL) as client:
            upsert_tool = await client.load_tool("upsert-whatsapp-customer")
            raw_result = await upsert_tool(
                business_id=effective_business_key,
                whatsapp_display_phone=wa_display_phone,
                customer_phone=customer_phone,
                customer_name=customer_name,
            )

        customer = _parse_toolbox_customer_row(raw_result)
        if customer:
            state["whatsapp_customer_registered"] = registered_key
            if customer.get("id"):
                state["customer_id"] = str(customer["id"])
            if customer.get("name"):
                state["customer_name"] = str(customer["name"])
            if customer.get("favorite_drink"):
                state["customer_favorite_drink"] = str(customer["favorite_drink"])
            if customer.get("loyalty_points") is not None:
                state["customer_loyalty_points"] = int(customer["loyalty_points"])
            logger.info(
                "WhatsApp customer %s for business %s (is_new=%s)",
                customer.get("phone") or customer_phone,
                customer.get("business_id") or effective_business_key,
                customer.get("is_new"),
            )
    except Exception as exc:
        logger.warning(
            "Could not auto-register WhatsApp customer %s: %s",
            customer_phone,
            exc,
        )
    return None


def bind_session_tenant(
    tool: BaseTool, args: dict[str, Any], tool_context: ToolContext
) -> dict[str, Any] | None:
    """Binds business_id, whatsapp_phone_number_id, and whatsapp_display_phone from ADK session state into ContextVars."""
    effective_business_key, user_id, wa_phone_id, wa_display_phone = (
        _resolve_tenant_context(tool_context.state)
    )
    current_business_id.set(effective_business_key)
    current_user_id.set(user_id)
    current_whatsapp_phone_number_id.set(wa_phone_id)
    current_whatsapp_display_phone.set(wa_display_phone)
    return None


toolbox_tools = ToolboxToolset(
    server_url=TOOLBOX_URL,
    toolset_name="coffee-toolset",
    bound_params={
        "business_id": lambda: current_business_id.get(),
        "whatsapp_display_phone": lambda: current_whatsapp_display_phone.get(),
    },
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


root_agent = Agent(
    # Keep in sync with create_params.root_agent_name in agents-cli-manifest.yaml:
    # telemetry reports this name as gen_ai.agent.name, and agents-cli reports the
    # manifest's value. Renaming the agent only here makes the two disagree, and
    # anything selecting traces by name stops finding this agent's.
    name="coffee_assistant",
    model=Gemini(
        model=MODEL,
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=(
        """You are a friendly and knowledgeable assistant for the business "{business_name?}".
            If no business name is specified above, represent "The Cloud Cafe".

            Business description (if provided):
            {business_description?}

            Custom business instructions (follow these closely when provided):
            {business_instructions?}

            Your job:
            - Help customers browse the business menu using the available database tools and answer questions about items.
            - Take orders and confirm items and totals with the customer.
            - Remember and respect dietary preferences.

            Customer profile (if available):
            - Name: {customer_name?}
            - Favorite drink: {customer_favorite_drink?}
            - Loyalty points: {customer_loyalty_points?}
            The customer's saved dietary preferences are: {user:dietary_preferences?}

            IMPORTANT RULES:
            - ALWAYS call the `get-products-by-business` tool EVERY TIME the customer asks for the menu, available products, prices, or recommendations — NEVER rely on products mentioned earlier in the conversation history, because the catalog and active business can change at any time.
            - Use the `business_name` returned by `get-products-by-business` (or `{business_name?}` if set) as the business name. Never call the business "The Cloud Cafe" if `get-products-by-business` returns a different `business_name`.
            - When a customer mentions a dietary restriction, ALWAYS save it using the
            set_dietary_preference tool before doing anything else.
            - Before recommending items, check the customer's dietary preferences. If they
            have preferences saved, only recommend items compatible with those
            restrictions.
            - When placing an order, confirm the items and total with the customer.

            Be conversational, warm, and concise.
            """
    ),
    tools=[
        toolbox_tools,
        place_order,
        get_order_summary,
        set_dietary_preference,
        get_dietary_preferences,
    ],
    before_agent_callback=register_whatsapp_customer,
    before_tool_callback=bind_session_tenant,
)

RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").strip().lower() not in (
    "false",
    "0",
    "no",
    "off",
)

rate_limiter = UpstashRateLimitPlugin(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "50")),
    window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "86400")),
    enabled=RATE_LIMIT_ENABLED,
)

app = App(
    root_agent=root_agent,
    name="app",
    plugins=[rate_limiter],
)
