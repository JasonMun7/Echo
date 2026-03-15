"use client";
import { cn } from "@/lib/utils";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMenu2, IconX } from "@tabler/icons-react";
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
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

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
  const [openState, setOpenState] = useState(true);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
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
  collapsible: _collapsible,
  ...props
}: Omit<React.ComponentProps<typeof motion.div>, "children"> & {
  children?: React.ReactNode;
  collapsible?: "offcanvas" | "icon" | "none";
}) => {
  return (
    <>
      <DesktopSidebar className={className}>
        {children}
      </DesktopSidebar>
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
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
      onClick={() => setOpen(!open)}
      className={cn("flex size-9 items-center justify-center rounded-md text-[#150A35] hover:bg-[#A577FF]/10 transition-colors", className)}
      {...props}
    >
      {open ? (
        <IconLayoutSidebarLeftCollapse className="size-5" />
      ) : (
        <IconLayoutSidebarLeftExpand className="size-5" />
      )}
    </button>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  const { className, children } = props;
  return (
    <>
      <DesktopSidebar className={className}>
        {children as React.ReactNode}
      </DesktopSidebar>
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

/* Primitives for app-sidebar / nav-* */
export const SidebarHeader = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-2 p-2", className)} {...props} />
);
export const SidebarContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-1 flex-col gap-2 overflow-auto p-2", className)} {...props} />
);
export const SidebarFooter = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-2 p-2 mt-auto", className)} {...props} />
);
export const SidebarGroup = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-2", className)} {...props} />
);
export const SidebarGroupContent = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-1", className)} {...props} />
);
export const SidebarGroupLabel = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("px-2 py-1.5 text-xs font-semibold text-white/70 uppercase tracking-wider", className)} {...props} />
);
export const SidebarMenu = ({ className, ...props }: React.ComponentProps<"ul">) => (
  <ul className={cn("flex flex-col gap-1 list-none p-0 m-0", className)} {...props} />
);
export const SidebarMenuItem = ({ className, ...props }: React.ComponentProps<"li">) => (
  <li className={cn("list-none", className)} {...props} />
);
export const SidebarMenuButton = ({
  className,
  asChild,
  tooltip,
  size = "default",
  children: ch,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean; tooltip?: string; size?: "default" | "sm" | "lg" }) => {
  const slotClass = cn(
    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/90 hover:bg-white/10 hover:text-white transition-colors",
    size === "sm" && "py-1 text-xs",
    size === "lg" && "py-2 text-base",
    className
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
export const SidebarMenuAction = ({ className, showOnHover, ...props }: React.ComponentProps<"button"> & { showOnHover?: boolean }) => (
  <button type="button" className={cn("flex size-7 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white transition-colors", className)} {...props} />
);

const SIDEBAR_WIDTH = 300;

export const DesktopSidebar = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  const { open } = useSidebar();
  return (
    <motion.div
      className={cn(
        "h-full hidden md:flex md:flex-col shrink-0 overflow-hidden",
        className
      )}
      initial={false}
      animate={{
        width: open ? SIDEBAR_WIDTH : 0,
        opacity: open ? 1 : 0,
      }}
      transition={{ type: "tween", duration: 0.2 }}
    >
      <div
        className={cn(
          "echo-sidebar-inset h-full min-w-[300px] px-4 py-4 flex flex-col overflow-y-auto"
        )}
      >
        {children}
      </div>
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      <div
        className={cn(
          "h-10 px-4 py-4 flex flex-row md:hidden  items-center justify-between bg-neutral-100 dark:bg-neutral-800 w-full"
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <IconMenu2
            className="text-[#150A35]"
            onClick={() => setOpen(!open)}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-white p-10 z-[100] flex flex-col justify-between",
                className
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
  const { open, animate } = useSidebar();
  return (
    <NextLink
      href={link.href}
      className={cn(
        "flex cursor-pointer items-center justify-start gap-2 group/sidebar rounded-lg py-2 px-2.5 transition-colors",
        active && "bg-[#A577FF] text-white",
        !active && "text-white/80 hover:bg-white/10 hover:text-white",
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-sm group-hover/sidebar:translate-x-0.5 transition duration-150 whitespace-pre inline-block !p-0 !m-0 [&.inherit]:inherit"
      >
        {link.label}
      </motion.span>
    </NextLink>
  );
};
