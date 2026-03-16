"use client";

import { useRouter } from "next/navigation";
import { useCallback, forwardRef, useRef } from "react";

const CAPTURE_URL = "echo-desktop://capture";
const REDIRECT_DELAY_MS = 2000;

/**
 * Link that opens Echo Desktop capture (echo-desktop://capture).
 * If the app does not open (page stays visible after delay), redirect to /dashboard/workflows
 * so users who have the app but whose browser doesn't report visibility hidden aren't sent to get-started.
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
          router.push("/dashboard/workflows");
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
