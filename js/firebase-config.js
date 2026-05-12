import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js';

/*
 * Firebase Configuration
 * Replace with your Firebase project credentials.
 * Get these from: Firebase Console > Project Settings > General > Your apps
 */
const firebaseConfig = {
  apiKey: "AIzaSyA3F9-kE_PzkaglhwtADLDE3ba8KsOyTOk",
  authDomain: "gestion-tecnica-profesional.firebaseapp.com",
  projectId: "gestion-tecnica-profesional",
  storageBucket: "gestion-tecnica-profesional.firebasestorage.app",
  messagingSenderId: "560940669562",
  appId: "1:560940669562:web:1e21556712a9b3851379c3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

auth.languageCode = 'es';

export { app, auth, db };
