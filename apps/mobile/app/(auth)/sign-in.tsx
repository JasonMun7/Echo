import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Svg, { Path, G, ClipPath, Rect, Defs } from "react-native-svg";
import { Link } from "expo-router";
import { useAuthStore } from "@/stores/auth-store";
import { GradientButton } from "@/components/ui/GradientButton";
import { useGoogleAuth } from "@/hooks/use-google-auth";
import { colors } from "@echo/design-tokens";

/** Official Google G logo as SVG */
function GoogleGIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <ClipPath id="clip">
          <Rect width="48" height="48" rx="4" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#clip)">
        {/* Blue right arc */}
        <Path
          d="M44.5 20H24v8.5h11.8C34.3 34.4 29.7 38 24 38c-7.7 0-14-6.3-14-14s6.3-14 14-14c3.4 0 6.5 1.2 8.9 3.2l6.1-6.1C35.1 4.5 29.8 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"
          fill="#FFC107"
        />
        <Path
          d="M6.3 14.7l7 5.1C15.1 16 19.3 13 24 13c3.4 0 6.5 1.2 8.9 3.2l6.1-6.1C35.1 6.5 29.8 4 24 4 16.2 4 9.4 8.4 6.3 14.7z"
          fill="#FF3D00"
        />
        <Path
          d="M24 44c5.6 0 10.8-1.9 14.8-5.1l-6.8-5.8C29.8 35 27 36 24 36c-5.7 0-10.4-3.6-11.8-8.5l-7 5.4C8.3 40 15.6 44 24 44z"
          fill="#4CAF50"
        />
        <Path
          d="M44.5 20H24v8.5h11.8c-.7 2.2-2 4.1-3.8 5.6l6.8 5.8C43 36.3 46 30.6 46 24c0-1.3-.2-2.7-.5-4z"
          fill="#1976D2"
        />
      </G>
    </Svg>
  );
}

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const signIn = useAuthStore((s) => s.signIn);
  const {
    request: googleRequest,
    loading: googleLoading,
    handleGoogleSignIn,
    isConfigured: googleConfigured,
  } = useGoogleAuth();

  async function handleSignIn() {
    if (!email || !password) return;
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      Alert.alert("Sign In Failed", err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Gradient background */}
      <LinearGradient
        colors={["#0d0620", "#1a0f3a", "#0d0620"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative gradient orbs — large, diffused */}
      <View style={styles.orb1} pointerEvents="none">
        <LinearGradient
          colors={["rgba(165,119,255,0.65)", "transparent"]}
          style={styles.orbGradient}
        />
      </View>
      <View style={styles.orb2} pointerEvents="none">
        <LinearGradient
          colors={["rgba(33,196,221,0.5)", "transparent"]}
          style={styles.orbGradient}
        />
      </View>
      <View style={styles.orb3} pointerEvents="none">
        <LinearGradient
          colors={["rgba(124,58,237,0.55)", "transparent"]}
          style={styles.orbGradient}
        />
      </View>
      <View style={styles.orb4} pointerEvents="none">
        <LinearGradient
          colors={["rgba(59,130,246,0.4)", "transparent"]}
          style={styles.orbGradient}
        />
      </View>

      {/* Frosted blur layer — diffuses the orbs into a grainy, soft background */}
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={35}
          tint="dark"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(8,4,20,0.25)" }]}
          pointerEvents="none"
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        {/* Glass card */}
        {Platform.OS === "ios" ? (
          <BlurView intensity={40} tint="dark" style={styles.card}>
            <SignInForm
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              loading={loading}
              googleLoading={googleLoading}
              googleConfigured={googleConfigured}
              googleRequest={googleRequest}
              handleSignIn={handleSignIn}
              handleGoogleSignIn={handleGoogleSignIn}
            />
          </BlurView>
        ) : (
          <View style={[styles.card, styles.cardAndroid]}>
            <SignInForm
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              loading={loading}
              googleLoading={googleLoading}
              googleConfigured={googleConfigured}
              googleRequest={googleRequest}
              handleSignIn={handleSignIn}
              handleGoogleSignIn={handleGoogleSignIn}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function SignInForm({
  email, setEmail, password, setPassword, loading, googleLoading,
  googleConfigured, googleRequest, handleSignIn, handleGoogleSignIn,
}: {
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  loading: boolean; googleLoading: boolean;
  googleConfigured: boolean; googleRequest: unknown;
  handleSignIn: () => void; handleGoogleSignIn: () => void;
}) {
  return (
    <View style={styles.formInner}>
      <Text style={styles.logo}>Echo</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />
        <GradientButton
          title="Sign In"
          onPress={handleSignIn}
          loading={loading}
          gradient="cyanLavender"
        />

        {googleConfigured && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.googleButton,
                pressed && styles.googleButtonPressed,
                (!googleRequest || googleLoading) && styles.googleButtonDisabled,
              ]}
              onPress={handleGoogleSignIn}
              disabled={!googleRequest || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#333" />
              ) : (
                <>
                  <GoogleGIcon size={20} />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <Link href="/(auth)/sign-up" asChild>
          <Pressable>
            <Text style={styles.link}>Sign Up</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  /* Decorative orbs — large, overlapping, diffused by BlurView */
  orb1: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: 200,
    top: -120,
    right: -100,
    overflow: "hidden",
  },
  orb2: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 170,
    bottom: 40,
    left: -130,
    overflow: "hidden",
  },
  orb3: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: 160,
    right: -40,
    overflow: "hidden",
  },
  orb4: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    top: 130,
    left: -70,
    overflow: "hidden",
  },
  orbGradient: {
    flex: 1,
    opacity: 0.85,
  },

  /* Glass card */
  card: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardAndroid: {
    backgroundColor: "rgba(20,10,40,0.85)",
  },
  formInner: {
    padding: 32,
  },

  logo: {
    fontSize: 36,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    fontFamily: "Inter-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    fontFamily: "Inter",
    marginBottom: 24,
  },
  form: { gap: 14 },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dividerText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    fontFamily: "Inter",
    marginHorizontal: 12,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  googleButtonPressed: { backgroundColor: "#f5f5f5" },
  googleButtonDisabled: { opacity: 0.6 },
  googleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f1f1f",
    fontFamily: "Inter",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 14,
    fontFamily: "Inter",
  },
  link: {
    color: "#A577FF",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter",
  },
});
