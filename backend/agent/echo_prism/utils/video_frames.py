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
) -> list[bytes]:
    """
    Extract frames from a video file and return as list of JPEG bytes.

    Args:
        content: Raw video bytes.
        mime: MIME type (video/mp4, video/webm, etc.).
        max_frames: Maximum number of frames to extract.
        fps_sample: Sample at this many frames per second. Default 1.0.

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

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(content)
        path = f.name

    frames: list[bytes] = []
    try:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            logger.warning("VideoCapture could not open file (codec/format issue)")
            return []

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_interval = max(1, int(fps / fps_sample))
        logger.info("Video: total_frames=%s fps=%.1f (CAP_PROP_FRAME_COUNT=0 common for screen recordings)", total_frames, fps)

        if total_frames > 0:
            # Seek-based extraction (works for regular videos with known frame count)
            count = 0
            idx = 0
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

        if not frames and total_frames <= 0:
            # Sequential fallback for screen recordings (CAP_PROP_FRAME_COUNT often 0)
            # Read frames sequentially, sampling at ~1 FPS
            reads_per_sample = max(1, int(30 / fps_sample))
            read_count = 0
            while len(frames) < max_frames:
                ret, frame = cap.read()
                if not ret:
                    break
                if read_count % reads_per_sample == 0:
                    _, jpeg = cv2.imencode(".jpg", frame)
                    frames.append(jpeg.tobytes())
                read_count += 1

        if not frames and total_frames > 0:
            # Seek-based failed; try sequential as last resort
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            reads_per_sample = max(1, int(30 / fps_sample))
            read_count = 0
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

    logger.info("Extracted %d frames from video", len(frames))
    return frames
