import { registerGlobals } from "@livekit/react-native";

// Must be called before any LiveKit Room usage.
// Patches global WebRTC APIs that livekit-client needs on React Native.
registerGlobals();
