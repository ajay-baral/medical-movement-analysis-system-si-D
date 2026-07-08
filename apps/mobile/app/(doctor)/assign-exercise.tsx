import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/src/components/Button";
import { ChipRow } from "@/src/components/ChipRow";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { assignmentsApi, exercisesApi, Exercise, patientsApi, PatientDetail } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

const CATS = [
  { id: "upper", label: "Upper" },
  { id: "lower", label: "Lower" },
  { id: "spine", label: "Spine" },
  { id: "facial", label: "Facial" },
];

export default function AssignExercise() {
  const { palette, radii, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [cat, setCat] = useState("lower");
  const [list, setList] = useState<Exercise[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [reps, setReps] = useState("12");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (id) {
        try { setPatient(await patientsApi.detail(Number(id))); } catch { /* ignore */ }
      }
    })();
  }, [id]);

  useEffect(() => {
    (async () => {
      try { setList(await exercisesApi.list({ category: cat })); } catch { /* ignore */ }
    })();
  }, [cat]);

  const save = async () => {
    if (!patient || selected.length === 0) {
      Alert.alert("Select at least one exercise");
      return;
    }
    setSaving(true);
    try {
      const now = new Date();
      now.setHours(9, 0, 0, 0);
      for (const exId of selected) {
        await assignmentsApi.create({
          patient_id: patient.id,
          exercise_id: exId,
          scheduled_for: now.toISOString(),
          target_reps: Number(reps) || 10,
        });
      }
      Alert.alert("Assigned", `${selected.length} exercise(s) assigned to ${patient.name}`);
      router.back();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not assign");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Assign Exercise" subtitle={patient ? `For ${patient.name}` : ""} showBack onBack={() => router.back()} />
      <ChipRow items={CATS} selected={cat} onSelect={setCat} testID="assign-cat-row" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: 8,
          paddingBottom: insets.bottom + 130,
          gap: 10,
        }}
      >
        {list.length === 0 ? (
          <ActivityIndicator size="large" color={palette.primary} style={{ marginTop: 40 }} />
        ) : (
          list.map((e) => {
            const active = selected.includes(e.id);
            return (
              <Pressable
                key={e.id}
                testID={`assign-pick-${e.id}`}
                onPress={() =>
                  setSelected((arr) => (active ? arr.filter((x) => x !== e.id) : [...arr, e.id]))
                }
              >
                <View
                  style={{
                    flexDirection: "row", alignItems: "center", padding: 12,
                    borderRadius: radii.md,
                    backgroundColor: active ? palette.primaryMuted : palette.surface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: active ? palette.primary : palette.border,
                  }}
                >
                  <View
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      backgroundColor: active ? palette.primary : palette.surfaceAlt,
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <Ionicons name={active ? "checkmark" : "add"} size={18} color={active ? "#fff" : palette.textSecondary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "700" }}>
                      {e.name}
                    </Text>
                    <Text style={{ color: palette.textSecondary, fontSize: 11, marginTop: 2 }}>
                      ROM {e.target_rom} · {e.duration_label}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

        <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "800", marginTop: 18 }}>
          Plan parameters
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Input label="Reps / set" value={reps} onChange={setReps} />
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          padding: spacing.lg,
          paddingBottom: insets.bottom + 16,
          backgroundColor: palette.background + "EE",
          borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.divider,
        }}
      >
        <Button
          testID="assign-save"
          label={saving ? "Assigning…" : `Assign ${selected.length} exercise(s)`}
          fullWidth
          iconRight="checkmark"
          onPress={save}
          disabled={saving}
        />
      </View>
    </View>
  );
}

const Input: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => {
  const { palette, radii } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 6 }}>
        {label.toUpperCase()}
      </Text>
      <View style={{ backgroundColor: palette.surface, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border, height: 46, paddingHorizontal: 12, justifyContent: "center" }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="number-pad"
          style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "700" }}
        />
      </View>
    </View>
  );
};
