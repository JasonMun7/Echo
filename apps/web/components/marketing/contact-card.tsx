"use client";

import { StatefulButton } from "@/components/ui/stateful-button";

export function ContactCard() {
  const handleNotify = async () => {
    // Placeholder: simulate API call
    await new Promise((r) => setTimeout(r, 800));
  };

  return (
    <div className="mx-auto mt-12 max-w-md rounded-lg border border-[#21C4DD]/20 bg-white p-8 shadow-sm">
      <p className="text-center text-gray-600">
        Contact form coming soon. Reach us at{" "}
        <a
          href="mailto:support@echo.ai"
          className="text-[#21C4DD] underline hover:text-[#21C4DD]/80"
        >
          support@echo.ai
        </a>
      </p>
      <div className="mt-6 flex justify-center">
        <StatefulButton onClick={handleNotify} className="echo-btn-primary">
          Notify me when ready
        </StatefulButton>
      </div>
    </div>
  );
}
