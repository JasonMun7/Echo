"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LoaderFive } from "@/components/ui/loader";
import { IconBrandGoogle } from "@tabler/icons-react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  type AuthError,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use":
    "An account with this email already exists. Try signing in instead.",
  "auth/wrong-password":
    "Incorrect password. Check your password or reset it below.",
  "auth/user-not-found": "No account found with this email. Sign up to get started.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/too-many-requests":
    "Too many failed attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/popup-closed-by-user": "Sign-in was cancelled. Please try again.",
  "auth/invalid-credential": "Incorrect email or password.",
};

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = searchParams.get("desktop") === "1";

  useEffect(() => {
    if (!auth) return;
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) router.replace(isDesktop ? "/auth/desktop-success" : "/dashboard");
    });
    return () => unsub();
  }, [router, isDesktop]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!auth) {
      setError("Firebase is not configured. Please set up your .env.local file.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      if (mode === "sign-up") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const authError = err as AuthError;
      setError(
        AUTH_ERROR_MESSAGES[authError.code] || authError.message || "Failed to sign in"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!auth || !email) {
      setError("Please enter your email address first.");
      return;
    }
    setResetLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage(`Password reset email sent to ${email}. Check your inbox.`);
    } catch (err) {
      const authError = err as AuthError;
      setError(
        AUTH_ERROR_MESSAGES[authError.code] ||
          authError.message ||
          "Failed to send reset email"
      );
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setError("Firebase is not configured. Please set up your .env.local file.");
      return;
    }
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      const authError = err as AuthError;
      setError(
        AUTH_ERROR_MESSAGES[authError.code] ||
          authError.message ||
          "Failed to sign in with Google"
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <form className="mt-6 flex flex-col gap-6" onSubmit={handleSubmit}>
      {mode === "sign-up" && (
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            variant="plain"
            className="mt-2"
          />
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          variant="plain"
          className="mt-2"
        />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          variant="plain"
          className="mt-2"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {successMessage && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
          {successMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={isLoading}
        className="echo-btn-primary h-10 w-full"
      >
        {isLoading ? (
          <LoaderFive
            text={
              mode === "sign-up"
                ? "Creating account..."
                : "Signing in..."
            }
          />
        ) : mode === "sign-up" ? (
          "Sign up"
        ) : (
          "Sign in"
        )}
      </Button>

      {mode === "sign-in" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={resetLoading}
            className="text-xs font-medium text-[#A577FF] hover:underline disabled:opacity-50"
          >
            {resetLoading ? "Sending..." : "Forgot password?"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="h-px flex-1 bg-[#A577FF]/20" />
        <span className="text-sm text-gray-500">or</span>
        <div className="h-px flex-1 bg-[#A577FF]/20" />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading}
        className="echo-btn-secondary flex h-10 w-full justify-center gap-2"
      >
        <IconBrandGoogle className="size-5 text-[#150A35]" />
        {isGoogleLoading ? (
          <LoaderFive text="Signing in..." />
        ) : (
          "Continue with Google"
        )}
      </Button>

      <p className="text-center text-sm text-gray-600">
        {mode === "sign-in" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className="font-medium text-[#A577FF] hover:underline">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="font-medium text-[#A577FF] hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
