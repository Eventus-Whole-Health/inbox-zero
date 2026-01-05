# Security Audit Report: Inbox-Zero Application

**Date:** January 5, 2026
**Prepared For:** Eventus Whole Health Leadership
**Application:** Inbox-Zero Email Management Platform
**Compliance Focus:** HIPAA (Health Insurance Portability and Accountability Act)

---

## Executive Summary

This security audit evaluated the inbox-zero application for deployment readiness in a healthcare environment where HIPAA compliance is mandatory. The audit identified **3 Critical**, **4 High**, and several Medium-severity findings that must be addressed before production deployment.

**Key Finding:** No sensitive credentials were found exposed in the git repository or its history. The `.env` files are properly excluded from version control.

### Risk Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 3 | Requires immediate attention |
| High | 4 | Must be addressed before production |
| Medium | 5 | Should be addressed in near term |

---

## Critical Findings

### 1. User AI API Keys Stored Without Encryption

**Location:** `apps/web/prisma/schema.prisma` (Line 88) and database storage

**What This Means (CEO Summary):**
When users connect their own AI services (like OpenAI or Anthropic) to the platform, their API keys are stored in our database as plain, readable text. Meanwhile, other sensitive tokens (like Google/Microsoft login credentials) ARE encrypted. This inconsistency means that if someone gained unauthorized database access, they could immediately use these AI API keys to make expensive API calls at the users' expense, or potentially access AI-generated content tied to those accounts.

**Why This Matters for HIPAA:**
While AI API keys themselves aren't Protected Health Information (PHI), they provide access to systems that may process PHI. HIPAA's Security Rule (164.312(a)(2)(iv)) requires encryption of electronic PHI. If AI services are processing patient-related emails, the keys that access those services should be protected with the same rigor as other credentials.

**Technical Details:**
- The `aiApiKey` field in the User model stores third-party AI credentials in plaintext
- The application already has robust AES-256-GCM encryption for OAuth tokens (`apps/web/utils/encryption.ts`)
- The encryption is applied via Prisma extensions (`apps/web/utils/prisma-extensions.ts`) but `aiApiKey` was not included

**Evidence:**
```prisma
// schema.prisma - Line 88
model User {
  aiProvider    String?
  aiModel       String?
  aiApiKey      String?   // <-- Stored in plaintext
  webhookSecret String?   // <-- Also stored in plaintext
}
```

**Remediation:**
1. Add `aiApiKey` to the existing Prisma encryption extensions
2. Create a migration to encrypt existing plaintext values
3. Consider also encrypting `webhookSecret`

**Estimated Effort:** 1-2 days

---

### 2. Microsoft Webhook Authentication Can Be Bypassed

**Location:** `apps/web/app/api/outlook/webhook/route.ts` (Lines 47-58) and `apps/web/env.ts` (Line 91)

**What This Means (CEO Summary):**
When Microsoft sends us notifications about new emails, we're supposed to verify that the notification actually came from Microsoft using a secret code. However, if an administrator forgets to configure this secret code, the system doesn't block the requests—it lets them through. An attacker who discovers this could send fake "new email" notifications to our system, potentially triggering unauthorized processing of data or denial of service attacks.

**Why This Matters for HIPAA:**
This represents a failure of access controls required under HIPAA 164.312(d) (Person or Entity Authentication). An unauthenticated webhook could be exploited to trigger email processing, access user data, or cause system instability. This could lead to unauthorized access to PHI contained in emails.

**Technical Details:**
- `MICROSOFT_WEBHOOK_CLIENT_STATE` is defined as optional in `env.ts`
- The validation logic: `notification.clientState !== env.MICROSOFT_WEBHOOK_CLIENT_STATE`
- If both values are `undefined`, this check evaluates to `false` (undefined !== undefined = false), meaning the request passes validation

**Evidence:**
```typescript
// env.ts - Line 91
MICROSOFT_WEBHOOK_CLIENT_STATE: z.string().optional(),

// webhook/route.ts - Lines 47-58
if (notification.clientState !== env.MICROSOFT_WEBHOOK_CLIENT_STATE) {
  // This check PASSES if both are undefined!
  logger.warn("Invalid or missing clientState", { ... });
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}
```

