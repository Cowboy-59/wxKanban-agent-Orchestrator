# Spec 028 — Output values
#
# After `terraform apply`, paste the service ARNs into the repo's .env.example
# (or your shell) so the Makefile deploy targets can reference them.

output "mcp_prod_service_arn" {
  description = "ARN of the production App Runner service (set MCP_PROD_ARN to this value)"
  value       = aws_apprunner_service.mcp_prod.arn
}

output "mcp_staging_service_arn" {
  description = "ARN of the staging App Runner service (set MCP_STAGING_ARN to this value)"
  value       = aws_apprunner_service.mcp_staging.arn
}

output "mcp_prod_default_url" {
  description = "App Runner's auto-generated production URL (use until DNS propagates)"
  value       = aws_apprunner_service.mcp_prod.service_url
}

output "mcp_staging_default_url" {
  description = "App Runner's auto-generated staging URL"
  value       = aws_apprunner_service.mcp_staging.service_url
}

output "mcp_prod_domain" {
  description = "Production custom domain"
  value       = "https://${var.mcp_subdomain}.${var.domain_root}"
}

output "mcp_staging_domain" {
  description = "Staging custom domain"
  value       = "https://${var.mcp_staging_subdomain}.${var.domain_root}"
}

output "acm_cert_arn" {
  description = "ARN of the SAN cert covering both domains"
  value       = aws_acm_certificate.mcp_san.arn
}
