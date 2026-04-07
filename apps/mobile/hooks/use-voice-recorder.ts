import { useRef, useCallback, useState } from "react";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
  IOSOutputFormat,
  AudioQuality,
} from "expo-audio";
import type { AudioRecorder } from "expo-audio";

/**
 * Voice recorder hook using expo-audio (SDK 55).
 *
 * Records audio for streaming to the voice agent.
 * Uses the hook-based API: useAudioRecorder + recorder.record() / recorder.stop().
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const requestPermission = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      setHasPermission(perm.granted);
      return perm.granted;
    } catch {
      setHasPermission(false);
      return false;
    }
  }, []);

  const start = useCallback(
    async (recorder: AudioRecorder) => {
      if (recording) return;

      const granted = hasPermission ?? (await requestPermission());
      if (!granted) return;

      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        await recorder.prepareToRecordAsync({
          extension: ".wav",
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 256000,
          ios: {
            outputFormat: IOSOutputFormat.LINEARPCM,
            audioQuality: AudioQuality.MAX,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          android: {
            outputFormat: "mpeg4",
            audioEncoder: "aac",
          },
        });

        recorder.record();
        recorderRef.current = recorder;
        setRecording(true);
      } catch (err) {
        console.warn("Failed to start recording:", err);
      }
    },
    [recording, hasPermission, requestPermission],
  );

  const stop = useCallback(async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    try {
      await recorder.stop();
      const uri = recorder.uri;
      recorderRef.current = null;
      setRecording(false);

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      return uri;
    } catch (err) {
      console.warn("Failed to stop recording:", err);
      recorderRef.current = null;
      setRecording(false);
      return null;
    }
  }, []);

  const cancel = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      await recorder.stop();
    } catch {}
    recorderRef.current = null;
    setRecording(false);
  }, []);

  return {
    recording,
    hasPermission,
    requestPermission,
    start,
    stop,
    cancel,
  };
}
