"""
Extract frames from video for EchoPrism synthesis.
Samples frames by time (e.g. 1 FPS) and returns JPEG bytes.
"""
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def extract_frames_from_video(
    content: bytes,
    mime: str,
    max_frames: int = 120,
    fps_sample: float | None = None,
    skip_initial_seconds: float = 2.0,
) -> list[bytes]:
    """
    Extract frames from a video file and return as list of JPEG bytes.

    Args:
        content: Raw video bytes.
        mime: MIME type (video/mp4, video/webm, etc.).
        max_frames: Maximum number of frames to extract.
        fps_sample: Sample at this many frames per second. Default 1.0.
        skip_initial_seconds: Skip frames from the first N seconds to avoid share picker / setup UI.

    Returns:
        List of JPEG-encoded frame bytes.
    """
    import cv2

    if fps_sample is None:
        fps_sample = 1.0

    suffix = ".mp4"
    if "webm" in mime:
        suffix = ".webm"
    elif "quicktime" in mime or "mov" in mime:
        suffix = ".mov"

    # [SYNTH_DEBUG] remove when done testing
    logger.info("[SYNTH_DEBUG] extract_frames_from_video: content_size=%d bytes, mime=%s, suffix=%s", len(content), mime, suffix)

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(content)
        path = f.name

    frames: list[bytes] = []
    try:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            logger.warning("[SYNTH_DEBUG] VideoCapture could not open file (codec/format issue). path=%s", path)
            return []

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_interval = max(1, int(fps / fps_sample))
        skip_frames = max(0, int(skip_initial_seconds * fps))
        # When total_frames is unknown (0), cap skip to avoid exhausting short recordings
        if total_frames <= 0:
            skip_frames = min(skip_frames, 15)  # ~0.5 sec at 30fps
        # [SYNTH_DEBUG] remove when done testing
        logger.info("[SYNTH_DEBUG] Video props: total_frames=%s fps=%.1f skip_frames=%d frame_interval=%d (skip may exhaust short videos)", total_frames, fps, skip_frames, frame_interval)

        if total_frames > 0:
            # Seek-based extraction (works for regular videos with known frame count)
            count = 0
            idx = skip_frames
            seek_failures = 0
            while count < max_frames and idx < total_frames:
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ret, frame = cap.read()
                if not ret:
                    seek_failures += 1
                    if seek_failures >= 3:
                        break
                    idx += 1
                    continue
                seek_failures = 0
                _, jpeg = cv2.imencode(".jpg", frame)
                frames.append(jpeg.tobytes())
                count += 1
                idx += frame_interval

            if not frames:
                logger.info("[SYNTH_DEBUG] Seek-based path produced 0 frames (count=%d idx=%d seek_failures may have tripped)", count, idx)

        if not frames and total_frames <= 0:
            # Sequential fallback for screen recordings (CAP_PROP_FRAME_COUNT often 0)
            logger.info("[SYNTH_DEBUG] Using sequential fallback (total_frames=%s). Skipping first %d frames then sampling.", total_frames, skip_frames)
            reads_per_sample = max(1, int(30 / fps_sample))
            read_count = 0
            skipped = 0
            while skipped < skip_frames:
                ret, _ = cap.read()
                if not ret:
                    break
                skipped += 1
            while len(frames) < max_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                if read_count % reads_per_sample == 0:
                    _, jpeg = cv2.imencode(".jpg", frame)
                    frames.append(jpeg.tobytes())
                read_count += 1

            if not frames:
                logger.info("[SYNTH_DEBUG] Sequential fallback (total_frames<=0) produced 0 frames. read_count=%d", read_count)

        if not frames and total_frames > 0:
            # Seek-based failed; try sequential as last resort
            logger.info("[SYNTH_DEBUG] Seek-based failed, trying sequential fallback")
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            reads_per_sample = max(1, int(30 / fps_sample))
            read_count = 0
            skipped = 0
            while skipped < skip_frames:
                ret, _ = cap.read()
                if not ret:
                    break
                skipped += 1
            while len(frames) < max_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                if read_count % reads_per_sample == 0:
                    _, jpeg = cv2.imencode(".jpg", frame)
                    frames.append(jpeg.tobytes())
                read_count += 1

        cap.release()
    finally:
        Path(path).unlink(missing_ok=True)

    # [SYNTH_DEBUG] remove when done testing
    logger.info("[SYNTH_DEBUG] extract_frames result: %d frames", len(frames))
    return frames
