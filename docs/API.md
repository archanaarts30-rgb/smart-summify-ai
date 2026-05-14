# Smart Summify AI — Backend API Reference

Jump to any route from the **[endpoint index](#endpoint-index)** below. Each section heading has a stable anchor for sharing (works in GitHub, VS Code, and most Markdown viewers).

---

## Table of contents

- [Base URLs](#base-urls)
- [Authentication](#authentication)
- [Rate limits](#rate-limits)
- [Plan limits](#plan-limits)
- [Errors](#common-error-responses)
- [**Endpoint index** — click a row](#endpoint-index)
- [Environment variables](#required-environment-variables-railway)

---

## Base URLs

| Environment | URL |
|---|---|
| Development | `https://smart-summify-ai-development.up.railway.app` |
| Production | `https://smart-summify-ai-production.up.railway.app` |

---

## Authentication

Protected endpoints need a Firebase ID token:

```
Authorization: Bearer <firebase-id-token>
```

Obtain from the extension with `firebase.auth().currentUser.getIdToken()` (after sign-in).

On first authenticated request the backend ensures a matching row exists in Supabase (`users`).

Guest routes do **not** use this header unless noted.

---

## Rate limits

| Scope | Limit |
|---|---|
| Global (all `/v1/*` routes, etc.) | 60 requests / minute per IP (see middleware) |
| `POST /v1/summarize/guest` | 3 requests / 24 hours per IP |

**HTTP `429`** example: `{ "error": "Too many requests, please slow down." }`

---

## Plan limits

Aligned with [`backend/src/middleware/auth.js`](../backend/src/middleware/auth.js):

| Feature | Free | Basic | Premium |
|---|---|---|---|
| Summaries per day | 3 | 30 | Unlimited |
| Summary lengths | Short | Short, Medium, Full | Short, Medium, Full |
| PDF / document upload | ✓ (1/day, ≤ 10 MB) | ✓ (≤ 10 MB) | ✓ (≤ 50 MB) |
| Export PDF / DOCX / TXT | — | ✓ | ✓ |
| Chat with summary | — | ✓ (10 msgs / summary) | ✓ (unlimited) |
| Social post cards | — | ✓ (1–3 cards/request) | ✓ (1–6 cards/request) |
| Presentation slides (.pptx) | — | — | ✓ |

---

## Common error responses

| HTTP | Typical cause |
|---|---|
| `400` | Bad body, missing fields, file too large, unsupported MIME |
| `401` | Missing or invalid Bearer token |
| `403` | Feature not allowed on plan, quota exhausted |
| `404` | Summary or resource not found / not yours |
| `413` | Upload over hard server limit |
| `429` | Rate limit or guest quota |
| `500` | Server / AI / DB failure |
| `503` | Optional features not configured (e.g. Stripe) |

Shape: `{ "error": "<message>" }` (some routes add extra keys like `allowed_sizes`).

---

## Endpoint index

| Method | Path | Section |
|:---:|:---|:---:|
| `GET` | `/health` | [→](#endpoint-get-health) |
| `GET` | `/payment/success` | [→](#endpoint-get-payment-success) |
| `GET` | `/payment/cancel` | [→](#endpoint-get-payment-cancel) |
| `POST` | `/v1/summarize/guest` | [→](#endpoint-post-v1-summarize-guest) |
| `POST` | `/v1/summarize` | [→](#endpoint-post-v1-summarize) |
| `POST` | `/v1/summarize/file` | [→](#endpoint-post-v1-summarize-file) |
| `POST` | `/v1/chat` | [→](#endpoint-post-v1-chat) |
| `GET` | `/v1/chat/:summaryId` | [→](#endpoint-get-v1-chat-summaryid) |
| `POST` | `/v1/export` | [→](#endpoint-post-v1-export) |
| `POST` | `/v1/social-images` | [→](#endpoint-post-v1-social-images) |
| `POST` | `/v1/slides` | [→](#endpoint-post-v1-slides) |
| `GET` | `/v1/users/me` | [→](#endpoint-get-v1-users-me) |
| `GET` | `/v1/users/stats` | [→](#endpoint-get-v1-users-stats) |
| `PATCH` | `/v1/users/me` | [→](#endpoint-patch-v1-users-me) |
| `POST` | `/v1/users/feedback` | [→](#endpoint-post-v1-users-feedback) |
| `POST` | `/v1/users/subscribe` | [→](#endpoint-post-v1-users-subscribe) |
| `POST` | `/v1/users/billing-portal` | [→](#endpoint-post-v1-users-billing-portal) |
| `GET` | `/v1/users/history` | [→](#endpoint-get-v1-users-history) |
| `POST` | `/webhooks/stripe` | [→](#endpoint-post-webhooks-stripe) |

<a id="endpoint-get-health"></a>

### `GET /health`

**Auth:** none.

**Purpose:** Lightweight liveness.

**Response `200`**

```json
{ "status": "ok", "ts": 1715000000000 }
```

---

<a id="endpoint-get-payment-success"></a>

### `GET /payment/success`

**Auth:** none.

**Purpose:** Stripe Checkout success page (HTML). User closes the tab after paying.

---

<a id="endpoint-get-payment-cancel"></a>

### `GET /payment/cancel`

**Auth:** none.

**Purpose:** Stripe Checkout cancelled (HTML).

---

<a id="endpoint-post-v1-summarize-guest"></a>

### `POST /v1/summarize/guest`

**Auth:** none · **Quota:** 3 / 24h per IP · **Stores DB:** no

**Purpose:** Quick short summary for visitors without an account.

**Request body**

```json
{
  "content": "Minimum 50 characters of page text…",
  "sourceUrl": "https://example.com/article",
  "targetLanguage": "auto"
}
```

`targetLanguage` is optional (`"auto"` default). Use the same identifiers the backend expects (examples: `"English"`, `"Spanish"`, `"French"`, `"Chinese (Simplified)"`, `"Japanese"`). The Chrome extension picker shows native-script labels but submits these canonical values.

**Response `200`**

```json
{
  "summary": "…",
  "metrics": {
    "originalWordCount": 1200,
    "summaryWordCount": 80,
    "compressionRatio": 93,
    "timeSavedSec": 240,
    "inputTokens": 1500,
    "outputTokens": 100,
    "durationMs": 820
  }
}
```

---

<a id="endpoint-post-v1-summarize"></a>

### `POST /v1/summarize`

**Auth:** required · **Plans:** Free (short only), Basic, Premium

**Purpose:** Summarize webpage text and persist under the user.

**Request body**

```json
{
  "content": "Minimum 50 characters…",
  "size": "small",
  "sourceUrl": "https://example.com/article",
  "targetLanguage": "auto"
}
```

| Field | Notes |
|---|---|
| `size` | `small` \| `medium` \| `large` — must be in plan’s `sizes_allowed` |
| `targetLanguage` | Optional · same convention as `/guest` |

**Response `200`**

```json
{
  "summaryId": "550e8400-e29b-41d4-a716-446655440000",
  "summary": "…",
  "metrics": {
    "originalWordCount": 1200,
    "summaryWordCount": 200,
    "compressionRatio": 83,
    "timeSavedSec": 240,
    "inputTokens": 1500,
    "outputTokens": 250,
    "durationMs": 1100
  }
}
```

**Errors:** `403` wrong size/plan · `429` daily summary quota

---

<a id="endpoint-post-v1-summarize-file"></a>

### `POST /v1/summarize/file`

**Auth:** required · **Plans:** Basic, Premium · **Content-Type:** `multipart/form-data`

**Purpose:** Upload PDF/DOC/DOCX/TXT and summarize.

**Form fields**

| Field | Type | Description |
|---|---|---|
| `file` | File | MIME must be pdf, msword, wordprocessingml, or plain text |
| `size` | string | `small` \| `medium` \| `large` |
| `targetLanguage` | string *(optional)* | Same as summarize |

Body size is rejected early if larger than absolute server ceiling; plan sets `max_file_mb` (10 vs 50).

**Response `200`:** Same JSON shape as `POST /v1/summarize` (includes `summaryId`).

**Errors:** `403` upload not allowed on plan · `400` bad file

---

<a id="endpoint-post-v1-chat"></a>

### `POST /v1/chat`

**Auth:** required · **Plans:** Basic / Premium · **Limits:** Basic 10 msgs per summary thread

**Request body**

```json
{
  "summaryId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "What is the main argument?",
  "history": [
    { "role": "user", "content": "Earlier question…" },
    { "role": "assistant", "content": "Earlier answer…" }
  ]
}
```

**Response `200`**

```json
{ "reply": "…" }
```

---

<a id="endpoint-get-v1-chat-summaryid"></a>

### `GET /v1/chat/:summaryId`

**Auth:** required

**Purpose:** Fetch stored chat for a summary.

**Response `200`**

```json
{
  "messages": [
    { "role": "user", "content": "…", "created_at": "2026-05-07T12:00:00.000Z" },
    { "role": "assistant", "content": "…", "created_at": "2026-05-07T12:00:05.000Z" }
  ]
}
```

---

<a id="endpoint-post-v1-export"></a>

### `POST /v1/export`

**Auth:** required · **Plans:** Basic+

Generates markdown-aware export and returns signed storage URL.

**Request body**

```json
{
  "summaryId": "550e8400-e29b-41d4-a716-446655440000",
  "format": "txt"
}
```

`format`: `pdf` \| `docx` \| `txt`

**Response `200`**

```json
{
  "downloadUrl": "https://…",
  "format": "pdf",
  "expiresIn": 86400
}
```

---

<a id="endpoint-post-v1-social-images"></a>

### `POST /v1/social-images`

**Auth:** required · **Plans:** Basic (max 3) / Premium (max 6) cards per plan cap

Server clamps `count` to **between 1 and** `social_images` limit.

**Request body**

```json
{
  "summaryId": "550e8400-e29b-41d4-a716-446655440000",
  "count": 3
}
```

**Response `200`**

```json
{
  "cards": [
    {
      "headline": "…",
      "body": "…",
      "cta": "…",
      "theme": "blue"
    }
  ]
}
```

---

<a id="endpoint-post-v1-slides"></a>

### `POST /v1/slides`

**Auth:** required · **Plans:** Premium

**Request body**

```json
{
  "summaryId": "550e8400-e29b-41d4-a716-446655440000",
  "slideCount": 8
}
```

`slideCount` is clamped (see implementation — typically ~5–15).

**Response `200`**

```json
{
  "downloadUrl": "https://….pptx",
  "slideCount": 9
}
```

---

<a id="endpoint-get-v1-users-me"></a>

### `GET /v1/users/me`

**Auth:** required · **Fast path** (no summary table aggregation)

Returns the user profile and per-plan **limits** (same envelope the extension needs for feature checks). Usage counts and time-saved totals are returned from [`GET /v1/users/stats`](#endpoint-get-v1-users-stats) when the client opens Stats / Profile.

**Response `200`**

```json
{
  "user": {
    "id": "uuid",
    "email": "you@example.com",
    "displayName": "Alex",
    "plan": "basic",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  "limits": {
    "summaries_per_day": 30,
    "chat_messages_per_summary": 10,
    "sizes_allowed": ["small", "medium", "large"],
    "pdf_upload": true,
    "file_uploads_per_day": null,
    "export": true,
    "audio": true,
    "social_images": 3,
    "slides": false,
    "max_file_mb": 10
  }
}
```

---

<a id="endpoint-get-v1-users-stats"></a>

### `GET /v1/users/stats`

**Auth:** required · **Heavier** — summary counts + rolled-up `time_saved_sec` sums (paginated internally). Call when the user opens **Stats** or **Profile**, not on every extension popup open.

**Response `200`**

```json
{
  "usage": {
    "summariesToday": 2,
    "summariesThisMonth": 18,
    "totalSummaries": 45,
    "dailyLimit": 30,
    "fileUploadsToday": 0,
    "fileUploadDailyLimit": null,
    "monthlyLimit": null,
    "timeSavedTodaySec": 1200,
    "timeSavedThisMonthSec": 18000,
    "timeSavedTotalSec": 42000
  }
}
```

`dailyLimit` is `null` for Premium (unlimited daily summaries). “Today” / month boundaries use **UTC**, same as stored `created_at`.

---

<a id="endpoint-patch-v1-users-me"></a>

### `PATCH /v1/users/me`

**Auth:** required · **Purpose:** Display name update

**Request body**

```json
{ "displayName": "Alex Reader" }
```

**Response `200`**

```json
{ "success": true }
```

---

<a id="endpoint-post-v1-users-feedback"></a>

### `POST /v1/users/feedback`

**Auth:** required · **Rate limit:** ~15 submissions / hour per user (Express limiter)

**Request body**

```json
{
  "category": "general",
  "message": "The export button clipped on small screens.",
  "extensionVersion": "1.0.0"
}
```

`category` ∈ `bug` \| `feature` \| `billing` \| `general` (unknown values fall back to `general`). `extensionVersion` optional string (≤ 64 chars).

**Response `200`**

```json
{ "success": true }
```

---

<a id="endpoint-post-v1-users-subscribe"></a>

### `POST /v1/users/subscribe`

**Auth:** required · **Purpose:** Stripe Checkout session for upgrading

**Request body**

```json
{ "plan": "basic" }
```

(`"premium"` also supported.)

**Response `200`**

```json
{
  "checkoutUrl": "https://checkout.stripe.com/…",
  "checkoutSessionId": "cs_test_…"
}
```

---

<a id="endpoint-post-v1-users-billing-portal"></a>

### `POST /v1/users/billing-portal`

**Auth:** required · **Requires:** existing `stripe_customer_id`

**Response `200`**

```json
{ "portalUrl": "https://billing.stripe.com/…" }
```

---

<a id="endpoint-get-v1-users-history"></a>

### `GET /v1/users/history?page=1`

**Auth:** required · **Paging:** 20 rows per page

**Response `200`**

```json
{
  "summaries": [
    {
      "id": "uuid",
      "source_url": "https://…",
      "file_name": null,
      "size_requested": "medium",
      "summary_word_count": 180,
      "time_saved_sec": 220,
      "created_at": "2026-05-07T12:00:00.000Z"
    }
  ],
  "total": 45,
  "page": 1,
  "totalPages": 3
}
```

---

<a id="endpoint-post-webhooks-stripe"></a>

### `POST /webhooks/stripe`

**Called by Stripe only.** Raw JSON body — must **not** be pre-parsed as JSON middleware on this route (Express uses `express.raw` on this mount in `index.js`).

Uses `stripe-signature` header and `STRIPE_WEBHOOK_SECRET`.

Plans are updated from subscription events (`created`, `updated`, `deleted`). Do not invoke manually from clients.

---

## Required environment variables (Railway)

| Variable | Purpose |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase Admin |
| `FIREBASE_CLIENT_EMAIL` | Service account |
| `FIREBASE_PRIVATE_KEY` | Service account PEM (`\n` preserved) |
| `SUPABASE_URL` | Postgres + Storage |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side JWT |
| `GEMINI_API_KEY` | Summaries / chat / extras |
| `STRIPE_SECRET_KEY` | Payments |
| `STRIPE_WEBHOOK_SECRET` | Webhook verification |
| `STRIPE_BASIC_PRICE_ID` | Basic Stripe Price |
| `STRIPE_PREMIUM_PRICE_ID` | Premium Stripe Price |
| `CHROME_EXTENSION_ID` *(recommended prod)* | CORS allows only `chrome-extension://<id>` |
| `FRONTEND_ORIGIN` *(optional)* | Extra allowed browser origin |
| `BACKEND_URL` | Used in Stripe `success_url` / `cancel_url` |
| `PORT` | Listen port (Railway injects) |
| `NODE_ENV` | `production` in prod |
