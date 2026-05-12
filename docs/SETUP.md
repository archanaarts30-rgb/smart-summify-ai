# Smart Summify AI — Complete setup guide

Follow every step **in order**. **Estimated time:** ~2 hours.

---

## Before you start — create `.gitignore`

Do this FIRST before anything else, before pushing any code to GitHub.

Create a file called `.gitignore` in the root smart-summify folder with this content:

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

Then verify it works:

```bash
git init
git add .
git status
```

> You should NEVER see node_modules/ or .env in the list


---

## Phase 1 — Third-party accounts *(no application code yet)*

### STEP 1 — Firebase project

1. Go to https://console.firebase.google.com
2. Click "Add project" → name it "smart-summify" → Continue
3. Disable Google Analytics (not needed) → Create project

Enable Authentication:
4. Left sidebar → Build → Authentication → Get started
5. Sign-in method tab → Enable these providers one by one:
   • Email/Password  → Enable → Save  ← do this one first
   • Google          → Enable → Save
   • GitHub          → Enable → paste GitHub OAuth credentials (see Step 1b below)
   • Twitter/X       → Enable → paste Twitter app credentials
   • Apple           → Enable → follow Apple setup (needs Apple Developer account)
   • Facebook        → Enable → paste Facebook App credentials
   • Yahoo           → Enable → paste Yahoo credentials

Get your web app config:
6. Project Overview (home icon) → click </> (Web app icon) → Register app
7. App nickname: "smart-summify-extension" → Register
8. Copy the entire `firebaseConfig` object shown (you configure the extension via env files now; this is reference). It looks like this:

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

Get service account (for backend):
9.  Project Settings (gear icon top left) → Service accounts tab
10. Click "Generate new private key" → Download JSON file
11. Open the downloaded JSON and note these 3 values:
    • project_id       → this is FIREBASE_PROJECT_ID
    • client_email     → this is FIREBASE_CLIENT_EMAIL
    • private_key      → this is FIREBASE_PRIVATE_KEY (long string starting with -----BEGIN)

Step 1b — GitHub OAuth (for Firebase GitHub provider):
  • Go to https://github.com/settings/applications/new
  • Application name: Smart Summify AI
  • Homepage URL: https://smart-summify-ai-development.up.railway.app
  • Authorization callback URL: https://YOUR-PROJECT-ID.firebaseapp.com/__/auth/handler
    (replace YOUR-PROJECT-ID with your actual Firebase project ID)
  • Click Register application
  • Copy Client ID and Client Secret → paste into Firebase GitHub provider settings

Step 1c — Add authorized domains to Firebase (do after Railway deploy):
  • Firebase Console → Authentication → Settings → Authorized domains
  • Add your Railway dev domain: smart-summify-ai-development.up.railway.app
  • Add your Railway prod domain when ready


### STEP 2 — Supabase project

1. Go to https://supabase.com → Sign up → New project
2. Name: "smart-summify"
   Database password: create a strong one and SAVE IT somewhere safe
   Region: choose closest to you
3. Click Create project and wait ~2 minutes for it to spin up

Run the database schema:
4. Left sidebar → SQL Editor → click "New query"
5. Open the file: docs/supabase-schema.sql from this project
6. Copy the entire contents and paste into the SQL editor
7. Click the green Run button (or press Ctrl+Enter)
8. You should see "Success. No rows returned." at the bottom

Create storage bucket:
9.  Left sidebar → Storage → New bucket
    • Name: exports
    • Public bucket: OFF (toggle stays grey)
    • File size limit: 50 MB
    → Click Save

    (Only this bucket is required. Generated PDF/DOCX/TXT exports and PPTX slides upload here.
    User-uploaded documents for summarization are processed in memory on the backend — they are
    not stored in Supabase Storage.)

Get your API keys:
10. Left sidebar → Settings → API
    • Copy "Project URL"           → this is SUPABASE_URL
    • Copy "service_role" key      → this is SUPABASE_SERVICE_ROLE_KEY
      (click the eye icon to reveal it, then copy)

