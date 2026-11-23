INFRA_DIR := infra
TF_VARS := vars/env.tfvars
PROJECT_NAME ?= $(shell grep 'project_name' $(INFRA_DIR)/vars/env.tfvars 2>/dev/null | cut -d '"' -f 2 || echo "coffee-assistant")
PROJECT_ID = $(shell terraform -chdir=$(INFRA_DIR) output -raw project_id 2>/dev/null || grep 'project_id' $(INFRA_DIR)/vars/env.tfvars 2>/dev/null | cut -d '"' -f 2 || echo "agentic-ai-path")
REGION := us-east1
AGENT_DIR := agents/coffee-assistant
WEB_DIR := web
CHANNELS_DIR := channels
TOOLBOX_DIR := mcp/mcp-toolbox
WHATSAPP_PORT := 8001

# Ephemeral PostgreSQL configuration derived from PROJECT_NAME
POSTGRES_CONTAINER_NAME ?= $(PROJECT_NAME)-postgres-dev
POSTGRES_PORT ?= 5432
POSTGRES_USER ?= postgres
POSTGRES_PASSWORD ?= postgres
POSTGRES_DB ?= $(subst -,_,$(PROJECT_NAME))_db
POSTGRES_IMAGE ?= postgres:19-alpine
POSTGRES_INIT_DIR ?= $(CURDIR)/infra/postgres-init

# Flags for dynamic project creation
CREATE_PROJECT ?= $(shell grep -E '^[[:space:]]*create_project[[:space:]]*=[[:space:]]*true' $(INFRA_DIR)/vars/env.tfvars >/dev/null 2>&1 && echo "true" || echo "false")

# Auto-detect if project is already managed by Terraform in the current state
STATE_HAS_PROJECT := $(shell terraform -chdir=$(INFRA_DIR) state list 2>/dev/null | grep -q 'google_project.project' && echo "true" || echo "false")
ifeq ($(STATE_HAS_PROJECT),true)
  CREATE_PROJECT := true
endif

TFVARS_BILLING_ACCOUNT := $(shell grep -E '^[[:space:]]*billing_account[[:space:]]*=' $(INFRA_DIR)/vars/env.tfvars 2>/dev/null | cut -d '"' -f 2)
BILLING_ACCOUNT ?= $(shell if [ -n "$(TFVARS_BILLING_ACCOUNT)" ]; then echo "$(TFVARS_BILLING_ACCOUNT)"; else gcloud billing accounts list --filter="open=true" --format="value(ACCOUNT_ID)" --limit=1 2>/dev/null; fi)

TF_EXTRA_ARGS :=
ifeq ($(filter $(CREATE_PROJECT),true 1 yes),$(CREATE_PROJECT))
  TF_EXTRA_ARGS += -var="create_project=true"
  ifneq ($(strip $(BILLING_ACCOUNT)),)
    TF_EXTRA_ARGS += -var="billing_account=$(BILLING_ACCOUNT)"
  endif
endif

ifeq ($(origin PROJECT_NAME),command line)
  TF_EXTRA_ARGS += -var="project_name=$(PROJECT_NAME)"
endif
WHATSAPP_SERVICE_NAME := $(PROJECT_NAME)-whatsapp
WHATSAPP_IMAGE_TAG = $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(WHATSAPP_SERVICE_NAME)/webhook:latest

.PHONY: help infra-init infra-plan infra sync-metadata sync-secrets build-whatsapp deploy-whatsapp subscribe-whatsapp-waba deploy-agent deploy-web deploy-status deploy-all dev dev-whatsapp dev-whatsapp-server dev-whatsapp-tunnel tunnel-whatsapp dev-agent dev-agent-api dev-web dev-toolbox dev-db db-push db-studio db-seed db-neon-migrate db-neon-push db-neon-seed rename

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

infra-init: ## Initialize Terraform in infra/
	terraform -chdir=$(INFRA_DIR) init

