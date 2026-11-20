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

# 1. Upstash Redis Database for Rate Limiting / Session Caching
resource "upstash_redis_database" "coffee_redis" {
  database_name  = "${var.project_name}-redis"
  region         = "global"
  primary_region = var.upstash_primary_region
  tls            = true
}

# 2. Store REST URL in GCP Secret Manager
resource "google_secret_manager_secret" "upstash_redis_url" {
  secret_id = "upstash-redis-url"
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "upstash_redis_url_val" {
  secret      = google_secret_manager_secret.upstash_redis_url.id
  secret_data = "https://${upstash_redis_database.coffee_redis.endpoint}"
}

# 3. Store REST Token in GCP Secret Manager
resource "google_secret_manager_secret" "upstash_redis_token" {
  secret_id = "upstash-redis-token"
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "upstash_redis_token_val" {
  secret      = google_secret_manager_secret.upstash_redis_token.id
  secret_data = upstash_redis_database.coffee_redis.rest_token
}

# Outputs
output "upstash_redis_endpoint" {
  description = "Upstash Redis REST endpoint URL"
  value       = "https://${upstash_redis_database.coffee_redis.endpoint}"
}

output "upstash_redis_rest_token" {
  description = "Upstash Redis REST token"
  value       = upstash_redis_database.coffee_redis.rest_token
  sensitive   = true
}
