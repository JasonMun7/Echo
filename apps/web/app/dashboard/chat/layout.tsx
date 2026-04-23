import { dashboardMainBleedClass } from "@/lib/dashboard-shell";

/** Flex host for chat — fills the padded main column (no negative margin breakout). */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <div className={dashboardMainBleedClass()}>{children}</div>;
}
