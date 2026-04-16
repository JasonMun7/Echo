import { dashboardMainBleedClass } from "@/lib/dashboard-shell";

/** Full-bleed — EchoPrism session fills the main column. */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <div className={dashboardMainBleedClass()}>{children}</div>;
}
