"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const INTEGRATIONS = [
  { value: "slack", label: "Slack" },
  { value: "github", label: "GitHub" },
  { value: "google", label: "Google" },
] as const;

const INTEGRATION_NONE = "__echo_int_none__";
const METHOD_NONE = "__echo_method_none__";
const METHOD_CUSTOM = "__echo_method_custom__";

const fieldClass =
  "w-full border-[#A577FF]/20 bg-white text-[#150A35] shadow-sm focus-visible:border-[#A577FF]/40 focus-visible:ring-[#A577FF]/25";

type WorkflowApiCallFieldsProps = {
  params: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
};

function parseArgsObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function stringifyJson(value: unknown, empty = "{}"): string {
  if (value === undefined || value === null) return empty;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return empty;
  }
}

type ArgsFormKind =
  | "gmail_send"
  | "post_message"
  | "create_issue"
  | "calendar_freebusy"
  | "calendar_list"
  | "list_channels"
  | "list_repos"
  | "drive_list_files"
  | "google_rest"
  | "no_args"
  | "none"
  | "json";

function argsFormKind(method: string): ArgsFormKind {
  const m = method.toLowerCase().replace(/-/g, "_");
  switch (m) {
    case "gmail_send":
      return "gmail_send";
    case "post_message":
      return "post_message";
    case "create_issue":
      return "create_issue";
    case "calendar_freebusy":
      return "calendar_freebusy";
    case "calendar_list":
      return "calendar_list";
    case "list_channels":
      return "list_channels";
    case "list_repos":
      return "list_repos";
    case "drive_list_files":
      return "drive_list_files";
    case "rest":
    case "google_rest":
      return "google_rest";
    case "userinfo":
    case "gmail_list_labels":
      return "no_args";
    default:
      return "json";
  }
}

function hasStructuredForm(method: string): boolean {
  return argsFormKind(method) !== "json";
}

