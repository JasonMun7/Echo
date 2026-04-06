import { create } from "zustand";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithCredential,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<unknown>;
  signUp: (email: string, password: string) => Promise<unknown>;
  signInWithGoogle: (idToken: string) => Promise<unknown>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  signIn: (email, password) =>
    auth
      ? signInWithEmailAndPassword(auth, email, password)
      : Promise.reject(new Error("Firebase not configured")),

  signUp: (email, password) =>
    auth
      ? createUserWithEmailAndPassword(auth, email, password)
      : Promise.reject(new Error("Firebase not configured")),

  /**
   * Google Sign-In on mobile: receive the Google ID token from
   * @react-native-google-signin, then pass it to Firebase.
   */
  signInWithGoogle: (idToken: string) => {
    if (!auth) return Promise.reject(new Error("Firebase not configured"));
    const credential = GoogleAuthProvider.credential(idToken);
    return signInWithCredential(auth, credential);
  },

  signOut: () => (auth ? signOut(auth) : Promise.resolve()),

  getIdToken: async () => {
    const user = get().user ?? auth?.currentUser;
    return user ? user.getIdToken() : null;
  },
}));
