"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";

import {
  displayNameFromBrandHit,
  searchBrandsByName,
  type BrandSearchHit,
} from "@/app/dashboard/integrations/_lib/brandfetch-search";
import { brandfetchLogoUrlForDomain } from "@/app/dashboard/integrations/_lib/brandfetch-logo";
import { cn } from "@/lib/utils";

type OpenAppBrandSearchFieldsProps = {
  action: "open_app" | "focus_app";
  /** macOS / agent app name */
  app: string;
  brandDomain: string;
  onPickBrand: (hit: BrandSearchHit) => void;
  onClearSelection: () => void;
};

export function OpenAppBrandSearchFields({
  action,
  app,
  brandDomain,
  onPickBrand,
  onClearSelection,
}: OpenAppBrandSearchFieldsProps) {
  const clientConfigured = Boolean((process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID || "").trim());
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BrandSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const t = window.setTimeout(() => {
      searchAbortRef.current?.abort();
      const ac = new AbortController();
      searchAbortRef.current = ac;
      setLoading(true);
      void searchBrandsByName(q, ac.signal)
        .then((list) => {
          setHits(list.slice(0, 8));
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setHits([]);
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 320);
    return () => {
      window.clearTimeout(t);
      searchAbortRef.current?.abort();
    };
  }, [query]);

  const selectedUrl = brandDomain.trim() ? brandfetchLogoUrlForDomain(brandDomain) : null;

  if (!clientConfigured) {
    return (
      <p className="text-xs leading-relaxed text-[#150A35]/55">
        Set{" "}
        <code className="rounded bg-[#150A35]/6 px-1 py-0.5 text-[11px]">
          NEXT_PUBLIC_BRANDFETCH_CLIENT_ID
        </code>{" "}
        to search for apps (Brandfetch).
      </p>
    );
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <label className="block text-xs font-medium text-[#150A35]/80">Search for an app</label>
      <p className="text-[11px] leading-relaxed text-[#150A35]/50">
        {action === "open_app"
          ? "Find the app to launch. We save its name for the runner and its site for the canvas."
          : "Find the app to bring to the front. We save its name for the runner and its site for the canvas."}
      </p>

      {brandDomain.trim() && app.trim() ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#150A35]/12 bg-[#F5F7FC] px-2 py-1.5">
          {selectedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Brandfetch Logo API hotlink
            <img
              src={selectedUrl}
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-md object-contain"
            />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-medium text-slate-500">
              {app.trim().slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[#150A35]">{app}</span>
            <span className="block truncate text-[11px] text-[#150A35]/50">{brandDomain}</span>
          </span>
          <button
            type="button"
            title="Clear"
            className="shrink-0 rounded-md p-1 text-[#150A35]/50 hover:bg-white hover:text-[#150A35]"
            onClick={() => {
              onClearSelection();
              setQuery("");
              setHits([]);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#150A35]/35" />
        <input
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setMenuOpen(true);
          }}
          onFocus={() => setMenuOpen(true)}
          placeholder="Type a name, e.g. Spotify, Notion…"
          className="w-full rounded border border-[#A577FF]/40 bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A577FF]/40"
        />
        {loading ? (
          <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#A577FF]" />
        ) : null}

        {menuOpen && hits.length > 0 ? (
          <ul
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#150A35]/12 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {hits.map((h) => (
              <li key={h.domain} role="option">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[#F5F7FC]",
                    h.domain === brandDomain && "bg-violet-50",
                  )}
                  onClick={() => {
                    onPickBrand(h);
                    setQuery("");
                    setHits([]);
                    setMenuOpen(false);
                  }}
                >
                  {h.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Brand Search hotlink
                    <img
                      src={h.icon}
                      alt=""
                      width={24}
                      height={24}
                      className="h-6 w-6 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500">
                      ?
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[#150A35]">
                      {h.name || displayNameFromBrandHit(h)}
                    </span>
                    <span className="block truncate text-[11px] text-[#150A35]/50">{h.domain}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
