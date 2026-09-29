import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyBfgqOgf41aMkQboIYJBGB3hVsNolKsKsU",
    authDomain: "pescaderia-batequis.firebaseapp.com",
    projectId: "pescaderia-batequis",
    storageBucket: "pescaderia-batequis.firebasestorage.app",
    messagingSenderId: "155789240392",
    appId: "1:155789240392:web:144af36bb1ce7f96df907d"
};

// Si la app ya está iniciada en memoria la reutiliza, si no la crea
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db = getFirestore(app);
export const auth = getAuth(app);