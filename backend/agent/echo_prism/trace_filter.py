"""
EchoPrism Trace Filter — UI-TARS §4.5 offline filtering.

Processes completed run traces stored in Firestore runs/{runId}/logs and
produces quality-scored entries stored in the top-level filtered_traces collection.

Two-pass scoring:
  Pass 1 — Rule-based (no Gemini cost):
    - error field present → bad
    - empty/unparseable action → bad
    - duplicate consecutive action → bad (redundant)
    - Wait(seconds > 10) → bad (excessive)
    - steps not flagged → unknown

  Pass 2 — Gemini VLM scoring (unknown steps only):
    - Sends thought + action text to Gemini
    - Gemini rates good/bad and provides corrected_thought (T+) for bad steps
    - corrected_thought is the T+ counterpart used for Vertex AI DPO fine-tuning

Filtered trace documents are stored at:
  filtered_traces/{workflow_id}_{run_id}/steps (subcollection)
  filtered_traces/{workflow_id}_{run_id} (parent doc with metadata)
"""
import asyncio
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)


_SCORING_PROMPT = """You are reviewing a step from an AI UI automation agent.
The agent output a Thought (its reasoning) and an Action (what it did).

Thought: {thought}
Action: {action}

Evaluate:
1. Does the Thought correctly reason about the UI state?
2. Does the Action logically follow from the Thought?
3. Is there a more accurate or efficient Thought that would lead to the same or better Action?

Respond in exactly this format (no extra lines):
QUALITY: good
REASON: <one sentence>

OR if the thought/action pair has problems:
QUALITY: bad
REASON: <one sentence explaining the problem>
CORRECTED_THOUGHT: <an improved thought that better describes the reasoning>
"""


def _is_duplicate(entry: dict, prior_entry: dict | None) -> bool:
    """Return True if this action+params is identical to the immediately preceding action."""
    if not prior_entry:
        return False
    if not entry.get("action", ""):
        return False
    # Compare full action string including coordinates/params (not just action name)
    def _action_key(e: dict) -> str:
        act = e.get("action", "").lower()
        x = e.get("x", e.get("params", {}).get("x", ""))
        y = e.get("y", e.get("params", {}).get("y", ""))
        content = e.get("content", e.get("params", {}).get("text", ""))
        return f"{act}({x},{y},{content})"
    return _action_key(entry) == _action_key(prior_entry)


def _is_excessive_wait(action_str: str) -> bool:
    """Return True if action is Wait(N) with N > 10."""
    m = re.match(r"wait\((\d+(?:\.\d+)?)\)", action_str.strip(), re.IGNORECASE)
    if m:
        return float(m.group(1)) > 10
    return False


def _rule_pass(entries: list[dict]) -> list[dict]:
    """
    Apply rule-based quality filter. Returns entries with quality field set.
    quality is one of: "good" (rule-confirmed), "bad" (rule-rejected), "unknown" (needs VLM).

    api_call steps are deterministic — scored by outcome, no VLM needed.
    """
    scored = []
    prior = None
    for entry in entries:
        result = dict(entry)
        action_str = entry.get("action", "").strip()
        action_type = entry.get("action_type", "")

        # api_call steps: deterministic scoring by outcome
        is_api_call = (
            action_type == "api_call"
            or action_str.lower().startswith("api_call")
            or entry.get("step", {}).get("action") == "api_call"
        )
        if is_api_call:
            if entry.get("error"):
                result["quality"] = "bad"
                result["rule_reason"] = f"API call failed: {entry['error'][:100]}"
            else:
                result["quality"] = "good"
                result["rule_reason"] = "API call succeeded (deterministic, auto-scored)"
            prior = entry
            scored.append(result)
            continue

        if entry.get("error"):
            result["quality"] = "bad"
            result["rule_reason"] = f"Step had error: {entry['error'][:100]}"
        elif not action_str:
            result["quality"] = "bad"
            result["rule_reason"] = "Empty or missing action"
        elif _is_duplicate(entry, prior):
            result["quality"] = "bad"
            result["rule_reason"] = "Duplicate consecutive action (redundant)"
        elif _is_excessive_wait(action_str):
            result["quality"] = "bad"
            result["rule_reason"] = "Excessive Wait duration (> 10s)"
        else:
            result["quality"] = "unknown"

        prior = entry
        scored.append(result)
    return scored


async def _vlm_score_entry(client: Any, entry: dict, sem: "asyncio.Semaphore") -> dict:
    """Score a single trace entry using Gemini. Returns updated entry dict."""
    async with sem:
        try:
            from google.genai import types as gtypes
        except ImportError:
            entry["quality"] = "unknown"
            entry["vlm_reason"] = "google-genai not available"
            return entry

        thought = entry.get("thought", "").strip() or "(no thought recorded)"
        action = entry.get("action", "").strip() or "(no action recorded)"
        prompt = _SCORING_PROMPT.format(thought=thought, action=action)

        # Build user parts — include screenshot if available for true VLM scoring
        user_parts: list = [gtypes.Part.from_text(text=prompt)]
        screenshot_bytes = entry.get("screenshot")
        if isinstance(screenshot_bytes, bytes) and len(screenshot_bytes) > 100:
            user_parts.append(gtypes.Part.from_bytes(data=screenshot_bytes, mime_type="image/jpeg"))

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.5-flash",
                contents=[gtypes.Content(role="user", parts=user_parts)],
                config=gtypes.GenerateContentConfig(max_output_tokens=256),
            )
            text = ""
            if response and response.candidates:
                for c in response.candidates:
                    if c.content and c.content.parts:
                        for p in c.content.parts:
                            if hasattr(p, "text") and p.text:
                                text += p.text
            text = text.strip()

            quality_m = re.search(r"QUALITY:\s*(good|bad)", text, re.IGNORECASE)
            reason_m = re.search(r"REASON:\s*(.+?)(?=\nCORRECTED_THOUGHT:|$)", text, re.IGNORECASE | re.DOTALL)
            corrected_m = re.search(r"CORRECTED_THOUGHT:\s*(.+)$", text, re.IGNORECASE | re.DOTALL)

            entry["quality"] = quality_m.group(1).lower() if quality_m else "unknown"
            entry["vlm_reason"] = reason_m.group(1).strip() if reason_m else ""
            if corrected_m and entry["quality"] == "bad":
                entry["corrected_thought"] = corrected_m.group(1).strip()
        except Exception as e:
            logger.warning("VLM scoring failed for step %s: %s", entry.get("step_index"), e)
            entry["quality"] = "unknown"
            entry["vlm_reason"] = f"Scoring error: {e}"

        return entry


