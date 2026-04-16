import { dashboardMainBleedClass } from "@/lib/dashboard-shell";

/** Full-bleed main column — canvas uses full width below the header. */
export default function WorkflowEditLayout({ children }: { children: React.ReactNode }) {
  /** Small top inset offsets main-column bleed so the editor title row is not clipped. */
  return <div className={dashboardMainBleedClass("pt-1 sm:pt-2")}>{children}</div>;
}
