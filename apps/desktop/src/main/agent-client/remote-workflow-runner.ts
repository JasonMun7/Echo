/**
 * Remote workflow runner — main-process **client** for the Echo Prism agent service (Python app in repo `agent/`, route `GET /api/agent/run` WebSocket).
 * Sends screenshots and step payloads; receives actions; executes locally via NutJS/Playwright. Inference runs on the server, not in Electron.
 */
import type { Step, WorkflowType } from "@echo/types";
import { shell } from "electron";
import WebSocket from "ws";
/** Determinism rules mirror Python `is_deterministic` in `echo_prism_agent/execution/operator.py`. */
import { isDeterministic, mergeTypeTextAtWorkflowLiteral } from "./direct-executor";
import * as operator from "../operators/unified-operator";
import type { OperatorResult } from "../operators/unified-operator";
import { interpolateSteps } from "./step-placeholders";
import { waitIfPaused, isCancelRequested, clearCancel } from "../run-control";
import {
  abandonHitlResume,
  clearPendingIntegrationAuth,
  clearUserHitlWait,
  setPendingIntegrationAuth,
  waitForUserHitlResume,
} from "../hitl-coordinator";

export type { Step };

/** Active WebSocket ref — closed by abortActiveRun when user cancels */
let activeWs: WebSocket | null = null;

/** Max retries per step: reobserve → think → act → verify. No calluser; agent drives retries. */
const MAX_STEP_ATTEMPTS = 30;

export function abortActiveRun(): void {
  if (activeWs && activeWs.readyState === 1) {
    try {
      activeWs.close(1000, "Run cancelled by user");
    } catch {
      /* ignore */
    }
    activeWs = null;
  }
}

export interface RunWorkflowRemoteOptions {
  sourceId?: string;
  workflowType?: WorkflowType;
  workflowId?: string;
  runId?: string;
  token?: string;
  backendUrl?: string;
  agentWsUrl?: string;
  onProgress?: (
    message: string,
    stepNum?: number,
    thought?: string,
    action?: string,
  ) => void;
  /** Incremental VLM text (OpenRouter streaming) for Run HUD */
  onThinkingDelta?: (delta: string, stepNum: number) => void;
  onAwaitingUser?: (reason: string) => void;
  /** Human-in-the-loop: integration auth, future approval gates */
  onHitl?: (evt: {
    kind: string;
    payload: Record<string, unknown>;
    step: number;
  }) => void;
  /** Clear HITL UI in the HUD (after wait ends or on cancel). */
  onHitlClear?: () => void;
  /** For goal-only (ad-hoc) runs: single instruction, no pre-defined steps */
  goal?: string;
  /** Replace `{{var}}` in step context/params before sending to the agent */
  variableValues?: Record<string, string>;
  /** Overrides synthesised placeholder text in the agent instruction (ambiguous steps only) */
  typingOverride?: string;
}

async function pollRunSignals(opts: RunWorkflowRemoteOptions): Promise<{
  redirectInstruction: string | null;
  calluserFeedback: string | null;
  cancelRequested: boolean;
}> {
  if (!opts.workflowId || !opts.runId || !opts.backendUrl) {
    return {
      redirectInstruction: null,
      calluserFeedback: null,
      cancelRequested: false,
    };
  }
  try {
    if (isCancelRequested()) {
      return {
        redirectInstruction: null,
        calluserFeedback: null,
        cancelRequested: true,
      };
    }
    const res = await fetch(
      `${opts.backendUrl}/api/run/${opts.workflowId}/${opts.runId}/poll-signals`,
      {
        headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
      },
    );
    if (!res.ok)
      return {
        redirectInstruction: null,
        calluserFeedback: null,
        cancelRequested: false,
      };
    const data = (await res.json()) as {
      redirect_instruction?: string | null;
      calluser_feedback?: string | null;
      cancel_requested?: boolean;
    };
    return {
      redirectInstruction: data.redirect_instruction ?? null,
      calluserFeedback: data.calluser_feedback ?? null,
      cancelRequested: data.cancel_requested ?? false,
    };
  } catch (e) {
    console.warn("[remote-workflow-runner] pollRunSignals failed:", e);
    return {
      redirectInstruction: null,
      calluserFeedback: null,
      cancelRequested: false,
    };
  }
}

function normIntegrationId(id: string): string {
  return id.trim().toLowerCase();
}

type IntegrationsSnapshot = {
  integrations?: Array<{ id: string; connected?: boolean }>;
  auth0_linked?: boolean;
};

async function fetchIntegrationsSnapshot(
  opts: RunWorkflowRemoteOptions,
): Promise<IntegrationsSnapshot | null> {
  const base = opts.backendUrl;
  const token = opts.token;
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/api/integrations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as IntegrationsSnapshot;
  } catch (e) {
    console.warn("[remote-workflow-runner] fetchIntegrationsSnapshot:", e);
    return null;
  }
}

