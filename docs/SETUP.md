# Smart Summify AI — Complete Setup Guide
# Follow every step in order. Estimated time: ~2 hours.

═══════════════════════════════════════════════════════════
 PHASE 1 — THIRD-PARTY ACCOUNTS (no code yet)
═══════════════════════════════════════════════════════════

STEP 1 — Firebase project
─────────────────────────
1. Go to https://console.firebase.google.com
2. Click "Add project" → name it "smart-summify" → Continue
3. Disable Google Analytics (not needed) → Create project

Enable Authentication:
4. Left sidebar → Build → Authentication → Get started
5. Sign-in method tab → Enable these providers one by one:
   • Google          → Enable → Save
   • GitHub          → Enable → paste GitHub OAuth credentials (see Step 1b)
   • Twitter/X       → Enable → paste Twitter app credentials
   • Apple           → Enable → follow Apple setup (needs Apple Developer account)
   • Facebook        → Enable → paste Facebook App credentials
   • Yahoo           → Enable → paste Yahoo credentials
   • Email/Password  → Enable → Save

Enable Email/Password:
6. Sign-in method → Email/Password → Enable → Save

Get your web app config:
7. Project Overview (home) → </> (Web app icon) → Register app
8. App nickname: "smart-summify-extension" → Register
9. COPY the firebaseConfig object — you'll paste it into firebase.ts

Get service account (for backend):
10. Project Settings (gear icon) → Service accounts
11. "Generate new private key" → Download JSON
12. Open the JSON and note: project_id, client_email, private_key

Step 1b — GitHub OAuth (for Firebase GitHub provider):
  • Go to https://github.com/settings/applications/new
  • App name: Smart Summify AI
  • Homepage URL: https://your-backend.railway.app
  • Callback URL: https://your-project.firebaseapp.com/__/auth/handler
  • Register → copy Client ID and Client Secret → paste into Firebase GitHub provider


STEP 2 — Supabase project
──────────────────────────
1. Go to https://supabase.com → New project
2. Name: "smart-summify" | Database password: (save this!) | Region: closest to you
3. Wait ~2 minutes for project to spin up

Run the database schema:
4. Left sidebar → SQL Editor → New query
5. Open the file: docs/supabase-schema.sql
6. Paste entire contents → Run (green play button)
7. You should see "Success. No rows returned."

Create storage buckets:
8. Left sidebar → Storage → New bucket
   • Name: "exports" | Public: OFF | File size limit: 50MB → Create
9. New bucket again:
   • Name: "uploads" | Public: OFF | File size limit: 50MB → Create

Get your keys:
10. Settings → API
    • Copy "Project URL" → this is SUPABASE_URL
    • Copy "service_role" secret key → this is SUPABASE_SERVICE_ROLE_KEY
    ⚠️  Never expose the service_role key in the extension or frontend


STEP 3 — Stripe account
─────────────────────────
1. Go to https://stripe.com → Create account (verify email)
2. Dashboard → switch to TEST mode first (toggle top right)

Create products:
3. Products → Add product
   • Name: "Basic Plan — A Coffee"
   • Price: $4.99 / month (recurring)
   • Save → copy the Price ID (starts with price_) → this is STRIPE_BASIC_PRICE_ID

4. Add another product:
   • Name: "Premium Plan — A Meal"
   • Price: $12.99 / month (recurring)
   • Save → copy Price ID → this is STRIPE_PREMIUM_PRICE_ID

Get secret key:
5. Developers → API keys → Secret key → Reveal → copy
   This is STRIPE_SECRET_KEY

Set up webhook (do this AFTER backend is deployed in Phase 3):
6. Developers → Webhooks → Add endpoint
   • URL: https://your-backend.railway.app/webhooks/stripe
   • Events to listen to:
     - customer.subscription.created
     - customer.subscription.updated
     - customer.subscription.deleted
     - invoice.payment_failed
7. Save → copy "Signing secret" → this is STRIPE_WEBHOOK_SECRET

Enable Customer Portal:
8. Settings → Billing → Customer portal → Activate


═══════════════════════════════════════════════════════════
 PHASE 2 — BACKEND SETUP
═══════════════════════════════════════════════════════════

STEP 4 — Set up backend locally
─────────────────────────────────
Open your terminal:

  cd smart-summify/backend
  npm install

Create your .env file:
  cp .env.example .env

