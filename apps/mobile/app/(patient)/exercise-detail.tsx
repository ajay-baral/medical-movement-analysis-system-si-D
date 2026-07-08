import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/Button";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { exercisesApi, Exercise } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

export default function ExerciseDetail() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, assignmentId } = useLocalSearchParams<{ id: string; assignmentId?: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const e = await exercisesApi.get(Number(id));
        setExercise(e);
      } catch (err: any) {
        setError(err?.message ?? "Exercise not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }
  if (error || !exercise) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, padding: 24, justifyContent: "center" }}>
        <Text style={{ color: palette.danger }}>{error ?? "Not found"}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title={exercise.name} subtitle={exercise.body_part} showBack onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.lg }}>
          <View style={{ borderRadius: radii.lg, overflow: "hidden", backgroundColor: palette.surfaceAlt, ...shadow.md }}>
            <Image source={{ uri: exercise.thumbnail_url }} style={{ width: "100%", height: 200 }} contentFit="cover" />
          </View>

          <View style={{ flexDirection: "row", marginTop: spacing.md, gap: 10 }}>
            <Stat label="Target ROM" value={exercise.target_rom} icon="git-branch" />
            <Stat label="Reps" value={String(exercise.reps)} icon="repeat" />
            <Stat label="Duration" value={exercise.duration_label} icon="time" />
          </View>

          <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800", marginTop: spacing.lg }}>
            About this exercise
          </Text>
          <Text style={{ color: palette.textSecondary, fontSize: 14, marginTop: 8, lineHeight: 22 }}>
            {exercise.description}
          </Text>

          <Text style={{ color: palette.textPrimary, fontSize: 17, fontWeight: "800", marginTop: spacing.lg, marginBottom: 8 }}>
            Instructions
          </Text>
          <View style={{ gap: 8 }}>
            {exercise.instructions.map((step, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  backgroundColor: palette.surface,
                  borderRadius: radii.md,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.border,
                  padding: 12,
                }}
              >
                <View
                  style={{
                    width: 24, height: 24, borderRadius: 12,
                    backgroundColor: palette.primaryMuted,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Text style={{ color: palette.primary, fontSize: 11, fontWeight: "800" }}>
                    {idx + 1}
                  </Text>
                </View>
                <Text style={{ color: palette.textPrimary, fontSize: 13, marginLeft: 10, flex: 1, lineHeight: 19 }}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          padding: spacing.lg,
          paddingBottom: insets.bottom + 16,
          backgroundColor: palette.background + "EE",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderColor: palette.divider,
          gap: 8,
        }}
      >
        {assignmentId ? (
          <Button
            testID="start-medical-session"
            label="Start assigned session"
            iconRight="play"
            fullWidth
            onPress={() =>
              router.push({
                pathname: "/(patient)/live-session",
                params: { id: String(exercise.id), assignmentId, mode: "medical" },
              })
            }
          />
        ) : null}
        <Button
          testID="start-coach-session"
          label="Practice with AI Coach"
          iconRight="sparkles"
          variant={assignmentId ? "secondary" : "primary"}
          fullWidth
          onPress={() =>
            router.push({
              pathname: "/(patient)/live-session",
              params: { id: String(exercise.id), mode: "coach" },
            })
          }
        />
      </View>
    </View>
  );
}

const Stat: React.FC<{ label: string; value: string; icon: keyof typeof Ionicons.glyphMap }> = ({
  label, value, icon,
}) => {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flex: 1, padding: 12, borderRadius: 12,
        backgroundColor: palette.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.border,
        alignItems: "flex-start",
      }}
    >
      <Ionicons name={icon} size={14} color={palette.primary} />
      <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginTop: 6 }}>
        {label}
      </Text>
      <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "800", marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
};
