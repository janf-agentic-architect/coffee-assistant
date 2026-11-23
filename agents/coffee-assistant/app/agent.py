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

import os

from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.genai import types

from app.callbacks import bind_session_tenant, register_whatsapp_customer
from app.rate_limiter import UpstashRateLimitPlugin
from app.tools import (
    get_dietary_preferences,
    get_order_summary,
    place_order,
    set_dietary_preference,
    toolbox_tools,
)

load_dotenv()

MODEL = os.getenv("MODEL", "gemini-3.5-flash-lite")

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
