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

## Environments

This project maintains **two fully isolated environments**. Each has its own accounts and credentials — nothing is shared between dev and prod.

| Service | Development | Production |
|---|---|---|
| Firebase | `smart-summify-ai` project | New Firebase project (separate) |
| Supabase | Dev project | New Supabase project (separate) |
| Railway | Dev service | New Railway service (separate) |
| Stripe | Test mode (`sk_test_...`) | Live mode (`sk_live_...`) |
| Gemini | Dev API key | Separate production API key |
| Chrome Extension | Loaded unpacked via `dist/` | Published on Chrome Web Store |

---

## Services Overview & Dependencies

The 5 services must be set up in the order below because each depends on the previous one.

```
Firebase (Auth)
    ↓ tokens verified by
Backend (Railway)
    ↓ stores data in           ↓ charges via        ↓ generates content via
  Supabase (DB)            Stripe (Payments)      Gemini AI (Google)
    ↓ storage used by
  Extension (Chrome)
```

**Why this order matters:**
- Railway needs Firebase credentials (Step 1) and Supabase credentials (Step 2) before it can start
- Stripe webhook (Step 4) needs the Railway URL (Step 3) to know where to send events
- Google Sign-In needs a **Web application** OAuth client in the same Google Cloud project as Firebase, plus Client ID / Client secret in Firebase when the UI asks (Step 1e)
- The Extension (Step 6) needs the Railway URL (Step 3) and Firebase config (Step 1c)
- You can test a **production** build with **Load unpacked** and register that extension’s redirect URI **before** the Chrome Web Store — see Step 5

---

## Production Deployment — Step-by-Step

---

### Step 1 — Firebase (Authentication)

Create a **brand new Firebase project** for production — completely separate from your dev project.

**1a. Create the project**

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it e.g. `smart-summify-ai-prod`
3. Disable Google Analytics if not needed → **Create project**

**1b. Enable Authentication**

1. Left sidebar → **Authentication → Get started**
2. **Sign-in method** tab → enable:
   - **Google** (set support email) — full OAuth setup is in Step **1e** below
   - **Email/Password**
3. **Settings → Authorized domains** → your production Railway domain will be added in Step 3

**1c. Get the Firebase client config (for the Extension)**

1. **Project Settings** (gear icon) → **General** → scroll to **Your apps**
2. Click **+ Add app** → choose **Web** (`</>`)
3. Register the app (nickname e.g. `Smart Summify Prod Extension`) → **Register app**
4. Copy the config object — you need these values for `extension/.env.production`:
   ```
   apiKey              → VITE_FIREBASE_API_KEY
   authDomain          → VITE_FIREBASE_AUTH_DOMAIN
   projectId           → VITE_FIREBASE_PROJECT_ID
   storageBucket       → VITE_FIREBASE_STORAGE_BUCKET
   messagingSenderId   → VITE_FIREBASE_MESSAGING_SENDER_ID
   appId               → VITE_FIREBASE_APP_ID
   ```

**1d. Get the Firebase Admin SDK key (for the Backend)**

1. **Project Settings → Service Accounts**
2. Click **Generate new private key** → **Generate key** → a `.json` file downloads
3. Open the JSON file and copy:
   ```
   project_id    → FIREBASE_PROJECT_ID
   client_email  → FIREBASE_CLIENT_EMAIL
   private_key   → FIREBASE_PRIVATE_KEY
   ```
   > When pasting `private_key` into Railway, keep the surrounding quotes and keep `\n` as literal backslash-n characters.

**1e. Google Sign-In — OAuth client + Firebase (required for “Continue with Google”)**

The extension uses `chrome.identity.launchWebAuthFlow` with a **redirect URI** (`https://<extension-id>.chromiumapp.org/`). Therefore the OAuth credential must be type **Web application** — **not** “Chrome extension.”

