import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { usersApi, AdminUser } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "patient", label: "Patients" },
  { id: "doctor", label: "Doctors" },
  { id: "admin", label: "Admins" },
];

export default function AdminUsers() {
  const { palette, radii, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await usersApi.list(filter === "all" ? undefined : filter));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const toggleStatus = async (u: AdminUser) => {
    const newStatus = u.status === "Active" ? "Suspended" : "Active";
    try {
      await usersApi.update(u.id, { status: newStatus });
      load();
    } catch { /* ignore */ }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Users" subtitle={`${items.length} accounts`} showMenu rightIcon="person-add-outline" />
      <ChipRow items={FILTERS} selected={filter} onSelect={setFilter} testID="user-filter-row" />
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
          {items.map((u) => (
            <View
              key={u.id}
              testID={`admin-user-${u.id}`}
              style={[
                {
                  backgroundColor: palette.surface,
                  borderRadius: radii.lg,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: palette.border,
                  padding: spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                },
                shadow.sm,
              ]}
            >
              <View
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: palette.primaryMuted,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                <Ionicons
                  name={u.role === "patient" ? "body" : u.role === "doctor" ? "medkit" : "shield-checkmark"}
                  size={18}
                  color={palette.primary}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "700" }}>
                  {u.name}
                </Text>
                <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
                  {u.email} · {u.role}
                </Text>
              </View>
              <View
                onTouchEnd={() => toggleStatus(u)}
                style={{
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: u.status === "Active" ? palette.success + "22" : palette.danger + "22",
                }}
              >
                <Text
                  testID={`admin-user-status-${u.id}`}
                  style={{
                    color: u.status === "Active" ? palette.success : palette.danger,
                    fontSize: 10, fontWeight: "800", letterSpacing: 0.6,
                  }}
                >
                  {u.status.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
          {items.length === 0 ? (
            <Text style={{ color: palette.textSecondary, textAlign: "center", padding: 24 }}>
              No users found.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
