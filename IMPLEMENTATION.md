# Inbox Zero - Custom Implementation Documentation

## Overview

This is a customized implementation of [Inbox Zero](https://github.com/elie222/inbox-zero) configured specifically for use with **Azure OpenAI** and **Microsoft 365/Outlook** email services.

**Two Deployment Options:**
1. **Local Docker Deployment** - Full containerized stack running locally with Docker Compose
2. **Azure App Service Deployment** - Production deployment on Azure Web Apps with managed services

Both deployments connect to Azure OpenAI directly via the v1 API and use Microsoft 365 for email integration.

## Key Differentiators

### 1. Azure OpenAI Direct Integration

Unlike the standard Inbox Zero deployment that connects directly to OpenAI, this implementation connects directly to Azure OpenAI's v1 API:

- **Uses Azure OpenAI's native v1 API** which is compatible with OpenAI SDK
- **No code changes needed** - Azure v1 API matches OpenAI's API format
- **Support Azure-specific model deployments** while maintaining OpenAI API compatibility
- **Enable enterprise Azure OpenAI usage** with existing corporate Azure infrastructure

**Architecture:**
```
Inbox Zero Application
        ↓
  (makes OpenAI API calls)
        ↓
Azure OpenAI v1 Endpoint
  (https://equip-openai.openai.azure.com/openai/v1)
```

**Note:** The `azure-openai-proxy` service is still included in docker-compose for legacy endpoints like `/v1/embeddings` if needed, but `/v1/responses` and `/v1/chat/completions` go directly to Azure.

### 2. Microsoft 365/Outlook Only Configuration

This deployment is configured exclusively for Microsoft 365/Outlook email:

- **Microsoft OAuth** for authentication
- **Microsoft Graph API** for email access
- **Microsoft webhooks** for real-time notifications
- **No Google dependencies** (dummy values provided for validation only)

### 3. Fully Containerized Docker Deployment

All services run as Docker containers for consistency and portability:

```yaml
Services:
  - inbox-zero-web        (Next.js application)
  - azure-openai-proxy    (OpenAI to Azure translator)
  - postgres              (Database)
  - redis                 (Caching)
  - serverless-redis-http (Redis HTTP proxy)
  - cron                  (Background jobs)
```

## Configuration Details

### Azure OpenAI Proxy Configuration

**File:** `config.yaml`

```yaml
api_base: "/v1"
deployment_config:
  - deployment_name: "gpt-5-chat"
    model_name: "gpt-5-chat-latest"
    endpoint: "https://equip-openai.openai.azure.com/"
    api_key: "[AZURE_OPENAI_API_KEY]"
    api_version: "2024-08-01-preview"
  - deployment_name: "gpt-4o-mini"
    model_name: "gpt-4o-mini"
    endpoint: "https://equip-openai.openai.azure.com/"
    api_key: "[AZURE_OPENAI_API_KEY]"
    api_version: "2024-08-01-preview"
```

**Model Mapping:**
- When Inbox Zero requests `gpt-5-chat-latest`, the proxy uses Azure deployment `gpt-5-chat`
- When Inbox Zero requests `gpt-4o-mini`, the proxy uses Azure deployment `gpt-4o-mini`

### Environment Configuration

**Key Environment Variables (from `.env`):**

```bash
# LLM Provider Configuration
DEFAULT_LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-5-chat-latest
ECONOMY_LLM_PROVIDER=openai
ECONOMY_LLM_MODEL=gpt-4o-mini

# Azure OpenAI Proxy Configuration
AZURE_OPENAI_ENDPOINT=https://equip-openai.openai.azure.com
AZURE_OPENAI_API_VERSION=2024-08-01-preview
AZURE_OPENAI_MODEL_MAPPER=gpt-5-chat-latest=gpt-5-chat,gpt-4o-mini=gpt-4o-mini

# OpenAI API Configuration (points to proxy)
OPENAI_API_KEY=[AZURE_OPENAI_API_KEY]
OPENAI_BASE_URL=http://azure-openai-proxy:8080/v1

# Microsoft OAuth Configuration
MICROSOFT_CLIENT_ID=[YOUR_CLIENT_ID]
MICROSOFT_CLIENT_SECRET=[YOUR_CLIENT_SECRET]
MICROSOFT_WEBHOOK_CLIENT_STATE=[WEBHOOK_SECRET]
MICROSOFT_TENANT_ID=[YOUR_TENANT_ID]

# Google OAuth (Dummy values - not used)
GOOGLE_CLIENT_ID=dummy-google-client-id-not-used
GOOGLE_CLIENT_SECRET=dummy-google-client-secret-not-used
GOOGLE_PUBSUB_TOPIC_NAME=projects/inbox-zero-local/topics/gmail
```

### Docker Compose Additions

**Azure OpenAI Proxy Service:**

```yaml
azure-openai-proxy:
  image: stulzq/azure-openai-proxy:latest
  container_name: azure-openai-proxy
  ports:
    - "8080:8080"
  volumes:
    - ./config.yaml:/app/config.yaml:ro
  networks:
    - inbox-zero-network
  restart: always
  profiles:
    - all
```

## Deployment Options Comparison

| Feature | Local Docker | Azure App Service |
|---------|-------------|-------------------|
| **Hosting** | Local machine | Azure Cloud |
| **Database** | PostgreSQL container | Azure PostgreSQL Flexible Server |
| **Redis** | Redis container + HTTP proxy | Azure Cache for Redis + HTTP proxy |
| **Scalability** | Limited to local resources | Auto-scaling available |
| **Availability** | Dev machine uptime | 99.95% SLA |
| **Cost** | Free (local resources) | Pay-per-use |
| **Use Case** | Development, testing | Production |
| **Data Persistence** | Docker volumes | Managed Azure storage |

---

# Deployment Option 1: Local Docker

## Deployment Instructions

### Prerequisites

1. **Azure OpenAI Resource** with deployed models:
   - `gpt-5-chat` deployment
   - `gpt-4o-mini` deployment (or your preferred economy model)

2. **Microsoft Azure App Registration** with:
   - Mail.Read permissions
   - Mail.Send permissions (if using email features)
   - Redirect URI configured for your domain

3. **Docker Desktop** installed and running

### Initial Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/elie222/inbox-zero.git
   cd inbox-zero
   ```

2. **Configure Azure OpenAI proxy:**
   ```bash
   # Create config.yaml in the root directory
   # Update with your Azure OpenAI endpoint and API key
   ```

3. **Configure environment variables:**
   ```bash
   cp apps/web/.env.example apps/web/.env
   # Edit apps/web/.env with your Azure and Microsoft credentials
   ```

4. **Start all services:**
   ```bash
   docker compose --profile all up -d
   ```

5. **Verify deployment:**
   ```bash
   # Check all containers are running
   docker ps

   # Check proxy is working
   docker logs azure-openai-proxy

   # Access the application
   open http://localhost:3000
   ```

### Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| Web App | 3000 | Main Inbox Zero application |
| Azure OpenAI Proxy | 8080 | OpenAI to Azure translator |
| PostgreSQL | 5432 | Database |
| Redis | 6380 | Cache |
| Redis HTTP | 8079 | Redis HTTP proxy |

## Architecture Diagram

```mermaid
graph TB
    User[User Browser] -->|HTTP| Web[Inbox Zero Web App :3000]
    Web -->|OpenAI API| Proxy[Azure OpenAI Proxy :8080]
    Proxy -->|Azure OpenAI API| Azure[Azure OpenAI Endpoint]
    Web -->|Microsoft Graph| MSGraph[Microsoft 365]
    Web -->|SQL| DB[(PostgreSQL :5432)]
    Web -->|Cache| Redis[(Redis :6380)]
    Web -->|Redis HTTP| RedisHTTP[Redis HTTP :8079]

    style Proxy fill:#e3f2fd,stroke:#1565c0,stroke-width:3px
    style Azure fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style MSGraph fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px
```

## Unique Features

### 1. Zero-Code Azure OpenAI Integration

The proxy approach means:
- ✅ No modifications to Inbox Zero source code
- ✅ Easy to update Inbox Zero to latest version
- ✅ Can switch between OpenAI and Azure OpenAI by changing config
- ✅ Supports all Inbox Zero features without compatibility issues

### 2. Enterprise-Ready Configuration

- **Azure OpenAI compliance:** Use enterprise Azure OpenAI with data residency controls
- **Microsoft 365 integration:** Seamless integration with corporate email
- **Containerized deployment:** Consistent environment across dev/staging/prod
- **No Google dependencies:** Suitable for Microsoft-only organizations

### 3. Model Flexibility

Easily switch between different Azure OpenAI deployments:

```yaml
# In config.yaml, add new deployments:
- deployment_name: "gpt-4-turbo"
  model_name: "gpt-4-turbo"
  endpoint: "https://equip-openai.openai.azure.com/"
  api_key: "[AZURE_OPENAI_API_KEY]"
  api_version: "2024-08-01-preview"
```

Then update `.env`:
```bash
DEFAULT_LLM_MODEL=gpt-4-turbo
```

## Custom Modifications

### Azure OpenAI v1 API - Direct Integration

**UPDATE (2025-12-23):** Azure OpenAI now supports the v1 API natively, including the `/v1/responses` endpoint used by Vercel AI SDK. The proxy is no longer needed for Responses API support.

**Current Configuration:**
- Inbox Zero connects directly to Azure OpenAI's v1 endpoint
- Endpoint: `https://equip-openai.openai.azure.com/openai/v1`
- No proxy needed for `/v1/responses` or `/v1/chat/completions`
- Model names match Azure deployment names directly (e.g., `gpt-5-chat`)

**Previous Approach (Deprecated):**
Previously, we used a custom `azure-openai-proxy` build to add `/responses` endpoint support. This is no longer necessary as Azure OpenAI now supports the endpoint natively through their v1 API.

**Why Direct v1 API is Better:**
- ✅ Simpler architecture - one less service to maintain
- ✅ Lower latency - no proxy hop
- ✅ Native Azure OpenAI features (e.g., content filtering, usage tracking)
- ✅ Automatic updates when Azure adds new features
- ✅ No custom proxy code to maintain

**Required Code Changes for Direct v1 API:**

1. **Environment Schema** (`apps/web/env.ts`):
   - Added `OPENAI_BASE_URL: z.string().optional()` to the server schema validation
   - This allows the app to read the Azure OpenAI v1 endpoint from environment variables

2. **Model Creation** (`apps/web/utils/llms/model.ts:90-93`):
   - Updated OpenAI client creation to include `baseURL` parameter:
   ```typescript
   model: createOpenAI({
     apiKey: aiApiKey || env.OPENAI_API_KEY,
     baseURL: env.OPENAI_BASE_URL
   })(modelName)
   ```

3. **Environment Variables** (`.env`):
   ```bash
   OPENAI_BASE_URL=https://equip-openai.openai.azure.com/openai/v1
   OPENAI_API_KEY=[your-azure-openai-api-key]
   DEFAULT_LLM_MODEL=gpt-5-chat
   ```

## Troubleshooting

### Proxy Issues

**Check proxy logs:**
```bash
docker logs azure-openai-proxy
```

**Expected output:**
```
2025/12/23 19:16:10 Init from config file
2025/12/23 19:16:10 read config file success
2025/12/23 19:16:10 apiBase is: /v1
2025/12/23 19:16:10 Server listening at :8080
```

**Common issues:**
- Config file not mounted: Ensure `config.yaml` exists in root directory
- Wrong API key: Verify Azure OpenAI API key in `config.yaml`
- Model not found: Ensure deployment names match between config and Azure

### Application Issues

**Check web app logs:**
```bash
docker logs inbox-zero-services-web-1
```

**Check all container status:**
```bash
docker compose --profile all ps
```

**Restart services:**
```bash
# Restart specific service
docker compose restart web

# Restart all services
docker compose --profile all down
docker compose --profile all up -d
```

## Maintenance

### Updating Inbox Zero

```bash
# Pull latest changes
git fetch origin
git pull origin main

# Rebuild containers
docker compose --profile all down
docker compose --profile all pull
docker compose --profile all up -d
```

### Updating Azure OpenAI Proxy

```bash
# Pull latest proxy image
docker pull stulzq/azure-openai-proxy:latest

# Restart proxy
docker compose restart azure-openai-proxy
```

### Database Backups

```bash
# Backup database
docker exec inbox-zero pg_dump -U postgres inboxzero > backup.sql

# Restore database
docker exec -i inbox-zero psql -U postgres inboxzero < backup.sql
```

## Security Considerations

1. **API Keys:** Never commit `.env` or `config.yaml` with real credentials to version control
2. **Docker volumes:** Database and Redis data persisted in named volumes
3. **Network isolation:** All services communicate via internal Docker network
4. **Proxy security:** Azure OpenAI proxy does not log or store API keys
5. **HTTPS:** In production, use reverse proxy (nginx/Caddy) with SSL termination

## Performance Tuning

### Allocate More Resources

**Docker Desktop Settings:**
- CPUs: 4-6 cores
- Memory: 8-12 GB
- Swap: 2-4 GB

**docker-compose.yml resource limits:**
```yaml
web:
  deploy:
    resources:
      limits:
        cpus: '2.0'
        memory: 2G
      reservations:
        cpus: '1.0'
        memory: 1G
```

## Support & Documentation

- **Inbox Zero Documentation:** https://docs.getinboxzero.com/
- **Azure OpenAI Proxy:** https://github.com/Eventus-Whole-Health/azure-openai-proxy
- **Original Inbox Zero:** https://github.com/elie222/inbox-zero
- **Azure OpenAI Documentation:** https://learn.microsoft.com/en-us/azure/ai-services/openai/

## Version Information

- **Inbox Zero Version:** Latest from main branch (as of 2025-12-23)
- **Azure OpenAI Proxy:** stulzq/azure-openai-proxy:latest
- **Docker Compose:** v2.x
- **Node.js (in container):** 16.x
- **PostgreSQL:** 16
- **Redis:** 7

---

# Deployment Option 2: Azure App Service

## Overview

Production deployment using Azure managed services for high availability and scalability. Uses the official `ghcr.io/elie222/inbox-zero:latest` Docker image without modifications.

**URL:** https://inbox-zero-web.azurewebsites.net

## Architecture

```
User → inbox-zero-web.azurewebsites.net (Azure Web App)
         ↓ Azure OpenAI API calls
       Azure OpenAI (equip-openai-prod)
         ↓ Redis calls via HTTP
       inbox-zero-redis-proxy.azurewebsites.net (Redis Proxy Web App)
         ↓ Port 6379
       inbox-zero-redis.redis.cache.windows.net (Azure Cache for Redis)
         ↓ Database calls
       keystone-platform-postgres.postgres.database.azure.com (PostgreSQL)
```

## Current Configuration

### Azure Resources

**Resource Group:** `rg-keystone-platform`
**Region:** East US 2

| Resource | Type | Configuration |
|----------|------|---------------|
| `inbox-zero-web` | Azure Web App | P1v3, Linux, Docker image: `ghcr.io/elie222/inbox-zero:latest` |
| `inbox-zero-redis-proxy` | Azure Web App | P1v3, Linux, Docker image: `hiett/serverless-redis-http:latest` |
| `inbox-zero-redis` | Azure Cache for Redis | Standard C1, 1GB, TLS enabled |
| `keystone-platform-postgres` | PostgreSQL Flexible Server | Burstable B1ms, 32GB storage |
| `equip-openai-prod` | Azure OpenAI (shared) | Deployments: `gpt-4.1-mini`, `gpt-4.1`, `gpt-5-chat` |

**App Service Plan:** `keystone-platform-asp` (P1v3, shared by both web apps)

## Configuration Details

### Redis HTTP Proxy

**Service:** `inbox-zero-redis-proxy.azurewebsites.net`
**Purpose:** Bridges HTTP Redis client (Upstash) to TCP Redis protocol (Azure Cache)

**Environment Variables:**
```bash
REDIS_HOST=inbox-zero-redis.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=[from Azure Redis access keys]
USE_TLS=true
TOKEN=[generated secret for app authentication]
```

**Why needed:** The inbox-zero Docker image uses Upstash Redis client (HTTP-based), but Azure Cache for Redis uses standard TCP protocol. This proxy translates between them.

### Database Configuration

**Server:** `keystone-platform-postgres.postgres.database.azure.com`
**Database:** `inboxzero`
**User:** `dify_admin` (must own all tables for migrations)

**Connection String:**
```
postgresql://dify_admin:[password]@keystone-platform-postgres.postgres.database.azure.com:5432/inboxzero?sslmode=require
```

**Credentials:** Stored in Azure Key Vault (`keystone-vault`)
- Username: `postgres-dify-admin-username`
- Password: `postgres-dify-admin-password`

### Microsoft OAuth Configuration

**App Registration:** `InboxZero` (`ff5b0387-9f92-42fd-951b-c7567ffec006`)

**Redirect URIs:**
- `https://inbox-zero-web.azurewebsites.net/api/auth/callback/microsoft`
- `https://inbox-zero-web.azurewebsites.net/api/outlook/linking/callback`
- `https://inbox-zero-web.azurewebsites.net/api/outlook/calendar/callback`

**API Permissions:**
- Mail.Read
- Mail.Send
- offline_access

### Application Environment Variables

**Azure App: `inbox-zero-web`**

```bash
# Database
DATABASE_URL=postgresql://dify_admin:[password]@keystone-platform-postgres.postgres.database.azure.com:5432/inboxzero?sslmode=require
DIRECT_URL=[same as DATABASE_URL]

# Microsoft OAuth
MICROSOFT_CLIENT_ID=ff5b0387-9f92-42fd-951b-c7567ffec006
MICROSOFT_CLIENT_SECRET=[from Key Vault]
MICROSOFT_TENANT_ID=[your tenant ID]
MICROSOFT_WEBHOOK_CLIENT_STATE=[generated secret]

# Redis (via HTTP proxy)
UPSTASH_REDIS_URL=https://inbox-zero-redis-proxy.azurewebsites.net
UPSTASH_REDIS_TOKEN=[matches proxy TOKEN]

# Azure OpenAI
OPENAI_API_KEY=[from Key Vault: AZURE-OPENAI-API-KEY]
OPENAI_BASE_URL=https://equip-openai.openai.azure.com/openai/v1
DEFAULT_LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-4.1-mini
ECONOMY_LLM_PROVIDER=openai
ECONOMY_LLM_MODEL=gpt-4.1-mini

# Application URLs
NEXT_PUBLIC_BASE_URL=https://inbox-zero-web.azurewebsites.net
WEBHOOK_URL=https://inbox-zero-web.azurewebsites.net
INTERNAL_API_URL=http://localhost:3000

# Security Secrets (all generated via openssl)
AUTH_SECRET=[base64 encoded, 32 bytes]
EMAIL_ENCRYPT_SECRET=[base64 encoded, 32 bytes]
EMAIL_ENCRYPT_SALT=[base64 encoded, 16 bytes]
INTERNAL_API_KEY=[hex encoded, 32 bytes]
API_KEY_SALT=[hex encoded, 16 bytes]
CRON_SECRET=[hex encoded, 32 bytes]

# Feature Flags
NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS=true
LOG_ZOD_ERRORS=true

# Google (dummy values - not used)
GOOGLE_CLIENT_ID=dummy-google-not-used
GOOGLE_CLIENT_SECRET=dummy-google-not-used
GOOGLE_PUBSUB_TOPIC_NAME=projects/dummy/topics/dummy

# Container Settings
WEBSITES_ENABLE_APP_SERVICE_STORAGE=false
WEBSITES_PORT=3000
DOCKER_REGISTRY_SERVER_URL=https://ghcr.io
```

## Key Implementation Notes

### Redis Proxy Architecture

The Redis proxy (`inbox-zero-redis-proxy`) is required because:
- **Inbox-zero uses:** Upstash Redis client (HTTP-based)
- **Azure provides:** Standard Redis (TCP protocol on port 6379/6380)
- **Solution:** HTTP-to-TCP proxy translates requests between the two protocols

This allows using Azure's managed Redis without modifying the inbox-zero application code.

### Database User Ownership

The `dify_admin` user owns all tables in the `inboxzero` database. This is critical for:
- Running Prisma migrations
- Creating/modifying tables
- Managing the `_prisma_migrations` tracking table

**Note:** Using a different user will cause "permission denied" errors during migrations.

### Security & Data Residency

- **All secrets** stored in Azure Key Vault (`keystone-vault`)
- **All data** stays within the Azure tenant (no third-party services)
- **Email data** cached in Azure Redis (encrypted in transit via TLS)
- **PostgreSQL** allows Azure services via firewall rule (0.0.0.0)
- **Authentication** via Microsoft OAuth only (Google disabled)

## Common Operations

### Viewing Logs
```bash
# Stream live logs
az webapp log tail --name inbox-zero-web --resource-group rg-keystone-platform

# Download logs
az webapp log download --name inbox-zero-web --resource-group rg-keystone-platform --log-file inbox-zero-logs.zip
```

### Restarting Services
```bash
# Restart main app
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform

# Restart Redis proxy
az webapp restart --name inbox-zero-redis-proxy --resource-group rg-keystone-platform
```

### Updating Configuration
```bash
# Update environment variable
az webapp config appsettings set --name inbox-zero-web --resource-group rg-keystone-platform --settings KEY="VALUE"

# Restart to apply
az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
```

## Known Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Database connection failed | Wrong server name or credentials | Verify DATABASE_URL uses `keystone-platform-postgres` and `dify_admin` user |
| Migration permission denied | User doesn't own tables | Ensure using `dify_admin` (table owner) |
| Redis connection failed | Proxy not running or wrong token | Check proxy is running, verify UPSTASH_REDIS_TOKEN matches |
| OAuth redirect error | Missing redirect URI | Add URL to app registration redirect URIs |
| AI Assistant not working | Model deployment doesn't exist | Verify DEFAULT_LLM_MODEL matches Azure OpenAI deployment name |

## Cost Information

**Estimated Monthly Cost:** ~$205/month

| Resource | Tier | Est. Cost |
|----------|------|-----------|
| App Service Plan (P1v3) | Shared by 2 apps | ~$100 |
| Azure Cache for Redis (C1) | Standard 1GB | ~$75 |
| PostgreSQL (B1ms) | Shared resource | ~$30 |
| Azure OpenAI | Pay-per-use | Variable |

**Note:** App Service Plan cost is shared with other applications on the same plan.

---

**Last Updated:** December 28, 2025
**Implementation by:** Claude (Anthropic) & Josh Gilpatrick
**Organization:** Eventus Whole Health
