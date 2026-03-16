"use client";

import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Heading } from "./heading";
import { SubHeading } from "./subheading";
import { cn } from "@/lib/utils";
import { IconPlus } from "@tabler/icons-react";
import { GridLineHorizontal, GridLineVertical } from "./grid-lines";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQSection {
  title: string;
  items: FAQItem[];
}

const faqData: FAQSection[] = [
  {
    title: "What Echo can do",
    items: [
      {
        question: "What can Echo automate?",
        answer:
          "Any repeatable workflow you can do on a computer: data entry, report filing, email management, form submissions, browser tasks, desktop app actions, and more. If you can record it or describe it, Echo can run it.",
      },
      {
        question: "How do I create a workflow?",
        answer:
          "Open the Echo desktop app and hit Record — Echo captures your screen as you work and synthesizes it into a step-by-step AI plan using Gemini 2.5 Pro. You can also describe a workflow in plain English and Echo will generate the steps automatically.",
      },
      {
        question: "Can I share workflows with others?",
        answer:
          "Yes. You can share any workflow via email. The recipient can run it with one click or voice command, and fork it to create their own editable copy.",
      },
    ],
  },
  {
    title: "Voice & AI",
    items: [
      {
        question: "How does the voice control work?",
        answer:
          "Echo uses LiveKit + Gemini Live for real-time native audio. You can say \"run my weekly report\", interrupt a run mid-execution with \"skip this step\", or ask \"what workflows do I have?\" — and EchoPrism responds and acts instantly.",
      },
      {
        question: "Can I interrupt a workflow while it's running?",
        answer:
          "Yes. Click the microphone button in the web dashboard or desktop app during any run to open a live voice session. Echo will pause, listen to your instruction, and redirect or continue as you specify.",
      },
      {
        question: "Does Echo learn from my workflows?",
        answer:
          "Yes. Every completed run is automatically scored for quality. High-quality traces feed a fine-tuning loop that gradually improves Echo's accuracy on your specific apps and patterns.",
      },
    ],
  },
  {
    title: "Privacy & security",
    items: [
      {
        question: "Is my screen data private?",
        answer:
          "Screenshots are processed by Gemini to decide actions and stored encrypted in Google Cloud Storage. They are never used to train public models and are scoped to your account only.",
      },
      {
        question: "Where is Echo hosted?",
        answer:
          "Echo runs entirely on Google Cloud — Cloud Run for compute, Firestore for data, and Cloud Storage for assets. All data is stored in GCP with encryption at rest and in transit.",
      },
    ],
  },
];

export function FAQs() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setActiveId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleQuestion = (id: string) => {
    setActiveId(activeId === id ? null : id);
  };

  return (
    <div className="mx-auto max-w-4xl overflow-hidden px-4 py-20 md:px-8 md:py-32">
      <div className="text-center">
        <Heading as="h2">Frequently Asked Questions</Heading>
        <SubHeading as="p" className="mx-auto mt-4 max-w-2xl">
          Everything you need to know about Echo, EchoPrism, and automating
          your workflows with voice and AI vision.
        </SubHeading>
      </div>

      <div
        ref={containerRef}
        className="relative mt-16 flex flex-col gap-12 px-4 md:px-8"
      >
        {faqData.map((section) => (
          <div key={section.title}>
            <h3 className="mb-6 text-lg font-medium text-[#150A35]">
              {section.title}
            </h3>
            <div className="flex flex-col gap-3">
              {section.items.map((item, index) => {
                const id = `${section.title}-${index}`;
                const isActive = activeId === id;
                return (
                  <div
                    key={id}
                    className={cn(
                      "relative rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-white shadow-sm ring-1 ring-[#21C4DD]/25"
                        : "hover:bg-white/80"
                    )}
                  >
                    {isActive && (
                      <div className="absolute inset-0">
                        <GridLineHorizontal
                          className="-top-[2px]"
                          offset="100px"
                        />
                        <GridLineHorizontal
                          className="-bottom-[2px]"
                          offset="100px"
                        />
                        <GridLineVertical
                          className="-left-[2px]"
                          offset="100px"
                        />
                        <GridLineVertical
                          className="-right-[2px] left-auto"
                          offset="100px"
                        />
                      </div>
                    )}
                    <button
                      onClick={() => toggleQuestion(id)}
                      className="flex w-full items-center justify-between px-4 py-4 text-left"
                    >
                      <span className="text-sm font-medium text-[#150A35] md:text-base">
                        {item.question}
                      </span>
                      <motion.div
                        animate={{ rotate: isActive ? 45 : 0 }}
                        transition={{ duration: 0.2 }}
                        className="ml-4 shrink-0"
                      >
                        <IconPlus className={cn("size-5 shrink-0", isActive ? "text-[#21C4DD]" : "text-gray-500")} />
                      </motion.div>
                    </button>
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            duration: 0.15,
                            ease: "easeInOut",
                          }}
                          className="relative"
                        >
                          <p className="max-w-[90%] px-4 pb-4 text-sm text-gray-600">
                            {item.answer}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
