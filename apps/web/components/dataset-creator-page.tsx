"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  IconUpload,
  IconDownload,
  IconPlus,
  IconVideo,
  IconPhoto,
  IconArrowsMaximize,
  IconSquare,
  IconFolderOpen,
  IconPlayerPlay,
  IconPlayerStop,
  IconChevronLeft,
  IconChevronRight,
  IconTrash,
  IconX,
  IconDotsVertical,
} from "@tabler/icons-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ACTION_TYPES = [
  "click",
  "type",
  "select",
  "hover",
  "drag",
  "right_click",
  "double_click",
  "scroll",
  "swipe",
  "long_press",
  "focus",
];

const ELEMENT_TYPES = [
  "Icon",
  "Menu Item",
  "Radio Button",
  "Text Input",
  "Slider",
  "Checkbox",
  "Button",
  "Text",
  "Link",
  "Dropdown",
  "Tab",
  "Toggle",
  "Avatar",
  "Badge",
  "Close Button",
];

const CATEGORY_MAP: Record<string, number> = {
  click: 1,
  type: 2,
  select: 3,
  hover: 4,
  drag: 5,
  right_click: 6,
  double_click: 7,
  scroll: 8,
  swipe: 9,
  long_press: 10,
  focus: 11,
};

const DEFAULT_CATEGORIES = ACTION_TYPES.map((name, i) => ({
  id: i + 1,
  name,
  supercategory: "interaction",
}));

interface AnnotationAttrs {
  task_description: string;
  action_type: string;
  element_info: string;
  custom_metadata: Record<string, string>;
}

interface Annotation {
  id: number;
  bbox?: [number, number, number, number];
  keypoints?: [number, number, number];
  task_description: string;
  action_type: string;
  element_info: string;
  custom_metadata: Record<string, string>;
}

interface Frame {
  id: number;
  dataUrl: string;
  width: number;
  height: number;
  timestamp: string;
  annotations: Annotation[];
  sequenceId?: string;
  sequencePosition?: number;
  previousAnnotation?: Annotation;
}

interface DatasetImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
  date_captured?: string;
  application?: string;
  platform?: string;
  sequence_id?: string;
  sequence_position?: number;
  sequence_description?: string;
}

function round3(v: number) {
  return Math.round(v * 1000) / 1000;
}

