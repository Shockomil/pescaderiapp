// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBfgqOgf41aMkQboIYJBGB3hVsNolKsKsU",
    authDomain: "pescaderia-batequis.firebaseapp.com",
    databaseURL: "https://pescaderia-batequis-default-rtdb.firebaseio.com",
    projectId: "pescaderia-batequis",
    storageBucket: "pescaderia-batequis.firebasestorage.app",
    messagingSenderId: "155789240392",
    appId: "1:155789240392:web:144af36bb1ce7f96df907d",
    measurementId: "G-P8CDP9ETFN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Auth con persistencia de React Native
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
});

// Inicializar Firestore
export const db = getFirestore(app);