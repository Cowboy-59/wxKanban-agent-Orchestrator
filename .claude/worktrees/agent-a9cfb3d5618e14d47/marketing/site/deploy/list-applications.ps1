# Show all wxKanban beta applications stored in DynamoDB.
# Usage:  pwsh marketing/site/deploy/list-applications.ps1
$env:AWS_PROFILE = "Andy"
Write-Host "wxKanban beta applications:`n"
aws dynamodb scan --table-name wxkanban-beta-applications --region us-east-1 `
  --query "Items[].{Name:name.S,Email:email.S,Country:country.S,Version:windevVersion.S,Commit:commitment.S,Submitted:submittedat.S}" `
  --output table
$count = aws dynamodb scan --table-name wxkanban-beta-applications --region us-east-1 --select COUNT --query Count --output text
Write-Host "`nTotal: $count   (5 beta spots)"
Write-Host "Full detail per applicant: AWS console -> DynamoDB -> wxkanban-beta-applications"
