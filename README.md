# ☕ Fullstack ADK Coffee Assistant Template

A production-ready fullstack template for developing, testing, and deploying multimodal conversational agents powered by **Google ADK (Agent Development Kit)** and **Gemini**.

Equipped with a modern web interface built with **React + @assistant-ui** deployable to **Cloudflare Workers**, a **Live Orders Dashboard** backed by **Drizzle ORM** and **Neon Lakebase Postgres**, an omnichannel **WhatsApp Cloud API** integration microservice deployable to **Google Cloud Run**, automated distributed rate limiting via **Upstash Redis**, and unified Infrastructure as Code with **Terraform** managing **Google Cloud Platform (GCP)**, **Neon**, and **Upstash**.

🔗 **Live Demo:** [https://coffee-assistant-web.janf-agentic-architect.workers.dev/](https://coffee-assistant-web.janf-agentic-architect.workers.dev/)

---

## ✨ Key Features

- **🧠 Google ADK & Gemini 2.5 / 3.5**: Full conversational lifecycle, tools execution, and native session management.
- **🎨 Multimodal Processing**: Ingest and understand text, images, voice notes, and audio attachments across both Web and WhatsApp channels.
- **🌐 Cloudflare Workers Web UI**: Fast edge-rendered interface powered by Hono and `@assistant-ui` with real-time streaming and custom media renderers.
- **📋 Live Orders Dashboard**: Integrated order management UI in the web application with real-time order tracking, status badges, order notes, and full CRUD operations via Drizzle ORM.
- **⚡ Neon Lakebase Postgres & Drizzle ORM**: Serverless PostgreSQL with dual connection URLs (pooled via PgBouncer for Cloudflare Workers edge runtime and direct for DDL schema migrations) provisioned via Terraform.
- **🐳 Ephemeral Local Database**: Instant local PostgreSQL container via Docker (`make dev-db`) pre-configured with schema extensions (`pgcrypto`) and seed data.
- **📱 WhatsApp Cloud API on Cloud Run**: Dedicated FastAPI microservice handling webhooks, HMAC-SHA256 signature validation, Meta media downloads, Base64 formatting for ADK, persistent per-phone sessions, and zero-config Meta Graph API auto-discovery (`App ID`, `WABA ID`, `Phone Number ID`) with automatic webhook URL registration for both **Cloud Run** and local **ngrok** tunnels.
- **🛡️ Distributed Rate Limiting**: Built-in `UpstashRateLimitPlugin` for ADK protecting agent endpoints from abuse.
- **🔐 Automated Multi-Cloud IaC & Secret Sync**: Terraform provisions GCP resources, Neon Postgres, and Upstash Redis, automatically storing connection strings, auto-generated webhook verify tokens, and credentials in **GCP Secret Manager**.
- **☁️ Vertex AI Agent Runtime & Automated GCP Projects**: Terraform IaC to either deploy into an existing project or provision an entirely new GCP project from scratch with automatic billing association, API enablement, and metadata synchronization.

---

## 🏛️ Architecture Overview

```mermaid
flowchart TD
    subgraph Clients ["Clients & Channels"]
        WebUI["React Web UI (@assistant-ui)\n(Chat & Orders Dashboard)"]
        WhatsAppClient["WhatsApp App (iOS / Android / Web)"]
    end

    subgraph EdgeAndChannels ["Edge & Webhook Services"]
        HonoWorker["Cloudflare Worker\n(Hono Proxy + GCP SA Auth + Drizzle ORM)"]
        MetaAPI["Meta WhatsApp Cloud API"]
        WhatsAppService["WhatsApp Microservice\n(FastAPI: Local / Cloud Run)"]

        WebUI -->|Streaming, Sessions & Orders| HonoWorker
        WhatsAppClient <-->|Messages & Media| MetaAPI
        MetaAPI <-->|Webhooks & Graph API| WhatsAppService
    end

    subgraph GCP ["Google Cloud Platform (Vertex AI & Infra)"]
        AgentRuntime["Vertex AI Agent Runtime / Reasoning Engine"]
        ADKAgent["Google ADK Agent (Gemini)"]
        SecretManager["GCP Secret Manager"]
        GCS["Cloud Storage Bucket"]
        BigQuery["BigQuery Logs & Trace"]
        ArtifactRegistry["Artifact Registry\n(Docker Repository)"]

        HonoWorker -->|"HTTPS (IAM SA Key)"| AgentRuntime
        WhatsAppService -->|"ADC / IAM Bearer Token"| AgentRuntime
        AgentRuntime --> ADKAgent
        SecretManager -.->|"Injected Secrets"| ADKAgent
        SecretManager -.->|"Injected Secrets"| WhatsAppService
        ADKAgent --> GCS
        ADKAgent --> BigQuery
        WhatsAppService -.->|"Container Image"| ArtifactRegistry
    end

    subgraph ExternalServices ["External Cloud Services (IaC Managed)"]
        NeonDB["Neon Lakebase Postgres\n(Serverless DB + PgBouncer Pooler)"]
        Upstash["Upstash Redis\n(Distributed Rate Limiter)"]

        HonoWorker <-->|"Pooled SQL (PgBouncer)"| NeonDB
        ADKAgent <-->|"Sliding Window Counter"| Upstash
        SecretManager -.->|"Stores DB & Redis URLs"| NeonDB
        SecretManager -.->|"Stores Redis Tokens"| Upstash
    end
```

---

## 📦 Project Structure

```
.
├── Makefile                     # Task automation (dev, db, infra, secrets, deploy, channels, rename)
├── agents/                      # ADK Agents
│   └── coffee-assistant/        # Conversational agent implementation
│       ├── app/
│       │   ├── agent.py         # Root agent definition, tools & plugins
│       │   ├── fast_api_app.py  # FastAPI server for local execution
│       │   ├── rate_limiter.py  # Upstash Redis rate limiting plugin
│       │   └── app_utils/       # Utilities and configuration
│       ├── tests/               # Unit, integration, and rate limiter tests
│       ├── pyproject.toml       # Python dependencies managed with uv
│       ├── agents-cli-manifest.yaml
│       └── .env.example         # Template for local environment & secrets
├── channels/                    # Omnichannel Messaging Services
│   ├── README.md                # Channels overview
│   ├── Dockerfile               # Production container image for Cloud Run
│   ├── .dockerignore            # Docker build ignore rules
│   ├── pyproject.toml           # Channel dependencies managed with uv
│   ├── tests/                   # WhatsApp channel unit and webhook tests
│   └── whatsapp/                # WhatsApp Cloud API microservice
│       ├── main.py              # FastAPI entrypoint (/health, /webhook, /webhooks/whatsapp)
│       ├── router.py            # Webhook verification, HMAC-SHA256 validation & event handler
│       ├── service.py           # Background processor & ADK dispatcher
│       ├── adk_client.py        # Client adapter for ADK API (supports ADC & IAM auth)
│       ├── client.py            # Meta Graph API media, messaging & account auto-discovery client
│       ├── config.py            # Settings loader (.env + automatic fallback to infra/vars/env.tfvars)
│       ├── subscribe_waba.py    # Auto-discovers App/WABA/Phone ID & registers Cloud Run/ngrok webhooks
│       ├── .env.example         # Local environment override template
│       └── README.md            # Detailed WhatsApp configuration guide
├── web/                         # Web Application, Orders Dashboard & Edge API Proxy
│   ├── drizzle.config.ts        # Drizzle ORM configuration
│   ├── drizzle/                 # Generated SQL migrations
│   ├── src/
│   │   ├── components/          # React components (@assistant-ui thread, OrdersDashboard)
│   │   ├── db/                  # Drizzle database client, schema, and seed script
│   │   │   ├── index.ts         # Neon serverless / PostgreSQL connection helper
│   │   │   ├── schema.ts        # coffee_orders & chat_messages tables
│   │   │   └── seed.ts          # Sample data seeding script
│   │   ├── gcp-auth.ts          # JWT token generation for GCP Service Account
│   │   ├── index.tsx            # Hono server, /api/orders CRUD & /api/adk/* proxy
│   │   └── style.css            # Styles for chat layout, dashboard & media previews
│   ├── wrangler.jsonc           # Cloudflare Workers configuration
│   └── package.json             # Node.js dependencies (pnpm)
└── infra/                       # Infrastructure as Code (Terraform)
    ├── providers.tf             # Terraform providers (Google, Neon, Upstash, Time, Random)
    ├── variables.tf             # Input variable declarations (GCP, Neon, Upstash, WhatsApp)
    ├── outputs.tf               # Core Terraform outputs (Project ID, Agent URL, Neon DB URLs)
    ├── project.tf               # Conditional GCP project creation & suffix generator
    ├── apis.tf                  # Google Cloud APIs enablement (Vertex AI, Cloud Run, etc.)
    ├── iam.tf                   # Service Accounts, roles, and keys for Web Caller
    ├── neon.tf                  # Neon Lakebase Postgres provisioning & Secret Manager storage
    ├── upstash.tf               # Upstash Redis database provisioning & Secret Manager storage
    ├── service.tf               # Vertex AI Reasoning Engine / Agent Runtime
    ├── storage.tf               # Storage and logging buckets
    ├── telemetry.tf             # Logging and BigQuery sinks (with SA propagation delay)
    ├── whatsapp_channel.tf      # Cloud Run service, SA, and Secret Manager for WhatsApp
    ├── whatsapp_outputs.tf      # Cloud Run URL, Webhook URL, and Artifact Registry outputs
    ├── postgres-init/           # Local Docker PostgreSQL init scripts
    │   └── init.sql             # Schema definitions and initial seed data
    ├── sync_secrets.py          # Automatic local .env to Secret Manager sync script
    └── vars/
        ├── env.tfvars.example   # Example variables with Neon & Upstash credentials (tracked in git)
        └── env.tfvars           # Active deployment variables (gitignored)
```

---

## 🛠️ Prerequisites

Ensure you have the following tools installed and configured:

- **[Python >= 3.10](https://www.python.org/)** and **[uv](https://docs.astral.sh/uv/)** (fast Python package manager).
- **[Google Agents CLI](https://cloud.google.com/vertex-ai/docs)**:
  ```bash
  uv tool install google-agents-cli
  # Or initialize with:
  uvx google-agents-cli setup
  ```
- **[Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install)** authenticated and configured:
  ```bash
  gcloud auth login
  gcloud auth application-default login
  gcloud config set project <YOUR_PROJECT_ID>
  ```
- **[Node.js >= 18](https://nodejs.org/)** and **[pnpm](https://pnpm.io/)**.
- **[Docker](https://www.docker.com/)** (for the local ephemeral PostgreSQL development database).
- **[Terraform >= 1.5](https://www.terraform.io/)**.
- **[Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)** (Cloudflare):
  ```bash
  npx wrangler login
  ```
- *(Optional - for WhatsApp)*: **[ngrok](https://ngrok.com/)** and a [Meta for Developers](https://developers.facebook.com/) account.
- *(Optional - for Managed Infra)*: A [Neon](https://neon.tech/) API Key and an [Upstash](https://upstash.com/) API Key to automate database and Redis provisioning via Terraform.

---

## 🚀 Quick Start (Local Development)

### 1. Run the Local Database (PostgreSQL + Drizzle)

Start an ephemeral PostgreSQL container with pre-configured schema and seed data using Docker:

```bash
make dev-db
```
> The container stops and cleans up automatically when you press `Ctrl+C`.

In a separate terminal, manage or inspect your schema with Drizzle:
```bash
# Push schema changes to your local database
make db-push

# Seed additional sample orders and messages
make db-seed

# Open Drizzle Studio visualizer in your browser
make db-studio
```

### 2. Run the Agent Locally

Start the interactive development environment (`agents-cli` Playground):

```bash
make dev-agent
```
> Or run the FastAPI local server: `make dev-agent-api` (runs on `http://localhost:8080`).

### 3. Run the Web Application Locally

In another terminal, launch the React + Hono frontend:

```bash
make dev-web
```
Open your browser at `http://localhost:5173`. The web interface will automatically connect to your local agent at `http://localhost:8080` and your local PostgreSQL database at `localhost:5432`. You can switch between the **Assistant Chat** and the **Orders Dashboard**.

### 4. Run the WhatsApp Channel (Optional)

Add `whatsapp_token` and `whatsapp_app_secret` to `infra/vars/env.tfvars` (automatically loaded as a fallback by `channels/whatsapp/config.py`, or override in `channels/whatsapp/.env`; see [channels/whatsapp/README.md](channels/whatsapp/README.md)). Then start the webhook service, launch ngrok, and auto-register the public ngrok URL with Meta in a single command:

```bash
make dev-whatsapp-tunnel
```
> `make dev-whatsapp-tunnel` starts the FastAPI webhook on port `8001`, launches `ngrok`, detects the active HTTPS tunnel via `http://127.0.0.1:4040/api/tunnels`, auto-discovers your Meta `App ID` and `WABA ID`, registers the callback URL on your Meta App, and subscribes your WABA.
>
> You can also run each step separately: `make dev-whatsapp` (port 8001), `make tunnel-whatsapp`, and `make subscribe-whatsapp-waba`.

---

## 💾 Database & Persistence (Neon + Drizzle)

The project includes a robust, edge-ready data persistence layer:

### Schema Design (`web/src/db/schema.ts`)
- **`coffee_orders`**: Stores order headers (`id`, `customerId`, `customerName`, `status`, `totalAmount`, `notes`, `createdAt`, `updatedAt`).
- **`order_items`**: Stores multi-product line items per order (`id`, `orderId`, `productId`, `productName`, `quantity`, `unitPrice`, `notes`) with `ON DELETE CASCADE`.
- **`products`**: Stores the coffee shop product catalog (`id`, `name`, `category`, `price`, `description`, `available`, `createdAt`, `updatedAt`).
- **`customers`**: Stores registered customers and loyalty points (`id`, `name`, `email`, `phone`, `favoriteDrink`, `loyaltyPoints`, `createdAt`, `updatedAt`).

### Local vs. Production Workflow
1. **Local Development**:
   - Docker container runs `postgres:19-alpine` with `infra/postgres-init/init.sql`.
   - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_assistant_db`.
2. **Production (Neon Lakebase Postgres)**:
   - Terraform (`infra/neon.tf`) provisions the Neon project and application database.
   - Generates two connection strings saved directly to **GCP Secret Manager**:
     - `database-url`: **Pooled connection string (PgBouncer)** used by Cloudflare Workers at the edge. Automatically injected via `make deploy-web`.
     - `database-url-direct`: **Direct connection string** used for DDL schema migrations.

### Running Migrations on Neon
To run schema migrations or push changes directly to your Neon cloud database:
```bash
# Push Drizzle schema directly to Neon using the direct connection URL from Secret Manager
make db-neon-push

# Or run standard migration files
make db-neon-migrate

# Inspect the active pooled database URL from Secret Manager
make get-db-secret
```

---

## 📱 Channels & Multimodal Support

### Multimodal Chat (Web UI)
The web client features rich attachment handling:
- **Images**: Inline previews, lightboxes, and visual question answering with Gemini.
- **Audio & Voice Notes**: Visual audio player controls with real-time waveform representation and Gemini audio transcription/reasoning.
- **Orders Dashboard**: Live order status tracking, filtering, and state updates.

### WhatsApp Cloud API Integration
The `channels/whatsapp` microservice handles Meta webhooks asynchronously:
- Verifies Meta webhook challenges (`GET /webhook` and `GET /webhooks/whatsapp`).
- Validates payload authenticity via `X-Hub-Signature-256` (HMAC-SHA256) when `whatsapp_app_secret` is configured.
- Acknowledges `POST` with `200 OK` instantly and processes payloads in background tasks.
- **Zero-Config Account Auto-Discovery**: Automatically discovers `App ID`, `WABA ID`, and `Phone Number ID` from `whatsapp_token` via Meta Graph API (`/debug_token` and `/{WABA_ID}/phone_numbers`) as well as incoming webhook `metadata.phone_number_id`.
- Downloads voice notes, audio files, images, and documents via Meta Graph API.
- Converts raw media to Base64 `inline_data` Content objects for Google ADK.
- Maps user phone numbers to persistent sessions (`wa_<phone_number>`).
- Supports **both** local execution (with automatic ngrok URL registration in Meta) and **serverless production deployment on Cloud Run**.
- Handles authentication automatically:
  - Local dev: calls direct HTTP agent endpoints (`http://localhost:8080`).
  - Cloud Run: obtains Google Cloud Application Default Credentials (ADC) / IAM Bearer tokens to securely call Vertex AI Reasoning Engine.

For detailed webhook setup in Meta Developer Portal, see [channels/whatsapp/README.md](channels/whatsapp/README.md).

---

## 🔐 Secrets & Rate Limiting

### Automated Multi-Cloud Provisioning via Terraform
When you provide `neon_api_key`, `upstash_api_key`, `whatsapp_token`, and `whatsapp_app_secret` in `infra/vars/env.tfvars`, Terraform automatically:
1. Provisions your **Neon Lakebase Postgres** project and database.
2. Provisions your **Upstash Redis** global database.
3. Automatically creates and stores the following secrets in **GCP Secret Manager**:
   - `database-url`: Pooled PgBouncer connection URI for the web worker.
   - `database-url-direct`: Direct PostgreSQL URI for migrations.
   - `upstash-redis-url`: REST endpoint for Upstash Redis.
   - `upstash-redis-token`: Bearer authentication token for Upstash Redis.
   - `whatsapp-token`: Meta WhatsApp Cloud API System User Access Token.
   - `whatsapp-app-secret`: Meta App Secret for `X-Hub-Signature-256` verification and webhook auto-registration.
   - `whatsapp-verify-token`: Auto-generated 32-character webhook verification token.
   - `whatsapp-phone-number-id`: Configured Phone Number ID (or `"auto"` for automatic discovery via incoming webhooks / Meta Graph API).

### Local Secret Manager Sync
Any custom configuration placed in `agents/coffee-assistant/.env` or `channels/whatsapp/.env` can be synced to GCP Secret Manager:

```bash
# Sync agent secrets (API keys, custom variables)
make sync-secrets

# Sync WhatsApp credentials (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, etc.)
make sync-whatsapp-secrets
```

### Upstash Redis Rate Limiting
The agent incorporates `UpstashRateLimitPlugin` implementing a sliding window algorithm:
```python
# agents/coffee-assistant/app/agent.py
rate_limiter = UpstashRateLimitPlugin(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "50")),
    window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "86400")),
)
```
If limits are exceeded, a polite fallback message is returned without consuming model tokens.

---

## ☁️ Production Deployment

The project provides automated commands to provision infrastructure on GCP, Neon, and Upstash, deploy the agent to Vertex AI, publish the web app to Cloudflare Workers, and deploy the WhatsApp channel to Cloud Run.

### 1. Cloud Infrastructure Provisioning (`make infra`)

Configure `infra/vars/env.tfvars` (copy from `infra/vars/env.tfvars.example`) with your GCP, Neon, Upstash, and optional WhatsApp credentials:

```hcl
project_name = "coffee-assistant"
region       = "us-east1"

# Neon Lakebase Postgres credentials
neon_api_key = "your-neon-api-key"
neon_org_id  = "org-your-org-id"

# Upstash Redis credentials
upstash_email   = "your-email@example.com"
upstash_api_key = "your-upstash-api-key"

# Meta WhatsApp Cloud API credentials (optional - stored in GCP Secret Manager)
# Phone Number ID, WABA ID, and Verify Token are auto-discovered / auto-generated when omitted.
whatsapp_token      = "your-meta-system-user-access-token"
whatsapp_app_secret = "your-meta-app-secret"
```

Then run Terraform:

#### Option A: Create a New GCP Project Automatically
```bash
make infra CREATE_PROJECT=true PROJECT_NAME="coffee-assistant"
```
- Creates a new GCP project (e.g. `coffee-assistant-bab9d2`) with a unique random suffix.
- Automatically detects and links your active Google Cloud Billing Account.
- Enables all required APIs (Vertex AI, Cloud Run, Secret Manager, Cloud Build, BigQuery, etc.).
- Automatically synchronizes the generated `project_id` across:
  - `infra/vars/env.tfvars` (gitignored)
  - `agents/coffee-assistant/.env`
  - `deployment_metadata.json`
  - `gcloud config set project <PROJECT_ID>`

#### Option B: Deploy into an Existing GCP Project
```bash
make infra PROJECT_ID="your-existing-project-id"
```
Or define `project_id = "your-existing-project-id"` in `infra/vars/env.tfvars`.

---

### 2. Full Core Deployment (Agent + Web)

To provision infrastructure, deploy the Agent to Vertex AI, and publish the Web UI with Neon database connectivity in one step:

```bash
make deploy-all
```

Or step-by-step:
1. **Infrastructure (`make infra`)**: Provisions GCP, Neon Postgres, and Upstash Redis.
2. **Secrets Sync (`make sync-secrets`)**: Syncs environment variables into GCP Secret Manager.
3. **Database Migration (`make db-neon-push`)**: Pushes Drizzle schema to Neon.
4. **Agent Deployment (`make deploy-agent`)**: Packages and deploys the agent to Vertex AI Agent Runtime with bound secrets.
5. **Web Deployment (`make deploy-web`)**: Builds and deploys the frontend to Cloudflare Workers, automatically injecting `AGENT_RUNTIME_API_URL`, `GCP_SA_KEY_JSON`, and `DATABASE_URL`.

---

### 3. WhatsApp Channel Deployment (Cloud Run)

With `whatsapp_token` and `whatsapp_app_secret` configured in `infra/vars/env.tfvars` (and applied via `make infra`), deploy and auto-register the WhatsApp webhook in one command:

```bash
make deploy-whatsapp
```

`make deploy-whatsapp` automatically:
1. Builds and pushes the container image to Artifact Registry via Cloud Build.
2. Deploys the Cloud Run service bound to the secrets in GCP Secret Manager.
3. Auto-discovers your Meta `App ID`, `WABA ID`, and `Phone Number ID` from `whatsapp_token`.
4. Automatically registers the Cloud Run Callback URL and auto-generated `WHATSAPP_VERIFY_TOKEN` on your Meta App (`/{APP_ID}/subscriptions`) and subscribes your WABA (`/{WABA_ID}/subscribed_apps`).

---

## 📋 Makefile Commands Reference

| Command | Category | Description |
|---------|----------|-------------|
| `make dev-agent` | Local Dev | Run local agent playground with `agents-cli` |
| `make dev-agent-api` | Local Dev | Run local FastAPI server on port 8080 |
| `make dev-web` | Local Dev | Start Vite + Hono frontend development server |
| `make dev-db` | Database | Run ephemeral PostgreSQL container with Docker |
| `make db-push` | Database | Push Drizzle schema to local database |
| `make db-seed` | Database | Seed database with sample data via TypeScript/Drizzle |
| `make db-studio` | Database | Open Drizzle Studio visualizer in browser |
| `make get-db-secret` | Database | Fetch pooled `DATABASE_URL` from GCP Secret Manager |
| `make db-neon-migrate` | Database | Run Drizzle migrations against Neon using direct connection |
| `make db-neon-push` | Database | Push Drizzle schema directly to Neon using direct connection |
| `make dev-whatsapp` | Local Dev | Start WhatsApp webhook server on port 8001 |
| `make tunnel-whatsapp` | Local Dev | Open an ngrok tunnel to port 8001 |
| `make dev-whatsapp-tunnel`| Local Dev | Start WhatsApp webhook, expose via ngrok, and auto-register ngrok URL in Meta |
| `make infra-init` | Infra | Initialize Terraform providers and backend |
| `make infra-plan` | Infra | Preview infrastructure changes with Terraform |
| `make infra` | Infra | Apply infrastructure (supports `CREATE_PROJECT=true PROJECT_NAME=...` or `PROJECT_ID=...`) |
| `make sync-metadata` | Infra | Sync active Project ID and Reasoning Engine ID to configs |
| `make sync-secrets` | Secrets | Synchronize `agents/coffee-assistant/.env` to GCP Secret Manager |
| `make sync-whatsapp-secrets` | Secrets | Synchronize `channels/whatsapp/.env` to GCP Secret Manager |
| `make build-whatsapp` | Channels | Build & push WhatsApp container image to Artifact Registry |
| `make deploy-whatsapp` | Channels | Build, deploy WhatsApp webhook to Cloud Run, and auto-configure Meta webhook & WABA |
| `make subscribe-whatsapp-waba` | Channels | Auto-discover Meta WABA, register Cloud Run Webhook URL, and subscribe WABA |
| `make deploy-agent` | Deploy | Deploy agent to Vertex AI Agent Runtime with bound secrets |
| `make deploy-status` | Deploy | Check deployment progress in Vertex AI Agent Runtime |
| `make deploy-web` | Deploy | Build & deploy web app to Cloudflare Workers with secrets & DB URL |
| `make deploy-all` | Deploy | Execute full pipeline: infra -> sync -> deploy agent -> deploy web |
| `make rename` | Tooling | Centralize and rename project across all services and configurations |

---

## 🔄 Renaming the Project / Creating a New Agent

To customize this template for a new project, automatically update directory names, manifests, Terraform variables, database names, and Cloudflare configurations:

```bash
make rename NAME=my-assistant
```

This single command centralizes the naming across:
- **Vertex AI Agent**: `my-assistant` (`my_assistant`)
- **Web Dashboard**: `my-assistant-web`
- **Neon Project**: `my-assistant-db`
- **Neon / Postgres DB**: `my_assistant_db`
- **Upstash Redis**: `my-assistant-redis`
- **WhatsApp Webhook**: `my-assistant-whatsapp`
- **Service Accounts**: `my-assistant-whatsapp-sa`, `my-assistant-web-caller`
- **Configuration Templates**: Updates database URLs in `web/.env.example`

> [!IMPORTANT]
> **Always sync your lockfile after renaming!**
> When changing the agent package name in `pyproject.toml`, run:
> ```bash
> cd agents/my-assistant
> uv lock
> ```
> This keeps `uv.lock` in sync with `pyproject.toml`, preventing container build errors (`Missing workspace member`) during `agents-cli deploy`.

---

## 🧪 Testing and Evaluation

### Agent Unit & Integration Tests
```bash
cd agents/coffee-assistant
uv run pytest tests/unit tests/integration
```

### WhatsApp Channel Tests
Run unit and integration tests covering Meta webhooks, signature verification, media downloading, and ADK client formatting:
```bash
cd channels
uv run pytest tests/
```

### LLM Evaluation
Run automated quality evaluations against your dataset:
```bash
cd agents/coffee-assistant
agents-cli eval
```

---

## 📊 Observability and Telemetry

The agent is fully instrumented for enterprise monitoring:
- **Cloud Trace**: Distributed tracing for model invocations, tool executions, and step latency.
- **Cloud Logging & BigQuery**: Structured conversation logging, session persistence, and analytics sinks.
- **Cloud Run Metrics**: Ingress request latencies, instance counts, and webhook health for the WhatsApp channel.

---

## 📄 License

This project is licensed under the Apache 2.0 License. See source file headers for details.
