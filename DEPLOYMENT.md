# Inbox Zero - Redeployment Guide

This guide covers how to redeploy inbox-zero after making changes to the project files, both locally and to Azure.

## Prerequisites

- Docker Desktop installed and running (for local)
- Azure CLI installed and authenticated (for Azure)
- Access to Azure resources in `rg-keystone-platform`
- Access to Azure Key Vault `keystone-vault`

---

# Local Docker Redeployment

## Local Development Uses Production Data

The local Docker setup connects directly to **production PostgreSQL and Redis** (no local database containers). This ensures:

- Your rules, settings, and user data are always in sync with production
- No risk of testing against stale local data
- Changes you make locally affect production immediately

### Running Locally

```bash
# Using helper script (tests connections first)
./scripts/run-local.sh

# Or directly with docker compose
docker compose up web
```

### Prerequisites: Firewall Access

Your IP must be allowed in Azure PostgreSQL firewall:

```bash
# Check your IP
curl -4 ifconfig.me

# Add to firewall (if needed)
az postgres flexible-server firewall-rule create \
  --resource-group rg-keystone-platform \
  --name keystone-platform-postgres \
  --rule-name allow-local-dev \
  --start-ip-address $(curl -4 -s ifconfig.me) \
  --end-ip-address $(curl -4 -s ifconfig.me)
```

### Data Sources

| Resource | Connection |
|----------|------------|
| PostgreSQL | `keystone-platform-postgres.postgres.database.azure.com` |
| Redis | `inbox-zero-redis-proxy.azurewebsites.net` |

---

## When to Redeploy Locally

- After pulling updates from the inbox-zero GitHub repository
- After modifying local configuration files (`.env`, `config.yaml`, `docker-compose.yml`)
- When containers are not working correctly
- To test changes before deploying to Azure

## Standard Update (Code Changes Only)

If you've only pulled code updates from GitHub without changing configuration:

```bash
# Navigate to project directory
cd /Users/jgilpatrick/Library/CloudStorage/OneDrive-EventusWholeHealth/Development/active/inbox-zero

# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose down
docker compose build web
docker compose up web

# Or in background
docker compose up -d web
```

## Full Rebuild (Configuration Changes)

If you've modified `docker-compose.yml`, `config.yaml`, or environment variables:

```bash
# Stop container
docker compose down

# Rebuild image (forces rebuild)
docker compose build --no-cache web

# Start
docker compose up web

# Monitor startup
docker compose logs -f web
```

## Environment Variable Changes

If you've modified `apps/web/.env`:

```bash
# No need to rebuild images, just restart
docker compose restart web

# Verify new variables are loaded
docker compose exec web env | grep YOUR_VARIABLE_NAME
```

## Database Schema Changes

If inbox-zero has new database migrations:

```bash
# Migrations run automatically on container startup
# Just restart the web service
docker compose restart web

# Check migration logs
docker compose logs web | grep -i migration

# If migrations fail, you may need to manually apply them
docker compose exec web npx prisma migrate deploy
```

## Troubleshooting Local Redeployment

### Issue: Containers won't start

```bash
# Check container status
docker compose ps

# View error logs
docker compose logs

# Remove containers and volumes (WARNING: deletes data)
docker compose --profile all down -v
docker compose --profile all up -d
```

### Issue: Port conflicts

```bash
# Check what's using the ports
lsof -i :3000  # Web app
lsof -i :5432  # PostgreSQL
lsof -i :6380  # Redis
lsof -i :8079  # Redis HTTP proxy

# Stop conflicting services or change ports in docker-compose.yml
```

### Issue: Database connection errors

```bash
# Verify database is running
docker compose ps db

# Check database logs
docker compose logs db

# Test connection
docker compose exec web npx prisma db push
```

---

# Azure Redeployment

## When to Redeploy to Azure

- After inbox-zero releases a new version
- When you need to update environment variables
- When Azure OpenAI model deployments change
- To scale resources up or down

## Current Deployment Configuration

The Azure deployment uses a **custom ACR image** with local modifications:

| Setting | Value |
|---------|-------|
| Container Registry | `acrkeystoneplatform.azurecr.io` |
| Image | `inbox-zero:latest` |
| Web App | `inbox-zero-web` |
| Resource Group | `rg-keystone-platform` |

### Why Custom ACR Instead of Upstream GHCR?

