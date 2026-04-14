"use client";
/**
 * Note: Use position fixed according to your needs
 * Desktop navbar is better positioned at the bottom
 * Mobile navbar is better positioned at bottom right.
 **/

import { cn } from "@/lib/utils";
import { PanelBottom } from "lucide-react";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";

import { useRef, useState } from "react";

export type FloatingDockItem =
  | { title: string; icon: React.ReactNode; href: string; accent?: boolean }
  | { title: string; icon: React.ReactNode; onClick: () => void; accent?: boolean };

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: FloatingDockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
};

const FloatingDockMobile = ({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2 rounded-2xl bg-white/95 p-2 shadow-[0_6px_28px_-4px_rgba(21,10,53,0.14)] backdrop-blur-sm"
          >
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                exit={{
                  opacity: 0,
                  y: 10,
                  transition: {
                    delay: idx * 0.05,
                  },
                }}
                transition={{ delay: (items.length - 1 - idx) * 0.05 }}
              >
                {"href" in item ? (
                  <a
                    href={item.href}
                    key={item.title}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full shadow-sm",
                      item.accent
                        ? "bg-linear-to-br from-[#21C4DD] to-[#A577FF] text-white shadow-md ring-1 ring-white/25 [&_svg]:text-white"
                        : "bg-[#eef0f6] text-[#150A35] [&_svg]:text-[#150A35]",
                    )}
                  >
                    <div className="h-5 w-5">{item.icon}</div>
                  </a>
                ) : (
                  <button
                    type="button"
                    key={item.title}
                    onClick={item.onClick}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full shadow-sm",
                      item.accent
                        ? "bg-linear-to-br from-[#21C4DD] to-[#A577FF] text-white shadow-md ring-1 ring-white/25 [&_svg]:text-white"
                        : "bg-[#eef0f6] text-[#150A35] [&_svg]:text-[#150A35]",
                    )}
                  >
                    <div className="h-5 w-5">{item.icon}</div>
                  </button>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 shadow-[0_6px_28px_-4px_rgba(21,10,53,0.14)] backdrop-blur-sm"
        aria-expanded={open}
        aria-label={open ? "Close dock" : "Open dock"}
      >
        <PanelBottom className="h-5 w-5 text-[#150A35]" aria-hidden />
      </button>
    </div>
  );
};

const FloatingDockDesktop = ({
  items,
  className,
}: {
  items: FloatingDockItem[];
  className?: string;
}) => {
  const mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden h-[4.25rem] items-end gap-3 rounded-2xl bg-white/95 px-3 pb-2.5 pt-1.5 shadow-[0_6px_28px_-4px_rgba(21,10,53,0.14)] backdrop-blur-sm md:flex",
        className,
      )}
    >
      {items.map((item) => (
        <IconContainer
          mouseX={mouseX}
          key={item.title}
          title={item.title}
          icon={item.icon}
          accent={"accent" in item && item.accent}
          {...("href" in item ? { href: item.href } : { onClick: item.onClick })}
        />
      ))}
    </motion.div>
  );
};

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  onClick,
  accent,
}: {
  mouseX: MotionValue;
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  accent?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };

    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [40, 80, 40]);

  const widthTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);
  const heightTransformIcon = useTransform(distance, [-150, 0, 150], [20, 40, 20]);

  const width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  const heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [hovered, setHovered] = useState(false);

  const inner = (
    <motion.div
      ref={ref}
      style={{ width, height }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative flex aspect-square items-center justify-center rounded-full shadow-sm transition-shadow",
        accent
          ? "bg-linear-to-br from-[#21C4DD] to-[#A577FF] shadow-md ring-1 ring-white/25 hover:brightness-[1.03]"
          : "bg-[#eef0f6] hover:bg-[#e8e9f1]",
      )}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 2, x: "-50%" }}
            className="absolute -top-8 left-1/2 w-fit rounded-md bg-[#150A35] px-2 py-0.5 text-xs whitespace-pre text-white shadow-md"
          >
            {title}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        style={{ width: widthIcon, height: heightIcon }}
        className={cn(
          "flex items-center justify-center",
          accent
            ? "[&_svg]:text-white [&_svg]:drop-shadow-sm"
            : "text-[#150A35] [&_svg]:text-[#150A35]",
        )}
      >
        {icon}
      </motion.div>
    </motion.div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="border-0 bg-transparent p-0">
        {inner}
      </button>
    );
  }

  return <a href={href ?? "#"}>{inner}</a>;
}
