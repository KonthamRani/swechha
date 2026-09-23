import { Injectable } from '@angular/core';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  FirebaseStorage,
  UploadTask
} from 'firebase/storage';
import { getFirebaseApp } from './firebase-app';

/**
 * Every image in the app lives under one of these folders. Keeping the
 * folder-per-section structure means Firebase Storage's file browser stays
 * readable as the number of images grows, instead of one flat bucket of
 * hundreds of randomly-named files.
 *
 *   swechha/
 *     logo/
 *     episodic-synopsis/episode-{id}/
 *     characters/character-{id}/
 *     mood-board/image-{id}/
 *     technicalities/item-{id}/
 *     directors-notes/images/note-{id}/
 *     directors-notes/articles/article-{id}/
 *     about-me/director-photo/
 *     background/overlay/
 */
export const StorageFolders = {
  logo: () => `swechha/logo`,
  episode: (id: number | string) => `swechha/episodic-synopsis/episode-${pad(id)}`,
  character: (id: number | string) => `swechha/characters/character-${pad(id)}`,
  moodBoard: (id: number | string) => `swechha/mood-board/image-${pad(id)}`,
  technicality: (id: number | string) => `swechha/technicalities/item-${pad(id)}`,
  directorsNoteImage: (id: number | string) => `swechha/directors-notes/images/note-${pad(id)}`,
  directorsArticle: (id: number | string) => `swechha/directors-notes/articles/article-${pad(id)}`,
  aboutMe: () => `swechha/about-me/director-photo`,
  background: () => `swechha/background/overlay`
};

function pad(id: number | string): string {
  const n = typeof id === 'number' ? id : parseInt(id, 10);
  return Number.isFinite(n) ? String(n).padStart(3, '0') : String(id);
}

export interface UploadResult {
  /** Public download URL — what gets displayed in <img src>. */
  url: string;
  /** Full Storage path — kept alongside the URL so we can clean the file up later. */
  path: string;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private storage: FirebaseStorage = getStorage(getFirebaseApp());

  /**
   * Uploads a file into `folder` with a predictable name (not the browser's
   * original IMG_1234.jpg), reports 0–100 progress via `onProgress`, and
   * resolves with both the download URL and the Storage path.
   */
  uploadImage(file: File, folder: string, baseName: string, onProgress?: (pct: number) => void): Promise<UploadResult> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${folder}/${baseName}-${Date.now()}.${ext}`;
    const storageRef = ref(this.storage, path);

    return new Promise((resolve, reject) => {
      const task: UploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type || undefined,
        customMetadata: { originalName: file.name }
      });

      task.on(
        'state_changed',
        snap => {
          const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
          onProgress?.(pct);
        },
        err => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            onProgress?.(100);
            resolve({ url, path });
          } catch (err) {
            reject(err);
          }
        }
      );
    });
  }

  /** Best-effort delete — swallows "not found" so a missing/legacy file never blocks a save. */
  async deleteImage(path: string | undefined | null): Promise<void> {
    if (!path) return;
    try {
      await deleteObject(ref(this.storage, path));
    } catch (err: any) {
      if (err?.code !== 'storage/object-not-found') {
        console.warn('StorageService: could not delete', path, err);
      }
    }
  }
}