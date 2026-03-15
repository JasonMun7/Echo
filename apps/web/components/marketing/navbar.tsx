"use client";

import React, { useState, useRef, useEffect } from "react";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import GradientText from "@/components/reactbits/GradientText";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "motion/react";

export const Navbar = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const { scrollY } = useScroll();
  const paddingHorizontal = useTransform(scrollY, [0, 50], [0, 16]);
  const paddingVertical = useTransform(scrollY, [0, 50], [0, 8]);

  useMotionValueEvent(scrollY, "change", (latest) => {
    setHasScrolled(latest > 10);
    const scrollingDown = latest > lastScrollY.current;
    const scrollDelta = Math.abs(latest - lastScrollY.current);
    if (scrollDelta > 5) {
      if (scrollingDown && latest > 100) {
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
      lastScrollY.current = latest;
    }
  });

  return (
    <motion.nav
      initial={{ y: 0 }}
      animate={{ y: isVisible ? 0 : -100 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      style={{
        paddingLeft: paddingHorizontal,
        paddingRight: paddingHorizontal,
        paddingTop: paddingVertical,
      }}
      className="fixed inset-x-0 z-50 mx-auto w-full max-w-7xl"
    >
      <motion.div
        animate={{
          borderRadius: hasScrolled ? 24 : 0,
          backdropFilter: hasScrolled ? "blur(12px)" : "blur(0px)",
        }}
        transition={{ duration: 0.3 }}
        className={`flex h-14 items-center justify-between px-4 transition-colors duration-300 sm:h-16 md:px-8 ${
          hasScrolled
            ? "bg-white/90 shadow-[0_1px_3px_0_rgba(0,0,0,0.1)]"
            : "bg-transparent shadow-none"
        }`}
      >
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/echo_logo.png"
            alt="Echo"
            width={40}
            height={40}
            className="size-10 shrink-0 object-contain"
          />
          <GradientText
            colors={["#A577FF", "#21C4DD", "#A577FF"]}
            animationSpeed={6}
            className="text-base font-semibold sm:text-lg"
          >
            <span>Echo</span>
          </GradientText>
        </Link>

        <div className="hidden items-center gap-6 lg:flex lg:gap-8">
          <Link
            href="/#product"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#150A35]"
          >
            Product
          </Link>
          <Link
            href="/datasets/create"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#150A35]"
          >
            Playground
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#150A35]"
          >
            Pricing
          </Link>
          <Link
            href="/contact"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#150A35]"
          >
            Contact
          </Link>
        </div>

        <div className="hidden items-center gap-3 lg:flex lg:gap-4">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-[#150A35]"
          >
            Sign in
          </Link>
          <HoverBorderGradient
            as="div"
            containerClassName="h-10"
            className="flex h-full items-center justify-center px-4 py-2 text-sm font-medium"
          >
            <Link href="/get-started">Get started</Link>
          </HoverBorderGradient>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex size-10 items-center justify-center rounded-md lg:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <IconX className="size-5 text-[#150A35]" />
          ) : (
            <IconMenu2 className="size-5 text-[#150A35]" />
          )}
        </button>
      </motion.div>

      <motion.div
        initial={false}
        animate={{
          opacity: mobileMenuOpen ? 1 : 0,
          y: mobileMenuOpen ? 0 : -20,
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`fixed inset-0 top-14 z-40 flex flex-col bg-[#F5F7FC] sm:top-16 lg:hidden ${
          mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div className="flex flex-1 flex-col overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-2">
            <Link
              href="/#product"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-4 py-3.5 text-base font-medium text-[#150A35] transition-colors hover:bg-white/80"
            >
              Product
            </Link>
            <Link
              href="/datasets/create"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-4 py-3.5 text-base font-medium text-[#150A35] transition-colors hover:bg-white/80"
            >
              Playground
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-4 py-3.5 text-base font-medium text-[#150A35] transition-colors hover:bg-white/80"
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-4 py-3.5 text-base font-medium text-[#150A35] transition-colors hover:bg-white/80"
            >
              Contact
            </Link>
          </div>

          <div className="mt-auto pt-6">
            <div className="mb-6 h-px w-full bg-[linear-gradient(to_right,transparent,rgba(21,10,53,0.1)_20%,rgba(21,10,53,0.1)_80%,transparent)] [mask-image:repeating-linear-gradient(to_right,black_0px,black_4px,transparent_4px,transparent_8px)]" />
            <Link
              href="/sign-in"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full rounded-xl border border-[#A577FF]/30 px-4 py-3.5 text-center text-base font-medium text-[#150A35] transition-colors hover:bg-white/80"
            >
              Sign in
            </Link>
            <HoverBorderGradient
              as="div"
              containerClassName="mt-3 h-12 w-full rounded-xl"
              className="flex h-full w-full items-center justify-center px-4 py-3.5 text-base font-medium"
            >
              <Link href="/get-started" onClick={() => setMobileMenuOpen(false)}>
                Get started
              </Link>
            </HoverBorderGradient>
          </div>
        </div>
      </motion.div>
    </motion.nav>
  );
};
