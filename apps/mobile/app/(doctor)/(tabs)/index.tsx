import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LineChart } from "@/src/components/LineChart";
import { MetricCard } from "@/src/components/MetricCard";
import { PatientCard } from "@/src/components/PatientCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { dashboardsApi, DoctorDashboard } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function DoctorHome() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DoctorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await dashboardsApi.doctor());
    } catch (e: any) {
      setError(e?.message ?? "Unable to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, padding: 24, justifyContent: "center" }}>
        <Text style={{ color: palette.danger }}>{error ?? "No data"}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={`Good day, ${data.doctor_name.split(" ").slice(0, 2).join(" ")}`} subtitle={new Date().toDateString()} showMenu rightIcon="search-outline" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
        }
      >
        <View style={{ paddingHorizontal: spacing.lg }}>
          <LinearGradient
            colors={[palette.secondary, palette.primary]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: radii.lg, padding: spacing.md, ...shadow.md }}
          >
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }}>
              CLINIC TODAY
            </Text>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", marginTop: 6 }}>
              {data.sessions_today} session{data.sessions_today === 1 ? "" : "s"} · {data.reviews_pending} review{data.reviews_pending === 1 ? "" : "s"}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, marginTop: 6, lineHeight: 19 }}>
              {data.risk_flags} patient{data.risk_flags === 1 ? "" : "s"} flagged for risk. Timely review lifts outcomes.
            </Text>
            <Pressable
              testID="review-flagged"
              onPress={() => router.push("/(doctor)/(tabs)/patients")}
              style={{ marginTop: 14, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", flexDirection: "row", alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>Review flagged</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" style={{ marginLeft: 6 }} />
            </Pressable>
          </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard label="Active patients" value={`${data.active_patients}`} icon="people" accent={palette.primary} />
            <MetricCard label="Avg compliance" value={`${Math.round(data.avg_compliance)}%`} icon="checkmark-done" accent={palette.success} />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <MetricCard label="Avg recovery" value={`${Math.round(data.avg_recovery)}%`} icon="trending-up" accent={palette.secondary} />
            <MetricCard label="Risk flags" value={`${data.risk_flags}`} icon="alert" accent={palette.warning} />
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <View
            style={[
              {
                backgroundColor: palette.surface,
                borderRadius: radii.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.border,
                padding: spacing.md,
              },
              shadow.sm,
            ]}
          >
            <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "800" }}>
              Cohort recovery trend
            </Text>
            <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
              Across {data.active_patients} patients · 6 weeks
            </Text>
            <View style={{ marginTop: 10 }}>
              <LineChart
                labels={data.weekly.map((p) => p.label)}
                series={[
                  { label: "ROM", color: palette.primary, values: data.weekly.map((p) => p.rom) },
                  { label: "Compliance", color: palette.secondary, values: data.weekly.map((p) => p.compliance) },
                ]}
              />
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <View style={styles.sectionRow}>
            <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800" }}>
              Flagged patients
            </Text>
            <Pressable testID="view-all-patients" onPress={() => router.push("/(doctor)/(tabs)/patients")}>
              <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "700" }}>See all</Text>
            </Pressable>
          </View>
          {data.flagged_patients.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 12 }}>
              No flagged patients — great work.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {data.flagged_patients.map((p) => (
                <PatientCard
                  key={p.id}
                  testID={`patient-${p.id}`}
                  patient={p}
                  onPress={() => router.push({ pathname: "/(doctor)/patient-detail", params: { id: String(p.id) } })}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
});
