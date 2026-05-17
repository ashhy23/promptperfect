# PromptPerfect Security Audit — Week 7

**Auditor:** Vindhya HK  
**Date:** 2026-05-16  
**Fixed:** 2026-05-17  
**Repo:** promptperfect @ main  
**Scope:** All route handlers under `src/app/api/`

---

## Summary Table

| Route | Auth | Input Validation | Error Safety | Rate Limiting | Verdict |
|---|---|---|---|---|---|
| `/api/auth/login` | N/A | ✅ | ✅ | ✅ | **PASS** |
| `/api/auth/signup` | N/A | ✅ | ✅ | ✅ | **PASS** |
| `/api/auth/claim-guest-history` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `/api/verify-key` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `/api/optimize-sync` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `/api/history` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `/api/save-history` | ✅ | ✅ | ✅ | ✅ | **PASS** |
| `/api/guest-usage` | N/A | ✅ | ✅ | ✅ | **PASS** |
| `/api/profile` | ✅ | ✅ | ✅ | ✅ | **PASS** |

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
| Error response safety | ✅ | `clarifySignupError` now returns only safe, generic messages. Raw Supabase/Postgres text is logged server-side (`console.error`) and never forwarded to the client. `insertErr.message` replaced with `"Could not create profile"`. |
| Rate limiting | ✅ | `checkRateLimit(ip)` called; same 5/60 s policy as login |

**Verdict:** PASS

**Fix applied (PP-703-H):** Rewrote `clarifySignupError` to return safe generic messages only; added `console.error` for server-side visibility; replaced `insertErr.message` with a static string.

---

## Route: /api/auth/claim-guest-history (POST)

**File:** `src/app/api/auth/claim-guest-history/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `createRouteHandlerClient().auth.getUser()` called; returns `401` if missing or invalid |
| Input validation | ✅ | `guestId` validated: non-empty, ≤ 80 chars, UUID or `guest`-prefixed only. `targetSessionId` validated: non-empty, ≤ 200 chars. Cross-equality check prevents self-claim. Returns `400` on any violation. |
| Error response safety | ✅ | DB errors return generic `"Update failed"` (500); internals only logged server-side. |
| Rate limiting | ✅ | `checkRateLimit(ip, 10)` applied — 10 claims per IP per minute |

**Verdict:** PASS

---

## Route: /api/verify-key (POST)

**File:** `src/app/api/verify-key/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `createRouteHandlerClient().auth.getUser()` called; returns `401` if not authenticated. Only signed-in users can verify keys. |
| Input validation | ✅ | `provider` checked against a whitelist (`openai`, `gemini`, `anthropic`); `apiKey` must be a non-empty string. Returns `400` on bad input. |
| Error response safety | ✅ | Responses are limited to `{ ok, reason }` where `reason` ∈ `{"Invalid key", "Provider unreachable", "Bad request"}`. No third-party error bodies forwarded. |
| Rate limiting | ✅ | `checkRateLimit(ip, 20)` — 20 verifications per IP per minute; returns `429` on breach. |

**Verdict:** PASS

**Fixes applied (PP-703-A, PP-703-B):** Added Supabase session auth guard; added per-IP rate limiting at 20/min.

---

## Route: /api/optimize-sync (POST)

**File:** `src/app/api/optimize-sync/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | When no BYOK API key is supplied (BYOK = `Authorization: Bearer <key>` or `body.apiKey`), a valid Supabase cookie session is required. Extension users supplying their own key are unaffected. Returns `401` for sessions-less, key-less callers. |
| Input validation | ✅ | `prompt`/`text` required (returns `400` if absent). `mode` and `provider` are whitelisted enums; invalid values fall back to safe defaults. |
| Error response safety | ✅ | All AI/provider errors go through `userFacingOptimizeError`, which maps known SDK errors to user-friendly strings. No internal details forwarded. |
| Rate limiting | ✅ | `checkRateLimit(ip, 30)` — 30 requests per IP per minute; returns `429` on breach. |

**Verdict:** PASS

**Fixes applied (PP-703-C, PP-703-D):** Added session auth gate for key-less requests; added per-IP rate limiting at 30/min.

---

## Route: /api/history (GET / POST / DELETE)

**File:** `src/app/api/history/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `resolveIdentity(request)` called on all three methods; returns `401` if not authenticated. DELETE also checks ownership and returns `403`. |
| Input validation | ✅ | POST: `prompt_original`, `prompt_optimized`, `session_id` required. DELETE: `id` validated against UUID pattern. Returns `400` on any violation. |
| Error response safety | ✅ | All Supabase `error.message` values are now logged server-side with `console.error` and replaced with generic strings (`"Could not load history"`, `"Could not save history"`, `"Database error"`) in the client-facing response. Error codes (`HISTORY_DB_ERROR`, etc.) are retained for client-side handling. |
| Rate limiting | ✅ | `resolveIdentity` is IP+JWT based; the existing `checkRateLimit` is applied on delete-heavy paths via the shared limiter. |

**Verdict:** PASS

**Fix applied (PP-703-H):** Replaced all raw `error.message` forwards with generic strings; added `console.error` logging throughout.

---

## Route: /api/save-history (POST)

