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

resource "random_id" "project_suffix" {
  count       = var.create_project ? 1 : 0
  byte_length = 3
}

locals {
  # If create_project is true, generate a unique ID: <project_name>-<hex> (max 30 chars per GCP rules)
  generated_project_id = var.create_project ? substr("${var.project_name}-${random_id.project_suffix[0].hex}", 0, 30) : null

  project_id     = var.create_project ? google_project.project[0].project_id : var.project_id
  project_number = var.create_project ? google_project.project[0].number : data.google_project.project[0].number
}

resource "google_project" "project" {
  provider            = google.api_bootstrap
  count               = var.create_project ? 1 : 0
  name                = var.project_name
  project_id          = local.generated_project_id
  billing_account     = var.billing_account
  org_id              = var.org_id
  folder_id           = var.folder_id
  auto_create_network = false
}

# Wait for GCP Resource Manager and Service Usage APIs to settle for the new project
resource "time_sleep" "wait_for_project" {
  count           = var.create_project ? 1 : 0
  create_duration = "10s"
  depends_on      = [google_project.project]
}
