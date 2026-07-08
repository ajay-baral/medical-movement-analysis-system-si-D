import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/src/theme/ThemeProvider";

interface PatientView {
  id: number | string;
  name: string;
  age?: number | null;
  condition?: string | null;
  compliance: number;
  recovery: number;
  risk: "low" | "medium" | "high" | string;
  avatar?: string;
  avatar_url?: string | null;
}

interface Props {
  patient: PatientView;
  onPress?: () => void;
  testID?: string;
}

export const PatientCard: React.FC<Props> = ({ patient, onPress, testID }) => {
  const { palette, radii, shadow, spacing } = useTheme();
  const riskColor =
    patient.risk === "high"
      ? palette.danger
      : patient.risk === "medium"
        ? palette.warning
        : palette.success;
  const avatar =
    patient.avatar_url ||
    patient.avatar ||
    "https://images.pexels.com/photos/3771089/pexels-photo-3771089.jpeg?auto=compress&cs=tinysrgb&w=300";

  return (
    <Pressable testID={testID} onPress={onPress}>
      <View
        style={[
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderRadius: radii.lg,
            borderWidth: StyleSheet.hairlineWidth,
            padding: spacing.md,
          },
          shadow.sm,
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              overflow: "hidden",
              backgroundColor: palette.surfaceAlt,
            }}
          >
            <Image
              source={{ uri: avatar }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ color: palette.textPrimary, fontSize: 15, fontWeight: "700" }}>
                {patient.name}
              </Text>
              <View
                style={{
                  marginLeft: 8,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: riskColor,
                }}
              />
            </View>
            <Text style={{ color: palette.textSecondary, fontSize: 12, marginTop: 2 }}>
              {patient.age}y · {patient.condition}
            </Text>
            <View style={{ flexDirection: "row", marginTop: 8, gap: 14 }}>
              <View style={styles.metric}>
                <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700" }}>
                  COMPLIANCE
                </Text>
                <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: "700" }}>
                  {patient.compliance}%
                </Text>
              </View>
              <View style={styles.metric}>
                <Text style={{ color: palette.textSecondary, fontSize: 10, fontWeight: "700" }}>
                  RECOVERY
                </Text>
                <Text style={{ color: palette.textPrimary, fontSize: 13, fontWeight: "700" }}>
                  {patient.recovery}%
                </Text>
              </View>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.textSecondary} />
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  metric: {},
});
