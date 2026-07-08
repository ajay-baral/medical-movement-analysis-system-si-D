import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/Button";
import { LineChart } from "@/src/components/LineChart";
import { ProgressRing } from "@/src/components/ProgressRing";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { patientsApi, PatientDetail as PatientDetailData } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function PatientDetail() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<PatientDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await patientsApi.detail(Number(id)));
    } catch (e: any) {
      setError(e?.message ?? "Unable to load patient");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color={palette.primary} /></View>;
  }
  if (error || !data) {
    return <View style={{ flex: 1, backgroundColor: palette.background, padding: 24, justifyContent: "center" }}><Text style={{ color: palette.danger }}>{error ?? "Not found"}</Text></View>;
  }

  const riskColor =
    data.risk === "high" ? palette.danger : data.risk === "medium" ? palette.warning : palette.success;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={data.name} subtitle={data.condition ?? "Rehabilitation"} showBack onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <View
            style={[
              {
                backgroundColor: palette.surface, borderRadius: radii.lg, borderColor: palette.border,
                borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, flexDirection: "row", alignItems: "center",
              },
              shadow.sm,
            ]}
          >
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: palette.primaryMuted, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="person" size={26} color={palette.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: "800" }}>{data.name}</Text>
              <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
                {data.age ? `${data.age}y · ` : ""}{data.gender ?? ""}{data.body_part ? ` · ${data.body_part}` : ""}
              </Text>
              <View style={{ flexDirection: "row", marginTop: 6, alignItems: "center" }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: riskColor, marginRight: 6 }} />
                <Text style={{ color: riskColor, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>
                  {data.risk} risk
                </Text>
              </View>
            </View>
            <ProgressRing size={68} strokeWidth={6} value={Math.round(data.recovery)} label="Recov." />
          </View>

          <View style={{ flexDirection: "row", marginTop: spacing.md, gap: 10 }}>
            <Stat label="Compliance" value={`${Math.round(data.compliance)}%`} />
            <Stat label="Sessions" value={`${data.recent_sessions.length}`} />
            <Stat label="Recovery" value={`${Math.round(data.recovery)}%`} />
          </View>

          <View
            style={[
              {
                backgroundColor: palette.surface, borderRadius: radii.lg, borderColor: palette.border,
                borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, marginTop: spacing.md,
              },
              shadow.sm,
            ]}
          >
            <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "800" }}>Recovery trajectory</Text>
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

          <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: 10 }}>
            Recent sessions
          </Text>
          <View style={{ gap: 10 }}>
            {data.recent_sessions.length === 0 ? (
              <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 12 }}>No sessions yet.</Text>
            ) : data.recent_sessions.slice(0, 6).map((s) => (
              <View
                key={s.id}
                style={[
                  { backgroundColor: palette.surface, borderRadius: radii.lg, borderColor: palette.border, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
                  shadow.sm,
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="play-circle" size={22} color={palette.primary} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: palette.textPrimary, fontWeight: "700", fontSize: 14 }}>
                      {s.exercise_name}
                    </Text>
                    <Text style={{ color: palette.textSecondary, fontSize: 11, marginTop: 2 }}>
                      {new Date(s.completed_at).toLocaleDateString([], { month: "short", day: "numeric" })} · ROM {s.min_angle != null ? Math.round(s.min_angle) : "-"}°–{s.max_angle != null ? Math.round(s.max_angle) : "-"}°
                    </Text>
                  </View>
                  <Text style={{ color: palette.textPrimary, fontSize: 16, fontWeight: "800" }}>
                    {Math.round(s.movement_score ?? 0)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          padding: spacing.lg, paddingBottom: insets.bottom + 16,
          backgroundColor: palette.background + "EE",
          borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.divider,
          flexDirection: "row", gap: 10,
        }}
      >
        <Button label="Message" variant="secondary" iconLeft="chatbubble-outline" style={{ flex: 1 }} />
        <Button
          testID="assign-exercise-cta"
          label="Assign exercise"
          iconRight="add"
          style={{ flex: 1.4 }}
          onPress={() => router.push({ pathname: "/(doctor)/assign-exercise", params: { id: String(data.id) } })}
        />
      </View>
    </View>
  );
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border }}>
      <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>{label}</Text>
      <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "800", marginTop: 4 }}>{value}</Text>
    </View>
  );
};
