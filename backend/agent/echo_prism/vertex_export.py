"""
EchoPrism Vertex AI Fine-Tuning Export — UI-TARS §4.5 self-improvement.

Reads filtered_traces from Firestore and produces a Vertex AI supervised
fine-tuning dataset in JSONL format, uploaded to GCS.

Dataset format (Vertex AI SFT for Gemini):
  {"input_text": "<system>\n<instruction>", "output_text": "Thought: <T+>\nAction: <action>"}

For each "bad" trace step that has a corrected_thought (T+), we produce one
training example pairing the original instruction context with the corrected
(T+, action) output — teaching the model the right reasoning for that situation.

The dataset is uploaded to GCS and a Vertex AI SupervisedTuningJob is submitted
targeting gemini-2.5-flash-001 as the base model.

Global model architecture (UI-TARS style):
  All users' filtered traces contribute to ONE shared dataset at:
    gs://{bucket}/training/global/dataset.jsonl
  One tuning job produces one global EchoPrism model endpoint, persisted to:
    global_model/current  (Firestore)
  All users automatically benefit from the improved model on their next run.
"""
import io
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Vertex AI fine-tuning requires at least this many examples
MIN_TRAINING_EXAMPLES = 10


def _build_training_example(step: dict, workflow_name: str) -> dict | None:
    """
    Build one JSONL training example from a scored trace step.

    Priority order (human labels take precedence over Gemini auto-scores):
      - Human rejected  → excluded entirely (return None)
      - Human approved  → positive example using human_corrected_thought or original thought
      - Auto good       → positive example (if human reviewed and approved implicitly)
      - Bad + corrected → correction pair (human_corrected_thought preferred over Gemini T+)
      - Anything else   → excluded
      - api_call steps  → always skipped (no VLM reasoning to learn from)
    """
    action = (step.get("action") or "").strip()
    if not action:
        return None

    # Skip api_call steps — they are deterministic API calls with no VLM thought/action pair
    action_type = step.get("action_type", "")
    if action_type == "api_call" or action.lower().startswith("api_call"):
        return None

    step_index = step.get("step_index", "?")
    original_thought = (step.get("thought") or "").strip()

    # Human label takes priority over Gemini auto-score
    human_quality = step.get("human_quality")
    gemini_quality = step.get("quality", "unknown")
    effective_quality = human_quality or gemini_quality

    # Human-rejected steps are always excluded from training
    if effective_quality == "rejected":
        return None

    input_text = (
        f"You are EchoPrism, a UI automation agent completing a workflow: {workflow_name}\n"
        f"Step {step_index}: {original_thought or 'Perform the required action.'}\n"
        f"Based on the screenshot, what should you do?"
    )

    # Positive example: human-approved or auto-good steps
    if effective_quality in ("approved", "good"):
        # Use human-corrected thought if provided, otherwise the original (which was good)
        thought = (step.get("human_corrected_thought") or original_thought).strip()
        if not thought:
            return None
        return {"input_text": input_text, "output_text": f"Thought: {thought}\nAction: {action}"}

    # Correction example: bad steps need a corrected thought (T+)
    if effective_quality == "bad":
        # Human-edited T+ takes priority over Gemini's auto-generated correction
        corrected = (step.get("human_corrected_thought") or step.get("corrected_thought") or "").strip()
        if not corrected:
            return None
        return {"input_text": input_text, "output_text": f"Thought: {corrected}\nAction: {action}"}

    # Unknown or unscored steps without human label are excluded
    return None


