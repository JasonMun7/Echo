"use client";

import React from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export const Badge = ({
  href = "#",
  children,
  text,
  className,
}: {
  href?: string;
  children?: React.ReactNode;
  text?: string;
  className?: string;
}) => (
  <motion.div whileHover={{ x: 2 }} transition={{ duration: 0.2 }}>
    <Link
      href={href!}
      className={cn(
        "flex w-fit items-center gap-2 rounded-full border border-[#21C4DD]/30 bg-white px-3 py-1.5 text-xs font-medium text-[#150A35] shadow-sm transition-colors hover:border-[#21C4DD]/50 hover:bg-[#21C4DD]/5",
        className
      )}
    >
      {text ?? children}
      <IconArrowRight className="size-4 text-[#21C4DD]" />
    </Link>
  </motion.div>
);
