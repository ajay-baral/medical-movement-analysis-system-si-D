import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { reportsApi, Report } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function DoctorReports() {
  const { palette, radii, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await reportsApi.list());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Reports" subtitle="Patient PDF history" showMenu />
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
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
          }
        >
          {items.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 24 }}>
              Reports appear here after generation.
            </Text>
          ) : (
            items.map((r) => {
              const score = Math.round(r.summary?.avg_score ?? 0);
              return (
                <Pressable
                  key={r.id}
                  testID={`doctor-report-${r.id}`}
                  onPress={() => {
                    const url = reportsApi.pdfUrl(r.id);
                    if (Platform.OS === "web") window.open(url, "_blank");
                    else Linking.openURL(url);
                  }}
                >
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
                          width: 44, height: 56, borderRadius: 8,
                          backgroundColor: palette.primaryMuted,
                          alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <Ionicons name="document-text" size={22} color={palette.primary} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "700" }}>
                          {r.title}
                        </Text>
                        <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 4 }}>
                          {new Date(r.generated_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })} · {r.summary?.sessions_completed ?? 0} sessions
                        </Text>
                      </View>
                      <Text style={{ color: palette.textPrimary, fontSize: 18, fontWeight: "800" }}>
                        {score}
                      </Text>
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
