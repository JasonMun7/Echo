import { useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useRecordingStore } from "@/stores/recording-store";

export function useRecording() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const recordingDurationRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    useRecordingStore.getState().setRecordError("");
    useRecordingStore.getState().setRecordedBlob(null);

    const hasPermission = await window.electronAPI?.checkScreenPermission?.();
    if (!hasPermission) {
      useAuthStore.getState().setScreenPermissionRequired(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });

      const localChunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) localChunks.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        useRecordingStore.getState().setRecordedBlob(
          new Blob(localChunks, { type: recorder.mimeType || "video/webm" })
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      useRecordingStore.getState().setRecording(true);
      useRecordingStore.getState().setRecordingDuration(0);
      recordingDurationRef.current = 0;

      recordingIntervalRef.current = setInterval(() => {
        const next = recordingDurationRef.current + 1;
        recordingDurationRef.current = next;
        useRecordingStore.getState().setRecordingDuration(next);
      }, 1000);

      await window.electronAPI?.enterRecordingMode?.();
    } catch (e) {
      useRecordingStore.getState().setRecordError(
        e instanceof Error ? e.message : "Could not start recording"
      );
    }
  }, []);

  const stopRecording = useCallback((durationFromHud?: number) => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      useRecordingStore.getState().setRecordedDuration(
        durationFromHud ?? recordingDurationRef.current
      );
      useRecordingStore.getState().setRecording(false);
      useRecordingStore.getState().setRecordingPaused(false);
    }
  }, []);

  const pauseResumeRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      useRecordingStore.getState().setRecordingPaused(true);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    } else if (rec.state === "paused") {
      rec.resume();
      useRecordingStore.getState().setRecordingPaused(false);
      recordingIntervalRef.current = setInterval(() => {
        const next = recordingDurationRef.current + 1;
        recordingDurationRef.current = next;
        useRecordingStore.getState().setRecordingDuration(next);
      }, 1000);
    }
  }, []);

  const discardRecording = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaRecorderRef.current = null;
    useRecordingStore.getState().resetRecording();
  }, []);

  const redoRecording = useCallback(() => {
    discardRecording();
    startRecording();
  }, [discardRecording, startRecording]);

  return {
    startRecording,
    stopRecording,
    pauseResumeRecording,
    discardRecording,
    redoRecording,
  };
}
