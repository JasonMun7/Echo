"""
COCO4GUI importer — load COCO4GUI JSON and convert to Vertex SFT format.

Converts all coordinates to 3-decimal [0.000, 1.000] floats.
Each annotation becomes a training example: image + task_description → point([x, y])
"""
import json
import logging
from pathlib import Path
from typing import Any, Iterator

from .coco4gui_schema import COCO4GUIDataset

logger = logging.getLogger(__name__)


def _ensure_normalized(
    val: float,
    denom: float,
) -> float:
    """Convert pixel value to normalized [0,1] if denom > 0."""
    if denom and denom > 0:
        return round(float(val) / denom, 3)
    return round(float(val), 3)


def coco4gui_to_vertex_examples(
    coco_path: str | Path,
    image_base_url: str = "",
    image_width_override: dict[int, int] | None = None,
    image_height_override: dict[int, int] | None = None,
) -> Iterator[dict]:
    """
    Load COCO4GUI JSON and yield Vertex 2026 message-based SFT examples.

    Each annotation with task_description and (keypoints or bbox center) yields one example.

    image_base_url: base URL or GCS prefix for images, e.g. "gs://bucket/images/"
    """
    path = Path(coco_path)
    if not path.exists():
        raise FileNotFoundError(str(path))

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    dataset = COCO4GUIDataset.from_dict(data)
    images_by_id = {img.id: img for img in dataset.images}

    for ann in dataset.annotations:
        img = images_by_id.get(ann.image_id)
        if not img:
            continue
        w = image_width_override.get(ann.image_id, img.width) if image_width_override else img.width
        h = image_height_override.get(ann.image_id, img.height) if image_height_override else img.height

        attrs = ann.attributes or {}
        task_desc = attrs.get("task_description") or attrs.get("task_description") or "Locate the element."
        if not task_desc:
            continue

        # Prefer keypoints [x, y, vis] for click point; else bbox center
        if ann.keypoints and len(ann.keypoints) >= 2:
            x_raw, y_raw = ann.keypoints[0], ann.keypoints[1]
            # Check if already normalized (typically in [0,1])
            if x_raw <= 1.0 and y_raw <= 1.0 and x_raw >= 0 and y_raw >= 0:
                x_norm = round(x_raw, 3)
                y_norm = round(y_raw, 3)
            else:
                x_norm = round(x_raw / w, 3) if w else 0.5
                y_norm = round(y_raw / h, 3) if h else 0.5
        elif ann.bbox and len(ann.bbox) >= 4:
            bx, by, bw, bh = ann.bbox[0], ann.bbox[1], ann.bbox[2], ann.bbox[3]
            if bx <= 1.0 and by <= 1.0 and bw <= 1.0 and bh <= 1.0:
                cx = bx + bw / 2
                cy = by + bh / 2
            else:
                cx = bx + bw / 2
                cy = by + bh / 2
                cx = cx / w if w else 0.5
                cy = cy / h if h else 0.5
            x_norm = round(max(0, min(1, cx)), 3)
            y_norm = round(max(0, min(1, cy)), 3)
        else:
            continue

        output_text = f"point([{x_norm:.3f}, {y_norm:.3f}])"
        image_url = f"{image_base_url.rstrip('/')}/{img.file_name}" if image_base_url else img.gcs_url or img.file_name
        if not image_url or image_url == img.file_name:
            # Relative path only — caller must resolve
            image_url = img.gcs_url or f"gs://placeholder/{img.file_name}"

        user_content: list[dict] = [
            {"type": "image", "image_url": {"url": image_url}},
            {"type": "text", "text": task_desc},
        ]
        messages = [
            {"role": "user", "content": user_content},
            {"role": "model", "content": [{"type": "text", "text": output_text}]},
        ]
        yield {"messages": messages}