We maintain a custom image because:
1. **Microsoft Graph SDK Fix** - The upstream code has a bug where the Graph SDK fails to parse streaming JSON responses for message search. Our fix uses direct `fetch()` instead.
2. **Docker Build Fix** - Fixed module resolution issue with pnpm `--shamefully-hoist` flag.

The fix is in `apps/web/utils/outlook/message.ts` (commit `89a320732`).

## Standard Update (Custom Image Rebuild)

When you have local code changes to deploy:

```bash
# Navigate to project directory
cd /Users/jgilpatrick/Library/CloudStorage/OneDrive-EventusWholeHealth/Development/active/inbox-zero

# Build for linux/amd64 (required for Azure)
docker buildx build --platform linux/amd64 -t acrkeystoneplatform.azurecr.io/inbox-zero:latest -f docker/Dockerfile.prod .

# Login to ACR
az acr login --name acrkeystoneplatform

# Push to ACR
docker push acrkeystoneplatform.azurecr.io/inbox-zero:latest

# Restart the app (pulls latest from ACR)
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform

# Wait for restart (about 60-90 seconds for startup probe)
sleep 90

# Verify deployment
curl -I https://inbox-zero-web.azurewebsites.net

# Check logs for errors
az webapp log download --name inbox-zero-web --resource-group rg-keystone-platform --log-file /tmp/webapp-logs.zip
unzip -o /tmp/webapp-logs.zip -d /tmp/webapp-logs
tail -50 /tmp/webapp-logs/LogFiles/*_default_docker.log
```

**Note:** The startup probe takes ~60-90 seconds. Check logs to confirm "Site started."

## Quick Update (Pull Upstream + Rebuild)

To incorporate upstream changes while preserving local fixes:

```bash
# Fetch upstream changes
git fetch origin main
git merge origin/main

# Resolve any conflicts (our fixes in message.ts and Dockerfile.prod should remain)
# Then rebuild and push
docker buildx build --platform linux/amd64 -t acrkeystoneplatform.azurecr.io/inbox-zero:latest -f docker/Dockerfile.prod .
az acr login --name acrkeystoneplatform
docker push acrkeystoneplatform.azurecr.io/inbox-zero:latest
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

## Fallback: Use Upstream GHCR Image

If you need to temporarily revert to the upstream image (note: search will be broken):

```bash
az webapp config container set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --docker-custom-image-name ghcr.io/elie222/inbox-zero:latest

az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

To switch back to ACR:

```bash
az webapp config container set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --docker-custom-image-name acrkeystoneplatform.azurecr.io/inbox-zero:latest \
  --docker-registry-server-url https://acrkeystoneplatform.azurecr.io \
  --docker-registry-server-user acrkeystoneplatform \
  --docker-registry-server-password "$(az acr credential show --name acrkeystoneplatform --query passwords[0].value -o tsv)"

az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

## Force Image Update

If the latest tag isn't updating:

```bash
# Force pull latest image
az webapp config container set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --docker-custom-image-name ghcr.io/elie222/inbox-zero:latest

# Restart to apply
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

## Update Environment Variables

### Single Variable Update

```bash
# Update one variable
az webapp config appsettings set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --settings VARIABLE_NAME="new_value"

# Restart to apply changes
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

### Multiple Variables Update

```bash
# Update multiple variables at once
az webapp config appsettings set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --settings \
    DEFAULT_LLM_MODEL="gpt-4.1" \
    ECONOMY_LLM_MODEL="gpt-4.1-mini" \
    NEXT_PUBLIC_BASE_URL="https://inbox-zero-web.azurewebsites.net"

# Restart to apply
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

### Update Azure OpenAI Configuration

If Azure OpenAI models change:

```bash
# Get current OpenAI key
OPENAI_KEY=$(az keyvault secret show \
  --vault-name keystone-vault \
  --name AZURE-OPENAI-API-KEY \
  --query value -o tsv)

# List available deployments
az cognitiveservices account deployment list \
  --name equip-openai-prod \
  --resource-group equip-chatbot-rg \
  --query "[].{name:name, model:properties.model.name}" -o table

# Update to use new deployment
az webapp config appsettings set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --settings \
    DEFAULT_LLM_MODEL="new-deployment-name" \
    OPENAI_API_KEY="${OPENAI_KEY}"

# Restart
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

## Update Microsoft OAuth Configuration

If redirect URIs change (e.g., new domain):

```bash
# Add new redirect URI
az ad app update \
  --id ff5b0387-9f92-42fd-951b-c7567ffec006 \
  --web-redirect-uris \
    "https://new-domain.azurewebsites.net/api/auth/callback/microsoft" \
    "https://new-domain.azurewebsites.net/api/outlook/linking/callback" \
    "https://new-domain.azurewebsites.net/api/outlook/calendar/callback" \
    "https://inbox-zero-web.azurewebsites.net/api/auth/callback/microsoft" \
    "https://inbox-zero-web.azurewebsites.net/api/outlook/linking/callback" \
    "https://inbox-zero-web.azurewebsites.net/api/outlook/calendar/callback"

