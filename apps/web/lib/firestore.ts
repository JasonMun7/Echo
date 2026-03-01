import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: string;
  createdAt: ReturnType<typeof serverTimestamp>;
  updatedAt: ReturnType<typeof serverTimestamp>;
}

export async function createOrUpdateUser(user: User): Promise<void> {
  if (!db) return;
  const provider = user.providerData[0]?.providerId ?? "password";
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);

  const baseDoc = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    provider,
    updatedAt: serverTimestamp(),
  };

  const docData = {
    ...baseDoc,
    ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
  };
  await setDoc(userRef, docData, { merge: true });
}