1. Open [Google Cloud Console](https://console.cloud.google.com) and select **the Google Cloud project linked to this Firebase project** (same project ID as Firebase, or Firebase → Project settings → link to Google Cloud).
2. **APIs & Services → OAuth consent screen** → complete it if prompted (app name, user type, support email).
3. **APIs & Services → Credentials → + Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: e.g. `Smart Summify prod – extension OAuth`
   - **Authorized redirect URIs** → add the URI for **each** extension install you use (see Step 5). Pattern:
     ```
     https://<EXTENSION_ID>.chromiumapp.org/
     ```
4. Click **Create**. Copy the **Client ID** → this is `VITE_GOOGLE_OAUTH_CLIENT_ID` in `extension/.env.production` (rebuild after changes).
5. In [Firebase Console](https://console.firebase.google.com) → **Authentication → Sign-in method → Google**:
   - Enable the provider
   - If Firebase asks for **Web client ID** and **Web client secret**, paste **both** from **this same** OAuth client (Google Cloud → Credentials → open the client → Client ID + Client secret). Enter them **only in Firebase** — never in `.env` or the extension bundle.
6. The OAuth Client ID’s project must match this Firebase app. If you see `auth/invalid-credential` / “audience is not for this project,” you created the client in the **wrong** Cloud project — create a new **Web application** client under the correct project and update Firebase + `VITE_GOOGLE_OAUTH_CLIENT_ID`.

> **Secrets:** Client secret stays in Firebase (and Google Cloud). Only the **Client ID** is public (`VITE_GOOGLE_OAUTH_CLIENT_ID`).

---

### Step 2 — Supabase (Database & Storage)

Create a **brand new Supabase project** for production.

**2a. Create the project**

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Name it e.g. `smart-summify-prod`, choose a strong database password, select a region close to your users
3. Wait for the project to provision (~2 minutes)

**2b. Run the database schema**

1. Left sidebar → **SQL Editor** → **+ New query**
2. Copy and paste the entire schema SQL from `docs/SETUP.md` (the "Database Schema" section)
3. Click **Run** — this creates the `users`, `summaries`, and `chat_messages` tables

**2c. Create the Storage bucket**

1. Left sidebar → **Storage** → **+ New bucket**
2. Name: `exports`
3. Toggle **Public bucket** to **OFF** (must be private)
4. Click **Create bucket**

**2d. Get credentials (for the Backend)**

1. **Project Settings → API**
2. Copy:
   - **Project URL** → `SUPABASE_URL` (format: `https://xxxx.supabase.co`, no trailing slash)
   - **service_role** key (under "Project API keys") → `SUPABASE_SERVICE_ROLE_KEY`
   > Do NOT use the `anon` key for the backend. The `service_role` key bypasses Row Level Security and must only ever go on the backend (Railway), never in the extension.

---

### Step 3 — Railway (Backend)

Create a **new Railway service** for production — do not reuse the development service.

**3a. Create the service**

1. Go to [railway.app](https://railway.app) → your project → **+ New Service → GitHub Repo**
2. Select the `smart-summify-ai` repository → branch: `main`
3. Set **Root Directory** to `backend`
4. Railway auto-detects Node.js and uses `npm start`
5. After the first deploy, Railway assigns a public domain (e.g. `smart-summify-ai-production.up.railway.app`) — copy it

**3b. Set environment variables**

Go to the service → **Variables** tab. Add every variable in this table:

| Variable | Value | Where to get it |
|---|---|---|
| `NODE_ENV` | `production` | Type literally — must be exactly this |
| `PORT` | `3001` | Type literally |
| `FIREBASE_PROJECT_ID` | `smart-summify-ai-prod` | Step 1d → `project_id` from the JSON key file |
| `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxx@smart-summify-ai-prod.iam.gserviceaccount.com` | Step 1d → `client_email` |
| `FIREBASE_PRIVATE_KEY` | `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"` | Step 1d → `private_key` (paste with quotes; keep `\n` as-is) |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Step 2d |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Step 2d → `service_role` key |
| `GEMINI_API_KEY` | `AIza...` | [aistudio.google.com](https://aistudio.google.com) → create a new key for prod |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Step 4a — add this after completing Step 4 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Step 4c — add this after completing Step 4 |
| `STRIPE_BASIC_PRICE_ID` | `price_...` | Step 4b — add after creating live products |
| `STRIPE_PREMIUM_PRICE_ID` | `price_...` | Step 4b — add after creating live products |
| `CHROME_EXTENSION_ID` | `abcdef...` | Optional until you lock CORS: set to your **Chrome Web Store** extension ID after publishing (Step 6e). Omit or leave unset while only testing with **Load unpacked**. |

> `RAILWAY_PUBLIC_DOMAIN` is injected automatically — do NOT set it.
> `BACKEND_URL` is only needed for local tunnels (ngrok) — do NOT set it on Railway.

**3c. Go back to Firebase and add the authorized domain**

1. [console.firebase.google.com](https://console.firebase.google.com) → your **production** project
2. **Authentication → Settings → Authorized domains → Add domain**
3. Add: `smart-summify-ai-production.up.railway.app` (your actual Railway domain)

---

### Step 4 — Stripe (Payments)

Stripe uses the **same account** but separate **Live mode** for production (vs Test mode for dev). No new account needed.

**4a. Get the Live secret key**

1. [dashboard.stripe.com](https://dashboard.stripe.com) → toggle **Live mode** (top-left of dashboard — the toggle switches the entire dashboard)
2. **Developers → API Keys** → copy the `sk_live_...` **Secret key**
3. Add to Railway prod as `STRIPE_SECRET_KEY`

**4b. Create Live mode Products and Prices**

Products created in Test mode do NOT carry over to Live mode — you must recreate them.

1. **Products** (in Live mode) → **+ Add product**
2. Create **Basic** plan:
   - Name: `Basic`
   - Add a price: Recurring, monthly, your price (e.g. $4.99/month)
   - Click **Save product**
   - Copy the `price_live_...` **Price ID** (NOT the product ID which starts with `prod_`)
   - Add to Railway prod as `STRIPE_BASIC_PRICE_ID`
3. Repeat for **Premium** plan → add as `STRIPE_PREMIUM_PRICE_ID`

> Price IDs start with `price_`. Product IDs start with `prod_`. Always use the Price ID.

**4c. Register the webhook**

The webhook keeps user plan status in sync when Stripe subscription events happen.

1. **Developers → Webhooks → + Add endpoint**
2. **Endpoint URL:**
   ```
   https://<your-prod-railway-domain>/webhooks/stripe
   ```
3. Click **+ Select events** and choose all four:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Add endpoint**
5. On the webhook detail page → **Signing secret → Reveal**
6. Copy the `whsec_...` value → add to Railway prod as `STRIPE_WEBHOOK_SECRET`

> The webhook secret must be exact. A mismatch causes all subscription events to silently fail — user plans will not update after payment.

**4d. Enable the Customer Portal**

1. **Settings → Billing → Customer portal**
2. Enable it, configure allowed actions (cancel, update payment method)
3. Save — no extra keys needed, it uses your `STRIPE_SECRET_KEY`

---

### Step 5 — Extension IDs and OAuth redirect URIs

You do **not** need the Chrome Web Store to sign in. A **Web application** OAuth client allows **multiple** redirect URIs.

**A — Before Chrome Web Store (normal for first production test)**

1. Fill `extension/.env.production` and run `npm run build`.
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → select `extension/dist/`.
3. Copy the **extension ID** shown for this install (from `chrome://extensions`).
4. In Google Cloud Console → **Credentials** → your prod **Web application** client (Step 1e) → **Authorized redirect URIs** → **+ Add URI**:
   ```
   https://<THIS_UNPACKED_ID>.chromiumapp.org/
   ```
5. Sign in with Google from the extension. This is valid end‑to‑end prod testing without submitting a `.zip` to Google.

**B — After Chrome Web Store publishes**

The store listing has a **different** permanent extension ID.

1. In the **same** Web application OAuth client, **+ Add URI**:
   ```
   https://<CHROME_WEB_STORE_EXTENSION_ID>.chromiumapp.org/
   ```
2. Keep unpacked URIs if you still test via Load unpacked.
3. Set Railway `CHROME_EXTENSION_ID` to the **store** ID when you want backend CORS to allow only the published build.

> **Wrong type:** Do not create an OAuth client of type **Chrome extension** for this app. The code path requires **Web application** + `https://….chromiumapp.org/` (see `extension/src/lib/firebase.ts`).

---

### Step 6 — Chrome Extension (Build & Publish)

**6a. Create `extension/.env.production`**

Create `extension/.env.production` with values from the steps above:

```env
# ─── Backend ─────────────────────────────────────────────
# Your production Railway domain from Step 3a
VITE_API_URL=https://<your-prod-railway-domain>

# ─── Firebase (production project from Step 1c) ──────────
VITE_FIREBASE_API_KEY=<from Step 1c>
VITE_FIREBASE_AUTH_DOMAIN=<your-prod-project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<your-prod-project-id>
VITE_FIREBASE_STORAGE_BUCKET=<your-prod-project>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<from Step 1c>
VITE_FIREBASE_APP_ID=<from Step 1c>

# ─── Google OAuth (Step 1e) ──────────────────────────────
# Web application client in the SAME Google Cloud project as prod Firebase.
VITE_GOOGLE_OAUTH_CLIENT_ID=<your-prod-web-client-id>.apps.googleusercontent.com

# ─── Upgrade URL ─────────────────────────────────────────
VITE_UPGRADE_URL=https://<your-prod-railway-domain>/upgrade
```

> All `VITE_` values are compiled into the extension bundle at build time. Anyone who unpacks the `.crx` can see them — never put secret keys (including Google **client secret**) in `VITE_*` or git.

**6b. Update `extension/public/manifest.json` for production**

Remove the `localhost` and development Railway entries from `host_permissions`. The production manifest should only contain your production backend:

```json
"host_permissions": [
  "https://<your-prod-railway-domain>/*"
]
```

**6c. Build the production extension**

```bash
cd extension
npm run build
```

This runs `vite build --mode production`, reads `extension/.env.production`, and outputs to `extension/dist/`.
Verify the build succeeded — you should see no errors and the `dist/` folder should be populated.

**6d. Zip and submit to Chrome Web Store**

1. Open `extension/dist/` in File Explorer
2. Select **all files inside** `dist/` (Ctrl+A) — do not select the `dist/` folder itself
3. Right-click → **Send to → Compressed (zipped) folder**
4. Go to [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
5. **+ New item** → upload the zip
6. Fill in the store listing:
   - Description, category (Productivity), screenshots (at least 1 required), small promotional tile
   - Privacy policy URL (required — host a simple one on any public URL)
7. **Submit for review** — Google typically takes 1–7 business days

**6e. After Chrome Web Store approval**

Once approved, the extension gets a **permanent store ID**.

1. Copy the extension ID from the Chrome Web Store developer console listing
2. Add `CHROME_EXTENSION_ID=<that ID>` to Railway prod (for strict CORS)
3. In Google Cloud OAuth client (Step 5B), add redirect URI `https://<STORE_ID>.chromiumapp.org/` if not already added
4. Rebuild if env changed: `npm run build`
5. Upload the new zip to Chrome Web Store as an **update**

---

## Environment Variables — Complete Reference

### Backend (Railway)

| Variable | Dev value | Production value |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `3001` | `3001` |
| `FIREBASE_PROJECT_ID` | dev Firebase project ID | **prod Firebase project ID** (Step 1d) |
| `FIREBASE_CLIENT_EMAIL` | dev service account email | **prod service account email** (Step 1d) |
| `FIREBASE_PRIVATE_KEY` | dev private key | **prod private key** (Step 1d) |
| `SUPABASE_URL` | dev Supabase URL | **prod Supabase URL** (Step 2d) |
| `SUPABASE_SERVICE_ROLE_KEY` | dev service role key | **prod service role key** (Step 2d) |
| `GEMINI_API_KEY` | dev API key | **new prod API key** (aistudio.google.com) |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` (Step 4a) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (test) | `whsec_...` (live) (Step 4c) |
| `STRIPE_BASIC_PRICE_ID` | `price_...` (test) | `price_...` (live) (Step 4b) |
| `STRIPE_PREMIUM_PRICE_ID` | `price_...` (test) | `price_...` (live) (Step 4b) |
| `CHROME_EXTENSION_ID` | unset | **Optional** until you restrict CORS: set to **Chrome Web Store** ID after publishing (Step 6e). Omit while testing only with **Load unpacked**. |
| `BACKEND_URL` | unset | unset (Railway injects it automatically) |

### Extension (compiled into the build)

| Variable | Dev (`.env.development`) | Production (`.env.production`) |
|---|---|---|
| `VITE_API_URL` | Dev Railway backend URL | **Prod Railway backend URL** |
| `VITE_FIREBASE_API_KEY` | Dev Firebase key | **Prod Firebase key** |
| `VITE_FIREBASE_AUTH_DOMAIN` | `dev-project.firebaseapp.com` | **`prod-project.firebaseapp.com`** |
| `VITE_FIREBASE_PROJECT_ID` | Dev project ID | **Prod project ID** |
| `VITE_FIREBASE_STORAGE_BUCKET` | Dev bucket | **Prod bucket** |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Dev sender ID | **Prod sender ID** |
| `VITE_FIREBASE_APP_ID` | Dev app ID | **Prod app ID** |
| `VITE_GOOGLE_OAUTH_CLIENT_ID` | **Web application** OAuth client ID (dev GCP project) | **Web application** OAuth client ID (prod GCP project — Step 1e) |
| `VITE_UPGRADE_URL` | Dev backend `/upgrade` | **Prod backend `/upgrade`** |

---

## Build Commands (Extension)

| Command | Mode | Reads | Use when |
|---|---|---|---|
| `npm run dev` | development | `.env.development` | Local development — auto-rebuilds on save |
| `npm run dev:once` | development | `.env.development` | Single build for Chrome testing |
| `npm run build` | production | `.env.production` | Production bundle — Load unpacked **or** Chrome Web Store zip |

> Use `npm run dev:once` for dev backend. Use `npm run build` with `.env.production` to test prod Firebase + prod API before the store.

---

## Plan Limits Reference

| Feature | Free | Basic | Premium |
|---|---|---|---|
| Summaries per day | 3 | 30 | Unlimited |
| Summary sizes | Short only | Short, Medium, Full | Short, Medium, Full |
| Chat messages per summary | 0 | 10 | Unlimited |
| File uploads | No | Yes (up to 10 MB) | Yes (up to 50 MB) |
| Export (PDF, DOCX, TXT) | No | Yes | Yes |
| Social media posts | No | Up to 3 | Up to 5 |
| PPT Slides | No | No | Yes |
| Guest (no login) summaries | 3 per IP per 24h | — | — |

---

## Production Launch Checklist

Work through these in order — each section depends on the one above it.

### 1. Firebase (prod project)
- [ ] New Firebase project created
- [ ] Google and Email/Password authentication enabled
- [ ] Step **1e**: Web application OAuth client in **prod** Google Cloud project; redirect URI(s) added (Step 5)
- [ ] Firebase **Authentication → Google** configured with Web client ID (+ client secret if the form asks)
- [ ] Web app registered — client config values copied
- [ ] Service account key generated — Admin SDK values copied
- [ ] Authorized domain added (after Railway deploy in step 3)

### 2. Supabase (prod project)
- [ ] New Supabase project created
- [ ] Schema SQL from `docs/SETUP.md` executed in SQL Editor
- [ ] `exports` storage bucket created and set to **private**
- [ ] Project URL and service_role key copied

### 3. Railway (prod service)
- [ ] New production service created, Root Directory set to `backend`
- [ ] All environment variables set (Firebase, Supabase, Gemini, `NODE_ENV=production`)
- [ ] `CHROME_EXTENSION_ID` omitted or set when ready to lock CORS to the store build
- [ ] Service deployed successfully — public domain copied
- [ ] Firebase authorized domain updated with Railway domain

### 4. Stripe (live mode)
- [ ] Switched to Live mode
- [ ] Basic and Premium products + prices created in live mode
- [ ] `sk_live_...` secret key added to Railway
- [ ] Price IDs (`price_...`) added to Railway
- [ ] Webhook registered for the prod Railway URL
- [ ] `whsec_...` webhook secret added to Railway
- [ ] Customer Portal configured

### 5. Extension build & pre-store testing
- [ ] `extension/.env.production` created with all prod values
- [ ] `localhost` and dev Railway URL removed from `manifest.json` host_permissions (as appropriate)
- [ ] `npm run build` completes without errors
- [ ] Load unpacked from `dist/` — Google sign-in works (redirect URI registered for **unpacked** extension ID)

### 6. Chrome Web Store
- [ ] `dist/` contents zipped (contents, not the folder)
- [ ] Uploaded to Chrome Web Store developer console
- [ ] Store listing complete (description, screenshots, privacy policy)
- [ ] Submitted for review

### 7. Post-approval (after Chrome Web Store approves)
- [ ] Store extension ID copied — **+ Add URI** in OAuth client for `https://<STORE_ID>.chromiumapp.org/`
- [ ] `CHROME_EXTENSION_ID` set on Railway to the **store** ID (optional but recommended)
- [ ] Final `npm run build` + new zip uploaded to Chrome Web Store as update if needed

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
Refer to `docs/API.md` for the complete backend API endpoint reference.
