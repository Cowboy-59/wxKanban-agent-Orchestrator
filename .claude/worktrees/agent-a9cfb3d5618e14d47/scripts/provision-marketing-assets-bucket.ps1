# [SCOPE 048 / T002] Provision the public-read marketing-assets S3 bucket.
#
# Creates a NEW dedicated bucket for binary marketing assets (images, video MP4s,
# downloads), SEPARATE from any private/app storage. Public-read ONLY on the
# asset prefix, no public listing; writes only via admin-issued presigned PUT.
# CORS allows browser PUT from the marketing sites (presigned upload) + GET.
#
# Run with the Andy AWS profile (NOT default):
#   pwsh scripts/provision-marketing-assets-bucket.ps1
#
# After it runs, set these in the App Runner console (never commit them):
#   MARKETING_ASSETS_BUCKET   = <bucket>
#   MARKETING_ASSETS_REGION   = <region>
#   MARKETING_ASSETS_BASEURL  = https://<cloudfront-domain or bucket-website>
#
# CloudFront: front this bucket with a distribution (origin = the bucket) and put
# its domain in MARKETING_ASSETS_BASEURL. Mirror the existing
# marketing/site/deploy/cloudfront-distribution.json pattern, or attach the assets
# bucket as a second origin on the existing distribution. (Left manual — CDN
# topology is an operator decision; the app only needs MARKETING_ASSETS_BASEURL.)

param(
  [string]$Profile = "Andy",
  [string]$Bucket  = "wxkanban-marketing-assets",
  [string]$Region  = "us-east-1",
  [string]$Prefix  = "public/",
  # Comma-separated site origins allowed to presigned-PUT from a browser.
  [string]$CorsOrigins = "https://windev.wxperts.com,https://wxperts.com,http://localhost:5173"
)

$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = $Profile
Write-Host "Provisioning $Bucket in $Region (profile $Profile)..."

# 1. Create the bucket (us-east-1 must omit LocationConstraint).
$exists = aws s3api head-bucket --bucket $Bucket 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "  bucket already exists — continuing (idempotent)."
} elseif ($Region -eq "us-east-1") {
  aws s3api create-bucket --bucket $Bucket --region $Region | Out-Null
  Write-Host "  bucket created."
} else {
  aws s3api create-bucket --bucket $Bucket --region $Region `
    --create-bucket-configuration LocationConstraint=$Region | Out-Null
  Write-Host "  bucket created."
}

# 2. Allow public read policies (disable the public-access block for read-only).
#    BlockPublicAcls/IgnorePublicAcls stay true — we use a bucket POLICY, not ACLs.
aws s3api put-public-access-block --bucket $Bucket --public-access-block-configuration `
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false" | Out-Null
Write-Host "  public-access block configured (policy-based read allowed)."

# 3. Public-read ONLY on the asset prefix (no public listing of the bucket root).
$policy = @"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadAssetPrefix",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$Bucket/$Prefix*"
    }
  ]
}
"@
$policyFile = New-TemporaryFile
Set-Content -Path $policyFile -Value $policy -Encoding utf8
aws s3api put-bucket-policy --bucket $Bucket --policy "file://$policyFile" | Out-Null
Remove-Item $policyFile
Write-Host "  public-read bucket policy applied to prefix '$Prefix'."

# 4. CORS — allow presigned PUT + GET from the marketing site origins.
$origins = ($CorsOrigins -split "," | ForEach-Object { '"' + $_.Trim() + '"' }) -join ","
$cors = @"
{
  "CORSRules": [
    {
      "AllowedOrigins": [ $origins ],
      "AllowedMethods": [ "PUT", "GET", "HEAD" ],
      "AllowedHeaders": [ "*" ],
      "ExposeHeaders": [ "ETag" ],
      "MaxAgeSeconds": 3000
    }
  ]
}
"@
$corsFile = New-TemporaryFile
Set-Content -Path $corsFile -Value $cors -Encoding utf8
aws s3api put-bucket-cors --bucket $Bucket --cors-configuration "file://$corsFile" | Out-Null
Remove-Item $corsFile
Write-Host "  CORS configured for: $CorsOrigins"

Write-Host ""
Write-Host "Done. Set these env vars (App Runner console / .env):"
Write-Host "  MARKETING_ASSETS_BUCKET  = $Bucket"
Write-Host "  MARKETING_ASSETS_REGION  = $Region"
Write-Host "  MARKETING_ASSETS_BASEURL = https://<cloudfront-domain>   # front $Bucket with CloudFront"