# Update app URL
az webapp config appsettings set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --settings \
    NEXT_PUBLIC_BASE_URL="https://new-domain.azurewebsites.net" \
    WEBHOOK_URL="https://new-domain.azurewebsites.net"

# Restart
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

## Database Schema Changes

Azure deployment runs migrations automatically on startup. If migrations fail:

```bash
# Check migration logs
az webapp log download \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --log-file /tmp/inbox-zero-logs.zip

# Extract and view
cd /tmp && unzip -q inbox-zero-logs.zip && \
  tail -200 LogFiles/*_default_docker.log | grep -i migration

# If migration permission error, verify database user
# User must be dify_admin (owns all tables)
az webapp config appsettings list \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --query "[?name=='DATABASE_URL'].value" -o tsv
```

If you need to manually run migrations:

```bash
# Connect to database and run migrations
# (Not recommended - use app restart which runs migrations automatically)
az webapp ssh --name inbox-zero-web --resource-group rg-keystone-platform
# Then inside the container:
cd apps/web && npx prisma migrate deploy
```

## Update Redis Proxy

If Redis configuration changes:

```bash
# Get current Redis key
REDIS_KEY=$(az redis list-keys \
  --name inbox-zero-redis \
  --resource-group rg-keystone-platform \
  --query primaryKey -o tsv)

# Update proxy configuration
az webapp config appsettings set \
  --name inbox-zero-redis-proxy \
  --resource-group rg-keystone-platform \
  --settings \
    REDIS_HOST="inbox-zero-redis.redis.cache.windows.net" \
    REDIS_PORT="6380" \
    REDIS_PASSWORD="${REDIS_KEY}" \
    USE_TLS="true"

# Restart proxy
az webapp restart --name inbox-zero-redis-proxy --resource-group rg-keystone-platform

# Update token in main app if changed
REDIS_TOKEN=$(az webapp config appsettings list \
  --name inbox-zero-redis-proxy \
  --resource-group rg-keystone-platform \
  --query "[?name=='TOKEN'].value" -o tsv)

az webapp config appsettings set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --settings UPSTASH_REDIS_TOKEN="${REDIS_TOKEN}"

az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

## Scaling Resources

### Scale App Service Plan

```bash
# Scale to different tier
az appservice plan update \
  --name keystone-platform-asp \
  --resource-group rg-keystone-platform \
  --sku P2v3  # or B1, P1v3, etc.

# No restart needed - happens automatically
```

### Scale Redis

```bash
# Scale Redis to larger size
az redis update \
  --name inbox-zero-redis \
  --resource-group rg-keystone-platform \
  --sku Standard \
  --vm-size c2  # c0, c1, c2, c3, etc.

# Note: Scaling Redis causes brief downtime
```

---

# Data Migration

## Export from Local Docker

### Export Database

```bash
# Export PostgreSQL database
docker compose exec db pg_dump -U postgres inboxzero > backup-local-$(date +%Y%m%d).sql

# Verify backup
ls -lh backup-local-*.sql
```

### Export Redis Cache (Optional)

```bash
# Redis data is cached and can be regenerated
# Only export if you need to preserve specific data
docker compose exec redis redis-cli --rdb /data/dump.rdb SAVE
docker cp inbox-zero-services-redis-1:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

## Import to Azure

### Import Database

```bash
# Get database credentials
DB_USER=$(az keyvault secret show \
  --vault-name keystone-vault \
  --name postgres-dify-admin-username \
  --query value -o tsv)

DB_PASSWORD=$(az keyvault secret show \
  --vault-name keystone-vault \
  --name postgres-dify-admin-password \
  --query value -o tsv)

# Import to Azure PostgreSQL
PGPASSWORD="${DB_PASSWORD}" psql \
  -h keystone-platform-postgres.postgres.database.azure.com \
  -U ${DB_USER} \
  -d inboxzero \
  -f backup-local-20250128.sql
```

**Important:** Ensure your IP is allowed through PostgreSQL firewall:

