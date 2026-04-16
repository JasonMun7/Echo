"use client";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import React, { useState, createContext, useContext, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconX,
} from "@tabler/icons-react";
import NextLink from "next/link";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
  /** Desktop (md+): sidebar is collapsed to icon rail only. */
  isRailMode: boolean;
  /** When true, rail stays expanded while pointer leaves (e.g. user menu or notifications drawer open — content is portaled). */
  keepExpanded: boolean;
  setKeepExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  /** Desktop: default collapsed (icon rail); expands on hover. Mobile overlay starts closed via effect below. */
  const [openState, setOpenState] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)", true);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;
  const [keepExpanded, setKeepExpanded] = useState(false);

  const isRailMode = Boolean(isDesktop && !open);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setOpen(false);
    }
  }, [setOpen]);

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        animate: animate,
        isRailMode,
        keepExpanded,
        setKeepExpanded,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

/** Legacy: Provider wrapper. Prefer SidebarProvider + Sidebar (panel) in new layout. */
export const SidebarWithProvider = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

/** Sidebar panel (use inside SidebarProvider). */
export const Sidebar = ({
  children,
  className,
  ...props
}: Omit<React.ComponentProps<typeof motion.div>, "children"> & {
  children?: React.ReactNode;
}) => {
  return (
    <>
      <DesktopSidebar className={className}>{children}</DesktopSidebar>
      <MobileSidebar className={className} {...(props as React.ComponentProps<"div">)}>
        {children}
      </MobileSidebar>
    </>
  );
};

/** Main content area next to the sidebar. */
export const SidebarInset = ({ children, className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-1 flex-col min-w-0 overflow-hidden", className)} {...props}>
    {children}
  </div>
);

/** Button to toggle sidebar (collapse when open, expand when closed). */
export const SidebarTrigger = ({ className, ...props }: React.ComponentProps<"button">) => {
  const { setOpen, open } = useSidebar();
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      onClick={() => setOpen(!open)}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md text-[#150A35]/75 transition-colors hover:bg-[#150A35]/08 hover:text-[#150A35] dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white",
        className,
      )}
      {...props}
    >
      {open ? (
        <IconLayoutSidebarLeftCollapse className="size-[18px]" />
      ) : (
        <IconLayoutSidebarLeftExpand className="size-[18px]" />
      )}
    </button>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  const { className, children } = props;
  return (
    <>
      <DesktopSidebar className={className}>{children as React.ReactNode}</DesktopSidebar>
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

/* Primitives for app-sidebar / nav-* */
export const SidebarHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex min-w-0 flex-col gap-2 overflow-x-hidden p-2", className)} {...props} />
);
export const SidebarContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn(
      "flex min-w-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto p-2",
      className,
    )}
    {...props}
  />
);
export const SidebarFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn("mt-auto flex min-w-0 flex-col gap-2 overflow-x-hidden p-2", className)}
    {...props}
  />
);
export const SidebarGroup = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-2", className)} {...props} />
);
export const SidebarGroupContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-1", className)} {...props} />
);
export const SidebarGroupLabel = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn(
      "px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
      className,
    )}
    {...props}
  />
);
export const SidebarMenu = ({ className, ...props }: React.ComponentProps<"ul">) => (
  <ul className={cn("flex flex-col gap-1 list-none p-0 m-0", className)} {...props} />
);
export const SidebarMenuItem = ({ className, ...props }: React.ComponentProps<"li">) => (
  <li className={cn("group/menu-item list-none", className)} {...props} />
);
export const SidebarMenuButton = ({
  className,
  asChild,
  tooltip,
  size = "default",
  variant = "default",
  children: ch,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  tooltip?: string;
  size?: "default" | "sm" | "lg";
  /** Gradient CTA — no neutral row hover; uses `.echo-btn-primary` + brightness hover. */
  variant?: "default" | "cta";
}) => {
  const slotClass =
    variant === "cta"
      ? cn(
          "echo-btn-primary flex min-w-0 w-full items-center justify-center gap-2 rounded-lg border-0 font-medium !text-white shadow-sm transition-[filter] duration-200 hover:!text-white hover:brightness-110 active:brightness-95",
          size === "sm" && "py-2 text-[11px]",
          size === "lg" && "py-2.5 text-sm",
          className,
        )
      : cn(
          "echo-sidebar-nav-item group/nav-btn flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-xs",
          "text-muted-foreground hover:text-foreground",
          "[&_svg]:shrink-0 [&_svg]:text-muted-foreground [&_svg]:transition-colors",
          "hover:[&_svg]:text-foreground",
          size === "sm" && "py-1 text-[11px]",
          size === "lg" && "py-2 text-sm",
          className,
        );
  if (asChild && ch && React.isValidElement(ch)) {
    const childProps = (ch as React.ReactElement<{ className?: string; title?: string }>).props;
    return React.cloneElement(ch as React.ReactElement<{ className?: string; title?: string }>, {
      className: cn(slotClass, childProps?.className),
      title: tooltip ?? childProps?.title,
    });
  }
  return (
    <button type="button" title={tooltip} className={slotClass} {...props}>
      {ch}
    </button>
  );
};
export const SidebarMenuAction = ({
  className,
  showOnHover,
  ...props
}: React.ComponentProps<"button"> & { showOnHover?: boolean }) => (
  <button
    type="button"
    className={cn(
      "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/90 hover:text-foreground",
      showOnHover &&
        "opacity-0 pointer-events-none transition-opacity group-hover/menu-item:pointer-events-auto group-hover/menu-item:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
      className,
    )}
    {...props}
  />
);

