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

variable "toolbox_image" {
  type        = string
  description = "Official MCP Toolbox for Databases container image"
  default     = "us-central1-docker.pkg.dev/database-toolbox/toolbox/toolbox:1.18.0"
}

# Store tools.yaml in Secret Manager and mount it in Cloud Run
resource "google_secret_manager_secret" "toolbox_tools_yaml" {
  secret_id = "toolbox-tools-yaml"
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "toolbox_tools_yaml_val" {
  secret      = google_secret_manager_secret.toolbox_tools_yaml.id
  secret_data = file("${path.module}/../mcp/mcp-toolbox/tools.yaml")
}

# Dedicated Service Account for MCP Toolbox Cloud Run service
resource "google_service_account" "toolbox_sa" {
  account_id   = "${var.project_name}-toolbox-sa"
  display_name = "Cloud Run MCP Toolbox SA for ${var.project_name}"
  project      = local.project_id
  depends_on   = [google_project_service.services]
}

resource "google_project_iam_member" "toolbox_sa_secrets" {
  project = local.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.toolbox_sa.email}"
}

resource "google_project_iam_member" "toolbox_sa_logging" {
  project = local.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.toolbox_sa.email}"
}

# Private Cloud Run v2 Service hosting MCP Toolbox for Databases
resource "google_cloud_run_v2_service" "toolbox" {
  name     = "${var.project_name}-toolbox"
  location = var.region
  project  = local.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.toolbox_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    volumes {
      name = "toolbox-config"
      secret {
        secret = google_secret_manager_secret.toolbox_tools_yaml.secret_id
        items {
          version = "latest"
          path    = "tools.yaml"
        }
      }
    }

    containers {
      image = var.toolbox_image

      args = [
        "--config",
        "/app/tools.yaml",
        "--address",
        "0.0.0.0",
        "--port",
        "8080",
        "--disable-reload",
        "--disable-version-check",
      ]

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }

      volume_mounts {
        name       = "toolbox-config"
        mount_path = "/app"
      }

      env {
        name  = "POSTGRES_HOST"
        value = neon_project.coffee_db.database_host_pooler
      }
      env {
        name  = "POSTGRES_PORT"
        value = "5432"
      }
      env {
        name  = "POSTGRES_DB"
        value = neon_database.coffee_orders.name
      }
      env {
        name  = "POSTGRES_USER"
        value = neon_project.coffee_db.database_user
      }
      env {
        name  = "POSTGRES_SSLMODE"
        value = "require"
      }
      env {
        name = "POSTGRES_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.postgres_password.secret_id
            version = "latest"
          }
        }
      }
      # Trigger a new Cloud Run revision whenever tools.yaml changes
      env {
        name  = "TOOLS_YAML_HASH"
        value = filesha256("${path.module}/../mcp/mcp-toolbox/tools.yaml")
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.services,
    google_secret_manager_secret_version.toolbox_tools_yaml_val,
    google_secret_manager_secret_version.postgres_password_val,
    google_project_iam_member.toolbox_sa_secrets,
    google_project_iam_member.toolbox_sa_logging,
  ]
}

# Allow only Agent Runtime identities to invoke the private MCP Toolbox service
resource "google_cloud_run_v2_service_iam_member" "toolbox_agent_identity_invoker" {
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.toolbox.name
  role     = "roles/run.invoker"
  member   = "principal://${google_vertex_ai_reasoning_engine.app.spec[0].effective_identity}"
}

resource "google_cloud_run_v2_service_iam_member" "toolbox_vertex_sa_invoker" {
  project  = local.project_id
  location = var.region
  name     = google_cloud_run_v2_service.toolbox.name
  role     = "roles/run.invoker"
  member   = google_project_service_identity.vertex_sa.member
}

# Store MCP Toolbox Cloud Run URL in Secret Manager for Agent Runtime deployment
resource "google_secret_manager_secret" "toolbox_url" {
  secret_id = "toolbox-url"
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "toolbox_url_val" {
  secret      = google_secret_manager_secret.toolbox_url.id
  secret_data = google_cloud_run_v2_service.toolbox.uri
}

output "toolbox_url" {
  description = "Private Cloud Run URL for MCP Toolbox for Databases"
  value       = google_cloud_run_v2_service.toolbox.uri
}
