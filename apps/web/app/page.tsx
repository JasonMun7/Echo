import Link from "next/link";

export default function Home() {
  return (
    <div className="echo-gradient-dramatic flex min-h-screen w-full items-center justify-center">
      <main className="flex w-full max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16">
        <div className="flex h-10 w-10 shrink-0 rounded-tl-lg rounded-tr-sm rounded-br-lg rounded-bl-sm bg-[#A577FF]" />
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Welcome to Echo
          </h1>
          <p className="max-w-md text-lg text-white/90">
            Sign in with email or Google to get started.
          </p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            className="echo-btn-primary flex h-12 min-w-[140px] items-center justify-center"
            href="/signin"
          >
            Sign In
          </Link>
          <a
            className="echo-btn-secondary flex h-12 min-w-[140px] items-center justify-center"
            href="https://nextjs.org/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
