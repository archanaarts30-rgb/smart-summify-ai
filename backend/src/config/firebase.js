const admin = require('firebase-admin');

if (!admin.apps.length) {
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!privateKeyRaw || !String(privateKeyRaw).includes('PRIVATE KEY')) {
    throw new Error(
      '[firebase-admin] FIREBASE_PRIVATE_KEY missing or invalid. Paste the full key from Firebase service-account JSON.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: String(privateKeyRaw).replace(/\\n/g, '\n'),
    }),
  });

  console.log(
    '[firebase-admin] Loaded service account — tokens must come from Firebase project:',
    process.env.FIREBASE_PROJECT_ID || '(FIREBASE_PROJECT_ID unset)'
  );
}

module.exports = admin;
