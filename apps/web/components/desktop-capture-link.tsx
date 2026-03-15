"use client";

import { useRouter } from "next/navigation";
import { useCallback, forwardRef } from "react";

const CAPTURE_URL = "echo-desktop://capture";
const REDIRECT_DELAY_MS = 2000;

/**
 * Link that opens Echo Desktop capture (echo-desktop://capture).
 * If the app is not installed, redirects to /get-started after a short delay
 * so the user can download and install the desktop app.
 */
export const DesktopCaptureLink = forwardRef<
  HTMLAnchorElement,
  React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>
>(function DesktopCaptureLink({ children, className, ...props }, ref) {
  const router = useRouter();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      // Try to open the desktop app
      window.location.href = CAPTURE_URL;
      // If app didn't open (no handler), send user to get-started to install
      setTimeout(() => {
        router.push("/get-started");
      }, REDIRECT_DELAY_MS);
    },
    [router]
  );

  return (
    <a
      ref={ref}
      href={CAPTURE_URL}
      onClick={handleClick}
      className={className}
      {...props}
    >
      {children}
    </a>
  );
});
