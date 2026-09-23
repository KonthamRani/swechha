import { Injectable, signal } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';

import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  Firestore
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  FirebaseStorage
} from 'firebase/storage';

import type {
  Episode,
  CharacterEntry,
  MoodImage,
  TechItem,
  Article,
  AboutLink
} from './app';

/* =========================================================
   1. FIREBASE PROJECT CONFIG
   -----------------------------------------------------------
   Create a free (Spark plan) project at https://console.firebase.google.com
   -> Build > Firestore Database > Create database (start in test mode,
      then lock it down with the rules below)
   -> Build > Storage > Get started (also free tier, 5GB)
   -> Project settings > General > "Your apps" > Web app > copy the config
   Paste the values below. These keys are safe to ship to the browser —
   Firestore/Storage access is controlled by the security rules, not by
   hiding this config.
   ========================================================= */
// Import the functions you need from the SDKs you need
// import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCSe7a5Mmcjxs-eg8amhmMAr1uXbe_Mtvs",
  authDomain: "swechha-8453c.firebaseapp.com",
  projectId: "swechha-8453c",
  storageBucket: "swechha-8453c.firebasestorage.app",
  messagingSenderId: "573504232047",
  appId: "1:573504232047:web:1e92437c9809ab3d348b9a",
  measurementId: "G-LEFE94QRRN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);

/* Suggested Firestore rules (Firebase console > Firestore > Rules):

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /swechha/site {
         allow read: if true;
         allow write: if true; // tighten once you add real auth — see note below
       }
     }
   }

   Suggested Storage rules (Firebase console > Storage > Rules):

   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /swechha-uploads/{allPaths=**} {
         allow read: if true;
         allow write: if true; // same caveat as above
       }
     }
   }

   NOTE ON SECURITY: this app's "admin" check is just a username string
   typed client-side (username === 'cooler'), so anyone can open devtools
   and call ContentService.save() directly regardless of what the UI shows.
   Wide-open write rules match that reality today. If you want this to be
   real, add Firebase Authentication (e.g. anonymous auth + a custom claim,
   or email/password for the one admin account) and change the rules to
   check request.auth instead of leaving writes fully open.

   NOTE ON THE DOC PATH: the Firestore document below still lives at
   ['swecha', 'site'] (single h) rather than 'swechha' — that's the path
   your existing data was already seeded under. Renaming it here would
   silently point the app at an empty, unseeded document. If you want the
   collection name itself to say "swechha", migrate the document in the
   Firebase console (copy swecha/site -> swechha/site) and then update
   CONTENT_DOC_PATH below to match.
*/

export interface SwechhaContent {
  logline: string;
  synopsis: string;
  episodes: Episode[];
  characters: CharacterEntry[];
  moodBoard: MoodImage[];
  technicalities: TechItem[];
  directorsNotesText: string;
  directorsNotesImages: MoodImage[];
  articles: Article[];
  aboutMe: { photo: string; bio: string; links: AboutLink[] };
}

const CONTENT_DOC_PATH = ['swecha', 'site'] as const;

@Injectable({ providedIn: 'root' })
export class ContentService {
  private app: FirebaseApp;
  private db: Firestore;
  private storage: FirebaseStorage;

  /** Latest content from Firestore. null until the first snapshot arrives. */
  readonly content = signal<SwechhaContent | null>(null);
  /** True once we've heard back from Firestore at least once (or failed). */
  readonly ready = signal(false);
  /** Set if the realtime connection errors out (e.g. bad config, offline). */
  readonly error = signal<string | null>(null);

  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.db = getFirestore(this.app);
    this.storage = getStorage(this.app);

    const docRef = doc(this.db, ...CONTENT_DOC_PATH);
    onSnapshot(
      docRef,
      snap => {
        if (snap.exists()) {
          this.content.set(snap.data() as SwechhaContent);
        }
        this.ready.set(true);
      },
      err => {
        console.error('ContentService: snapshot listener failed', err);
        this.error.set(err.message);
        this.ready.set(true);
      }
    );
  }

  /** Merge-writes a partial content update. Every viewer's listener fires afterward. */
  async save(partial: Partial<SwechhaContent>): Promise<void> {
    const docRef = doc(this.db, ...CONTENT_DOC_PATH);
    await setDoc(docRef, partial, { merge: true });
  }

  /** Seeds Firestore with the given full content, but only if the doc doesn't exist yet. */
  async seedIfEmpty(initial: SwechhaContent): Promise<void> {
    if (this.content()) return; // already has data
    const docRef = doc(this.db, ...CONTENT_DOC_PATH);
    await setDoc(docRef, initial, { merge: true });
  }

  /**
   * Uploads an image file to Firebase Storage and returns its public download URL.
   * Replaces the old base64-data-URL approach, which would blow past Firestore's
   * 1MB-per-document limit after a couple of photo uploads.
   */
  async uploadImage(file: File, pathHint: string): Promise<string> {
    const safeName = `${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
    const storageRef = ref(this.storage, `swechha-uploads/${pathHint}/${safeName}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }
}