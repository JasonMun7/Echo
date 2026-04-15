import { dashboardMainBleedClass } from "@/lib/dashboard-shell";

/** Full-bleed main column — canvas uses full width below the header. */
export default function WorkflowEditLayout({ children }: { children: React.ReactNode }) {
  return <div className={dashboardMainBleedClass()}>{children}</div>;
}