**Remediation:**
1. Add a fail-closed check: reject all webhooks if the environment variable is not configured
2. Make `MICROSOFT_WEBHOOK_CLIENT_STATE` required (not optional) in production
3. Add startup validation that fails deployment if required security settings are missing

**Estimated Effort:** 4-8 hours

---

### 3. No Rate Limiting on API Endpoints

**Location:** All API routes under `apps/web/app/api/`

**What This Means (CEO Summary):**
Our application has no limits on how many requests a user or attacker can make per second. This means someone could bombard our login page with password guesses (brute force attack), flood our AI features with requests (costing us thousands in API fees), or simply crash our servers by overwhelming them with traffic. Any public-facing web application handling sensitive data needs these protections.

**Why This Matters for HIPAA:**
HIPAA requires protection against unauthorized access attempts (164.312(a)(1) Access Controls). Without rate limiting:
- Brute force attacks on authentication could succeed
- Denial of service could prevent legitimate access to PHI
- AI endpoint abuse could exhaust resources and affect system availability
- User enumeration attacks could identify accounts in the system

**Technical Details:**
- Searched entire codebase for rate limiting implementation
- Found only retry logic for *outgoing* API calls (Gmail rate limit handling)
- No middleware or guards exist for *incoming* requests
- The application uses Upstash Redis which has a rate limiting library available

**Evidence:**
A grep for `rateLimit|rate-limit|Ratelimit` found only:
- `apps/web/utils/gmail/retry.ts` - Handles Gmail API rate limits (outgoing calls)
- No incoming request rate limiting middleware

**Remediation:**
1. Implement rate limiting using `@upstash/ratelimit` (already have Upstash Redis)
2. Apply stricter limits to authentication endpoints
3. Apply cost-aware limits to AI endpoints
4. Consider implementing CAPTCHA for public-facing forms

**Estimated Effort:** 2-3 days

---

## High Severity Findings

### 4. Google PubSub Webhook Token Optional

**Location:** `apps/web/env.ts` (Line 89)

**What This Means (CEO Summary):**
Similar to the Microsoft webhook issue, our Google email notification system has an optional security token. If not configured, anyone who knows our webhook URL could send fake notifications, potentially triggering unauthorized email processing.

**Why This Matters for HIPAA:**
This creates an authentication bypass vulnerability that could allow unauthorized triggering of email processing systems that handle PHI.

**Technical Details:**
```typescript
// env.ts - Line 89
GOOGLE_PUBSUB_VERIFICATION_TOKEN: z.string().optional(),
```

**Remediation:**
1. Make token required in production environments
2. Add explicit validation that rejects requests if token is not configured
3. Document required environment variables for production deployment

**Estimated Effort:** 4-8 hours

---

### 5. Insufficient HIPAA Audit Logging

**Location:** `apps/web/utils/logger.ts` and throughout the application

**What This Means (CEO Summary):**
HIPAA requires us to keep detailed records of who accessed what patient information and when. While our application has logging capabilities, it doesn't specifically track the "who, what, when" of email access in a way that would satisfy a HIPAA audit. If regulators ask "show us everyone who accessed John Doe's emails in the last 6 months," we couldn't easily produce that report.

**Why This Matters for HIPAA:**
HIPAA 164.312(b) explicitly requires audit controls with the capability to record and examine access to PHI. Healthcare organizations must maintain these logs for a minimum of 6 years.

**Technical Details:**
The application has:
- General logging with sensitive field redaction (good)
- Application performance monitoring integration (good)

The application lacks:
- Dedicated PHI access audit trail
- User session tracking across requests
- Data modification audit logging
- Log retention policy enforcement
- Failed access attempt tracking

**Remediation:**
1. Create a dedicated audit logging service for PHI access events
2. Log: User ID, Action Type, Resource Accessed, Timestamp, IP Address
3. Implement log retention policies (minimum 6 years for HIPAA)
4. Consider immutable audit log storage (Azure Blob with legal hold)
5. Create audit reporting capabilities