async def export_training_data(
    db: Any,
    output_gcs_path: str,
    bucket_name: str | None = None,
) -> int:
    """
    Read ALL filtered_traces (from all users), build a global JSONL training dataset,
    and upload to GCS at output_gcs_path.

    Returns count of training examples written.
    Raises ValueError if too few examples to submit a tuning job.
    """
    # Fetch all filtered_trace documents across all users (global dataset)
    ft_query = db.collection("filtered_traces").stream()
    ft_docs = list(ft_query)

    examples: list[dict] = []

    for ft_doc in ft_docs:
        ft_data = ft_doc.to_dict() or {}
        workflow_id = ft_data.get("workflow_id", "unknown")
        workflow_name = ft_data.get("workflow_name") or f"Workflow {workflow_id[:8]}"

        # Fetch steps subcollection
        steps_ref = ft_doc.reference.collection("steps")
        for step_doc in steps_ref.stream():
            step = step_doc.to_dict() or {}
            example = _build_training_example(step, workflow_name)
            if example:
                examples.append(example)

    logger.info("Built %d training examples from %d trace documents", len(examples), len(ft_docs))

    if not examples:
        raise ValueError("No training examples found. Run more workflows to build trace data.")

    # Build JSONL bytes
    jsonl_bytes = io.BytesIO()
    for ex in examples:
        jsonl_bytes.write((json.dumps(ex) + "\n").encode("utf-8"))
    jsonl_bytes.seek(0)

    # Upload to GCS
    _bucket_name = bucket_name or os.environ.get("ECHO_GCS_BUCKET") or os.environ.get("GCS_BUCKET")
    if not _bucket_name:
        raise ValueError("ECHO_GCS_BUCKET environment variable not set")

    # output_gcs_path is like "training/{uid}/dataset.jsonl"
    blob_name = output_gcs_path.lstrip("gs://").split("/", 1)[-1] if output_gcs_path.startswith("gs://") else output_gcs_path

    try:
        from google.cloud import storage
        gcs_client = storage.Client()
        bucket = gcs_client.bucket(_bucket_name)
        blob = bucket.blob(blob_name)
        blob.upload_from_file(jsonl_bytes, content_type="application/jsonl")
        gcs_uri = f"gs://{_bucket_name}/{blob_name}"
        logger.info("Uploaded %d training examples to %s", len(examples), gcs_uri)
    except Exception as e:
        raise RuntimeError(f"GCS upload failed: {e}") from e

    return len(examples)


async def create_tuning_job(
    gcs_dataset_uri: str,
    db: Any | None = None,
    project: str | None = None,
    location: str = "us-central1",
    base_model: str = "gemini-2.5-flash-001",
    example_count: int = 0,
) -> str:
    """
    Submit a Vertex AI SupervisedTuningJob for the global exported dataset.
    Persists job_name + status:training to global_model/current in Firestore.
    All users will benefit from the resulting model endpoint.
    Returns the job resource name.
    """
    _project = project or os.environ.get("ECHO_GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not _project:
        raise ValueError("GCP project not configured. Set ECHO_GCP_PROJECT_ID.")

    display_name = "echoprism-global"

    try:
        import vertexai
        from vertexai.tuning import sft as vertex_sft

        vertexai.init(project=_project, location=location)

        sft_job = vertex_sft.train(
            source_model=base_model,
            train_dataset=gcs_dataset_uri,
            tuned_model_display_name=display_name,
        )
        job_name = sft_job.resource_name
        logger.info("Vertex AI global tuning job submitted: %s", job_name)

        # Persist job state to global_model/current so all agents can poll and auto-switch
        if db is not None:
            try:
                from google.cloud.firestore import SERVER_TIMESTAMP
                db.collection("global_model").document("current").set({
                    "job_name": job_name,
                    "job_status": "training",
                    "tuned_model_id": None,
                    "base_model": base_model,
                    "example_count": example_count,
                    "gcs_dataset_uri": gcs_dataset_uri,
                    "location": location,
                    "project": _project,
                    "submitted_at": SERVER_TIMESTAMP,
                    "completed_at": None,
                }, merge=False)
                logger.info("Persisted global tuning job to global_model/current")
            except Exception as fs_err:
                logger.warning("Failed to persist job to Firestore: %s", fs_err)

        return job_name
    except ImportError:
        raise ImportError(
            "google-cloud-aiplatform is required for Vertex AI fine-tuning. "
            "Install it with: pip install google-cloud-aiplatform"
        )
    except Exception as e:
        raise RuntimeError(f"Vertex AI tuning job submission failed: {e}") from e


def get_tuning_job_status(job_name: str, project: str | None = None, location: str = "us-central1") -> dict:
    """
    Check the current status of a Vertex AI SupervisedTuningJob.
    Returns a dict with keys: state, tuned_model_endpoint_name (if completed).
    """
    _project = project or os.environ.get("ECHO_GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")

    try:
        import vertexai
        from vertexai.tuning import sft as vertex_sft

        vertexai.init(project=_project, location=location)
        job = vertex_sft.SupervisedTuningJob(job_name)
        state = str(job.state) if job.state else "UNKNOWN"
        tuned_model_endpoint = getattr(job, "tuned_model_endpoint_name", None)
        return {
            "state": state,
            "tuned_model_endpoint_name": tuned_model_endpoint,
        }
    except ImportError:
        raise ImportError("google-cloud-aiplatform is required. pip install google-cloud-aiplatform")
    except Exception as e:
        raise RuntimeError(f"Failed to check tuning job status: {e}") from e
