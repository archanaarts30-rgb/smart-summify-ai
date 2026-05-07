/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Backend API
  readonly VITE_API_URL: string;

  // Firebase
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;

  // App
  readonly VITE_UPGRADE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
