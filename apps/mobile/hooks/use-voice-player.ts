import { useRef, useCallback, useState } from "react";
import { createAudioPlayer } from "expo-audio";
import { Paths, File } from "expo-file-system";
import type { AudioPlayer } from "expo-audio";

/**
 * Voice player hook using expo-audio (SDK 55).
 *
 * Receives raw 24kHz 16-bit mono PCM data, wraps it in a WAV header,
 * writes to a temp file, and plays via expo-audio AudioPlayer.
 * Implements a queue for gapless playback.
 */
export function useVoicePlayer() {
  const [playing, setPlaying] = useState(false);
  const queue = useRef<ArrayBuffer[]>([]);
  const isPlaying = useRef(false);
  const currentPlayer = useRef<AudioPlayer | null>(null);

  /** Create a WAV buffer from raw PCM data */
  function createWavBuffer(pcm: ArrayBuffer): ArrayBuffer {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcm.byteLength;
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    new Uint8Array(buffer, headerSize).set(new Uint8Array(pcm));

    return buffer;
  }

  function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /** Play next item from queue */
  const playNext = useCallback(async () => {
    if (queue.current.length === 0) {
      isPlaying.current = false;
      setPlaying(false);
      return;
    }

    isPlaying.current = true;
    setPlaying(true);
    const pcm = queue.current.shift()!;

    try {
      const wav = createWavBuffer(pcm);
      const base64 = arrayBufferToBase64(wav);

      // Write WAV to a temp file
      const tempFile = new File(Paths.cache, `voice_${Date.now()}.wav`);
      tempFile.create();
      tempFile.write(base64, { encoding: "base64" });

      const player = createAudioPlayer(tempFile.uri);
      currentPlayer.current = player;

      // Listen for playback completion
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.playing === false && status.currentTime >= status.duration && status.duration > 0) {
          player.remove();
          try {
            tempFile.delete();
          } catch {}
          currentPlayer.current = null;
          playNext();
        }
      });

      player.play();
    } catch (err) {
      console.warn("Playback error:", err);
      isPlaying.current = false;
      setPlaying(false);
      playNext();
    }
  }, []);

  /** Enqueue PCM data for playback */
  const enqueue = useCallback(
    (pcmData: ArrayBuffer) => {
      queue.current.push(pcmData);
      if (!isPlaying.current) {
        playNext();
      }
    },
    [playNext],
  );

  /** Stop all playback and clear queue */
  const stop = useCallback(async () => {
    queue.current = [];
    if (currentPlayer.current) {
      try {
        currentPlayer.current.pause();
        currentPlayer.current.remove();
      } catch {}
      currentPlayer.current = null;
    }
    isPlaying.current = false;
    setPlaying(false);
  }, []);

  return { playing, enqueue, stop };
}

/** Convert ArrayBuffer to base64 string */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
