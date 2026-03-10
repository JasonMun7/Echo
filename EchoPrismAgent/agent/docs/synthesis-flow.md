# Synthesis Flow: Screen Recording → Workflow

## 1. What Happens to the Video (Screen Recording)

### Option A: Desktop App / Workflows New Page
1. **Recording**: MediaRecorder captures `video/webm` or `video/mp4`
2. **Upload**: POST to `/api/storage/upload-recording` with form field `video`
3. **Storage**: Backend uploads bytes to GCS, returns `gcs_path` (e.g. `gs://bucket/uploads/uid/uuid/recording-123.webm`)
4. **Synthesis**: POST to `/api/synthesize` with `video_gcs_path` only (no video in body)

### Option B: Chat Page (Web)
1. **Recording**: `navigator.mediaDevices.getDisplayMedia` → MediaRecorder → `video/webm`
2. **On stop**: FormData with `video` + `workflow_name`, POST directly to `/api/synthesize`

---

## 2. What Synthesize Router Does

The synthesize router (`backend/app/routers/synthesize.py`) is a thin HTTP layer. It:

1. **Input**: Receives `video` (direct upload) OR `video_gcs_path` OR `screenshots`
2. **Upload to GCS**: Persists media under `{uid}/{workflow_id}/`
3. **Upload to Gemini**: `_upload_to_gemini(content, mime)` → Gemini Files API
4. **Delegate**: Calls `synthesis_agent.synthesize_workflow_from_media(client, parts)` for video/images, or `synthesize_workflow_from_description` for text
5. **Store**: Writes returned workflow + steps to Firestore

All synthesis logic (prompts, model calls, post-processing) lives in `synthesis_agent.py`.

### Traceability
Workflows store `source_recording_id` (e.g. `recording-1234567890.webm`) so you can correlate each workflow with the recording used. Visible on workflow detail and edit pages.

### Where video_frames.py Is Used
`extract_frames_from_video` is used by the **synthesis agent** frame-by-frame flow (`synthesize_workflow_from_frames`), which is not currently used by the router. The router uses `synthesize_workflow_from_media` (one-shot raw video/images → Gemini).

---

## 3. Debugging "No Context from Video"

Possible causes:

| Hypothesis | Where to check |
|-----------|----------------|
| Empty or corrupted video bytes | Log `len(content)` after GCS download / read |
| Gemini rejects or misparses video | Log `response.text` length, raw JSON |
| webm codec not supported by Gemini | Try mp4 or check Gemini docs |
| GCS path format invalid | Log `video_gcs_path`, `blob_name`, download success |
