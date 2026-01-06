# Inbox Zero Search Error - Troubleshooting Session Status

**Date:** December 31, 2025 - January 2, 2026
**Issue:** Microsoft Graph API search returning "Unexpected end of JSON input" error
**Status:** ✅ RESOLVED AND DEPLOYED

---

## Resolution Summary

The Microsoft Graph SDK was failing to parse streaming JSON responses. The fix was to use direct `fetch()` instead of the SDK for search queries.

**Deployed:** January 2, 2026 at 05:45 UTC
**Container:** `acrkeystoneplatform.azurecr.io/inbox-zero:latest`
**Platform:** Azure Web App (`inbox-zero-web`)

---

## Objective

Fix the 500 error occurring when searching for messages in the inbox-zero AI assistant section. The search functionality was working previously but has stopped functioning.

---

## Critical Finding

**The Microsoft Graph SDK is the source of the problem, not the API itself.**

### Evidence

| Method | Result |
|--------|--------|
| Python `requests` library | ✅ Works - Returns 10 messages |
| Next.js `fetch()` directly | ✅ Works - Returns 5 messages |
| Microsoft Graph SDK `.get()` | ❌ Fails - "Unexpected end of JSON input" |

This was proven by:
1. Creating `test_graph_search.py` - a Python script that decrypts tokens from the database and calls the Graph API directly. **This worked perfectly.**
2. Creating a test API route in Next.js using `fetch()` instead of the SDK. **This also worked.**
3. The Microsoft Graph SDK consistently fails when parsing the response.

### Root Cause Hypothesis

The Microsoft Graph SDK (v3.0.7) has issues handling responses with `transfer-encoding: chunked`. The API returns valid JSON, but the SDK's response parsing fails before the full response is received.

---

## What We Tried (Session 2)

### 1. Local Development Setup ✅
- Stopped Docker container to test locally
- Started dev server with `pnpm dev --filter inbox-zero-ai`
- **Hit Application Insights bundling issues with Turbopack**

### 2. Fixed Application Insights Issues ✅
- Modified `instrumentation.ts` to use dynamic imports
- Modified `logger.ts` to use lazy loading for logger-config
- Eventually disabled App Insights for local dev in `logger-config.ts`

### 3. Implemented Fallback Mechanism ⚠️
- Added try-catch around Graph SDK call
- On JSON parsing error, fall back to showing recent messages (no search)
- **User rejected this**: "the search field just doesn't work at all now and so this isn't really a fix"

### 4. Python Direct API Test ✅
Created `test_graph_search.py` that:
- Connects to database to get user tokens
- Decrypts tokens using AES-256-GCM (matching Node.js encryption.ts)
- Refreshes access token using OAuth2 flow
- Calls Microsoft Graph API directly
- **Result: API works perfectly, returns valid JSON**

### 5. Next.js Direct Fetch Test ✅
Created test API route using `fetch()` instead of SDK:
```typescript
const response = await fetch(url, { headers });
const data = await response.json();
```
**Result: Worked perfectly, returned 5 messages**

### 6. Tried Direct Fetch in message.ts ❌
Replaced SDK call with direct fetch in the actual code.
**Result: User reported "no change" - reason unclear**

### 7. Compared with Upstream Repo ✅
Checked if we accidentally broke the code.
**Result: Code is identical to upstream `elie222/inbox-zero`**

### 8. Tested Next.js Update ❌
Updated Next.js from 16.0.10 to 16.1.1.
**Result: No improvement**

### 9. Reverted All Changes ✅
Per user request, all code changes were reverted:
```bash
git checkout apps/web/utils/outlook/message.ts
git checkout apps/web/package.json
```

---

## Files Created During Troubleshooting

### test_graph_search.py
Python script to test Graph API directly. **Keep this - useful for debugging.**

Key features:
- Decrypts tokens from database using AES-256-GCM
- Matches Node.js encryption.ts implementation exactly
- Refreshes access token via OAuth2
- Makes direct HTTP calls to Microsoft Graph API

Usage:
```bash
python test_graph_search.py [search_query]
# Default search term: "ambience"
```

---

## Key Questions Answered

| Question | Answer |
|----------|--------|
| What is Microsoft Graph API returning? | **Valid JSON** - Verified via Python and direct fetch |
| Does fallback work? | Yes, but rejected by user as not a real fix |
| Is this specific to certain search terms? | No, all searches fail with SDK |
| Is this a Microsoft service issue? | No, API works fine |
| Can we reproduce locally? | Yes, consistently reproducible |
| Is our code broken? | No, identical to upstream |

---

## What Didn't Cause the Issue

- ❌ Microsoft Graph API (works with direct calls)
- ❌ Authentication/tokens (tokens work fine)
- ❌ Code changes (identical to upstream)
- ❌ Next.js version (tested 16.0.10 and 16.1.1)
- ❌ Network/infrastructure (Python script works from same environment)

