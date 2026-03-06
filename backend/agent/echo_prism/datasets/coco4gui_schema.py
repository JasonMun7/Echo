"""
COCO4GUI JSON schema — COCO-based format for GUI interaction datasets.

Supports:
- images with platform/application metadata
- annotations with bbox, keypoints in 3-decimal normalized [0.000, 1.000] coords
- categories (click, type, select, hover, drag, right_click, double_click)
- attributes: task_description, action_type, element_info, thought, quality, etc.
"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class COCO4GUIImage:
    """Single image entry in COCO4GUI format."""
    id: int
    file_name: str
    width: int
    height: int
    date_captured: str | None = None
    application: str | None = None
    platform: str | None = None
    sequence_id: str | None = None
    sequence_position: int | None = None
    sequence_description: str | None = None
    gcs_url: str | None = None

    def to_dict(self) -> dict:
        d: dict[str, Any] = {
            "id": self.id,
            "file_name": self.file_name,
            "width": self.width,
            "height": self.height,
        }
        if self.date_captured is not None:
            d["date_captured"] = self.date_captured
        if self.application is not None:
            d["application"] = self.application
        if self.platform is not None:
            d["platform"] = self.platform
        if self.sequence_id is not None:
            d["sequence_id"] = self.sequence_id
        if self.sequence_position is not None:
            d["sequence_position"] = self.sequence_position
        if self.sequence_description is not None:
            d["sequence_description"] = self.sequence_description
        if self.gcs_url is not None:
            d["gcs_url"] = self.gcs_url
        return d


@dataclass
class COCO4GUICategory:
    """Category for action types (click, type, etc.)."""
    id: int
    name: str
    supercategory: str = "interaction"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "supercategory": self.supercategory,
        }


@dataclass
class COCO4GUIAnnotation:
    """Annotation with bbox, keypoints, and GUI-specific attributes."""
    id: int
    image_id: int
    bbox: list[float]  # [x, y, w, h] or [x_norm, y_norm, w_norm, h_norm] in [0,1]
    keypoints: list[float] | None = None  # [x, y, visibility] center/click point
    category_id: int = 1
    area: float | None = None
    iscrowd: int = 0
    attributes: dict[str, Any] | None = None
    category: str | None = None  # e.g. "recovery_action" for recovery steps

    def to_dict(self) -> dict:
        d: dict[str, Any] = {
            "id": self.id,
            "image_id": self.image_id,
            "bbox": self.bbox,
            "category_id": self.category_id,
            "iscrowd": self.iscrowd,
        }
        if self.keypoints is not None:
            d["keypoints"] = self.keypoints
        if self.area is not None:
            d["area"] = self.area
        if self.attributes is not None:
            d["attributes"] = self.attributes
        if self.category is not None:
            d["category"] = self.category
        return d


@dataclass
class COCO4GUIDataset:
    """Full COCO4GUI dataset."""
    info: dict[str, Any] = field(default_factory=lambda: {
        "description": "GUI Interaction Dataset",
        "version": "1.0",
        "year": 2024,
    })
    images: list[COCO4GUIImage] = field(default_factory=list)
    annotations: list[COCO4GUIAnnotation] = field(default_factory=list)
    categories: list[COCO4GUICategory] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "info": self.info,
            "images": [img.to_dict() for img in self.images],
            "annotations": [ann.to_dict() for ann in self.annotations],
            "categories": [cat.to_dict() for cat in self.categories],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "COCO4GUIDataset":
        info = data.get("info", {})
        images = [
            COCO4GUIImage(
                id=img["id"],
                file_name=img["file_name"],
                width=img["width"],
                height=img["height"],
                date_captured=img.get("date_captured"),
                application=img.get("application"),
                platform=img.get("platform"),
                sequence_id=img.get("sequence_id"),
                sequence_position=img.get("sequence_position"),
                sequence_description=img.get("sequence_description"),
                gcs_url=img.get("gcs_url"),
            )
            for img in data.get("images", [])
        ]
        annotations = [
            COCO4GUIAnnotation(
                id=ann["id"],
                image_id=ann["image_id"],
                bbox=ann["bbox"],
                keypoints=ann.get("keypoints"),
                category_id=ann.get("category_id", 1),
                area=ann.get("area"),
                iscrowd=ann.get("iscrowd", 0),
                attributes=ann.get("attributes"),
                category=ann.get("category"),
            )
            for ann in data.get("annotations", [])
        ]
        categories = [
            COCO4GUICategory(
                id=cat["id"],
                name=cat["name"],
                supercategory=cat.get("supercategory", "interaction"),
            )
            for cat in data.get("categories", [])
        ]
        return cls(info=info, images=images, annotations=annotations, categories=categories)