/** Opens Auth0 Universal Login: link Echo to Auth0, or connect a federated integration (Token Vault). */
export async function openAuth0ConnectForIntegration(
  opts: RunWorkflowRemoteOptions,
  integration: string,
  auth0Linked: boolean,
): Promise<void> {
  const base = opts.backendUrl;
  const token = opts.token;
  if (!base || !token) return;
  const linkConn = (process.env.VITE_AUTH0_LINK_CONNECTION || "").trim();
  const linkPath =
    linkConn.length > 0
      ? `/api/auth0/link-url?connection=${encodeURIComponent(linkConn)}`
      : "/api/auth0/link-url";
  const path = auth0Linked
    ? `/api/auth0/vault-url?integration=${encodeURIComponent(integration)}`
    : linkPath;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn(
        "[remote-workflow-runner] auth0 connect URL failed:",
        res.status,
        await res.text(),
      );
      return;
    }
    const data = (await res.json()) as { auth_url?: string };
    const url = data.auth_url;
    if (url) {
      await shell.openExternal(url);
    }
  } catch (e) {
    console.warn("[remote-workflow-runner] openAuth0ConnectForIntegration:", e);
  }
}

/** Poll interval while waiting for Integrations UI (HITL). Keep >1s to avoid log/API spam. */
const INTEGRATIONS_POLL_MS = 3000;

function integrationConnectedFromSnapshot(
  snap: IntegrationsSnapshot | null,
  integrationId: string,
): boolean {
  const want = normIntegrationId(integrationId);
  const row = snap?.integrations?.find(
    (i) => normIntegrationId(i.id) === want,
  );
  return Boolean(row?.connected);
}

/** Poll GET /api/integrations until the given integration shows connected (Token Vault / Firestore). */
async function waitUntilIntegrationConnected(
  opts: RunWorkflowRemoteOptions,
  integrationId: string,
  timeoutMs: number,
): Promise<boolean> {
  const base = opts.backendUrl;
  const token = opts.token;
  const want = normIntegrationId(integrationId);
  if (!base || !token || !want) return false;
  const deadline = Date.now() + timeoutMs;
  let first = true;
  while (Date.now() < deadline) {
    if (isCancelRequested()) {
      throw new Error("Run cancelled");
    }
    try {
      const res = await fetch(`${base}/api/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, first ? 0 : INTEGRATIONS_POLL_MS));
        first = false;
        continue;
      }
      const data = (await res.json()) as {
        integrations?: Array<{ id: string; connected?: boolean }>;
      };
      const row = data.integrations?.find(
        (i) => normIntegrationId(i.id) === want,
      );
      if (row?.connected) return true;
    } catch (e) {
      console.warn("[remote-workflow-runner] waitUntilIntegrationConnected:", e);
    }
    first = false;
    await new Promise((r) => setTimeout(r, INTEGRATIONS_POLL_MS));
  }
  return false;
}

/**
 * When GET /api/integrations already shows connected (vault_connection_* in Firestore) but Token Vault
 * has no federated refresh token, `waitUntilIntegrationConnected` would return immediately. This
 * waits until the user disconnects (connected → false) and connects again (false → true).
 */
async function waitUntilIntegrationReconnectsAfterDisconnect(
  opts: RunWorkflowRemoteOptions,
  integrationId: string,
  timeoutMs: number,
): Promise<boolean> {
  const base = opts.backendUrl;
  const token = opts.token;
  const want = normIntegrationId(integrationId);
  if (!base || !token || !want) return false;
  const deadline = Date.now() + timeoutMs;
  let sawDisconnected = false;
  let first = true;
  while (Date.now() < deadline) {
    if (isCancelRequested()) {
      throw new Error("Run cancelled");
    }
    try {
      const res = await fetch(`${base}/api/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, first ? 0 : INTEGRATIONS_POLL_MS));
        first = false;
        continue;
      }
      const data = (await res.json()) as {
        integrations?: Array<{ id: string; connected?: boolean }>;
      };
      const row = data.integrations?.find(
        (i) => normIntegrationId(i.id) === want,
      );
      const connected = Boolean(row?.connected);
      if (!connected) sawDisconnected = true;
      if (sawDisconnected && connected) return true;
    } catch (e) {
      console.warn(
        "[remote-workflow-runner] waitUntilIntegrationReconnectsAfterDisconnect:",
        e,
      );
    }
    first = false;
    await new Promise((r) => setTimeout(r, INTEGRATIONS_POLL_MS));
  }
  return false;
}

