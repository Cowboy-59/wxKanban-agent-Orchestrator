# Redeploy the wxKanban landing page after editing marketing/site/index.html.
# Usage (from repo root):  pwsh marketing/site/deploy/redeploy.ps1
$ErrorActionPreference = "Stop"
$env:AWS_PROFILE = "Andy"
$BUCKET = "wxkanban-landing-907693067083"
$DIST   = "EY9EZHJEX1YCM"

$pages = @("index.html", "about.html", "privacy.html", "terms.html")
foreach ($p in $pages) {
  Write-Host "Uploading $p..."
  aws s3 cp "marketing/site/$p" "s3://$BUCKET/$p" `
    --content-type "text/html; charset=utf-8" --cache-control "max-age=300"
}

Write-Host "Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $DIST --paths "/*" `
  --query "Invalidation.Status" --output text

Write-Host "Done. Live at https://windev.wxperts.com (allow ~1 min for the cache flush)."
