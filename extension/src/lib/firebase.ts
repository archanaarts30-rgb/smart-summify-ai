import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  TwitterAuthProvider,
  OAuthProvider,
  FacebookAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

// ─── Paste your Firebase project config here ──────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDQ_BJ--LdctIGiHzuFYw9apYVx7rKn5d8",
  authDomain: "smart-summify-ai.firebaseapp.com",
  projectId: "smart-summify-ai",
  storageBucket: "smart-summify-ai.firebasestorage.app",
  messagingSenderId: "334071808161",
  appId: "1:334071808161:web:00bac499ec847a70e830e0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// ─── Providers ─────────────────────────────────────────────────────
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();
const twitterProvider = new TwitterAuthProvider();
const appleProvider = new OAuthProvider('apple.com');
const facebookProvider = new FacebookAuthProvider();
const yahooProvider = new OAuthProvider('yahoo.com');

export const socialLogin = async (provider: string) => {
  const providerMap: Record<string, any> = {
    google: googleProvider,
    github: githubProvider,
    twitter: twitterProvider,
    apple: appleProvider,
    facebook: facebookProvider,
    yahoo: yahooProvider,
  };
  const p = providerMap[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  const result = await signInWithPopup(auth, p);
  return result.user;
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
