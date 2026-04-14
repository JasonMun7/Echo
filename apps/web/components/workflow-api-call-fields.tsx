"use client";

import { useCallback, useMemo, useState } from "react";
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
import {
  COMPOSIO_TOOL_CATEGORIES,
  filterComposioToolCatalog,
  type ComposioToolCatalogEntry,
} from "@/lib/composio-tool-catalog";

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

/** Map Composio tool slug → legacy method hint for structured form fields. */
function slugToMethodHint(slug: string): string {
  const u = slug.trim().toUpperCase();
  const map: Record<string, string> = {
    GMAIL_SEND_EMAIL: "gmail_send",
    GMAIL_LIST_LABELS: "gmail_list_labels",
    SLACK_SEND_MESSAGE: "post_message",
    SLACK_LIST_ALL_CHANNELS: "list_channels",
    GITHUB_CREATE_ISSUE: "create_issue",
    GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER: "list_repos",
    GOOGLECALENDAR_CALENDAR_LIST: "calendar_list",
    GOOGLECALENDAR_FREEBUSY_QUERY: "calendar_freebusy",
    GOOGLEDRIVE_LIST_FILES: "drive_list_files",
    GOOGLEGET_USER_INFO: "userinfo",
  };
  if (map[u]) return map[u];
  if (u.includes("GOOGLE") && u.includes("REST")) return "google_rest";
  return "";
}

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
  return Boolean(method) && argsFormKind(method) !== "json";
}

