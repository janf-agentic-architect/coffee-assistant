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

# 1. Neon Project (creates default branch, endpoint, role and credentials)
resource "neon_project" "coffee_db" {
  name                      = "${var.project_name}-db"
  org_id                    = var.neon_org_id
  pg_version                = 17
  region_id                 = var.neon_region
  history_retention_seconds = var.neon_history_retention_seconds # Free tier max is 21600 (6 hours)
  store_password            = "yes" # Required to store generated password in state & Secret Manager
}

# 2. Application Database on the default branch
resource "neon_database" "coffee_orders" {
  project_id = neon_project.coffee_db.id
  branch_id  = neon_project.coffee_db.default_branch_id
  name       = "${replace(var.project_name, "-", "_")}_db"
  owner_name = neon_project.coffee_db.database_user
}

locals {
  # Direct connection (for DDL schema migrations)
  neon_database_url_direct = "postgresql://${neon_project.coffee_db.database_user}:${neon_project.coffee_db.database_password}@${neon_project.coffee_db.database_host}/${neon_database.coffee_orders.name}?sslmode=require"

  # Pooled connection (with PgBouncer for Serverless/Workers runtime)
  neon_database_url_pooled = "postgresql://${neon_project.coffee_db.database_user}:${neon_project.coffee_db.database_password}@${neon_project.coffee_db.database_host_pooler}/${neon_database.coffee_orders.name}?sslmode=require"
}

# 3. Store Pooled Database URL in GCP Secret Manager (for Web / Serverless apps)
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "database_url_val" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = local.neon_database_url_pooled
}

# 4. Store Direct Database URL in GCP Secret Manager (for DDL Migrations)
resource "google_secret_manager_secret" "database_url_direct" {
  secret_id = "database-url-direct"
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "database_url_direct_val" {
  secret      = google_secret_manager_secret.database_url_direct.id
  secret_data = local.neon_database_url_direct
}

# Outputs
output "neon_project_id" {
  description = "Neon Project ID"
  value       = neon_project.coffee_db.id
}

output "neon_database_url_pooled" {
  description = "Connection URI for application / serverless (with PgBouncer pooler)"
  value       = local.neon_database_url_pooled
  sensitive   = true
}

output "neon_database_url_direct" {
  description = "Connection URI for DDL migrations"
  value       = local.neon_database_url_direct
  sensitive   = true
}
