import { cn } from "@/lib/utils";
import React from "react";

type ContainerProps<T extends React.ElementType = "div"> = {
  children: React.ReactNode;
  className?: string;
  as?: T;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children">;

export function Container<T extends React.ElementType = "div">({
  children,
  className,
  as,
  ...props
}: ContainerProps<T>) {
  const Component = (as || "div") as React.ElementType;
  return (
    <Component
      className={cn("mx-auto max-w-7xl px-4 md:px-8", className)}
      {...(props as Record<string, unknown>)}
    >
      {children}
    </Component>
  );
}
