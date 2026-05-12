# Smart Summify AI — Complete setup guide

Follow every step **in order**. **Estimated time:** ~2 hours.

---

## Before you start — create `.gitignore`

Do this **first** before pushing any code to GitHub.

Create a file named `.gitignore` in the **repository root** with the following content.

```gitignore
# Dependencies — never commit these
node_modules/

# Environment variables — never commit these (contain your secret keys)
.env
.env.development
.env.production
.env.local

# Build output — generated files, not source code
dist/
build/

# OS files
.DS_Store
Thumbs.db

# Editor
.vscode/
.idea/
*.swp
```

Verify:

```bash
git init
git add .
git status
```

> You should **not** see `node_modules/` or `.env` files in the list.

---

## Phase 1 — Third-party accounts *(no application code yet)*

### STEP 1 — Firebase project

#### Create project

1. Open [Firebase Console](https://console.firebase.google.com).
2. Click **Add project** → name it `smart-summify` → **Continue**.
3. Disable Google Analytics (optional) → **Create project**.

#### Enable authentication

4. Left sidebar → **Build** → **Authentication** → **Get started**.
5. **Sign-in method** tab → enable each provider (click **Save** after each):

   - **Email/Password** — enable this one first  
   - **Google**  
   - **GitHub** — paste OAuth credentials (see **GitHub OAuth** below)  
   - **Twitter / X**  
   - **Apple** (needs an Apple Developer account)  
   - **Facebook**  
   - **Yahoo**  

#### Web app config

6. Project overview (home) → **Web** app (`</>`) → **Register app** with nickname `smart-summify-extension`.
7. Copy the `firebaseConfig` object below for reference (the extension uses **Vite env vars** that match these fields):

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

#### Service account (backend)

8. **Project settings** (gear) → **Service accounts**.
9. **Generate new private key** → download the JSON file.
10. From that JSON, copy:
    - `project_id` → **`FIREBASE_PROJECT_ID`**
    - `client_email` → **`FIREBASE_CLIENT_EMAIL`**
    - `private_key` → **`FIREBASE_PRIVATE_KEY`** (string starting with `-----BEGIN`)

#### GitHub OAuth (for the GitHub sign-in provider)

1. Open [GitHub → New OAuth app](https://github.com/settings/applications/new).
2. **Application name:** Smart Summify AI  
3. **Homepage URL:** `https://smart-summify-ai-development.up.railway.app`  
4. **Authorization callback URL:**  
   `https://YOUR-PROJECT-ID.firebaseapp.com/__/auth/handler`  
   (replace `YOUR-PROJECT-ID` with your Firebase project ID)
5. **Register application** → copy **Client ID** and **Client Secret** into the GitHub provider in Firebase Authentication.

#### Authorized domains (after Railway is deployed)

- Firebase → Authentication → **Settings** → **Authorized domains**
- Add: `smart-summify-ai-development.up.railway.app`
- Add your production Railway host when it exists.

---

### STEP 2 — Supabase project

1. Go to [Supabase](https://supabase.com) → sign up → **New project**.
2. **Name:** `smart-summify`  
   **Database password:** strong password (save it)  
   **Region:** closest to you  
3. **Create project** and wait ~2 minutes.

#### Database schema

4. Left sidebar → **SQL Editor** → **New query**.
5. Open `docs/supabase-schema.sql` in this repo — copy **entire** file into the editor.
6. Run the query (**Run** or `Ctrl`+`Enter`).
7. Expect: **Success. No rows returned.**

#### Storage bucket

8. **Storage** → **New bucket**
   - **Name:** `exports`
   - **Public:** OFF  
   - **File size limit:** 50 MB  
   - **Save**

   Only this bucket is required. Exports/slides uploads use it; summarization uploads are processed in memory on the backend.

#### API keys

9. **Settings** → **API**
   - **Project URL** → **`SUPABASE_URL`**
   - **service_role** key (reveal, then copy) → **`SUPABASE_SERVICE_ROLE_KEY`**

> **Important:** `service_role` is secret. **Backend only** — never embed it in the extension.

---

### STEP 3 — Stripe account

1. Go to [Stripe](https://stripe.com) → create account → verify email.
2. Turn **Test mode** ON (toggle top right) until you go live.

#### Basic product

3. **Product catalogue** → **Add product**
   - **Name:** Smart Summify — Basic  
   - **Description:** (internal reference) e.g. daily limits, export, chat  
   - **Pricing:** Standard → **$4.99 USD** → **Monthly (recurring)**  
   - **Tax:** Exclusive (or per your accounting)  
   - **Statement descriptor:** `SMARTSUMMIFY BASIC`  
   - **Save**
4. Open the product → select the price → copy **Price ID** → **`STRIPE_BASIC_PRICE_ID`**

#### Basic — yearly (optional)

5. Same product → **Add another price** → e.g. **$39 / year** → **Save** (note price ID if you use yearly later).

#### Premium product

6. **Add product**
   - **Name:** Smart Summify — Premium  
   - **Description:** (internal) unlimited, slides, social cards, etc.  
   - **Pricing:** **$12.99 USD** → **Monthly (recurring)**  
   - **Statement descriptor:** `SMARTSUMMIFY PREMIUM`  
   - **Save**
7. Copy **Price ID** → **`STRIPE_PREMIUM_PRICE_ID`**

#### Premium — yearly (optional)

8. **Add another price** → e.g. **$99 / year** → **Save**

#### API keys & customer portal

9. **Developers** → **API keys** → **Reveal** secret key → **`STRIPE_SECRET_KEY`** (`sk_test_…` in test mode)
10. **Settings** → **Billing** → **Customer portal** → **Activate**

> Do **not** create the billing webhook until the backend URL exists (Phase 2). You will add it after Railway deploy.

---

## Phase 2 — Backend setup

### STEP 4 — Set up backend locally

1. In a terminal:

```bash
cd smart-summify/backend
npm install
```

2. If `npm audit` reports issues: run `npm audit fix` once; do **not** use `npm audit fix --force`.

3. Copy the env template:

```bash
# Windows
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

4. Edit **`backend/.env`** and set:

```text
FIREBASE_PROJECT_ID       = (from service account JSON, project_id)
FIREBASE_CLIENT_EMAIL     = (from service account JSON, client_email)
FIREBASE_PRIVATE_KEY      = (from service account JSON, private_key)
                            Keep \n escapes; wrap the full value in double quotes.

SUPABASE_URL              = (Supabase → Settings → API → Project URL)
SUPABASE_SERVICE_ROLE_KEY = (Supabase → service_role key)

GEMINI_API_KEY            = (Google AI Studio / Gemini API key)

STRIPE_SECRET_KEY         = (Stripe secret, sk_test_… in dev)
STRIPE_WEBHOOK_SECRET     = (leave empty until webhook is created in Phase 2)
STRIPE_BASIC_PRICE_ID     = (Stripe Basic price_…)
STRIPE_PREMIUM_PRICE_ID   = (Stripe Premium price_…)

PORT                      = 3001
NODE_ENV                  = development
FRONTEND_ORIGIN           = chrome-extension://placeholder   # update after loading unpacked extension
```

5. Run the API:

```bash
npm run dev
```

6. Expect log: `Smart Summify backend running on port 3001`.
7. Open [http://localhost:3001/health](http://localhost:3001/health) — expect `{"status":"ok",...}`.
8. Stop with `Ctrl+C`.

---

### STEP 5 — Deploy backend to Railway

Your **development** URL example: `https://smart-summify-ai-development.up.railway.app` (use yours if different).

#### Push code to GitHub

1. Create a **private** repo on GitHub (e.g. `smart-summify-ai`).
2. From the **repo root**:

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/smart-summify-ai.git
git push -u origin main
```

#### Connect Railway

3. [Railway](https://railway.app) → your project → **development** environment.
4. **New** → **GitHub repo** → select `smart-summify-ai`.
5. Set **root directory** to **`/backend`**.
6. Wait for Node build/deploy to finish.

#### Variables (development service)

7. Open the **backend** service → **Variables**.
8. Add the same keys as local `.env` (`FIREBASE_*`, `SUPABASE_*`, `GEMINI_*`, `STRIPE_*`, `PORT`, `NODE_ENV`, `FRONTEND_ORIGIN`). Paste **`FIREBASE_PRIVATE_KEY`** in full (with `\n`).
9. Redeploy (~30 s after saving variables).

#### Health check

10. Open `https://YOUR-DEV-HOST/health` — expect JSON `status: ok`.

#### Stripe webhook (development)

11. Stripe → **Developers** → **Webhooks** → **Add endpoint**
    - **URL:** `https://YOUR-DEV-HOST/webhooks/stripe`
    - **Events:**  
      `customer.subscription.created`,  
      `customer.subscription.updated`,  
      `customer.subscription.deleted`,  
      `invoice.payment_failed`
12. Copy **Signing secret** (`whsec_…`).
13. Railway → **Variables** → set **`STRIPE_WEBHOOK_SECRET`** → redeploy.

---

## Phase 3 — Chrome extension setup

### STEP 6 — TypeScript env types (`vite-env.d.ts`)

1. Create **`extension/src/vite-env.d.ts`** with:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

This removes the error *Property 'env' does not exist on type 'ImportMeta'*.

---

### STEP 7 — Configure the extension

#### 7a — Firebase client (`extension/src/lib/firebase.ts`)

1. Set `firebaseConfig` to values from Firebase **Project settings** (same project as your backend Admin SDK).

```javascript
const firebaseConfig = {
  apiKey: "YOUR_REAL_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

#### 7b — API base URL (`extension/src/lib/api.ts`)

2. Use Vite env (typical line 3–4):

```typescript
const BASE_URL = import.meta.env.VITE_API_URL;
```

#### 7c — `host_permissions` (`extension/public/manifest.json`)

3. List every API origin you use (Chrome cannot read `import.meta.env` in the manifest):

```json
"host_permissions": [
  "http://localhost:3001/*",
  "https://smart-summify-ai-development.up.railway.app/*",
  "https://smart-summify-ai-production.up.railway.app/*"
]
```

#### 7d — Vite env files

4. **`extension/.env.development`** — single line (example):

   `VITE_API_URL=https://smart-summify-ai-development.up.railway.app`

5. **`extension/.env.production`** — single line (example):

   `VITE_API_URL=https://smart-summify-ai-production.up.railway.app`

> Do not commit real `.env` files if they contain secrets; align with your `.gitignore`.

#### 7e — `extension/tsconfig.json`

6. Use (or merge with) this config:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["chrome", "vite/client"]
  },
  "include": ["src"]
}
```

---

### STEP 8 — Install dependencies and build

1.

```bash
cd smart-summify/extension
npm install
```

2. Optional: `npm audit fix` once (no `--force`).

3. **Development** (watch + `.env.development`):

```bash
npm run dev
```

4. **Production** build (`.env.production`):

```bash
npm run build
```

Output is **`extension/dist`** — that is what Chrome loads.

---

### STEP 9 — Load unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → choose **`smart-summify/extension/dist`**.
4. Pin the extension from the puzzle icon.

#### Extension ID

5. On `chrome://extensions`, copy the extension **ID** under the name.

#### Railway

6. Backend service → **Variables** → set  
   **`FRONTEND_ORIGIN`** = `chrome-extension://YOUR_EXTENSION_ID`  
   (use the real ID).

#### Firebase authorized domains

7. Firebase → Authentication → **Authorized domains** → add  
   `chrome-extension://YOUR_EXTENSION_ID`  
   (as Firebase documents; often you also add the Railway host without scheme).

---

### STEP 10 — End-to-end test

1. Open the extension → sign in.
2. Open a long article → **Summarize** → confirm output + metrics.
3. Supabase → **Table Editor** → `summaries` → new row.
4. **Billing:** open profile / upgrade → Stripe Checkout (test card below).
5. Test card:

```text
Card:   4242 4242 4242 4242
Expiry: any future date
CVC:    any 3 digits
```

6. After success: Supabase `users.plan` → `basic` (or chosen plan); extension badge updates.

---

## Phase 4 — Production deployment

Do this only when development testing is done.

### STEP 11 — Railway production

1. Railway → **Add environment** → name e.g. `production`.
2. New service → same repo → root **`/backend`**.
3. Copy dev variables, then set at least:
   - **`NODE_ENV`** = `production`
   - **`STRIPE_SECRET_KEY`** = `sk_live_…`
   - **`STRIPE_WEBHOOK_SECRET`** = live `whsec_…`
   - **`STRIPE_BASIC_PRICE_ID` / `STRIPE_PREMIUM_PRICE_ID`** = **live** price IDs
   - **`FRONTEND_ORIGIN`** = store extension ID when known
4. Attach a **production** public URL.

---

### STEP 12 — Stripe live

1. Switch Stripe to **Live** mode.
2. **Developers** → API keys → **Live** secret → Railway production.
3. Recreate or copy **live** products/prices → update price IDs in Railway.
4. **Webhooks** → add live endpoint → `https://YOUR-PROD-HOST/webhooks/stripe` → same four events → paste **`whsec`** into Railway.

---

### STEP 13 — Publish extension (Chrome Web Store)

1. Set **`extension/.env.production`** `VITE_API_URL` to production API if needed.
2.

```bash
cd smart-summify/extension
npm run build
```

3. Zip **`dist/`**:

```powershell
Compress-Archive -Path dist -DestinationPath smart-summify.zip
```

```bash
zip -r smart-summify.zip dist/
```

4. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → **New item** → upload zip.
5. Complete listing (name, description, screenshots, **privacy policy URL**).
6. Submit for review.

---

### STEP 14 — Store extension ID

After publication, Google assigns a **stable** extension ID (different from unpacked dev ID).

1. Firebase → **Authorized domains** — add the store ID format if required by your setup.
2. Railway **production** → **`FRONTEND_ORIGIN`** = `chrome-extension://STORE_EXTENSION_ID`.

---

## Quick reference — environment variables

### Backend (`backend/.env` + Railway)

```text
FIREBASE_PROJECT_ID          Firebase project ID (must match extension project)
FIREBASE_CLIENT_EMAIL        Service account email
FIREBASE_PRIVATE_KEY         Service account key (quoted, \n for newlines)
SUPABASE_URL                 https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY    Service role secret (backend only)
GEMINI_API_KEY               Google AI API key
STRIPE_SECRET_KEY            sk_test_… or sk_live_…
STRIPE_WEBHOOK_SECRET        whsec_…
STRIPE_BASIC_PRICE_ID        price_…
STRIPE_PREMIUM_PRICE_ID      price_…
PORT                         3001
NODE_ENV                     development | production
FRONTEND_ORIGIN              chrome-extension://EXTENSION_ID
CHROME_EXTENSION_ID          (optional) restrict CORS to one extension
```

### Extension (Vite — do not commit secrets)

```env
# .env.development
VITE_API_URL=https://YOUR-DEV-API-HOST

# .env.production
VITE_API_URL=https://YOUR-PROD-API-HOST
```

---

## Quick reference — Commands

**Develop (watch + dev API URL):**

```bash
cd extension
npm run dev
```

Reload **dist** in `chrome://extensions` after rebuilds.

**Ship a build:**

```bash
cd extension
npm run build
```

Zip `dist/` for the Web Store.

---

## File reference — repository layout

```text
backend/
  .env.example             Template for local secrets
  package.json
  src/
    index.js               Express app entry, CORS, routes, rate limits
    config/
      firebase.js          Firebase Admin SDK
      supabase.js          Supabase client (service role)
      gemini.js            Gemini client
    middleware/
      auth.js              JWT + user row + plan limits
    services/
      summarizeService.js
      documentService.js
    routes/
      summarize.js         POST /v1/summarize, /v1/summarize/guest, /file
      chat.js              /v1/chat
      export.js             /v1/export
      social.js             /v1/social-images
      slides.js             /v1/slides
      users.js              /v1/users/me, subscribe, billing-portal, history, feedback
      stripe.js             POST /webhooks/stripe (raw body)

extension/
  .env.development / .env.production   VITE_* (gitignore as needed)
  public/manifest.json
  vite.config.ts
  src/
    lib/firebase.ts        Client Firebase + OAuth helpers
    lib/api.ts             fetch() to VITE_API_URL
    store/index.ts         Zustand state
    components/            UI (Header, SummaryTab, FeedbackPanel, …)
    popup/App.tsx
    background/index.ts
    content/index.ts

docs/
  supabase-schema.sql      Full schema (users, summaries, chat, feedback, …)
  add-feedback-table.sql   Incremental feedback table only
  SETUP.md                   This guide
```
