"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { IconBrandGoogle } from "@tabler/icons-react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  type AuthError,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        router.replace("/dashboard");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!auth) {
      setError("Firebase is not configured. Please set up your .env.local file.");
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
      setError(authError.message ?? "Failed to sign in");
    } finally {
      setIsLoading(false);
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
      setError(authError.message ?? "Failed to sign in with Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="echo-card mx-auto w-full max-w-md p-6 shadow-sm md:p-8">
      <h2 className="text-xl font-bold text-[#150A35]">
        Welcome to Echo
      </h2>
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

        {error && (
          <p className="mb-4 text-sm text-red-500">{error}</p>
        )}

        <button
          className="echo-btn-primary block h-10 w-full disabled:opacity-50"
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? (isSignUp ? "Creating account..." : "Signing in...") : isSignUp ? "Sign up" : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-[#150A35]/80">
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
        </p>

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
              {isGoogleLoading ? "Signing in..." : "Continue with Google"}
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
