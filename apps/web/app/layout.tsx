import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Echo",
  description: "Echo app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light h-full" suppressHydrationWarning>
      <body className={`${inter.className} h-full min-h-screen`}>
        <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <linearGradient id="echoIconGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#21C4DD" />
              <stop offset="100%" stopColor="#A577FF" />
            </linearGradient>
          </defs>
        </svg>
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
