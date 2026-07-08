import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { LineChart } from "@/src/components/LineChart";
import { MetricCard } from "@/src/components/MetricCard";
import { ProgressRing } from "@/src/components/ProgressRing";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import {
  progressApi,
  sessionsApi,
  RehabSession,
  WeeklyPoint,
} from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

const RANGES = [
  { id: "1w", label: "1 Week" },
  { id: "1m", label: "1 Month" },
  { id: "3m", label: "3 Months" },
  { id: "all", label: "All time" },
];

export default function PatientProgress() {
  const { palette, radii, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState("1m");
  const [weekly, setWeekly] = useState<WeeklyPoint[]>([]);
  const [trend, setTrend] = useState("");
  const [sessions, setSessions] = useState<RehabSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, s] = await Promise.all([
        progressApi.progress(),
        sessionsApi.list({ limit: 10 }),
      ]);
      setWeekly(p.weekly);
      setTrend(p.trend_summary);
      setSessions(s);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load progress");
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

  const last = weekly[weekly.length - 1];
  const first = weekly[0];
  const rom = last?.rom ?? 0;
  const acc = last?.accuracy ?? 0;
  const comp = last?.compliance ?? 0;
  const romDelta = last && first ? Math.round(rom - first.rom) : 0;
  const accDelta = last && first ? Math.round(acc - first.accuracy) : 0;
  const compDelta = last && first ? Math.round(comp - first.compliance) : 0;
  const recovery = Math.round((rom + acc + comp) / 3);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Progress" subtitle="Recovery trends" showMenu />
      <ChipRow items={RANGES} selected={range} onSelect={setRange} testID="range-row" />
      {error ? (
        <Text style={{ color: palette.danger, padding: 24 }}>{error}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
          }
        >
          <View
            style={[
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                borderRadius: radii.lg,
                borderWidth: StyleSheet.hairlineWidth,
                padding: spacing.md,
                flexDirection: "row",
                alignItems: "center",
              },
              shadow.sm,
            ]}
          >
            <ProgressRing value={recovery} size={110} strokeWidth={10} label="Overall" />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
                RECOVERY SCORE
              </Text>
              <Text style={{ color: palette.textPrimary, fontSize: 24, fontWeight: "800", marginTop: 4 }}>
                On track
              </Text>
              <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                {trend}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md }}>
            <MetricCard label="ROM" value={`${Math.round(rom)}°`} delta={`${romDelta >= 0 ? "+" : ""}${romDelta}°`} positive={romDelta >= 0} icon="git-branch" accent={palette.primary} />
            <MetricCard label="Accuracy" value={`${Math.round(acc)}%`} delta={`${accDelta >= 0 ? "+" : ""}${accDelta}%`} positive={accDelta >= 0} icon="ribbon" accent={palette.secondary} />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <MetricCard label="Compliance" value={`${Math.round(comp)}%`} delta={`${compDelta >= 0 ? "+" : ""}${compDelta}%`} positive={compDelta >= 0} icon="calendar" accent={palette.accent} />
            <MetricCard label="Sessions" value={`${sessions.length}`} delta="Recent" positive icon="albums" accent={palette.warning} />
          </View>

          <View
            style={[
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                borderRadius: radii.lg,
                borderWidth: StyleSheet.hairlineWidth,
                padding: spacing.md,
                marginTop: spacing.md,
              },
              shadow.sm,
            ]}
          >
            <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "700" }}>
              Trends
            </Text>
            <View style={{ marginTop: 10 }}>
              <LineChart
                labels={weekly.map((p) => p.label)}
                series={[
                  { label: "ROM", color: palette.primary, values: weekly.map((p) => p.rom) },
                  { label: "Accuracy", color: palette.secondary, values: weekly.map((p) => p.accuracy) },
                  { label: "Compliance", color: palette.accent, values: weekly.map((p) => p.compliance) },
                ]}
              />
            </View>
          </View>

          <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: 10 }}>
            Recent sessions
          </Text>
          {sessions.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 12 }}>
              No completed sessions yet.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {sessions.slice(0, 4).map((s) => (
                <View
                  key={s.id}
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
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: palette.primaryMuted,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ionicons name="checkmark" size={18} color={palette.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "700" }}>
                        {s.exercise_name ?? "Session"}
                      </Text>
                      <Text style={{ color: palette.textSecondary, fontSize: 11, marginTop: 2 }}>
                        {new Date(s.completed_at).toLocaleDateString([], { month: "short", day: "numeric" })} · {Math.floor(s.duration_seconds / 60)}m {s.duration_seconds % 60}s
                      </Text>
                    </View>
                    <Text style={{ color: palette.textPrimary, fontSize: 18, fontWeight: "800" }}>
                      {Math.round(s.movement_score ?? 0)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
