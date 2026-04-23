import { dashboardMainBleedClass } from "@/lib/dashboard-shell";

/** Flex host for the editor — stays inside dashboard padding (no negative margin breakout). */
export default function WorkflowEditLayout({ children }: { children: React.ReactNode }) {
  return <div className={dashboardMainBleedClass("pt-1 sm:pt-2")}>{children}</div>;
}