**Estimated Effort:** 1-2 weeks

---

### 6. Email Content Not Encrypted at Application Level

**Location:** Database schema - multiple models storing email content

**What This Means (CEO Summary):**
When we store email content, AI-generated responses, and user data in our database, we rely solely on database-level encryption. While database encryption protects against disk theft, it doesn't protect against a database breach where an attacker gains query access. Defense in depth suggests encrypting PHI at the application level as well.

**Why This Matters for HIPAA:**
HIPAA 164.312(a)(2)(iv) requires encryption of ePHI. While database-level encryption (TDE) provides baseline protection, application-level encryption of content fields provides additional defense against SQL injection, backup exposure, and database credential compromise.

**Technical Details:**
The following fields store potentially sensitive content without application-level encryption:
- `DigestItem.content` - Email digest summaries
- `Knowledge.content` - User knowledge base
- `ChatMessage.parts` - AI chat conversations
- `Action.content` - Email drafts and replies

**Remediation:**
1. Evaluate which content fields contain PHI
2. Extend existing encryption utilities to protect identified fields
3. Implement encryption key management with rotation capability
4. Consider field-level encryption for highly sensitive data

**Estimated Effort:** 1-2 weeks

---

### 7. No Data Retention or Deletion Policies

**Location:** Database schema and application logic

**What This Means (CEO Summary):**
Our application has no automated way to delete old data or respect users' requests to be forgotten. HIPAA requires defined retention periods, and users have rights to request deletion of their data. Currently, once data enters our system, it stays forever unless manually removed.

**Why This Matters for HIPAA:**
- HIPAA 164.530(j) requires retention and destruction policies
- Right to amend (164.526) requires ability to modify PHI
- Minimum necessary principle suggests not retaining PHI longer than needed

**Technical Details:**
The schema lacks:
- Soft delete mechanisms (`deletedAt` timestamps)
- Retention period configurations
- Automated cleanup jobs
- User data export functionality
- Cascade deletion rules for user account removal

**Remediation:**
1. Implement soft delete with `deletedAt` timestamps
2. Create data retention policy configuration
3. Build automated cleanup jobs for expired data
4. Create user data export functionality (GDPR/HIPAA compliance)
5. Implement secure deletion with audit logging

**Estimated Effort:** 2-3 weeks

---

## Medium Severity Findings

### 8. Docker Build Contains Placeholder Secrets

**Location:** `docker/Dockerfile.prod` (Lines 48-67)

**What This Means (CEO Summary):**
Our Docker deployment process uses placeholder/dummy values during the build phase to satisfy the application's startup requirements. While these are replaced at runtime with real values, security best practices recommend not embedding any secret patterns in container images, even dummy ones.

**Risk Level:** Medium (Low actual risk if properly deployed)

**Remediation:**
- Use Docker BuildKit secrets instead of environment variables
- Use ARG instead of ENV for build-only values
- Add image scanning to CI/CD pipeline

---

### 9. Third-Party Services Require Business Associate Agreements

**Location:** Throughout the application - various integrations

**What This Means (CEO Summary):**
HIPAA requires written agreements (Business Associate Agreements or BAAs) with any third party that may access PHI. Our application integrates with several services that would need BAAs before processing healthcare data.

**Services Requiring BAA Documentation:**
| Service | Purpose | BAA Available |
|---------|---------|---------------|
| Google (Gmail/Calendar) | Email access | Yes (Google Workspace) |
| Microsoft (Outlook) | Email access | Yes (Microsoft 365) |
| AI Providers (OpenAI, Anthropic) | Email processing | Varies by provider |
| Upstash | Redis caching | Requires verification |
| Database Provider | Data storage | Depends on provider |
| Error tracking (Sentry) | Logging | Requires verification |

**Remediation:**
1. Document all third-party services that may access PHI
2. Obtain BAAs from each HIPAA-covered vendor
3. Evaluate alternatives for vendors without BAA availability
4. Maintain BAA registry with renewal tracking

