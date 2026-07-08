import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ExerciseCard } from "@/src/components/ExerciseCard";
import { LineChart } from "@/src/components/LineChart";
import { MetricCard } from "@/src/components/MetricCard";
import { ProgressRing } from "@/src/components/ProgressRing";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { dashboardsApi, PatientDashboard } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function PatientHome() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<PatientDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await dashboardsApi.patient();
      setData(d);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

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
        <Text testID="dashboard-error" style={{ color: palette.danger, fontSize: 14, marginBottom: 12 }}>
          {error ?? "No data available"}
        </Text>
        <Pressable
          testID="dashboard-retry"
          onPress={() => { setLoading(true); load(); }}
          style={{ padding: 12, backgroundColor: palette.primary, borderRadius: 10, alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const firstName = data.patient_name.split(" ")[0];
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title={`Hello, ${firstName}`}
        subtitle="Let's keep recovering today."
        showMenu
        rightIcon="notifications-outline"
        rightBadge={data.unread_notifications}
        onRight={() => router.push("/(patient)/notifications")}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={palette.primary}
          />
        }
      >
        {/* Hero recovery card */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: 4 }}>
          <LinearGradient
            colors={[palette.primary, palette.accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: radii.lg,
              padding: spacing.md,
              flexDirection: "row",
              alignItems: "center",
              ...shadow.md,
            }}
          >
            <ProgressRing value={Math.round(data.recovery_percent)} size={108} strokeWidth={10} label="Recovery" />
            <View style={{ marginLeft: spacing.md, flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
                Week {data.week_number} · {data.program_label.replace(/ · Week \d+$/, "")}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 6, lineHeight: 19 }}>
                Recovery {Math.round(data.recovery_percent)}%. Keep your routine consistent.
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 12,
                  alignSelf: "flex-start",
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.18)",
                }}
              >
                <Ionicons name="trophy" size={14} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700", marginLeft: 6 }}>
                  Streak · {data.streak_days} day{data.streak_days === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Quick KPIs */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <MetricCard
              testID="metric-today"
              label="Today"
              value={`${data.metrics.today_completed}/${data.metrics.today_total}`}
              icon="checkmark-done"
              delta={`${data.metrics.today_percent}% done`}
              positive
              accent={palette.primary}
            />
            <MetricCard
              testID="metric-rom"
              label="Avg ROM"
              value={`${Math.round(data.metrics.rom_avg)}°`}
              icon="git-branch"
              accent={palette.secondary}
            />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <MetricCard
              testID="metric-accuracy"
              label="Accuracy"
              value={`${Math.round(data.metrics.accuracy_avg)}%`}
              icon="ribbon"
              accent={palette.accent}
            />
            <MetricCard
              testID="metric-compliance"
              label="Compliance"
              value={`${Math.round(data.metrics.compliance_percent)}%`}
              icon="calendar"
              accent={palette.warning}
            />
          </View>
        </View>

        {/* Today's exercises */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <View style={styles.sectionRow}>
            <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800" }}>
              Today&apos;s exercises
            </Text>
            <Pressable
              testID="link-exercises"
              onPress={() => router.push("/(patient)/(tabs)/exercises")}
            >
              <Text style={{ color: palette.primary, fontSize: 13, fontWeight: "700" }}>
                View all
              </Text>
            </Pressable>
          </View>
          {data.todays_assignments.length === 0 ? (
            <View testID="empty-today" style={{ paddingVertical: 24, alignItems: "center" }}>
              <Ionicons name="calendar-outline" size={28} color={palette.textSecondary} />
              <Text style={{ color: palette.textSecondary, marginTop: 8, fontSize: 13 }}>
                No exercises scheduled for today.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {data.todays_assignments.map((a) => {
                const time = new Date(a.scheduled_for).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                return (
                  <ExerciseCard
                    key={a.id}
                    testID={`assigned-${a.id}`}
                    exercise={a.exercise}
                    scheduledAt={time}
                    status={a.status === "cancelled" ? "missed" : a.status}
                    onPress={() =>
                      router.push({ pathname: "/(patient)/exercise-detail", params: { id: String(a.exercise.id), assignmentId: String(a.id) } })
                    }
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* Recovery trend chart */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <View
            style={[
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                borderRadius: radii.lg,
                borderWidth: StyleSheet.hairlineWidth,
                padding: spacing.md,
              },
              shadow.sm,
            ]}
          >
            <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "700" }}>
              Recovery trend · 6 weeks
            </Text>
            <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
              ROM and Accuracy improvements
            </Text>
            <View style={{ marginTop: 10 }}>
              <LineChart
                labels={data.weekly.map((p) => p.label)}
                series={[
                  { label: "ROM", color: palette.primary, values: data.weekly.map((p) => p.rom) },
                  { label: "Accuracy", color: palette.secondary, values: data.weekly.map((p) => p.accuracy) },
                ]}
              />
            </View>
          </View>
        </View>

        {/* Last analysis */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800", marginBottom: 10 }}>
            Last analysis
          </Text>
          {data.last_session ? (
            <Pressable
              testID="last-analysis-card"
              onPress={() => router.push("/(patient)/session-history")}
            >
              <View
                style={[
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    borderRadius: radii.lg,
                    borderWidth: StyleSheet.hairlineWidth,
                    padding: spacing.md,
                  },
                  shadow.sm,
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: palette.primaryMuted,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="pulse" size={20} color={palette.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "700" }}>
                      {data.last_session.exercise_name ?? "Session"} · {Math.floor(data.last_session.duration_seconds / 60)}m {data.last_session.duration_seconds % 60}s
                    </Text>
                    <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {new Date(data.last_session.completed_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: palette.textPrimary, fontSize: 18, fontWeight: "800" }}>
                      {Math.round(data.last_session.movement_score ?? 0)}
                    </Text>
                    <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700" }}>
                      SCORE
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", marginTop: 14, gap: 12 }}>
                  <Stat
                    label="ROM"
                    value={
                      data.last_session.min_angle !== null && data.last_session.max_angle !== null
                        ? `${Math.round(data.last_session.min_angle)}°–${Math.round(data.last_session.max_angle)}°`
                        : "—"
                    }
                    color={palette.primary}
                  />
                  <Stat
                    label="Accuracy"
                    value={data.last_session.accuracy != null ? `${Math.round(data.last_session.accuracy)}%` : "—"}
                    color={palette.success}
                  />
                  <Stat
                    label="Symmetry"
                    value={data.last_session.symmetry != null ? `${Math.round(data.last_session.symmetry)}%` : "—"}
                    color={palette.secondary}
                  />
                </View>
              </View>
            </Pressable>
          ) : (
            <View testID="empty-last-session" style={{ paddingVertical: 20, alignItems: "center" }}>
              <Text style={{ color: palette.textSecondary, fontSize: 13 }}>
                Complete your first session to see analysis here.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const Stat: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: palette.surfaceAlt }}>
      <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
        {label}
      </Text>
      <Text style={{ color, fontSize: 14, fontWeight: "800", marginTop: 4 }}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
});
