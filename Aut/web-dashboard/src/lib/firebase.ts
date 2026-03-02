import admin from 'firebase-admin';

// Per evitare errori di build locale, inizializza solo se le variabili sono effettivamente configurate.
if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && !process.env.FIREBASE_PRIVATE_KEY.includes('PLACEHOLDER')) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, ''),
        }),
      });
    }
  } catch (error: any) {
    console.log('Firebase admin initialization error', error.stack);
  }
}

// Esporta un getter anziché chiamare direttamente firestore() così eviti crash su Next.js al build time
export const getDb = () => admin.apps.length ? admin.firestore() : null;
export const getAuth = () => admin.apps.length ? admin.auth() : null;