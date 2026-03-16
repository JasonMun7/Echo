/**
 * Remote workflow runner — WebSocket client for EchoPrism Alpha.
 * Connects to backend WS /api/agent/run; sends screenshots, receives actions; executes via NutJS/Playwright.
 * No local agent logic — backend does all inference.
 */
import type { Step, WorkflowType } from "@echo/types";
import WebSocket from "ws";
import { isDeterministic } from "./direct-executor";
import * as operator from "../operators/unified-operator";
import type { OperatorResult } from "../operators/unified-operator";
import {
  waitIfPaused,
  isCancelRequested,
  clearCancel,
} from "../run-control";

export type { Step };

/** Active WebSocket ref — closed by abortActiveRun when user cancels */
let activeWs: WebSocket | null = null;

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
  onProgress?: (message: string, stepNum?: number, thought?: string, action?: string) => void;
  onAwaitingUser?: (reason: string) => void;
  /** For goal-only (ad-hoc) runs: single instruction, no pre-defined steps */
  goal?: string;
}

async function pollRunSignals(opts: RunWorkflowRemoteOptions): Promise<{
  redirectInstruction: string | null;
  calluserFeedback: string | null;
  cancelRequested: boolean;
}> {
  if (!opts.workflowId || !opts.runId || !opts.backendUrl) {
    return { redirectInstruction: null, calluserFeedback: null, cancelRequested: false };
  }
  try {
    if (isCancelRequested()) {
      return { redirectInstruction: null, calluserFeedback: null, cancelRequested: true };
    }
    const res = await fetch(
      `${opts.backendUrl}/api/run/${opts.workflowId}/${opts.runId}/poll-signals`,
      {
        headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : {},
      }
    );
    if (!res.ok) return { redirectInstruction: null, calluserFeedback: null, cancelRequested: false };
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
    return { redirectInstruction: null, calluserFeedback: null, cancelRequested: false };
  }
}

async function patchRunStatus(
  opts: RunWorkflowRemoteOptions,
  status: string,
  extra: Record<string, unknown> = {}
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
      }
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
    expected_outcome: (step as unknown as Record<string, unknown>).expected_outcome ?? "",
  };
}

