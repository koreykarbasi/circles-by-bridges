import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useThemeColors } from "@/lib/theme-context";
import { apiRequest } from "@/lib/query-client";
import { authErrorMessage } from "@/lib/android-only/auth-flow";

/** Recovery entry point used only by the Android onboarding auth page. */
export function PasswordRecovery({ email }: { email: string }) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const close = () => { if (!busy) setVisible(false); };
  const send = async () => {
    if (busy) return;
    if (!address.trim()) { setError("Please enter your email address."); return; }
    setBusy(true);
    setError("");
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: address.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Pressable
        testID="android-onboarding-forgot-password"
        onPress={() => { setAddress(email.trim()); setError(""); setSent(false); setVisible(true); }}
        style={{ alignSelf: "center", padding: 12 }}
      >
        <Text style={{ color: colors.primary, fontFamily: "Nunito_600SemiBold", fontSize: 14 }}>Forgot password?</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "#00000099", justifyContent: "center", padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, padding: 24, borderRadius: 18, gap: 16 }}>
            <Text style={{ color: colors.text, fontFamily: "Nunito_700Bold", fontSize: 20 }}>
              {sent ? "Check your email" : "Reset password"}
            </Text>
            {sent ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                If this email is registered, you'll receive a reset link shortly. Check your spam folder too.
              </Text>
            ) : (
              <>
                <TextInput
                  accessibilityLabel="Email address for password reset"
                  testID="android-onboarding-reset-email"
                  value={address}
                  onChangeText={setAddress}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!busy}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.textTertiary}
                  style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 }}
                />
                {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
                <Pressable
                  onPress={send}
                  disabled={busy}
                  style={{ backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: "center", opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={{ color: colors.onPrimary }}>Send reset link</Text>}
                </Pressable>
              </>
            )}
            <Pressable onPress={close} disabled={busy} style={{ alignItems: "center", padding: 8 }}>
              <Text style={{ color: colors.textSecondary }}>{sent ? "Done" : "Cancel"}</Text>
            </Pressable>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
