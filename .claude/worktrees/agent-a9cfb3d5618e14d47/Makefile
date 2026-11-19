# Spec 028 — Deployment targets for the hosted MCP service.
#
# `MCP_STAGING_ARN` and `MCP_PROD_ARN` are read from .env (operator captures
# them after provisioning the App Runner services per the runbook).
#
# Usage:
#   make deploy-mcp-staging
#   make deploy-mcp-prod TAG=v0.4.0

include .env
export

.PHONY: deploy-mcp-staging deploy-mcp-prod push-prod

# One-shot prod release: tag (if missing), push main + tag (API auto-redeploys), trigger MCP prod.
# Usage: make push-prod TAG=v0.4.0
# Note: tag labels the release; both services deploy from `main` HEAD, not from the tag.
push-prod:
	@test -n "$(TAG)" || (echo "ERROR: TAG=vX.Y.Z required"; exit 2)
	@test -n "$(MCP_PROD_ARN)" || (echo "ERROR: MCP_PROD_ARN not set in .env"; exit 2)
	@git rev-parse --verify "refs/tags/$(TAG)" >/dev/null 2>&1 || git tag $(TAG)
	git push origin main
	git push origin "refs/tags/$(TAG)"
	aws apprunner start-deployment --service-arn $(MCP_PROD_ARN)
	@echo "Done: wxKanban API auto-redeploys via main push; MCP prod deployment started for $(TAG)"

deploy-mcp-staging:
	@test -n "$(MCP_STAGING_ARN)" || (echo "ERROR: MCP_STAGING_ARN not set in .env"; exit 2)
	aws apprunner start-deployment --service-arn $(MCP_STAGING_ARN)

deploy-mcp-prod:
	@test -n "$(TAG)" || (echo "ERROR: TAG=vX.Y.Z required"; exit 2)
	@test -n "$(MCP_PROD_ARN)" || (echo "ERROR: MCP_PROD_ARN not set in .env"; exit 2)
	@git rev-parse --verify "refs/tags/$(TAG)" >/dev/null || (echo "ERROR: tag $(TAG) not found locally"; exit 3)
	aws apprunner start-deployment --service-arn $(MCP_PROD_ARN)
