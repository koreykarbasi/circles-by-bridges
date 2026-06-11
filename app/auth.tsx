import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (!isLogin && !name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim());
        setSuccessMessage("Account created. Please sign in to continue.");
        setIsLogin(true);
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      const msg = err?.message || "Something went wrong";
      const cleaned = msg.replace(/^\d+:\s*/, "").replace(/^"/, "").replace(/"$/, "");
      try {
        const parsed = JSON.parse(cleaned);
        setError(parsed.message || cleaned);
      } catch {
        setError(cleaned);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotError("");
    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email address");
      return;
    }
    setForgotSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: forgotEmail.trim() });
      setForgotSuccess(true);
    } catch {
      setForgotError("Something went wrong. Please try again.");
    } finally {
      setForgotSubmitting(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotEmail("");
    setForgotSuccess(false);
    setForgotError("");
    setForgotSubmitting(false);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoSection}>
          <Image
            source={require("@/assets/images/bridge-logo.png")}
            style={styles.logoImage}
            tintColor={Colors.primary}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Bridges</Text>
          <Text style={styles.tagline}>
            {isLogin ? "Welcome back" : "Create your account"}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {successMessage ? (
            <View style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {!isLogin && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your full name"
                  placeholderTextColor={Colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  autoCorrect={false}
                  testID="auth-name"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                testID="auth-email"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="At least 6 characters"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                testID="auth-password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {!isLogin && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter your password"
                  placeholderTextColor={Colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  testID="auth-confirm-password"
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            testID="auth-submit"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>
                {isLogin ? "Sign In" : "Create Account"}
              </Text>
            )}
          </TouchableOpacity>

          {isLogin && (
            <TouchableOpacity
              onPress={() => { setForgotEmail(email.trim()); setShowForgotModal(true); }}
              style={styles.forgotRow}
              testID="auth-forgot-password"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isLogin ? "Don't have an account?" : "Already have an account?"}
            </Text>
            <TouchableOpacity onPress={() => { setIsLogin(!isLogin); setError(""); setSuccessMessage(""); }} testID="auth-switch">
              <Text style={styles.switchLink}>
                {isLogin ? "Sign Up" : "Sign In"}
              </Text>
            </TouchableOpacity>
          </View>

          {isLogin && (
            <View style={styles.demoHint}>
              <Text style={styles.demoText}>
                Try demo: demo@bridges.app / demo123
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showForgotModal}
        transparent
        animationType="fade"
        onRequestClose={closeForgotModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Forgot password?</Text>
                <TouchableOpacity onPress={closeForgotModal} hitSlop={12}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {forgotSuccess ? (
                <View style={styles.forgotSuccessContent}>
                  <View style={styles.forgotSuccessIcon}>
                    <Ionicons name="mail-outline" size={28} color={Colors.primary} />
                  </View>
                  <Text style={styles.forgotSuccessTitle}>Check your email</Text>
                  <Text style={styles.forgotSuccessBody}>
                    If that email is registered, you'll receive a reset link shortly. Check your spam folder if you don't see it.
                  </Text>
                  <TouchableOpacity style={styles.forgotDoneButton} onPress={closeForgotModal}>
                    <Text style={styles.forgotDoneText}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.modalSubtitle}>
                    Enter your email and we'll send you a link to reset your password.
                  </Text>

                  {forgotError ? (
                    <View style={[styles.errorBox, { marginBottom: 12 }]}>
                      <Ionicons name="alert-circle" size={15} color={Colors.danger} />
                      <Text style={styles.errorText}>{forgotError}</Text>
                    </View>
                  ) : null}

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email address</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="you@example.com"
                        placeholderTextColor={Colors.textTertiary}
                        value={forgotEmail}
                        onChangeText={setForgotEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoFocus
                        testID="forgot-email-input"
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, forgotSubmitting && styles.submitButtonDisabled, { marginTop: 8 }]}
                    onPress={handleForgotPassword}
                    disabled={forgotSubmitting}
                    testID="forgot-submit"
                  >
                    {forgotSubmitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.submitText}>Send reset link</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoImage: {
    width: 120,
    height: 70,
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.text,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
  form: {
    gap: 16,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 71, 87, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 71, 87, 0.2)",
  },
  errorText: {
    color: Colors.danger,
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.textSecondary,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 16,
    fontFamily: "Nunito_400Regular",
    color: Colors.text,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontSize: 16,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
  forgotRow: {
    alignItems: "center",
    marginTop: -4,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 14,
    fontFamily: "Nunito_600SemiBold",
    color: Colors.primary,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  switchText: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
  },
  switchLink: {
    fontSize: 14,
    fontFamily: "Nunito_700Bold",
    color: Colors.primary,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(74, 222, 128, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(74, 222, 128, 0.2)",
  },
  successText: {
    color: Colors.success,
    fontFamily: "Nunito_400Regular",
    fontSize: 14,
    flex: 1,
  },
  demoHint: {
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  demoText: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    color: Colors.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 20,
  },
  forgotSuccessContent: {
    alignItems: "center",
    paddingVertical: 8,
  },
  forgotSuccessIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  forgotSuccessTitle: {
    fontSize: 18,
    fontFamily: "Nunito_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  forgotSuccessBody: {
    fontSize: 14,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  forgotDoneButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: "center",
  },
  forgotDoneText: {
    fontSize: 15,
    fontFamily: "Nunito_700Bold",
    color: "#fff",
  },
});
