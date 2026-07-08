import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/Button";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { assignmentsApi, Assignment } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function DoctorAssignments() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await assignmentsApi.list());
    } catch (e: any) {
      setError(e?.message ?? "Unable to load assignments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Assignments" subtitle="Active rehab plans" showMenu />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + 100,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
        }
      >
        <Button
          testID="new-assignment"
          label="New assignment"
          iconLeft="add"
          fullWidth
          onPress={() => router.push("/(doctor)/assign-exercise")}
        />

        <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "800", marginTop: spacing.lg, marginBottom: 10 }}>
          Recent assignments
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={palette.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={{ color: palette.danger }}>{error}</Text>
        ) : items.length === 0 ? (
          <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 24 }}>
            No assignments yet. Tap "New assignment" to create one.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((a) => {
              const when = new Date(a.scheduled_for).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              const statusColor =
                a.status === "completed"
                  ? palette.success
                  : a.status === "missed" || a.status === "cancelled"
                    ? palette.danger
                    : palette.primary;
              return (
                <View
                  key={a.id}
                  testID={`assignment-${a.id}`}
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
                        width: 40, height: 40, borderRadius: 10,
                        backgroundColor: palette.primaryMuted,
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Ionicons name="clipboard-outline" size={18} color={palette.primary} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "800" }}>
                        {a.exercise.name}
                      </Text>
                      <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {a.target_reps} reps · scheduled {when}
                      </Text>
                    </View>
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: statusColor + "22" }}>
                      <Text style={{ color: statusColor, fontSize: 10, fontWeight: "800" }}>
                        {a.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
                    <Tag color={palette.primary} label={`ROM ${a.exercise.target_rom}`} />
                    <Tag color={palette.secondary} label={a.exercise.duration_label} />
                    <Pressable
                      testID={`assignment-cancel-${a.id}`}
                      onPress={async () => {
                        try {
                          await assignmentsApi.update(a.id, { status: "cancelled" });
                          load();
                        } catch { /* ignore */ }
                      }}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: palette.danger + "22" }}
                    >
                      <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800" }}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const Tag: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: color + "22" }}>
    <Text style={{ color, fontSize: 11, fontWeight: "800" }}>{label}</Text>
  </View>
);
