"use client";

import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function ButtonGroup({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "inline-flex items-center",
        orientation === "horizontal" ? "flex-row gap-1" : "flex-col",
        orientation === "vertical" && "gap-1",
        className
      )}
      {...props}
    />
  );
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator> & {
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <Separator
      orientation={orientation}
      decorative
      className={cn(
        "shrink-0",
        orientation === "vertical" && "h-6 w-px",
        orientation === "horizontal" && "h-px w-6",
        className
      )}
      {...props}
    />
  );
}

function ButtonGroupText({
  className,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: cn("text-sm text-muted-foreground px-2", (children as React.ReactElement).props?.className),
    });
  }
  return (
    <span data-slot="button-group-text" className={cn("text-sm text-muted-foreground px-2", className)} {...props}>
      {children}
    </span>
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText };
