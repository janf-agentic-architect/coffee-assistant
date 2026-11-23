# ☕ Fullstack ADK Coffee Assistant Template

A production-ready, multi-tenant fullstack template for developing, testing, and deploying multimodal conversational agents powered by **Google ADK (Agent Development Kit)** and **Gemini**.

Equipped with a modern web interface built with **React + @assistant-ui** deployable to **Cloudflare Workers**, **Google Cloud Identity Platform** authentication, a multi-tenant **Orders & Business Dashboard** backed by **Drizzle ORM** and **Neon Lakebase Postgres**, a private **MCP Toolbox for Databases** server on **Google Cloud Run**, an omnichannel **WhatsApp Cloud API** integration microservice on **Cloud Run**, distributed rate limiting via **Upstash Redis**, and unified Infrastructure as Code with **Terraform** managing **Google Cloud Platform (GCP)**, **Neon**, and **Upstash**.

🔗 **Live Demo:** [https://coffee-assistant-web.janf-agentic-architect.workers.dev/](https://coffee-assistant-web.janf-agentic-architect.workers.dev/)

---

## ✨ Key Features

- **🧠 Google ADK & Gemini 3.5**: Full conversational lifecycle, custom tools, tenant-aware callbacks (`before_agent_callback`, `before_tool_callback`), and native session management.
- **🧰 Private MCP Toolbox for Databases**: Runs Google's official **MCP Toolbox for Databases** (`tools.yaml`) locally or on private **Cloud Run v2**, allowing the ADK agent to query PostgreSQL/Neon securely via IAM-authenticated ID tokens without exposing database credentials to the agent.
- **🏢 Multi-Tenant Business Support & Identity Platform Auth**: Built-in **Google Cloud Identity Platform** authentication (Email/Password + Guest/Anonymous mode) with a **Business Modal** to create/switch businesses, customize per-business assistant instructions, and map WhatsApp phone numbers to individual tenants.
- **🎨 Multimodal Processing**: Ingest and understand text, images, voice notes, and audio attachments across both Web and WhatsApp channels, with GFM Markdown rendering on Web and automatic Markdown-to-WhatsApp formatting on WhatsApp.
- **🌐 Cloudflare Workers Web UI**: Fast edge-rendered interface powered by Hono and `@assistant-ui` with real-time streaming, authentication, and custom media renderers.
- **📋 Live Orders, Products & Customers Dashboard**: Integrated management UI in the web application with real-time order tracking, status badges, multi-item orders, product catalog, customer loyalty profiles, and full CRUD operations via Drizzle ORM.
- **⚡ Neon Lakebase Postgres & Drizzle ORM**: Serverless PostgreSQL with dual connection URLs (pooled via PgBouncer for Cloudflare Workers edge runtime and direct for DDL schema migrations) provisioned via Terraform.
- **🐳 Ephemeral Local Database**: Instant local PostgreSQL container via Docker (`make dev-db`) that automatically runs `db:push` and `db:seed` as soon as the container is ready.
- **📱 WhatsApp Cloud API on Cloud Run**: Dedicated FastAPI microservice handling webhooks, HMAC-SHA256 signature validation, Meta media downloads, Base64 formatting for ADK, persistent per-phone sessions, automatic customer registration in PostgreSQL, Markdown-to-WhatsApp formatting, and zero-config Meta Graph API auto-discovery (`App ID`, `WABA ID`, `Phone Number ID`) with automatic webhook URL registration for both **Cloud Run** and local **ngrok** tunnels.
- **🛡️ Distributed Rate Limiting**: Built-in `UpstashRateLimitPlugin` for ADK protecting agent endpoints from abuse (toggleable via `RATE_LIMIT_ENABLED` for local development).
- **🔐 Automated Multi-Cloud IaC & Secret Sync**: Terraform provisions GCP resources (Vertex AI, Cloud Run, Identity Platform, Secret Manager, BigQuery), Neon Postgres, and Upstash Redis, automatically storing connection strings, API keys, `tools.yaml`, auto-generated webhook verify tokens, and credentials in **GCP Secret Manager**.
- **☁️ Vertex AI Agent Runtime & Automated GCP Projects**: Terraform IaC to either deploy into an existing project or provision an entirely new GCP project from scratch with automatic billing association, API enablement, and metadata synchronization.

---

## 🏛️ Architecture Overview

```mermaid
flowchart TD
    subgraph Clients ["Clients & Channels"]
        WebUI["React Web UI (@assistant-ui)\n(Chat, Auth, Business & Orders Dashboard)"]
        WhatsAppClient["WhatsApp App (iOS / Android / Web)"]
    end

    subgraph EdgeAndChannels ["Edge & Webhook Services"]
        HonoWorker["Cloudflare Worker\n(Hono Proxy + GCP SA Auth + Identity Auth + Drizzle ORM)"]
        MetaAPI["Meta WhatsApp Cloud API"]
        WhatsAppService["WhatsApp Microservice\n(FastAPI: Local / Cloud Run)"]

        WebUI -->|Streaming, Auth, Sessions & CRUD| HonoWorker
        WhatsAppClient <-->|Messages & Media| MetaAPI
        MetaAPI <-->|Webhooks & Graph API| WhatsAppService
    end

    subgraph GCP ["Google Cloud Platform (Vertex AI & Infra)"]
        AgentRuntime["Vertex AI Agent Runtime / Reasoning Engine"]
        ADKAgent["Google ADK Agent (Gemini)"]
        MCPToolbox["MCP Toolbox for Databases\n(Private Cloud Run v2)"]
        IdentityPlatform["GCP Identity Platform\n(Email/Password + Anonymous)"]
        SecretManager["GCP Secret Manager"]
        GCS["Cloud Storage Bucket"]
        BigQuery["BigQuery Logs & Trace"]
        ArtifactRegistry["Artifact Registry\n(Docker Repository)"]

        HonoWorker -->|"HTTPS (IAM SA Key)"| AgentRuntime
        HonoWorker <-->|"REST Auth (API Key)"| IdentityPlatform
        WhatsAppService -->|"ADC / IAM Bearer Token"| AgentRuntime
        AgentRuntime --> ADKAgent
        ADKAgent -->|"IAM ID Token (MCP / SQL Tools)"| MCPToolbox
        SecretManager -.->|"Injected Secrets"| ADKAgent
        SecretManager -.->|"tools.yaml & DB Password"| MCPToolbox
        SecretManager -.->|"Injected Secrets"| WhatsAppService
        ADKAgent --> GCS
        ADKAgent --> BigQuery
        WhatsAppService -.->|"Container Image"| ArtifactRegistry
    end

    subgraph ExternalServices ["External Cloud Services (IaC Managed)"]
        NeonDB["Neon Lakebase Postgres\n(Serverless DB + PgBouncer Pooler)"]
        Upstash["Upstash Redis\n(Distributed Rate Limiter)"]

        HonoWorker <-->|"Pooled SQL (PgBouncer)"| NeonDB
        MCPToolbox <-->|"Pooled SQL (SSL)"| NeonDB
        ADKAgent <-->|"Sliding Window Counter"| Upstash
        SecretManager -.->|"Stores DB URLs & Password"| NeonDB
        SecretManager -.->|"Stores Redis Tokens"| Upstash
    end
```

---

## 📦 Project Structure

```
.
├── Makefile                     # Task automation (dev, db, toolbox, infra, secrets, deploy, channels, rename)
├── agents/                      # ADK Agents
│   └── coffee-assistant/        # Conversational agent implementation
│       ├── app/
│       │   ├── agent.py         # Root agent definition, dynamic business instructions & plugins
│       │   ├── callbacks.py     # Tenant binding (before_tool) & WhatsApp customer auto-registration (before_agent)
│       │   ├── tools.py         # MCP ToolboxToolset & local order/preference tools
│       │   ├── fast_api_app.py  # FastAPI server for local execution
│       │   ├── rate_limiter.py  # Upstash Redis rate limiting plugin
│       │   └── app_utils/       # Utilities and configuration
│       ├── tests/               # Unit, integration, customer registration, and rate limiter tests
│       ├── pyproject.toml       # Python dependencies managed with uv
│       ├── agents-cli-manifest.yaml
│       └── .env.example         # Template for local environment & secrets
├── mcp/                         # MCP Servers & Database Tooling
│   └── mcp-toolbox/
│       ├── tools.yaml           # PostgreSQL source & SQL tools (get-products-by-business, upsert-whatsapp-customer)
│       └── toolbox              # Local MCP Toolbox binary (for make dev-toolbox)
├── channels/                    # Omnichannel Messaging Services
│   ├── README.md                # Channels overview
│   ├── Dockerfile               # Production container image for Cloud Run
│   ├── .dockerignore            # Docker build ignore rules
│   ├── pyproject.toml           # Channel dependencies managed with uv
│   ├── tests/                   # WhatsApp channel unit, formatting, and webhook tests
│   └── whatsapp/                # WhatsApp Cloud API microservice
│       ├── main.py              # FastAPI entrypoint (/health, /webhook, /webhooks/whatsapp)
│       ├── router.py            # Webhook verification, HMAC-SHA256 validation & event handler
│       ├── service.py           # Background processor & tenant-aware ADK dispatcher
│       ├── adk_client.py        # Client adapter for ADK API (supports ADC & IAM auth)
│       ├── client.py            # Meta Graph API media, messaging & account auto-discovery client
│       ├── formatting.py        # Markdown-to-WhatsApp text & table formatter
│       ├── models.py            # Pydantic webhook payload models
│       ├── config.py            # Settings loader (.env + automatic fallback to infra/vars/env.tfvars)
│       ├── subscribe_waba.py    # Auto-discovers App/WABA/Phone ID & registers Cloud Run/ngrok webhooks
│       ├── .env.example         # Local environment override template
│       └── README.md            # Detailed WhatsApp configuration guide
├── web/                         # Web Application, Orders Dashboard & Edge API Proxy
│   ├── drizzle.config.ts        # Drizzle ORM configuration
│   ├── drizzle/                 # Generated SQL migrations
│   ├── src/
│   │   ├── auth/                # Client auth state (auth-store.ts) & guest persistence (guest-storage.ts)
│   │   ├── components/          # React components (MyAssistant, OrdersDashboard, AuthModal, BusinessModal, assistant-ui)
│   │   ├── db/                  # Drizzle database client, schema, and seed script
│   │   │   ├── index.ts         # Neon serverless / PostgreSQL connection helper
│   │   │   ├── schema.ts        # businesses, products, customers, coffee_orders & order_items tables
│   │   │   └── seed.ts          # Sample data seeding script
│   │   ├── gcp-auth.ts          # JWT token generation for GCP Service Account
│   │   ├── gcp-identity.ts      # Google Cloud Identity Platform REST auth helper
│   │   ├── index.tsx            # Hono server, auth routes, /api/businesses, /api/orders CRUD & /api/adk/* proxy
│   │   └── style.css            # Styles for chat layout, auth/business modals, dashboard & media previews
│   ├── wrangler.jsonc           # Cloudflare Workers configuration
│   └── package.json             # Node.js dependencies (pnpm)
└── infra/                       # Infrastructure as Code (Terraform)
    ├── providers.tf             # Terraform providers (Google, Neon, Upstash, Time, Random)
    ├── variables.tf             # Input variable declarations (GCP, Neon, Upstash, WhatsApp)
    ├── outputs.tf               # Core Terraform outputs (Project ID, Agent URL, Neon DB URLs)
    ├── project.tf               # Conditional GCP project creation & suffix generator
    ├── apis.tf                  # Google Cloud APIs enablement (Vertex AI, Cloud Run, Identity Toolkit, etc.)
    ├── iam.tf                   # Service Accounts, roles, and keys for Web Caller
    ├── identity.tf              # GCP Identity Platform config, restricted Web API key & Secret Manager storage
    ├── neon.tf                  # Neon Lakebase Postgres provisioning & Secret Manager storage
    ├── toolbox.tf               # Private Cloud Run v2 MCP Toolbox service, IAM invokers & Secret Manager config
    ├── upstash.tf               # Upstash Redis database provisioning & Secret Manager storage
    ├── service.tf               # Vertex AI Reasoning Engine / Agent Runtime
    ├── service_outputs.tf       # Agent Runtime outputs
    ├── storage.tf               # Storage and logging buckets
    ├── telemetry.tf             # Logging and BigQuery sinks (with SA propagation delay)
    ├── telemetry_outputs.tf     # Telemetry outputs
    ├── whatsapp_channel.tf      # Cloud Run service, SA, and Secret Manager for WhatsApp
    ├── whatsapp_outputs.tf      # Cloud Run URL, Webhook URL, and Artifact Registry outputs
    ├── postgres-init/           # Local Docker PostgreSQL init scripts
    │   └── init.sql             # Schema definitions and initial seed data
    ├── sync_secrets.py          # Automatic local .env to Secret Manager sync script
    └── vars/
        ├── env.tfvars.example   # Example variables with Neon, Upstash & WhatsApp credentials (tracked in git)
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

### All-in-One Local Stack (Recommended)

Start **PostgreSQL** (ephemeral Docker container + automatic `db:push` & `db:seed`), **MCP Toolbox** (`http://127.0.0.1:5000`), **Agent FastAPI** (`http://localhost:8080`), and the **Web Dashboard** in a single command:

```bash
make dev-all
```
> Pressing `Ctrl+C` cleanly stops all processes and removes the ephemeral PostgreSQL container.
> If you also want to test WhatsApp locally, run `make dev-whatsapp` in a second terminal.

---

### Or Run Each Service Individually

#### 1. Run the Local Database (PostgreSQL + Drizzle)

Start an ephemeral PostgreSQL container using Docker. Once PostgreSQL is ready, it automatically runs `db:push` and `db:seed`:

```bash
make dev-db
```
> The container stops and cleans up automatically when you press `Ctrl+C`.

In a separate terminal, you can also manage or inspect your schema manually with Drizzle:
```bash
# Push schema changes to your local database
make db-push

# Seed additional sample businesses, products, customers, and orders
make db-seed

# Open Drizzle Studio visualizer in your browser
make db-studio
```

### 2. Run the Local MCP Toolbox Server

Start the MCP Toolbox for Databases server on `http://127.0.0.1:5000` using `mcp/mcp-toolbox/tools.yaml` (connects to your local PostgreSQL instance by default):

```bash
make dev-toolbox
```

### 3. Run the Agent & Web Application Locally

Start both the FastAPI Agent backend (`http://localhost:8080`) and the Vite + Hono Web Dashboard together in a single command:

```bash
make dev
```

Or run them individually for debugging:
- **Interactive ADK Playground**: `make dev-agent`
- **Agent FastAPI Server only**: `make dev-agent-api` (runs on `http://localhost:8080`)
- **Web UI only**: `make dev-web`

Open your browser at the URL shown by Vite (typically `http://localhost:5173`). The web interface connects to your local agent at `http://localhost:8080` and your local PostgreSQL database at `localhost:5432`. You can switch between the **Assistant Chat** and the **Orders Dashboard**, sign in or use guest mode, and manage multiple businesses via the **Business Modal**.

### 4. Run the WhatsApp Channel (Optional)

Add `whatsapp_token` and `whatsapp_app_secret` to `infra/vars/env.tfvars` (automatically loaded as a fallback by `channels/whatsapp/config.py`, or override in `channels/whatsapp/.env`; see [channels/whatsapp/README.md](channels/whatsapp/README.md)). Then start the webhook service, launch ngrok, and auto-register the public ngrok URL with Meta in a single command:

```bash
make dev-whatsapp
```
> `make dev-whatsapp` (aliased as `make dev-whatsapp-tunnel`) starts the FastAPI webhook on port `8001`, launches `ngrok`, detects the active HTTPS tunnel via `http://127.0.0.1:4040/api/tunnels`, auto-discovers your Meta `App ID` and `WABA ID`, registers the callback URL on your Meta App, and subscribes your WABA.
>
> You can also run each step separately: `make dev-whatsapp-server` (port 8001), `make tunnel-whatsapp`, and `make subscribe-whatsapp-waba`.

---

## 💾 Database, Multi-Tenancy & MCP Toolbox

### Schema Design (`web/src/db/schema.ts`)
- **`businesses`**: Stores multi-tenant business profiles (`id`, `ownerUserId`, `name`, `description`, `assistantInstructions`, `whatsappPhoneNumberId`, `createdAt`, `updatedAt`) with a unique index on `whatsapp_phone_number_id`.
- **`products`**: Stores per-business product catalogs (`id`, `businessId`, `userId`, `name`, `category`, `price`, `description`, `available`, `createdAt`, `updatedAt`).
- **`customers`**: Stores per-business registered customers and loyalty points (`id`, `businessId`, `userId`, `name`, `email`, `phone`, `favoriteDrink`, `loyaltyPoints`, `createdAt`, `updatedAt`) with a unique index on `(business_id, normalized_phone)`.
- **`coffee_orders`**: Stores order headers (`id`, `businessId`, `userId`, `customerId`, `customerName`, `status`, `totalAmount`, `notes`, `createdAt`, `updatedAt`).
- **`order_items`**: Stores multi-product line items per order (`id`, `orderId`, `productId`, `productName`, `quantity`, `unitPrice`, `notes`) with `ON DELETE CASCADE`.

### MCP Toolbox for Databases (`mcp/mcp-toolbox/tools.yaml` & `infra/toolbox.tf`)
The ADK agent accesses live database records through Google's **MCP Toolbox for Databases**:
- **`get-products-by-business`**: Resolves the active tenant by `whatsapp_phone_number_id`, display phone number, or `business_id` UUID and returns available products plus business metadata. Bound automatically via `before_tool_callback=bind_session_tenant`.
- **`upsert-whatsapp-customer`**: Invoked automatically once per session via `before_agent_callback=register_whatsapp_customer` to register new WhatsApp customers and hydrate `customer_id`, `customer_name`, `customer_favorite_drink`, and `customer_loyalty_points` into ADK session state.
- **Zero-Trust Cloud Run Security**: In production, Terraform deploys MCP Toolbox as a private Cloud Run v2 service (`<project_name>-toolbox`) with `roles/run.invoker` granted exclusively to the Vertex AI Agent Runtime identity. `tools.yaml` and `postgres-password` are mounted from GCP Secret Manager, and changing `tools.yaml` automatically rolls a new Cloud Run revision (`make deploy-toolbox`).

### Local vs. Production Database Workflow
1. **Local Development**:
   - Docker container runs `postgres:19-alpine` with `infra/postgres-init/init.sql`, followed automatically by `db:push` and `db:seed`.
   - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_assistant_db`.
2. **Production (Neon Lakebase Postgres)**:
   - Terraform (`infra/neon.tf`) provisions the Neon project and application database.
   - Generates secrets saved directly to **GCP Secret Manager**:
     - `database-url`: **Pooled connection string (PgBouncer)** used by Cloudflare Workers at the edge (injected via `make deploy-web`).
     - `database-url-direct`: **Direct connection string** used for DDL schema migrations.
     - `postgres-password`: **Database password** mounted securely by the private MCP Toolbox Cloud Run service.

### Running Migrations & Seeding on Neon
```bash
# Push Drizzle schema directly to Neon using the direct connection URL from Secret Manager
make db-neon-push

# Seed Neon with initial sample data
make db-neon-seed

# Or run standard migration files
make db-neon-migrate

# Inspect the active pooled database URL from Secret Manager
make get-db-secret
```

---

## 📱 Channels & Multimodal Support

### Multimodal Chat & Business Dashboard (Web UI)
The web client features rich attachment handling, authentication, and tenant management:
- **Authentication**: Sign up / sign in with **Google Cloud Identity Platform** (Email/Password) or try immediately in Guest/Anonymous mode.
- **Multi-Business Management**: Create and switch businesses, set custom business-level instructions for the AI assistant, and link a WhatsApp Phone Number ID.
- **Images**: Inline previews, lightboxes, and visual question answering with Gemini.
- **Audio & Voice Notes**: Visual audio player controls with real-time waveform representation and Gemini audio transcription/reasoning.
- **Markdown Rendering**: Full GFM Markdown support (tables, lists, code blocks) via `@assistant-ui/react-markdown`.
- **Orders, Products & Customers Dashboard**: Live order status tracking, filtering, product catalog management, and customer profiles.

### WhatsApp Cloud API Integration
The `channels/whatsapp` microservice handles Meta webhooks asynchronously:
- Verifies Meta webhook challenges (`GET /webhook` and `GET /webhooks/whatsapp`).
- Validates payload authenticity via `X-Hub-Signature-256` (HMAC-SHA256) when `whatsapp_app_secret` is configured.
- Acknowledges `POST` with `200 OK` instantly and processes payloads in background tasks.
- **Zero-Config Account Auto-Discovery**: Automatically discovers `App ID`, `WABA ID`, and `Phone Number ID` from `whatsapp_token` via Meta Graph API (`/debug_token` and `/{WABA_ID}/phone_numbers`) as well as incoming webhook `metadata.phone_number_id`.
- **Multi-Tenant Routing & Auto-Registration**: Forwards incoming business `whatsapp_phone_number_id`, `whatsapp_display_phone`, `customer_phone`, and `customer_name` in session state so the ADK agent resolves the matching business menu and auto-registers the customer in PostgreSQL.
- **WhatsApp Markdown Formatting**: Converts Gemini's Markdown responses (headings, bold, italics, strikethrough, links, and tables) into clean WhatsApp-native formatting (`channels/whatsapp/formatting.py`).
- Downloads voice notes, audio files, images, and documents via Meta Graph API and converts them to Base64 `inline_data` Content objects for Google ADK.
- Maps user phone numbers to persistent sessions (`wa_<phone_number>`).
- Supports **both** local execution (with automatic ngrok URL registration in Meta) and **serverless production deployment on Cloud Run** using ADC / IAM Bearer tokens.

For detailed webhook setup in Meta Developer Portal, see [channels/whatsapp/README.md](channels/whatsapp/README.md).

---

## 🔐 Secrets & Rate Limiting

### Automated Multi-Cloud Provisioning via Terraform
When you provide `neon_api_key`, `upstash_api_key`, `whatsapp_token`, and `whatsapp_app_secret` in `infra/vars/env.tfvars`, Terraform automatically:
1. Provisions your **Neon Lakebase Postgres** project and database.
2. Provisions your **Upstash Redis** global database.
3. Configures **Google Cloud Identity Platform** (Email/Password + Anonymous auth) and a restricted Web API key.
4. Deploys the private **MCP Toolbox for Databases** Cloud Run service.
5. Automatically creates and stores the following secrets in **GCP Secret Manager**:
   - `database-url`: Pooled PgBouncer connection URI for the web worker.
   - `database-url-direct`: Direct PostgreSQL URI for migrations.
   - `postgres-password`: Neon Postgres password for MCP Toolbox on Cloud Run.
   - `toolbox-tools-yaml`: Versioned `mcp/mcp-toolbox/tools.yaml` configuration.
   - `toolbox-url`: Private Cloud Run URL for MCP Toolbox (auto-bound as `TOOLBOX_URL` on `make deploy-agent`).
   - `gcp-identity-api-key`: Restricted GCP Identity Platform Web API Key (auto-injected into Cloudflare Workers).
   - `upstash-redis-url`: REST endpoint for Upstash Redis.
   - `upstash-redis-token`: Bearer authentication token for Upstash Redis.
   - `whatsapp-token`: Meta WhatsApp Cloud API System User Access Token.
   - `whatsapp-app-secret`: Meta App Secret for `X-Hub-Signature-256` verification and webhook auto-registration.
   - `whatsapp-verify-token`: Auto-generated 32-character webhook verification token.
   - `whatsapp-phone-number-id`: Configured Phone Number ID (or `"auto"` for automatic discovery via incoming webhooks / Meta Graph API).

### Local Secret Manager Sync
Any custom configuration placed in `agents/coffee-assistant/.env` can be synced to GCP Secret Manager:

```bash
# Sync agent secrets (API keys, custom variables; skips local-only flags like RATE_LIMIT_ENABLED)
make sync-secrets
```

### Upstash Redis Rate Limiting
The agent incorporates `UpstashRateLimitPlugin` implementing a sliding window algorithm:
```python
# agents/coffee-assistant/app/agent.py
rate_limiter = UpstashRateLimitPlugin(
    max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "50")),
    window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "86400")),
    enabled=RATE_LIMIT_ENABLED,
)
```
Set `RATE_LIMIT_ENABLED=false` in `agents/coffee-assistant/.env` to disable rate limiting during local development. In production, if limits are exceeded, a polite fallback message is returned without consuming model tokens.

---

## ☁️ Production Deployment

The project provides automated commands to provision infrastructure on GCP, Neon, and Upstash, deploy the MCP Toolbox and WhatsApp channel to Cloud Run, deploy the agent to Vertex AI, and publish the web app to Cloudflare Workers.

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
- Enables all required APIs (Vertex AI, Cloud Run, Identity Toolkit, Secret Manager, Cloud Build, BigQuery, etc.).
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

### 2. Full Core Deployment (Infra + DB + Agent + Web)

To provision all infrastructure (including MCP Toolbox, Neon, Upstash, and Identity Platform), push the Drizzle schema to Neon, deploy the Agent to Vertex AI, and publish the Web UI to Cloudflare Workers in one command:

```bash
make deploy-all
```

To also deploy the optional WhatsApp Cloud API channel to Cloud Run and auto-register the Meta webhook:

```bash
make deploy-whatsapp
```

Or step-by-step:
1. **Infrastructure (`make infra`)**: Provisions GCP (Vertex AI, Identity Platform, private MCP Toolbox on Cloud Run), Neon Postgres, and Upstash Redis.
2. **Database Schema & Seed (`make db-neon-push` / `make db-neon-seed`)**: Pushes Drizzle schema and seeds initial data on Neon.
3. **Update MCP Toolbox (`make deploy-toolbox`)**: Fast targeted Terraform apply whenever `mcp/mcp-toolbox/tools.yaml` changes.
4. **Secrets Sync (`make sync-secrets`)**: Syncs environment variables into GCP Secret Manager.
5. **Agent Deployment (`make deploy-agent`)**: Packages and deploys the agent to Vertex AI Agent Runtime with bound secrets (including `TOOLBOX_URL`).
6. **Web Deployment (`make deploy-web`)**: Builds and deploys the frontend to Cloudflare Workers, automatically injecting `AGENT_RUNTIME_API_URL`, `GCP_SA_KEY_JSON`, `DATABASE_URL`, `GCP_IDENTITY_API_KEY`, and `GCP_PROJECT_ID`.
7. **WhatsApp Deployment (`make deploy-whatsapp`)**: Builds the container via Cloud Build, deploys to Cloud Run, auto-discovers Meta `App ID` / `WABA ID` / `Phone Number ID`, and registers the webhook URL + WABA subscription.

---

## 📋 Makefile Commands Reference

| Command | Category | Description |
|---------|----------|-------------|
| `make dev-all` | Local Dev | Quick start: run Postgres (Docker + push/seed), MCP Toolbox (5000), Agent API (8080), and Web UI together |
| `make dev` | Local Dev | Quick start: run Agent API (8080) + Web Dashboard together |
| `make dev-agent` | Local Dev | Run local agent playground with `agents-cli` |
| `make dev-agent-api` | Local Dev | Run only local agent FastAPI server on port 8080 |
| `make dev-web` | Local Dev | Run only Vite + Hono frontend development server |
| `make install-toolbox` | Local Dev | Download official MCP Toolbox binary for local development |
| `make dev-toolbox` | Local Dev | Run local MCP Toolbox server with `mcp/mcp-toolbox/tools.yaml` (auto-downloads binary if missing) |
| `make dev-db` | Database | Run ephemeral PostgreSQL container with Docker (auto-runs `db-push` & `db-seed`) |
| `make db-push` | Database | Push Drizzle schema to local database |
| `make db-seed` | Database | Seed local database with sample data via TypeScript/Drizzle |
| `make db-studio` | Database | Open Drizzle Studio visualizer in browser |
| `make get-db-secret` | Database | Fetch pooled `DATABASE_URL` from GCP Secret Manager |
| `make db-neon-migrate` | Database | Run Drizzle migrations against Neon using direct connection |
| `make db-neon-push` | Database | Push Drizzle schema directly to Neon using direct connection |
| `make db-neon-seed` | Database | Seed Neon database with sample data using direct connection |
| `make dev-whatsapp` | Channels | Quick start: start WhatsApp webhook (8001), ngrok tunnel, and auto-register URL in Meta |
| `make dev-whatsapp-tunnel`| Channels | Alias for `make dev-whatsapp` |
| `make dev-whatsapp-server`| Channels | Run only WhatsApp webhook FastAPI server (without ngrok) |
| `make tunnel-whatsapp` | Channels | Run only ngrok tunnel on port 8001 |
| `make infra-init` | Infra | Initialize Terraform providers and backend |
| `make infra-plan` | Infra | Preview infrastructure changes with Terraform |
| `make infra` | Infra | Apply infrastructure (supports `CREATE_PROJECT=true PROJECT_NAME=...` or `PROJECT_ID=...`) |
| `make sync-metadata` | Infra | Sync active Project ID and Reasoning Engine ID to configs |
| `make sync-secrets` | Secrets | Synchronize `agents/coffee-assistant/.env` to GCP Secret Manager |
| `make deploy-toolbox` | Deploy | Deploy or update MCP Toolbox (`tools.yaml` + Cloud Run) via Terraform |
| `make build-whatsapp` | Channels | Build & push WhatsApp container image to Artifact Registry |
| `make deploy-whatsapp` | Channels | Build, deploy WhatsApp webhook to Cloud Run, and auto-configure Meta webhook & WABA |
| `make subscribe-whatsapp-waba` | Channels | Auto-discover Meta WABA, register Cloud Run Webhook URL, and subscribe WABA |
| `make deploy-agent` | Deploy | Deploy agent to Vertex AI Agent Runtime with bound secrets (`TOOLBOX_URL`, Redis, etc.) |
| `make deploy-status` | Deploy | Check deployment progress in Vertex AI Agent Runtime |
| `make deploy-web` | Deploy | Build & deploy web app to Cloudflare Workers with GCP, DB, and Identity secrets |
| `make deploy-all` | Deploy | Execute core pipeline: `infra` -> `db-neon-push` -> `deploy-agent` -> `deploy-web` |
| `make rename` | Tooling | Centralize and rename project across all services and configurations |

---

## 🔄 Using This Template for a New Project (Clone → Rename → Deploy)

You can recreate the entire stack for a brand-new project in four steps:

### 1. Clone the repository
```bash
git clone <REPO_URL> my-assistant
cd my-assistant
```

### 2. Rename the project across all services
```bash
make rename NAME=my-assistant
```

This single command centralizes the naming across:
- **Vertex AI Agent**: `my-assistant` (`my_assistant`) and automatically syncs `uv.lock`
- **Web Dashboard**: `my-assistant-web` (`web/wrangler.jsonc`)
- **Neon Project & Postgres DB**: `my-assistant-db` / `my_assistant_db`
- **MCP Toolbox Service**: `my-assistant-toolbox` and `mcp/mcp-toolbox/tools.yaml`
- **Upstash Redis**: `my-assistant-redis`
- **WhatsApp Webhook**: `my-assistant-whatsapp` and `channels/whatsapp/config.py`
- **Service Accounts**: `my-assistant-whatsapp-sa`, `my-assistant-toolbox-sa`, `my-assistant-web-caller`
- **Configuration Templates**: `infra/vars/env.tfvars(.example)`, `infra/variables.tf`, `Makefile`, and `web/.env(.example)`

### 3. Configure cloud credentials
Copy the template variables file and fill in your **Neon**, **Upstash**, and (optional) **Meta WhatsApp** credentials:
```bash
cp infra/vars/env.tfvars.example infra/vars/env.tfvars
# Edit infra/vars/env.tfvars with your API keys
```
Make sure your CLIs are authenticated (`gcloud auth login`, `gcloud auth application-default login`, and `npx wrangler login`).

### 4. Provision & deploy everything in one command
```bash
# Create a new GCP project automatically and deploy the core stack (infra + Neon schema + agent + web)
make deploy-all CREATE_PROJECT=true