---

### 10. XSS Protection Could Be Strengthened

**Location:** `apps/web/components/email-list/EmailContents.tsx`

**What This Means (CEO Summary):**
When displaying email content (which could contain malicious code), we use good sanitization (DOMPurify). However, the iframe sandbox settings could be slightly tightened for maximum protection.

**Current Mitigation:** DOMPurify sanitization is implemented correctly. This is a minor hardening opportunity, not a critical vulnerability.

---

### 11. Session Management Not Explicitly Hardened

**Location:** Session model and authentication configuration

**What This Means (CEO Summary):**
While the application tracks session information (IP address, user agent), there's no evidence of session binding validation that would prevent session hijacking attacks.

**Remediation:**
- Implement session binding (validate IP/UA changes)
- Add configurable session timeouts
- Implement absolute session expiration

---

### 12. API Key Salt Configuration Inconsistent

**Location:** `apps/web/env.ts` (Line 113) and `apps/web/utils/api-key.ts`

**What This Means (CEO Summary):**
The salt used for API key hashing is marked as optional in configuration, but the code throws an error if it's not set. This inconsistency could cause runtime failures.

**Remediation:**
- Make `API_KEY_SALT` required in `env.ts`
- Add startup validation for all required security configurations

---

## Positive Security Findings

The audit identified several well-implemented security controls:

| Control | Location | Status |
|---------|----------|--------|
| OAuth Token Encryption | `utils/encryption.ts` | AES-256-GCM with proper IV |
| HTML Sanitization | `EmailContents.tsx` | DOMPurify with CSP |
| Stripe Webhook Validation | `stripe/webhook/route.ts` | Proper signature verification |
| Sensitive Field Redaction | `utils/logger.ts` | PII redacted in logs |
| Input Validation | Throughout | Zod schemas on API routes |
| API Key Hashing | `utils/api-key.ts` | scrypt implementation |

---

## HIPAA Compliance Summary

| Requirement | Reference | Current Status | Gap |
|-------------|-----------|----------------|-----|
| Access Controls | 164.312(a)(1) | Partial | Missing rate limiting, session hardening |
| Audit Controls | 164.312(b) | Missing | No PHI access audit trail |
| Integrity Controls | 164.312(c)(1) | Partial | No data modification tracking |
| Authentication | 164.312(d) | Partial | Webhook auth can be bypassed |
| Transmission Security | 164.312(e)(1) | Good | TLS enforced |
| Encryption at Rest | 164.312(a)(2)(iv) | Partial | Content not encrypted at app level |
| Business Associates | 164.502(e) | Missing | BAAs not documented |
| Retention Policies | 164.530(j) | Missing | No retention/deletion mechanisms |

---

## Remediation Roadmap

### Phase 1: Critical (Weeks 1-2)
1. Encrypt `aiApiKey` using existing encryption utilities
2. Fix Microsoft webhook fail-closed validation
3. Implement basic rate limiting on authentication endpoints

### Phase 2: High Priority (Weeks 3-6)
1. Fix Google PubSub token validation
2. Implement HIPAA audit logging
3. Add rate limiting to AI endpoints
4. Document and obtain BAAs from third-party vendors

### Phase 3: Medium Term (Weeks 7-12)
1. Implement data retention policies
2. Add content-level encryption for sensitive fields
3. Strengthen session management
4. Create user data export/deletion capabilities

### Phase 4: Ongoing
1. Regular security assessments
2. Penetration testing
3. Security training for development team
4. Incident response plan development

---

## Conclusion

The inbox-zero application has a solid security foundation with proper encryption for OAuth tokens, good input validation, and appropriate HTML sanitization. However, several gaps must be addressed before deployment in a HIPAA-regulated healthcare environment.

**Recommendation:** Do not deploy to production with PHI until Critical and High findings are remediated. Estimated timeline for minimum viable security: 4-6 weeks with dedicated resources.

---

*Report prepared by automated security audit with human verification*
*For questions, contact your security team*
