# Smart Summify AI

A Google Chrome Extension that summarizes webpages and documents using AI, with chat, export, social posts, presentation slides, and a freemium subscription model.

---

## Repository Structure

```
smart-summify-ai/
├── backend/          Express.js API server (deployed on Railway)
├── extension/        Chrome Extension (Vite + React + TypeScript)
└── docs/
    ├── SETUP.md      Database schema, Supabase SQL, local dev guide
    └── API.md        Full API endpoint reference
```

---

## Services Overview & Dependencies

This project uses **5 external services**. They must be set up in the order below because each depends on the previous one.

```
Firebase (Auth)
    ↓ tokens verified by
Backend (Railway)
    ↓ stores data in           ↓ charges via        ↓ generates content via
  Supabase (DB)            Stripe (Payments)      Gemini AI (Google)
    ↓ storage used by
  Extension (Chrome)
```

---

## Production Deployment — Step-by-Step

### Step 1 — Firebase (Authentication)

Firebase is shared between dev and production — you use the **same Firebase project**.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → your project (`smart-summify-ai`)
2. **Authentication → Settings → Authorized domains** → Add your production Railway domain:
   ```
   smart-summify-ai-production.up.railway.app
   ```
   (Add it after you create the Railway production service in Step 3)
3. **Project Settings → Service Accounts** → you already have a service account key from dev.
   Use the same `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` values for production.

> No new Firebase project is needed. Firebase Auth tokens work across dev and prod since it is the same project.

---

### Step 2 — Supabase (Database & Storage)

**Option A — Use the same Supabase project (recommended while starting out)**

Use the same URL and service role key from dev. All user data, summaries, and exports live in one place.

**Option B — Create a dedicated production Supabase project (recommended before scaling)**