# (Optional) Seed Neon with initial sample data
make db-neon-seed

# (Optional) Deploy the WhatsApp Cloud API webhook to Cloud Run & auto-configure Meta
make deploy-whatsapp
```
> To deploy into an existing GCP project instead, set `project_id` in `infra/vars/env.tfvars` (or pass `PROJECT_ID="your-gcp-project-id"`) and run `make deploy-all`.
>
> `make deploy-all` automatically runs: `infra` → `db-neon-push` → `deploy-agent` → `deploy-web`. For local development, `make dev-toolbox` automatically downloads the official MCP Toolbox binary (`make install-toolbox`) on first run.

---

## 🧪 Testing and Evaluation

### Agent Unit & Integration Tests
Run unit and integration tests covering tools, tenant callbacks, WhatsApp customer auto-registration, and rate limiting:
```bash
cd agents/coffee-assistant
uv run pytest tests/unit tests/integration
```

### WhatsApp Channel Tests
Run unit and integration tests covering Meta webhooks, signature verification, Markdown-to-WhatsApp formatting, media downloading, and ADK client formatting:
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
- **Cloud Trace**: Distributed tracing for model invocations, MCP Toolbox calls, tool executions, and step latency.
- **Cloud Logging & BigQuery**: Structured conversation logging, session persistence, and analytics sinks.
- **Cloud Run Metrics**: Ingress request latencies, instance counts, and health metrics for both the **MCP Toolbox** and **WhatsApp** microservices.

---

## 📄 License

This project is licensed under the Apache 2.0 License. See source file headers for details.
