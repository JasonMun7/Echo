import { cn } from "@/lib/utils";

/** Active route for dashboard sidebar links (exact `/dashboard` vs prefix for nested routes). */
export function isDashboardNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Main app sidebar rows — matches profile modal semantics, compact type. */
export function sidebarDashboardNavLinkClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors duration-150",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
  );
}

/** Profile modal rail — slightly larger type. */
export function sidebarModalNavLinkClass(active: boolean) {
  return cn(
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-none"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
  );
}

export function sidebarNavIconClass(active: boolean) {
  return cn(
    "size-[18px] shrink-0 transition-colors",
    active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/55",
  );
}

export function sidebarNavLabelClass(active: boolean) {
  return active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/85";
}
