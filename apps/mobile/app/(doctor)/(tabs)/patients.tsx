import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { PatientCard } from "@/src/components/PatientCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { patientsApi, PatientRecordSummary } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "high", label: "High Risk" },
  { id: "medium", label: "Medium Risk" },
  { id: "low", label: "Low Risk" },
];

export default function DoctorPatients() {
  const { palette, radii, spacing } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PatientRecordSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await patientsApi.list());
    } catch (e: any) {
      setError(e?.message ?? "Unable to load patients");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const list = useMemo(
    () =>
      items.filter(
        (p) =>
          (filter === "all" || p.risk === filter) &&
          (query.length === 0 || p.name.toLowerCase().includes(query.toLowerCase())),
      ),
    [items, filter, query],
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Patients" subtitle={`${items.length} under your care`} showMenu />
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: 8 }}>
        <View
          style={{
            flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 44,
            borderRadius: radii.md, backgroundColor: palette.surface,
            borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border,
          }}
        >
          <Ionicons name="search-outline" size={18} color={palette.textSecondary} />
          <TextInput
            testID="patients-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Search patients"
            placeholderTextColor={palette.textSecondary}
            style={{ flex: 1, marginLeft: 8, color: palette.textPrimary }}
          />
        </View>
      </View>
      <ChipRow items={FILTERS} selected={filter} onSelect={setFilter} testID="patient-filter-row" />
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
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
            gap: 10,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={palette.primary} />
          }
        >
          {list.map((p) => (
            <PatientCard
              key={p.id}
              testID={`patient-${p.id}`}
              patient={p}
              onPress={() => router.push({ pathname: "/(doctor)/patient-detail", params: { id: String(p.id) } })}
            />
          ))}
          {list.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", marginTop: 40 }}>
              No patients found.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