/** Clamp value to [min, max] for coordinate rigidity. */
function clampCoord(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Clamp annotation bbox/keypoints to valid image bounds before save/export. */
function clampAnnotation(
  ann: { bbox?: number[]; keypoints?: number[] },
  width: number,
  height: number
): { bbox?: [number, number, number, number]; keypoints?: [number, number, number] } {
  const result: { bbox?: [number, number, number, number]; keypoints?: [number, number, number] } = {};
  if (ann.keypoints && ann.keypoints.length >= 2) {
    result.keypoints = [
      clampCoord(ann.keypoints[0], 0, width),
      clampCoord(ann.keypoints[1], 0, height),
      (ann.keypoints[2] ?? 2) as number,
    ];
  }
  if (ann.bbox && ann.bbox.length >= 4) {
    let [x, y, w, h] = ann.bbox as [number, number, number, number];
    x = clampCoord(x, 0, width - 1);
    y = clampCoord(y, 0, height - 1);
    w = Math.max(1, Math.min(w, width - x));
    h = Math.max(1, Math.min(h, height - y));
    result.bbox = [x, y, w, h];
  }
  return result;
}

function AutocompleteTextarea({
  value,
  onChange,
  suggestions,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: Set<string>;
  placeholder?: string;
  rows?: number;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!value || value.trim().length < 2) return [];
    const words = value.toLowerCase().split(/\s+/).filter(Boolean);
    return Array.from(suggestions)
      .filter((s) => words.every((w) => s.toLowerCase().includes(w)))
      .slice(0, 5);
  }, [suggestions, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Textarea
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(e.target.value.trim().length >= 2);
            }}
            onFocus={() => value.trim().length >= 2 && setOpen(true)}
            placeholder={placeholder}
            rows={rows}
            className="resize-none"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <ScrollArea className="max-h-48">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#A577FF]/10 rounded-sm"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export default function DatasetCreatorPage() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [currentFrame, setCurrentFrame] = useState<Frame | null>(null);
  const [mode, setMode] = useState<"idle" | "streaming" | "annotating" | "drawing">("idle");
  const [drawing, setDrawing] = useState<"bbox" | "point" | null>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [previewBbox, setPreviewBbox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [nextFrameId, setNextFrameId] = useState(1);
  const [nextAnnotationId, setNextAnnotationId] = useState(1);
  const nextFrameIdRef = useRef(1);
  const nextAnnotationIdRef = useRef(1);
  const [status, setStatus] = useState("Ready");
  const [fileStatus, setFileStatus] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [appMode, setAppMode] = useState<"capture" | "review">("capture");
  const [currentSampleIndex, setCurrentSampleIndex] = useState(-1);
  const [filteredSamples, setFilteredSamples] = useState<DatasetImage[]>([]);
  const loadedSampleCache = useRef<Map<number, string>>(new Map());

  const [currentSequence, setCurrentSequence] = useState<{
    id: string;
    task: string;
    frames: number[];
    tempId?: boolean;
  } | null>(null);
  const [sequenceHistory, setSequenceHistory] = useState<{ action: string; timestamp: string }[]>([]);

  const [dataset, setDataset] = useState<{
    images: DatasetImage[];
    annotations: { id: number; image_id: number; bbox?: number[]; keypoints?: number[]; category_id: number; area?: number; iscrowd: number; attributes: AnnotationAttrs }[];
  }>({
    images: [],
    annotations: [],
  });
  const [taskDescriptions, setTaskDescriptions] = useState<Set<string>>(new Set());
  const [sequenceTasks, setSequenceTasks] = useState<Set<string>>(new Set());

  const [application, setApplication] = useState("");
  const [platform, setPlatform] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    nextFrameIdRef.current = nextFrameId;
  }, [nextFrameId]);
  useEffect(() => {
    nextAnnotationIdRef.current = nextAnnotationId;
  }, [nextAnnotationId]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showFileStatus = (msg: string, type: "success" | "error") => {
    setFileStatus({ msg, type });
    setTimeout(() => setFileStatus(null), 5000);
  };

  const getCoords = useCallback(
    (clientX: number, clientY: number, containerEl?: HTMLElement | null) => {
      const el = containerEl ?? containerRef.current;
      const img = currentFrame ? { width: currentFrame.width, height: currentFrame.height } : null;
      if (!el || !img) return null;
      const imgEl = el.querySelector("img");
      if (!imgEl) return null;
      const imgRect = imgEl.getBoundingClientRect();
      const scaleX = img.width / imgRect.width;
      const scaleY = img.height / imgRect.height;
      const x = (clientX - imgRect.left) * scaleX;
      const y = (clientY - imgRect.top) * scaleY;
      return {
        x: clampCoord(x, 0, img.width),
        y: clampCoord(y, 0, img.height),
      };
    },
    [currentFrame]
  );

  const startStream = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" } as MediaTrackConstraints,
        audio: false,
      });
      setStream(s);
      setMode("streaming");
      setStatus("Live streaming - interact with your window and capture when ready");
      s.getVideoTracks()[0].addEventListener("ended", () => stopStream());
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  }, []);

  const stopStream = useCallback(() => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setMode("idle");
    setCurrentFrame(null);
    setSelectedAnnotation(null);
    setStatus("Stream stopped");
  }, [stream]);

  const discardAll = useCallback(() => {
    if (!confirm("Discard all images and annotations and start over? This cannot be undone.")) return;
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setMode("idle");
    setCurrentFrame(null);
    setSelectedAnnotation(null);
    setDataset({ images: [], annotations: [] });
    setCurrentSequence(null);
    setSequenceHistory([]);
    setAppMode("capture");
    setCurrentSampleIndex(-1);
    setFilteredSamples([]);
    setTaskDescriptions(new Set());
    setSequenceTasks(new Set());
    setNextFrameId(1);
    setNextAnnotationId(1);
    nextFrameIdRef.current = 1;
    nextAnnotationIdRef.current = 1;
    loadedSampleCache.current.clear();
    setStatus("Ready");
    showFileStatus("All discarded. Ready to start over.", "success");
  }, [stream]);

  const refreshStream = useCallback(async () => {
    if (!stream || !currentFrame) return;
    if (!confirm("You have unsaved annotations. Refresh stream anyway?")) return;
    try {
      const track = stream.getVideoTracks()[0];
      if (track) await track.applyConstraints({ width: { ideal: 1920 }, height: { ideal: 1080 } });
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        await new Promise((r) => setTimeout(r, 100));
        videoRef.current.srcObject = stream;
      }
      setCurrentFrame(null);
      setSelectedAnnotation(null);
      setMode("streaming");
      setStatus("Stream refreshed");
    } catch (e) {
      setStatus(`Refresh error: ${(e as Error).message}`);
    }
  }, [stream, currentFrame]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!stream || !video || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");

    let prevAnn: Annotation | undefined;
    if (sequenceHistory.length > 0) {
      const last = sequenceHistory[sequenceHistory.length - 1];
      const lastFrameAnns = dataset.annotations.filter((a) => {
        const img = dataset.images.find((i) => i.id === currentSequence?.frames[currentSequence.frames.length - 1]);
        return img && a.image_id === img.id;
      });
      if (lastFrameAnns.length > 0) prevAnn = lastFrameAnns[lastFrameAnns.length - 1] as unknown as Annotation;
    }

    const frameId = nextFrameIdRef.current++;
    const frame: Frame = {
      id: frameId,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      timestamp: new Date().toISOString(),
      annotations: [],
      sequenceId: currentSequence?.id,
      sequencePosition: currentSequence ? currentSequence.frames.length + 1 : undefined,
      previousAnnotation: prevAnn,
    };
    setNextFrameId(nextFrameIdRef.current);
    setCurrentFrame(frame);
    setMode("annotating");
    setStatus(`Frame ${frame.id} captured - add annotations`);
  }, [stream, currentSequence, sequenceHistory, dataset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCoords(e.clientX, e.clientY, e.currentTarget as HTMLElement);
    if (!coords || !currentFrame) return;
    if (drawing === "bbox") {
      e.preventDefault();
      setStart(coords);
      startRef.current = coords;
      setPreviewBbox(null);
      attachBboxListeners();
    } else if (drawing === "point") {
      const id = nextAnnotationIdRef.current++;
      setNextAnnotationId(id + 1);
      const ann: Annotation = {
        id,
        keypoints: [coords.x, coords.y, 2],
        task_description: "",
        action_type: "click",
        element_info: "",
        custom_metadata: {},
      };
      setCurrentFrame((f) => (f ? { ...f, annotations: [...f.annotations, ann] } : null));
      setSelectedAnnotation(ann);
      setDrawing(null);
      setMode("annotating");
    }
  };

  const finishBboxDraw = useCallback(
    (clientX: number, clientY: number) => {
      const st = startRef.current;
      startRef.current = null;
      if (!st || !currentFrame) return;
      const coords = getCoords(clientX, clientY);
      if (!coords) {
        setStart(null);
        setPreviewBbox(null);
        return;
      }
      const { width: imgW, height: imgH } = currentFrame;
      const x1 = clampCoord(Math.min(st.x, coords.x), 0, imgW - 1);
      const y1 = clampCoord(Math.min(st.y, coords.y), 0, imgH - 1);
      let w = Math.max(5, Math.abs(coords.x - st.x));
      let h = Math.max(5, Math.abs(coords.y - st.y));
      w = Math.min(w, imgW - x1);
      h = Math.min(h, imgH - y1);
      const id = nextAnnotationIdRef.current++;
      const ann: Annotation = {
        id,
        bbox: [x1, y1, w, h],
        keypoints: [x1 + w / 2, y1 + h / 2, 2],
        task_description: "",
        action_type: "click",
        element_info: "",
        custom_metadata: {},
      };
      setNextAnnotationId(nextAnnotationIdRef.current);
      setCurrentFrame((f) => {
        if (!f) return null;
        if (f.annotations.some((a) => a.id === id)) return f;
        return { ...f, annotations: [...f.annotations, ann] };
      });
      setSelectedAnnotation(ann);
      setStart(null);
      setPreviewBbox({ x: x1, y: y1, w, h });
      setDrawing(null);
      setMode("annotating");
    },
    [currentFrame, getCoords]
  );

  const attachBboxListeners = useCallback(() => {
    const onMove = (e: MouseEvent) => {
      const st = startRef.current;
      if (!st) return;
      const coords = getCoords(e.clientX, e.clientY);
      if (!coords) return;
      const x1 = Math.min(st.x, coords.x);
      const y1 = Math.min(st.y, coords.y);
      const w = Math.max(0, Math.abs(coords.x - st.x));
      const h = Math.max(0, Math.abs(coords.y - st.y));
      setPreviewBbox({ x: x1, y: y1, w, h });
    };
    const onUp = (e: MouseEvent) => {
      finishBboxDraw(e.clientX, e.clientY);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [getCoords, finishBboxDraw]);

  const handleMouseMove = () => {};

  const handleMouseUp = () => {
    if (drawing === "bbox") return;
  };

  const selectAnnotation = (ann: Annotation) => {
    setSelectedAnnotation(ann);
  };

  const saveAnnotation = () => {
    if (!selectedAnnotation || !currentFrame) return;
    const idx = currentFrame.annotations.findIndex((a) => a.id === selectedAnnotation.id);
    if (idx === -1) return;
    const taskDesc = selectedAnnotation.task_description;
    const actionType = selectedAnnotation.action_type;
    const elementInfo = selectedAnnotation.element_info;
    if (taskDesc) setTaskDescriptions((s) => new Set(s).add(taskDesc));
    const updated: Annotation = {
      ...selectedAnnotation,
      task_description: taskDesc,
      action_type: actionType,
      element_info: elementInfo,
    };
    const anns = [...currentFrame.annotations];
    anns[idx] = updated;
    setCurrentFrame({ ...currentFrame, annotations: anns });
    setSelectedAnnotation(updated);
    setStatus(`Annotation ${updated.id} saved`);
  };

  const deleteAnnotation = (ann: Annotation) => {
    if (!currentFrame) return;
    if (!confirm(`Delete annotation ${ann.id}?`)) return;
    const remaining = currentFrame.annotations.filter((a) => a.id !== ann.id);
    setCurrentFrame({
      ...currentFrame,
      annotations: remaining,
    });
    if (selectedAnnotation?.id === ann.id) setSelectedAnnotation(null);
    if (remaining.length === 0) {
      nextAnnotationIdRef.current = 1;
      setNextAnnotationId(1);
    }
  };

  const startSequence = useCallback(async () => {
    const task = prompt("Enter the overall description for this sequence:");
    if (task === null) return;
    const t = task.trim();
    if (t) setSequenceTasks((s) => new Set(s).add(t));
    setCurrentSequence({
      id: `temp_seq_${Date.now()}`,
      task: t,
      frames: [],
      tempId: true,
    });
    setSequenceHistory([]);
    setStatus("Started sequence");
    if (!stream) await startStream();
  }, [stream, startStream]);

  const endSequence = () => {
    if (!currentSequence) return;
    setCurrentSequence(null);
    setSequenceHistory([]);
    setStatus("Sequence ended");
    switchToReview();
  };

  const saveCurrentFrame = async () => {
    if (!currentFrame) return;
    const ts = new Date(currentFrame.timestamp).toISOString().replace(/:/g, "-").replace(/\..+Z$/, "").replace("T", "_");
    const imageFilename = `${ts}.png`;
    const folder = "data";

    let seqId = currentFrame.sequenceId;
    if (currentSequence?.tempId && currentSequence.frames.length === 0) {
      seqId = imageFilename.replace(".png", "");
      setCurrentSequence((s) => (s ? { ...s, id: seqId!, tempId: false, frames: [...s.frames, currentFrame.id] } : null));
    } else if (currentSequence) {
      setCurrentSequence((s) => (s ? { ...s, frames: [...s.frames, currentFrame.id] } : null));
    }

    try {
      const imgRes = await apiFetch("/api/datasets/save-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: imageFilename,
          data: currentFrame.dataUrl,
          folder,
        }),
      });
      if (!imgRes.ok) throw new Error("Failed to save image");

      const imageEntry: DatasetImage = {
        id: currentFrame.id,
        file_name: imageFilename,
        width: currentFrame.width,
        height: currentFrame.height,
        date_captured: currentFrame.timestamp,
        application: application || undefined,
        platform: platform || undefined,
        sequence_id: seqId,
        sequence_position: currentFrame.sequencePosition,
        sequence_description: currentSequence?.task,
      };

      const clamped = currentFrame.annotations.map((ann) =>
        clampAnnotation(ann, currentFrame.width, currentFrame.height)
      );
      const cocoAnns = currentFrame.annotations.map((ann, i) => {
        const c = clamped[i];
        return {
          id: ann.id,
          image_id: currentFrame.id,
          category_id: CATEGORY_MAP[ann.action_type] ?? 1,
          bbox: c.bbox ?? ann.bbox,
          keypoints: c.keypoints ?? ann.keypoints,
          area: c.bbox ? c.bbox[2] * c.bbox[3] : ann.bbox ? ann.bbox[2] * ann.bbox[3] : 0,
          iscrowd: 0,
          attributes: {
            task_description: ann.task_description,
            action_type: ann.action_type,
            element_info: ann.element_info,
            custom_metadata: ann.custom_metadata,
          },
        };
      });

      setDataset((d) => ({
        images: [...d.images, imageEntry],
        annotations: [...d.annotations, ...cocoAnns],
      }));

      currentFrame.annotations.forEach((a) => {
        const desc = a.task_description || `${a.action_type} on ${a.element_info || "element"}`;
        setSequenceHistory((h) => [...h, { action: desc, timestamp: new Date().toISOString() }]);
      });

      const jsonFilename = "annotations_coco.json";
      const coco = {
        info: { description: "GUI Dataset", version: "1.0", year: new Date().getFullYear(), date_created: new Date().toISOString() },
        categories: DEFAULT_CATEGORIES,
        images: [...dataset.images, imageEntry],
        annotations: [...dataset.annotations, ...cocoAnns],
      };
      const jsonRes = await apiFetch("/api/datasets/save-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: jsonFilename, data: coco, folder }),
      });
      if (!jsonRes.ok) throw new Error("Failed to save JSON");

      const annCount = currentFrame.annotations.length;
      loadedSampleCache.current.set(currentFrame.id, currentFrame.dataUrl);
      if (currentSequence) {
        setCurrentFrame(null);
        setSelectedAnnotation(null);
        setMode("streaming");
        showFileStatus(`Frame saved. Capture next or End Sequence.`, "success");
        setStatus(`Frame saved with ${annCount} annotations`);
      } else {
        setCurrentFrame(null);
        setSelectedAnnotation(null);
        setMode("streaming");
        showFileStatus(`Frame saved. View in Review/Edit.`, "success");
        setStatus(`Frame saved with ${annCount} annotations`);
        switchToReview([...dataset.images, imageEntry]);
      }
    } catch (e) {
      showFileStatus(`Error: ${(e as Error).message}`, "error");
    }
  };

  const getEffectiveDataset = useCallback(() => {
    if (appMode !== "review" || !currentFrame) return { images: dataset.images, annotations: dataset.annotations };
    const clamped = currentFrame.annotations.map((ann) =>
      clampAnnotation(ann, currentFrame.width, currentFrame.height)
    );
    const cocoAnns = currentFrame.annotations.map((ann, i) => {
      const c = clamped[i];
      return {
        ...ann,
        id: ann.id,
        image_id: currentFrame.id,
        category_id: CATEGORY_MAP[ann.action_type] ?? 1,
        bbox: c.bbox ?? ann.bbox,
        keypoints: c.keypoints ?? ann.keypoints,
        area: c.bbox ? c.bbox[2] * c.bbox[3] : ann.bbox ? (ann.bbox[2] ?? 0) * (ann.bbox[3] ?? 0) : 0,
        iscrowd: 0,
        attributes: {
          task_description: ann.task_description,
          action_type: ann.action_type,
          element_info: ann.element_info,
          custom_metadata: ann.custom_metadata || {},
        },
      };
    });
    const mergedAnnotations = [
      ...dataset.annotations.filter((a) => a.image_id !== currentFrame.id),
      ...cocoAnns.map(({ id, image_id, category_id, bbox, keypoints, area, iscrowd, attributes }) => ({
        id,
        image_id,
        category_id,
        bbox,
        keypoints,
        area,
        iscrowd,
        attributes,
      })),
    ];
    const mergedImages = dataset.images.map((im) =>
      im.id === currentFrame.id ? { ...im, application: application || im.application, platform: platform || im.platform } : im
    );
    return { images: mergedImages, annotations: mergedAnnotations };
  }, [appMode, currentFrame, dataset, application, platform]);

  const exportDataset = async () => {
    const { images: effectiveImages, annotations: effectiveAnnotations } = getEffectiveDataset();
    const folder = "data";
    const filename = "annotations_coco.json";
    let imagesToExport = effectiveImages;
    let annotationsToExport = effectiveAnnotations;
    try {
      const loadRes = await apiFetch(
        `/api/datasets/load?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(filename)}&t=${Date.now()}`,
        { cache: "no-store" }
      );
      if (loadRes.ok) {
        const existing = (await loadRes.json()) as {
          images?: DatasetImage[];
          annotations?: { id: number; image_id: number; bbox?: number[]; keypoints?: number[]; category_id: number; area?: number; iscrowd: number; attributes: AnnotationAttrs }[];
        };
        const rawImages = existing.images || [];
        const rawAnnotations = existing.annotations || [];
        const dedupedImages = Array.from(
          new Map(rawImages.map((img) => [img.id, img])).values()
        );
        const dedupedAnnotations = Array.from(
          new Map(rawAnnotations.map((ann) => [ann.id, ann])).values()
        );
        const currentIds = new Set(effectiveImages.map((i) => i.id));
        const mergedImages = [
          ...dedupedImages.filter((e) => !currentIds.has(e.id)),
          ...effectiveImages,
        ];
        const mergedAnnotations = [
          ...dedupedAnnotations.filter((a) => !currentIds.has(a.image_id)),
          ...effectiveAnnotations,
        ];
        imagesToExport = mergedImages;
        annotationsToExport = mergedAnnotations;
      }
    } catch {
      // 404 or other error: use current dataset only (first-time export)
    }
    const imgById = Object.fromEntries(imagesToExport.map((img) => [img.id, img]));
    const annotations = annotationsToExport.map((ann) => {
      const img = imgById[ann.image_id];
      if (!img) return ann;
      const c = clampAnnotation(ann, img.width, img.height);
      return { ...ann, bbox: c.bbox ?? ann.bbox, keypoints: c.keypoints ?? ann.keypoints };
    });
    const coco = {
      info: { description: "GUI Dataset", version: "1.0", year: new Date().getFullYear() },
      categories: DEFAULT_CATEGORIES,
      images: imagesToExport,
      annotations,
    };
    try {
      const res = await apiFetch("/api/datasets/save-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, data: coco, folder }),
      });
      if (!res.ok) throw new Error("Export failed");
      showFileStatus(`Exported to ${folder}/${filename}`, "success");
    } catch (e) {
      showFileStatus(`Export error: ${(e as Error).message}`, "error");
    }
  };

  const loadDataset = async () => {
    try {
      if ("showDirectoryPicker" in window) {
        const dir = await (window as unknown as { showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: "read" });
        const jsonFiles: { name: string; file: File }[] = [];
        type DirWithEntries = FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };
        for await (const [name, handle] of (dir as DirWithEntries).entries()) {
          if (handle.kind === "file" && name.endsWith(".json")) {
            const f = await (handle as FileSystemFileHandle).getFile();
            jsonFiles.push({ name, file: f });
          }
        }
        if (jsonFiles.length === 0) {
          alert("No JSON annotation files found.");
          return;
        }
        const selected = jsonFiles.length === 1 ? jsonFiles[0] : jsonFiles[0];
        const text = await selected.file.text();
        const data = JSON.parse(text);
        setDataset({ images: data.images || [], annotations: data.annotations || [] });
        (data.annotations || []).forEach((a: { attributes?: { task_description?: string } }) => {
          if (a.attributes?.task_description) setTaskDescriptions((s) => new Set(s).add(a.attributes!.task_description!));
        });
        (data.images || []).forEach((img: { sequence_description?: string; sequence_task?: string }) => {
          const desc = img.sequence_description || img.sequence_task;
          if (desc) setSequenceTasks((s) => new Set(s).add(desc));
        });
        const nextImgId = Math.max(1, ...(data.images || []).map((i: { id: number }) => i.id)) + 1;
        const nextAnnId = Math.max(1, ...(data.annotations || []).map((a: { id: number }) => a.id)) + 1;
        nextFrameIdRef.current = nextImgId;
        nextAnnotationIdRef.current = nextAnnId;
        setNextFrameId(nextImgId);
        setNextAnnotationId(nextAnnId);
        showFileStatus(`Loaded ${data.images?.length || 0} images`, "success");
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.webkitdirectory = true;
        input.multiple = true;
        input.accept = ".json,image/*";
        input.onchange = async (ev) => {
          const files = Array.from((ev.target as HTMLInputElement).files || []);
          const jsonFile = files.find((f) => f.name.endsWith(".json"));
          if (!jsonFile) {
            alert("No JSON file in selected folder.");
            return;
          }
          const text = await jsonFile.text();
          const data = JSON.parse(text);
          setDataset({ images: data.images || [], annotations: data.annotations || [] });
          showFileStatus(`Loaded ${data.images?.length || 0} images`, "success");
        };
        input.click();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") showFileStatus(`Load error: ${(e as Error).message}`, "error");
    }
  };

  const switchToReview = (imagesOverride?: DatasetImage[]) => {
    setAppMode("review");
    const images = imagesOverride ?? dataset.images;
    const sorted = [...images].sort(
      (a, b) => new Date(a.date_captured || 0).getTime() - new Date(b.date_captured || 0).getTime()
    );
    setFilteredSamples(sorted);
    if (sorted.length > 0) setCurrentSampleIndex(sorted.length - 1);
    if (stream) stopStream();
  };

  const switchToCapture = () => {
    if (appMode === "review" && currentFrame) {
      persistCurrentSampleToDataset();
    }
    setAppMode("capture");
    setCurrentSampleIndex(-1);
  };

  const persistCurrentSampleToDataset = useCallback(() => {
    if (!currentFrame) return;
    const img = dataset.images.find((i) => i.id === currentFrame.id);
    if (!img) return;
    const clamped = currentFrame.annotations.map((ann) =>
      clampAnnotation(ann, currentFrame.width, currentFrame.height)
    );
    const cocoAnns = currentFrame.annotations.map((ann, i) => {
      const c = clamped[i];
      return {
        id: ann.id,
        image_id: currentFrame.id,
        category_id: CATEGORY_MAP[ann.action_type] ?? 1,
        bbox: c.bbox ?? ann.bbox,
        keypoints: c.keypoints ?? ann.keypoints,
        area: c.bbox ? c.bbox[2] * c.bbox[3] : ann.bbox ? ann.bbox[2] * (ann.bbox[3] ?? 0) : 0,
        iscrowd: 0,
        attributes: {
          task_description: ann.task_description,
          action_type: ann.action_type,
          element_info: ann.element_info,
          custom_metadata: ann.custom_metadata || {},
        },
      };
    });
    const maxAnnId = Math.max(0, ...cocoAnns.map((a) => a.id), ...dataset.annotations.map((a) => a.id));
    nextAnnotationIdRef.current = Math.max(nextAnnotationIdRef.current, maxAnnId + 1);
    setNextAnnotationId(nextAnnotationIdRef.current);
    setDataset((d) => ({
      ...d,
      images: d.images.map((im) =>
        im.id === currentFrame.id
          ? { ...im, application: application || im.application, platform: platform || im.platform }
          : im
      ),
      annotations: [...d.annotations.filter((a) => a.image_id !== currentFrame.id), ...cocoAnns],
    }));
  }, [currentFrame, dataset, application, platform]);

  const loadSample = useCallback(
    async (index: number) => {
      if (index < 0 || index >= filteredSamples.length) return;
      const sample = filteredSamples[index];
      if (currentFrame && currentFrame.id !== sample.id) {
        persistCurrentSampleToDataset();
      }
      setCurrentSampleIndex(index);
      let dataUrl = loadedSampleCache.current.get(sample.id);
      if (!dataUrl) {
        try {
          const res = await apiFetch(`/api/datasets/image?folder=data&file=${encodeURIComponent(sample.file_name)}`);
          const data = await res.json();
          const imgRes = await fetch(data.url);
          const blob = await imgRes.blob();
          dataUrl = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.readAsDataURL(blob);
          });
          loadedSampleCache.current.set(sample.id, dataUrl);
        } catch {
          setStatus("Failed to load image");
          return;
        }
      }
      const frameAnns = dataset.annotations.filter((a) => a.image_id === sample.id);
      const frame: Frame = {
        id: sample.id,
        dataUrl,
        width: sample.width,
        height: sample.height,
        timestamp: sample.date_captured || "",
        annotations: frameAnns.map((a) => ({
          id: a.id,
          bbox: a.bbox as [number, number, number, number] | undefined,
          keypoints: a.keypoints as [number, number, number] | undefined,
          task_description: a.attributes.task_description,
          action_type: a.attributes.action_type,
          element_info: a.attributes.element_info,
          custom_metadata: a.attributes.custom_metadata || {},
        })),
      };
      setCurrentFrame(frame);
      setApplication(sample.application || "");
      setPlatform(sample.platform || "");
      setMode("annotating");
      setStatus(`Sample ${index + 1} of ${filteredSamples.length}`);
    },
    [filteredSamples, dataset, currentFrame, persistCurrentSampleToDataset]
  );

  useEffect(() => {
    if (appMode === "review" && filteredSamples.length > 0 && currentSampleIndex >= 0) {
      loadSample(currentSampleIndex);
    }
  }, [appMode, currentSampleIndex, filteredSamples.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName);
      if (e.key === "Delete" && selectedAnnotation && !isTyping) {
        deleteAnnotation(selectedAnnotation);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        if (stream && !currentFrame) refreshStream();
      } else if (appMode === "review" && !isTyping) {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          setCurrentSampleIndex((i) => Math.max(0, i - 1));
        } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          setCurrentSampleIndex((i) => Math.min(filteredSamples.length - 1, i + 1));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedAnnotation, stream, currentFrame, appMode, filteredSamples.length]);

  const scaleX = currentFrame && containerRef.current
    ? (containerRef.current.querySelector("img")?.getBoundingClientRect().width ?? 1) / currentFrame.width
    : 1;
  const scaleY = currentFrame && containerRef.current
    ? (containerRef.current.querySelector("img")?.getBoundingClientRect().height ?? 1) / currentFrame.height
    : 1;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <div className="flex flex-1 flex-col min-h-0 border-r border-[#A577FF]/20">
        <div className="flex flex-wrap items-center gap-2 p-4 bg-[#F5F7FC] border-b border-[#A577FF]/20">
          <ButtonGroup aria-label="Capture and sequence">
            <Button
              size="sm"
              onClick={stream ? stopStream : startStream}
              variant={stream ? "destructive" : "default"}
              className={!stream ? "echo-btn-cyan-lavender" : undefined}
            >
              {stream ? (
                <><IconSquare className="h-4 w-4 mr-1.5" /> Stop Live Capture</>
              ) : (
                <><IconVideo className="h-4 w-4 mr-1.5" /> Start Live Capture</>
              )}
            </Button>
            <Button
              size="sm"
              onClick={currentSequence ? endSequence : startSequence}
              variant={currentSequence ? "destructive" : "outline"}
              className={!currentSequence ? "echo-btn-secondary" : undefined}
            >
              {currentSequence ? (
                <><IconPlayerStop className="h-4 w-4 mr-1.5" /> End Sequence</>
              ) : (
                <><IconPlayerPlay className="h-4 w-4 mr-1.5" /> Start Sequence</>
              )}
            </Button>
            {currentSequence && (
              <span className="rounded-lg bg-echo-success text-white px-3 py-1.5 text-sm font-medium ml-1">
                {currentSequence.id} ({currentSequence.frames.length})
              </span>
            )}
          </ButtonGroup>
          <ButtonGroup aria-label="Capture frame">
            <Button size="sm" variant="outline" onClick={captureFrame} disabled={!stream} className="echo-btn-secondary">
              <IconPhoto className="h-4 w-4 mr-1.5" /> Capture Frame
            </Button>
          </ButtonGroup>
          <ButtonGroup aria-label="Annotation tools">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDrawing(drawing === "bbox" ? null : "bbox")}
              disabled={!currentFrame}
              className={drawing === "bbox" ? "border-[#A577FF] bg-[#A577FF]/10 text-[#150A35]" : "border-[#A577FF]/40 hover:bg-[#A577FF]/10"}
            >
              <IconPlus className="h-4 w-4 mr-1.5" /> Draw Bbox
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDrawing(drawing === "point" ? null : "point")}
              disabled={!currentFrame}
              className={drawing === "point" ? "border-[#A577FF] bg-[#A577FF]/10 text-[#150A35]" : "border-[#A577FF]/40 hover:bg-[#A577FF]/10"}
            >
              <IconPlus className="h-4 w-4 mr-1.5" /> Add Point
            </Button>
          </ButtonGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="echo-btn-secondary" aria-label="More actions">
                <IconDotsVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={refreshStream} disabled={!stream || !!currentFrame}>
                <IconArrowsMaximize className="h-4 w-4" /> Refresh Stream
              </DropdownMenuItem>
              <DropdownMenuItem onClick={loadDataset}>
                <IconFolderOpen className="h-4 w-4" /> Browse Dataset
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={discardAll}>
                <IconTrash className="h-4 w-4" /> Discard All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div ref={containerRef} className="flex-1 flex items-center justify-center bg-[#150A35]/5 overflow-auto p-4">
          {stream && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={currentFrame ? "hidden" : "max-w-full max-h-full"}
            />
          )}
          {currentFrame && (
            <div className="relative inline-block" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseMove={handleMouseMove}>
              <img src={currentFrame.dataUrl} alt="frame" className="max-w-full h-auto block" style={{ cursor: drawing ? "crosshair" : "default" }} />
              {previewBbox && (
                <div
                  style={{
                    position: "absolute",
                    left: previewBbox.x * scaleX,
                    top: previewBbox.y * scaleY,
                    width: previewBbox.w * scaleX,
                    height: previewBbox.h * scaleY,
                    border: "2px dashed #A577FF",
                    background: "rgba(165, 119, 255, 0.15)",
                    pointerEvents: "none",
                  }}
                />
              )}
              {currentFrame.annotations.map((ann, idx) => {
                const isPoint = !!ann.keypoints;
                const isSelected = selectedAnnotation?.id === ann.id;
                const annKey = `ann-${currentFrame.id}-${ann.id}-${idx}`;
                if (isPoint && ann.keypoints) {
                  return (
                    <div
                      key={annKey}
                      onClick={(e) => { e.stopPropagation(); (drawing ? null : selectAnnotation(ann)); }}
                      style={{
                        position: "absolute",
                        left: ann.keypoints[0] * scaleX - 12,
                        top: ann.keypoints[1] * scaleY - 12,
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        border: `2px solid ${isSelected ? "#A577FF" : "#0066ff"}`,
                        background: isSelected ? "rgba(165,119,255,0.8)" : "rgba(0,102,255,0.8)",
                        color: "white",
                        fontSize: 12,
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: drawing ? "none" : "auto",
                      }}
                    >
                      {ann.id}
                    </div>
                  );
                }
                if (ann.bbox) {
                  return (
                    <div
                      key={annKey}
                      onClick={(e) => { e.stopPropagation(); (drawing ? null : selectAnnotation(ann)); }}
                      style={{
                        position: "absolute",
                        left: ann.bbox[0] * scaleX,
                        top: ann.bbox[1] * scaleY,
                        width: ann.bbox[2] * scaleX,
                        height: ann.bbox[3] * scaleY,
                        border: `2px dashed ${isSelected ? "#A577FF" : "#ef4444"}`,
                        background: isSelected ? "rgba(165,119,255,0.15)" : "rgba(239,68,68,0.15)",
                        pointerEvents: drawing ? "none" : "auto",
                        overflow: "visible",
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 2,
                          left: 2,
                          background: isSelected ? "#A577FF" : "#ef4444",
                          color: "white",
                          padding: "2px 6px",
                          fontSize: 12,
                          borderRadius: 4,
                          zIndex: 1,
                        }}
                      >
                        {ann.id}
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
          {!stream && !currentFrame && (
            <div className="text-echo-text-muted text-center">
              <p>No capture active</p>
              <p className="mt-2 text-sm">Click &quot;Start Live Capture&quot; to begin</p>
            </div>
          )}
        </div>

        <div className="px-4 py-2 bg-[#F5F7FC] border-t border-[#A577FF]/20 flex justify-between items-center text-sm text-echo-text-muted">
          <span>{status}</span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${mode === "streaming" ? "bg-echo-success text-white" : mode === "drawing" ? "bg-amber-400 text-black" : "bg-gray-200"}`}>
            {mode === "idle" ? "Idle" : mode === "streaming" ? "Streaming" : mode === "drawing" ? "Drawing" : "Annotating"}
          </span>
        </div>
      </div>

      <div className="w-[420px] flex flex-col bg-white border-l border-[#A577FF]/20 overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white border-b border-[#A577FF]/20">
          <h2 className="text-base font-semibold text-[#150A35]">
            {appMode === "capture" ? "Live Capture" : "Review/Edit"}
          </h2>
          {appMode === "review" && (
            <Button size="sm" variant="ghost" className="text-sm text-[#A577FF] hover:bg-[#A577FF]/10 -mr-2" onClick={switchToCapture}>
              ← Back to Capture
            </Button>
          )}
        </div>

        <div className="p-4 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-[#A577FF]">{dataset.images.length}</div>
              <div className="text-xs text-echo-text-muted mt-1">Images</div>
            </div>
            <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-[#A577FF]">{dataset.annotations.length}</div>
              <div className="text-xs text-echo-text-muted mt-1">Annotations</div>
            </div>
          </div>

          {appMode === "review" && filteredSamples.length > 0 && (
            <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] p-4">
              <h3 className="text-sm font-semibold text-[#150A35] mb-3">Sample Navigation</h3>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-echo-text-muted">{currentSampleIndex >= 0 ? `${currentSampleIndex + 1} of ${filteredSamples.length}` : "-"}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={currentSampleIndex <= 0} onClick={() => setCurrentSampleIndex((i) => Math.max(0, i - 1))} className="echo-btn-secondary">
                    <IconChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" disabled={currentSampleIndex >= filteredSamples.length - 1} onClick={() => setCurrentSampleIndex((i) => Math.min(filteredSamples.length - 1, i + 1))} className="echo-btn-secondary">
                    <IconChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#150A35]">Frame Info</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-echo-text-muted">Application</Label>
                <Input value={application} onChange={(e) => setApplication(e.target.value)} placeholder="e.g., Chrome, VSCode" className="mt-1" />
              </div>
              <div>
                <Label className="text-echo-text-muted">Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select platform" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Windows">Windows</SelectItem>
                    <SelectItem value="macOS">macOS</SelectItem>
                    <SelectItem value="Linux">Linux</SelectItem>
                    <SelectItem value="Web">Web Browser</SelectItem>
                    <SelectItem value="Mobile">Mobile</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

        {currentSequence && (
          <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] p-4">
            <h3 className="text-sm font-semibold text-[#150A35] mb-2">Sequence</h3>
            <p className="text-xs text-echo-text-muted mb-1">ID: {currentSequence.id}</p>
            <p className="text-xs text-echo-text-muted mb-3">Frames: {currentSequence.frames.length}</p>
            <Label className="text-echo-text-muted">Sequence Description</Label>
            <AutocompleteTextarea
              value={currentSequence.task}
              onChange={(v) => setCurrentSequence((s) => (s ? { ...s, task: v } : null))}
              suggestions={sequenceTasks}
              placeholder="Overall sequence description..."
              rows={2}
            />
            <ScrollArea className="h-32 mt-2 border border-[#A577FF]/20 rounded-lg p-3 bg-white">
              {sequenceHistory.length === 0 ? (
                <div className="p-4 text-center text-sm text-echo-text-muted">
                  {currentSequence.frames.length === 0 ? "No saved annotations yet" : "No annotations yet"}
                </div>
              ) : (
                sequenceHistory.map((h, i) => (
                  <div key={i} className="text-xs py-1 flex gap-2">
                    <span className="rounded-full bg-[#A577FF] text-white w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
                    <span>{h.action}</span>
                  </div>
                ))
              )}
            </ScrollArea>
          </div>
        )}

        <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] p-4">
          <h3 className="text-sm font-semibold text-[#150A35] mb-3">Annotations</h3>
          <ScrollArea className="h-40 border border-[#A577FF]/20 rounded-lg bg-white">
            {currentFrame?.annotations.length ? (
              currentFrame.annotations.map((a, idx) => (
                <div
                  key={`list-${currentFrame?.id}-${a.id}-${idx}`}
                  onClick={() => selectAnnotation(a)}
                  className={`p-2 border-b cursor-pointer flex items-center justify-between gap-2 ${selectedAnnotation?.id === a.id ? "bg-[#A577FF]/10 border-[#A577FF]" : "border-gray-200"}`}
                >
                  <span className="text-sm flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${a.bbox ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                      {a.bbox ? "Box" : "Point"}
                    </span>
                    <span><strong>#{a.id}</strong> {a.action_type} - {(a.task_description || "").slice(0, 25)}{(a.task_description?.length ?? 0) > 25 ? "..." : ""}</span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); deleteAnnotation(a); }}>
                        <IconTrash className="h-3 w-3 text-echo-error" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete annotation</TooltipContent>
                  </Tooltip>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-echo-text-muted">No annotations yet</div>
            )}
          </ScrollArea>
        </div>

        {selectedAnnotation && (
          <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] p-4 space-y-4">
            <h3 className="text-sm font-semibold text-[#150A35]">Edit Annotation #{selectedAnnotation.id}</h3>
            <div>
              <Label>Task Description</Label>
              <AutocompleteTextarea
                value={selectedAnnotation.task_description}
                onChange={(v) => setSelectedAnnotation((a) => (a ? { ...a, task_description: v } : null))}
                suggestions={taskDescriptions}
                placeholder="Describe what this annotation represents..."
                rows={2}
              />
            </div>
            <div>
              <Label>Action Type</Label>
              <Select value={selectedAnnotation.action_type} onValueChange={(v) => setSelectedAnnotation((a) => (a ? { ...a, action_type: v } : null))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Element Type</Label>
              <Select value={selectedAnnotation.element_info} onValueChange={(v) => setSelectedAnnotation((a) => (a ? { ...a, element_info: v } : null))}>
                <SelectTrigger><SelectValue placeholder="Select element type" /></SelectTrigger>
                <SelectContent>
                  {ELEMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Custom Metadata</Label>
              <div className="border rounded-md p-2 space-y-2">
                {Object.entries(selectedAnnotation.custom_metadata || {}).map(([k, v], idx) => (
                  <div key={k || `meta-${idx}`} className="flex gap-1 items-center">
                    <Input
                      className="text-sm"
                      value={k}
                      onChange={(e) => {
                        const next = { ...selectedAnnotation.custom_metadata };
                        delete next[k];
                        next[e.target.value] = v;
                        setSelectedAnnotation((a) => (a ? { ...a, custom_metadata: next } : null));
                      }}
                      placeholder="Field name"
                    />
                    <Input
                      className="text-sm"
                      value={v}
                      onChange={(e) => setSelectedAnnotation((a) => (a ? { ...a, custom_metadata: { ...a.custom_metadata, [k]: e.target.value } } : null))}
                      placeholder="Value"
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => {
                          const next = { ...selectedAnnotation.custom_metadata };
                          delete next[k];
                          setSelectedAnnotation((a) => (a ? { ...a, custom_metadata: next } : null));
                        }}>
                          <IconX className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Remove field</TooltipContent>
                    </Tooltip>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => setSelectedAnnotation((a) => (a ? { ...a, custom_metadata: { ...a.custom_metadata, [`field_${Date.now()}`]: "" } } : null))}
                >
                  <IconPlus className="h-4 w-4 mr-1" /> Add Custom Field
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveAnnotation}>Save</Button>
              <Button size="sm" variant="destructive" onClick={() => deleteAnnotation(selectedAnnotation)}>
                <IconTrash className="h-4 w-4 mr-1" /> Delete
              </Button>
            </div>
            <p className="text-xs text-echo-text-muted italic">Tip: Press Delete key to remove selected annotation</p>
          </div>
        )}

        <div className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] p-4 space-y-3">
          {appMode === "capture" && (
            <Button className="echo-btn-cyan-lavender w-full" onClick={saveCurrentFrame} disabled={!currentFrame}>
              Save Current Frame
            </Button>
          )}
          {appMode === "review" && (
            <Button className="echo-btn-secondary w-full" variant="outline" onClick={exportDataset}>
              <IconDownload className="h-4 w-4 mr-1.5" /> Export Full Dataset
            </Button>
          )}
          {fileStatus && (
            <div className={`rounded-lg p-3 text-sm ${fileStatus.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {fileStatus.msg}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
