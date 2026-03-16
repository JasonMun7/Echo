import Link from "next/link";
import { Logo } from "./logo";

const pages = [
  { title: "Product", href: "/#product" },
  { title: "How it works", href: "/#product" },
  { title: "Use cases", href: "/#product" },
  { title: "Early access", href: "/sign-up" },
];

const socials = [
  { title: "GitHub", href: "https://github.com/Dbzman/echo" },
];

const legals = [
  { title: "Privacy Policy", href: "/privacy" },
  { title: "Terms of Service", href: "/terms" },
];

const signups = [
  { title: "Get started", href: "/sign-up" },
  { title: "Sign in", href: "/sign-in" },
];

export function Footer() {
  return (
    <div className="relative w-full overflow-hidden border-t border-[#A577FF]/10 bg-white px-8 pt-20">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between text-sm text-gray-600 sm:flex-row md:px-8">
        <div>
          <span className="relative z-20 inline-block px-2 py-1">
            <Logo size="sm" />
          </span>
          <div className="mt-4 flex items-center gap-4">
            {socials.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 transition-colors hover:text-[#150A35]"
                aria-label={s.title}
              >
                {s.title}
              </Link>
            ))}
          </div>
          <div className="mt-4 text-gray-500">
            &copy; {new Date().getFullYear()} Echo. All rights reserved.
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 items-start gap-10 sm:mt-0 md:mt-0 lg:grid-cols-4">
          <div className="flex flex-col gap-4">
            <p className="font-bold text-[#150A35]">Pages</p>
            <ul className="flex list-none flex-col gap-4">
              {pages.map((p) => (
                <li key={p.title}>
                  <Link
                    href={p.href}
                    className="text-gray-600 transition-colors hover:text-[#150A35]"
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <p className="font-bold text-[#150A35]">Socials</p>
            <ul className="flex list-none flex-col gap-4">
              {socials.map((s) => (
                <li key={s.title}>
                  <Link
                    href={s.href}
                    className="text-gray-600 transition-colors hover:text-[#150A35]"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <p className="font-bold text-[#150A35]">Legal</p>
            <ul className="flex list-none flex-col gap-4">
              {legals.map((l) => (
                <li key={l.title}>
                  <Link
                    href={l.href}
                    className="text-gray-600 transition-colors hover:text-[#150A35]"
                  >
                    {l.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4">
            <p className="font-bold text-[#150A35]">Account</p>
            <ul className="flex list-none flex-col gap-4">
              {signups.map((a) => (
                <li key={a.title}>
                  <Link
                    href={a.href}
                    className="text-gray-600 transition-colors hover:text-[#150A35]"
                  >
                    {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p
        className="absolute inset-x-0 top-0 w-full pt-4 text-center text-6xl font-bold leading-none text-transparent"
        style={{
          fontSize: "clamp(3rem, 18vw, 20rem)",
          letterSpacing: "-0.02em",
          WebkitTextStroke: "1px rgba(165, 119, 255, 0.15)",
        }}
      >
        Echo
      </p>
    </div>
  );
}
