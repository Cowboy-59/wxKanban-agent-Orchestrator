# Show wxKanban landing-page analytics (owned beacon -> DynamoDB).
# Usage:  pwsh marketing/site/deploy/pageview-stats.ps1
$env:AWS_PROFILE = "Andy"
$raw = aws dynamodb scan --table-name wxkanban-pageviews --region us-east-1 `
  --query "Items[].{day:day.S,referrer:referrer.S,path:path.S}" --output json
$rows = $raw | ConvertFrom-Json

Write-Host "Total views: $($rows.Count)`n"

Write-Host "By day:"
$rows | Group-Object day | Sort-Object Name | ForEach-Object { "  {0}   {1}" -f $_.Name, $_.Count }

Write-Host "`nBy referrer:"
$rows | ForEach-Object {
  if (-not $_.referrer) { "(direct / none)" }
  else { try { ([uri]$_.referrer).Host } catch { "(other)" } }
} | Group-Object | Sort-Object Count -Descending | ForEach-Object { "  {0,-32} {1}" -f $_.Name, $_.Count }