---

## Recommended Next Steps

### Option 1: Replace SDK with Direct Fetch (Recommended)

The Microsoft Graph SDK appears to be the problem. Replace SDK calls with direct `fetch()` in `message.ts`:

```typescript
// Instead of:
const response = await withOutlookRetry(() => request.get(), logger);

// Use:
const headers = {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  'Prefer': 'IdType="ImmutableId"'
};
const url = `https://graph.microsoft.com/v1.0/me/messages?${params}`;
const response = await fetch(url, { headers });
const data = await response.json();
```

**Note:** This was attempted but user reported "no change". May need more thorough implementation or investigation into why it didn't work.

### Option 2: Investigate SDK Version

- Check if downgrading `@microsoft/microsoft-graph-client` helps
- Look for issues in SDK GitHub repo related to chunked responses
- Test with different SDK versions

### Option 3: Check for Recent Microsoft Changes

- The search was working "a few days ago" per user
- Microsoft may have changed response format or headers
- Check Microsoft 365 Service Health for any announcements

### Option 4: Add Response Debugging

When the direct fetch replacement "didn't work", we didn't capture why. Add logging:

```typescript
const response = await fetch(url, { headers });
logger.info("Graph API response", {
  status: response.status,
  headers: Object.fromEntries(response.headers),
  contentType: response.headers.get('content-type'),
  transferEncoding: response.headers.get('transfer-encoding'),
});
const text = await response.text();
logger.info("Graph API body", { length: text.length, preview: text.slice(0, 200) });
const data = JSON.parse(text);
```

---

## Environment

- **Platform:** Azure Web App (Linux) / Local dev on macOS
- **Docker Image:** `ghcr.io/elie222/inbox-zero:latest`
- **Node.js:** 22.x
- **Microsoft Graph SDK:** @microsoft/microsoft-graph-client v3.0.7
- **User:** jgilpatrick@eventuswh.com
- **Tenant:** fe55f06e-9f48-4dfe-af8b-3bdefdf54f81

---

## Session History

### Session 1 (Earlier)
- Initial investigation
- Identified error pattern
- Set up logging infrastructure
- Created fallback mechanism (code only, not deployed)

### Session 2 (Current - December 31, 2025)
- Tested locally
- Fixed App Insights bundling issues
- Implemented and tested fallback (rejected by user)
- Created Python test script proving API works
- Created Next.js test route proving fetch works
- Tried direct fetch replacement (didn't work for user)
- Compared with upstream (identical)
- **Reverted all changes per user request**

---

## Files Modified (All Reverted)

All changes from this session have been reverted to original state:
- `apps/web/utils/outlook/message.ts` - Reverted
- `apps/web/package.json` - Reverted

## Files Still Modified from Session 1

These changes remain but are NOT deployed:
- `apps/web/instrumentation.ts` - Dynamic imports for App Insights
- `apps/web/utils/logger.ts` - Lazy loading for logger-config
- `apps/web/utils/logger-config.ts` - Created (App Insights disabled for local dev)

---

## Conclusion - RESOLVED

The issue was the Microsoft Graph SDK failing to parse valid JSON responses with chunked transfer-encoding.

### Solution Implemented

Direct `fetch()` calls replace SDK for search queries in `apps/web/utils/outlook/message.ts`:

```typescript
if (hasSearchQuery) {
  const searchTerm = effectiveSearchQuery!.replace(/^"|"$/g, "");
  const url = `https://graph.microsoft.com/v1.0/me/messages?$select=${MESSAGE_SELECT_FIELDS}&$top=${maxResults}&$search="${encodeURIComponent(searchTerm)}"`;

  const fetchResponse = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${client.getAccessToken()}` },
  });

  const response = await fetchResponse.json();
  // ... process response
}
```

### Deployment Details

| Step | Status |
|------|--------|
| Fix committed | ✅ `89a320732` |
| Docker build fix | ✅ `e0a8de28d` |
| Image built (linux/amd64) | ✅ |
| Pushed to ACR | ✅ |
| Azure Web App updated | ✅ |
| Container running | ✅ |
| Site responding (HTTP 200) | ✅ |

### Files Modified (Committed)

- `apps/web/utils/outlook/message.ts` - Direct fetch for search
- `docker/Dockerfile.prod` - Fixed Next.js binary path
- `apps/web/utils/logger-config.ts` - Fixed pino-seq type (TypeScript error)

### Key Learnings

1. **Architecture matters**: Apple Silicon (arm64) builds don't run on Azure (amd64). Use `docker buildx --platform linux/amd64`.
2. **pnpm shamefully-hoist**: Moves modules to root `node_modules`, not app-level. Use `/app/node_modules/.bin/next build`.
3. **ACR auth**: Admin credentials work most reliably for Azure Web App pulls.
4. **GHCR fine-grained PATs**: Don't support packages - need Classic PAT with `write:packages`.
