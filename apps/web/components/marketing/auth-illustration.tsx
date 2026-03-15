"use client";

import React from "react";

export const AuthIllustration = () => {
  return (
    <div className="relative flex w-full flex-col items-start justify-end overflow-hidden rounded-xl">
      <div className="relative z-40 mb-2 flex items-center gap-2">
        <span className="echo-glass-light rounded-md px-2 py-1 text-xs text-white">
          Product Company
        </span>
        <span className="echo-glass-light rounded-md px-2 py-1 text-xs text-white">
          Cloud Management
        </span>
      </div>
      <div className="echo-glass-light relative z-40 max-w-sm rounded-xl p-4">
        <h2 className="text-white">
          Echo has completely changed how we work. What used to take hours every
          week is now fully automated.
        </h2>
        <p className="mt-4 text-sm text-white/70">Gina Clinton</p>
        <p className="mt-1 text-sm text-white/70">
          Head of Product, <span className="font-bold">Acme Inc.</span>
        </p>
      </div>

      <div className="absolute -top-48 -right-40 z-20 grid rotate-45 transform grid-cols-4 gap-32 opacity-30">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="size-40 shrink-0 rounded-3xl border border-white/20 bg-white/5"
          />
        ))}
      </div>
    </div>
  );
};
