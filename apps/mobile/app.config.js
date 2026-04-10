/**
 * Dynamic Expo config that reads environment variables injected by Doppler.
 *
 * Doppler already provides NEXT_PUBLIC_FIREBASE_* and NEXT_PUBLIC_API_URL
 * for the web app. We reuse those same vars here — no need to duplicate
 * secrets in Doppler. Run via: `doppler run -- pnpm run start`
 *
 * For EXPO_PUBLIC_* vars: Expo automatically exposes any env var prefixed
 * with EXPO_PUBLIC_ to the JS bundle. We map the Doppler vars into the
 * `extra` config so they're available via expo-constants.
 */
module.exports = ({ config }) => {
  // Read from Doppler-injected env (NEXT_PUBLIC_*) or EXPO_PUBLIC_* fallback
  const firebaseApiKey =
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  const firebaseAuthDomain =
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "";
  const firebaseProjectId =
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    "";
  const firebaseStorageBucket =
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "";
  const firebaseMessagingSenderId =
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
    "";
  const firebaseAppId =
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "";

  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const agentUrl =
    process.env.EXPO_PUBLIC_ECHO_AGENT_URL ??
    process.env.NEXT_PUBLIC_ECHO_AGENT_URL ??
    "http://localhost:8083";

  // Google OAuth Client IDs for expo-auth-session
  // The web client ID is required (used on all platforms); iOS/Android are optional overrides.
  // These come from the Firebase project's Google Cloud Console OAuth 2.0 credentials.
  const googleClientIdWeb =
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? process.env.GOOGLE_CLIENT_ID_WEB ?? "";
  const googleClientIdIos =
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? process.env.GOOGLE_CLIENT_ID_IOS ?? "";
  const googleClientIdAndroid =
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? process.env.GOOGLE_CLIENT_ID_ANDROID ?? "";

  return {
    ...config,
    name: "Echo",
    slug: "echo-mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "echo-mobile",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/images/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#150A35",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.echo.mobile.ios",
      infoPlist: {
        NSMicrophoneUsageDescription:
          "Echo needs microphone access for voice commands to create and run workflows.",
        UIBackgroundModes: ["audio"],
        // Reversed iOS client ID for Google Sign-In redirect
        ...(googleClientIdIos
          ? {
              CFBundleURLTypes: [
                {
                  CFBundleURLSchemes: [googleClientIdIos.split(".").reverse().join(".")],
                },
              ],
            }
          : {}),
      },
    },
    android: {
      package: "com.echo.mobile",
      adaptiveIcon: {
        backgroundColor: "#150A35",
        foregroundImage: "./assets/images/android-icon-foreground.png",
      },
      permissions: ["RECORD_AUDIO"],
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      "expo-audio",
      "@livekit/react-native-expo-plugin",
      "@config-plugins/react-native-webrtc",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      // Firebase config — available via Constants.expoConfig.extra
      firebaseApiKey,
      firebaseAuthDomain,
      firebaseProjectId,
      firebaseStorageBucket,
      firebaseMessagingSenderId,
      firebaseAppId,
      // API URLs
      apiUrl,
      agentUrl,
      // Google OAuth
      googleClientIdWeb,
      googleClientIdIos,
      googleClientIdAndroid,
      // EAS
      eas: {
        projectId: "1d6ef7bf-cfce-46ec-9fff-7d78e7a26425",
      },
    },
  };
};
