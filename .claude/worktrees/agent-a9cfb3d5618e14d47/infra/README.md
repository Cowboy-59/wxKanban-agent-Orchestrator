# Infrastructure as Code — Hosted MCP Deployment (Spec 028)

This module provisions the AWS infrastructure for the **hosted MCP service** (`mcp.wxperts.com` + `staging.mcp.wxperts.com`):

- 2× App Runner services (production + staging) — source-code mode against this GitHub repo, reading [`apprunner-mcp.yaml`](../apprunner-mcp.yaml)
- 1× ACM SAN cert covering both subdomains (DNS-validated)
- Route53 A-record aliases pointing each subdomain at the corresponding App Runner service
- Environment variables (including the DB connection) wired into the App Runner services via the Terraform-managed API path

Companion to spec 028 task list (T029 + T030 + T031).

---

## What you need before running

1. **AWS credentials** with permission to create:
   - `apprunner:*` (services)
   - `acm:RequestCertificate`, `acm:DescribeCertificate`, `acm:AddTagsToCertificate`
   - `route53:ChangeResourceRecordSets` against your `wxperts.com` hosted zone
   - `iam:CreateRole`, `iam:AttachRolePolicy` for the App Runner instance + access roles
   - `secretsmanager:*` (only if you choose to route secrets through Secrets Manager; see below)

2. **Terraform** ≥ 1.6.

3. **An existing App Runner → GitHub source connection.** The same one `wxkanban.wxperts.com` uses. Find its ARN:

   ```bash
   aws apprunner list-connections --region us-east-1 \
     --query 'ConnectionSummaryList[].ConnectionArn' \
     --output table
   ```

   If you have only one connection, that's the one. Save the ARN — you'll paste it into `terraform.tfvars` below.

4. **An existing Route53 hosted zone** for `wxperts.com`. Find its zone ID:

   ```bash
   aws route53 list-hosted-zones-by-name --dns-name wxperts.com \
     --query 'HostedZones[0].Id' --output text
   ```

   The output is `/hostedzone/Z…`; Terraform expects just the `Z…` part (strip the `/hostedzone/` prefix).

5. **The wxKanban RDS Postgres connection string**. You'll set this as `DATABASE_URL` in the App Runner env (Terraform writes it from your tfvars; consider using Secrets Manager — see "Secrets" below). If you don't already have it written down, recover it from the existing `wxkanban.wxperts.com` service:

   ```bash
   # Replace <wxkanban-service-arn> with the ARN of the existing wxkanban app
   aws apprunner describe-service --region us-east-1 \
     --service-arn <wxkanban-service-arn> \
     --query 'Service.SourceConfiguration.ImageRepository.ImageConfiguration.RuntimeEnvironmentVariables.DATABASE_URL' \
     --output text
   ```

   To list existing services and pick the wxkanban one:

   ```bash
   aws apprunner list-services --region us-east-1 \
     --query 'ServiceSummaryList[].[ServiceName,ServiceArn]' \
     --output table
   ```

---

## Bootstrap

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars and fill in:
#   - github_connection_arn
#   - route53_zone_id
#   - database_url   (or leave blank and use Secrets Manager — see below)
#   - mcp_auth_required = true (production)
terraform init
terraform plan -var-file=terraform.tfvars
```

Read the plan output carefully. You should see:

- 2× `aws_apprunner_service.mcp_*` to create
- 1× `aws_acm_certificate.mcp_san` to create
- 2× `aws_route53_record.mcp_*_validation` (CNAME for DNS validation)
- 1× `aws_acm_certificate_validation.mcp_san` to create
- 2× `aws_route53_record.mcp_*` (CNAMEs pointing at App Runner's managed DNS target)
- 1× `aws_apprunner_custom_domain_association.*` per service (binds the subdomain to the service)

If the plan looks right:

```bash
terraform apply -var-file=terraform.tfvars
```

ACM cert validation takes 1–5 minutes; the apply will block. After it completes:

```bash
# Smoke test
curl https://mcp.wxperts.com/health
curl https://staging.mcp.wxperts.com/health
```

Both should return `{"status":"ok", ...}`.

---

## Outputs

After apply, Terraform prints:

- `mcp_prod_service_arn` — paste this into the repo's `.env` as `MCP_PROD_ARN` for the Makefile.
- `mcp_staging_service_arn` — same for `MCP_STAGING_ARN`.
- `mcp_prod_default_url` and `mcp_staging_default_url` — the auto-generated `*.awsapprunner.com` URLs (used while DNS propagates).

### If you provisioned via the AWS console instead of Terraform

Fetch the service ARNs after creation:

```bash
# Production
aws apprunner list-services --region us-east-1 \
  --query 'ServiceSummaryList[?ServiceName==`mcp-prod`].ServiceArn' \
  --output text

# Staging
aws apprunner list-services --region us-east-1 \
  --query 'ServiceSummaryList[?ServiceName==`mcp-staging`].ServiceArn' \
  --output text
