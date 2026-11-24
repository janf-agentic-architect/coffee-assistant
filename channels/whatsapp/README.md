# WhatsApp Cloud API Channel (Multimodal) for Google ADK

This microservice connects **WhatsApp Cloud API (Meta)** with the conversational assistant built on **Google Agent Development Kit (ADK)**, enabling users to interact over WhatsApp using:

- 💬 **Text**: Standard chat conversation.
- 🖼️ **Images**: Photos and screenshots with Gemini visual analysis (with or without a caption).
- 🎙️ **Voice Notes & Audio**: Native audio transcription and understanding (`audio/ogg`, `audio/mp4`, `audio/mpeg`, etc.).
- 📄 **Documents**: Supported documents processed as multimodal input.

---

## 🏗️ Architecture & Flow

```
                    ┌─────────────────────────┐
                    │    WhatsApp Client      │
                    │   (iOS / Android / Web) │
                    └────────────┬────────────┘
                                 │
                                 ▼
                     Meta WhatsApp Cloud API
                                 │
                 Webhook POST    │
                 (JSON Payload)  ▼
                    ┌─────────────────────────┐
                    │  channels/whatsapp      │
                    │  (FastAPI Microservice) │
                    │                         │
                    │  1. Returns 200 OK      │
                    │  2. Downloads Media     │
                    │     (Meta Graph API)    │
                    │  3. Formats Multimodal  │
                    │     (Base64 inline_data)│
                    └────────────┬────────────┘
                                 │
                                 ▼ HTTP POST /run (ADK API Server)
                    ┌─────────────────────────┐
                    │ Google ADK Agent Server │
                    │ (chat_assistant/Gemini) │
                    └────────────┬────────────┘
                                 │
                                 ▼ Text response
                    ┌─────────────────────────┐
                    │ WhatsApp Cloud API      │
                    │ POST /messages          │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    WhatsApp Client      │
                    └─────────────────────────┘
```

1. **Meta Webhook Handshake**: Implements the `GET /webhook` endpoint validating `hub.verify_token` and returning the challenge required by Meta.
2. **Immediate Async Reception**: Upon receiving `POST /webhook`, immediately returns `HTTP 200 OK` and processes media downloads and inference in `BackgroundTasks` to avoid Meta timeouts or retries.
3. **Media Download**: If the message contains an image or audio, fetches the authenticated download URL from the Graph API and downloads the bytes.
4. **ADK Multimodal Conversion**: Transforms binary data into ADK `types.Content` objects (`{"inline_data": {"mime_type": "...", "data": "<base64>"}}`).
5. **Persistent Sessions**: Automatically maps the user's phone number to an ADK session (`wa_{phone_number}`), preserving conversation context.

---

## ⚙️ Prerequisites

