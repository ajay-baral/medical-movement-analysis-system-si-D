import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Alert } from "react-native";

import { Button } from "@/src/components/Button";
import { FormField } from "@/src/components/FormField";
import { useTheme } from "@/src/theme/ThemeProvider";
import { storage } from "@/src/utils/storage";
import { patientFlow } from "@/src/runtime/client";

type Role = "patient" | "doctor" | "admin";

const ROLE_META: Record<Role, { title: string; sub: string; icon: keyof typeof Ionicons.glyphMap }> = {
  patient: { title: "Patient Login", sub: "Welcome back. Continue your recovery.", icon: "body" },
  doctor: { title: "Doctor Login", sub: "Manage your patients & protocols.", icon: "medkit" },
  admin: { title: "Admin Login", sub: "System operations & user management.", icon: "shield-checkmark" },
};

export default function Login() {
  const router = useRouter();
  const { palette, spacing, radii } = useTheme();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: Role = (params.role as Role) || "patient";
  const meta = ROLE_META[role];

  const [email, setEmail] = useState(
    role === "patient" ? "aarav@medmove.ai" : role === "doctor" ? "neha@medmove.ai" : "admin@medmove.ai",
  );
  const [password, setPassword] = useState(
    role === "patient" ? "PatientPass1!" : role === "doctor" ? "DoctorPass1!" : "AdminPass1!"
  );
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Validation Error", "Please enter email and password.");
      return;
    }
    setLoading(true);
    try {
      const user = await patientFlow.login(email.trim().toLowerCase(), password);
      const actualRole = user.role || role;
      await storage.setItem("medmove.role", actualRole);
      await storage.setItem("medmove.email", user.email);
      await storage.setItem("medmove.name", user.name);
      await storage.setItem("medmove.userId", user.id);
      setLoading(false);
      if (actualRole === "patient") router.replace("/(patient)/(tabs)");
      else if (actualRole === "doctor") router.replace("/(doctor)/(tabs)");
      else router.replace("/(admin)/(tabs)");
    } catch (err: any) {
      setLoading(false);
      Alert.alert("Login Failed", err.message || "Invalid credentials");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            testID="back-button"
            onPress={() => router.back()}
            style={[
              styles.iconBtn,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
          </Pressable>

          <View style={{ marginTop: 32, alignItems: "flex-start" }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                backgroundColor: palette.primaryMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={meta.icon} size={24} color={palette.primary} />
            </View>
            <Text
              style={{
                color: palette.textPrimary,
                fontSize: 28,
                fontWeight: "800",
                marginTop: 18,
                letterSpacing: -0.5,
              }}
            >
              {meta.title}
            </Text>
            <Text style={{ color: palette.textSecondary, fontSize: 14, marginTop: 6 }}>
              {meta.sub}
            </Text>
          </View>

          <View style={{ marginTop: 28 }}>
            <FormField
              testID="input-email"
              label="Email"
              icon="mail-outline"
              placeholder="you@medmove.ai"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <FormField
              testID="input-password"
              label="Password"
              icon="lock-closed-outline"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secure
            />
            <Pressable
              testID="forgot-password-link"
              onPress={() => router.push("/(auth)/forgot-password")}
              style={{ alignSelf: "flex-end", marginTop: 2, marginBottom: 8 }}
            >
              <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "600" }}>
                Forgot password?
              </Text>
            </Pressable>

            <Button
              testID="login-submit-button"
              label="Sign in securely"
              iconRight="arrow-forward"
              fullWidth
              loading={loading}
              onPress={onSubmit}
            />

            <View style={[styles.divider, { borderColor: palette.divider }]}>
              <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
                OR
              </Text>
            </View>

            <Button
              label="Continue with biometrics"
              iconLeft="finger-print"
              variant="secondary"
              fullWidth
              onPress={onSubmit}
              testID="biometrics-login"
            />
          </View>

          <View style={{ flex: 1 }} />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 28,
            }}
          >
            <Text style={{ color: palette.textSecondary, fontSize: 13 }}>New here? </Text>
            <Pressable
              testID="navigate-register"
              onPress={() => router.push({ pathname: "/(auth)/register", params: { role } })}
            >
              <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "700" }}>
                Create {role} account
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    marginVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    alignItems: "center",
  },
});
