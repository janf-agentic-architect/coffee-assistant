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

# Configure Google Cloud Identity Platform with Email/Password and Anonymous auth
resource "google_identity_platform_config" "default" {
  project                    = local.project_id
  autodelete_anonymous_users = true

  sign_in {
    allow_duplicate_emails = false

    anonymous {
      enabled = true
    }

    email {
      enabled           = true
      password_required = true
    }
  }

  depends_on = [google_project_service.services]
}

# Create a dedicated API Key for GCP Identity Platform Client / REST Auth
resource "google_apikeys_key" "identity_web_key" {
  name         = "${var.project_name}-identity-web-key"
  display_name = "GCP Identity Platform Web API Key (${var.project_name})"
  project      = local.project_id

  restrictions {
    api_targets {
      service = "identitytoolkit.googleapis.com"
    }
    api_targets {
      service = "securetoken.googleapis.com"
    }
  }

  depends_on = [
    google_project_service.services,
    google_identity_platform_config.default,
  ]
}

# Store the Identity Platform Web API Key in GCP Secret Manager
resource "google_secret_manager_secret" "gcp_identity_api_key" {
  secret_id = "gcp-identity-api-key"
  project   = local.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "gcp_identity_api_key_version" {
  secret      = google_secret_manager_secret.gcp_identity_api_key.id
  secret_data = google_apikeys_key.identity_web_key.key_string
}

output "gcp_identity_api_key" {
  description = "Google Cloud Identity Platform Web API Key"
  value       = google_apikeys_key.identity_web_key.key_string
  sensitive   = true
}

output "gcp_identity_auth_domain" {
  description = "Google Cloud Identity Platform Auth Domain"
  value       = "${local.project_id}.firebaseapp.com"
}