1. A developer account on [Meta for Developers](https://developers.facebook.com/).
2. A WhatsApp Cloud API app configured in Meta with:
   - **Access Token** (`whatsapp_token`): temporary or permanent (System User).
   - **App Secret** (`whatsapp_app_secret`): for `X-Hub-Signature-256` signature validation and automatic Callback URL registration in Meta.
   - *(Optional)* **Phone Number ID**, **WABA ID**, and **Verify Token**: automatically discovered and generated if omitted.
3. The ADK server running locally (default `http://localhost:8080` via `make dev-agent-api`) or deployed on Vertex AI Agent Runtime.

---

## 🚀 Getting Started

### 1. Install Dependencies
From the project root or inside the `channels` directory:

```bash
cd channels
uv sync
```

### 2. Configure Credentials (via `infra/vars/env.tfvars`)
Instead of managing multiple secrets manually, just add `whatsapp_token` and `whatsapp_app_secret` in `infra/vars/env.tfvars`:

```hcl
whatsapp_token      = "EAAG..."
whatsapp_app_secret = "your_meta_app_secret"
```

- **In production (`make infra` + `make deploy-whatsapp`)**:
  - Terraform automatically stores `whatsapp-token` and `whatsapp-app-secret` in **GCP Secret Manager**.
  - Terraform automatically generates a random 32-character `whatsapp-verify-token` in **GCP Secret Manager**.
  - `Phone Number ID` and `WABA ID` are **auto-discovered** from Meta Graph API (`/debug_token` and `/{WABA_ID}/phone_numbers`) and from incoming webhooks.
  - At the end of `make deploy-whatsapp`, the Cloud Run URL and `Verify Token` are automatically registered in your Meta App (`/{APP_ID}/subscriptions`) and the WABA is subscribed (`/{WABA_ID}/subscribed_apps`).
- **In local development (`make dev-whatsapp`)**:
  - `channels/whatsapp/config.py` automatically reads `whatsapp_token` and `whatsapp_app_secret` from `infra/vars/env.tfvars` as a fallback if not defined in `channels/whatsapp/.env`.

### 3. Start the Services

**Terminal 1: Start the local ADK backend (`http://localhost:8080`)**
```bash
make dev-agent-api
```

**Terminal 2: Start the WhatsApp channel + ngrok + Meta auto-registration**
```bash
make dev-whatsapp-tunnel
```
> `make dev-whatsapp-tunnel` starts the FastAPI server on port `8001`, opens an HTTPS tunnel with `ngrok`, automatically detects the public URL from `http://127.0.0.1:4040/api/tunnels`, auto-discovers the `App ID` and `WABA ID`, registers the Callback URL in the Meta App, and subscribes the WABA to the `messages` event.

You can also run the steps separately:
- `make dev-whatsapp`: Starts the webhook server on port 8001.
- `make tunnel-whatsapp`: Exposes port 8001 with ngrok.
- `make subscribe-whatsapp-waba`: Auto-discovers WABA, registers the webhook, and subscribes to events.

---

## 🌐 Meta Webhook Configuration (Automatic vs. Manual)

### Option A: Automatic (Recommended)
With `whatsapp_token` and `whatsapp_app_secret` defined in `infra/vars/env.tfvars`:
- **On Cloud Run**: `make deploy-whatsapp` automatically registers the Cloud Run URL and Terraform-generated `WHATSAPP_VERIFY_TOKEN` in your Meta App (`/{APP_ID}/subscriptions`) and subscribes your WABA (`/{WABA_ID}/subscribed_apps`).
- **In Local Development**: `make dev-whatsapp-tunnel` detects the active `ngrok` tunnel (`--auto-ngrok`) and automatically updates the Callback URL in Meta.

### Option B: Manual in Meta Dashboard
If you prefer to configure the webhook manually in **Meta for Developers**:
1. Go to **WhatsApp** > **Configuration** > **Webhook**.
2. Click **Edit**.
3. **Callback URL**: `https://your-domain/webhooks/whatsapp` (`/webhook`, `/webhook/whatsapp`, and `/whatsapp/webhook` are also supported).
4. **Verify Token**: The value of `WHATSAPP_VERIFY_TOKEN` (defaults locally to `coffee_assistant_verify_token`, or on Cloud Run via `terraform -chdir=infra output -raw whatsapp_verify_token`).
5. Click **Verify and save**.
6. Under Webhook subscription fields, enable **`messages`**.

---

## 🧪 Local Testing (Curl)

### Test Verification Handshake (GET):
```bash
curl -X GET "http://localhost:8001/webhook?hub.mode=subscribe&hub.verify_token=my_secret_adk_token&hub.challenge=1158201444"
```
Should respond with `1158201444` and status code 200.

### Test Text Message (Simulated POST):
```bash
curl -X POST "http://localhost:8001/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "12345",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {"display_phone_number": "123456", "phone_number_id": "123456789012345"},
          "contacts": [{"wa_id": "5215512345678", "profile": {"name": "User"}}],
          "messages": [{
            "from": "5215512345678",
            "id": "wamid.HBgL...",
            "timestamp": "1700000000",
            "type": "text",
            "text": {"body": "Hello, how are you?"}
          }]
        },
        "field": "messages"
      }]
    }]
  }'
```
Should respond immediately with `{"status": "ok"}` and status code 200.