```

Paste each into `.env` at the repo root:

```bash
MCP_PROD_ARN=arn:aws:apprunner:us-east-1:<account>:service/mcp-prod/<uuid>
MCP_STAGING_ARN=arn:aws:apprunner:us-east-1:<account>:service/mcp-staging/<uuid>
```

Then `make deploy-mcp-staging` and `make deploy-mcp-prod TAG=vX.Y.Z` will work.

### Quick health check from the AWS shell

Once the services are running and DNS is resolved:

```bash
curl -sS https://mcp.wxperts.com/health | jq
curl -sS https://staging.mcp.wxperts.com/health | jq
```

Before DNS propagates, hit the auto-generated App Runner URL directly:

```bash
aws apprunner describe-service --region us-east-1 \
  --service-arn $MCP_STAGING_ARN \
  --query 'Service.ServiceUrl' --output text
# then:
curl -sS https://<that-url>/health | jq
```

---

## Secrets

`DATABASE_URL` is the only sensitive value the App Runner services need. You have three options:

### Option A — Plain Terraform variable (simplest, lowest security)

Set `database_url` in `terraform.tfvars`. **Do NOT commit `terraform.tfvars`** — it's in `.gitignore`. Value is stored in plaintext in Terraform state.

### Option B — Set in AWS console after apply (manual)

Leave `database_url` blank in tfvars. Terraform creates the service with `DATABASE_URL=""`. You set it in the App Runner console afterwards. Console value persists; subsequent `terraform apply` will try to reset it back to blank — work around by setting `lifecycle.ignore_changes = [instance_configuration[0].environment_variables]` (uncomment in `apprunner.tf` if you go this route).

### Option C — AWS Secrets Manager (recommended for production)

Pre-provision a secret:

```bash
aws secretsmanager create-secret --name wxkanban/mcp/database-url \
  --secret-string "postgres://..."
```

Then set `database_url_secret_arn` in `terraform.tfvars`. Terraform will reference the secret via `instance_configuration.environment_secrets`, and the value never lives in Terraform state.

---

## State backend

The default config (`main.tf`) uses local state. **For team use or anything you care about losing, switch to S3 + DynamoDB:**

1. Bootstrap a state bucket + lock table out-of-band (one-time, manually or via a separate Terraform):

   ```
   wxkanban-tfstate              S3 bucket (versioned, encrypted)
   wxkanban-tfstate-lock         DynamoDB table (LockID partition key)
   ```

2. Uncomment the `backend "s3"` block in `main.tf` and re-init:

   ```bash
   terraform init -migrate-state
   ```

---

## Day-to-day operations after the initial apply

| Operation | Command |
|-----------|---------|
| Force a staging redeploy | `make deploy-mcp-staging` (or push to `main`) |
| Tagged production deploy | `git tag v0.4.0 && git push --tags && make deploy-mcp-prod TAG=v0.4.0` |
| Rotate DB credentials | `aws secretsmanager update-secret ...` → App Runner picks up new value on next deploy |
| Drain + redeploy | App Runner console → service → "Start deployment" |
| Rollback | App Runner console → service → Deployment history → previous deployment → "Activate" |

---

## Destroying everything

```bash
terraform destroy -var-file=terraform.tfvars
```

⚠️ This deletes both App Runner services + DNS records. Production traffic stops immediately. Use only when retiring the hosted MCP.

---

## What this module does NOT do

- It does not create the GitHub source connection (must exist already).
- It does not create the Route53 hosted zone (`wxperts.com` must exist).
- It does not provision the RDS Postgres (uses your existing one via `DATABASE_URL`).
- It does not create the `mcpapitokens` / `mcprequestaudit` tables (run the spec-028 migration via the kit's `dbpush` once it's wired — see spec 028 T004).
- It does not run `wxkanban-agent verify` — do that yourself after apply (see Bootstrap step "smoke test").

## Connection budget (SCOPE-078)

The platform shares one RDS Postgres across App Runner instances that autoscale, so the total DB
connections must stay under the instance ceiling. The guardrail:

```text
(app_pool_max × app_max_instances) + (mcp_pool_max × mcp_max_instances)  ≤  max_connections − 50
```

- `max_connections` is **1500** (custom parameter group `wxkanban-pg15` on db.r6g.large; reserve ~50
  for superuser/replication/monitoring).
- `app_pool_max` = `PG_POOL_MAX` (pg pool; default 10), `mcp_pool_max` = `MCP_PG_POOL_MAX` (default 20).
- `*_max_instances` = the App Runner `max_instances` here in `variables.tf` / `terraform.tfvars`.

**Before raising `max_instances` for launch, check the budget.** The Infrastructure Health Monitor
(SPEC-078, `src/server/infrahealth/`) enforces visibility of this automatically: a background sweep
reads live RDS + App Runner numbers every ~5 min and posts a warning **with the fix** to the SysAdmin
dashboard when the configured ceiling approaches (caution) or exceeds (urgent) the budget — so a
raised `max_instances` is caught before it exhausts the database. The monitor is **read-only** and
gated by `INFRA_HEALTH_ENABLED=true`; it needs read-only `cloudwatch:GetMetricStatistics`,
`rds:DescribeDBInstances`/`DescribeDBParameters`, and `apprunner:DescribeService` on the App Runner
**instance role** (`wxkanban-apprunner-instance-role`).
