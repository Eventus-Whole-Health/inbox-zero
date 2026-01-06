# Archived Files

This directory contains files from deprecated or failed deployment attempts that are no longer in use but preserved for reference.

## Azure Container Apps Deployment (Deprecated)

**Date:** December 2024
**Status:** Failed - Replaced with Azure App Service deployment

The following files were created for an Azure Container Apps deployment that was ultimately abandoned in favor of Azure App Service (Web Apps):

### Files:

1. **inbox-zero-cron.yaml**
   - Azure Container Apps job definition for cron tasks
   - Configured for managed environment: `keystone-platform-aca-env`
   - Replaced by: App Service's built-in scheduling capabilities

2. **upstash-redis.yaml**
   - Azure Container Apps container definition for all-in-one Redis + HTTP proxy
   - Attempted to run Redis server and serverless-redis-http proxy in single container
   - Replaced by:
     - Azure Cache for Redis (managed service)
     - Separate Web App for Redis HTTP proxy

3. **redis-startup.sh**
   - Startup script for the all-in-one Redis container
   - Installed Redis and serverless-redis-http proxy
   - No longer needed with managed Azure services

## Why These Were Deprecated

The Azure Container Apps approach failed because:
1. **Redis connectivity issues** - The Upstash HTTP client couldn't reliably connect
2. **Complexity** - Managing custom container images for infrastructure was unnecessary
3. **Better alternatives** - Azure Web Apps with managed services proved more reliable

## Current Architecture

See [IMPLEMENTATION.md](../../IMPLEMENTATION.md) for the current working Azure App Service deployment.

---

**Archived:** December 28, 2025
