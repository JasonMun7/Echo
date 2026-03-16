"use client";

import { useRouter } from "next/navigation";
import { useCallback, forwardRef, useRef } from "react";

const CAPTURE_URL = "echo-desktop://capture";
const REDIRECT_DELAY_MS = 2000;

/**
 * Link that opens Echo Desktop capture (echo-desktop://capture).
 * Only redirects to /get-started if the app does not open (page stays visible);
 * if the user has the app, it steals focus and we skip the redirect.
 */
export const DesktopCaptureLink = forwardRef<
  HTMLAnchorElement,
  React.PropsWithChildren<React.AnchorHTMLAttributes<HTMLAnchorElement>>
>(function DesktopCaptureLink({ children, className, ...props }, ref) {
  const router = useRouter();
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
      window.location.href = CAPTURE_URL;
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") {
          if (redirectTimeoutRef.current) {
            clearTimeout(redirectTimeoutRef.current);
            redirectTimeoutRef.current = null;
          }
          document.removeEventListener("visibilitychange", onVisibilityChange);
        }
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      redirectTimeoutRef.current = setTimeout(() => {
        redirectTimeoutRef.current = null;
        document.removeEventListener("visibilitychange", onVisibilityChange);
        if (document.visibilityState === "visible") {
          router.push("/get-started");
        }
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
