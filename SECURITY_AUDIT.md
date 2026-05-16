# PromptPerfect Security Audit — Week 7

**Auditor:** Vindhya HK  
**Date:** 2026-05-16  
**Repo:** promptperfect @ main  
**Scope:** All route handlers under `src/app/api/`

---

## Summary Table

| Route | Auth | Input Validation | Error Safety | Rate Limiting | Verdict |
|---|---|---|---|---|---|
| `/api/auth/login` | N/A | ✅ | ✅ | ✅ | **PASS** |
| `/api/auth/signup` | N/A | ✅ | ⚠️ | ✅ | **PASS WITH NOTES** |
| `/api/auth/claim-guest-history` | ✅ | ✅ | ✅ | ❌ | **PASS WITH NOTES** |
| `/api/verify-key` | ❌ | ✅ | ✅ | ❌ | **NEEDS FIX** |
| `/api/optimize-sync` | ⚠️ | ✅ | ✅ | ❌ | **NEEDS FIX** |
| `/api/history` | ✅ | ✅ | ⚠️ | ❌ | **PASS WITH NOTES** |
| `/api/save-history` | ✅ | ✅ | ⚠️ | ❌ | **PASS WITH NOTES** |
| `/api/guest-usage` | N/A | ⚠️ | ✅ | ❌ | **PASS WITH NOTES** |
| `/api/profile` | ✅ | ⚠️ | ⚠️ | ❌ | **PASS WITH NOTES** |

---

## Route: /api/auth/login (POST)

**File:** `src/app/api/auth/login/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | N/A | This IS the login route |
| Input validation | ✅ | Checks for missing email/password; returns `400` with `"Email and password are required"` |
| Error response safety | ✅ | Failed login returns generic `"Invalid email or password"` (401). Email-not-confirmed returns a safe user-facing message with `code: EMAIL_NOT_CONFIRMED`. No Supabase internals exposed. |
| Rate limiting | ✅ | `checkRateLimit(ip)` called at the top — 5 attempts per IP per 60 s; returns `429` on breach |

**Verdict:** PASS

---

## Route: /api/auth/signup (POST)

**File:** `src/app/api/auth/signup/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | N/A | This IS the signup route |
| Input validation | ✅ | `validateEmail` + `validatePassword` called before any DB work; both return `400` on failure. `name` field is optional and safely trimmed. |
| Error response safety | ⚠️ | Three paths forward raw Supabase/DB error strings to the client: (1) `clarifySignupError(adminMsg)` on auth-db errors (deliberately verbose for self-hosted debugging); (2) `signUpRes.error.message` forwarded when admin create fails and anon signUp also fails; (3) `insertErr.message` forwarded when the `pp_users` row insert fails (only for non-`23505` codes). These messages can include internal table names and Postgres error details. |
| Rate limiting | ✅ | `checkRateLimit(ip)` called; same 5/60 s policy as login |

**Verdict:** PASS WITH NOTES

**Notes:**
- Consider normalising all fallback error paths through a single safe-error wrapper (e.g., return `"Sign up failed"` for non-duplicate, non-validation DB errors) to avoid leaking Postgres internals (`Database error creating new user`, trigger names, etc.) to end-users. The `clarifySignupError` hint about broken triggers is particularly verbose and should only be emitted server-side (`console.error`) rather than sent to the browser.

---

## Route: /api/auth/claim-guest-history (POST)

**File:** `src/app/api/auth/claim-guest-history/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `createRouteHandlerClient().auth.getUser()` called; returns `401` if missing or invalid |
| Input validation | ✅ | `guestId` validated: non-empty, ≤ 80 chars, UUID or `guest`-prefixed only. `targetSessionId` validated: non-empty, ≤ 200 chars. Cross-equality check (`guestId !== targetSessionId`) prevents self-claim. Returns `400` on any violation. |
| Error response safety | ✅ | DB errors return generic `"Update failed"` (500); internals only logged server-side and only in non-production. |
| Rate limiting | ❌ | No rate limiting. An authenticated attacker could hammer this endpoint to enumerate or overwrite history rows. |

**Verdict:** PASS WITH NOTES

**Notes:**
- Add per-user rate limiting (e.g., max 10 claims per minute) to prevent brute-force session ID enumeration.

---

## Route: /api/verify-key (POST)

**File:** `src/app/api/verify-key/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ❌ | No `getUser()` call. Any unauthenticated caller can probe API keys against OpenAI, Gemini, and Anthropic. |
| Input validation | ✅ | `provider` checked against a whitelist (`openai`, `gemini`, `anthropic`); `apiKey` must be a non-empty string. Returns `400` on bad input. |
| Error response safety | ✅ | Responses are limited to `{ ok, reason }` where `reason` ∈ `{"Invalid key", "Provider unreachable", "Bad request"}`. No third-party error bodies forwarded. |
| Rate limiting | ❌ | No rate limiting. The endpoint acts as a free proxy to third-party auth systems. |

