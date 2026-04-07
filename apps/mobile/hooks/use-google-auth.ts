import { useEffect, useState } from "react";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { useAuthStore } from "@/stores/auth-store";

WebBrowser.maybeCompleteAuthSession();

const extra = Constants.expoConfig?.extra ?? {};

/**
 * Google Sign-In hook using expo-auth-session.
 *
 * Requires different OAuth client IDs per platform:
 * - Web: clientId (type "Web application") — allows https:// redirects
 * - iOS: iosClientId (type "iOS") — uses reversed client ID as URL scheme
 *   - Bundle ID in GCP must match: com.echo.mobile.ios
 * - Android: androidClientId (type "Android")
 *   - Package name in GCP must match: com.echo.mobile
 *
 * The iOS info.plist CFBundleURLSchemes includes the reversed iOS client ID
 * (configured in app.config.js) so the OAuth redirect works.
 */
export function useGoogleAuth() {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const [loading, setLoading] = useState(false);

  // Determine which client ID applies for the current platform
  const platformClientId =
    Platform.OS === "ios"
      ? extra.googleClientIdIos
      : Platform.OS === "android"
        ? extra.googleClientIdAndroid
        : extra.googleClientIdWeb;

  // Let expo-auth-session auto-determine redirectUri per platform.
  // On iOS, it uses the reversed iosClientId as the URL scheme.
  // On web, it uses the current page URL.
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: extra.googleClientIdWeb,
    iosClientId: extra.googleClientIdIos || undefined,
    androidClientId: extra.googleClientIdAndroid || undefined,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      if (idToken) {
        setLoading(true);
        signInWithGoogle(idToken)
          .catch(() => {
            // Error handled by auth listener
          })
          .finally(() => setLoading(false));
      }
    } else if (response?.type === "error" || response?.type === "dismiss") {
      setLoading(false);
    }
  }, [response]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await promptAsync();
    } catch {
      setLoading(false);
    }
  };

  // Only show the button if the correct client ID is configured for this platform
  const isConfigured = !!platformClientId;

  return {
    request,
    loading,
    handleGoogleSignIn,
    isConfigured,
  };
}
