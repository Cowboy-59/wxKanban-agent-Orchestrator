# Spec 028 — App Runner services (T030)
#
# Two services, prod + staging, both source-code mode against this GitHub repo.
#
# IMPORTANT: configuration_source = "API" — Terraform's code_configuration_values
# block is the source of truth for build/run/env settings. The sibling
# `apprunner-mcp.yaml` is NOT consumed (App Runner only reads the literal
# filename `apprunner.yaml`, which belongs to the existing wxkanban service).
#
# Build pipeline: `npm install` at root → `cd mcp-server && npm install && npm run build`
# produces `mcp-server/dist/index-http.js`, which the run command then launches.

locals {
  # Required by mcp-server/src/server config:
  #   - DATABASE_URL: pg connection string (Supabase pooler URL works)
  #   - API_KEY: mcp-server/src/config.ts hard-requires this
  # Required by wxkanban Express app (defensive include since shared DB):
  #   - JWT_SECRET: ≥ 32 chars
  #   - ENCRYPTION_KEY: ≥ 32 chars
  # Spec 027 parent-watcher container fix:
  #   - KIT_PARENT_PID=1: watcher sees PID 1 (the container init) as alive forever
  #   - MCP_SKIP_PARENT_WATCHER=true: belt-and-suspenders — skip the watcher entirely
  prod_env = {
    NODE_ENV                  = "production"
    MCP_HTTP_PORT             = var.mcp_http_port
    MCP_AUTH_REQUIRED         = var.mcp_auth_required_prod
    MCP_RATE_LIMIT_PER_MINUTE = var.mcp_rate_limit_per_minute
    DATABASE_URL              = var.database_url
    API_KEY                   = var.api_key
    JWT_SECRET                = var.jwt_secret
    ENCRYPTION_KEY            = var.encryption_key
    KIT_PARENT_PID            = "1"
    MCP_SKIP_PARENT_WATCHER   = "true"
  }

  staging_env = {
    NODE_ENV                  = "staging"
    MCP_HTTP_PORT             = var.mcp_http_port
    MCP_AUTH_REQUIRED         = var.mcp_auth_required_staging
    MCP_RATE_LIMIT_PER_MINUTE = var.mcp_rate_limit_per_minute
    DATABASE_URL              = var.database_url
    API_KEY                   = var.api_key
    JWT_SECRET                = var.jwt_secret
    ENCRYPTION_KEY            = var.encryption_key
    KIT_PARENT_PID            = "1"
    MCP_SKIP_PARENT_WATCHER   = "true"
  }

  prod_secrets    = var.database_url_secret_arn != "" ? { DATABASE_URL = var.database_url_secret_arn } : {}
  staging_secrets = var.database_url_secret_arn != "" ? { DATABASE_URL = var.database_url_secret_arn } : {}
}

# ── IAM: instance role (so App Runner can read Secrets Manager if used) ──

resource "aws_iam_role" "apprunner_instance" {
  name = "wxkanban-mcp-apprunner-instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "tasks.apprunner.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "apprunner_instance_secrets" {
  count = var.database_url_secret_arn != "" ? 1 : 0
  name  = "read-database-url-secret"
  role  = aws_iam_role.apprunner_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [var.database_url_secret_arn]
    }]
  })
}

# ── Production service ──────────────────────────────────────────────────

resource "aws_apprunner_service" "mcp_prod" {
  service_name = "wxkanban-mcp-prod"

  source_configuration {
    authentication_configuration {
      connection_arn = var.github_connection_arn
    }
    auto_deployments_enabled = var.prod_auto_deployments
    code_repository {
      repository_url = var.github_repo_url
      source_code_version {
        type  = "BRANCH"
        value = var.github_branch
      }
      code_configuration {
        configuration_source = "API"
        code_configuration_values {
          runtime                       = "NODEJS_22"
          build_command                 = "npm install && cd mcp-server && npm install && npm run build"
          start_command                 = "node mcp-server/dist/index-http.js"
          port                          = var.mcp_http_port
          runtime_environment_variables = local.prod_env
          runtime_environment_secrets   = local.prod_secrets
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.instance_cpu
    memory            = var.instance_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }
}

# ── Staging service ─────────────────────────────────────────────────────

resource "aws_apprunner_service" "mcp_staging" {
  service_name = "wxkanban-mcp-staging"

  source_configuration {
    authentication_configuration {
      connection_arn = var.github_connection_arn
    }
    auto_deployments_enabled = var.staging_auto_deployments
    code_repository {
      repository_url = var.github_repo_url
      source_code_version {
        type  = "BRANCH"
        value = var.github_branch
      }
      code_configuration {
        configuration_source = "API"
        code_configuration_values {
          runtime                       = "NODEJS_22"
          build_command                 = "npm install && cd mcp-server && npm install && npm run build"
          start_command                 = "node mcp-server/dist/index-http.js"
          port                          = var.mcp_http_port
          runtime_environment_variables = local.staging_env
          runtime_environment_secrets   = local.staging_secrets
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.instance_cpu
    memory            = var.instance_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }
}

# ── Custom domain associations (binds mcp.* and staging.mcp.* to the services) ──

resource "aws_apprunner_custom_domain_association" "mcp_prod" {
  domain_name = "${var.mcp_subdomain}.${var.domain_root}"
  service_arn = aws_apprunner_service.mcp_prod.arn

  depends_on = [aws_acm_certificate_validation.mcp_san]
}

resource "aws_apprunner_custom_domain_association" "mcp_staging" {
  domain_name = "${var.mcp_staging_subdomain}.${var.domain_root}"
  service_arn = aws_apprunner_service.mcp_staging.arn

  depends_on = [aws_acm_certificate_validation.mcp_san]
}