/** Expanded desktop sidebar width (px). */
export const SIDEBAR_WIDTH_EXPANDED = 240;
/** Collapsed icon rail width (px). Outer px-3 + inner p-2 → 40px column for w-10 controls without clipping. */
export const SIDEBAR_WIDTH_COLLAPSED = 80;

/** @deprecated Use SIDEBAR_WIDTH_EXPANDED; kept for layout math defaults. */
export const SIDEBAR_WIDTH = SIDEBAR_WIDTH_EXPANDED;

export const DesktopSidebar = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  const { open, setOpen, keepExpanded } = useSidebar();
  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const expand = useCallback(() => {
    if (!isDesktop) return;
    clearLeaveTimer();
    setOpen(true);
  }, [isDesktop, clearLeaveTimer, setOpen]);

  const scheduleCollapse = useCallback(() => {
    if (!isDesktop) return;
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      leaveTimerRef.current = null;
      setOpen(false);
    }, 100);
  }, [isDesktop, clearLeaveTimer, setOpen]);

  useEffect(() => () => clearLeaveTimer(), [clearLeaveTimer]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/sidebar-rail hidden h-full shrink-0 overflow-hidden md:flex md:flex-col",
        "transform-gpu",
        "[transition-property:width] [transition-duration:220ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
        "motion-reduce:[transition-duration:1ms]",
        className,
      )}
      style={{
        width: open ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED,
      }}
      onMouseEnter={expand}
      onMouseLeave={() => {
        if (keepExpanded) return;
        const el = containerRef.current;
        if (el?.contains(document.activeElement)) return;
        scheduleCollapse();
      }}
      onFocusCapture={expand}
      onBlurCapture={(e) => {
        if (keepExpanded) return;
        const to = e.relatedTarget;
        if (to instanceof Node && containerRef.current?.contains(to)) return;
        scheduleCollapse();
      }}
    >
      <div
        className={cn(
          "echo-sidebar-inset h-full w-full min-w-0 flex flex-col overflow-y-auto overflow-x-hidden [contain:layout]",
          "px-3 py-3",
        )}
      >
        {children}
      </div>
    </div>
  );
};

export const MobileSidebar = ({ className, children, ...props }: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "h-10 px-4 py-4 flex flex-row md:hidden  items-center justify-between bg-neutral-100 dark:bg-neutral-800 w-full",
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <IconMenu2 className="text-[#150A35]" onClick={() => setOpen(!open)} />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.22,
                ease: [0.32, 0.72, 0, 1],
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-white p-10 z-[100] flex flex-col justify-between",
                className,
              )}
            >
              <div
                className="absolute right-10 top-10 z-50 text-neutral-800 dark:text-neutral-200"
                onClick={() => setOpen(!open)}
              >
                <IconX />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export const SidebarLink = ({
  link,
  active,
  className,
  ...props
}: {
  link: Links;
  active?: boolean;
  className?: string;
}) => {
  const { animate, isRailMode } = useSidebar();
  const showLabel = !isRailMode;
  return (
    <NextLink
      href={link.href}
      className={cn(
        "flex cursor-pointer items-center justify-start gap-2 group/sidebar rounded-lg py-2 px-2.5 transition-colors",
        active && "bg-[#150A35]/10 text-[#150A35] dark:bg-[#150A35] dark:text-white",
        !active &&
          "text-[#150A35]/85 hover:bg-[#150A35]/06 hover:text-[#150A35] dark:text-white/80 dark:hover:bg-white/10 dark:hover:text-white",
        className,
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          display: animate && showLabel ? "inline-block" : !animate ? "inline-block" : "none",
          opacity: animate && showLabel ? 1 : !animate ? 1 : 0,
        }}
        className="text-xs group-hover/sidebar:translate-x-0.5 transition duration-150 whitespace-pre inline-block !p-0 !m-0 [&.inherit]:inherit"
      >
        {link.label}
      </motion.span>
    </NextLink>
  );
};
