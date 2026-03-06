"""
COCO4GUI builder — build/append annotations from screenshots and annotations.

Stores bbox/keypoints in 3-decimal normalized [0.000, 1.000] floats.
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from .coco4gui_schema import (
    COCO4GUIAnnotation,
    COCO4GUICategory,
    COCO4GUIDataset,
    COCO4GUIImage,
)

DEFAULT_CATEGORIES = [
    {"id": 1, "name": "click", "supercategory": "interaction"},
    {"id": 2, "name": "type", "supercategory": "interaction"},
    {"id": 3, "name": "select", "supercategory": "interaction"},
    {"id": 4, "name": "hover", "supercategory": "interaction"},
    {"id": 5, "name": "drag", "supercategory": "interaction"},
    {"id": 6, "name": "right_click", "supercategory": "interaction"},
    {"id": 7, "name": "double_click", "supercategory": "interaction"},
]


def _round3(v: float) -> float:
    return round(float(v), 3)


def _normalize_bbox(
    bbox_px: list[float],
    width: int,
    height: int,
) -> list[float]:
    """Convert pixel bbox [x, y, w, h] to normalized [x, y, w, h] in [0,1]."""
    if len(bbox_px) < 4 or width <= 0 or height <= 0:
        return [0.5, 0.5, 0.1, 0.1]
    x, y, w, h = bbox_px[0], bbox_px[1], bbox_px[2], bbox_px[3]
    return [
        _round3(x / width),
        _round3(y / height),
        _round3(w / width),
        _round3(h / height),
    ]


def _normalize_keypoint(
    x_px: float,
    y_px: float,
    width: int,
    height: int,
) -> list[float]:
    """Convert pixel coords to [x_norm, y_norm, visibility] in [0,1]."""
    if width <= 0 or height <= 0:
        return [0.5, 0.5, 2]
    return [
        _round3(x_px / width),
        _round3(y_px / height),
        2,  # 2 = visible
    ]


class COCO4GUIBuilder:
    """Build COCO4GUI datasets by appending images and annotations."""

    def __init__(self, description: str = "GUI Interaction Dataset"):
        self.dataset = COCO4GUIDataset(
            info={
                "description": description,
                "version": "1.0",
                "year": datetime.now(timezone.utc).year,
                "date_created": datetime.now(timezone.utc).isoformat(),
            },
            categories=[
                COCO4GUICategory(
                    id=c["id"],
                    name=c["name"],
                    supercategory=c.get("supercategory", "interaction"),
                )
                for c in DEFAULT_CATEGORIES
            ],
        )
        self._next_image_id = 1
        self._next_ann_id = 1
        self._cat_name_to_id = {c["name"]: c["id"] for c in DEFAULT_CATEGORIES}

    def add_image(
        self,
        file_name: str,
        width: int,
        height: int,
        application: str | None = None,
        platform: str | None = None,
        sequence_id: str | None = None,
        sequence_position: int | None = None,
        sequence_description: str | None = None,
        gcs_url: str | None = None,
    ) -> int:
        """Add an image. Returns image_id."""
        img_id = self._next_image_id
        self._next_image_id += 1
        self.dataset.images.append(
            COCO4GUIImage(
                id=img_id,
                file_name=file_name,
                width=width,
                height=height,
                date_captured=datetime.now(timezone.utc).isoformat(),
                application=application,
                platform=platform,
                sequence_id=sequence_id,
                sequence_position=sequence_position,
                sequence_description=sequence_description,
                gcs_url=gcs_url,
            )
        )
        return img_id

    def add_annotation(
        self,
        image_id: int,
        bbox: list[float],
        keypoints: list[float] | None = None,
        action_type: str = "click",
        task_description: str = "",
        element_info: str = "",
        thought: str | None = None,
        corrected_thought: str | None = None,
        quality: str | None = None,
        error: str | None = None,
        category: str | None = None,
        custom_metadata: dict[str, Any] | None = None,
        width: int | None = None,
        height: int | None = None,
    ) -> int:
        """
        Add an annotation. bbox can be [x,y,w,h] in pixels or normalized.
        If width/height are provided, bbox is treated as pixel coords and normalized.
        """
        ann_id = self._next_ann_id
        self._next_ann_id += 1

        img = next((i for i in self.dataset.images if i.id == image_id), None)
        if not img:
            raise ValueError(f"Image id {image_id} not found")
        w = width or img.width
        h = height or img.height

        bbox_norm = _normalize_bbox(bbox, w, h) if len(bbox) == 4 and (w and h) else bbox
        kp_norm = None
        if keypoints and len(keypoints) >= 2:
            kp_norm = _normalize_keypoint(keypoints[0], keypoints[1], w, h)

        cat_id = self._cat_name_to_id.get(action_type, 1)
        attrs: dict[str, Any] = {
            "task_description": task_description,
            "action_type": action_type,
            "element_info": element_info,
        }
        if thought is not None:
            attrs["thought"] = thought
        if corrected_thought is not None:
            attrs["corrected_thought"] = corrected_thought
        if quality is not None:
            attrs["quality"] = quality
        if error is not None:
            attrs["error"] = error
        if custom_metadata:
            attrs["custom_metadata"] = custom_metadata

        area = bbox_norm[2] * bbox_norm[3] if len(bbox_norm) >= 4 else 0

        self.dataset.annotations.append(
            COCO4GUIAnnotation(
                id=ann_id,
                image_id=image_id,
                bbox=bbox_norm,
                keypoints=kp_norm,
                category_id=cat_id,
                area=area,
                attributes=attrs,
                category=category,
            )
        )
        return ann_id

    def build(self) -> COCO4GUIDataset:
        """Return the built dataset."""
        return self.dataset

    def to_dict(self) -> dict:
        """Return the dataset as a dict for JSON export."""
        return self.dataset.to_dict()
