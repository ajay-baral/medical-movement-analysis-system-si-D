import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LineChart } from "@/src/components/LineChart";
import { MetricCard } from "@/src/components/MetricCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { systemApi, usersApi, AdminUser, SystemMetric } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function AdminOverview() {
  const { palette, radii, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [metrics, setMetrics] = useState<SystemMetric[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, u] = await Promise.all([systemApi.health(), usersApi.list()]);
      setMetrics(m.metrics);
      setUsers(u);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const doctors = users.filter((u) => u.role === "doctor").length;
  const patients = users.filter((u) => u.role === "patient").length;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="System Overview" subtitle="MEDMOVE AI · Production" showMenu />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
          }
        >
          <LinearGradient
            colors={[palette.accent, palette.primary]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: radii.lg, padding: spacing.md, ...shadow.md }}
          >
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>
              UPTIME · LIVE
            </Text>
            <Text style={{ color: "#fff", fontSize: 32, fontWeight: "800", marginTop: 4, letterSpacing: -0.5 }}>
              {metrics.find((m) => m.label === "API Uptime")?.value ?? "99.9%"}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 4 }}>
              {users.length} accounts · {doctors} doctors · {patients} patients
            </Text>
          </LinearGradient>

          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md }}>
            <MetricCard label="Active users" value={`${users.length}`} icon="people" accent={palette.primary} />
            <MetricCard label="Doctors" value={`${doctors}`} icon="medkit" accent={palette.secondary} />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <MetricCard label="Patients" value={`${patients}`} icon="body" accent={palette.accent} />
            <MetricCard label="Suspended" value={`${users.filter((u) => u.status === "Suspended").length}`} icon="ban" accent={palette.warning} />
          </View>

          <View
            style={[
              {
                backgroundColor: palette.surface, borderRadius: radii.lg,
                borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border,
                padding: spacing.md, marginTop: spacing.md,
              },
              shadow.sm,
            ]}
          >
            <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "800" }}>
              Engagement trend
            </Text>
            <View style={{ marginTop: 10 }}>
              <LineChart
                labels={["W1", "W2", "W3", "W4", "W5", "W6"]}
                series={[
                  { label: "Users", color: palette.primary, values: [10, 12, 15, 18, users.length, users.length].slice(-6) },
                ]}
              />
            </View>
          </View>

          <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: 10 }}>
            System health
          </Text>
          <View style={{ gap: 10 }}>
            {metrics.map((m) => {
              const color = m.status === "healthy" ? palette.success : m.status === "warning" ? palette.warning : palette.danger;
              return (
                <View
                  key={m.label}
                  testID={`system-${m.label}`}
                  style={{
                    flexDirection: "row", alignItems: "center",
                    backgroundColor: palette.surface,
                    borderRadius: radii.md,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: palette.border,
                    padding: 14,
                  }}
                >
                  <View
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      backgroundColor: color + "22",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Ionicons name="pulse" size={18} color={color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: "700" }}>
                      {m.label}
                    </Text>
                  </View>
                  <Text style={{ color, fontSize: 14, fontWeight: "800" }}>{m.value}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
