import React from "react";
import { cn } from "@/lib/utils";

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export const Heading = ({
  as: Tag = "h1",
  children,
  className,
  ...props
}: {
  as?: HeadingTag;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLHeadingElement>) => (
  <Tag
    className={cn(
      "tracking-tight text-balance text-[#150A35] md:text-4xl lg:text-5xl",
      "text-2xl md:text-4xl",
      className
    )}
    {...props}
  >
    {children}
  </Tag>
);
