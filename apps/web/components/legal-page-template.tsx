import Link from "next/link";
import type { ReactNode } from "react";

type LegalPageTemplateProps = {
  title: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
};

export function LegalPageTemplate({
  title,
  children,
  backHref = "/",
  backLabel = "Back to home",
}: LegalPageTemplateProps) {
  return (
    <main className="mx-auto max-w-3xl px-8 py-24">
      <h1 className="font-serif text-3xl font-semibold text-[#150A35]">{title}</h1>
      <div className="mt-6 text-sm leading-relaxed text-gray-600">{children}</div>
      <p className="mt-8">
        <Link
          href={backHref}
          className="text-sm font-medium text-[#A577FF] underline-offset-4 hover:underline"
        >
          {backLabel}
        </Link>
      </p>
    </main>
  );
}
