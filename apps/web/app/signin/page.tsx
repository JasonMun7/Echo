import { Suspense } from "react";
import SignInForm from "@/components/sign-in-form";
import { LoaderFive } from "@/components/ui/loader";

export default function SignInPage() {
  return (
    <div className="flex h-screen w-full min-h-screen items-center justify-center bg-[#F5F7FC] px-4">
      <Suspense fallback={<LoaderFive text="Loading…" />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
