import { Stack } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { colors } from "@echo/design-tokens";

const iosVersion = Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) : 0;
const supportsLiquidGlass = Platform.OS === "ios" && iosVersion >= 26;

function GlassBar() {
  if (supportsLiquidGlass) {
    return <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />;
  }
  return (
    <>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(250,249,255,0.88)" }]} />
      <BlurView tint="light" intensity={90} style={StyleSheet.absoluteFill} />
    </>
  );
}

export default function WorkflowsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Platform.OS === "ios" ? "transparent" : colors.ghost,
        },
        headerBackground: Platform.OS === "ios" ? GlassBar : undefined,
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: "Inter-SemiBold", fontWeight: "600" as const },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Workflows" }} />
      <Stack.Screen name="new" options={{ title: "New Workflow" }} />
      <Stack.Screen name="[id]/index" options={{ title: "Workflow" }} />
      <Stack.Screen name="[id]/edit" options={{ title: "Edit Steps" }} />
      <Stack.Screen name="[id]/runs/[runId]" options={{ title: "Run Details" }} />
    </Stack>
  );
}
