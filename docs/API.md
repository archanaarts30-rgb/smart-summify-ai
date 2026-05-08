# Smart Summify AI — Backend API Reference

## Base URLs

| Environment | URL |
|---|---|
| Development | `https://smart-summify-ai-development.up.railway.app` |
| Production  | `https://smart-summify-ai-production.up.railway.app` |

---

## Authentication

All protected endpoints require a Firebase ID token passed as a Bearer token in the `Authorization` header.

```
Authorization: Bearer <firebase-id-token>
```

The token is obtained via `firebase.auth().currentUser.getIdToken()` in the extension frontend.  
On first use, the backend **auto-creates** a Supabase user record linked to the Firebase UID.

---

## Rate Limits

| Scope | Limit |
|---|---|
| Global (all endpoints) | 60 requests / minute per IP |
| `POST /v1/summarize/guest` | 3 requests / 24 hours per IP |

Exceeding a limit returns **HTTP 429** with `{ "error": "Too many requests, please slow down." }`.

---

## Plan Limits

| Feature | Free | Basic ($4.99/mo) | Premium ($9.99/mo) |
|---|---|---|---|
| Summaries per day | 3 | 50 | Unlimited |
| Summary sizes | Short only | Short, Medium, Full | Short, Medium, Full |
| File upload | ✗ | ✓ (max 10 MB) | ✓ (max 50 MB) |
| Export (PDF/Word/Text) | ✗ | ✓ | ✓ |
| Text-to-speech | ✗ | ✓ | ✓ |
| Chat with content | ✗ | ✓ (10 msgs / summary) | ✓ (Unlimited) |
| Social image generation | ✗ | ✓ (max 3 cards) | ✓ (max 5 cards) |
| Presentation slides | ✗ | ✗ | ✓ |

---

## Common Error Responses

| HTTP Status | Meaning |
|---|---|
| `400` | Bad request — missing or invalid body field |
| `401` | Missing, expired, or invalid Firebase token |
| `403` | Feature not available on current plan |
| `404` | Resource not found or does not belong to user |
| `429` | Rate limit or daily quota exceeded |
| `500` | Internal server / AI / database error |
| `503` | External service not configured (e.g. Stripe keys missing) |

All error responses follow the shape: `{ "error": "Human-readable message" }`

---

## Endpoints

### Utility

---

#### `GET /health`

Public. Returns server status.

**Response `200`**
```json
{ "status": "ok", "ts": 1715000000000 }
```

---

#### `GET /health/db` *(development only)*

Public. Validates Supabase connectivity by inserting and deleting test rows.  
Not available when `NODE_ENV=production`.

**Response `200`**
```json
{
  "ok": true,
  "results": {
    "supabase_url_check": { "looks_correct": true, "value": "https://..." },
    "key_check": { "role_in_jwt": "service_role", "part_count": 3 },
    "users": { "ok": true, "inserted_id": "uuid" },
    "summaries": { "ok": true, "inserted_id": "uuid" },
    "read_back": { "user": { "ok": true }, "summary": { "ok": true } },
    "cleanup": { "ok": true }
  }
}
```

---

#### `GET /payment/success`

Public. HTML page shown in browser tab after successful Stripe Checkout. The user closes the tab and returns to the extension.

---

#### `GET /payment/cancel`

Public. HTML page shown in browser tab when Stripe Checkout is cancelled.

---

### Summarization — `/v1/summarize`

---

#### `POST /v1/summarize/guest`

**Auth:** None  
**Rate limit:** 3 requests / 24 hours per IP

Summarizes a page for unauthenticated (guest) users. Always returns a short summary. Nothing is saved to the database.

**Request body**
```json
{
  "content": "Full text of the page (min 50 characters)",
  "sourceUrl": "https://example.com/article"
}
```

