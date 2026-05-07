import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
  OAuthProvider,
  FacebookAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// ─── Providers ─────────────────────────────────────────────────────
const googleProvider   = new GoogleAuthProvider();
const githubProvider   = new GithubAuthProvider();
const twitterProvider  = new TwitterAuthProvider();
const appleProvider    = new OAuthProvider('apple.com');
const facebookProvider = new FacebookAuthProvider();
const yahooProvider    = new OAuthProvider('yahoo.com');

export const socialLogin = async (provider: string) => {
  // Chrome MV3 blocks signInWithPopup (loads remote scripts).
  // launchWebAuthFlow opens a real browser OAuth page with prompt=select_account
  // so the user always sees Google's account picker.
  //
  // SETUP REQUIRED (one time):
  //   1. Google Cloud Console → APIs & Services → Credentials
  //   2. + Create Credentials → OAuth client ID → Application type: Web application
  //   3. Authorized redirect URIs → Add: https://<YOUR_EXTENSION_ID>.chromiumapp.org/
  //      (Extension ID is shown on chrome://extensions under Smart Summify AI)
  //   4. Copy the new Client ID → paste into extension/.env.development as
  //      VITE_GOOGLE_OAUTH_CLIENT_ID and rebuild with npm run dev:once
  if (provider === 'google') {
    const clientId    = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string;
    const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;

    // Log the redirect URI so you can copy-paste it into Google Cloud Console
    console.info('[SmartSummify] Google OAuth redirect URI to register:', redirectUri);

    const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    oauthUrl.searchParams.set('client_id',     clientId);
    oauthUrl.searchParams.set('redirect_uri',  redirectUri);
    oauthUrl.searchParams.set('response_type', 'token');
    oauthUrl.searchParams.set('scope',         'openid email profile');
    oauthUrl.searchParams.set('prompt',        'select_account');

    const responseUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: oauthUrl.toString(), interactive: true },
        (callbackUrl) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(
              `Google sign-in failed: ${err.message}\n` +
              `Make sure this redirect URI is registered in Google Cloud Console:\n${redirectUri}`
            ));
            return;
          }
          if (!callbackUrl) {
            reject(new Error('Google sign-in was cancelled.'));
            return;
          }
          resolve(callbackUrl);
        }
      );
    });

    const params      = new URLSearchParams(new URL(responseUrl).hash.slice(1));
    const accessToken = params.get('access_token');
    if (!accessToken) throw new Error('No access token in Google response.');

    const credential = GoogleAuthProvider.credential(null, accessToken);
    const result     = await signInWithCredential(auth, credential);
    return result.user;
  }

  // Chrome MV3 extensions block all external script loads (CSP: script-src 'self').
  // Firebase's signInWithPopup loads https://apis.google.com/js/api.js internally for
  // ALL providers — not just Google — so it is blocked in the extension popup.
  // Until a launchWebAuthFlow implementation is added for each provider,
  // only Google (chrome.identity) and Email/Password work inside the extension.
  throw new Error(
    `${provider.charAt(0).toUpperCase() + provider.slice(1)} sign-in is not supported directly in the extension.\n` +
    `Please use Google or Email / Password instead.`
  );
};

export const emailLogin = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const emailRegister = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const logout = () => signOut(auth);

export const getIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

export const onAuthChange = (cb: (user: User | null) => void) =>
  onAuthStateChanged(auth, cb);
