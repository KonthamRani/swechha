import { Injectable, signal } from '@angular/core';
import { getFirestore, doc, onSnapshot, setDoc, Firestore } from 'firebase/firestore';
// import { getFirebaseApp } from './firebase-app';

import type {
  Episode,
  CharacterEntry,
  MoodImage,
  TechItem,
  Article,
  AboutLink,
  ImageRef
} from './app';
import { getFirebaseApp } from './firebase-app';

/* =========================================================
   FIREBASE PROJECT CONFIG lives in firebase-app.ts now, shared
   with StorageService, so init order between the two services
   never matters.
   ========================================================= */

/* Firestore rules (Firebase console > Firestore > Rules):

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /swechha/site {
         allow read: if true;
         allow write: if true; // tighten once real auth is added — see SETUP.md
       }
     }
   }

   Storage rules (Firebase console > Storage > Rules):

   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /swechha/{allPaths=**} {
         allow read: if true;
         allow write: if true;
       }
     }
   }
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
  /** Large blurred backdrop image behind the whole site. Admin-editable, same as any other image. */
  backgroundImage?: ImageRef;
  loadingSeconds?: number;
}

const CONTENT_DOC_PATH = ['swechha', 'site'] as const;

@Injectable({ providedIn: 'root' })
export class ContentService {
  private db: Firestore;

  readonly content = signal<SwechhaContent | null>(null);
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.db = getFirestore(getFirebaseApp());

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

  async save(partial: Partial<SwechhaContent>): Promise<void> {
    const docRef = doc(this.db, ...CONTENT_DOC_PATH);
    await setDoc(docRef, partial, { merge: true });
  }

  async seedIfEmpty(initial: SwechhaContent): Promise<void> {
    if (this.content()) return;
    const docRef = doc(this.db, ...CONTENT_DOC_PATH);
    await setDoc(docRef, initial, { merge: true });
  }
}