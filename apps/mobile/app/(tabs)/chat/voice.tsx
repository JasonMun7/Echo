import { Redirect } from "expo-router";

/** Voice + text share one LiveKit session on the main Chat tab. */
export default function VoiceRedirect() {
  return <Redirect href="/(tabs)/chat" />;
}
