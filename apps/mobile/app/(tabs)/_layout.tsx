import { Tabs, useRouter } from "expo-router";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@echo/design-tokens";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

const iosVersion =
  Platform.OS === "ios" ? parseInt(String(Platform.Version), 10) : 0;
const supportsLiquidGlass = Platform.OS === "ios" && iosVersion >= 26;

// ─── Standard background for the Top Header ───
function HeaderBackground() {
  if (supportsLiquidGlass) {
    return (
      <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="clear" />
    );
  }
  return (
    <BlurView tint="light" intensity={80} style={StyleSheet.absoluteFill} />
  );
}

// ─── Tab icons per route ───
const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: "home-outline",
  workflows: "flash-outline",
  chat: "chatbubble-outline",
  settings: "settings-outline",
};

// ─── Fully custom tab bar so we own the width/centering ───
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width: screenWidth } = useWindowDimensions();
  const pillWidth = Math.min(Math.round(screenWidth * 0.75), 280);
  const pillBottom = Platform.OS === "ios" ? 32 : 24;

  // Only render routes that are visible in the tab bar
  const visibleRoutes = state.routes.filter((route) => {
    const opts = descriptors[route.key].options as {
      tabBarButton?: () => null;
      tabBarItemStyle?: { display?: string };
    };
    return (
      opts.tabBarButton !== null && opts.tabBarItemStyle?.display !== "none"
    );
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarOuter, { bottom: pillBottom }]}
    >
      <View style={[styles.pill, { width: pillWidth }]}>
        {/* Glass / blur background — sibling, not parent, so no clipping */}
        {supportsLiquidGlass ? (
          <GlassView
            style={[StyleSheet.absoluteFill, { borderRadius: 36 }]}
            glassEffectStyle="clear"
          />
        ) : Platform.OS === "ios" ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: 36, overflow: "hidden" },
            ]}
          >
            <BlurView
              tint="light"
              intensity={60}
              style={StyleSheet.absoluteFill}
            />
          </View>
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: 36, backgroundColor: "rgba(255,255,255,0.9)" },
            ]}
          />
        )}

        {/* Tab items row */}
        <View style={styles.tabRow}>
          {visibleRoutes.map((route) => {
            const isFocused = state.routes[state.index].name === route.name;
            const iconName = TAB_ICONS[route.name] ?? "ellipse-outline";
            const color = isFocused ? colors.lavender : colors.textMuted;

            return (
              <Pressable
                key={route.key}
                style={styles.tabItem}
                onPress={() => navigation.navigate(route.name)}
              >
                <Ionicons name={iconName} size={24} color={color} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  pill: {
    height: 64,
    borderRadius: 36,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 64,
  },
});

export default function TabLayout() {
  const router = useRouter();

  return (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerTransparent: Platform.OS === "ios",
        headerStyle: {
          backgroundColor: Platform.OS === "ios" ? "transparent" : colors.ghost,
        },
        headerBackground:
          Platform.OS === "ios" ? () => <HeaderBackground /> : undefined,
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontFamily: "Inter-SemiBold",
          fontWeight: "600" as const,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerRight: () => (
            <Pressable
              onPress={() => router.navigate("/(tabs)/notifications")}
              style={{ marginRight: 16, padding: 4 }}
            >
              <Ionicons
                name="notifications-outline"
                size={22}
                color={colors.text}
              />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="workflows"
        options={{
          title: "Workflows",
          headerShown: false,
        }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.navigate("/(tabs)/workflows");
          },
        })}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          headerShown: false,
        }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.navigate("/(tabs)/chat");
          },
        })}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Alerts",
          tabBarItemStyle: { display: "none" },
          tabBarButton: () => null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          headerShown: false,
        }}
        listeners={() => ({
          tabPress: (e) => {
            e.preventDefault();
            router.navigate("/(tabs)/settings");
          },
        })}
      />
    </Tabs>
  );
}
