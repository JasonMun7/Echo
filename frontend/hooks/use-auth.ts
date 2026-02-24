"use client";

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(auth?.currentUser ?? null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return {
    user,
    loading,
    signIn: signInWithEmailAndPassword.bind(null, auth!),
    signUp: createUserWithEmailAndPassword.bind(null, auth!),
    signInWithGoogle: () =>
      signInWithPopup(auth!, new GoogleAuthProvider()),
    signOut: () => (auth ? signOut(auth) : Promise.resolve()),
  };
}
