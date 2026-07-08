import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/Button";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { reportsApi, Report } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function Reports() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await reportsApi.list());
    } catch (e: any) {
      setError(e?.message ?? "Unable to load reports");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const generate = async () => {
    setGenerating(true);
    try {
      await reportsApi.generate({ days: 7 });
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not generate report");
    } finally {
      setGenerating(false);
    }
  };

  const view = (r: Report) => {
    const url = reportsApi.pdfUrl(r.id);
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      Linking.openURL(url);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title="Reports"
        subtitle="Download or share PDFs"
        showBack
        onBack={() => router.back()}
        rightIcon="add"
        onRight={generate}
      />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : error ? (
        <Text style={{ color: palette.danger, padding: 24 }}>{error}</Text>
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
          <View style={{ marginBottom: 8 }}>
            <Button
              testID="generate-report-btn"
              label={generating ? "Generating…" : "Generate weekly report"}
              iconLeft="document-attach-outline"
              onPress={generate}
              disabled={generating}
              fullWidth
            />
          </View>
          {items.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 24 }}>
              No reports yet. Generate your first weekly report.
            </Text>
          ) : (
            items.map((r) => {
              const score = Math.round(r.summary?.avg_score ?? 0);
              const exercises = r.summary?.sessions_completed ?? 0;
              return (
                <Pressable key={r.id} testID={`report-${r.id}`} onPress={() => view(r)}>
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
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View
                        style={{
                          width: 44,
                          height: 56,
                          borderRadius: 8,
                          backgroundColor: palette.primaryMuted,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="document-text" size={22} color={palette.primary} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "700" }}>
                          {r.title}
                        </Text>
                        <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 4 }}>
                          {new Date(r.generated_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} · {exercises} sessions
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: palette.textPrimary, fontSize: 18, fontWeight: "800" }}>
                          {score}
                        </Text>
                        <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700" }}>
                          SCORE
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
                      <ActionBtn icon="eye-outline" label="View PDF" onPress={() => view(r)} />
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const ActionBtn: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }> = ({ icon, label, onPress }) => {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 10,
        backgroundColor: palette.surfaceAlt,
        borderRadius: 10,
      }}
    >
      <Ionicons name={icon} size={14} color={palette.textPrimary} />
      <Text style={{ color: palette.textPrimary, fontSize: 12, fontWeight: "700", marginLeft: 6 }}>
        {label}
      </Text>
    </Pressable>
  );
};
