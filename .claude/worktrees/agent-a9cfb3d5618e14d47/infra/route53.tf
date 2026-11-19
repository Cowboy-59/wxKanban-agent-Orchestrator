# Spec 028 — Route53 records (T031b)
#
# Two record sets per service:
#   1. The user-facing CNAME (mcp.wxperts.com → App Runner's managed DNS target)
#   2. The per-service certificate validation CNAMEs that App Runner generates
#      dynamically when a custom domain is bound. AWS won't issue the TLS cert
#      until these records resolve.

# ── User-facing CNAMEs ────────────────────────────────────────────────────
#
# Using CNAMEs (not A-alias records) because:
#   1. App Runner's alias hosted-zone-ID varies by region and changes occasionally;
#      getting it wrong breaks `terraform apply` with a cryptic error.
#   2. We're at a subdomain (`mcp.*`, not the apex), so CNAMEs are legal.
#   3. The extra DNS hop is negligible for a non-edge service like MCP.

resource "aws_route53_record" "mcp_prod" {
  zone_id = var.route53_zone_id
  name    = "${var.mcp_subdomain}.${var.domain_root}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_apprunner_custom_domain_association.mcp_prod.dns_target]
}

resource "aws_route53_record" "mcp_staging" {
  zone_id = var.route53_zone_id
  name    = "${var.mcp_staging_subdomain}.${var.domain_root}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_apprunner_custom_domain_association.mcp_staging.dns_target]
}

# ── Per-service certificate validation CNAMEs ────────────────────────────
#
# App Runner returns these in `certificate_validation_records` when the custom
# domain association is created. Without them, the domain status hangs in
# `pending_certificate_dns_validation` forever and HTTPS never works.

resource "aws_route53_record" "mcp_prod_appcert_validation" {
  for_each = {
    for r in aws_apprunner_custom_domain_association.mcp_prod.certificate_validation_records : r.name => {
      name   = r.name
      type   = r.type
      record = r.value
    }
  }

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_route53_record" "mcp_staging_appcert_validation" {
  for_each = {
    for r in aws_apprunner_custom_domain_association.mcp_staging.certificate_validation_records : r.name => {
      name   = r.name
      type   = r.type
      record = r.value
    }
  }

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}
