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

variable "project_name" {
  type        = string
  description = "Project name used as a base for resource naming"
  default     = "coffee-assistant"
}

variable "project_id" {
  type        = string
  description = "Google Cloud Project ID for resource deployment. Ignored if create_project is true."
  default     = null
}

variable "create_project" {
  type        = bool
  description = "Whether to create a new Google Cloud Project automatically"
  default     = false
}

variable "billing_account" {
  type        = string
  description = "The billing account ID to associate with the new project (required if create_project is true)"
  default     = null
}

variable "org_id" {
  type        = string
  description = "The organization ID for the new project. Optional."
  default     = null
}

variable "folder_id" {
  type        = string
  description = "The folder ID for the new project. Optional."
  default     = null
}

variable "region" {
  type        = string
  description = "Google Cloud region for resource deployment."
  default     = "us-east1"
}

variable "telemetry_logs_filter" {
  type        = string
  description = "Log Sink filter for capturing telemetry data. Captures logs with the `traceloop.association.properties.log_type` attribute set to `tracing`."
  default     = "labels.service_name=\"chat-assistant\" labels.type=\"agent_telemetry\""
}

variable "app_sa_roles" {
  description = "List of roles to assign to the application service account"
  type        = list(string)
  default = [

    "roles/aiplatform.user",
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
    "roles/storage.admin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/secretmanager.secretAccessor",
  ]
}

variable "agent_framework" {
  description = "Framework label on the Agent Runtime deployment. The Google Cloud console reads it to pick a playground; override it when the container is not an ADK app."
  type        = string
  default     = "google-adk"
}

variable "agent_identity_roles" {
  description = "List of roles to assign to the agent's Agent Identity principal. Keep the first six in sync with AGENT_IDENTITY_ROLES in agents-cli, which `agents-cli deploy` grants."
  type        = list(string)
  default = [
    "roles/aiplatform.user",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/browser",
    "roles/cloudapiregistry.viewer",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
    "roles/secretmanager.secretAccessor",
  ]
}

variable "neon_api_key" {
  description = "API Key for provisioning resources in Neon. Can also be set via NEON_API_KEY env var."
  type        = string
  default     = null
  sensitive   = true
}

variable "neon_org_id" {
  description = "Organization ID for Neon Lakebase Postgres (required if account belongs to an organization)"
  type        = string
  default     = null
}

variable "neon_region" {
  description = "Cloud region for Neon Lakebase Postgres (e.g. aws-us-east-1, aws-us-east-2, aws-eu-central-1)"
  type        = string
  default     = "aws-us-east-1"
}

variable "upstash_email" {
  description = "Email address for Upstash account"
  type        = string
  default     = null
  sensitive   = true
}

variable "upstash_api_key" {
  description = "Management API Key for provisioning Upstash Redis (from Upstash Console > Account > API Key)"
  type        = string
  default     = null
  sensitive   = true
}

variable "upstash_primary_region" {
  description = "Primary region for Upstash Redis Global database (e.g. us-east-1, us-west-1, eu-central-1)"
  type        = string
  default     = "us-east-1"
}

variable "neon_history_retention_seconds" {
  description = "History retention in seconds for Point-in-Time Restore (Free tier max is 21600 / 6h, Paid plans up to 30 days)"
  type        = number
  default     = 21600
}
