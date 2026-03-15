"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const SplashCursor = dynamic(
  () => import("@/components/SplashCursor.jsx").then((m) => m.default),
  { ssr: false }
);

/** Design system: Cetacean Blue #150A35, Lavender #A577FF, Cyan #21C4DD */
const BACK_COLOR = { r: 21 / 255, g: 10 / 255, b: 53 / 255 };
const PALETTE = [
  [165, 119, 255], // Lavender (primary)
  [33, 196, 221],  // Cyan (secondary)
];

export function SplashCursorProvider() {
  const pathname = usePathname();
  if (pathname === "/datasets/create") return null;

  return (
    <SplashCursor
      TRANSPARENT={true}
      BACK_COLOR={BACK_COLOR}
      palette={PALETTE as unknown as null}
      SPLAT_RADIUS={0.08}
      SPLAT_FORCE={2200}
      CURL={1.5}
      DENSITY_DISSIPATION={3.5}
      VELOCITY_DISSIPATION={2}
      COLOR_UPDATE_SPEED={10}
    />
  );
}
