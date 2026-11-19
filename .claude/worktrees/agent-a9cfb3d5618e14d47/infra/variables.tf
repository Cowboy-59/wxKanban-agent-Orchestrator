# Spec 028 — Hosted MCP Deployment — input variables

variable "aws_region" {
  description = "AWS region for App Runner + Route53 records (matches existing wxkanban.wxperts.com service)"
  type        = string
  default     = "us-east-2"
}

# ── DNS ─────────────────────────────────────────────────────────────────

variable "route53_zone_id" {
  description = "Hosted zone ID for wxperts.com (find via: aws route53 list-hosted-zones-by-name --dns-name wxperts.com)"
  type        = string
}

variable "domain_root" {
  description = "Root domain (without trailing dot)"
  type        = string
  default     = "wxperts.com"
}

variable "mcp_subdomain" {
  description = "Production MCP subdomain (prepended to domain_root)"
  type        = string
  default     = "mcp"
}

variable "mcp_staging_subdomain" {
  description = "Staging MCP subdomain"
  type        = string
  default     = "staging.mcp"
}

# ── GitHub source connection ────────────────────────────────────────────

variable "github_connection_arn" {
  description = "ARN of the existing AWS App Runner → GitHub connection (find via: aws apprunner list-connections --region us-east-2). NOTE: The AWS provider does not expose aws_apprunner_connection as a data source, so we pass the full ARN."
  type        = string
}

variable "github_repo_url" {
  description = "GitHub repo URL (e.g. https://github.com/Cowboy-59/wxKanban)"
  type        = string
}

variable "github_branch" {
  description = "Branch App Runner builds from for staging auto-deploys"
  type        = string
  default     = "main"
}

variable "apprunner_config_file" {
  description = "Path (relative to repo root) of the apprunner config file App Runner reads"
  type        = string
  default     = "apprunner-mcp.yaml"
}

# ── App Runner instance shape ───────────────────────────────────────────

variable "instance_cpu" {
  description = "App Runner instance vCPU (string per AWS API: 256, 512, 1024, 2048, 4096)"
  type        = string
  default     = "1024"
}

variable "instance_memory" {
  description = "App Runner instance memory in MB (string per AWS API: 512, 1024, 2048, 3072, 4096, 6144, 8192, 10240, 12288)"
  type        = string
  default     = "2048"
}

variable "min_instances" {
  description = "Auto-scaling minimum instance count"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Auto-scaling maximum instance count"
  type        = number
  default     = 5
}

# ── Runtime env vars ────────────────────────────────────────────────────

variable "mcp_http_port" {
  description = "Port the MCP listens on inside the App Runner container"
  type        = string
  default     = "8080"
}

variable "mcp_auth_required_prod" {
  description = "Production auth requirement (MUST be true; deployment policy)"
  type        = string
  default     = "true"
  validation {
    condition     = var.mcp_auth_required_prod == "true"
    error_message = "MCP_AUTH_REQUIRED MUST be 'true' in production."
  }
}

variable "mcp_auth_required_staging" {
  description = "Staging auth requirement (recommended: true; can be false for QA bypass)"
  type        = string
  default     = "true"
}

variable "mcp_rate_limit_per_minute" {
  description = "Per-token rate limit (FR-007)"
  type        = string
  default     = "60"
}

# ── DB connection ───────────────────────────────────────────────────────
# Choose ONE of these two approaches (see README.md "Secrets"):

variable "database_url" {
  description = "Plain DATABASE_URL value (Option A). Leave empty if using Secrets Manager (Option C)."
  type        = string
  default     = ""
  sensitive   = true
}

variable "database_url_secret_arn" {
  description = "AWS Secrets Manager ARN holding the DATABASE_URL value (Option C). Leave empty if using plain variable."
  type        = string
  default     = ""
}

# ── App Runner deployment mode ──────────────────────────────────────────

variable "prod_auto_deployments" {
  description = "Production: should App Runner auto-deploy on every push? (false → tag-gated via Makefile)"
  type        = bool
  default     = false
}

variable "staging_auto_deployments" {
  description = "Staging: should App Runner auto-deploy on every push to the branch? (true is the spec default)"
  type        = bool
  default     = true
}

# ── Required runtime secrets (also set in wxkanban.wxperts.com env) ──────

variable "api_key" {
  description = "MCP server API key (required by mcp-server/src/config.ts). Generate with `openssl rand -hex 32`."
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT signing secret (must match wxkanban.wxperts.com for cross-service token compatibility). Defensive: not strictly required by mcp-server but included for shared-DB encrypted-fields decryption."
  type        = string
  default     = ""
  sensitive   = true
}

variable "encryption_key" {
  description = "AES-256-GCM encryption key (must match wxkanban.wxperts.com for at-rest secret decryption). Defensive include like jwt_secret."
  type        = string
  default     = ""
  sensitive   = true
}