infra-plan: ## Preview infrastructure changes in GCP
	terraform -chdir=$(INFRA_DIR) plan -var-file="$(TF_VARS)" $(TF_EXTRA_ARGS)

infra: infra-init ## Apply Terraform infrastructure and sync Agent Runtime ID
	terraform -chdir=$(INFRA_DIR) apply -var-file="$(TF_VARS)" $(TF_EXTRA_ARGS)
	@$(MAKE) sync-metadata

sync-metadata: ## Sync agent_runtime_resource_name and project_id from Terraform
	@CURRENT_PROJECT_ID=$$(terraform -chdir=$(INFRA_DIR) output -raw project_id 2>/dev/null || true); \
	if [ -n "$$CURRENT_PROJECT_ID" ]; then \
		echo "✓ Active Project ID: $$CURRENT_PROJECT_ID"; \
		gcloud config set project "$$CURRENT_PROJECT_ID" 2>/dev/null || true; \
		if [ -f "$(INFRA_DIR)/vars/env.tfvars" ]; then \
			if grep -q '^[# ]*project_id[ ]*=' $(INFRA_DIR)/vars/env.tfvars; then \
				sed -i -E "s/^[# ]*project_id[ ]*=.*/project_id = \"$$CURRENT_PROJECT_ID\"/" $(INFRA_DIR)/vars/env.tfvars; \
			else \
				echo "project_id = \"$$CURRENT_PROJECT_ID\"" >> $(INFRA_DIR)/vars/env.tfvars; \
			fi; \
			if [ "$(CREATE_PROJECT)" = "true" ] || [ "$(STATE_HAS_PROJECT)" = "true" ]; then \
				sed -i -E 's/^[# ]*create_project[ ]*=.*/create_project  = true/' $(INFRA_DIR)/vars/env.tfvars; \
				if [ -n "$(BILLING_ACCOUNT)" ]; then \
					sed -i -E "s/^[# ]*billing_account[ ]*=.*/billing_account = \"$(BILLING_ACCOUNT)\"/" $(INFRA_DIR)/vars/env.tfvars; \
				fi; \
			fi; \
			echo "✓ Synchronized project_id in $(INFRA_DIR)/vars/env.tfvars: $$CURRENT_PROJECT_ID"; \
		fi; \
		if [ -f "$(AGENT_DIR)/.env" ]; then \
			sed -i -E "s/^[# ]*GOOGLE_CLOUD_PROJECT[ ]*=.*/GOOGLE_CLOUD_PROJECT=$$CURRENT_PROJECT_ID/" $(AGENT_DIR)/.env; \
			echo "✓ Synchronized GOOGLE_CLOUD_PROJECT in $(AGENT_DIR)/.env: $$CURRENT_PROJECT_ID"; \
		fi; \
	fi
	@ENGINE_ID=$$(terraform -chdir=$(INFRA_DIR) output -raw agent_runtime_resource_name 2>/dev/null || true); \
	if [ -n "$$ENGINE_ID" ]; then \
		case "$$ENGINE_ID" in \
			projects/*) FULL_ID="$$ENGINE_ID" ;; \
			*) FULL_ID="projects/$(PROJECT_ID)/locations/$(REGION)/reasoningEngines/$$ENGINE_ID" ;; \
		esac; \
		printf '{\n  "remote_agent_runtime_id": "%s",\n  "deployment_target": "agent_runtime",\n  "is_a2a": true,\n  "agent_directory": "app"\n}\n' "$$FULL_ID" > $(AGENT_DIR)/deployment_metadata.json; \
		echo "✓ Synchronized remote_agent_runtime_id: $$FULL_ID"; \
	else \
		echo "⚠️  No agent_runtime_resource_name output found in Terraform."; \
	fi

SECRETS_FILE := $(AGENT_DIR)/.secrets_args

sync-secrets: ## Sync all variables from $(AGENT_DIR)/.env into GCP Secret Manager
	@python3 $(INFRA_DIR)/sync_secrets.py $(AGENT_DIR)/.env $(PROJECT_ID) $(SECRETS_FILE)

deploy-agent: sync-metadata sync-secrets ## Package and deploy chat-assistant agent to Agent Runtime
	@SECRETS_ARG=""; \
	if [ -f $(SECRETS_FILE) ] && [ -s $(SECRETS_FILE) ]; then \
		SECRETS_ARG="--secrets $$(cat $(SECRETS_FILE))"; \
	fi; \
	cd $(AGENT_DIR) && agents-cli deploy \
		--project $(PROJECT_ID) \
		--region $(REGION) \
		--no-confirm-project \
		$$SECRETS_ARG

deploy-web: ## Install dependencies if missing, deploy web/, and configure GCP secrets in Cloudflare
	@[ -d $(WEB_DIR)/node_modules ] || (cd $(WEB_DIR) && pnpm install)
	cd $(WEB_DIR) && pnpm run deploy
	@API_URL=$$(terraform -chdir=$(INFRA_DIR) output -raw agent_runtime_api_url); \
	cd $(WEB_DIR) && printf "%s" "$$API_URL" | npx wrangler secret put AGENT_RUNTIME_API_URL
	@terraform -chdir=$(INFRA_DIR) output -raw web_caller_sa_key_json | \
		(cd $(WEB_DIR) && npx wrangler secret put GCP_SA_KEY_JSON)
	@DB_URL=$$(terraform -chdir=$(INFRA_DIR) output -raw neon_database_url_pooled 2>/dev/null || echo ""); \
	if [ -n "$$DB_URL" ]; then \
		printf "%s" "$$DB_URL" | (cd $(WEB_DIR) && npx wrangler secret put DATABASE_URL); \
		echo "✓ DATABASE_URL configured in Cloudflare Workers"; \
	fi
	@IDENTITY_KEY=$$(terraform -chdir=$(INFRA_DIR) output -raw gcp_identity_api_key 2>/dev/null || echo ""); \
	if [ -n "$$IDENTITY_KEY" ]; then \
		printf "%s" "$$IDENTITY_KEY" | (cd $(WEB_DIR) && npx wrangler secret put GCP_IDENTITY_API_KEY); \
		printf "%s" "$(PROJECT_ID)" | (cd $(WEB_DIR) && npx wrangler secret put GCP_PROJECT_ID); \
		echo "✓ GCP_IDENTITY_API_KEY and GCP_PROJECT_ID configured in Cloudflare Workers"; \
	fi

build-whatsapp: ## Build and push WhatsApp webhook container image to Artifact Registry
	@echo "Building WhatsApp container image via Cloud Build..."
	gcloud builds submit $(CHANNELS_DIR) --tag $(WHATSAPP_IMAGE_TAG) --project $(PROJECT_ID)

deploy-whatsapp: build-whatsapp ## Build, deploy WhatsApp webhook to Cloud Run, and auto-configure Meta webhook & WABA (from GCP Secret Manager)
	@echo "Deploying WhatsApp service to Cloud Run..."
	gcloud run deploy $(WHATSAPP_SERVICE_NAME) \
		--image $(WHATSAPP_IMAGE_TAG) \
		--region $(REGION) \
		--project $(PROJECT_ID)
	@echo "✓ WhatsApp webhook successfully deployed to Cloud Run!"
	@WEBHOOK_URL=$$(terraform -chdir=$(INFRA_DIR) output -raw whatsapp_webhook_url 2>/dev/null || echo "$$(gcloud run services describe $(WHATSAPP_SERVICE_NAME) --region $(REGION) --project $(PROJECT_ID) --format 'value(status.url)')/webhooks/whatsapp"); \
	VERIFY_TOKEN=$$(terraform -chdir=$(INFRA_DIR) output -raw whatsapp_verify_token 2>/dev/null || echo ""); \
	echo "Webhook Callback URL: $$WEBHOOK_URL"; \
	cd $(CHANNELS_DIR) && WHATSAPP_IGNORE_DOTENV=1 uv run python -m whatsapp.subscribe_waba --from-gcp --project-id "$(PROJECT_ID)" --webhook-url "$$WEBHOOK_URL" --verify-token "$$VERIFY_TOKEN"

subscribe-whatsapp-waba: ## Auto-discover Meta WABA, register Cloud Run Webhook URL, and subscribe WABA (from GCP Secret Manager)
	@WEBHOOK_URL=$$(terraform -chdir=$(INFRA_DIR) output -raw whatsapp_webhook_url 2>/dev/null || echo ""); \
	VERIFY_TOKEN=$$(terraform -chdir=$(INFRA_DIR) output -raw whatsapp_verify_token 2>/dev/null || echo ""); \
	cd $(CHANNELS_DIR) && WHATSAPP_IGNORE_DOTENV=1 uv run python -m whatsapp.subscribe_waba --from-gcp --project-id "$(PROJECT_ID)" --webhook-url "$$WEBHOOK_URL" --verify-token "$$VERIFY_TOKEN"

deploy-status: ## Check the status of an ongoing deployment in Agent Runtime
	cd $(AGENT_DIR) && agents-cli deploy --status

deploy-all: infra deploy-agent deploy-web deploy-whatsapp ## Provision infra and deploy agent, web, and WhatsApp

dev: ## Quick start: Run Agent API (8080) + Web Dashboard (3000) together
	@echo "==> Starting Agent API (port 8080) and Web Dashboard (port 3000)..."
	@(cd $(AGENT_DIR) && uv run uvicorn app.fast_api_app:app --host 0.0.0.0 --port 8080 --reload) & \
	AGENT_PID=$$!; \
	trap 'kill $$AGENT_PID 2>/dev/null || true' INT TERM EXIT; \
	cd $(WEB_DIR) && pnpm dev

dev-agent: ## Run local agent playground
	cd $(AGENT_DIR) && agents-cli playground

dev-agent-api: ## [Debug] Run only local agent FastAPI backend on port 8080
	cd $(AGENT_DIR) && uv run uvicorn app.fast_api_app:app --host 0.0.0.0 --port 8080 --reload

dev-web: ## [Debug] Run only web/ development server
	cd $(WEB_DIR) && pnpm dev

dev-toolbox: ## Run local MCP Toolbox server with tools.yaml
	cd $(TOOLBOX_DIR) && ./toolbox --config "tools.yaml"

dev-db: ## Run an ephemeral PostgreSQL container with Docker, auto-run db-push & db-seed (stops and removes on Ctrl+C)
	@echo "Starting ephemeral PostgreSQL container on port $(POSTGRES_PORT)..."
	@echo "Database: $(POSTGRES_DB) | User: $(POSTGRES_USER) | Password: $(POSTGRES_PASSWORD)"
	@echo "Connection URL: postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(POSTGRES_PORT)/$(POSTGRES_DB)"
	@echo "Seed data directory: $(POSTGRES_INIT_DIR)"
	@echo "Press Ctrl+C to stop and remove container."
	@docker rm -f $(POSTGRES_CONTAINER_NAME) 2>/dev/null || true
	@( \
		until docker exec $(POSTGRES_CONTAINER_NAME) pg_isready -h localhost -U $(POSTGRES_USER) -d $(POSTGRES_DB) >/dev/null 2>&1; do \
			sleep 1; \
		done; \
		sleep 1; \
		echo "==> PostgreSQL is ready! Running db-push and db-seed..."; \
		cd $(WEB_DIR) && pnpm run db:push && pnpm run db:seed; \
	) & \
	INIT_PID=$$!; \
	trap 'kill $$INIT_PID 2>/dev/null || true; docker stop $(POSTGRES_CONTAINER_NAME) >/dev/null 2>&1 || true' INT TERM EXIT; \
	docker run --rm --name $(POSTGRES_CONTAINER_NAME) \
		-e POSTGRES_USER=$(POSTGRES_USER) \
		-e POSTGRES_PASSWORD=$(POSTGRES_PASSWORD) \
		-e POSTGRES_DB=$(POSTGRES_DB) \
		-v $(POSTGRES_INIT_DIR):/docker-entrypoint-initdb.d:ro \
		-p $(POSTGRES_PORT):5432 \
		$(POSTGRES_IMAGE)

db-push: ## Push Drizzle schema to database
	cd $(WEB_DIR) && pnpm run db:push

db-seed: ## Seed database with sample data via TypeScript/Drizzle
	cd $(WEB_DIR) && pnpm run db:seed

db-studio: ## Open Drizzle Studio in browser
	cd $(WEB_DIR) && pnpm run db:studio

get-db-secret: ## Print the pooled DATABASE_URL from GCP Secret Manager
	@gcloud secrets versions access latest --secret=database-url --project=$$(terraform -chdir=$(INFRA_DIR) output -raw project_id 2>/dev/null || echo $(PROJECT_ID))

db-neon-migrate: ## Run Drizzle migrations against Neon using direct connection from Secret Manager
	@echo "==> Running Drizzle migrations against Neon..."
	@DB_DIRECT_URL=$$(gcloud secrets versions access latest --secret=database-url-direct --project=$$(terraform -chdir=$(INFRA_DIR) output -raw project_id 2>/dev/null || echo $(PROJECT_ID))); \
	cd $(WEB_DIR) && DATABASE_URL="$$DB_DIRECT_URL" pnpm exec drizzle-kit migrate

db-neon-push: ## Push Drizzle schema directly to Neon using direct connection from Secret Manager
	@echo "==> Pushing Drizzle schema directly to Neon..."
	@DB_DIRECT_URL=$$(gcloud secrets versions access latest --secret=database-url-direct --project=$$(terraform -chdir=$(INFRA_DIR) output -raw project_id 2>/dev/null || echo $(PROJECT_ID))); \
	cd $(WEB_DIR) && DATABASE_URL="$$DB_DIRECT_URL" pnpm exec drizzle-kit push

db-neon-seed: ## Seed Neon database with sample data using direct connection from Secret Manager
	@echo "==> Seeding Neon database..."
	@DB_DIRECT_URL=$$(gcloud secrets versions access latest --secret=database-url-direct --project=$$(terraform -chdir=$(INFRA_DIR) output -raw project_id 2>/dev/null || echo $(PROJECT_ID))); \
	cd $(WEB_DIR) && DATABASE_URL="$$DB_DIRECT_URL" pnpm run db:seed

dev-whatsapp: ## Quick start: Run WhatsApp webhook + ngrok tunnel + auto-register URL in Meta
	@echo "Starting WhatsApp webhook server and ngrok tunnel on port $(WHATSAPP_PORT)..."; \
	(cd $(CHANNELS_DIR) && uv run uvicorn whatsapp.main:app --host 0.0.0.0 --port $(WHATSAPP_PORT) --reload) & \
	SERVER_PID=$$!; \
	(sleep 3 && cd $(CHANNELS_DIR) && uv run python -m whatsapp.subscribe_waba --auto-ngrok) & \
	SUB_PID=$$!; \
	trap 'kill $$SERVER_PID $$SUB_PID 2>/dev/null || true' INT TERM EXIT; \
	sleep 1; \
	ngrok http $(WHATSAPP_PORT)

dev-whatsapp-server: ## [Debug] Run only WhatsApp webhook FastAPI server (without ngrok)
	cd $(CHANNELS_DIR) && uv run uvicorn whatsapp.main:app --host 0.0.0.0 --port $(WHATSAPP_PORT) --reload

tunnel-whatsapp: ## [Debug] Run only ngrok tunnel on port $(WHATSAPP_PORT)
	ngrok http $(WHATSAPP_PORT)

dev-whatsapp-tunnel: dev-whatsapp ## Alias for dev-whatsapp

rename: ## Centralize and rename project across all services (usage: make rename NAME=my-agent)
	@if [ -z "$(NAME)" ]; then \
		echo "❌ Usage: make rename NAME=my-agent"; \
		exit 1; \
	fi
	@NEW_NAME="$(NAME)"; \
	SNAKE_NAME=$$(echo "$$NEW_NAME" | tr '-' '_'); \
	NEW_WEB_NAME="$$NEW_NAME-web"; \
	NEW_DB_NAME="$${SNAKE_NAME}_db"; \
	OLD_DIR="$(AGENT_DIR)"; \
	OLD_NAME=$$(basename "$$OLD_DIR"); \
	OLD_SNAKE=$$(echo "$$OLD_NAME" | tr '-' '_'); \
	NEW_DIR="agents/$$NEW_NAME"; \
	echo "==> Centralizing and renaming project from '$$OLD_NAME' to '$$NEW_NAME'..."; \
	sed -i "s/project_name = \".*\"/project_name = \"$$NEW_NAME\"/" $(INFRA_DIR)/vars/env.tfvars; \
	sed -i "s/default     = \"$$OLD_NAME\"/default     = \"$$NEW_NAME\"/" $(INFRA_DIR)/variables.tf; \
	sed -i "s/service_name=\\\"$$OLD_NAME\\\"/service_name=\\\"$$NEW_NAME\\\"/" $(INFRA_DIR)/variables.tf; \
	sed -i "s/^name: .*/name: $$NEW_NAME/" "$$OLD_DIR/agents-cli-manifest.yaml" 2>/dev/null || true; \
	sed -i "s/root_agent_name: .*/root_agent_name: $$SNAKE_NAME/" "$$OLD_DIR/agents-cli-manifest.yaml" 2>/dev/null || true; \
	sed -i "s/^name = \".*\"/name = \"$$NEW_NAME\"/" "$$OLD_DIR/pyproject.toml" 2>/dev/null || true; \
	sed -i "s/name=\"$$OLD_SNAKE\"/name=\"$$SNAKE_NAME\"/" "$$OLD_DIR/app/agent.py" 2>/dev/null || true; \
	sed -i "s/app.title = \".*\"/app.title = \"$$NEW_NAME\"/" "$$OLD_DIR/app/fast_api_app.py" 2>/dev/null || true; \
	sed -i "s/Agent $$OLD_NAME/Agent $$NEW_NAME/" "$$OLD_DIR/app/fast_api_app.py" 2>/dev/null || true; \
	sed -i "s/\"name\": \".*\"/\"name\": \"$$NEW_WEB_NAME\"/" $(WEB_DIR)/wrangler.jsonc; \
	if [ -f "$(WEB_DIR)/.env" ]; then \
		sed -i -E "s|localhost:5432/[a-zA-Z0-9_]+|localhost:5432/$$NEW_DB_NAME|" $(WEB_DIR)/.env; \
	fi; \
	if [ -f "$(WEB_DIR)/.env.example" ]; then \
		sed -i -E "s|localhost:5432/[a-zA-Z0-9_]+|localhost:5432/$$NEW_DB_NAME|" $(WEB_DIR)/.env.example; \
	fi; \
	if [ "$$OLD_DIR" != "$$NEW_DIR" ]; then \
		mv "$$OLD_DIR" "$$NEW_DIR"; \
		sed -i "s|^AGENT_DIR := .*|AGENT_DIR := $$NEW_DIR|" Makefile; \
	fi; \
	rm -f "$$NEW_DIR/deployment_metadata.json"; \
	echo "✓ Project name centralized to: '$$NEW_NAME'"; \
	echo "  • Vertex AI Agent:    $$NEW_NAME ($$SNAKE_NAME)"; \
	echo "  • Web Dashboard:      $$NEW_WEB_NAME"; \
	echo "  • Neon Project:       $$NEW_NAME-db"; \
	echo "  • Neon / Postgres DB: $$NEW_DB_NAME"; \
	echo "  • Upstash Redis:      $$NEW_NAME-redis"; \
	echo "  • WhatsApp Webhook:   $$NEW_NAME-whatsapp"; \
	echo "  • Service Accounts:   $$NEW_NAME-whatsapp-sa, $$NEW_NAME-web-caller"