async function patchRunStatus(
  opts: RunWorkflowRemoteOptions,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!opts.workflowId || !opts.runId || !opts.backendUrl) return;
  try {
    await fetch(
      `${opts.backendUrl}/api/workflows/${opts.workflowId}/runs/${opts.runId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        },
        body: JSON.stringify({ status, ...extra }),
      },
    );
  } catch (e) {
    console.warn("[remote-workflow-runner] PATCH run status failed:", e);
  }
}

function stepToBackendFormat(step: Step): Record<string, unknown> {
  return {
    action: step.action,
    params: step.params ?? {},
    context: step.context ?? "",
    expected_outcome:
      (step as unknown as Record<string, unknown>).expected_outcome ?? "",
  };
}

/** Matches agent `api_call` / `apicall` normalization — used to avoid retry loops that restart LangGraph HITL. */
function isApiCallStep(step: Step): boolean {
  const a = String(step.action ?? "").toLowerCase().replace(/_/g, "");
  return a === "apicall";
}

export async function runWorkflowRemote(
  steps: Step[],
  options?: RunWorkflowRemoteOptions,
  _db?: unknown,
): Promise<{ success: boolean; error?: string }> {
  const sourceId = options?.sourceId;
  const workflowType = options?.workflowType ?? "desktop";
  const onProgress = options?.onProgress ?? (() => {});

  if (!sourceId)
    return { success: false, error: "sourceId required for screen capture" };
  if (!options?.backendUrl)
    return { success: false, error: "backendUrl required" };
  if (!options?.token)
    return { success: false, error: "token required for WebSocket auth" };

  let workingSteps = interpolateSteps(steps, options?.variableValues ?? {});

  const agentBase = (options.agentWsUrl ?? options.backendUrl).replace(
    /^http/,
    "ws",
  );
  const wsUrl = `${agentBase}/api/agent/run?token=${encodeURIComponent(options.token)}`;

  const backendSteps = workingSteps.map((s) => stepToBackendFormat(s));

  // Reset Playwright singleton between runs. LangGraph does not auto-close the browser; without
  // this, a second run of a browser workflow reuses a stale page (wrong URL/focus). Desktop runs
  // already needed this; browser workflows need it too.
  await operator.closeBrowser();

  try {
    const ws = new WebSocket(wsUrl);
    activeWs = ws;

    const send = (msg: object) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    };

    const receive = (): Promise<object> =>
      new Promise((resolve, reject) => {
        const onMessage = (data: Buffer | Buffer[] | string) => {
          ws.off("message", onMessage);
          ws.off("error", onError);
          ws.off("close", onClose);
          try {
            const text = Buffer.isBuffer(data)
              ? data.toString("utf-8")
              : String(data);
            resolve(JSON.parse(text) as object);
          } catch {
            reject(new Error("Invalid JSON from agent"));
          }
        };
        const onError = () => {
          ws.off("message", onMessage);
          ws.off("error", onError);
          ws.off("close", onClose);
          reject(new Error("WebSocket error"));
        };
        const onClose = () => {
          ws.off("message", onMessage);
          ws.off("error", onError);
          ws.off("close", onClose);
          reject(new Error("WebSocket closed"));
        };
        ws.once("message", onMessage);
        ws.once("error", onError);
        ws.once("close", onClose);
      });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", () => reject(new Error("WebSocket connection failed")));
    });

    send({
      type: "start",
      workflow_id: options.workflowId ?? "",
      run_id: options.runId ?? "",
      workflow_type: workflowType,
      steps: backendSteps,
    });

    let msg = await receive();
    if ((msg as { type?: string }).type === "error") {
      const err = (msg as { message?: string }).message ?? "Agent error";
      await patchRunStatus(options ?? {}, "failed", { error: err });
      return { success: false, error: err };
    }
    if ((msg as { type?: string }).type !== "ready") {
      await patchRunStatus(options ?? {}, "failed", {
        error: "Unexpected agent response",
      });
      return { success: false, error: "Unexpected agent response" };
    }

    /** Applies a redirect instruction to the current step and all remaining ones. */
    const applyRedirect = (fromIndex: number, instruction: string) => {
      onProgress(
        `[Voice redirect] Applying instruction to steps ${fromIndex + 1}–${workingSteps.length}: ${instruction}`,
        fromIndex + 1,
        `Voice redirect: ${instruction}`,
        "redirect",
      );
      for (let j = fromIndex; j < workingSteps.length; j++) {
        workingSteps[j] = {
          ...workingSteps[j],
          context: `[USER OVERRIDE — follow this instead]: ${instruction}\n\n[Original context]: ${String(workingSteps[j].context ?? "")}`,
        } as Step;
      }
    };

    for (let i = 0; i < workingSteps.length; i++) {
      if (isCancelRequested()) {
        onProgress("Run cancelled by user", i + 1, undefined, "cancel");
        await patchRunStatus(options ?? {}, "cancelled");
        return { success: false, error: "Run cancelled by user" };
      }
      await waitIfPaused();
      if (isCancelRequested()) {
        onProgress("Run cancelled by user", i + 1, undefined, "cancel");
        await patchRunStatus(options ?? {}, "cancelled");
        return { success: false, error: "Run cancelled by user" };
      }

      // Poll for redirect / cancel signals at every step boundary (not just i > 0)
      if (options) {
        const signals = await pollRunSignals(options);
        if (signals.cancelRequested) {
          onProgress("Run cancelled by user", i + 1, undefined, "cancel");
          await patchRunStatus(options, "cancelled");
          return { success: false, error: "Run cancelled by user" };
        }
        const instruction =
          signals.redirectInstruction ?? signals.calluserFeedback;
        if (instruction) {
          applyRedirect(i, instruction);
        }
      }

      // Use `let` so we can refresh the reference after applyRedirect replaces workingSteps[i]
      let step = workingSteps[i];
      const stepNum = i + 1;
      const total = workingSteps.length;

      {
        const ctx = String(step.context ?? "").trim();
        const stepLabel = ctx
          ? `Step ${stepNum}/${total}: ${step.action} — ${ctx}`
          : `Step ${stepNum}/${total}: ${step.action}`;
        onProgress(stepLabel, stepNum, undefined, String(step.action));
      }

      const deterministic = isDeterministic(step);

      let lastError = "";
      let stepSucceeded = false;
      let screenshotB64: string | undefined;

      for (let attempt = 0; attempt < MAX_STEP_ATTEMPTS; attempt++) {
        /** Only open the system browser once per step attempt while the agent re-interrupts for OAuth. */
        let oauthOpenedThisStall = false;
        // Between retry attempts: respect pause and pick up any redirect that arrived
        // while the voice overlay was open. This also prevents screenshots from being
        // taken while the voice interruption overlay is visible on screen.
        if (attempt > 0) {
          if (isCancelRequested()) break;
          await waitIfPaused();
          if (isCancelRequested()) break;
          // Re-observe: brief settle so UI state is current, then we'll capture a fresh screenshot below
          await new Promise((r) => setTimeout(r, 200));
          if (options) {
            const midSignals = await pollRunSignals(options);
            if (midSignals.cancelRequested) {
              lastError = "cancelled";
              break;
            }
            const midInstruction =
              midSignals.redirectInstruction ?? midSignals.calluserFeedback;
            if (midInstruction) {
              applyRedirect(i, midInstruction);
              // Refresh local reference — applyRedirect replaces the workingSteps[i] object
              step = workingSteps[i];
            }
          }
        }

        const expectedOutcome =
          ((step as unknown as Record<string, unknown>).expected_outcome as
            | string
            | undefined) ?? "";

        const typingOverride =
          !deterministic && options?.typingOverride?.trim()
            ? { typing_override: options.typingOverride.trim() }
            : {};

        if (deterministic) {
          send({
            type: "step",
            step_index: i,
            step: stepToBackendFormat(step),
            history_summary: "",
          });
        } else {
          try {
            const cap = await operator.captureScreen(sourceId);
            screenshotB64 = cap.buffer.toString("base64");
            send({
              type: "step",
              step_index: i,
              step: stepToBackendFormat(step),
              screenshot_b64: screenshotB64,
              capture_width: cap.width,
              capture_height: cap.height,
              history_summary: "",
              last_error: lastError || undefined,
              ...typingOverride,
            });
          } catch (e) {
            lastError = `Screenshot capture failed: ${e}`;
            break;
          }
        }

        msg = await receive();
        // Streamed VLM tokens + optional full thought messages before action/error
        for (;;) {
          const t = (msg as { type?: string }).type;
          if (t === "thinking_delta") {
            const delta = (msg as { delta?: string }).delta ?? "";
            if (delta) options?.onThinkingDelta?.(delta, stepNum);
            msg = await receive();
            continue;
          }
          if (t === "thinking") {
            const th = (msg as { thought?: string }).thought ?? "";
            onProgress(th, stepNum, th);
            msg = await receive();
            continue;
          }
          break;
        }

        type WsActionMsg = {
          type?: string;
          thought?: string;
          signal?: string;
          action?: Record<string, unknown>;
          action_str?: string;
          message?: string;
          reason?: string;
          payload?: Record<string, unknown>;
        };
        let m = msg as WsActionMsg;
        for (;;) {
          if (!(m.type === "action" && m.signal === "interrupt")) break;
          const intPayload = m.payload ?? {};
          const kind = intPayload.kind as string | undefined;
          let resumePayload: unknown = true;

          if (kind === "api_call_approval" && options) {
            onProgress(
              String(
                intPayload.message ??
                  "Approve or reject this API call in the panel.",
              ),
              stepNum,
              undefined,
              "interrupt",
            );
            options.onHitl?.({
              kind: "api_call_approval",
              payload: intPayload,
              step: stepNum,
            });
            try {
              resumePayload = await waitForUserHitlResume();
            } finally {
              options.onHitlClear?.();
            }
            if (isCancelRequested()) {
              throw new Error("Run cancelled");
            }
          } else if (kind === "integration_auth" && options) {
            const integration = String(intPayload.integration ?? "");
            const snap = await fetchIntegrationsSnapshot(options);
            const auth0LinkedEffective =
              Boolean(snap?.auth0_linked) || Boolean(intPayload.auth0_linked);
            const alreadyConnected = integrationConnectedFromSnapshot(
              snap,
              integration,
            );
            // GET /api/integrations "connected" can be true from vault_* flags while Token Vault
            // exchange still fails — do not poll until "connected" in that case; it returns true
            // immediately. Wait for disconnect → reconnect or user Continue.

            if (!oauthOpenedThisStall) {
              await openAuth0ConnectForIntegration(
                options,
                integration,
                auth0LinkedEffective,
              );
              oauthOpenedThisStall = true;
            }
            setPendingIntegrationAuth({
              backendUrl: options.backendUrl,
              token: options.token,
              integration,
              auth0Linked: auth0LinkedEffective,
            });
            onProgress(
              alreadyConnected
                ? "Echo shows this app as connected, but sign-in data is missing. Open Integrations, disconnect this app, connect again in the browser, then tap Continue."
                : String(
                    intPayload.message ??
                      "Complete sign-in in the browser, then tap Continue in EchoPrism.",
                  ),
              stepNum,
              undefined,
              "interrupt",
            );
            options.onHitl?.({
              kind: "integration_auth",
              payload: {
                ...intPayload,
                auth0_linked: auth0LinkedEffective,
              },
              step: stepNum,
            });
            try {
              const waitPoll = alreadyConnected
                ? waitUntilIntegrationReconnectsAfterDisconnect(
                    options,
                    integration,
                    300_000,
                  )
                : waitUntilIntegrationConnected(
                    options,
                    integration,
                    300_000,
                  );
              await Promise.race([waitPoll, waitForUserHitlResume()]);
            } finally {
              clearPendingIntegrationAuth();
              options.onHitlClear?.();
              abandonHitlResume();
            }
            if (isCancelRequested()) {
              throw new Error("Run cancelled");
            }
            resumePayload = true;
          }

          send({ type: "resume", resume: resumePayload });
          msg = await receive();
          for (;;) {
            const t = (msg as { type?: string }).type;
            if (t === "thinking_delta") {
              const delta = (msg as { delta?: string }).delta ?? "";
              if (delta) options?.onThinkingDelta?.(delta, stepNum);
              msg = await receive();
              continue;
            }
            if (t === "thinking") {
              const th = (msg as { thought?: string }).thought ?? "";
              onProgress(th, stepNum, th);
              msg = await receive();
              continue;
            }
            break;
          }
          m = msg as WsActionMsg;
        }

        if (m.type === "error") {
          lastError = m.message ?? "Agent error";
          // Retrying api_call by re-sending `step` creates a new LangGraph thread and shows approval again.
          if (deterministic && isApiCallStep(step)) {
            break;
          }
          if (attempt < MAX_STEP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        if (m.type === "action") {
          const signal = m.signal;
          const thought = m.thought ?? "";

          if (signal === "step_done") {
            onProgress(
              thought || `Step ${stepNum} complete`,
              stepNum,
              thought || undefined,
              "step_done",
            );
            stepSucceeded = true;
            break;
          }

          if (signal === "finished") {
            onProgress(
              `Agent signaled Finished at step ${stepNum}. Thought: ${thought}`,
              stepNum,
              thought,
              "finished",
            );
            await patchRunStatus(options ?? {}, "completed");
            return { success: true };
          }

          if (signal === "calluser") {
            lastError = m.reason ?? "Agent requested user intervention";
            onProgress(`Retrying: ${lastError}`, stepNum, thought, "calluser");
            if (attempt < MAX_STEP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 500));
            continue;
          }

          if (signal === "execute" && m.action) {
            const mergedAction = mergeTypeTextAtWorkflowLiteral(
              step,
              m.action as import("@echo/types").OperatorAction,
              options?.typingOverride,
            );
            const actionStr =
              m.action_str ??
              (typeof (mergedAction as { action?: string })?.action === "string"
                ? (mergedAction as { action: string }).action
                : "");
            onProgress(thought || "Executing…", stepNum, thought, actionStr);
            const execResult: OperatorResult = await operator.execute(mergedAction);

            if (execResult === "finished") {
              onProgress(
                `Agent signaled Finished at step ${stepNum}`,
                stepNum,
                thought,
                "finished",
              );
              await patchRunStatus(options ?? {}, "completed");
              return { success: true };
            }

            if (execResult === "calluser") {
              lastError = "Operator returned calluser";
              onProgress(`Retrying: ${lastError}`, stepNum, thought, "calluser");
              if (attempt < MAX_STEP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 500));
              continue;
            }

            if (execResult === false) {
              lastError = "Operator returned false";
              if (attempt < MAX_STEP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 500));
              continue;
            }

            // OS-level actions (openapp, focusapp) are inherently reliable —
            // skip screenshot verification since the app may take time to render.
            const executedAction = (
              ((mergedAction as Record<string, unknown>)?.action as string) ?? ""
            ).toLowerCase();
            if (deterministic) {
              stepSucceeded = true;
              break;
            }

            const beforeBuf = Buffer.from(screenshotB64!, "base64");
            // Action-specific settle time: doubleclick/click may trigger slow app loads (e.g. IntelliJ opening a project)
            const settleMs = ["doubleclick", "click", "clickandtype"].includes(
              executedAction,
            )
              ? 5000
              : 1500;
            await new Promise((r) => setTimeout(r, settleMs));

            let afterBuf: Buffer;
            try {
              afterBuf = (await operator.captureScreen(sourceId)).buffer;
            } catch {
              afterBuf = beforeBuf;
            }

            send({
              type: "verify",
              before_b64: beforeBuf.toString("base64"),
              after_b64: afterBuf.toString("base64"),
              action_str: actionStr,
              expected_outcome: expectedOutcome,
            });

            msg = await receive();
            const v = msg as { type?: string; succeeded?: boolean };
            if (v.type === "verify_result" && v.succeeded) {
              stepSucceeded = true;
              break;
            }
            if (v.type === "verify_result" && !v.succeeded) {
              lastError =
                (msg as { description?: string }).description ??
                "Verification failed";
              if (attempt < MAX_STEP_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 500));
              continue;
            }
          }
        }
      }

      if (!stepSucceeded) {
        if (lastError === "cancelled" || isCancelRequested()) {
          onProgress("Run cancelled by user", stepNum, undefined, "cancel");
          await patchRunStatus(options ?? {}, "cancelled");
          return { success: false, error: "Run cancelled by user" };
        }
        const reason = lastError || `Step ${stepNum} failed`;
        onProgress(
          `Step did not complete after ${MAX_STEP_ATTEMPTS} attempts: ${reason}`,
          stepNum,
          undefined,
          "",
        );
        await patchRunStatus(options ?? {}, "failed", {
          callUserReason: reason,
        });
        return { success: false, error: reason };
      }

      onProgress(`✓ Step ${stepNum} complete`, stepNum);
      await new Promise((r) => setTimeout(r, 300));
    }

    await patchRunStatus(options ?? {}, "completed");
    return { success: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const isCancelled =
      err === "WebSocket closed" || err.includes("Run cancelled");
    await patchRunStatus(options ?? {}, isCancelled ? "cancelled" : "failed", {
      error: isCancelled ? undefined : err,
    });
    return { success: false, error: err };
  } finally {
    activeWs = null;
    clearCancel();
    clearPendingIntegrationAuth();
    clearUserHitlWait();
  }
}

/**
 * Goal-only (ad-hoc) run: single goal string, no pre-defined steps.
 * Loops capture → step(goal) → action/finished/calluser until done.
 */
export async function runGoalOnlyRemote(
  goal: string,
  options: RunWorkflowRemoteOptions,
): Promise<{ success: boolean; error?: string }> {
  const sourceId = options.sourceId;
  const workflowType = options.workflowType ?? "desktop";
  const onProgress = options.onProgress ?? (() => {});

  if (!sourceId)
    return { success: false, error: "sourceId required for screen capture" };
  if (!options.backendUrl)
    return { success: false, error: "backendUrl required" };
  if (!options.token)
    return { success: false, error: "token required for WebSocket auth" };

  const agentBase = (options.agentWsUrl ?? options.backendUrl).replace(
    /^http/,
    "ws",
  );
  const wsUrl = `${agentBase}/api/agent/run?token=${encodeURIComponent(options.token)}`;
  console.log("[runGoalOnlyRemote] connecting", {
    agentBase,
    goal: goal.slice(0, 50),
    workflowId: options.workflowId,
    runId: options.runId,
  });

  await operator.closeBrowser();

  try {
    const ws = new WebSocket(wsUrl);
    activeWs = ws;

    const send = (msg: object) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    };

    const receive = (): Promise<object> =>
      new Promise((resolve, reject) => {
        const onMessage = (data: Buffer | Buffer[] | string) => {
          ws.off("message", onMessage);
          ws.off("error", onError);
          ws.off("close", onClose);
          try {
            const text = Buffer.isBuffer(data)
              ? data.toString("utf-8")
              : String(data);
            resolve(JSON.parse(text) as object);
          } catch {
            reject(new Error("Invalid JSON from agent"));
          }
        };
        const onError = () => {
          ws.off("message", onMessage);
          ws.off("error", onError);
          ws.off("close", onClose);
          reject(new Error("WebSocket error"));
        };
        const onClose = () => {
          ws.off("message", onMessage);
          ws.off("error", onError);
          ws.off("close", onClose);
          reject(new Error("WebSocket closed"));
        };
        ws.once("message", onMessage);
        ws.once("error", onError);
        ws.once("close", onClose);
      });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", () => reject(new Error("WebSocket connection failed")));
    });

    send({
      type: "start",
      workflow_id: options.workflowId ?? "",
      run_id: options.runId ?? "",
      workflow_type: workflowType,
      steps: [],
      goal,
    });
    console.log("[runGoalOnlyRemote] sent start, waiting for ready");

    let msg = await receive();
    if ((msg as { type?: string }).type === "error") {
      const err = (msg as { message?: string }).message ?? "Agent error";
      await patchRunStatus(options, "failed", { error: err });
      return { success: false, error: err };
    }
    if ((msg as { type?: string }).type !== "ready") {
      console.warn(
        "[runGoalOnlyRemote] unexpected response",
        (msg as { type?: string }).type,
      );
      await patchRunStatus(options, "failed", {
        error: "Unexpected agent response",
      });
      return { success: false, error: "Unexpected agent response" };
    }
    console.log("[runGoalOnlyRemote] ready, starting capture loop");

    let iteration = 0;
    let lastError = "";

    while (true) {
      let oauthOpenedThisStall = false;
      if (isCancelRequested()) {
        onProgress("Run cancelled by user", undefined, undefined, "cancel");
        await patchRunStatus(options, "cancelled");
        return { success: false, error: "Run cancelled by user" };
      }
      await waitIfPaused();
      if (isCancelRequested()) {
        await patchRunStatus(options, "cancelled");
        return { success: false, error: "Run cancelled by user" };
      }

      const signals = await pollRunSignals(options);
      if (signals.cancelRequested) {
        await patchRunStatus(options, "cancelled");
        return { success: false, error: "Run cancelled by user" };
      }

      // On retry, brief settle so UI state is current before re-observing
      if (lastError) await new Promise((r) => setTimeout(r, 200));

      let screenshotB64: string;
      let captureW: number | undefined;
      let captureH: number | undefined;
      try {
        const cap = await operator.captureScreen(sourceId, {
          maxDimension: 1280,
        });
        screenshotB64 = cap.buffer.toString("base64");
        captureW = cap.width;
        captureH = cap.height;
      } catch (e) {
        lastError = `Screenshot capture failed: ${e}`;
        await patchRunStatus(options, "failed", { error: lastError });
        return { success: false, error: lastError };
      }

      send({
        type: "step",
        step_index: iteration,
        step: {},
        screenshot_b64: screenshotB64,
        capture_width: captureW,
        capture_height: captureH,
        history_summary: "",
        last_error: lastError || undefined,
      });

      msg = await receive();
      const stepNumGoal = iteration + 1;
      for (;;) {
        const t = (msg as { type?: string }).type;
        if (t === "thinking_delta") {
          const delta = (msg as { delta?: string }).delta ?? "";
          if (delta) options?.onThinkingDelta?.(delta, stepNumGoal);
          msg = await receive();
          continue;
        }
        if (t === "thinking") {
          const th = (msg as { thought?: string }).thought ?? "";
          onProgress(th, stepNumGoal, th);
          msg = await receive();
          continue;
        }
        break;
      }

      type WsGoalMsg = {
        type?: string;
        thought?: string;
        signal?: string;
        action?: Record<string, unknown>;
        action_str?: string;
        message?: string;
        reason?: string;
        payload?: Record<string, unknown>;
      };
      let m = msg as WsGoalMsg;
      for (;;) {
        if (!(m.type === "action" && m.signal === "interrupt")) break;
        const intPayload = m.payload ?? {};
        const kind = intPayload.kind as string | undefined;
        let resumePayload: unknown = true;

        if (kind === "api_call_approval") {
          onProgress(
            String(
              intPayload.message ??
                "Approve or reject this API call in the panel.",
            ),
            stepNumGoal,
            undefined,
            "interrupt",
          );
          options.onHitl?.({
            kind: "api_call_approval",
            payload: intPayload,
            step: stepNumGoal,
          });
          try {
            resumePayload = await waitForUserHitlResume();
          } finally {
            options.onHitlClear?.();
          }
          if (isCancelRequested()) {
            throw new Error("Run cancelled");
          }
        } else if (kind === "integration_auth") {
          const integration = String(intPayload.integration ?? "");
          const snap = await fetchIntegrationsSnapshot(options);
          const auth0LinkedEffective =
            Boolean(snap?.auth0_linked) || Boolean(intPayload.auth0_linked);
          const alreadyConnected = integrationConnectedFromSnapshot(
            snap,
            integration,
          );

          if (!oauthOpenedThisStall) {
            await openAuth0ConnectForIntegration(
              options,
              integration,
              auth0LinkedEffective,
            );
            oauthOpenedThisStall = true;
          }
          setPendingIntegrationAuth({
            backendUrl: options.backendUrl,
            token: options.token,
            integration,
            auth0Linked: auth0LinkedEffective,
          });
          onProgress(
            alreadyConnected
              ? "Echo shows this app as connected, but sign-in data is missing. Open Integrations, disconnect this app, connect again in the browser, then tap Continue."
              : String(
                  intPayload.message ??
                    "Complete sign-in in the browser, then tap Continue in EchoPrism.",
                ),
            stepNumGoal,
            undefined,
            "interrupt",
          );
          options.onHitl?.({
            kind: "integration_auth",
            payload: {
              ...intPayload,
              auth0_linked: auth0LinkedEffective,
            },
            step: stepNumGoal,
          });
          try {
            const waitPoll = alreadyConnected
              ? waitUntilIntegrationReconnectsAfterDisconnect(
                  options,
                  integration,
                  300_000,
                )
              : waitUntilIntegrationConnected(
                  options,
                  integration,
                  300_000,
                );
            await Promise.race([waitPoll, waitForUserHitlResume()]);
          } finally {
            clearPendingIntegrationAuth();
            options.onHitlClear?.();
            abandonHitlResume();
          }
          if (isCancelRequested()) {
            throw new Error("Run cancelled");
          }
          resumePayload = true;
        }

        send({ type: "resume", resume: resumePayload });
        msg = await receive();
        for (;;) {
          const t = (msg as { type?: string }).type;
          if (t === "thinking_delta") {
            const delta = (msg as { delta?: string }).delta ?? "";
            if (delta) options?.onThinkingDelta?.(delta, stepNumGoal);
            msg = await receive();
            continue;
          }
          if (t === "thinking") {
            const th = (msg as { thought?: string }).thought ?? "";
            onProgress(th, stepNumGoal, th);
            msg = await receive();
            continue;
          }
          break;
        }
        m = msg as WsGoalMsg;
      }

      if (m.type === "error") {
        lastError = m.message ?? "Agent error";
        onProgress(`Error: ${lastError}`, iteration + 1);
        continue;
      }
      if (m.type === "action") {
        const thought = m.thought ?? "";
        if (m.signal === "finished") {
          onProgress(`Done. ${thought}`, iteration + 1, thought, "finished");
          await patchRunStatus(options, "completed");
          return { success: true };
        }
        if (m.signal === "calluser") {
          lastError = m.reason ?? "Agent requested user intervention";
          onProgress(`Retrying: ${lastError}`, iteration + 1, thought, "calluser");
          continue;
        }
        if (m.signal === "execute" && m.action) {
          const actionStr =
            m.action_str ??
            (typeof (m.action as { action?: string })?.action === "string"
              ? (m.action as { action: string }).action
              : "");
          onProgress(
            thought || "Executing…",
            iteration + 1,
            thought,
            actionStr,
          );
          const execResult: OperatorResult = await operator.execute(
            m.action as import("@echo/types").OperatorAction,
          );
          if (execResult === "finished") {
            onProgress(`Done. ${thought}`, iteration + 1, thought, "finished");
            await patchRunStatus(options, "completed");
            return { success: true };
          }
          if (execResult === "calluser") {
            lastError = "Operator returned calluser";
            onProgress(`Retrying: ${lastError}`, iteration + 1, thought, "calluser");
            continue;
          }
          if (execResult === false) {
            lastError = "Operator returned false";
            iteration++;
            continue;
          }

          const executedAction = (
            ((m.action as Record<string, unknown>)?.action as string) ?? ""
          ).toLowerCase();
          const skipVerify = ["presskey", "hotkey", "wait"].includes(
            executedAction,
          );
          if (skipVerify) {
            lastError = "";
            iteration++;
            onProgress(`✓ Step ${iteration}`, iteration);
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          const beforeBuf = Buffer.from(screenshotB64, "base64");
          const settleMs = ["doubleclick", "click", "clickandtype"].includes(
            executedAction,
          )
            ? 5000
            : 1500;
          await new Promise((r) => setTimeout(r, settleMs));

          let afterBuf: Buffer;
          try {
            afterBuf = (await operator.captureScreen(sourceId)).buffer;
          } catch {
            afterBuf = beforeBuf;
          }

          send({
            type: "verify",
            before_b64: beforeBuf.toString("base64"),
            after_b64: afterBuf.toString("base64"),
            action_str: m.action_str ?? "",
            expected_outcome: goal,
          });

          msg = await receive();
          const v = msg as {
            type?: string;
            succeeded?: boolean;
            description?: string;
          };
          if (v.type === "verify_result" && v.succeeded) {
            lastError = "";
            iteration++;
            onProgress(`✓ Step ${iteration}`, iteration);
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          if (v.type === "verify_result" && !v.succeeded) {
            lastError = v.description ?? "Verification failed";
            iteration++;
            continue;
          }
        }
      }
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const isCancelled =
      err === "WebSocket closed" || err.includes("Run cancelled");
    await patchRunStatus(options, isCancelled ? "cancelled" : "failed", {
      error: isCancelled ? undefined : err,
    });
    return { success: false, error: err };
  } finally {
    activeWs = null;
    clearCancel();
    clearPendingIntegrationAuth();
    clearUserHitlWait();
  }
}
