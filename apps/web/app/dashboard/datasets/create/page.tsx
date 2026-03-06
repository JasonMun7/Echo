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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showFileStatus = (msg: string, type: "success" | "error") => {
    setFileStatus({ msg, type });
    setTimeout(() => setFileStatus(null), 5000);
  };

  const getCoords = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      const img = currentFrame ? { width: currentFrame.width, height: currentFrame.height } : null;
      if (!el || !img) return null;
      const imgEl = el.querySelector("img");
      if (!imgEl) return null;
      const imgRect = imgEl.getBoundingClientRect();
      const scaleX = img.width / imgRect.width;
      const scaleY = img.height / imgRect.height;
      return {
        x: (clientX - imgRect.left) * scaleX,
        y: (clientY - imgRect.top) * scaleY,
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

    const frame: Frame = {
      id: nextFrameId,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      timestamp: new Date().toISOString(),
      annotations: [],
      sequenceId: currentSequence?.id,
      sequencePosition: currentSequence ? currentSequence.frames.length + 1 : undefined,
      previousAnnotation: prevAnn,
    };
    setNextFrameId((n) => n + 1);
    setCurrentFrame(frame);
    setMode("annotating");
    setStatus(`Frame ${frame.id} captured - add annotations`);
  }, [stream, nextFrameId, currentSequence, sequenceHistory, dataset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCoords(e.clientX, e.clientY);
    if (!coords || !currentFrame) return;
    if (drawing === "bbox") {
      e.preventDefault();
      setStart(coords);
      startRef.current = coords;
      setPreviewBbox(null);
      attachBboxListeners();
    } else if (drawing === "point") {
      const id = nextAnnotationId;
      setNextAnnotationId((n) => n + 1);
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
      const x1 = Math.min(st.x, coords.x);
      const y1 = Math.min(st.y, coords.y);
      const w = Math.max(5, Math.abs(coords.x - st.x));
      const h = Math.max(5, Math.abs(coords.y - st.y));
      const id = nextAnnotationId;
      const ann: Annotation = {
        id,
        bbox: [x1, y1, w, h],
        keypoints: [x1 + w / 2, y1 + h / 2, 2],
        task_description: "",
        action_type: "click",
        element_info: "",
        custom_metadata: {},
      };
      setNextAnnotationId((n) => n + 1);
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
    [currentFrame, getCoords, nextAnnotationId]
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
    if (remaining.length === 0) setNextAnnotationId(1);
  };

  const startSequence = () => {
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
  };

  const endSequence = () => {
    if (!currentSequence) return;
    setCurrentSequence(null);
    setSequenceHistory([]);
    setStatus("Sequence ended");
  };

  const saveCurrentFrame = async () => {
    if (!currentFrame) return;
    const ts = new Date(currentFrame.timestamp).toISOString().replace(/:/g, "-").replace(/\..+Z$/, "").replace("T", "_");
    const imageFilename = `${ts}.png`;
    const folder = currentSequence && currentFrame.sequenceId ? "sequence_data" : "data";

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

      const cocoAnns = currentFrame.annotations.map((ann) => ({
        id: ann.id,
        image_id: currentFrame.id,
        category_id: CATEGORY_MAP[ann.action_type] ?? 1,
        bbox: ann.bbox,
        keypoints: ann.keypoints,
        area: ann.bbox ? ann.bbox[2] * ann.bbox[3] : 0,
        iscrowd: 0,
        attributes: {
          task_description: ann.task_description,
          action_type: ann.action_type,
          element_info: ann.element_info,
          custom_metadata: ann.custom_metadata,
        },
      }));

      setDataset((d) => ({
        images: [...d.images, imageEntry],
        annotations: [...d.annotations, ...cocoAnns],
      }));

      currentFrame.annotations.forEach((a) => {
        const desc = a.task_description || `${a.action_type} on ${a.element_info || "element"}`;
        setSequenceHistory((h) => [...h, { action: desc, timestamp: new Date().toISOString() }]);
      });

      const jsonFilename = folder === "sequence_data" ? "sequence_annotations_coco.json" : "annotations_coco.json";
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

      setCurrentFrame(null);
      setSelectedAnnotation(null);
      setMode("streaming");
      showFileStatus(`Frame saved to ${folder}/${imageFilename}`, "success");
      setStatus(`Frame saved with ${currentFrame.annotations.length} annotations`);
    } catch (e) {
      showFileStatus(`Error: ${(e as Error).message}`, "error");
    }
  };

  const exportDataset = async () => {
    const hasSeq = dataset.images.some((i) => i.sequence_id);
    const folder = hasSeq ? "sequence_data" : "data";
    const filename = hasSeq ? "sequence_annotations_coco.json" : "annotations_coco.json";
    const coco = {
      info: { description: "GUI Dataset", version: "1.0", year: new Date().getFullYear() },
      categories: DEFAULT_CATEGORIES,
      images: dataset.images,
      annotations: dataset.annotations,
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
        setNextFrameId(Math.max(1, ...(data.images || []).map((i: { id: number }) => i.id)) + 1);
        setNextAnnotationId(Math.max(1, ...(data.annotations || []).map((a: { id: number }) => a.id)) + 1);
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

  const switchToReview = () => {
    setAppMode("review");
    const sorted = [...dataset.images].sort(
      (a, b) => new Date(a.date_captured || 0).getTime() - new Date(b.date_captured || 0).getTime()
    );
    setFilteredSamples(sorted);
    if (sorted.length > 0) setCurrentSampleIndex(sorted.length - 1);
    if (stream) stopStream();
  };

  const switchToCapture = () => {
    setAppMode("capture");
    setCurrentSampleIndex(-1);
  };

  const loadSample = useCallback(
    async (index: number) => {
      if (index < 0 || index >= filteredSamples.length) return;
      const sample = filteredSamples[index];
      setCurrentSampleIndex(index);
      let dataUrl = loadedSampleCache.current.get(sample.id);
      if (!dataUrl) {
        try {
          const res = await apiFetch(`/api/datasets/image?folder=${sample.sequence_id ? "sequence_data" : "data"}&file=${encodeURIComponent(sample.file_name)}`);
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
    [filteredSamples, dataset]
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
        <div className="flex flex-wrap gap-2 p-3 bg-[#F5F7FC] border-b border-[#A577FF]/20 items-center">
          <Button size="sm" onClick={startStream} disabled={!!stream}>
            <IconVideo className="h-4 w-4 mr-1" /> Start Live Capture
          </Button>
          <Button size="sm" variant="outline" onClick={captureFrame} disabled={!stream}>
            <IconPhoto className="h-4 w-4 mr-1" /> Capture Frame
          </Button>
          <Button size="sm" variant="outline" onClick={refreshStream} disabled={!stream || !!currentFrame} title="Ctrl+R">
            <IconArrowsMaximize className="h-4 w-4 mr-1" /> Refresh Stream
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrawing(drawing === "bbox" ? null : "bbox")}
            disabled={!currentFrame}
            className={drawing === "bbox" ? "border-[#A577FF] bg-[#A577FF]/10" : ""}
          >
            <IconPlus className="h-4 w-4 mr-1" /> Draw Bbox
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrawing(drawing === "point" ? null : "point")}
            disabled={!currentFrame}
            className={drawing === "point" ? "border-[#A577FF] bg-[#A577FF]/10" : ""}
          >
            <IconPlus className="h-4 w-4 mr-1" /> Add Point
          </Button>
          <Button size="sm" variant="destructive" onClick={stopStream} disabled={!stream}>
            <IconSquare className="h-4 w-4 mr-1" /> Stop Stream
          </Button>
          <Button size="sm" variant="outline" onClick={loadDataset}>
            <IconFolderOpen className="h-4 w-4 mr-1" /> Browse Dataset
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={startSequence} disabled={!!currentSequence}>
            <IconPlayerPlay className="h-4 w-4 mr-1" /> Start Sequence
          </Button>
          <Button size="sm" variant="destructive" onClick={endSequence} disabled={!currentSequence}>
            <IconPlayerStop className="h-4 w-4 mr-1" /> End Sequence
          </Button>
          {currentSequence && (
            <span className="rounded-md bg-echo-success text-white px-2 py-1 text-sm">
              Sequence: {currentSequence.id} (Frame {currentSequence.frames.length})
            </span>
          )}
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

      <div className="w-[420px] flex flex-col bg-white border-l border-[#A577FF]/20 overflow-y-auto p-4 gap-4">
        <div className="flex gap-2 bg-[#F5F7FC] rounded-lg p-1 border border-[#A577FF]/20">
          <Button size="sm" variant={appMode === "capture" ? "default" : "ghost"} className="flex-1" onClick={switchToCapture}>
            Live Capture
          </Button>
          <Button size="sm" variant={appMode === "review" ? "default" : "ghost"} className="flex-1" onClick={switchToReview}>
            Review/Edit
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[#A577FF]/20 p-3 text-center">
            <div className="text-2xl font-bold text-[#A577FF]">{dataset.images.length}</div>
            <div className="text-xs text-echo-text-muted">Images</div>
          </div>
          <div className="rounded-lg border border-[#A577FF]/20 p-3 text-center">
            <div className="text-2xl font-bold text-[#A577FF]">{dataset.annotations.length}</div>
            <div className="text-xs text-echo-text-muted">Annotations</div>
          </div>
        </div>

        {appMode === "review" && filteredSamples.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[#150A35] mb-2">Sample Navigation</h3>
            <div className="flex justify-between text-xs text-echo-text-muted mb-1">
              <span>{currentSampleIndex >= 0 ? `${currentSampleIndex + 1} of ${filteredSamples.length}` : "-"}</span>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={currentSampleIndex <= 0} onClick={() => setCurrentSampleIndex((i) => Math.max(0, i - 1))}>
                <IconChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={currentSampleIndex >= filteredSamples.length - 1} onClick={() => setCurrentSampleIndex((i) => Math.min(filteredSamples.length - 1, i + 1))}>
                <IconChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-[#150A35] mb-2">Frame Info</h3>
          <div className="space-y-2">
            <Label>Frame ID</Label>
            <Input value={currentFrame ? `frame_${currentFrame.id}` : ""} readOnly className="bg-gray-50" />
            <Label>Application</Label>
            <Input value={application} onChange={(e) => setApplication(e.target.value)} placeholder="e.g., Chrome, VSCode" />
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
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

        {currentSequence && (
          <div>
            <h3 className="text-sm font-semibold text-[#150A35] mb-2">Sequence</h3>
            <p className="text-xs text-echo-text-muted mb-1">ID: {currentSequence.id}</p>
            <p className="text-xs text-echo-text-muted mb-2">Frames: {currentSequence.frames.length}</p>
            <Label>Sequence Description</Label>
            <AutocompleteTextarea
              value={currentSequence.task}
              onChange={(v) => setCurrentSequence((s) => (s ? { ...s, task: v } : null))}
              suggestions={sequenceTasks}
              placeholder="Overall sequence description..."
              rows={2}
            />
            <ScrollArea className="h-32 mt-2 border rounded-md p-2">
              {sequenceHistory.map((h, i) => (
                <div key={i} className="text-xs py-1 flex gap-2">
                  <span className="rounded-full bg-[#A577FF] text-white w-5 h-5 flex items-center justify-center shrink-0">{i + 1}</span>
                  <span>{h.action}</span>
                </div>
              ))}
            </ScrollArea>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-[#150A35] mb-2">Annotations</h3>
          <ScrollArea className="h-40 border rounded-md">
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
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); deleteAnnotation(a); }}>
                    <IconTrash className="h-3 w-3 text-echo-error" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-echo-text-muted">No annotations yet</div>
            )}
          </ScrollArea>
        </div>

        {selectedAnnotation && (
          <div className="border rounded-lg p-3 space-y-3">
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
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => {
                      const next = { ...selectedAnnotation.custom_metadata };
                      delete next[k];
                      setSelectedAnnotation((a) => (a ? { ...a, custom_metadata: next } : null));
                    }}>
                      <IconX className="h-4 w-4" />
                    </Button>
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

        <div className="space-y-2">
          <Button className="w-full" onClick={saveCurrentFrame} disabled={!currentFrame}>
            Save Current Frame
          </Button>
          <Button className="w-full" variant="outline" onClick={exportDataset}>
            <IconDownload className="h-4 w-4 mr-1" /> Export Full Dataset
          </Button>
          {fileStatus && (
            <div className={`rounded-lg p-2 text-sm ${fileStatus.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {fileStatus.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
