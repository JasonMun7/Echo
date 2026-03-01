"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { LoaderFive } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
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
  "auth/email-already-in-use": "An account with this email already exists. Try signing in instead.",
  "auth/wrong-password": "Incorrect password. Check your password or reset it below.",
  "auth/user-not-found": "No account found with this email. Sign up to get started.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/too-many-requests": "Too many failed attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "Network error. Check your connection and try again.",
  "auth/popup-closed-by-user": "Sign-in was cancelled. Please try again.",
  "auth/invalid-credential": "Incorrect email or password.",
};

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = searchParams.get("desktop") === "1";

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        router.replace(isDesktop ? "/auth/desktop-success" : "/dashboard");
      }
    });
    return () => unsubscribe();
  }, [router, isDesktop]);

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!auth) {
      setError(
        "Firebase is not configured. Please set up your .env.local file.",
      );
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const authError = err as AuthError;
      const friendly = AUTH_ERROR_MESSAGES[authError.code] || authError.message || "Failed to sign in";
      setError(friendly);
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
      setError(AUTH_ERROR_MESSAGES[authError.code] || authError.message || "Failed to send reset email");
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!auth) {
      setError(
        "Firebase is not configured. Please set up your .env.local file.",
      );
      return;
    }
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      const authError = err as AuthError;
      setError(AUTH_ERROR_MESSAGES[authError.code] || authError.message || "Failed to sign in with Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm md:p-8">
      <h2 className="text-xl font-bold text-[#150A35]">Welcome to Echo</h2>
      <p className="mt-2 max-w-sm text-sm text-[#150A35]/80">
        Sign in with your email or Google to continue
      </p>

      <form className="my-8" onSubmit={handleEmailSubmit}>
        <LabelInputContainer className="mb-4">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </LabelInputContainer>
        <LabelInputContainer className="mb-4">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            placeholder="••••••••"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
        </LabelInputContainer>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}
        {successMessage && (
          <p className="mb-4 text-sm text-emerald-600 rounded-lg bg-emerald-50 px-3 py-2 border border-emerald-200">
            {successMessage}
          </p>
        )}

        <button
          className="echo-btn-primary block h-10 w-full disabled:opacity-50"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? (
            isSignUp ? (
              <LoaderFive text="Creating account..." />
            ) : (
              <LoaderFive text="Signing in..." />
            )
          ) : isSignUp ? (
            "Sign up"
          ) : (
            "Sign in"
          )}
        </button>
        <div className="mt-4 flex items-center justify-between text-sm text-[#150A35]/80">
          <span>
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-[#A577FF] hover:underline"
                  onClick={() => setIsSignUp(false)}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="font-medium text-[#A577FF] hover:underline"
                  onClick={() => setIsSignUp(true)}
                >
                  Sign up
                </button>
              </>
            )}
          </span>
          {!isSignUp && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetLoading}
              className="text-[#A577FF]/70 hover:text-[#A577FF] hover:underline text-xs"
            >
              {resetLoading ? "Sending..." : "Forgot password?"}
            </button>
          )}
        </div>

        <div className="my-8 h-px w-full bg-[#A577FF]/20" />

        <div className="flex flex-col space-y-4">
          <button
            className="echo-btn-secondary flex h-10 w-full items-center justify-center gap-2 disabled:opacity-50"
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
          >
            <IconBrandGoogle className="h-5 w-5 text-[#150A35]" />
            <span className="text-sm">
              {isGoogleLoading ? (
                <LoaderFive text="Signing in..." />
              ) : (
                "Continue with Google"
              )}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

const LabelInputContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn("flex w-full flex-col space-y-2", className)}>
      {children}
    </div>
  );
};
