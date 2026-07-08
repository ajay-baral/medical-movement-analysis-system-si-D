import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { ExerciseCard } from "@/src/components/ExerciseCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { exercisesApi, Exercise } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "upper", label: "Upper Limb" },
  { id: "lower", label: "Lower Limb" },
  { id: "spine", label: "Spine" },
  { id: "facial", label: "Facial" },
];

export default function ExercisesScreen() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState("all");
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await exercisesApi.list({ category: cat === "all" ? undefined : cat });
      setItems(list);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load exercises");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cat]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Exercise Library" subtitle={`${items.length} exercises`} showMenu />
      <ChipRow items={CATEGORIES} selected={cat} onSelect={setCat} testID="exercise-categories" />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : error ? (
        <Text testID="exercises-error" style={{ color: palette.danger, padding: 24 }}>{error}</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
            gap: 10,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={palette.primary}
            />
          }
        >
          {items.map((ex) => (
            <ExerciseCard
              key={ex.id}
              testID={`exercise-${ex.id}`}
              exercise={ex}
              onPress={() =>
                router.push({ pathname: "/(patient)/exercise-detail", params: { id: String(ex.id) } })
              }
            />
          ))}
          {items.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", marginTop: 40 }}>
              No exercises in this category.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