export function WorkflowApiCallFields({ params, onChange }: WorkflowApiCallFieldsProps) {
  const patchParams = useCallback(
    (patch: Record<string, unknown>) => {
      onChange({ ...params, ...patch });
    },
    [onChange, params],
  );

  const slugVal = String((params.slug as string) || "").trim();
  const methodHint = slugToMethodHint(slugVal);

  const argsObj = useMemo(() => {
    if ("arguments" in params && params.arguments !== undefined && params.arguments !== null) {
      return parseArgsObject(params.arguments);
    }
    return parseArgsObject(params.args);
  }, [params]);

  const setArgs = useCallback(
    (next: Record<string, unknown>) => {
      patchParams({ arguments: next });
    },
    [patchParams],
  );

  const setArgField = useCallback(
    (key: string, value: unknown) => {
      setArgs({ ...argsObj, [key]: value });
    },
    [argsObj, setArgs],
  );

  /** When structured args exist, user can toggle JSON; when not, we must use JSON (derived). */
  const [preferRawJson, setPreferRawJson] = useState(false);
  /** Draft JSON text while invalid; avoids persisting a string into `arguments`. */
  const [argsJsonDraft, setArgsJsonDraft] = useState<string | null>(null);
  const [argsJsonError, setArgsJsonError] = useState<string | null>(null);

  const [actionSearch, setActionSearch] = useState("");
  const [actionCategory, setActionCategory] =
    useState<(typeof COMPOSIO_TOOL_CATEGORIES)[number]>("All");
  const filteredActions = useMemo(
    () => filterComposioToolCatalog(actionSearch, actionCategory),
    [actionSearch, actionCategory],
  );

  const pickAction = useCallback(
    (entry: ComposioToolCatalogEntry) => {
      patchParams({ slug: entry.slug, arguments: {} });
      setActionSearch("");
      setPreferRawJson(false);
    },
    [patchParams, setActionSearch, setPreferRawJson],
  );

  const formKind = methodHint ? argsFormKind(methodHint) : "none";
  const structuredAvailable = Boolean(methodHint) && hasStructuredForm(methodHint);

  const useRawJson = !structuredAvailable || preferRawJson;

  const argsFingerprint = useMemo(
    () => JSON.stringify([params.arguments, params.args]),
    [params.arguments, params.args],
  );
  const [prevArgsFingerprint, setPrevArgsFingerprint] = useState(argsFingerprint);
  if (argsFingerprint !== prevArgsFingerprint) {
    setPrevArgsFingerprint(argsFingerprint);
    setArgsJsonDraft(null);
    setArgsJsonError(null);
  }

  const argsString = useMemo(() => stringifyJson(argsObj), [argsObj]);

  const showForm = structuredAvailable && !useRawJson && formKind !== "json" && formKind !== "none";

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
                key={`fb-items-${slugVal || "default"}`}
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
              This tool runs without parameters. Use{" "}
              <span className="font-medium text-[#150A35]">Edit as JSON</span> if you need optional
              or advanced fields.
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
        const restKey = slugVal || "google-rest";
        return (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-echo-text-muted">
              Call any Google API on a{" "}
              <code className="rounded bg-white/80 px-1">*.googleapis.com</code> host. Match OAuth
              scopes you granted in Composio / Google Cloud to the API you use.
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
                    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
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
                    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
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
              value={argsObj.limit != null && argsObj.limit !== "" ? String(argsObj.limit) : ""}
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
                argsObj.per_page != null && argsObj.per_page !== "" ? String(argsObj.per_page) : ""
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
                Google Drive <code className="rounded bg-white/80 px-0.5">fields</code> mask; leave
                empty for the default.
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const argumentsText = useMemo(() => {
    const a = params.arguments;
    if (a !== undefined && a !== null) {
      return typeof a === "string" ? a : stringifyJson(a);
    }
    return argsString;
  }, [params.arguments, argsString]);

  const jsonEditorValue = argsJsonDraft ?? argumentsText;

  return (
    <div className="space-y-4 rounded-lg border border-[#A577FF]/15 bg-[#F5F7FC]/50 p-3">
      <div className="space-y-2 rounded-md border border-[#21C4DD]/25 bg-white/70 px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[#21C4DD]">Composio</p>

        <div className="space-y-2 rounded-md border border-[#A577FF]/12 bg-white/80 px-2 py-2">
          <Label className="text-xs text-[#150A35]">Find an action</Label>
          <p className="text-[10px] leading-relaxed text-echo-text-muted">
            Search by what you want to do (like Zapier). Picking an action fills the tool slug
            below; you can still paste any slug from the Composio dashboard.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COMPOSIO_TOOL_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActionCategory(c)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                  actionCategory === c
                    ? "border-[#21C4DD] bg-[#21C4DD]/10 text-[#0d6f7d]"
                    : "border-[#A577FF]/20 bg-white text-echo-text-muted hover:border-[#A577FF]/40",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <Input
            value={actionSearch}
            onChange={(e) => setActionSearch(e.target.value)}
            placeholder="e.g. send slack message, list repos, calendar…"
            className={cn("h-9 text-sm", fieldClass)}
          />
          <div
            className="max-h-40 overflow-y-auto rounded-md border border-[#A577FF]/15 bg-[#F5F7FC]/40"
            role="listbox"
            aria-label="Composio actions"
          >
            {filteredActions.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-echo-text-muted">
                No matches. Try another search or type a slug manually.
              </p>
            ) : (
              filteredActions.map((entry) => (
                <button
                  key={entry.slug}
                  type="button"
                  role="option"
                  aria-selected={slugVal === entry.slug}
                  onClick={() => pickAction(entry)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 border-b border-[#A577FF]/10 px-2.5 py-2 text-left last:border-b-0",
                    "hover:bg-[#A577FF]/8",
                    slugVal === entry.slug && "bg-[#21C4DD]/10",
                  )}
                >
                  <span className="text-xs font-medium text-[#150A35]">{entry.title}</span>
                  <span className="text-[10px] text-echo-text-muted">{entry.description}</span>
                  <span className="font-mono text-[10px] text-[#21C4DD]/90">{entry.slug}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wf-api-composio-slug" className="text-xs text-[#150A35]">
            Tool slug
          </Label>
          <Input
            id="wf-api-composio-slug"
            value={slugVal}
            onChange={(e) => patchParams({ slug: e.target.value.trim(), arguments: {} })}
            placeholder="e.g. SLACK_SEND_MESSAGE"
            className={cn("h-9 font-mono text-xs", fieldClass)}
          />
          <p className="text-[10px] leading-relaxed text-echo-text-muted">
            Required. Echo runs this Composio tool with your Firebase uid. Connect the right app
            under Integrations first. Structured argument fields appear when we recognize the slug.
          </p>
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
                onClick={() => setPreferRawJson((v) => !v)}
                className="text-[11px] font-medium text-[#A577FF] underline-offset-2 hover:underline"
              >
                {useRawJson ? "Use form fields" : "Edit as JSON"}
              </button>
            )}
          </div>

          {showForm ? (
            renderStructuredArgs()
          ) : (
            <Textarea
              id="wf-api-args-json"
              value={jsonEditorValue}
              onChange={(e) => {
                const full = e.target.value;
                setArgsJsonDraft(full);
                const trimmed = full.trim();
                if (!trimmed) {
                  setArgsJsonError(null);
                  setArgsJsonDraft(null);
                  patchParams({ arguments: {} });
                  return;
                }
                try {
                  patchParams({ arguments: JSON.parse(trimmed) as Record<string, unknown> });
                  setArgsJsonError(null);
                  setArgsJsonDraft(null);
                } catch {
                  setArgsJsonError("Invalid JSON — fix to save.");
                }
              }}
              placeholder='{"channel": "C…", "text": "Hello"}'
              rows={8}
              className={cn("min-h-[120px] font-mono text-xs", fieldClass)}
            />
          )}
          {argsJsonError ? (
            <p className="text-[11px] font-medium text-[#ef4444]" role="alert">
              {argsJsonError}
            </p>
          ) : null}

          <p className="text-[11px] leading-snug text-echo-text-muted">
            {useRawJson || !structuredAvailable
              ? "Pass the JSON payload the Composio tool expects. For Google generic REST tools, use verb, url, and optional params, json, timeout_seconds."
              : "Values are stored under arguments. Use Edit as JSON for uncommon keys."}
          </p>
        </div>
      </div>
    </div>
  );
}