1. Go to [supabase.com](https://supabase.com) → New project
2. Open the SQL editor and run all table creation scripts from `docs/SETUP.md` (the full schema section)
3. Go to **Project Settings → API** → copy:
   - `SUPABASE_URL` (format: `https://xxxx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` (the `service_role` key, not the `anon` key)
4. In **Storage**, create a bucket named `exports` and set it to **private**

> The `SUPABASE_SERVICE_ROLE_KEY` is a secret — it bypasses Row Level Security. It must only ever be set on the backend (Railway), never in the extension.

---

### Step 3 — Railway (Backend)

Create a **separate** Railway service for production. Do not reuse the development service.

**3a. Create the service**

1. Go to [railway.app](https://railway.app) → your project → **+ New Service → GitHub Repo**
2. Select the `smart-summify-ai` repository and the `main` branch
3. Set **Root Directory** to `backend`
4. Railway auto-detects Node.js and runs `npm start`

**3b. Set environment variables**

Go to the service → **Variables** tab and add every variable below.

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Must be exactly this — disables dev-only behaviour |
| `PORT` | `3001` | Railway uses this to know which port to expose |
| `FIREBASE_PROJECT_ID` | `smart-summify-ai` | From Firebase Console → Project Settings |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxx@smart-summify-ai.iam.gserviceaccount.com` | From your service account key file |
| `FIREBASE_PRIVATE_KEY` | `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"` | Paste with the surrounding quotes; `\n` must be literal backslash-n |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | No trailing slash |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | The `service_role` key from Supabase → Project Settings → API |
| `GEMINI_API_KEY` | `AIza...` | From [aistudio.google.com](https://aistudio.google.com) → API Keys |
| `STRIPE_SECRET_KEY` | `sk_live_...` | From Stripe **Live mode** → Developers → API Keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Created in Step 4 after the service is deployed |
| `STRIPE_BASIC_PRICE_ID` | `price_...` | From Stripe **Live mode** → Products → Basic plan → Price ID |
| `STRIPE_PREMIUM_PRICE_ID` | `price_...` | From Stripe **Live mode** → Products → Premium plan → Price ID |
| `CHROME_EXTENSION_ID` | `abcdefghijklmnopqrstuvwxyzabcdef` | Set this after Chrome Web Store publishes your extension (Step 6) |

> `RAILWAY_PUBLIC_DOMAIN` is injected automatically by Railway — do NOT set it manually.
> `BACKEND_URL` is not needed on Railway — it only applies to local tunnels (ngrok, etc.).

**3c. After deployment**

- Copy the public domain Railway gives you (e.g. `smart-summify-ai-production.up.railway.app`)
- Go back to Firebase (Step 1) and add this domain to Authorized Domains

---

### Step 4 — Stripe (Payments)

Your dev environment used Stripe **test mode** (`sk_test_...`). Production requires **live mode**.

**4a. Switch to Live mode and get keys**

1. [dashboard.stripe.com](https://dashboard.stripe.com) → toggle **Live mode** (top-left of dashboard)
2. **Developers → API Keys** → copy the `sk_live_...` **Secret key**
3. Add it to Railway prod as `STRIPE_SECRET_KEY`

**4b. Create Live mode Products and Prices**

1. **Products** → create your Basic and Premium products in Live mode (they don't carry over from test mode automatically)
2. For each product, add a **recurring price** (monthly)
3. Copy each `price_live_...` Price ID (not the Product ID — they start with `price_`, not `prod_`)
4. Add to Railway prod as `STRIPE_BASIC_PRICE_ID` and `STRIPE_PREMIUM_PRICE_ID`

**4c. Set up the webhook**

The webhook keeps user plan status in sync when subscriptions change.

1. **Developers → Webhooks → + Add endpoint**
2. Endpoint URL:
   ```
   https://<your-prod-railway-domain>/webhooks/stripe
   ```
3. Events to select — click **+ Select events** and choose:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint** → then click **Reveal** under **Signing secret**
5. Copy the `whsec_...` value → add to Railway prod as `STRIPE_WEBHOOK_SECRET`

> The webhook secret must match exactly. If it is wrong, all subscription events will fail silently and user plans won't update.

**4d. Set up the Customer Portal**

1. Stripe Dashboard → **Settings → Billing → Customer portal**
2. Enable it and configure which features users can manage (cancel, upgrade, downgrade)
3. Save settings — no extra keys needed, it uses your `STRIPE_SECRET_KEY`

---

### Step 5 — Google Cloud Console (OAuth for Google Sign-in)

Your current OAuth client has the dev extension's redirect URI. After the Chrome Web Store publishes your extension (Step 6), you get a permanent extension ID. Update OAuth at that point.

1. [console.cloud.google.com](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Click your **Web application** OAuth 2.0 client
3. Under **Authorized redirect URIs**, add:
   ```
   https://<PRODUCTION_EXTENSION_ID>.chromiumapp.org/
   ```
4. Keep the dev redirect URI — having both is fine
5. Click **Save**

> Do this step **after** Step 6, once you have the permanent production extension ID.

---

### Step 6 — Chrome Extension (Build & Publish)

**6a. Create the production environment file**

Create `extension/.env.production` with these values:

```env
# Backend — point to your production Railway service
VITE_API_URL=https://<your-prod-railway-domain>

# Firebase — same values as dev (same Firebase project)
VITE_FIREBASE_API_KEY=AIzaSyDQ_BJ--LdctIGiHzuFYw9apYVx7rKn5d8
VITE_FIREBASE_AUTH_DOMAIN=smart-summify-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=smart-summify-ai
VITE_FIREBASE_STORAGE_BUCKET=smart-summify-ai.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=334071808161
VITE_FIREBASE_APP_ID=1:334071808161:web:00bac499ec847a70e830e0

# Google OAuth — same client ID as dev
VITE_GOOGLE_OAUTH_CLIENT_ID=334071808161-uuid0roqgqjldhdr6ar50hgilb0ff5b2.apps.googleusercontent.com

# Upgrade URL — point to production backend
VITE_UPGRADE_URL=https://<your-prod-railway-domain>/upgrade
```

**6b. Update `manifest.json` before publishing**

In `extension/public/manifest.json`, remove the localhost host permission:

```json
"host_permissions": [
  "https://smart-summify-ai-production.up.railway.app/*"
]
```

Remove this line (only needed for local dev):
```
"http://localhost:3001/*",
```

Also remove the development Railway URL if you no longer need it:
```
"https://smart-summify-ai-development.up.railway.app/*"
```

**6c. Build the production extension**

```bash
cd extension
npm run build
```

This runs `vite build --mode production` and reads `.env.production`. The output is in `extension/dist/`.

**6d. Zip and submit to Chrome Web Store**

1. Zip the **contents** of `extension/dist/` (not the dist folder itself — the files inside it)
   ```
   # On Windows, select all files inside dist/ → right-click → Send to → Compressed folder
   ```
2. Go to [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
3. **+ New item** → upload the zip
4. Fill in the store listing: description, screenshots, category (Productivity), privacy policy URL
5. Submit for review (Google typically takes 1–7 days)

**6e. After Chrome Web Store approval**

1. Copy your extension's permanent ID from the Chrome Web Store listing URL
2. Add `CHROME_EXTENSION_ID=<that ID>` to Railway production env vars
3. Add the redirect URI to Google Cloud Console (Step 5)
4. Update `extension/.env.production` with the new production backend domain if it changed
5. Run `npm run build` again and upload the updated zip to the Chrome Web Store (as an update)

---

## Environment Variables — Complete Reference

### Backend (Railway)

| Variable | Required | Dev value | Production value |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | `production` |
| `PORT` | Yes | `3001` | `3001` |
| `FIREBASE_PROJECT_ID` | Yes | same | same |
| `FIREBASE_CLIENT_EMAIL` | Yes | same | same |
| `FIREBASE_PRIVATE_KEY` | Yes | same | same |
| `SUPABASE_URL` | Yes | dev project URL | prod project URL (or same) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | dev key | prod key (or same) |
| `GEMINI_API_KEY` | Yes | test key | production key |
| `STRIPE_SECRET_KEY` | Yes | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Yes | `whsec_...` (test) | `whsec_...` (live) |
| `STRIPE_BASIC_PRICE_ID` | Yes | `price_...` (test) | `price_...` (live) |
| `STRIPE_PREMIUM_PRICE_ID` | Yes | `price_...` (test) | `price_...` (live) |
| `CHROME_EXTENSION_ID` | No | unset | your CWS extension ID |
| `BACKEND_URL` | No | unset | unset (Railway provides it) |

### Extension (baked into the build via `.env.production`)

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your production Railway backend URL |
| `VITE_FIREBASE_API_KEY` | Same as dev |
| `VITE_FIREBASE_AUTH_DOMAIN` | Same as dev |
| `VITE_FIREBASE_PROJECT_ID` | Same as dev |
| `VITE_FIREBASE_STORAGE_BUCKET` | Same as dev |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Same as dev |
| `VITE_FIREBASE_APP_ID` | Same as dev |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | Same as dev |
| `VITE_UPGRADE_URL` | `<prod-backend-url>/upgrade` |

> All `VITE_` variables are compiled into the extension bundle at build time. They are visible to anyone who unpacks the `.crx` file. Never put secret keys in `VITE_` variables.

---

## Build Commands

| Command | Mode | Reads env file | Use when |
|---|---|---|---|
| `npm run dev` | development | `.env.development` | Local development (watch mode) |
| `npm run dev:once` | development | `.env.development` | Single build for Chrome testing |
| `npm run build` | production | `.env.production` | Chrome Web Store submission |

> Always use `npm run dev:once` during testing. Use `npm run build` only for publishing.

---

## Plan Limits Reference

| Feature | Free | Basic | Premium |
|---|---|---|---|
| Summaries per day | 3 | 50 | Unlimited |
| Summary sizes | Short only | Short, Medium, Full | Short, Medium, Full |
| Chat messages per summary | 0 | 10 | Unlimited |
| File uploads | No | Yes (up to 10 MB) | Yes (up to 50 MB) |
| Export (PDF, DOCX, TXT) | No | Yes | Yes |
| Social media posts | No | Up to 3 | Up to 5 |
| PPT Slides | No | No | Yes |
| Guest (no login) summaries | 3 per IP per 24h | — | — |

---

## Production Launch Checklist

### Services
- [ ] Firebase: production Railway domain added to Authorized Domains
- [ ] Supabase: URL and service_role key confirmed, `exports` storage bucket is private
- [ ] Railway: production service created, all env vars set, `NODE_ENV=production`
- [ ] Stripe: switched to Live mode, live products and prices created, webhook registered
- [ ] Google Cloud Console: production extension redirect URI added (after CWS approval)

### Extension
- [ ] `extension/.env.production` created with prod backend URL
- [ ] `localhost` removed from `manifest.json` host_permissions
- [ ] `npm run build` runs successfully (reads `.env.production`)
- [ ] `dist/` contents zipped and uploaded to Chrome Web Store
- [ ] Store listing complete (description, screenshots, privacy policy)
- [ ] Submitted for review

### Post-approval
- [ ] Production extension ID copied from Chrome Web Store
- [ ] `CHROME_EXTENSION_ID` added to Railway prod env vars
- [ ] Redirect URI added to Google Cloud Console OAuth client
- [ ] Final `npm run build` + CWS update if any files changed

---

## Local Development

```bash
# 1. Start the backend
cd backend
npm install
cp .env.example .env        # fill in your dev values
npm run dev                 # starts on port 3001 with nodemon

# 2. Build the extension (one-time or after changes)
cd extension
npm install
npm run dev:once            # reads .env.development, outputs to dist/

# 3. Load in Chrome
# chrome://extensions → Enable Developer mode → Load unpacked → select extension/dist/
```

Refer to `docs/SETUP.md` for the full Supabase schema SQL and detailed local setup instructions.
