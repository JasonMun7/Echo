"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { IconUpload, IconDownload, IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Annotation {
  id: number;
  bbox: [number, number, number, number];
  keypoints: [number, number];
  task_description: string;
  action_type: string;
}

export default function DatasetCreatorPage() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState<"bbox" | "point" | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageFile(file);
      setAnnotations([]);
    };
    img.src = URL.createObjectURL(file);
  };

  const getCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !image) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = image.width / rect.width;
      const scaleY = image.height / rect.height;
      return {
        x: Math.round((e.clientX - rect.left) * scaleX),
        y: Math.round((e.clientY - rect.top) * scaleY),
      };
    },
    [image]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCoords(e);
    if (!coords) return;
    if (drawing === "bbox") {
      setStart(coords);
    } else if (drawing === "point") {
      const w = image!.width;
      const h = image!.height;
      const id = annotations.length + 1;
      const norm = [round3(coords.x / w), round3(coords.y / h)];
      setAnnotations((prev) => [
        ...prev,
        {
          id,
          bbox: [coords.x, coords.y, 20, 20],
          keypoints: [coords.x, coords.y],
          task_description: "",
          action_type: "click",
        },
      ]);
      setSelectedId(id);
      setDrawing(null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawing === "bbox" && start) {
      const coords = getCoords(e);
      if (coords && image) {
        const x1 = Math.min(start.x, coords.x);
        const y1 = Math.min(start.y, coords.y);
        const w = Math.abs(coords.x - start.x) || 20;
        const h = Math.abs(coords.y - start.y) || 20;
        const id = annotations.length + 1;
        setAnnotations((prev) => [
          ...prev,
          {
            id,
            bbox: [x1, y1, w, h],
            keypoints: [x1 + w / 2, y1 + h / 2],
            task_description: "",
            action_type: "click",
          },
        ]);
        setSelectedId(id);
      }
      setStart(null);
      setDrawing(null);
    }
  };

  const round3 = (v: number) => Math.round(v * 1000) / 1000;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0);
    annotations.forEach((a) => {
      ctx.strokeStyle = "#A577FF";
      ctx.lineWidth = 2;
      ctx.strokeRect(a.bbox[0], a.bbox[1], a.bbox[2], a.bbox[3]);
      ctx.fillStyle = "rgba(165, 119, 255, 0.3)";
      ctx.beginPath();
      ctx.arc(a.keypoints[0], a.keypoints[1], 6, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, [image, annotations]);

  const exportCOCO = () => {
    if (!image) return;
    const w = image.width;
    const h = image.height;
    const coco = {
      info: { description: "GUI Dataset", version: "1.0", year: new Date().getFullYear() },
      images: [
        {
          id: 1,
          file_name: imageFile?.name || "screenshot.png",
          width: w,
          height: h,
        },
      ],
      annotations: annotations.map((a, i) => ({
        id: i + 1,
        image_id: 1,
        bbox: [round3(a.bbox[0] / w), round3(a.bbox[1] / h), round3(a.bbox[2] / w), round3(a.bbox[3] / h)],
        keypoints: [round3(a.keypoints[0] / w), round3(a.keypoints[1] / h), 2],
        category_id: 1,
        attributes: {
          task_description: a.task_description,
          action_type: a.action_type,
          element_info: "",
        },
      })),
      categories: [
        { id: 1, name: "click", supercategory: "interaction" },
        { id: 2, name: "type", supercategory: "interaction" },
      ],
    };
    const blob = new Blob([JSON.stringify(coco, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "coco4gui.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateAnnotation = (id: number, field: keyof Annotation, value: string) => {
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex w-full flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 border-l-0 bg-white p-6 shadow-sm md:p-10 overflow-y-auto">
        <h1 className="text-2xl font-semibold text-[#150A35]">Dataset Creator</h1>
        <p className="text-sm text-echo-text-muted -mt-4">
          Upload screenshots, draw bounding boxes and click points, set action types, and export
          COCO4GUI JSON for fine-tuning.
        </p>

        <div className="flex gap-4">
          <div className="rounded-lg border border-[#A577FF]/30 bg-[#F5F7FC] px-4 py-3 flex items-center gap-2">
            <IconUpload className="h-5 w-5 text-[#A577FF]" />
            <Label htmlFor="upload" className="cursor-pointer text-sm font-medium text-[#150A35]">
              Upload screenshot
            </Label>
            <input
              id="upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
          {image && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDrawing("bbox")}
                className={drawing === "bbox" ? "border-[#A577FF] bg-[#A577FF]/10" : ""}
              >
                <IconPlus className="h-4 w-4 mr-1" />
                Draw bbox
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDrawing("point")}
                className={drawing === "point" ? "border-[#A577FF] bg-[#A577FF]/10" : ""}
              >
                <IconPlus className="h-4 w-4 mr-1" />
                Add click point
              </Button>
              <Button size="sm" onClick={exportCOCO} disabled={annotations.length === 0}>
                <IconDownload className="h-4 w-4 mr-1" />
                Export COCO4GUI
              </Button>
            </>
          )}
        </div>

        <div className="flex gap-6 flex-1 min-h-0">
          <div className="flex-1 rounded-xl border border-[#A577FF]/20 overflow-hidden bg-[#150A35]/5">
            {image && (
              <canvas
                ref={canvasRef}
                width={image.width}
                height={image.height}
                style={{ maxWidth: "100%", height: "auto", display: "block" }}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                className="cursor-crosshair"
              />
            )}
            {!image && (
              <div className="flex items-center justify-center h-64 text-echo-text-muted">
                Upload an image to start
              </div>
            )}
          </div>
          <div className="w-80 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[#150A35]">Annotations</h3>
            {annotations.map((a) => (
              <div
                key={a.id}
                className={`rounded-lg border p-3 space-y-2 cursor-pointer ${
                  selectedId === a.id ? "border-[#A577FF] bg-[#A577FF]/5" : "border-[#A577FF]/20"
                }`}
                onClick={() => setSelectedId(a.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-echo-text-muted">#{a.id}</span>
                  <Select
                    value={a.action_type}
                    onValueChange={(v) => updateAnnotation(a.id, "action_type", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="click">click</SelectItem>
                      <SelectItem value="type">type</SelectItem>
                      <SelectItem value="select">select</SelectItem>
                      <SelectItem value="hover">hover</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="Task description"
                  value={a.task_description}
                  onChange={(e) => updateAnnotation(a.id, "task_description", e.target.value)}
                  className="text-sm h-8"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
