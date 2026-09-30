import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, browserLocalPersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Tus credenciales existentes de Firebase
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

// Inicializar la app de Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Configurar la autenticación según la plataforma (Web o Móvil)
let auth;
if (Platform.OS === 'web') {
    auth = initializeAuth(app, {
        persistence: browserLocalPersistence
    });
} else {
    auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage)
    });
}

export { auth, app };