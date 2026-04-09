import Link from "next/link";
import { getSEOTags } from "@/lib/seo";

export const metadata = getSEOTags({
  title: "Privacy Policy | Echo",
  description: "Echo Privacy Policy.",
});

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-24">
      <h1 className="font-serif text-3xl font-semibold text-[#150A35]">
        Privacy Policy
      </h1>
      <p className="mt-6 text-sm leading-relaxed text-gray-600">
        Placeholder privacy page. Replace this copy with your legal Privacy Policy before
        production use.
      </p>
      <p className="mt-8">
        <Link
          href="/"
          className="text-sm font-medium text-[#A577FF] underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </p>
    </main>
  );
}
