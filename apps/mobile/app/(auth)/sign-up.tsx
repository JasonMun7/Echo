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
import { Link } from "expo-router";
import { useAuthStore } from "@/stores/auth-store";
import { GradientButton } from "@/components/ui/GradientButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { useGoogleAuth } from "@/hooks/use-google-auth";
import { colors, gradients } from "@echo/design-tokens";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const signUp = useAuthStore((s) => s.signUp);
  const {
    request: googleRequest,
    loading: googleLoading,
    handleGoogleSignIn,
    isConfigured: googleConfigured,
  } = useGoogleAuth();

  async function handleSignUp() {
    if (!email || !password) return;
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
    } catch (err: any) {
      Alert.alert("Sign Up Failed", err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[...gradients.dark.colors]} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <GlassCard variant="light" style={styles.card}>
          <Text style={styles.logo}>Echo</Text>
          <Text style={styles.subtitle}>Create your account</Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            <GradientButton
              title="Create Account"
              onPress={handleSignUp}
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
                      <Text style={styles.googleG}>G</Text>
                      <Text style={styles.googleText}>Continue with Google</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text style={styles.link}>Sign In</Text>
              </Pressable>
            </Link>
          </View>
        </GlassCard>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
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
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    fontFamily: "Inter",
    marginBottom: 24,
  },
  form: {
    gap: 14,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
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
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dividerText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontFamily: "Inter",
    marginHorizontal: 12,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
  },
  googleButtonPressed: {
    backgroundColor: "#f0f0f0",
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleG: {
    fontSize: 20,
    fontWeight: "700",
    color: "#4285F4",
    fontFamily: "Inter-Bold",
  },
  googleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    fontFamily: "Inter",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    fontFamily: "Inter",
  },
  link: {
    color: colors.cyan,
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Inter",
  },
});
