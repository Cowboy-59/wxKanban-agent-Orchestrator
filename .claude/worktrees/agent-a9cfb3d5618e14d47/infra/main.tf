# Spec 028 — Hosted MCP Deployment
# Root module: provider config + (optional) remote state backend.

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # ────────────────────────────────────────────────────────────────────────
  # Remote state backend — uncomment + re-init once the S3 bucket and
  # DynamoDB lock table are bootstrapped (see README.md "State backend").
  # ────────────────────────────────────────────────────────────────────────
  # backend "s3" {
  #   bucket         = "wxkanban-tfstate"
  #   key            = "spec-028/hosted-mcp.tfstate"
  #   region         = "us-east-2"
  #   dynamodb_table = "wxkanban-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "wxkanban"
      Component = "hosted-mcp"
      Spec      = "028"
      ManagedBy = "terraform"
    }
  }
}

# NOTE: The AWS Terraform provider (as of v5.x) does NOT expose
# `aws_apprunner_connection` as a data source — only as a managed resource.
# Pre-2026 versions of this file tried to look up the connection by name via a
# data block, which fails with "Invalid data source". We pass the full ARN
# directly via `var.github_connection_arn` instead. Find it once with:
#   aws apprunner list-connections --region us-east-2 \
#     --query 'ConnectionSummaryList[*].[ConnectionName,ConnectionArn,Status]' --output table
