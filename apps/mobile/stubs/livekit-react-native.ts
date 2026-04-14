/**
 * Web stub for `@livekit/react-native`. The real package uses native modules
 * (`requireNativeComponent`) which do not exist in the browser.
 *
 * Resolved via metro.config.js when platform === "web".
 */

export function registerGlobals(): void {
  // Native build patches global WebRTC; browsers already expose RTCPeerConnection, etc.
}

export const AndroidAudioTypePresets = {
  communication: {},
} as const;

export const AudioSession = {
  configureAudio: async (_opts?: unknown) => {},
  startAudioSession: async () => {},
  stopAudioSession: () => {},
};

export function useIOSAudioManagement(_room: unknown, _enabled: boolean): void {}
