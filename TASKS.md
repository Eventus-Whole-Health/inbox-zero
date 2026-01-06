# Inbox Zero - Tasks & Todos

## Open Tasks

### 1. Fix Client-Side Feature Flags in Docker Deployment

**Priority:** Medium
**Status:** Pending
**Estimated Effort:** 2-3 hours

#### Problem Description

The inbox-zero Azure deployment is using the pre-built Docker image `ghcr.io/elie222/inbox-zero:latest`, which has a startup script that replaces certain `NEXT_PUBLIC_*` environment variables at runtime. However, several feature flags are missing from this script, causing them to be unavailable on the client-side.

**Current Behavior:**
- Feature flags set in Azure App Service configuration (runtime) are not visible to the client-side JavaScript
- Menu items for features like "Meeting Briefs," "Integrations," and "Contacts" appear briefly then disappear
- The startup script (`docker/scripts/start.sh`) only handles 3 of the 5 feature flags

**Why This Happens:**
- Next.js bakes `NEXT_PUBLIC_*` variables into the JavaScript bundle at **build time**
- The pre-built Docker image doesn't include our custom feature flag values
- The startup script uses a placeholder replacement mechanism for some variables, but not all

**Variables Currently Handled by Startup Script:**
- ✅ `NEXT_PUBLIC_BASE_URL`
- ✅ `NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS`
- ✅ `NEXT_PUBLIC_EMAIL_SEND_ENABLED`

**Variables Missing from Startup Script:**
- ❌ `NEXT_PUBLIC_MEETING_BRIEFS_ENABLED`
- ❌ `NEXT_PUBLIC_DIGEST_ENABLED`
- ❌ `NEXT_PUBLIC_INTEGRATIONS_ENABLED`
- ❌ `NEXT_PUBLIC_CONTACTS_ENABLED`

#### Solution

Build and deploy a custom Docker image with an updated startup script that includes all feature flags.

#### Steps to Resolve

1. **Update the startup script** (`docker/scripts/start.sh`):
   ```bash
   # Add these sections after line 21:

   if [ -n "$NEXT_PUBLIC_MEETING_BRIEFS_ENABLED" ]; then
       /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_MEETING_BRIEFS_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_MEETING_BRIEFS_ENABLED"
   fi

   if [ -n "$NEXT_PUBLIC_DIGEST_ENABLED" ]; then
       /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_DIGEST_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_DIGEST_ENABLED"
   fi

   if [ -n "$NEXT_PUBLIC_INTEGRATIONS_ENABLED" ]; then
       /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_INTEGRATIONS_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_INTEGRATIONS_ENABLED"
   fi

   if [ -n "$NEXT_PUBLIC_CONTACTS_ENABLED" ]; then
       /app/docker/scripts/replace-placeholder.sh "NEXT_PUBLIC_CONTACTS_ENABLED_PLACEHOLDER" "$NEXT_PUBLIC_CONTACTS_ENABLED"
   fi
   ```

2. **Build custom Docker image:**
   ```bash
   cd /Users/jgilpatrick/Library/CloudStorage/OneDrive-EventusWholeHealth/Development/active/inbox-zero
   docker build -f docker/Dockerfile.prod -t inbox-zero-custom:latest .
   ```

3. **Create Azure Container Registry (if not exists):**
   ```bash
   # Create ACR
   az acr create --name <registry-name> --resource-group rg-keystone-platform --sku Basic

   # Login to ACR
   az acr login --name <registry-name>
   ```

4. **Tag and push to ACR:**
   ```bash
   docker tag inbox-zero-custom:latest <registry-name>.azurecr.io/inbox-zero:latest
   docker push <registry-name>.azurecr.io/inbox-zero:latest
   ```

5. **Update Azure App Service to use custom image:**
   ```bash
   az webapp config container set \
     --name inbox-zero-web \
     --resource-group rg-keystone-platform \
     --docker-custom-image-name <registry-name>.azurecr.io/inbox-zero:latest \
     --docker-registry-server-url https://<registry-name>.azurecr.io
   ```

6. **Restart the app:**
   ```bash
   az webapp restart --name inbox-zero-web --resource-group rg-keystone-platform
   ```

#### Expected Outcome

After completing these steps:
- All feature flags set in Azure App Service will be properly injected into the client-side bundle
- Menu items for enabled features will appear and remain visible
- No console errors related to missing environment variables

#### Dependencies

- Docker installed locally
- Azure CLI configured
- Access to create Azure Container Registry (or use existing)
- Push access to Azure resources

#### References

- Startup script: `/Users/jgilpatrick/Library/CloudStorage/OneDrive-EventusWholeHealth/Development/active/inbox-zero/docker/scripts/start.sh`
- Azure App Service: `inbox-zero-web` in `rg-keystone-platform`
- Current Docker image: `ghcr.io/elie222/inbox-zero:latest`

---

## Completed Tasks

### ✅ Configure Automated Email Watch Renewal (Completed: 2025-12-28)

**Problem:** Azure deployment wasn't applying rules to new messages because email watch subscriptions were expiring without renewal.

**Solution:**
- Added watch renewal endpoint (`/api/watch/all`) to central scheduler
- Configured to run every 6 hours (4x daily)
- Modified scheduler to support multiple minutes per hour for hourly frequency
- Added meeting briefs endpoint (`/api/meeting-briefs`) to run hourly

**Database Entries:**
- Schedule ID 30: watch_renewal (daily at 00:00, 06:00, 12:00, 18:00)
- Schedule ID 31: meeting_briefs (hourly at minute 15)

**Code Changes:**
- Modified `apps_services/functions/scheduler/timer_function.py` to support `{"minutes": [0, 15, 30, 45]}` configuration for hourly schedules

---

**Last Updated:** 2025-12-28