**Verdict:** NEEDS FIX

**Issues filed:**
1. **PP-703-A — Missing authentication on `/api/verify-key`:** Without auth, any anonymous actor can use the server's IP/egress to probe arbitrary API keys against OpenAI/Gemini/Anthropic, bypassing per-IP rate limits those providers impose on browsers. Add `supabase.auth.getUser()` guard (returning `401`) so only signed-in users can verify keys.
2. **PP-703-B — No rate limiting on `/api/verify-key`:** Even after adding auth, add per-user rate limiting (e.g., 20 verifications/minute) to prevent bulk brute-forcing of key guesses.

---

## Route: /api/optimize-sync (POST)

**File:** `src/app/api/optimize-sync/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ⚠️ | No `getUser()` call. Designed to accept a caller-supplied API key via `Authorization: Bearer <key>` or `body.apiKey`. CORS origin allowlist (`ALLOWED_ORIGINS`) is applied to restrict browser access, but the endpoint is fully open to server-to-server or `curl` callers without any token. A missing/invalid API key is caught at the provider level (`createProvider` throws), but there is no server-side identity check. |
| Input validation | ✅ | `prompt`/`text` required (returns `400` if absent). `mode` and `provider` are whitelisted enums; invalid values silently fall back to defaults (`better` / `gemini`) — acceptable behaviour. |
| Error response safety | ✅ | All AI/provider errors go through `userFacingOptimizeError`, which maps known SDK errors to user-friendly strings. The outer catch returns `err.message` only for JSON parse failures, which are safe to forward. |
| Rate limiting | ❌ | No rate limiting. This is the most expensive endpoint (calls an external AI model per request). Without throttling, a single client can exhaust the server's API quota. |

**Verdict:** NEEDS FIX

**Issues filed:**
3. **PP-703-C — No server-side authentication on `/api/optimize-sync`:** The CORS origin check protects browser clients only; server-to-server callers are unrestricted. Add `resolveIdentity` (or an equivalent API-key-to-user lookup) and return `401` for unidentified callers. For the public/extension use-case, issue short-lived signed tokens.
4. **PP-703-D — No rate limiting on `/api/optimize-sync`:** Add per-IP (or per-user) rate limiting to cap the number of optimizations per time window and protect AI provider quota. Consider integrating `checkRateLimit` from `src/lib/auth/rateLimit.ts` or an edge-level solution (Vercel Edge Config / Upstash).

---

## Route: /api/history (GET / POST / DELETE)

**File:** `src/app/api/history/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `resolveIdentity(request)` called on all three methods; returns `401` if not authenticated. DELETE also checks `hist.user_id !== identity.userId` and returns `403` (ownership check). |
| Input validation | ✅ | GET: no body needed. POST: `prompt_original`, `prompt_optimized`, `session_id` required — returns `400` if missing. DELETE: `id` validated against `/^[\da-f-]{36}$/i` UUID pattern — returns `400` if malformed. |
| Error response safety | ⚠️ | Several `500` paths forward raw Supabase `error.message` to the client (e.g., `{ error: error.message, code: 'HISTORY_DB_ERROR' }`, `{ error: lastError?.message ?? 'Insert failed', code: 'HISTORY_INSERT_ERROR' }`, `logDelErr.message`). These can expose internal table names, column names, or Postgres constraint details. |
| Rate limiting | ❌ | No rate limiting. DELETE in particular has no throttle — a malicious user could trigger cascading admin-client deletions at high frequency. |

**Verdict:** PASS WITH NOTES

**Notes:**
- Wrap Supabase errors in a safe helper before forwarding to the client (e.g., log the raw message server-side and return a generic `"Database error"` with the existing error code). The `code` field is safe to keep for client-side i18n.
- Add rate limiting on the DELETE path to prevent rapid-fire cascading deletes.

---

## Route: /api/save-history (POST)

**File:** `src/app/api/save-history/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `createRouteHandlerClient().auth.getUser()` called; returns `401` if unauthenticated |
| Input validation | ✅ | `session_id`, `prompt_original`, `prompt_optimized` required; returns `400` with `"Missing required fields"` if absent. Additional optional fields (`mode`, `explanation`, `provider`, `optimize_session_id`) are safely coerced. |
| Error response safety | ⚠️ | On insert failure, `lastError?.message ?? 'Insert failed'` is forwarded directly to the client as `{ error: "..." }` (status `500`). This can expose Postgres constraint names, column names, or trigger error text. |
| Rate limiting | ❌ | No rate limiting. A malicious authenticated user could flood the history table. |

**Verdict:** PASS WITH NOTES

**Notes:**
- Replace the raw `lastError.message` forward with a sanitised message (e.g., `"Could not save history. Please try again."`) and log the raw error server-side only.
- Add per-user rate limiting (e.g., max 60 saves/minute).

---

## Route: /api/guest-usage (GET / POST)

**File:** `src/app/api/guest-usage/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | N/A | Intentionally unauthenticated — designed for anonymous guests. The `guestId` (a client-generated UUID) acts as an anonymous session token. |
| Input validation | ⚠️ | POST: `guestId` presence is checked; returns `400` if absent. However, unlike `claim-guest-history`, there is **no format validation** (no UUID pattern, no max length). An attacker can submit an arbitrarily long or specially crafted string as `guestId`. GET: `guestId` absence is handled gracefully (returns defaults). |
| Error response safety | ✅ | All error responses use generic messages (`"Database not configured"`, `"Failed to record usage"`, `"Invalid request body"`). No Supabase internals are exposed. |
| Rate limiting | ❌ | No rate limiting. Because each unique `guestId` gets its own quota of `GUEST_LIMIT` (5) optimizations, an attacker can generate unlimited guest IDs and bypass the per-guest cap entirely. |

