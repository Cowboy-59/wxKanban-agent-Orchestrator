# wxKanban Landing Page — AWS Deployment (LIVE)

**Live URL:** https://windev.wxperts.com
**Deployed:** 2026-06-01 · **Account:** 907693067083 · **Profile used:** `Andy` (admin)

Architecture: **S3 (private) → CloudFront (HTTPS, OAC) → Route 53 → windev.wxperts.com.**
No public bucket; the bucket is readable only by this one CloudFront distribution.

## Resources created

| Resource | ID / Name | Notes |
|----------|-----------|-------|
| S3 bucket (private) | `wxkanban-landing-907693067083` | all public access blocked |
| ACM certificate (us-east-1) | `arn:aws:acm:us-east-1:907693067083:certificate/637947ba-be0d-499b-bf69-e72427296f6b` | DNS-validated, auto-renews |
| CloudFront OAC | `E39WTICH68ADFH` | sigv4, s3 origin type |
| CloudFront distribution | `EY9EZHJEX1YCM` | domain `d29pqdckkv4x9n.cloudfront.net` |
| Route 53 (zone `Z4M1IM786J2ZA`) | `windev.wxperts.com` A + AAAA alias | + ACM validation CNAME |

Cache policy: AWS-managed **CachingOptimized** (`658327ea-...`). Objects uploaded with
`Cache-Control: max-age=300`, so edits go live within ~5 min even without an invalidation.

## Update the page (after editing index.html)

```powershell
pwsh marketing/site/deploy/redeploy.ps1
```

This re-uploads `index.html` and invalidates the CloudFront cache. Live in ~1 min.

## Config files (resolved, as-deployed records)

- `cloudfront-distribution.json` — the distribution config
- `bucket-policy.json` — S3 policy granting read to distribution `EY9EZHJEX1YCM` via OAC
- `route53-alias.json` — the A/AAAA alias change batch

## Change the subdomain (e.g. to get.wxperts.com)

1. Request a new ACM cert (us-east-1) for the new name + add its DNS validation CNAME.
2. Update the distribution's `Aliases` + `ViewerCertificate` (edit `cloudfront-distribution.json`,
   bump `CallerReference` is NOT needed for update; use `aws cloudfront update-distribution`
   with the current ETag).
3. Add a Route 53 alias for the new name → `d29pqdckkv4x9n.cloudfront.net`.
4. Optionally remove the old alias + cert.

## Tear down (if ever needed)

```powershell
$env:AWS_PROFILE="Andy"
aws cloudfront delete-distribution --id EY9EZHJEX1YCM --if-match <ETag>   # must be Disabled first
aws s3 rb s3://wxkanban-landing-907693067083 --force
aws route53 change-resource-record-sets --hosted-zone-id Z4M1IM786J2ZA --change-batch <DELETE batch>
aws acm delete-certificate --certificate-arn <cert-arn> --region us-east-1
```

## Launch-notify signup form (fully owned — no third party)

The `#notify` form posts to our own serverless backend. **Signups are stored in Postgres**
(`marketingcontacts` table in the **`wxKanban`** database); the SES email is the safety net
(a lead is never lost even if the DB write fails — the email then *is* the record).

`name` + `email` are required; `cell` (mobile) is optional.

| Resource | ID / Name |
|----------|-----------|
| API Gateway (HTTP API) | `m5m1kx31kf` → `https://m5m1kx31kf.execute-api.us-east-1.amazonaws.com/apply` |
| Lambda | `wxkanban-beta-intake` (nodejs20.x, handler `index.handler`) |
| Lambda env | `DATABASE_URL` (the `wxKanban` DB, must end `?sslmode=require`), `NOTIFY_EMAIL=andy@wxperts.com` |
| Lambda role | `wxkanban-beta-intake-role` (logs + ses:SendEmail — DynamoDB perm no longer needed) |
| Postgres table | `marketingcontacts` (see `sql/marketingcontacts.sql`) |
| Email notify | SES → `andy@wxperts.com` (best-effort + fallback record) |

Routes: `POST /apply` (submit) + `OPTIONS /apply` (CORS preflight, handled in Lambda).
CORS is locked to `https://windev.wxperts.com`. (Route path is still `/apply` — kept to avoid
re-wiring API Gateway; the payload now carries `list` + `wantsHandsOn`.)

**Network requirement:** the Lambda must be able to reach the database — either a
publicly-resolvable RDS endpoint over TLS (non-VPC Lambda, current setup), or attach the
Lambda to the DB's VPC/subnets + security group. SES/HTTPS still work non-VPC.

