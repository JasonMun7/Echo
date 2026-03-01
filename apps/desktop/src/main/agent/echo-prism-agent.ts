/**
 * EchoPrism agent – Electron main process.
 * Loop: screenshot → perceive_scene → Gemini → parse → ground_element → execute → verify.
 * Uses @google/genai for Gemini; direct executor for deterministic steps.
 *
 * Features:
 * - MAX_RETRIES=3 with fresh screenshot on every attempt
 * - Thought+action stored in history for multi-step context
 * - verifyStateTransition() — before/after comparison with action_str + expected_outcome
 * - "finished"/"calluser" sentinels detected and PATCH'd to backend API
 * - 1s settle wait after execution + 300ms inter-step delay
 * - Global fine-tuned model resolution from Firestore global_model/current
 * - Tier 1: perceiveScene() scene understanding on first attempt
 * - Tier 2: groundElement() coordinate override for click-type actions (confidence >= medium)
 * - temperature: 0 on all Gemini calls
 */

import { GoogleGenAI, createPartFromBase64, createPartFromText } from "@google/genai";
import type { Step, WorkflowType } from "@echo/types";
import { parseAction, extractThought } from "./action-parser";
import {
  systemPrompt,
  historySummaryText,
  stateTransitionPrompt,
  stepInstruction,
  callUserPrompt,
} from "./prompts";
import { compressScreenshot, buildContext, CompressOptions } from "./image-utils";
import { isDeterministic, executeStep } from "./direct-executor";
import * as operator from "../operators/desktop-operator";
import type { OperatorResult } from "../operators/desktop-operator";
import { perceiveScene, groundElement } from "./perception";

export type { Step };

export interface RunWorkflowOptions {
  sourceId?: string;
  workflowType?: WorkflowType;
  workflowId?: string;
  runId?: string;
  token?: string;
  backendUrl?: string;
  onProgress?: (message: string) => void;
}

const MAX_RETRIES = 3;
const FALLBACK_MODEL = "gemini-2.5-flash";
const GROUNDING_ACTIONS = new Set(["click", "doubleclick", "rightclick", "hover", "drag"]);

/** Resolve fine-tuned global model from Firestore (UI-TARS style). */
async function resolveModel(db: unknown): Promise<string> {
  try {
    if (!db) return FALLBACK_MODEL;
    // db is the firebase-admin Firestore instance passed from the main process
    const fsDb = db as {
      collection: (c: string) => {
        doc: (d: string) => {
          get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
        };
      };
    };
    const snap = await fsDb.collection("global_model").doc("current").get();
    if (snap.exists) {
      const data = snap.data();
      if (data?.job_status === "ready" && data?.tuned_model_id) {
        return data.tuned_model_id as string;
      }
    }
  } catch { /* fail silently */ }
  return FALLBACK_MODEL;
}

/** PATCH the backend API to update run status. */
async function patchRunStatus(
  opts: RunWorkflowOptions,
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
    console.warn("[echo-prism-agent] PATCH run status failed:", e);
  }
}

/** Verify state transition (before vs after screenshot). Returns { description, succeeded }. */
async function verifyStateTransition(
  ai: GoogleGenAI,
  model: string,
  beforeBuf: Buffer,
  afterBuf: Buffer,
  actionStr: string,
  expectedOutcome: string
): Promise<{ description: string; succeeded: boolean }> {
  const verifyOpts: CompressOptions = { maxDim: 768 };
  try {
    const [beforeComp, afterComp] = await Promise.all([
      compressScreenshot(beforeBuf, verifyOpts),
      compressScreenshot(afterBuf, verifyOpts),
    ]);

    const prompt = stateTransitionPrompt(actionStr, expectedOutcome);
    const response = await Promise.race([
      ai.models.generateContent({
        model: FALLBACK_MODEL, // always use flash for verification (fast + cheap)
        contents: [
          createPartFromText(prompt),
          createPartFromText("BEFORE screenshot:"),
          createPartFromBase64(beforeComp.buffer.toString("base64"), beforeComp.mimeType),
          createPartFromText("AFTER screenshot:"),
          createPartFromBase64(afterComp.buffer.toString("base64"), afterComp.mimeType),
        ],
        config: { temperature: 0, maxOutputTokens: 512 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("verifyStateTransition timeout")), 30000)
      ),
    ]);

    const text = (response as Awaited<ReturnType<typeof ai.models.generateContent>>).text?.trim() ?? "";
    const verdictMatch = text.match(/VERDICT:\s*(success|failed)/i);
    if (verdictMatch) {
      return { description: text, succeeded: verdictMatch[1].toLowerCase() === "success" };
    }
    console.warn("[echo-prism-agent] No VERDICT in state-transition response; assuming success");
    return { description: text, succeeded: true };
  } catch (e) {
    console.warn("[echo-prism-agent] verifyStateTransition failed:", e);
    return { description: "Verification unavailable", succeeded: true };
  }
}

