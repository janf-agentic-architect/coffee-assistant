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
import json
import logging
import os
import re
from typing import Any

from dotenv import load_dotenv
from google.adk.agents.callback_context import CallbackContext
from google.adk.tools import BaseTool, ToolContext
from google.genai import types
from toolbox_core import ToolboxClient

load_dotenv()

logger = logging.getLogger("coffee_assistant.callbacks")

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