```bash
# Add your IP temporarily
MY_IP=$(curl -s ifconfig.me)
az postgres flexible-server firewall-rule create \
  --resource-group rg-keystone-platform \
  --name keystone-platform-postgres \
  --rule-name allow-my-ip-temp \
  --start-ip-address ${MY_IP} \
  --end-ip-address ${MY_IP}

# Remove rule after import
az postgres flexible-server firewall-rule delete \
  --resource-group rg-keystone-platform \
  --name keystone-platform-postgres \
  --rule-name allow-my-ip-temp --yes
```

## Export from Azure

```bash
# Download database backup
DB_PASSWORD=$(az keyvault secret show \
  --vault-name keystone-vault \
  --name postgres-dify-admin-password \
  --query value -o tsv)

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h keystone-platform-postgres.postgres.database.azure.com \
  -U dify_admin \
  -d inboxzero > backup-azure-$(date +%Y%m%d).sql
```

## Import to Local Docker

```bash
# Copy backup into container
docker cp backup-azure-20250128.sql inbox-zero-services-db-1:/tmp/

# Import
docker compose exec db psql -U postgres -d inboxzero -f /tmp/backup-azure-20250128.sql
```

---

# Rollback Procedures

## Rollback Local Deployment

```bash
# Stop current containers
docker compose --profile all down

# Checkout previous version
git log --oneline  # Find commit hash
git checkout <previous-commit-hash>

# Restore previous configuration if needed
git checkout <previous-commit-hash> apps/web/.env
git checkout <previous-commit-hash> config.yaml

# Rebuild and start
docker compose --profile all build
docker compose --profile all up -d
```

## Rollback Azure Deployment

Azure Web Apps doesn't support automatic rollback to previous image versions. Options:

### Option 1: Pin to Specific Version

```bash
# Use specific version tag instead of :latest
az webapp config container set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --docker-custom-image-name ghcr.io/elie222/inbox-zero:v1.2.3

az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

### Option 2: Restore Environment Variables

```bash
# Export current settings to backup
az webapp config appsettings list \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform > backup-settings-$(date +%Y%m%d).json

# Restore from backup
# Edit backup-settings-old.json to remove system-managed settings
az webapp config appsettings set \
  --name inbox-zero-web \
  --resource-group rg-keystone-platform \
  --settings @backup-settings-old.json
```

### Option 3: Restore Database

```bash
# Import previous database backup
PGPASSWORD="${DB_PASSWORD}" psql \
  -h keystone-platform-postgres.postgres.database.azure.com \
  -U dify_admin \
  -d inboxzero \
  -f backup-azure-20250127.sql
```

---

# Verification Checklist

After any redeployment, verify:

## Local Deployment

- [ ] Web container running: `docker compose ps`
- [ ] Web app accessible: http://localhost:3000
- [ ] Can login with Microsoft account
- [ ] Connected to production PostgreSQL (check logs for connection)
- [ ] Connected to production Redis (no Redis errors in logs)
- [ ] AI Assistant works (make test request)
- [ ] Rules/settings match production

## Azure Deployment

- [ ] App returns 200: `curl -I https://inbox-zero-web.azurewebsites.net`
- [ ] Redis proxy running: `curl -I https://inbox-zero-redis-proxy.azurewebsites.net`
- [ ] Can login at: https://inbox-zero-web.azurewebsites.net
- [ ] No errors in logs: `az webapp log tail --name inbox-zero-web --resource-group rg-keystone-platform`
- [ ] Database migrations successful (check startup logs)
- [ ] AI Assistant working

---

# Quick Reference Commands

## Local Docker

```bash
# Start local container (uses production data)
./scripts/run-local.sh

# Or manually
docker compose up web

# View logs
docker compose logs -f web

# Rebuild after code changes
docker compose down && docker compose build web && docker compose up web

# Background mode
docker compose up -d web
```

## Azure

```bash
# Update to latest version
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform

# Update environment variable
az webapp config appsettings set --name inbox-zero-web --resource-group rg-keystone-platform --settings KEY="VALUE" && \
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform

# View logs
az webapp log tail --name inbox-zero-web --resource-group rg-keystone-platform

# Download logs for analysis
az webapp log download --name inbox-zero-web --resource-group rg-keystone-platform --log-file logs.zip
```

---

**Last Updated:** January 2, 2026
**Maintained by:** Josh Gilpatrick
**For Issues:** Check [IMPLEMENTATION.md](IMPLEMENTATION.md) for architecture details