⚠️  IMPORTANT: The service_role key has full database access.
    Never put it in the extension code. Backend only.


### STEP 3 — Stripe account

1. Go to https://stripe.com → Create account → verify your email
2. Once inside the dashboard, make sure TEST mode is ON
   (toggle in the top right should show "Test" — keep it here until you go live)

Create the Basic plan product:
3. Left sidebar → Product catalogue → Add product
   • Name:                Smart Summify — Basic
   • Description:         50 summaries/day, all sizes, PDF upload, audio, export & chat.
                          (this is just for your reference inside Stripe, not shown to users)
   • Pricing model:       Standard pricing
   • Price:               4.99
   • Currency:            USD
   • Billing period:      Monthly (Recurring)
   • Tax behaviour:       Exclusive
   • Statement descriptor: SMARTSUMMIFY BASIC
   → Click Save product
4. On the product page, click the price you just created
   Copy the Price ID (starts with price_xxxx) → this is STRIPE_BASIC_PRICE_ID

Add yearly pricing for Basic (optional but recommended):
5. On the same Basic product page → Add another price
   • Price: 39.00 | Billing period: Yearly
   → Save (copy this price ID too if you want to offer yearly billing later)

Create the Premium plan product:
6. Product catalogue → Add product
   • Name:                Smart Summify — Premium
   • Description:         Unlimited summaries, full chat, slides, 5 social cards & priority processing.
   • Pricing model:       Standard pricing
   • Price:               12.99
   • Currency:            USD
   • Billing period:      Monthly (Recurring)
   • Tax behaviour:       Exclusive
   • Statement descriptor: SMARTSUMMIFY PREMIUM
   → Click Save product
7. Copy the Price ID → this is STRIPE_PREMIUM_PRICE_ID

Add yearly pricing for Premium (optional):
8. Add another price → 99.00 | Yearly → Save

Get your secret key:
9. Left sidebar → Developers → API keys
   • Click "Reveal test key" next to Secret key
   • Copy it (starts with sk_test_)  → this is STRIPE_SECRET_KEY

Enable Customer Portal (lets users manage their own billing):
10. Left sidebar → Settings → Billing → Customer portal → Click Activate portal

⚠️  NOTE: Do NOT set up the webhook yet.
    Come back to do the webhook AFTER your backend is deployed in Phase 2.
    The webhook needs your live Railway URL which you do not have yet.


---

## Phase 2 — Backend setup

### STEP 4 — Set up backend locally

Open your terminal and navigate to the backend folder:

```bash
cd smart-summify/backend
npm install
```

⚠️  If npm audit shows vulnerabilities — this is expected and safe to ignore.
    Run "npm audit fix" once, then ignore any remaining warnings.
    Do NOT run "npm audit fix --force" — it will break your build.

Create your local `.env` file by copying the example:

```bash
# Windows
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Now open the `.env` file in any text editor and fill in every value:

```text
FIREBASE_PROJECT_ID       = (from Firebase service account JSON → project_id)
FIREBASE_CLIENT_EMAIL     = (from Firebase service account JSON → client_email)
FIREBASE_PRIVATE_KEY      = (from Firebase service account JSON → private_key)
                            ⚠️  Keep the \n characters exactly as they appear
                            ⚠️  Wrap the entire value in double quotes
                            Example:
                            FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"

SUPABASE_URL              = (from Supabase Settings → API → Project URL)
SUPABASE_SERVICE_ROLE_KEY = (from Supabase Settings → API → service_role key)

