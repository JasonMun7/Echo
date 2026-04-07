import { View, Text, Pressable, Alert, ScrollView, Platform, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/auth-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, borderRadius } from "@echo/design-tokens";

const iosVersion = Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) : 0;
const supportsLiquidGlass = Platform.OS === "ios" && iosVersion >= 26;

function GlassCard({ children, style }: { children: React.ReactNode; style?: object }) {
  if (supportsLiquidGlass) {
    return (
      <GlassView glassEffectStyle="regular" style={[styles.glassCard, style]}>
        {children}
      </GlassView>
    );
  }
  if (Platform.OS === "ios") {
    return (
      <View style={[styles.glassCard, style, { overflow: "hidden" }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.78)" }]} />
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={{ position: "relative" }}>{children}</View>
      </View>
    );
  }
  return <View style={[styles.glassCard, style, { backgroundColor: colors.white }]}>{children}</View>;
}

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  function handleSignOut() {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#F4F0FF", "#EBF4FF", "#F8F9FE"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile card */}
        <GlassCard style={styles.profileCard}>
          <View style={styles.profileInner}>
            {user?.photoURL ? (
              <Image source={{ uri: user.photoURL }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {(user?.displayName?.[0] || user?.email?.[0] || "?").toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {user?.displayName || "Echo User"}
              </Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>
        </GlassCard>

        {/* Menu items */}
        <GlassCard style={styles.menuCard}>
          <Pressable
            style={styles.menuItem}
            onPress={() => router.push("/(tabs)/settings/integrations")}
          >
            <View style={styles.menuItemLeft}>
              <View style={[styles.menuIcon, { backgroundColor: "rgba(165,119,255,0.12)" }]}>
                <Ionicons name="apps-outline" size={18} color={colors.lavender} />
              </View>
              <Text style={styles.menuItemText}>Integrations</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </GlassCard>

        {/* Sign out */}
        <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        <Text style={styles.version}>Echo Mobile v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },

  glassCard: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(165,119,255,0.15)",
    marginBottom: 16,
  },

  profileCard: {},
  profileInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(165,119,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.lavender,
    fontFamily: "Inter-SemiBold",
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  profileEmail: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 2,
  },

  menuCard: { overflow: "hidden" },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  menuItemLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  menuIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItemText: {
    fontSize: 16,
    color: colors.text,
    fontFamily: "Inter",
  },

  signOutBtn: {
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: borderRadius.DEFAULT,
    padding: 14,
    alignItems: "center",
    backgroundColor: "rgba(239,68,68,0.04)",
    marginBottom: 16,
  },
  signOutText: {
    color: colors.error,
    fontWeight: "500",
    fontSize: 16,
    fontFamily: "Inter-Medium",
  },
  version: {
    textAlign: "center",
    color: colors.textLight,
    fontSize: 12,
    fontFamily: "Inter",
    marginTop: 8,
  },
});