Now open .env and fill in every value using what you collected above:
  • FIREBASE_PROJECT_ID      → from Firebase service account JSON
  • FIREBASE_CLIENT_EMAIL    → from Firebase service account JSON
  • FIREBASE_PRIVATE_KEY     → from Firebase service account JSON (keep the \n characters)
  • SUPABASE_URL             → from Supabase Settings → API
  • SUPABASE_SERVICE_ROLE_KEY → from Supabase Settings → API
  • GEMINI_API_KEY           → from Google AI Studio (https://aistudio.google.com)
  • STRIPE_SECRET_KEY        → from Stripe Dashboard
  • STRIPE_WEBHOOK_SECRET    → from Stripe webhook (add after deploy)
  • STRIPE_BASIC_PRICE_ID    → from Stripe product
  • STRIPE_PREMIUM_PRICE_ID  → from Stripe product

Test locally:
  npm run dev
  # Should print: "Smart Summify backend running on port 3001"
  # Visit: http://localhost:3001/health → should return {"status":"ok"}


STEP 5 — Deploy backend to Railway
────────────────────────────────────
1. Go to https://railway.app → Login with GitHub
2. New Project → Deploy from GitHub repo
3. Select your repo → select the /backend folder as root
4. Railway will auto-detect Node.js and deploy

Add environment variables in Railway:
5. Your service → Variables → Add all the same key=value pairs from your .env
6. Railway will redeploy automatically

Get your live URL:
7. Settings → Domains → Generate Domain
8. Copy it (e.g. https://smart-summify-backend.railway.app)
9. Update FRONTEND_ORIGIN in Railway variables to your extension ID (get this after loading extension)

Now go back and add the Stripe webhook URL:
10. Return to Stripe → Webhooks → update endpoint URL to your Railway domain

═══════════════════════════════════════════════════════════
 PHASE 3 — CHROME EXTENSION SETUP
═══════════════════════════════════════════════════════════

STEP 6 — Configure extension
──────────────────────────────
1. Open: extension/src/lib/firebase.ts
   → Replace the entire firebaseConfig object with YOUR config from Firebase Step 1

2. Open: extension/src/lib/api.ts
   → Line 4: Replace BASE_URL with your Railway URL:
     const BASE_URL = 'https://your-backend.railway.app';

3. Open: extension/public/manifest.json
   → Line 12: Replace with your Railway URL:
     "https://your-backend.railway.app/*"

4. Create a .env file in the extension folder:
   echo "VITE_API_URL=https://your-backend.railway.app" > extension/.env


STEP 7 — Build the extension
──────────────────────────────
  cd smart-summify/extension
  npm install
  npm run build

This creates a /dist folder — that's your loadable extension.


STEP 8 — Load extension in Chrome
───────────────────────────────────
1. Open Chrome → address bar → chrome://extensions
2. Top right: enable "Developer mode" toggle
3. Click "Load unpacked"
4. Navigate to: smart-summify/extension/dist
5. Select the folder → Open

Your extension appears! Note the Extension ID (random string like "abcdefghijklmno...")

6. Go back to Railway → Variables → set:
   FRONTEND_ORIGIN=chrome-extension://YOUR_EXTENSION_ID_HERE
7. Railway will redeploy (takes ~30 seconds)


STEP 9 — Test everything end-to-end
─────────────────────────────────────
1. Click the Smart Summify extension icon in Chrome toolbar
2. Sign in with Google (or email)
3. Navigate to any article (e.g. a BBC or Wikipedia page)
4. Click "Summarize this page"
5. You should see a summary appear with time-saved metrics

Check data is being saved:
6. Supabase Dashboard → Table Editor → summaries
   → You should see a row with your summary and all metrics

Test subscription flow:
7. Click your plan badge (FREE) in the extension header
8. Select Basic → you'll be redirected to Stripe Checkout
9. Use test card: 4242 4242 4242 4242 | Exp: any future | CVC: any
10. Complete payment → check Supabase users table → plan should update to "basic"


═══════════════════════════════════════════════════════════
 PHASE 4 — BEFORE GOING LIVE
═══════════════════════════════════════════════════════════

STEP 10 — Switch Stripe to live mode
──────────────────────────────────────
1. Stripe Dashboard → toggle from TEST to LIVE
2. Get new live secret key → update Railway variable STRIPE_SECRET_KEY
3. Recreate products in live mode → update STRIPE_BASIC_PRICE_ID + STRIPE_PREMIUM_PRICE_ID
4. Add new live webhook endpoint → update STRIPE_WEBHOOK_SECRET

STEP 11 — Publish to Chrome Web Store
───────────────────────────────────────
1. Go to https://chrome.google.com/webstore/devconsole
2. Pay one-time $5 developer fee
3. New item → upload your extension/dist folder as a ZIP:
     cd extension && zip -r ../smart-summify.zip dist/
4. Fill in store listing: name, description, screenshots, category
5. Submit for review (usually 1-3 business days)

STEP 12 — Add your real extension ID to Firebase
──────────────────────────────────────────────────
After Chrome Web Store publishes your extension, you get a permanent ID.
1. Firebase Console → Authentication → Settings → Authorized domains
   → Add: chrome-extension://YOUR_PERMANENT_EXTENSION_ID
2. Update FRONTEND_ORIGIN in Railway to the permanent ID


═══════════════════════════════════════════════════════════
 FILE REFERENCE
═══════════════════════════════════════════════════════════

backend/
  src/
    index.js                   ← Express app entry point
    config/
      firebase.js              ← Firebase Admin SDK init
      supabase.js              ← Supabase client
      gemini.js                ← Gemini AI client
    middleware/
      auth.js                  ← Token verify + plan limits
    services/
      summarizeService.js      ← Core AI + metrics logging
      documentService.js       ← PDF/DOCX text extraction
    routes/
      summarize.js             ← POST /v1/summarize
      chat.js                  ← POST /v1/chat
      export.js                ← POST /v1/export
      social.js                ← POST /v1/social-images
      slides.js                ← POST /v1/slides
      users.js                 ← GET/PATCH /v1/users/me + billing
      stripe.js                ← POST /webhooks/stripe

extension/
  src/
    lib/
      firebase.ts              ← Auth helpers (FILL IN CONFIG)
      api.ts                   ← All API calls (UPDATE BASE_URL)
    store/
      index.ts                 ← Zustand global state
    background/index.ts        ← Service worker
    content/index.ts           ← Page text extractor
    components/
      AuthScreen.tsx           ← Login UI (all 6 providers)
      Header.tsx               ← Theme/font/logout controls
      SummaryTab.tsx           ← Main summarize UI
      ChatTab.tsx              ← Q&A chat UI
      ExportTab.tsx            ← Export + social + slides
      HistoryTab.tsx           ← Past summaries
    popup/
      App.tsx                  ← Root with tab navigation
      main.tsx                 ← React entry point
      index.html               ← HTML shell
  public/
    manifest.json              ← Extension manifest (UPDATE URL)

docs/
  supabase-schema.sql          ← Run in Supabase SQL Editor
  SETUP.md                     ← This file