export async function runWorkflowRemote(
  steps: Step[],
  options?: RunWorkflowRemoteOptions,
  _db?: unknown
): Promise<{ success: boolean; error?: string }> {
  const sourceId = options?.sourceId;
  const workflowType = options?.workflowType ?? "desktop";
  const onProgress = options?.onProgress ?? (() => {});

  if (!sourceId) return { success: false, error: "sourceId required for screen capture" };
  if (!options?.backendUrl) return { success: false, error: "backendUrl required" };
  if (!options?.token) return { success: false, error: "token required for WebSocket auth" };

  const agentBase = (options.agentWsUrl ?? options.backendUrl).replace(/^http/, "ws");
  const wsUrl = `${agentBase}/api/agent/run?token=${encodeURIComponent(options.token)}`;

  const backendSteps = steps.map((s) => stepToBackendFormat(s));

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
            const text = Buffer.isBuffer(data) ? data.toString("utf-8") : String(data);
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
      await patchRunStatus(options ?? {}, "failed", { error: "Unexpected agent response" });
      return { success: false, error: "Unexpected agent response" };
    }

    /** Applies a redirect instruction to the current step and all remaining ones. */
    const applyRedirect = (fromIndex: number, instruction: string) => {
      onProgress(
        `[Voice redirect] Applying instruction to steps ${fromIndex + 1}–${steps.length}: ${instruction}`,
        fromIndex + 1,
        `Voice redirect: ${instruction}`,
        "redirect",
      );
      for (let j = fromIndex; j < steps.length; j++) {
        steps[j] = {
          ...steps[j],
          context: `[USER OVERRIDE — follow this instead]: ${instruction}\n\n[Original context]: ${String(steps[j].context ?? "")}`,
        } as Step;
      }
    };

    for (let i = 0; i < steps.length; i++) {
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
        const instruction = signals.redirectInstruction ?? signals.calluserFeedback;
        if (instruction) {
          applyRedirect(i, instruction);
        }
      }

      // Use `let` so we can refresh the reference after applyRedirect replaces steps[i]
      let step = steps[i];
      const stepNum = i + 1;
      const total = steps.length;

      onProgress(`Step ${stepNum}/${total}: ${step.action} — ${String(step.context).slice(0, 50)}`, stepNum, undefined, String(step.action));

      const deterministic = isDeterministic(step);

      let lastError = "";
      let stepSucceeded = false;
      let screenshotB64: string | undefined;

      for (let attempt = 0; attempt <= 3; attempt++) {
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
            if (midSignals.cancelRequested) { lastError = "cancelled"; break; }
            const midInstruction = midSignals.redirectInstruction ?? midSignals.calluserFeedback;
            if (midInstruction) {
              applyRedirect(i, midInstruction);
              // Refresh local reference — applyRedirect replaces the steps[i] object
              step = steps[i];
            }
          }
        }

        const expectedOutcome =
          (step as unknown as Record<string, unknown>).expected_outcome as string | undefined ?? "";

        if (deterministic) {
          send({
            type: "step",
            step_index: i,
            step: stepToBackendFormat(step),
            history_summary: "",
          });
        } else {
          try {
            const buf = await operator.captureScreen(sourceId);
            screenshotB64 = Buffer.from(buf).toString("base64");
          } catch (e) {
            lastError = `Screenshot capture failed: ${e}`;
            break;
          }

          send({
            type: "step",
            step_index: i,
            step: stepToBackendFormat(step),
            screenshot_b64: screenshotB64,
            history_summary: "",
            last_error: lastError || undefined,
          });
        }

        msg = await receive();

        while ((msg as { type?: string }).type === "thinking") {
          onProgress((msg as { thought?: string }).thought ?? "", stepNum, (msg as { thought?: string }).thought);
          msg = await receive();
        }

        const m = msg as { type?: string; thought?: string; signal?: string; action?: Record<string, unknown>; action_str?: string; message?: string; reason?: string };
        if (m.type === "error") {
          lastError = m.message ?? "Agent error";
          if (attempt < 3) await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        if (m.type === "thinking") {
          onProgress(m.thought ?? "", stepNum, m.thought);
          msg = await receive();
          continue;
        }

        if (m.type === "action") {
          const signal = m.signal;
          const thought = m.thought ?? "";

          if (signal === "step_done") {
            onProgress(thought || `Step ${stepNum} complete`, stepNum, thought || undefined, "step_done");
            stepSucceeded = true;
            break;
          }

          if (signal === "finished") {
            onProgress(`Agent signaled Finished at step ${stepNum}. Thought: ${thought}`, stepNum, thought, "finished");
            await patchRunStatus(options ?? {}, "completed");
            return { success: true };
          }

          if (signal === "calluser") {
            const reason = m.reason ?? "Agent requested user intervention";
            onProgress(`Step failed: ${reason}`, stepNum, thought, "calluser");
            await patchRunStatus(options ?? {}, "failed", { callUserReason: reason });
            return { success: false, error: reason };
          }

          if (signal === "execute" && m.action) {
            const actionStr = m.action_str ?? (typeof (m.action as { action?: string })?.action === "string" ? (m.action as { action: string }).action : "");
            onProgress(thought || "Executing…", stepNum, thought, actionStr);
            const execResult: OperatorResult = await operator.execute(
              m.action as import("@echo/types").OperatorAction
            );

            if (execResult === "finished") {
              onProgress(`Agent signaled Finished at step ${stepNum}`, stepNum, thought, "finished");
              await patchRunStatus(options ?? {}, "completed");
              return { success: true };
            }

            if (execResult === "calluser") {
              const reason = "Operator returned calluser";
              onProgress(`Step failed: ${reason}`, stepNum, thought, "calluser");
              await patchRunStatus(options ?? {}, "failed", { callUserReason: reason });
              return { success: false, error: reason };
            }

            if (execResult === false) {
              lastError = "Operator returned false";
              if (attempt < 3) await new Promise((r) => setTimeout(r, 500));
              continue;
            }

            // OS-level actions (openapp, focusapp) are inherently reliable —
            // skip screenshot verification since the app may take time to render.
            const executedAction = ((m.action as Record<string, unknown>)?.action as string ?? "").toLowerCase();
            if (deterministic) {
              stepSucceeded = true;
              break;
            }

            const beforeBuf = Buffer.from(screenshotB64!, "base64");
            // Action-specific settle time: doubleclick/click may trigger slow app loads (e.g. IntelliJ opening a project)
            const settleMs = ["doubleclick", "click", "clickandtype"].includes(executedAction) ? 5000 : 1500;
            await new Promise((r) => setTimeout(r, settleMs));

            let afterBuf: Buffer;
            try {
              afterBuf = Buffer.from(await operator.captureScreen(sourceId));
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
              lastError = (msg as { description?: string }).description ?? "Verification failed";
              if (attempt < 3) await new Promise((r) => setTimeout(r, 500));
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
        onProgress(`Step failed: ${reason}`, stepNum, undefined, "");
        await patchRunStatus(options ?? {}, "failed", { callUserReason: reason });
        return { success: false, error: reason };
      }

      onProgress(`✓ Step ${stepNum} complete`, stepNum);
      await new Promise((r) => setTimeout(r, 300));
    }

    await patchRunStatus(options ?? {}, "completed");
    return { success: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const isCancelled = err === "WebSocket closed" || err.includes("Run cancelled");
    await patchRunStatus(options ?? {}, isCancelled ? "cancelled" : "failed", {
      error: isCancelled ? undefined : err,
    });
    return { success: false, error: err };
  } finally {
    activeWs = null;
    clearCancel();
  }
}

/**
 * Goal-only (ad-hoc) run: single goal string, no pre-defined steps.
 * Loops capture → step(goal) → action/finished/calluser until done.
 */
export async function runGoalOnlyRemote(
  goal: string,
  options: RunWorkflowRemoteOptions
): Promise<{ success: boolean; error?: string }> {
  const sourceId = options.sourceId;
  const workflowType = options.workflowType ?? "desktop";
  const onProgress = options.onProgress ?? (() => {});

  if (!sourceId) return { success: false, error: "sourceId required for screen capture" };
  if (!options.backendUrl) return { success: false, error: "backendUrl required" };
  if (!options.token) return { success: false, error: "token required for WebSocket auth" };

  const agentBase = (options.agentWsUrl ?? options.backendUrl).replace(/^http/, "ws");
  const wsUrl = `${agentBase}/api/agent/run?token=${encodeURIComponent(options.token)}`;
  console.log("[runGoalOnlyRemote] connecting", { agentBase, goal: goal.slice(0, 50), workflowId: options.workflowId, runId: options.runId });

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
            const text = Buffer.isBuffer(data) ? data.toString("utf-8") : String(data);
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
      console.warn("[runGoalOnlyRemote] unexpected response", (msg as { type?: string }).type);
      await patchRunStatus(options, "failed", { error: "Unexpected agent response" });
      return { success: false, error: "Unexpected agent response" };
    }
    console.log("[runGoalOnlyRemote] ready, starting capture loop");

    let iteration = 0;
    let lastError = "";

    while (true) {
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
      try {
        const buf = await operator.captureScreen(sourceId, { maxDimension: 1280 });
        screenshotB64 = Buffer.from(buf).toString("base64");
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
        history_summary: "",
        last_error: lastError || undefined,
      });

      msg = await receive();
      while ((msg as { type?: string }).type === "thinking") {
        onProgress((msg as { thought?: string }).thought ?? "", iteration + 1, (msg as { thought?: string }).thought);
        msg = await receive();
      }

      const m = msg as {
        type?: string;
        thought?: string;
        signal?: string;
        action?: Record<string, unknown>;
        action_str?: string;
        message?: string;
        reason?: string;
      };

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
          const reason = m.reason ?? "Agent requested user intervention";
          onProgress(`Step failed: ${reason}`, iteration + 1, thought, "calluser");
          await patchRunStatus(options, "failed", { callUserReason: reason });
          return { success: false, error: reason };
        }
        if (m.signal === "execute" && m.action) {
          const actionStr = m.action_str ?? (typeof (m.action as { action?: string })?.action === "string" ? (m.action as { action: string }).action : "");
          onProgress(thought || "Executing…", iteration + 1, thought, actionStr);
          const execResult: OperatorResult = await operator.execute(
            m.action as import("@echo/types").OperatorAction
          );
          if (execResult === "finished") {
            onProgress(`Done. ${thought}`, iteration + 1, thought, "finished");
            await patchRunStatus(options, "completed");
            return { success: true };
          }
          if (execResult === "calluser") {
            const reason = "Operator returned calluser";
            onProgress(`Step failed: ${reason}`, iteration + 1, thought, "calluser");
            await patchRunStatus(options, "failed", { callUserReason: reason });
            return { success: false, error: reason };
          }
          if (execResult === false) {
            lastError = "Operator returned false";
            iteration++;
            continue;
          }

          const executedAction = ((m.action as Record<string, unknown>)?.action as string ?? "").toLowerCase();
          const skipVerify = ["presskey", "hotkey", "wait"].includes(executedAction);
          if (skipVerify) {
            lastError = "";
            iteration++;
            onProgress(`✓ Step ${iteration}`, iteration);
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          const beforeBuf = Buffer.from(screenshotB64, "base64");
          const settleMs = ["doubleclick", "click", "clickandtype"].includes(executedAction) ? 5000 : 1500;
          await new Promise((r) => setTimeout(r, settleMs));

          let afterBuf: Buffer;
          try {
            afterBuf = Buffer.from(await operator.captureScreen(sourceId));
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
          const v = msg as { type?: string; succeeded?: boolean; description?: string };
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
    const isCancelled = err === "WebSocket closed" || err.includes("Run cancelled");
    await patchRunStatus(options, isCancelled ? "cancelled" : "failed", {
      error: isCancelled ? undefined : err,
    });
    return { success: false, error: err };
  } finally {
    activeWs = null;
    clearCancel();
  }
}