export function WorkflowApiCallFields({
  params,
  onChange,
}: WorkflowApiCallFieldsProps) {
  const patchParams = useCallback(
    (patch: Record<string, unknown>) => {
      onChange({ ...params, ...patch });
    },
    [onChange, params],
  );

  const update = useCallback(
    (k: string, v: unknown) => {
      onChange({ ...params, [k]: v });
    },
    [onChange, params],
  );

  const integration = ((params.integration as string) || "").trim();
  const rawMethod = ((params.method as string) || "").trim();

  const argsObj = useMemo(() => parseArgsObject(params.args), [params.args]);

  const setArgs = useCallback(
    (next: Record<string, unknown>) => {
      patchParams({ args: next });
    },
    [patchParams],
  );

  const setArgField = useCallback(
    (key: string, value: unknown) => {
      setArgs({ ...argsObj, [key]: value });
    },
    [argsObj, setArgs],
  );

  const [useRawJson, setUseRawJson] = useState(false);

  const formKind = rawMethod ? argsFormKind(rawMethod) : "none";
  const structuredAvailable = Boolean(rawMethod) && hasStructuredForm(rawMethod);

  useEffect(() => {
    if (!structuredAvailable) setUseRawJson(true);
    else setUseRawJson(false);
  }, [rawMethod, structuredAvailable]);

  const [methods, setMethods] = useState<Record<string, string> | null>(null);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const [methodsError, setMethodsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (!integration || !["slack", "github", "google"].includes(integration)) {
        setMethods(null);
        setMethodsError(null);
        setMethodsLoading(false);
        return;
      }

      setMethodsLoading(true);
      setMethodsError(null);

      try {
        const res = await apiFetch(
          `/api/integrations/${encodeURIComponent(integration)}/methods`,
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const data = (await res.json()) as { methods?: Record<string, string> };
        if (!cancelled) {
          setMethods(
            data.methods && typeof data.methods === "object" ? data.methods : {},
          );
          setMethodsError(null);
        }
      } catch {
        if (!cancelled) {
          setMethods(null);
          setMethodsError(
            "Could not load methods — enter the method name manually.",
          );
        }
      } finally {
        if (!cancelled) setMethodsLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [integration]);

  const sortedMethodEntries = useMemo(() => {
    if (!methods) return [];
    return Object.entries(methods).sort(([a], [b]) => a.localeCompare(b));
  }, [methods]);

  const methodInList = Boolean(
    methods &&
      rawMethod &&
      Object.prototype.hasOwnProperty.call(methods, rawMethod),
  );

  const methodSelectValue = !rawMethod
    ? METHOD_NONE
    : methodInList
      ? rawMethod
      : METHOD_CUSTOM;

  const selectedDescription =
    methods && rawMethod && methodInList ? methods[rawMethod] : null;

  const showCustomMethodInput =
    Boolean(methods && !methodsError) &&
    (methodSelectValue === METHOD_CUSTOM || (Boolean(rawMethod) && !methodInList));

  const argsString =
    typeof params.args === "object" && params.args !== null
      ? JSON.stringify(params.args, null, 2)
      : (params.args as string) || "";

  const showForm =
    structuredAvailable &&
    !useRawJson &&
    formKind !== "json" &&
    formKind !== "none";

  const renderStructuredArgs = () => {
    switch (formKind) {
      case "gmail_send":
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">To</Label>
              <Input
                type="email"
                value={String(argsObj.to ?? argsObj.to_email ?? "")}
                onChange={(e) => setArgField("to", e.target.value)}
                placeholder="recipient@example.com"
                className={cn("h-9 text-sm", fieldClass)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Subject</Label>
              <Input
                value={String(argsObj.subject ?? "")}
                onChange={(e) => setArgField("subject", e.target.value)}
                placeholder="Email subject"
                className={cn("h-9 text-sm", fieldClass)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Message</Label>
              <Textarea
                value={String(argsObj.body ?? argsObj.text ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  setArgs({ ...argsObj, body: v, text: v });
                }}
                placeholder="Write your message…"
                rows={4}
                className={cn("min-h-[88px] text-sm", fieldClass)}
              />
            </div>
            <details className="rounded-md border border-[#A577FF]/10 bg-white/60 px-2 py-1.5 text-xs">
              <summary className="cursor-pointer font-medium text-echo-text-muted">
                Cc / Bcc / HTML (optional)
              </summary>
              <div className="mt-2 space-y-2 pt-1">
                <Input
                  value={String(argsObj.cc ?? "")}
                  onChange={(e) => setArgField("cc", e.target.value)}
                  placeholder="Cc (optional)"
                  className={cn("h-8 text-xs", fieldClass)}
                />
                <Input
                  value={String(argsObj.bcc ?? "")}
                  onChange={(e) => setArgField("bcc", e.target.value)}
                  placeholder="Bcc (optional)"
                  className={cn("h-8 text-xs", fieldClass)}
                />
                <Textarea
                  value={String(argsObj.html ?? "")}
                  onChange={(e) => setArgField("html", e.target.value)}
                  placeholder="HTML body (optional; sends multipart email)"
                  rows={3}
                  className={cn("text-xs", fieldClass)}
                />
              </div>
            </details>
          </div>
        );
      case "post_message":
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Channel</Label>
              <Input
                value={String(argsObj.channel ?? "")}
                onChange={(e) => setArgField("channel", e.target.value)}
                placeholder="C123… or channel name"
                className={cn("h-9 font-mono text-sm", fieldClass)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Message</Label>
              <Textarea
                value={String(argsObj.text ?? "")}
                onChange={(e) => setArgField("text", e.target.value)}
                placeholder="Hello from Echo…"
                rows={3}
                className={cn("text-sm", fieldClass)}
              />
            </div>
          </div>
        );
      case "create_issue":
        return (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#150A35]">Owner</Label>
                <Input
                  value={String(argsObj.owner ?? "")}
                  onChange={(e) => setArgField("owner", e.target.value)}
                  placeholder="org or user"
                  className={cn("h-9 text-sm", fieldClass)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#150A35]">Repo</Label>
                <Input
                  value={String(argsObj.repo ?? "")}
                  onChange={(e) => setArgField("repo", e.target.value)}
                  placeholder="repo-name"
                  className={cn("h-9 text-sm", fieldClass)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Title</Label>
              <Input
                value={String(argsObj.title ?? "")}
                onChange={(e) => setArgField("title", e.target.value)}
                placeholder="Issue title"
                className={cn("h-9 text-sm", fieldClass)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Body (optional)</Label>
              <Textarea
                value={String(argsObj.body ?? "")}
                onChange={(e) => setArgField("body", e.target.value)}
                placeholder="Description…"
                rows={3}
                className={cn("text-sm", fieldClass)}
              />
            </div>
          </div>
        );
      case "calendar_freebusy":
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">timeMin (RFC3339)</Label>
              <Input
                value={String(argsObj.timeMin ?? argsObj.time_min ?? "")}
                onChange={(e) =>
                  setArgs({
                    ...argsObj,
                    timeMin: e.target.value,
                    time_min: e.target.value,
                  })
                }
                placeholder="2026-04-06T10:00:00Z"
                className={cn("h-9 font-mono text-xs", fieldClass)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">timeMax (RFC3339)</Label>
              <Input
                value={String(argsObj.timeMax ?? argsObj.time_max ?? "")}
                onChange={(e) =>
                  setArgs({
                    ...argsObj,
                    timeMax: e.target.value,
                    time_max: e.target.value,
                  })
                }
                placeholder="2026-04-06T11:00:00Z"
                className={cn("h-9 font-mono text-xs", fieldClass)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Timezone (optional)</Label>
              <Input
                value={String(argsObj.timeZone ?? argsObj.timezone ?? "UTC")}
                onChange={(e) =>
                  setArgs({
                    ...argsObj,
                    timeZone: e.target.value,
                    timezone: e.target.value,
                  })
                }
                placeholder="UTC"
                className={cn("h-9 text-sm", fieldClass)}
              />
            </div>
            <details className="rounded-md border border-[#A577FF]/10 bg-white/60 px-2 py-1.5 text-xs">
              <summary className="cursor-pointer font-medium text-echo-text-muted">
                Calendar IDs (JSON array, optional)
              </summary>
              <p className="mb-1 mt-1 text-[10px] text-echo-text-muted">
                Default is one primary calendar if omitted. Example:{" "}
                <code className="rounded bg-white/80 px-0.5">{`[{"id":"primary"}]`}</code>
              </p>
              <Textarea
                key={`fb-items-${integration}-${rawMethod}`}
                defaultValue={stringifyJson(argsObj.items ?? [{ id: "primary" }])}
                onBlur={(e) => {
                  try {
                    const t = e.target.value.trim();
                    const next = { ...argsObj };
                    if (!t) {
                      delete next.items;
                      setArgs(next);
                      return;
                    }
                    const parsed = JSON.parse(t) as unknown;
                    if (Array.isArray(parsed)) {
                      setArgs({ ...argsObj, items: parsed });
                    }
                  } catch {
                    /* keep previous */
                  }
                }}
                rows={3}
                className={cn("font-mono text-xs", fieldClass)}
              />
            </details>
          </div>
        );
      case "no_args":
        return (
          <div className="space-y-2 rounded-md border border-[#A577FF]/12 bg-white/90 px-3 py-3">
            <p className="text-sm font-medium text-[#150A35]">No arguments required</p>
            <p className="text-xs leading-relaxed text-echo-text-muted">
              This method runs without parameters. Use <span className="font-medium text-[#150A35]">Edit as JSON</span>{" "}
              if you need optional or advanced fields.
            </p>
          </div>
        );
      case "calendar_list":
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">maxResults (1–250)</Label>
              <Input
                type="number"
                min={1}
                max={250}
                value={
                  argsObj.maxResults != null && argsObj.maxResults !== ""
                    ? String(argsObj.maxResults)
                    : "10"
                }
                onChange={(e) => {
                  const n = e.target.value;
                  if (n === "") {
                    setArgField("maxResults", 10);
                    return;
                  }
                  const num = Math.min(250, Math.max(1, parseInt(n, 10) || 10));
                  setArgField("maxResults", num);
                }}
                className={cn("h-9 text-sm", fieldClass)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">pageToken (optional)</Label>
              <Input
                value={String(argsObj.pageToken ?? "")}
                onChange={(e) => setArgField("pageToken", e.target.value)}
                placeholder="From a previous calendarList response"
                className={cn("h-9 font-mono text-xs", fieldClass)}
              />
            </div>
          </div>
        );
      case "google_rest": {
        const verb = String(argsObj.verb ?? argsObj.http_method ?? "GET").toUpperCase();
        const verbOk = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(verb);
        const restKey = `${integration}-${rawMethod}`;
        return (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-echo-text-muted">
              Call any Google API on a <code className="rounded bg-white/80 px-1">*.googleapis.com</code> host. Match
              OAuth scopes in Auth0 to the API you use.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="w-full shrink-0 space-y-1.5 sm:w-[6.5rem]">
                <Label className="text-xs text-[#150A35]">HTTP</Label>
                <Select
                  value={verbOk ? verb : "GET"}
                  onValueChange={(v) => setArgs({ ...argsObj, verb: v, http_method: v })}
                >
                  <SelectTrigger size="sm" className={cn("h-9 w-full", fieldClass)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label className="text-xs text-[#150A35]">URL</Label>
                <Input
                  value={String(argsObj.url ?? "")}
                  onChange={(e) => setArgField("url", e.target.value)}
                  placeholder="https://www.googleapis.com/calendar/v3/users/me/calendarList"
                  className={cn("h-9 font-mono text-[11px] sm:text-xs", fieldClass)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Query params (JSON object)</Label>
              <Textarea
                key={`${restKey}-params`}
                defaultValue={stringifyJson(argsObj.params)}
                onBlur={(e) => {
                  try {
                    const t = e.target.value.trim();
                    const next = { ...argsObj };
                    if (!t) {
                      delete next.params;
                      setArgs(next);
                      return;
                    }
                    const parsed = JSON.parse(t) as unknown;
                    if (
                      parsed !== null &&
                      typeof parsed === "object" &&
                      !Array.isArray(parsed)
                    ) {
                      setArgs({ ...argsObj, params: parsed as Record<string, unknown> });
                    }
                  } catch {
                    /* invalid JSON */
                  }
                }}
                rows={3}
                placeholder="{}"
                className={cn("font-mono text-xs", fieldClass)}
              />
              <p className="text-[10px] text-echo-text-muted">
                For GET requests. Example:{" "}
                <code className="rounded bg-white/80 px-0.5">{`{ "maxResults": 10 }`}</code>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Request body (JSON)</Label>
              <Textarea
                key={`${restKey}-json`}
                defaultValue={stringifyJson(argsObj.json)}
                onBlur={(e) => {
                  try {
                    const t = e.target.value.trim();
                    const next = { ...argsObj };
                    if (!t) {
                      delete next.json;
                      setArgs(next);
                      return;
                    }
                    setArgs({ ...argsObj, json: JSON.parse(t) as unknown });
                  } catch {
                    /* invalid */
                  }
                }}
                rows={5}
                placeholder="{}"
                className={cn("font-mono text-xs", fieldClass)}
              />
              <p className="text-[10px] text-echo-text-muted">For POST, PUT, PATCH, DELETE.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Timeout (seconds, 5–120)</Label>
              <Input
                type="number"
                min={5}
                max={120}
                value={
                  argsObj.timeout_seconds != null && argsObj.timeout_seconds !== ""
                    ? String(argsObj.timeout_seconds)
                    : "60"
                }
                onChange={(e) => {
                  const n = e.target.value;
                  if (n === "") {
                    const next = { ...argsObj };
                    delete next.timeout_seconds;
                    setArgs(next);
                    return;
                  }
                  setArgField("timeout_seconds", Number(n));
                }}
                className={cn("h-9 text-sm", fieldClass)}
              />
            </div>
            <details className="rounded-md border border-[#A577FF]/10 bg-white/60 px-2 py-1.5 text-xs">
              <summary className="cursor-pointer font-medium text-echo-text-muted">
                Extra headers (JSON, optional)
              </summary>
              <Textarea
                key={`${restKey}-hdr`}
                defaultValue={stringifyJson(argsObj.headers)}
                onBlur={(e) => {
                  try {
                    const t = e.target.value.trim();
                    const next = { ...argsObj };
                    if (!t || t === "{}") {
                      delete next.headers;
                      setArgs(next);
                      return;
                    }
                    const parsed = JSON.parse(t) as unknown;
                    if (
                      parsed !== null &&
                      typeof parsed === "object" &&
                      !Array.isArray(parsed)
                    ) {
                      setArgs({ ...argsObj, headers: parsed as Record<string, unknown> });
                    }
                  } catch {
                    /* invalid */
                  }
                }}
                rows={2}
                placeholder="{}"
                className={cn("mt-2 font-mono text-xs", fieldClass)}
              />
            </details>
          </div>
        );
      }
      case "list_channels":
        return (
          <div className="space-y-1.5">
            <Label className="text-xs text-[#150A35]">Limit (optional)</Label>
            <Input
              type="number"
              value={
                argsObj.limit != null && argsObj.limit !== ""
                  ? String(argsObj.limit)
                  : ""
              }
              onChange={(e) => {
                const n = e.target.value;
                if (n === "") {
                  const next = { ...argsObj };
                  delete next.limit;
                  setArgs(next);
                  return;
                }
                setArgField("limit", Number(n));
              }}
              placeholder="100"
              className={cn("h-9 text-sm", fieldClass)}
            />
          </div>
        );
      case "list_repos":
        return (
          <div className="space-y-1.5">
            <Label className="text-xs text-[#150A35]">per_page (optional)</Label>
            <Input
              type="number"
              value={
                argsObj.per_page != null && argsObj.per_page !== ""
                  ? String(argsObj.per_page)
                  : ""
              }
              onChange={(e) => {
                const n = e.target.value;
                if (n === "") {
                  const next = { ...argsObj };
                  delete next.per_page;
                  setArgs(next);
                  return;
                }
                setArgField("per_page", Number(n));
              }}
              placeholder="30"
              className={cn("h-9 text-sm", fieldClass)}
            />
          </div>
        );
      case "drive_list_files":
        return (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">Search query (optional)</Label>
              <Input
                value={String(argsObj.q ?? "")}
                onChange={(e) => setArgField("q", e.target.value)}
                placeholder="mimeType = 'application/vnd.google-apps.folder'"
                className={cn("h-9 text-xs", fieldClass)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-[#150A35]">pageSize (optional)</Label>
                <Input
                  type="number"
                  value={
                    argsObj.pageSize != null && argsObj.pageSize !== ""
                      ? String(argsObj.pageSize)
                      : ""
                  }
                  onChange={(e) => {
                    const n = e.target.value;
                    if (n === "") {
                      const next = { ...argsObj };
                      delete next.pageSize;
                      setArgs(next);
                      return;
                    }
                    setArgField("pageSize", Number(n));
                  }}
                  placeholder="10"
                  className={cn("h-9 text-sm", fieldClass)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-[#150A35]">pageToken (optional)</Label>
                <Input
                  value={String(argsObj.pageToken ?? "")}
                  onChange={(e) => setArgField("pageToken", e.target.value)}
                  placeholder="Next page token"
                  className={cn("h-9 font-mono text-xs", fieldClass)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#150A35]">fields (optional)</Label>
              <Input
                value={String(argsObj.fields ?? "")}
                onChange={(e) => setArgField("fields", e.target.value)}
                placeholder="nextPageToken, files(id, name, mimeType, modifiedTime)"
                className={cn("h-9 font-mono text-[11px]", fieldClass)}
              />
              <p className="text-[10px] text-echo-text-muted">
                Google Drive <code className="rounded bg-white/80 px-0.5">fields</code> mask; leave empty for the
                default.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-[#A577FF]/15 bg-[#F5F7FC]/50 p-3">
      <div className="space-y-2">
        <Label htmlFor="wf-api-integration" className="text-xs font-medium text-[#150A35]">
          Integration
        </Label>
        <Select
          value={integration ? integration : INTEGRATION_NONE}
          onValueChange={(v) => {
            if (v === INTEGRATION_NONE) {
              patchParams({ integration: "", method: "" });
              return;
            }
            patchParams({ integration: v, method: "" });
          }}
        >
          <SelectTrigger
            id="wf-api-integration"
            size="sm"
            className={cn("h-9 w-full min-w-0", fieldClass)}
          >
            <SelectValue placeholder="Choose integration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INTEGRATION_NONE}>
              <span className="text-echo-text-muted">— Select integration —</span>
            </SelectItem>
            {INTEGRATIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="wf-api-method" className="text-xs font-medium text-[#150A35]">
            Method
          </Label>
          {methodsLoading && (
            <span className="text-[10px] text-echo-text-muted">Loading…</span>
          )}
        </div>

        {!integration && (
          <p className="text-xs text-echo-text-muted">
            Select an integration to choose a method.
          </p>
        )}

        {integration && methodsError && (
          <Input
            id="wf-api-method"
            type="text"
            value={rawMethod}
            onChange={(e) => update("method", e.target.value)}
            placeholder="e.g. post_message, rest, gmail_send"
            className={cn("h-9 font-mono text-xs", fieldClass)}
          />
        )}

        {integration && !methodsError && (methodsLoading || methods) && (
          <>
            <Select
              value={methodSelectValue}
              onValueChange={(v) => {
                if (v === METHOD_NONE) {
                  update("method", "");
                  return;
                }
                if (v === METHOD_CUSTOM) {
                  update("method", "");
                  return;
                }
                update("method", v);
              }}
              disabled={methodsLoading || !methods}
            >
              <SelectTrigger
                id="wf-api-method"
                size="sm"
                className={cn("h-9 w-full min-w-0", fieldClass)}
              >
                <SelectValue placeholder="Choose a method" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(320px,50vh)]">
                <SelectItem value={METHOD_NONE}>
                  <span className="text-echo-text-muted">— Select method —</span>
                </SelectItem>
                {sortedMethodEntries.map(([name]) => (
                  <SelectItem key={name} value={name}>
                    <span className="font-mono text-xs">{name}</span>
                  </SelectItem>
                ))}
                <SelectItem value={METHOD_CUSTOM}>
                  <span className="text-echo-text-muted">Custom method…</span>
                </SelectItem>
              </SelectContent>
            </Select>

            {showCustomMethodInput && (
              <Input
                type="text"
                value={rawMethod}
                onChange={(e) => update("method", e.target.value)}
                placeholder="Type method name"
                className={cn("h-9 font-mono text-xs", fieldClass)}
                aria-label="Custom API method name"
              />
            )}

            {selectedDescription && !showCustomMethodInput && (
              <p className="rounded-md border border-[#A577FF]/10 bg-white/80 px-2.5 py-2 text-xs leading-relaxed text-echo-text-muted">
                {selectedDescription}
              </p>
            )}
          </>
        )}

        {methodsError && (
          <p className="text-xs text-echo-text-muted">{methodsError}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-xs font-medium text-[#150A35]">
            Arguments
            {showForm ? (
              <span className="ml-1 font-normal text-echo-text-muted">(form)</span>
            ) : (
              <span className="ml-1 font-normal text-echo-text-muted">(JSON)</span>
            )}
          </Label>
          {structuredAvailable && (
            <button
              type="button"
              onClick={() => setUseRawJson((v) => !v)}
              className="text-[11px] font-medium text-[#A577FF] underline-offset-2 hover:underline"
            >
              {useRawJson ? "Use form fields" : "Edit as JSON"}
            </button>
          )}
        </div>

        {showForm ? (
          renderStructuredArgs()
        ) : (
          <textarea
            id="wf-api-args"
            value={argsString}
            onChange={(e) => {
              try {
                update("args", JSON.parse(e.target.value));
              } catch {
                update("args", e.target.value);
              }
            }}
            placeholder='{"key": "value"}'
            rows={8}
            className={cn(
              "min-h-[120px] w-full resize-y rounded-md border px-3 py-2 font-mono text-xs",
              fieldClass,
            )}
          />
        )}

        <p className="text-[11px] leading-snug text-echo-text-muted">
          {useRawJson || !structuredAvailable
            ? "Advanced: pass any JSON object your method expects. For Google `rest` / `google_rest`, use `verb`, `url`, and optional `params`, `json`, `timeout_seconds`."
            : "Values are saved under Args as JSON. Use Edit as JSON for uncommon keys or custom methods."}
        </p>
      </div>
    </div>
  );
}
