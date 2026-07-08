import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/ScreenHeader";
import { notificationsApi, Notification } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  reminder: "alarm-outline",
  report: "document-text-outline",
  doctor: "medkit-outline",
  system: "settings-outline",
  assignment: "clipboard-outline",
};

function relTime(iso: string): string {
  const now = new Date();
  const t = new Date(iso);
  const diff = Math.max(0, now.getTime() - t.getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Notifications() {
  const { palette, radii, spacing, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await notificationsApi.list();
      setItems(r.items);
      setUnread(r.unread_count);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const readOne = async (id: number) => {
    setItems(items.map((i) => (i.id === id ? { ...i, is_read: true } : i)));
    setUnread(Math.max(0, unread - 1));
    try { await notificationsApi.markRead(id); } catch { /* ignore */ }
  };

  const readAll = async () => {
    setItems(items.map((i) => ({ ...i, is_read: true })));
    setUnread(0);
    try { await notificationsApi.markAllRead(); } catch { /* ignore */ }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader
        title="Notifications"
        subtitle={`${unread} unread`}
        showBack
        onBack={() => router.back()}
        rightIcon="checkmark-done"
        onRight={readAll}
      />
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={palette.primary} />
        </View>
      ) : error ? (
        <Text style={{ color: palette.danger, padding: 24 }}>{error}</Text>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="notifications-off-outline" size={40} color={palette.textSecondary} />
          <Text style={{ color: palette.textSecondary, marginTop: 10 }}>No notifications yet.</Text>
        </View>
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
          {items.map((n) => {
            const icon = ICONS[n.type] ?? "notifications-outline";
            const isUnread = !n.is_read;
            return (
              <Pressable key={n.id} testID={`notification-${n.id}`} onPress={() => readOne(n.id)}>
                <View
                  style={[
                    {
                      backgroundColor: palette.surface,
                      borderRadius: radii.lg,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: isUnread ? palette.primary : palette.border,
                      padding: spacing.md,
                      flexDirection: "row",
                    },
                    shadow.sm,
                  ]}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: palette.primaryMuted,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name={icon} size={18} color={palette.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ color: palette.textPrimary, fontSize: 14, fontWeight: "700", flex: 1 }}>
                        {n.title}
                      </Text>
                      {isUnread ? (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.primary }} />
                      ) : null}
                    </View>
                    <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                      {n.body}
                    </Text>
                    <Text style={{ color: palette.textSecondary, fontSize: 11, marginTop: 6, fontWeight: "600" }}>
                      {relTime(n.created_at)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