**Response `200`**
```json
{
  "summary": "A concise short summary of the content...",
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

#### `POST /v1/summarize`

**Auth:** Required  
**Plans:** Free, Basic, Premium

Summarizes a web page. Result is saved to the `summaries` table.

**Request body**
```json
{
  "content": "Full text of the page (min 50 characters)",
  "size": "small | medium | large",
  "sourceUrl": "https://example.com/article"
}
```

| Size | Plan required | Description |
|---|---|---|
| `small` | Free+ | 3–5 sentences |
| `medium` | Basic+ | 2–3 paragraphs |
| `large` | Basic+ | Detailed breakdown |

**Response `200`**
```json
{
  "summaryId": "uuid",
  "summary": "The full summary text...",
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

**Error `403`** — size not allowed on plan  
**Error `429`** — daily summary quota reached

---

#### `POST /v1/summarize/file`

**Auth:** Required  
**Plans:** Basic, Premium  
**Content-Type:** `multipart/form-data`

Uploads and summarizes a PDF, Word, or text file.

**Form fields**

| Field | Type | Description |
|---|---|---|
| `file` | File | `.pdf`, `.doc`, `.docx`, `.txt` — max 10 MB (Basic) / 50 MB (Premium) |
| `size` | string | `small`, `medium`, or `large` |

**Response `200`** — same shape as `POST /v1/summarize`

**Error `403`** — plan does not allow file upload

---

### Chat — `/v1/chat`

---

#### `POST /v1/chat`

**Auth:** Required  
**Plans:** Basic (10 messages/summary), Premium (unlimited)

Sends a message and receives an AI reply based on the summary content.

**Request body**
```json
{
  "summaryId": "uuid",
  "message": "What is the main argument of this article?",
  "history": [
    { "role": "user",      "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```

`history` is the conversation so far (excluding the new message). Pass `[]` for the first message.

**Response `200`**
```json
{ "reply": "The main argument is..." }
```

**Error `404`** — summary not found or belongs to another user  
**Error `403`** — chat not available on Free plan, or Basic message limit reached

---

#### `GET /v1/chat/:summaryId`

**Auth:** Required  
**Plans:** Basic, Premium

Returns the full saved chat history for a summary.

**Response `200`**
```json
{
  "messages": [
    { "role": "user",      "content": "What is...", "created_at": "2026-05-07T..." },
    { "role": "assistant", "content": "It is...",   "created_at": "2026-05-07T..." }
  ]
}
```

---

### Export — `/v1/export`

---

#### `POST /v1/export`

**Auth:** Required  
**Plans:** Basic, Premium

Generates a downloadable file of a summary and returns a signed URL (valid 24 hours for Basic, 30 days for Premium).

**Request body**
```json
{
  "summaryId": "uuid",
  "format": "txt | pdf | docx"
}
```

**Response `200`**
```json
{
  "downloadUrl": "https://supabase-storage-url/...",
  "format": "pdf",
  "expiresIn": 86400
}
```

**Error `403`** — export not available on Free plan  
**Error `404`** — summary not found

---

### Social Media Images — `/v1/social-images`

---

#### `POST /v1/social-images`

**Auth:** Required  
**Plans:** Basic (max 3 cards), Premium (max 5 cards)

Generates social media post card data from a summary using AI.

**Request body**
```json
{
  "summaryId": "uuid",
  "count": 3
}
```

`count` is clamped between 2 and the plan maximum.

**Response `200`**
```json
{
  "cards": [
    {
      "headline": "Short punchy headline",
      "body": "1-2 sentence insight from the content.",
      "cta": "Read more today",
      "theme": "blue | purple | teal | coral | amber"
    }
  ]
}
```

**Error `403`** — feature not available on Free plan

---

### Slides — `/v1/slides`

---

#### `POST /v1/slides`

**Auth:** Required  
**Plans:** Premium only

Generates and uploads a `.pptx` presentation from a summary. Returns a signed download URL valid for 7 days.

**Request body**
```json
{
  "summaryId": "uuid",
  "slideCount": 8
}
```

`slideCount` is clamped between 5 and 15.

**Response `200`**
```json
{
  "downloadUrl": "https://supabase-storage-url/....pptx",
  "slideCount": 9
}
```

**Error `403`** — requires Premium plan

---

### Users — `/v1/users`

---

#### `GET /v1/users/me`

**Auth:** Required

Returns the authenticated user's profile, current plan, and today's usage.

**Response `200`**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "Jane Smith",
    "plan": "free | basic | premium",
    "createdAt": "2026-01-01T00:00:00Z"
  },
  "usage": {
    "summariesToday": 2,
    "totalSummaries": 45,
    "dailyLimit": 3
  },
  "limits": {
    "summaries_per_day": 3,
    "sizes_allowed": ["small"],
    "pdf_upload": false,
    "export": false,
    "chat_messages_per_summary": 0,
    "social_images": 0,
    "slides": false,
    "max_file_mb": 0
  }
}
```

`dailyLimit` is `null` for Premium (unlimited).

---

#### `PATCH /v1/users/me`

**Auth:** Required

Updates the user's display name.

**Request body**
```json
{ "displayName": "Jane Smith" }
```

**Response `200`**
```json
{ "success": true }
```

---

#### `POST /v1/users/subscribe`

**Auth:** Required

Creates a Stripe Checkout session to upgrade to Basic or Premium.  
Returns a URL — open it in a new browser tab to complete payment.  
After successful payment, Stripe fires a webhook that automatically upgrades the user's plan in the database.

**Request body**
```json
{ "plan": "basic | premium" }
```

**Response `200`**
```json
{ "checkoutUrl": "https://checkout.stripe.com/..." }
```

**Error `503`** — `STRIPE_SECRET_KEY` or price ID not configured in Railway

---

#### `POST /v1/users/billing-portal`

**Auth:** Required  
**Plans:** Basic, Premium (user must have an existing Stripe customer ID)

Opens the Stripe Customer Portal so the user can manage or cancel their subscription.

**Response `200`**
```json
{ "portalUrl": "https://billing.stripe.com/..." }
```

**Error `400`** — user has no billing account (never subscribed)

---

#### `GET /v1/users/history`

**Auth:** Required

Returns a paginated list of the user's past summaries.

**Query params**

| Param | Default | Description |
|---|---|---|
| `page` | `1` | Page number (20 results per page) |

**Response `200`**
```json
{
  "summaries": [
    {
      "id": "uuid",
      "source_url": "https://example.com",
      "file_name": null,
      "size_requested": "medium",
      "summary_word_count": 180,
      "time_saved_sec": 220,
      "created_at": "2026-05-07T00:00:00Z"
    }
  ],
  "total": 45,
  "page": 1,
  "totalPages": 3
}
```

---

### Stripe Webhooks — `/webhooks/stripe`

---

#### `POST /webhooks/stripe`

**Auth:** Stripe webhook signature (`stripe-signature` header)  
**Content-Type:** `application/octet-stream` (raw body — do not send JSON)

Stripe calls this automatically after payment events. **Do not call this manually.**

| Event handled | Action taken |
|---|---|
| `customer.subscription.created` | Sets user plan to `basic` or `premium` |
| `customer.subscription.updated` | Updates user plan based on active price ID |
| `customer.subscription.deleted` | Reverts user plan to `free` |
| `invoice.payment_failed` | Logs warning (no plan change) |

The webhook endpoint must be registered in the **Stripe Dashboard → Webhooks** pointing to:  
`https://<your-railway-url>/webhooks/stripe`

---

## Required Environment Variables (Railway)

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key (include `\n` line breaks) |
| `SUPABASE_URL` | Supabase project URL (`https://xxx.supabase.co` — no trailing slash) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` JWT (not the `anon` key) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) |
| `STRIPE_BASIC_PRICE_ID` | Stripe Price ID for Basic plan (`price_...`) |
| `STRIPE_PREMIUM_PRICE_ID` | Stripe Price ID for Premium plan (`price_...`) |
| `PORT` | Port to listen on (Railway sets this automatically) |
| `NODE_ENV` | `production` in Railway prod service |
| `BACKEND_URL` | *(Optional)* Only needed if running outside Railway |
