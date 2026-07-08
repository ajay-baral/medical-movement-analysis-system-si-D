import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/Button";
import { ChipRow } from "@/src/components/ChipRow";
import { ExerciseCard } from "@/src/components/ExerciseCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { exercisesApi, Exercise } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

const CATS = [
  { id: "all", label: "All" },
  { id: "upper", label: "Upper" },
  { id: "lower", label: "Lower" },
  { id: "spine", label: "Spine" },
  { id: "facial", label: "Facial" },
];

export default function AdminExercises() {
  const { palette, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState("all");
  const [list, setList] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await exercisesApi.list({ category: cat === "all" ? undefined : cat });
      setList(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cat]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Exercise Library" subtitle={`${list.length} templates`} showMenu rightIcon="add" />
      <ChipRow items={CATS} selected={cat} onSelect={setCat} testID="admin-ex-cat" />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
          }
        >
          <Button label="Add new exercise" iconLeft="add" fullWidth testID="add-exercise" />
          {list.map((e) => (
            <ExerciseCard
              key={e.id}
              exercise={e}
              testID={`admin-exercise-${e.id}`}
              onPress={() =>
                router.push({ pathname: "/(patient)/exercise-detail", params: { id: String(e.id) } })
              }
            />
          ))}
          {list.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 24 }}>
              No exercises in this category.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