async def score_trace(
    run_ref: Any,
    workflow_id: str,
    run_id: str,
    db: Any,
    owner_uid: str,
    api_key: str | None = None,
) -> list[dict]:
    """
    Score all trace entries for a run. Stores results in:
      filtered_traces/{workflow_id}_{run_id} (metadata doc)
      filtered_traces/{workflow_id}_{run_id}/steps (scored entries)

    Returns list of scored entry dicts.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY", "")

    # Fetch all trace log entries (only those with trace=True)
    logs_ref = run_ref.collection("logs")
    trace_docs = [
        {"id": d.id, **d.to_dict()}
        for d in logs_ref.stream()
        if d.to_dict().get("trace") is True
    ]

    if not trace_docs:
        logger.info("No trace entries found for run %s", run_id)
        return []

    # Sort by step_index
    trace_docs.sort(key=lambda x: x.get("step_index", 0))

    # Pass 1: rule-based
    scored = _rule_pass(trace_docs)

    # Pass 2: VLM scoring for unknown entries (with concurrency limit)
    unknown = [e for e in scored if e["quality"] == "unknown"]
    if unknown and key:
        try:
            from google import genai
            from google.cloud.firestore import SERVER_TIMESTAMP  # noqa: F401 — import check
            client = genai.Client(api_key=key)
            sem = asyncio.Semaphore(5)
            tasks = [_vlm_score_entry(client, entry, sem) for entry in unknown]
            scored_unknown = await asyncio.gather(*tasks)
            # Merge back
            unknown_by_idx = {e.get("step_index"): e for e in scored_unknown}
            for i, entry in enumerate(scored):
                if entry["quality"] == "unknown":
                    scored[i] = unknown_by_idx.get(entry.get("step_index"), entry)
        except ImportError:
            pass  # leave as "unknown" — excluded from training

    # Validate coordinate bounds; mark out-of-range steps as bad
    for entry in scored:
        x = entry.get("x", entry.get("params", {}).get("x"))
        y = entry.get("y", entry.get("params", {}).get("y"))
        if x is not None and y is not None:
            try:
                if not (0 <= int(x) <= 1000 and 0 <= int(y) <= 1000):
                    entry["quality"] = "bad"
                    entry["rule_reason"] = f"Coordinates out of bounds: ({x}, {y})"
            except (TypeError, ValueError):
                pass

    # Store in filtered_traces collection using batch writes
    from google.cloud.firestore import SERVER_TIMESTAMP
    doc_id = f"{workflow_id}_{run_id}"
    ft_ref = db.collection("filtered_traces").document(doc_id)
    ft_ref.set({
        "workflow_id": workflow_id,
        "run_id": run_id,
        "owner_uid": owner_uid,
        "step_count": len(scored),
        "good_count": sum(1 for e in scored if e["quality"] == "good"),
        "bad_count": sum(1 for e in scored if e["quality"] == "bad"),
        "scored_at": SERVER_TIMESTAMP,
    }, merge=True)

    steps_ref = ft_ref.collection("steps")
    batch = db.batch()
    for entry in scored:
        step_doc_id = str(entry.get("step_index", entry.get("id", "unknown")))
        step_ref = steps_ref.document(step_doc_id)
        step_data: dict = {
            "step_index": entry.get("step_index"),
            "thought": entry.get("thought", ""),
            "action": entry.get("action", ""),
            "quality": entry.get("quality", "unknown"),
            "rule_reason": entry.get("rule_reason", ""),
            "vlm_reason": entry.get("vlm_reason", ""),
            "corrected_thought": entry.get("corrected_thought", ""),
            "error": entry.get("error", ""),
            "is_positive_example": entry.get("quality") == "good",
        }
        # Upload screenshot to GCS and store URL (avoids Firestore 1 MB document limit)
        screenshot_bytes = entry.get("screenshot")
        if isinstance(screenshot_bytes, bytes) and len(screenshot_bytes) > 0:
            try:
                from app.services.gcs import upload_file as gcs_upload
                blob_name = f"traces/{workflow_id}/{run_id}/{step_doc_id}.jpg"
                gcs_url = gcs_upload(blob_name, screenshot_bytes, content_type="image/jpeg")
                step_data["screenshot_url"] = gcs_url
            except Exception as gcs_err:
                logger.warning("Failed to upload trace screenshot to GCS: %s", gcs_err)
        batch.set(step_ref, step_data)
    batch.commit()

    good = sum(1 for e in scored if e["quality"] == "good")
    bad = sum(1 for e in scored if e["quality"] == "bad")
    logger.info("Trace scored for run %s: %d good, %d bad out of %d", run_id, good, bad, len(scored))
    return scored