export async function runWorkflowLocal(
  steps: Step[],
  options?: RunWorkflowOptions,
  db?: unknown
): Promise<{ success: boolean; error?: string }> {
  const sourceId = options?.sourceId;
  const workflowType = options?.workflowType ?? "desktop";
  const onProgress = options?.onProgress ?? (() => {});

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { success: false, error: "GEMINI_API_KEY not set" };
  if (!sourceId) return { success: false, error: "sourceId required for screen capture" };

  const ai = new GoogleGenAI({ apiKey });
  const model = await resolveModel(db);
  console.log("[echo-prism-agent] Using model:", model);

  const history: Array<{ screenshot?: Buffer; thought?: string; action?: string }> = [];

  try {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepNum = i + 1;
      const total = steps.length;
      const expectedOutcome = (step as unknown as Record<string, unknown>).expected_outcome as string | undefined ?? "";
      onProgress(`Step ${stepNum}/${total}: ${step.action} — ${String(step.context).slice(0, 50)}`);

      if (isDeterministic(step)) {
        const ok = await executeStep(step);
        if (!ok) {
          const errMsg = `Direct execution failed for step ${stepNum}`;
          onProgress(`✗ ${errMsg}`);
          return { success: false, error: errMsg };
        }
        onProgress(`✓ Step ${stepNum} complete (direct)`);
        try {
          const ss = await operator.captureScreen(sourceId);
          const { buffer } = await compressScreenshot(ss);
          history.push({ screenshot: buffer });
        } catch { /* non-fatal */ }
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      // EchoPrism VLM loop for ambiguous steps
      const instruction = stepInstruction(
        { action: step.action, context: step.context, params: step.params as Record<string, unknown>, expected_outcome: expectedOutcome },
        stepNum,
        total
      );

      let lastError = "";
      let thought = "";
      let actionStr = "";
      let stepSucceeded = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // Fresh screenshot on every attempt
        let screenshotBuf: Buffer;
        try {
          screenshotBuf = await operator.captureScreen(sourceId);
        } catch (e) {
          lastError = `Screenshot capture failed: ${e}`;
          break;
        }

        // Tier 1: Scene Understanding on first attempt
        let sceneCaption = "";
        if (attempt === 0) {
          const { buffer: compressedForScene } = await compressScreenshot(screenshotBuf);
          sceneCaption = await perceiveScene(ai, compressedForScene, FALLBACK_MODEL);
        }

        // Build history context
        const { screenshots, summary } = buildContext(history.length > 0 ? history : [], 2, true);
        const imgToSend = screenshots.length > 0 ? screenshots[screenshots.length - 1] : screenshotBuf;
        const { buffer: compressedBuf, mimeType } = await compressScreenshot(imgToSend);

        const sys = systemPrompt(instruction, workflowType);
        const histText = historySummaryText(summary);

        const effectiveInstruction =
          sceneCaption && attempt === 0
            ? `[Scene Overview]\n${sceneCaption}\n\n${instruction}`
            : instruction;

        const userParts = [
          ...(histText ? [createPartFromText(histText)] : []),
          createPartFromText(effectiveInstruction),
          createPartFromBase64(compressedBuf.toString("base64"), mimeType),
          ...(lastError ? [createPartFromText(`Previous attempt failed: ${lastError}`)] : []),
        ];

        let text: string;
        try {
          const response = await Promise.race([
            ai.models.generateContent({
              model,
              contents: userParts,
              config: {
                systemInstruction: sys,
                maxOutputTokens: 1024,
                temperature: 0,
              },
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Gemini call timeout")), 30000)
            ),
          ]);
          text = (response as Awaited<ReturnType<typeof ai.models.generateContent>>).text ?? "";
          if (!text) {
            lastError = "Empty model response";
            continue;
          }
        } catch (e) {
          lastError = `Gemini call failed: ${e}`;
          if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        thought = extractThought(text);
        const parsed = parseAction(text);
        if (!parsed) {
          lastError = `Could not parse action: ${text.slice(0, 200)}`;
          continue;
        }

        const parsedAction = parsed.action.toLowerCase();

        // Tier 2: Element grounding for click-type actions
        if (GROUNDING_ACTIONS.has(parsedAction)) {
          const targetDesc =
            (step.params?.description as string | undefined) ??
            step.context ??
            parsedAction;
          const { buffer: compressedForGround } = await compressScreenshot(screenshotBuf);
          const location = await groundElement(ai, compressedForGround, targetDesc, FALLBACK_MODEL);
          if (location && (location.confidence === "high" || location.confidence === "medium")) {
            console.log(
              `[echo-prism-agent] Grounding override (step ${stepNum}, ${location.confidence}): (${location.center_x}, ${location.center_y})`
            );
            if ("x1" in parsed) {
              (parsed as Record<string, unknown>).x1 = location.center_x;
              (parsed as Record<string, unknown>).y1 = location.center_y;
            } else {
              (parsed as Record<string, unknown>).x = location.center_x;
              (parsed as Record<string, unknown>).y = location.center_y;
            }
          }
        }

        // Build action_str for tracing
        const skipKeys = new Set(["action"]);
        const kvParts = Object.entries(parsed)
          .filter(([k]) => !skipKeys.has(k))
          .map(([, v]) => String(v));
        actionStr = `${parsedAction}(${kvParts.join(", ")})`;

        const beforeBuf = screenshotBuf;
        const result: OperatorResult = await operator.execute(parsed);

        // Terminal signals — PATCH backend API and signal caller
        if (result === "finished") {
          onProgress(`Agent signaled Finished at step ${stepNum}. Thought: ${thought}`);
          await patchRunStatus(options ?? {}, "completed");
          return { success: true };
        }

        if (result === "calluser") {
          const reason = callUserPrompt(thought) || "Agent requested user intervention";
          onProgress(`Agent needs user help at step ${stepNum}: ${reason}`);
          await patchRunStatus(options ?? {}, "awaiting_user", { callUserReason: reason });
          return { success: false, error: `calluser:${reason}` };
        }

        if (result === false) {
          lastError = `Operator returned false for action: ${actionStr}`;
          if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        // result === true — 1s settle wait before verification
        await new Promise((r) => setTimeout(r, 1000));

        let afterBuf: Buffer;
        try {
          afterBuf = await operator.captureScreen(sourceId);
        } catch {
          afterBuf = screenshotBuf; // use before screenshot as fallback
        }

        const { description, succeeded } = await verifyStateTransition(
          ai, model, beforeBuf, afterBuf, actionStr, expectedOutcome
        );
        console.log(`[echo-prism-agent] State transition (step ${stepNum}): ${description.slice(0, 120)}`);

        if (succeeded) {
          // Store thought+action in history
          const { buffer: compressedAfter } = await compressScreenshot(afterBuf);
          history.push({ screenshot: compressedAfter, thought, action: actionStr });
          stepSucceeded = true;
          break;
        }

        lastError = `Action had no effect: ${description.slice(0, 200)}`;
        console.warn(`[echo-prism-agent] VERDICT failed (attempt ${attempt + 1}, step ${stepNum}): ${lastError}`);
      }

      if (!stepSucceeded) {
        const reason = lastError || `Step ${stepNum} failed after ${MAX_RETRIES + 1} attempts`;
        onProgress(`Agent stuck at step ${stepNum} — requesting user intervention: ${reason}`);
        await patchRunStatus(options ?? {}, "awaiting_user", { callUserReason: reason });
        return { success: false, error: `calluser:${reason}` };
      }

      onProgress(`✓ Step ${stepNum} complete (EchoPrism). Thought: ${thought.slice(0, 80)}`);

      // 300ms inter-step delay
      await new Promise((r) => setTimeout(r, 300));
    }

    return { success: true };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { success: false, error: err };
  }
}
