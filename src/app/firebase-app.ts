import { initializeApp, getApps, FirebaseApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyCSe7a5Mmcjxs-eg8amhmMAr1uXbe_Mtvs',
  authDomain: 'swechha-8453c.firebaseapp.com',
  projectId: 'swechha-8453c',
  storageBucket: 'swechha-8453c.firebasestorage.app',
  messagingSenderId: '573504232047',
  appId: '1:573504232047:web:1e92437c9809ab3d348b9a',
  measurementId: 'G-LEFE94QRRN'
};

let appInstance: FirebaseApp | null = null;

/** Returns the single shared Firebase app instance, initializing it on first use.
 *  Both ContentService and StorageService call this instead of each calling
 *  initializeApp() themselves, so it no longer matters which one Angular's DI
 *  happens to construct first. */
export function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    appInstance = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return appInstance;
}