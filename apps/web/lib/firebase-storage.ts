"use client";

import { getStorage, type FirebaseStorage } from "firebase/storage";

import { app } from "@/lib/firebase";

let storage: FirebaseStorage | null = null;

export function getFirebaseStorage(): FirebaseStorage | null {
  if (!app) return null;
  if (!storage) {
    storage = getStorage(app);
  }
  return storage;
}