GEMINI_API_KEY            = (from https://aistudio.google.com → Get API key)

STRIPE_SECRET_KEY         = (from Stripe → Developers → API keys → Secret key)
STRIPE_WEBHOOK_SECRET     = leave blank for now — fill in after Railway deploy
STRIPE_BASIC_PRICE_ID     = (from Stripe Basic product → price ID)
STRIPE_PREMIUM_PRICE_ID   = (from Stripe Premium product → price ID)

PORT                      = 3001
NODE_ENV                  = development
FRONTEND_ORIGIN           = chrome-extension://placeholder (update after loading extension)
```

Test that your backend runs locally:

```bash
npm run dev
```

You should see: `Smart Summify backend running on port 3001`

- Open http://localhost:3001/health — you should see `{"status":"ok","ts":1234567890}`.
- If that works, the backend is running correctly. Press `Ctrl+C` to stop it.


### STEP 5 — Deploy backend to Railway

You already have a Railway account and a development environment set up.
Your development URL is: https://smart-summify-ai-development.up.railway.app

Push your code to GitHub first:
1. Create a new repo on https://github.com → name it "smart-summify-ai"
   Make sure it is set to Private
2. In your terminal from the smart-summify root folder:

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/smart-summify-ai.git
git push -u origin main
```


Connect Railway to your GitHub repo:
3. Go to https://railway.app → open your project → Development environment
4. New Service → GitHub Repo → select smart-summify-ai
5. Railway will ask which folder to use as root → select /backend
6. Railway will auto-detect Node.js and start deploying

Add environment variables to Railway Development:
7. Click your backend service → Variables tab
8. Add each variable from your .env file one by one
   (same keys and values as your local .env — copy them across exactly)
   Variables to add:
     FIREBASE_PROJECT_ID
     FIREBASE_CLIENT_EMAIL
     FIREBASE_PRIVATE_KEY        ← paste the full key including \n characters
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     GEMINI_API_KEY
     STRIPE_SECRET_KEY
     STRIPE_BASIC_PRICE_ID
     STRIPE_PREMIUM_PRICE_ID
     PORT = 3001
     NODE_ENV = development
     FRONTEND_ORIGIN = chrome-extension://placeholder

9. Railway redeploys automatically after adding variables (~30 seconds)

Verify Railway deployment:
10. Open this URL in your browser:
    https://smart-summify-ai-development.up.railway.app/health
    You should see: {"status":"ok","ts":1234567890}
    If yes — your backend is live on Railway.

Now go back and add the Stripe webhook:
11. Stripe Dashboard → Developers → Webhooks → Add endpoint
    • Endpoint URL: https://smart-summify-ai-development.up.railway.app/webhooks/stripe
    • Description: Smart Summify development webhook
    • Click "Select events" and search for and tick these 4:
        - customer.subscription.created
        - customer.subscription.updated
        - customer.subscription.deleted
        - invoice.payment_failed
    → Click Add endpoint
12. On the webhook detail page → Signing secret section → click Reveal
    Copy the value (starts with whsec_)
13. Go back to Railway → Variables → add:
    STRIPE_WEBHOOK_SECRET = whsec_xxxxxxxxxxxxxx
    (replace with your actual value)
14. Railway redeploys again automatically


---

## Phase 3 — Chrome extension setup

### STEP 6 — Add the TypeScript type declaration file

Create a new file at exactly this path: `extension/src/vite-env.d.ts`

Paste this content into it:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

This fixes the TypeScript error: *Property 'env' does not exist on type 'ImportMeta'*.


### STEP 7 — Configure the extension


7a. Paste your Firebase config:
    Open: extension/src/lib/firebase.ts
    Find the firebaseConfig object near the top and replace ALL placeholder
    values with your real values copied from Firebase (Step 1, point 8):

      const firebaseConfig = {
        apiKey: "YOUR_REAL_API_KEY",
        authDomain: "YOUR_PROJECT.firebaseapp.com",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_PROJECT.appspot.com",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID",
      };

7b. Update api.ts to use environment variable:
    Open: extension/src/lib/api.ts
    Find line 4 and replace the hardcoded URL with:

      const BASE_URL = import.meta.env.VITE_API_URL;

7c. Update manifest.json with all your URLs:
    Open: extension/public/manifest.json
    Find the "host_permissions" array and replace it with all three URLs:

      "host_permissions": [
        "http://localhost:3001/*",
        "https://smart-summify-ai-development.up.railway.app/*",
        "https://smart-summify-ai-production.up.railway.app/*"
      ],

    ⚠️  List all three URLs — having extras causes no harm at all.
        The manifest.json is a plain JSON file read directly by Chrome.
        It cannot use environment variables like VITE_API_URL.
        This is why we list all URLs here and control which one is
        actually used via the .env files in api.ts.

7d. Create the extension environment files:

    Create file: extension/.env.development
    Add this single line:
      VITE_API_URL=https://smart-summify-ai-development.up.railway.app

    Create file: extension/.env.production
    Add this single line:
      VITE_API_URL=https://smart-summify-ai-production.up.railway.app

    ⚠️  These files must NOT be committed to GitHub.
        They are already covered by your .gitignore file.

7e. Create `extension/tsconfig.json` with:

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


### STEP 8 — Install dependencies and build the extension

In your terminal:

```bash
cd smart-summify/extension
npm install
```

⚠️  You will see vulnerability warnings — same situation as the backend.
    Run "npm audit fix" once then ignore any remaining warnings.
    Do NOT run "npm audit fix --force".

Build for development (Vite automatically picks up `.env.development`):

```bash
npm run dev
```

Build for production (Vite automatically picks up `.env.production`):

```bash
npm run build
```

Both commands output to the `/dist` folder — that is the folder Chrome loads. Use **`npm run dev`** while testing; **`npm run build`** only when releasing.


### STEP 9 — Load extension in Chrome

1. Open Chrome
2. In the address bar type: chrome://extensions and press Enter
3. Top right corner: turn ON the "Developer mode" toggle
4. Click "Load unpacked" button that appears on the left
5. Navigate to your folder: smart-summify/extension/dist
6. Select the dist folder → click Open (or Select Folder on Windows)

Your extension now appears in Chrome.
Pin it to your toolbar by clicking the puzzle piece icon → pin Smart Summify AI.

Get your Extension ID:
7. On the chrome://extensions page, find Smart Summify AI
8. Below the extension name you will see an ID — a long string like:
   abcdefghijklmnopabcdefghijklmnop
   Copy this entire ID

Update Railway with your Extension ID:
9.  Railway → Development environment → your backend service → Variables tab
    Find FRONTEND_ORIGIN and update its value to:
    chrome-extension://abcdefghijklmnopabcdefghijklmnop
    (use your actual ID, not this example)
10. Railway redeploys automatically in ~30 seconds

Add Extension ID to Firebase authorized domains:
11. Firebase Console → Authentication → Settings → Authorized domains
    → Add domain → paste:
    chrome-extension://abcdefghijklmnopabcdefghijklmnop


### STEP 10 — Test everything end-to-end

1. Click the Smart Summify AI extension icon in the Chrome toolbar
2. You should see the login screen with all provider buttons
3. Sign in with Google
4. Navigate to any news article or Wikipedia page
5. Click the extension icon → click "Summarize this page"
6. A summary should appear with the time-saved metrics bar at the top

Check your data is being stored in Supabase:
7. Go to Supabase Dashboard → Table Editor → summaries table
   → You should see a new row with your summary and all the logged metrics
   (tokens, word counts, time saved, source URL, etc.)

Test the subscription flow with Stripe test card:
8.  In the extension header, click the FREE badge
9.  Click upgrade to Basic → you will be redirected to Stripe Checkout
10. Use the Stripe test card:

```text
Card number:  4242 4242 4242 4242
Expiry date:  Any future date (e.g. 12/28)
CVC:          Any 3 digits (e.g. 123)
Name:         Any name
```
11. Complete the payment
12. Check Supabase → Table Editor → users table
    → Your row's plan column should now show "basic"
13. Go back to the extension → the FREE badge in the header should now show BASIC
14. Try uploading a PDF — it should now work (was locked on free plan)


---

## Phase 4 — Production deployment

Only do this when you have fully tested everything in development
and are confident it is ready for real users.

### STEP 11 — Set up Railway Production environment

1. Railway → your project → Add environment → name it "production"
2. Add a new service → same GitHub repo → /backend folder
3. Add all the same environment variables as development BUT change:
   • NODE_ENV = production
   • STRIPE_SECRET_KEY = your LIVE Stripe key (sk_live_...)
   • STRIPE_WEBHOOK_SECRET = your LIVE webhook secret (whsec_...)
   • STRIPE_BASIC_PRICE_ID = your LIVE Basic price ID
   • STRIPE_PREMIUM_PRICE_ID = your LIVE Premium price ID
   • FRONTEND_ORIGIN = chrome-extension://YOUR_STORE_EXTENSION_ID (update after publishing)
4. Generate a domain for production environment → copy the URL


### STEP 12 — Switch Stripe to Live mode

1. Stripe Dashboard → toggle from TEST to LIVE (top right corner)
2. Developers → API keys → copy the live Secret key (starts with sk_live_)
3. Product catalogue → recreate both products in live mode:
   (same names, descriptions and prices — live mode generates new price IDs)
   → Copy the new live price IDs for Basic and Premium
4. Developers → Webhooks → Add endpoint (make sure you are in live mode):
   • URL: https://smart-summify-ai-production.up.railway.app/webhooks/stripe
   • Same 4 events as before
   → Copy the live whsec_ signing secret
5. Update Railway Production environment variables with all four live Stripe values


### STEP 13 — Build and publish extension for production

1. Update extension/.env.production with your real production Railway URL if different
2. Build the production extension:

```bash
cd smart-summify/extension
npm run build
```


3. Create a ZIP of the dist folder:

```powershell
Compress-Archive -Path dist -DestinationPath smart-summify.zip
```

```bash
zip -r smart-summify.zip dist/
```

4. Go to https://chrome.google.com/webstore/devconsole
5. Pay the one-time $5 developer registration fee (only once ever)
6. Click "New item" → upload smart-summify.zip
7. Fill in the store listing:
   • Name: Smart Summify AI
   • Short description: AI-powered summarizer for any webpage, PDF or document
   • Category: Productivity
   • Screenshots: at least 1 screenshot of the extension in use (1280x800 pixels)
   • Privacy policy URL: required — you need a hosted privacy policy page
8. Submit for review
   → Google usually reviews within 1–3 business days


### STEP 14 — Update Firebase with permanent extension ID

After the Chrome Web Store publishes your extension, you receive a permanent
extension ID (this is different from your developer mode ID used during testing).

1. Firebase Console → Authentication → Settings → Authorized domains
   → Add domain: chrome-extension://YOUR_PERMANENT_STORE_EXTENSION_ID
2. Railway Production → Variables → update FRONTEND_ORIGIN:
   FRONTEND_ORIGIN = chrome-extension://YOUR_PERMANENT_STORE_EXTENSION_ID


---

## Quick reference — environment variables

Backend — goes in `backend/.env` locally and Railway Variables on server:

```text
FIREBASE_PROJECT_ID          Your Firebase project ID
FIREBASE_CLIENT_EMAIL        Service account client email
FIREBASE_PRIVATE_KEY         Service account private key (with \n characters)
SUPABASE_URL                 https://yourproject.supabase.co
SUPABASE_SERVICE_ROLE_KEY    Supabase service role secret key
GEMINI_API_KEY               Google AI Studio API key
STRIPE_SECRET_KEY            sk_test_... (dev) or sk_live_... (prod)
STRIPE_WEBHOOK_SECRET        whsec_...
STRIPE_BASIC_PRICE_ID        price_... (Basic monthly)
STRIPE_PREMIUM_PRICE_ID      price_... (Premium monthly)
PORT                         3001
NODE_ENV                     development or production
FRONTEND_ORIGIN              chrome-extension://YOUR_EXTENSION_ID
```

Extension — separate files (do not commit to GitHub):

```env
# extension/.env.development
VITE_API_URL=https://smart-summify-ai-development.up.railway.app

# extension/.env.production
VITE_API_URL=https://smart-summify-ai-production.up.railway.app
```


---

## Quick reference — Dev vs prod commands

When developing and testing new features:

```bash
cd extension
npm run dev
```

- Vite uses `.env.development` → `VITE_API_URL` points at Railway dev.
- Load the `extension/dist` folder under `chrome://extensions` while the watcher runs.

When releasing to production:

```bash
cd extension
npm run build
# → Vite picks .env.production → VITE_API_URL points to Railway prod
# → Zip the /dist folder → upload to Chrome Web Store
```

---

## File reference — repository layout

```text
backend/
  .env.example               Template — copy to .env and fill in your values
  .env                       Your real secret keys — NEVER commit to GitHub
  package.json               Node.js dependencies list
  src/
    index.js                 Express app — registers all routes and middleware
    config/
      firebase.js            Initialises Firebase Admin SDK
      supabase.js            Initialises Supabase client
      gemini.js              Initialises Gemini AI client
    middleware/
      auth.js                Verifies Firebase token on every request
                             Also enforces plan limits (free/basic/premium)
    services/
      summarizeService.js    Calls Gemini, logs all metrics to Supabase
      documentService.js     Extracts text from PDF and DOCX files
    routes/
      summarize.js           POST /v1/summarize
                             POST /v1/summarize/file (with PDF/DOCX upload)
      chat.js                POST /v1/chat
                             GET  /v1/chat/:summaryId (load history)
      export.js              POST /v1/export (returns signed download URL)
      social.js              POST /v1/social-images
      slides.js              POST /v1/slides (generates PPTX)
      users.js               GET  /v1/users/me
                             PATCH /v1/users/me
                             POST /v1/users/subscribe (creates Stripe checkout)
                             POST /v1/users/billing-portal
                             GET  /v1/users/history
                             POST /v1/users/feedback
      stripe.js              POST /webhooks/stripe (syncs plan to Supabase)

extension/
  .env.development           VITE_API_URL for dev — NEVER commit to GitHub
  .env.production            VITE_API_URL for prod — NEVER commit to GitHub
  tsconfig.json              TypeScript compiler configuration
  vite.config.ts             Vite build config (multi-entry for Chrome extension)
  package.json               Extension dependencies list
  src/
    vite-env.d.ts            TypeScript types for import.meta.env.VITE_API_URL
    lib/
      firebase.ts            All Firebase auth functions
      api.ts                 All backend API calls
    store/
      index.ts               Zustand global state (theme, font size, user, summary, chat)
    background/
      index.ts               Chrome service worker — handles extension lifecycle
    content/
      index.ts               Runs on every page — extracts clean text on demand
    components/
      AuthScreen.tsx         Login UI
      Header.tsx             Theme toggle, avatar, feedback, tabs entry
      SummaryTab.tsx         Main summarize UI
      FeedbackPanel.tsx       User feedback form
      ChatTab.tsx            Q&A chat with conversation history
      ExportTab.tsx          Export PDF/DOCX/TXT, social cards, slides
      HistoryTab.tsx         List of past summaries
    popup/
      App.tsx                Root component — auth gate + tab navigation
      main.tsx               React DOM entry point
      index.html             HTML shell for the popup window
    styles/
      global.css             CSS variables for light/dark mode
  public/
    manifest.json            Chrome extension manifest — host_permissions URLs

docs/
  supabase-schema.sql        Run in Supabase SQL Editor (includes feedback table in full schema)
  add-feedback-table.sql     Incremental: create feedback table only
  SETUP.md                   This file
```