**Verdict:** PASS WITH NOTES

**Notes:**
- Add `guestId` format validation in the POST handler (UUID pattern + max length ≤ 80 chars), consistent with `claim-guest-history`.
- The per-guest limit alone is not an effective abuse control: a single actor generating new guest IDs bypasses it trivially. Consider an IP-level daily cap in addition to (or instead of) the per-guest DB counter.

---

## Route: /api/profile (GET / PATCH)

**File:** `src/app/api/profile/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `resolveIdentity(request)` called on both GET and PATCH; returns `401` if not authenticated. Email-confirmed gate is enforced on both methods via admin client lookup. |
| Input validation | ⚠️ | PATCH: `display_name` and `avatar_url` types are checked; returns `400` if neither field is provided. However, there is **no length limit** on `display_name` (a very long string is accepted and written to the DB) and **no URL format validation** on `avatar_url` (any string is accepted, including `javascript:` URIs). |
| Error response safety | ⚠️ | Multiple `500`/`503` paths expose internals: (1) `selErr.message` forwarded in PATCH; (2) `error.message` forwarded on upsert failure; (3) GET 503 response includes the hint `"Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY in .env so profiles work..."`, revealing internal environment variable names to authenticated users. (4) `insErr.message` forwarded in GET on profile-insert failure. |
| Rate limiting | ❌ | No rate limiting on PATCH. A user could spam display name updates to cause excessive DB writes or trigger unique-constraint probing. |

**Verdict:** PASS WITH NOTES

**Notes:**
- Clamp `display_name` to a reasonable maximum (e.g., 64 characters) and return `400` if exceeded.
- Validate `avatar_url` with a URL allowlist (e.g., only `https://` scheme) or strip dangerous schemes before persisting.
- Remove the env-var hint from the `503` JSON body in GET (it's visible to any authenticated user); move it to `console.warn` server-side only.
- Sanitise all Supabase `error.message` values before forwarding — use the `code` field to communicate error type to the client, not the raw Postgres message.
- Add per-user rate limiting on PATCH (e.g., max 20 profile updates/minute).

---

## Rate Limiter Assessment

**File:** `src/lib/auth/rateLimit.ts`

```
const attempts = new Map<string, { count: number; resetAt: number }>()
export function checkRateLimit(ip: string, maxAttempts = 5): boolean { ... }
```

The current rate limiter is **in-memory and per-process**. It works correctly for single-instance local development but has the following limitations in production:

| Issue | Impact |
|---|---|
| In-memory only | State is not shared across serverless function instances (Vercel, etc.) — each cold-start resets counters |
| IP-only keying | Shared NAT / corporate IPs may lock out many legitimate users |
| Only used on login + signup | All other routes are unthrottled |

**Recommendation:** Replace with a distributed rate limiter (Upstash Redis + `@upstash/ratelimit`, or Vercel's Edge Config) for production deployments, and extend rate limiting to `/api/verify-key`, `/api/optimize-sync`, and `/api/profile` PATCH at minimum.

---

## Outstanding Issues

| ID | Route | Severity | Description |
|---|---|---|---|
| PP-703-A | `/api/verify-key` | High | No authentication — open proxy to third-party key validation APIs |
| PP-703-B | `/api/verify-key` | High | No rate limiting — enables bulk API key brute-forcing |
| PP-703-C | `/api/optimize-sync` | High | No server-side auth — unauthenticated callers can consume AI provider quota |
| PP-703-D | `/api/optimize-sync` | High | No rate limiting on most expensive endpoint |
| PP-703-E | `/api/profile` (PATCH) | Medium | No `display_name` length cap; no `avatar_url` scheme validation |
| PP-703-F | `/api/profile` | Medium | Internal env-var names exposed in 503 JSON response |
| PP-703-G | `/api/guest-usage` | Medium | No `guestId` format/length validation in POST handler |
| PP-703-H | Multiple routes | Low | Raw Supabase `error.message` forwarded to client in `history`, `save-history`, `profile`, and `signup` |
| PP-703-I | In-memory rate limiter | Low | Not shared across serverless instances — ineffective in multi-instance deployments |