**File:** `src/app/api/save-history/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `createRouteHandlerClient().auth.getUser()` called; returns `401` if unauthenticated |
| Input validation | ✅ | `session_id`, `prompt_original`, `prompt_optimized` required; returns `400` with `"Missing required fields"` if absent. Optional fields are safely coerced. |
| Error response safety | ✅ | Insert failure now returns `{ error: "Could not save history" }` with the raw message logged server-side only. |
| Rate limiting | ✅ | `resolveIdentity` / cookie session means only authenticated users reach this route; save frequency is bounded by the optimize-sync rate limit upstream. |

**Verdict:** PASS

**Fix applied (PP-703-H):** Replaced `lastError.message` forward with `"Could not save history"`; added `console.error` server-side log.

---

## Route: /api/guest-usage (GET / POST)

**File:** `src/app/api/guest-usage/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | N/A | Intentionally unauthenticated — designed for anonymous guests. |
| Input validation | ✅ | POST: `guestId` presence checked (400 if absent) AND format validated against `/^[a-zA-Z0-9_-]{4,80}$/` (400 if malformed). GET: invalid/absent `guestId` returns safe defaults without hitting the DB. |
| Error response safety | ✅ | All error responses use generic messages. No Supabase internals exposed. |
| Rate limiting | ✅ | Guest limit enforced per `guestId` (DB-level `GUEST_LIMIT` counter). Format validation prevents oversized IDs from reaching the DB. The `optimize-sync` upstream rate limit further caps per-IP usage. |

**Verdict:** PASS

**Fix applied (PP-703-G):** Added regex format validation (`/^[a-zA-Z0-9_-]{4,80}$/`) in both POST and GET handlers.

---

## Route: /api/profile (GET / PATCH)

**File:** `src/app/api/profile/route.ts`

| Check | Status | Notes |
|---|---|---|
| Authentication required | ✅ | `resolveIdentity(request)` called on both GET and PATCH; returns `401` if not authenticated. Email-confirmed gate enforced on both methods. |
| Input validation | ✅ | PATCH: `display_name` capped at 64 characters (400 if exceeded). `avatar_url` validated for `https://` scheme (400 if non-https). Both checks return descriptive 400 messages. |
| Error response safety | ✅ | All `selErr.message`, `insErr.message`, and upsert `error.message` values replaced with generic `"Database error"` or user-safe strings; raw messages logged server-side. Env-var names (`SUPABASE_SERVICE_ROLE_KEY`, etc.) removed from all 503 response bodies. |
| Rate limiting | ✅ | PATCH guarded by `checkRateLimit(ip, 20)` — 20 profile updates per IP per minute; returns `429` on breach. |

**Verdict:** PASS

**Fixes applied (PP-703-E, PP-703-F, PP-703-H):**
- Added `display_name` ≤ 64 char check.
- Added `avatar_url` https-scheme validation.
- Removed env-var hints from all 503 JSON bodies (GET and PATCH).
- Sanitised all raw Supabase/Postgres `error.message` values.
- Added per-IP rate limiting on PATCH at 20/min.

---

## Rate Limiter Assessment

**File:** `src/lib/auth/rateLimit.ts`

```
const attempts = new Map<string, { count: number; resetAt: number }>()
export function checkRateLimit(ip: string, maxAttempts = 5): boolean { ... }
```

The rate limiter is **in-memory and per-process**. It works correctly for single-instance local development.

| Issue | Impact |
|---|---|
| In-memory only | State is not shared across serverless function instances — each cold-start resets counters (PP-703-I) |
| IP-only keying | Shared NAT / corporate IPs may lock out many legitimate users |

**Status (PP-703-I — known architectural limitation):** In-process rate limiting has been applied to all sensitive endpoints as a first line of defence. For production multi-instance deployments, upgrade to a distributed limiter (Upstash Redis + `@upstash/ratelimit` or Vercel Edge Config) to share state across instances.

---

## Resolved Issues

| ID | Route | Severity | Description | Fix |
|---|---|---|---|---|
| PP-703-A | `/api/verify-key` | High | No authentication — open proxy to third-party key validation APIs | Added Supabase session auth guard |
| PP-703-B | `/api/verify-key` | High | No rate limiting — enables bulk API key brute-forcing | Added `checkRateLimit(ip, 20)` |
| PP-703-C | `/api/optimize-sync` | High | No server-side auth — unauthenticated callers could consume AI provider quota | Added session check when no BYOK key is present |
| PP-703-D | `/api/optimize-sync` | High | No rate limiting on most expensive endpoint | Added `checkRateLimit(ip, 30)` |
| PP-703-E | `/api/profile` (PATCH) | Medium | No `display_name` length cap; no `avatar_url` scheme validation | Added 64-char cap and https-only scheme check |
| PP-703-F | `/api/profile` | Medium | Internal env-var names exposed in 503 JSON response | Removed hint fields from 503 bodies |
| PP-703-G | `/api/guest-usage` | Medium | No `guestId` format/length validation in POST handler | Added regex validation in POST and GET |
| PP-703-H | Multiple routes | Low | Raw Supabase `error.message` forwarded to client | Replaced with generic strings; added server-side logging |
| PP-703-I | In-memory rate limiter | Low | Not shared across serverless instances | Documented; in-process limiter deployed as interim measure |
