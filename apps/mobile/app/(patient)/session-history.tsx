import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { sessionsApi, RehabSession } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function SessionHistory() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<RehabSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSessions(await sessionsApi.list({ limit: 50 }));
    } catch (e: any) {
      setError(e?.message ?? "Unable to load sessions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title="Session History"
        subtitle={loading ? "Loading sessions..." : `${sessions.length} sessions logged`}
        showBack
        onBack={() => router.back()}
      />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : error ? (
        <Text style={{ color: palette.danger, padding: 24 }}>{error}</Text>
      ) : sessions.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
          <Ionicons name="videocam-off-outline" size={48} color={palette.textSecondary} style={{ marginBottom: 12 }} />
          <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: "700" }}>
            No sessions recorded yet
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: 13, marginTop: 6, textAlign: "center", lineHeight: 20 }}>
            Complete a doctor-assigned exercise to build your rehab history.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + 40,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
          }
        >
          {sessions.map((s) => {
            const score = Math.round(s.movement_score ?? 0);
            const dateStr = new Date(s.completed_at).toLocaleDateString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            });
            return (
              <View
                key={s.id}
                testID={`session-${s.id}`}
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
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View
                    style={{
                      width: 44, height: 44, borderRadius: 12,
                      backgroundColor: palette.primaryMuted,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Ionicons name="body-outline" size={20} color={palette.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "700" }}>
                      {s.exercise_name ?? "Rehab session"}
                    </Text>
                    <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {dateStr} · {Math.floor(s.duration_seconds / 60)}m {s.duration_seconds % 60}s
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 48, height: 48, borderRadius: 24,
                      backgroundColor:
                        score >= 85 ? palette.success + "22" : score >= 75 ? palette.warning + "22" : palette.danger + "22",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: score >= 85 ? palette.success : score >= 75 ? palette.warning : palette.danger,
                        fontSize: 16, fontWeight: "800",
                      }}
                    >
                      {score || "—"}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", marginTop: 12, gap: 10 }}>
                  <Stat label="ROM Min" value={s.min_angle !== null ? `${Math.round(s.min_angle)}°` : "—"} />
                  <Stat label="ROM Max" value={s.max_angle !== null ? `${Math.round(s.max_angle)}°` : "—"} />
                  <Stat label="Accuracy" value={s.accuracy !== null ? `${Math.round(s.accuracy)}%` : "—"} />
                </View>
                {s.doctor_feedback ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: palette.surfaceAlt }}>
                    <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>DOCTOR FEEDBACK</Text>
                    <Text style={{ color: palette.textPrimary, fontSize: 13, marginTop: 4 }}>{s.doctor_feedback}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: palette.surfaceAlt }}>
      <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
        {label}
      </Text>
      <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: "800", marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
};
