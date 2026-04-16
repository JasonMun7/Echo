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
    "echo-sidebar-nav-item flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-hidden",
    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
  );
}

/** Profile modal rail — slightly larger type. */
export function sidebarModalNavLinkClass(active: boolean) {
  return cn(
    "echo-sidebar-nav-item flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm outline-hidden",
    active
      ? "bg-muted font-medium text-foreground shadow-none"
      : "text-muted-foreground hover:text-foreground",
  );
}

export function sidebarNavIconClass(active: boolean) {
  return cn(
    "size-[18px] shrink-0 transition-colors",
    active ? "text-foreground" : "text-muted-foreground",
  );
}

export function sidebarNavLabelClass(active: boolean) {
  return active ? "text-foreground" : "text-muted-foreground";
}
