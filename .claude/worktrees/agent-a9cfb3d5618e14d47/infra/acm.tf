# Spec 028 — ACM SAN cert for mcp.wxperts.com + staging.mcp.wxperts.com (T031a)
# DNS-validated via Route53.

resource "aws_acm_certificate" "mcp_san" {
  domain_name = "${var.mcp_subdomain}.${var.domain_root}"
  subject_alternative_names = [
    "${var.mcp_staging_subdomain}.${var.domain_root}",
  ]
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "wxkanban-mcp-san"
  }
}

# DNS validation records — one CNAME per name in the cert.
resource "aws_route53_record" "mcp_san_validation" {
  for_each = {
    for dvo in aws_acm_certificate.mcp_san.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

# Block until ACM confirms validation.
resource "aws_acm_certificate_validation" "mcp_san" {
  certificate_arn         = aws_acm_certificate.mcp_san.arn
  validation_record_fqdns = [for r in aws_route53_record.mcp_san_validation : r.fqdn]
}
