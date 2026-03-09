import React from "react";
import { cn } from "@/lib/utils";

type SubheadingTag = "p" | "span" | "div" | "h2";

export const SubHeading = ({
  children,
  className,
  as: Tag = "p",
}: {
  children: React.ReactNode;
  className?: string;
  as?: SubheadingTag;
}) => (
  <Tag
    className={cn(
      "text-sm text-gray-600 md:text-base lg:text-lg",
      className
    )}
  >
    {children}
  </Tag>
);
