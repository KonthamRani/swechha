import { Injectable, signal } from '@angular/core';
import {
  getFirestore,
  doc,
  onSnapshot,
  setDoc,
  Firestore
} from 'firebase/firestore';

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

  aboutMe: {
    photo: string;
    photoPath?: string;
    extraImages?: string[];
    autoScrollSeconds?: number;
    bio: string;
    links: AboutLink[];
  };

  backgroundImage?: ImageRef;
  loadingSeconds?: number;
}

const CONTENT_DOC_PATH = ['swechha', 'site'] as const;

@Injectable({ providedIn: 'root' })
export class ContentService {

  private readonly db: Firestore =
    getFirestore(getFirebaseApp());

  readonly content =
    signal<SwechhaContent | null>(null);

  readonly ready =
    signal(false);

  readonly documentExists =
    signal<boolean | null>(null);

  readonly error =
    signal<string | null>(null);

  constructor() {

    const docRef = doc(
      this.db,
      ...CONTENT_DOC_PATH
    );

    onSnapshot(
      docRef,

      snapshot => {

        this.error.set(null);

        if (snapshot.exists()) {

          this.documentExists.set(true);

          this.content.set(
            snapshot.data() as SwechhaContent
          );

        } else {

          // The request succeeded and Firestore
          // explicitly confirmed the document does not exist.
          //
          // DO NOT automatically write default data here.

          console.warn(
            'ContentService: swechha/site does not exist.'
          );

          this.documentExists.set(false);
          this.content.set(null);
        }

        this.ready.set(true);
      },

      error => {

        /*
         IMPORTANT:
         A network/DNS/permission error does NOT mean
         that the Firestore document is empty.

         Therefore never seed or overwrite data here.
        */

        console.error(
          'ContentService: snapshot listener failed',
          error
        );

        this.error.set(error.message);

        this.documentExists.set(null);

        /*
         ready=true only means the initial attempt finished.

         documentExists=null tells us we DON'T KNOW
         whether Firestore contains the document.
        */
        this.ready.set(true);
      }
    );
  }

  /**
   * Saves ONLY the provided fields.
   *
   * merge:true prevents unrelated top-level
   * fields from being replaced.
   */
  async save(
    partial: Partial<SwechhaContent>
  ): Promise<void> {

    if (
      !partial ||
      Object.keys(partial).length === 0
    ) {
      return;
    }

    const docRef = doc(
      this.db,
      ...CONTENT_DOC_PATH
    );

    try {

      await setDoc(
        docRef,
        partial,
        { merge: true }
      );

    } catch (error) {

      console.error(
        'ContentService: save failed',
        error
      );

      throw error;
    }
  }
}