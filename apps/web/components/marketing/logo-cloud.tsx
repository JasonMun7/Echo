"use client";

import React from "react";
import { motion } from "motion/react";
import Image from "next/image";

const LOGOS = [
  { title: "Open AI", src: "https://assets.aceternity.com/logos/openai.png" },
  {
    title: "Hello Patient",
    src: "https://assets.aceternity.com/logos/hello-patient.png",
  },
  { title: "Granola", src: "https://assets.aceternity.com/logos/granola.png" },
  {
    title: "Character AI",
    src: "https://assets.aceternity.com/logos/characterai.png",
  },
  { title: "Oracle", src: "https://assets.aceternity.com/logos/oracle.png" },
  { title: "Portola", src: "https://assets.aceternity.com/logos/portola.png" },
  { title: "Accel", src: "https://assets.aceternity.com/logos/accel.png" },
  { title: "Bloomberg", src: "https://assets.aceternity.com/logos/bloomberg.png" },
  { title: "Forbes", src: "https://assets.aceternity.com/logos/forbes.png" },
  { title: "SoftBank", src: "https://assets.aceternity.com/logos/softbank.png" },
  {
    title: "The Guardian",
    src: "https://assets.aceternity.com/logos/the-guardian.png",
  },
  { title: "Wired", src: "https://assets.aceternity.com/logos/wired.png" },
];

export function LogoCloud() {
  return (
    <section className="py-10 md:py-20 lg:py-32">
      <h2 className="mx-auto max-w-xl text-center text-lg font-medium text-gray-600">
        Trusted by teams building the future of AI.{" "}
        <br className="hidden sm:block" />{" "}
        <span className="text-[#21C4DD]">From prototype to production.</span>
      </h2>
      <div className="mx-auto mt-10 grid max-w-7xl grid-cols-4 md:grid-cols-6">
        {LOGOS.map((logo, index) => (
          <motion.div
            key={logo.title}
            initial={{ y: -10, opacity: 0, filter: "blur(10px)" }}
            whileInView={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.1 }}
          >
            <Image
              src={logo.src}
              width={100}
              height={100}
              alt={logo.title}
              className="mx-auto size-20 object-contain opacity-70 grayscale"
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