### One-time DB setup

```powershell
psql "$env:DATABASE_URL" -f marketing/site/deploy/sql/marketingcontacts.sql
```

### Set the Lambda env vars (once)

```powershell
$env:AWS_PROFILE="Andy"
aws lambda update-function-configuration --function-name wxkanban-beta-intake --region us-east-1 `
  --environment "Variables={DATABASE_URL=postgresql://USER:PASS@HOST:5432/wxKanban?sslmode=require,NOTIFY_EMAIL=andy@wxperts.com}"
```

**View signups:** query the DB directly —
```powershell
psql "$env:DATABASE_URL" -c "select submittedat, name, email, cell, platform, wantshandson from marketingcontacts order by submittedat desc limit 50;"
```

**Repackage + deploy the Lambda** (the zip now bundles `node_modules` because of `pg`,
and `welcome-email.mjs` for the signup welcome email):
```powershell
$env:AWS_PROFILE="Andy"
cd marketing/site/deploy/lambda
npm install --omit=dev
Compress-Archive -Path index.mjs,welcome-email.mjs,package.json,node_modules -DestinationPath function.zip -Force
aws lambda update-function-code --function-name wxkanban-beta-intake --zip-file fileb://function.zip --region us-east-1
```
> ⚠️ The file list is explicit — if you add a new source module, add it here too or it
> won't ship.

> Legacy: the old beta funnel stored to DynamoDB `wxkanban-beta-applications` via a 20-field
> `FIELDS` array. That table can stay for the historical rows; the Lambda no longer writes to it.
> `list-applications.ps1` reads that old table and is now historical-only.

### Welcome email (auto-reply to each signup)

On a successful signup the Lambda sends a branded "glad to have you" welcome email to the
signer (`welcome-email.mjs`, mirrors `marketing/site/email/welcome-signup.html`). It's
**best-effort** — a send failure is logged and never fails the signup request.

**⚠️ Blocked by the SES sandbox.** SES can currently only deliver to verified addresses
(`andy@wxperts.com`), so welcome emails to real signups will be **rejected until SES
production access is granted**. Request it once, then welcome emails flow automatically:

```powershell
$env:AWS_PROFILE="Andy"
aws sesv2 put-account-details --region us-east-1 `
  --production-access-enabled --mail-type TRANSACTIONAL `
  --website-url https://windev.wxperts.com `
  --use-case-description "Transactional welcome + launch-notify emails to people who opted in on windev.wxperts.com."
```
(Or request via the SES console → Account dashboard → "Request production access". Approval is usually < 24h.)

Optional env vars (all have safe defaults):

| Var | Default | Purpose |
|-----|---------|---------|
| `WELCOME_ENABLED` | (on) | Set to `false` to disable welcome emails without a code change. |
| `WELCOME_FROM` | `NOTIFY_EMAIL` | SES-verified From address for the welcome email. |
| `UNSUBSCRIBE_URL` | a `mailto:` to andy | Link used in the welcome email's unsubscribe footer. |

Until production access lands, you can leave it as-is (real sends just fail silently and log),
or set `WELCOME_ENABLED=false` to skip the attempt entirely.

## Analytics (owned beacon — no cookies, no third party)

A tiny script in `index.html` POSTs each page load to `POST /pageview` on the same
API → Lambda `wxkanban-pageview-intake` → DynamoDB `wxkanban-pageviews`
(role `wxkanban-pageview-role`). Captures path, referrer, language, screen, UA, timestamp.
No cookies, no IP stored — privacy-friendly (itself a selling point to this audience).

**View stats (total views, by day, by referrer):**
`pwsh marketing/site/deploy/pageview-stats.ps1`

Referrer tracking is the key payoff: when you expand past the Facebook group, you'll see
which channel (FB, forums, Discord, YouTube…) actually drove each visit.

## Still TODO before promoting the link publicly

- ~~Verify SES~~ ✅ DONE — `andy@wxperts.com` + the `wxperts.com` domain are SES-verified
  (domain via Route 53 DKIM). Email notifications work. SES still sandboxed, which is fine
  since it only emails `andy@wxperts.com`.
- Swap the `mailto:` How-To CTA ("Email me as videos drop") for a real YouTube playlist /
  email-list URL once that exists, then redeploy.
- Add an `og:image` (social preview) for nicer Facebook/LinkedIn link cards.
