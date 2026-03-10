"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useMotionTemplate, useMotionValue, motion } from "motion/react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** "echo" = Lavender→Cyan gradient hover; "plain" = no gradient */
  variant?: "default" | "echo" | "plain";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = "default", ...props }, ref) => {
    const radius = variant === "echo" ? 50 : variant === "plain" ? 0 : 100;
    const [visible, setVisible] = React.useState(false);

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const gradientColors =
      variant === "echo"
        ? "#A577FF 0%, #21C4DD 50%, transparent 80%"
        : variant === "plain"
          ? "transparent"
          : "#3b82f6 0%, transparent 80%";

    const gradientSize =
      variant === "echo"
        ? visible
          ? "55px 22px ellipse"
          : "0px 0px ellipse"
        : variant === "plain"
          ? "0px circle"
          : visible
            ? radius + "px circle"
            : "0px circle";

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    }
    return (
      <motion.div
        style={{
          background: useMotionTemplate`
        radial-gradient(
          ${gradientSize} at ${mouseX}px ${mouseY}px,
          ${gradientColors}
        )
      `,
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="group/input rounded-lg p-[2px] transition duration-300"
      >
        <input
          type={type}
          className={cn(
            `shadow-input dark:placeholder-text-neutral-600 flex h-10 w-full rounded-md border-none bg-gray-50 px-3 py-2 text-sm text-black transition duration-400 group-hover/input:shadow-none file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-800 dark:text-white dark:shadow-[0px_0px_1px_1px_#404040] dark:focus-visible:ring-neutral-600`,
            className,
          )}
          ref={ref}
          {...props}
        />
      </motion.div>
    );
  },
);
Input.displayName = "Input";

export { Input };
