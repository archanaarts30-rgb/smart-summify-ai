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
  // Chrome extensions (MV3) cannot load remote scripts like `https://apis.google.com/js/api.js`
  // which Firebase Auth's Google popup flow depends on. For Google, use `chrome.identity`
  // to obtain an OAuth access token, then sign into Firebase with a credential.
  if (provider === 'google') {
    const accessToken = await new Promise<string>((resolve, reject) => {
      if (!chrome?.identity?.getAuthToken) {
        reject(new Error('chrome.identity is unavailable. Add "identity" permission in manifest.json.'));
        return;
      }
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || 'Failed to get Google auth token.'));
          return;
        }
        if (!token) {
          reject(new Error('No Google auth token returned.'));
          return;
        }
        resolve(token);
      });
    });

    const credential = GoogleAuthProvider.credential(null, accessToken);
    const result = await signInWithCredential(auth, credential);
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
