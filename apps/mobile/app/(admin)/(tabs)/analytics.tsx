import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LineChart } from "@/src/components/LineChart";
import { MetricCard } from "@/src/components/MetricCard";
import { ScreenHeader } from "@/src/components/ScreenHeader";
import { useTheme } from "@/src/theme/ThemeProvider";

const PROGRESS_WEEKLY = [
  { label: "W1", rom: 62, accuracy: 70, compliance: 60 },
  { label: "W2", rom: 70, accuracy: 75, compliance: 72 },
  { label: "W3", rom: 78, accuracy: 80, compliance: 80 },
  { label: "W4", rom: 85, accuracy: 84, compliance: 88 },
  { label: "W5", rom: 89, accuracy: 88, compliance: 92 },
  { label: "W6", rom: 92, accuracy: 91, compliance: 94 },
];

export default function AdminAnalytics() {
  const { palette, radii, spacing, shadow } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <ScreenHeader title="Analytics" subtitle="Platform engagement & retention" showMenu />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: insets.bottom + 100,
        }}
      >
        <View style={{ flexDirection: "row", gap: 10 }}>
          <MetricCard label="DAU" value="2,141" icon="people" accent={palette.primary} delta="+9.4%" positive />
          <MetricCard label="MAU" value="14.2k" icon="bar-chart" accent={palette.secondary} delta="+12%" positive />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <MetricCard label="Avg session" value="6m 24s" icon="hourglass" accent={palette.accent} delta="+18s" positive />
          <MetricCard label="Retention 30d" value="76%" icon="repeat" accent={palette.warning} delta="-3%" positive={false} />
        </View>

        <View
          style={[
            {
              backgroundColor: palette.surface,
              borderRadius: radii.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.border,
              padding: spacing.md,
              marginTop: spacing.md,
            },
            shadow.sm,
          ]}
        >
          <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "800" }}>
            Engagement by week
          </Text>
          <View style={{ marginTop: 10 }}>
            <LineChart
              labels={PROGRESS_WEEKLY.map((p) => p.label)}
              series={[
                { label: "Active users", color: palette.primary, values: PROGRESS_WEEKLY.map((p) => p.rom + 5) },
                { label: "Sessions", color: palette.secondary, values: PROGRESS_WEEKLY.map((p) => p.accuracy) },
              ]}
            />
          </View>
        </View>

        <View
          style={[
            {
              backgroundColor: palette.surface,
              borderRadius: radii.lg,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.border,
              padding: spacing.md,
              marginTop: spacing.md,
            },
            shadow.sm,
          ]}
        >
          <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "800" }}>
            Top conditions treated
          </Text>
          {[
            { name: "Knee · ACL", pct: 28 },
            { name: "Shoulder · Rotator cuff", pct: 22 },
            { name: "Bell's Palsy", pct: 18 },
            { name: "Stroke recovery", pct: 14 },
            { name: "Lumbar pain", pct: 11 },
          ].map((c) => (
            <View key={c.name} style={{ marginTop: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: "600" }}>
                  {c.name}
                </Text>
                <Text style={{ color: palette.textSecondary, fontSize: 12, fontWeight: "700" }}>
                  {c.pct}%
                </Text>
              </View>
              <View
                style={{
                  height: 6,
                  backgroundColor: palette.surfaceAlt,
                  borderRadius: 3,
                  marginTop: 6,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${c.pct * 2.5}%`,
                    backgroundColor: palette.primary,
                    height: "100%",
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
