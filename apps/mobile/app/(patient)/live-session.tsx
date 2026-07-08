// MEDMOVE AI Live Analysis HUD.
// Real-time camera with MediaPipe-style skeleton overlay (body) or face mesh
// placement guide (face). True MediaPipe inference will be wired through a
// native AI service in a development build; this screen mocks the feedback
// pipeline so the UI behaves identically to production.

import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  Alert,
  ActivityIndicator,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { Button } from "@/src/components/Button";
import { FaceMeshOverlay } from "@/src/components/FaceMeshOverlay";
import { SkeletonOverlay } from "@/src/components/SkeletonOverlay";
import { exercisesApi, Exercise, coachApi, sessionsApi } from "@/src/api/apiClient";
import { useTheme } from "@/src/theme/ThemeProvider";
import { patientFlow } from "@/src/runtime/client";

const FEEDBACK_CYCLE = [
  { text: "Hold steady, finding pose", tone: "info" as const },
  { text: "Lift slightly higher", tone: "warn" as const },
  { text: "Excellent form!", tone: "success" as const },
  { text: "Slow down", tone: "warn" as const },
  { text: "Hold for 2s", tone: "info" as const },
  { text: "Rep counted ✓", tone: "success" as const },
];

export default function LiveSession() {
  const router = useRouter();
  const { palette } = useTheme();
  const { id, mode, assignmentId } = useLocalSearchParams<{ id?: string; mode?: string; assignmentId?: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const e = await exercisesApi.get(Number(id) || 1);
        setExercise(e);
      } catch { /* ignore */ }
    })();
  }, [id]);
  const isFacial = exercise?.category === "facial";

  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [facing, setFacing] = useState<"front" | "back">(isFacial ? "front" : "front");
  const [isSimulated, setIsSimulated] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voice, setVoice] = useState(true);
  const [reps, setReps] = useState(0);
  const [feedbackIdx, setFeedbackIdx] = useState(0);
  const [angle, setAngle] = useState(38);
  const [score, setScore] = useState(81);

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState("");

  const latestVideoUriRef = useRef<string | null>(null);
  const latestDurationRef = useRef<number>(10);

  const { width, height } = Dimensions.get("window");
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse]);

  // Request permissions automatically on mount
  useEffect(() => {
    const initPermissions = async () => {
      try {
        const cam = await requestPermission();
        if (cam.granted) {
          await requestMicPermission();
        }
      } catch (err) {
        console.warn("Failed to request permissions automatically on mount:", err);
      }
    };
    initPermissions();
  }, []);

  const startRecording = async () => {
    if (!cameraRef.current) {
      startSimulatedRecording();
      return;
    }
    setVideoUri(null);
    latestVideoUriRef.current = null;
    setElapsedSeconds(0);
    setRecording(true);
    const startedAt = Date.now();
    try {
      cameraRef.current
        .recordAsync({ maxDuration: 15 })
        .then((video) => {
          if (video?.uri) {
            setVideoUri(video.uri);
            latestVideoUriRef.current = video.uri;
            const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            setDurationSeconds(duration);
            latestDurationRef.current = duration;
          } else {
            if (latestVideoUriRef.current === null) {
              startSimulatedRecording();
            }
          }
        })
        .catch((error) => {
          console.warn("Camera recording failed:", error);
          Alert.alert(
            "Recording Failed",
            `Real-time video recording failed: ${error?.message || error}\n\nTroubleshooting:\n1. Ensure you have granted BOTH Camera and Microphone permissions in your phone settings.\n2. If you are on an emulator, please use "Simulate Camera" mode.`,
            [{ text: "OK" }]
          );
          if (latestVideoUriRef.current === null) {
            startSimulatedRecording();
          }
        });
    } catch (error) {
      console.warn("Camera recording initiation failed, using simulated assessment fallback:", error);
      startSimulatedRecording();
    }
  };

  const startSimulatedRecording = () => {
    Alert.alert(
      "Simulated Recording",
      "Camera recording is unavailable on this device/simulator. Falling back to simulated assessment mode so you can test the upload and backend analysis!",
      [{ text: "OK" }]
    );
    setVideoUri("simulated");
    latestVideoUriRef.current = "simulated";
    setElapsedSeconds(0);
    setRecording(true);
  };

  const stopRecording = () => {
    if (latestVideoUriRef.current === "simulated") {
      setRecording(false);
      const duration = elapsedSeconds || 10;
      setDurationSeconds(duration);
      latestDurationRef.current = duration;
      return true;
    }

    if (elapsedSeconds < 5) {
      Alert.alert(
        "Recording Too Short",
        "Please record for at least 5 seconds to ensure accurate movement analysis.",
        [{ text: "OK" }]
      );
      return false; // Did not stop
    }

    cameraRef.current?.stopRecording();
    setRecording(false);
    return true;
  };

  // Drive mock feedback loop and elapsed seconds timer
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      setFeedbackIdx((i) => (i + 1) % FEEDBACK_CYCLE.length);
      setAngle((a) => {
        const next = a + (Math.random() * 14 - 4);
        return Math.max(8, Math.min(168, Math.round(next)));
      });
      setScore((s) => Math.min(99, s + (Math.random() > 0.4 ? 1 : 0)));
      setElapsedSeconds((current) => {
        if (current >= 15) {
          stopRecording();
          return 15;
        }
        return current + 1;
      });
    }, 1000);

    const rep = setInterval(() => {
      if (recording) {
        setReps((r) => Math.min(exercise?.reps ?? 10, r + 1));
        Haptics.selectionAsync().catch(() => {});
      }
    }, 4500);

    return () => {
      clearInterval(t);
      clearInterval(rep);
    };
  }, [recording, exercise?.reps, elapsedSeconds]);

  const handleFinish = async () => {
    let activeUri = latestVideoUriRef.current;

    if (recording) {
      const stopped = stopRecording();
      if (!stopped) {
        return; // Don't finish if recording was too short and couldn't be stopped
      }
      setUploading(true);
      setUploadProgressText("Processing recording...");
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (latestVideoUriRef.current) {
          activeUri = latestVideoUriRef.current;
          break;
        }
      }
      setUploading(false);
    }

    if (!activeUri) {
      Alert.alert(
        "No Assessment Recorded",
        "Would you like to finish without saving any AI analysis?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Finish Session", onPress: () => router.replace("/(patient)/session-history") }
        ]
      );
      return;
    }

    setUploading(true);
    setUploadProgressText("Uploading session recording...");

    try {
      let finalVideoUri = activeUri;
      if (activeUri === "simulated") {
        try {
          const { Image } = require("react-native");
          const asset = Image.resolveAssetSource(require("../../assets/images/favicon.png"));
          finalVideoUri = asset.uri;
        } catch (err) {
          console.error("Failed to resolve simulated asset", err);
        }
      }

      const videoFile = {
        uri: finalVideoUri,
        type: "video/mp4",
        name: "movement.mp4"
      } as any as Blob;

      const { videoId } = await patientFlow.uploadRecordedVideo({
        video: videoFile,
        fileName: "movement.mp4",
        mimeType: "video/mp4",
        durationSeconds: latestDurationRef.current || durationSeconds || 10,
        analysisType: isFacial ? "facial_expression" : "movement"
      });

      setUploadProgressText("Analyzing movements with AI...");
      const result = await patientFlow.pollAnalysis(videoId);
      setUploading(false);

      if (result.status === "SUCCEEDED") {
        // Persist as medical rehab session OR record coach practice.
        const durationSec = latestDurationRef.current || durationSeconds || 10;
        const rom = result.min_angle !== null && result.max_angle !== null
          ? { min_angle: result.min_angle, max_angle: result.max_angle }
          : {};
        const score = result.movement_score !== null ? result.movement_score * 100 : null;
        try {
          if (mode === "medical" && exercise) {
            await sessionsApi.create({
              assignment_id: assignmentId ? Number(assignmentId) : null,
              exercise_id: exercise.id,
              duration_seconds: durationSec,
              accuracy: score,
              movement_score: score,
              reps_completed: reps,
              ...rom,
            });
          } else if (exercise) {
            await coachApi.practice({
              exercise_id: exercise.id,
              duration_seconds: durationSec,
              accuracy: score,
              movement_score: score,
              reps_completed: reps,
              ...rom,
            });
          }
        } catch { /* ignore */ }
        Alert.alert(
          "AI Analysis Complete",
          `ROM: ${result.min_angle !== null && result.max_angle !== null ? `${Math.round(result.min_angle)}° to ${Math.round(result.max_angle)}°` : "N/A"}\nMovement Score: ${result.movement_score !== null ? Math.round(result.movement_score * 100) : "N/A"}%${mode === "medical" ? "\nSaved to medical history." : "\nAI Coach practice - not saved to medical history."}`,
          [{ text: mode === "medical" ? "View History" : "OK", onPress: () => router.replace(mode === "medical" ? "/(patient)/session-history" : "/(patient)/(tabs)") }]
        );
      } else {
        Alert.alert(
          "Analysis Incomplete",
          result.error_message || "Failed to analyze video.",
          [{ text: "Go to History", onPress: () => router.replace("/(patient)/session-history") }]
        );
      }
    } catch (err: any) {
      setUploading(false);
      Alert.alert("Upload/Analysis Failed", err.message || "An error occurred");
    }
  };

  const handleRequestPermissions = async () => {
    const camResult = await requestPermission();
    if (camResult.granted) {
      try {
        await requestMicPermission();
      } catch (err) {
        console.warn("Microphone permission request failed", err);
      }
    }
  };

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  const stageWidth = width;
  const stageHeight = height * 0.62;

  const feedback = FEEDBACK_CYCLE[feedbackIdx];
  const feedbackColor =
    feedback.tone === "success"
      ? palette.success
      : feedback.tone === "warn"
        ? palette.warning
        : palette.info;

  if (!permission && !isSimulated) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Camera background */}
      {permission && permission.granted && !isSimulated ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} mode="video" facing={facing} mute={!micPermission?.granted} />
      ) : isSimulated ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0b0f19", alignItems: "center", justifyContent: "center" }]}>
          <Ionicons name="videocam" size={48} color={palette.primary} style={{ opacity: 0.25 }} />
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 12, fontWeight: "600" }}>
            [ Simulated Camera Feed ]
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 4 }}>
            Perfect for testing in emulators & simulators
          </Text>
        </View>
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { alignItems: "center", justifyContent: "center", padding: 32 },
          ]}
        >
          <Ionicons name="videocam-off" size={36} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 14, textAlign: "center" }}>
            Camera access required
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 8, textAlign: "center", lineHeight: 20 }}>
            We need camera access to run real-time pose / face mesh and record assessments.
          </Text>
          <Button label="Grant Permissions" style={{ marginTop: 18, width: 220 }} onPress={handleRequestPermissions} />
          <Button label="Simulate Camera" variant="secondary" style={{ marginTop: 10, width: 220 }} onPress={() => setIsSimulated(true)} />
          <Button label="Exit" variant="ghost" style={{ marginTop: 10, width: 220 }} onPress={() => router.back()} />
        </View>
      )}

      {/* Overlays */}
      {isSimulated || (permission && permission.granted) ? (
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
          {isFacial ? (
            <FaceMeshOverlay width={stageWidth} height={stageHeight} color={palette.accent} />
          ) : (
            <SkeletonOverlay width={stageWidth} height={stageHeight} color={palette.accent} accent={palette.primary} />
          )}
          {/* Trajectory arc + start/end markers */}
          <Svg width={stageWidth} height={stageHeight} style={{ position: "absolute" }}>
            <Defs>
              <LinearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
                <Stop offset="100%" stopColor="#EF4444" stopOpacity={0.9} />
              </LinearGradient>
            </Defs>
            {!isFacial ? (
              <>
                <Path
                  d={`M ${stageWidth * 0.3} ${stageHeight * 0.55} Q ${stageWidth * 0.5} ${stageHeight * 0.25}, ${stageWidth * 0.7} ${stageHeight * 0.55}`}
                  stroke="url(#arcGrad)"
                  strokeWidth={3.5}
                  fill="none"
                  strokeDasharray="6,6"
                />
                <Circle cx={stageWidth * 0.3} cy={stageHeight * 0.55} r={10} fill="#10B981" stroke="#fff" strokeWidth={2} />
                <Circle cx={stageWidth * 0.7} cy={stageHeight * 0.55} r={10} fill="#EF4444" stroke="#fff" strokeWidth={2} />
              </>
            ) : null}
          </Svg>
        </View>
      ) : null}

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        {/* Top HUD */}
        <View style={styles.topRow}>
          <Pressable
            testID="exit-live"
            onPress={() => router.back()}
            style={styles.iconBtnHud}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>

          <View style={styles.exerciseTag}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: palette.success,
                marginRight: 8,
              }}
            />
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
              {exercise?.name ?? "Session"}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              testID="toggle-voice"
              onPress={() => setVoice((v) => !v)}
              style={styles.iconBtnHud}
            >
              <Ionicons name={voice ? "volume-high" : "volume-mute"} size={18} color="#fff" />
            </Pressable>
            <Pressable
              testID="flip-camera"
              onPress={() => setFacing((f) => (f === "front" ? "back" : "front"))}
              style={styles.iconBtnHud}
            >
              <Ionicons name="camera-reverse" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Joint angle pills */}
        <View style={styles.pillsRow}>
          <AnglePill label={isFacial ? "Symmetry" : (exercise?.joint ?? "Angle")} value={isFacial ? `${82}%` : `${angle}°`} />
          <AnglePill label="Score" value={String(score)} accent={palette.success} />
          {recording ? (
            <AnglePill label="Rec Time" value={`${elapsedSeconds}s`} accent={palette.danger} />
          ) : (
            <AnglePill label="FPS" value="29" accent={palette.info} />
          )}
        </View>

        <View style={{ flex: 1 }} />

        {/* Feedback bubble */}
        <View
          style={{
            alignSelf: "center",
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: "rgba(0,0,0,0.65)",
            borderRadius: 999,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 20,
            borderWidth: 1,
            borderColor: feedbackColor + "AA",
          }}
        >
          <Ionicons
            name={
              feedback.tone === "success" ? "checkmark-circle" : feedback.tone === "warn" ? "alert-circle" : "information-circle"
            }
            size={16}
            color={feedbackColor}
          />
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13, marginLeft: 6 }}>
            {feedback.text}
          </Text>
        </View>

        {/* Bottom control bar */}
        <View style={[styles.bottomBar, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2 }}>
              REPS
            </Text>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 2 }}>
              {reps}
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}> / {exercise?.reps ?? 10}</Text>
            </Text>
          </View>

          <Animated.View style={[styles.recHalo, haloStyle, { backgroundColor: recording ? palette.danger : palette.success }]} />
          <Pressable
            testID="toggle-record"
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              if (recording) {
                stopRecording();
              } else {
                startRecording();
              }
            }}
            style={[
              styles.recBtn,
              { backgroundColor: recording ? palette.danger : palette.success },
            ]}
          >
            <Ionicons name={recording ? "stop" : "play"} size={26} color="#fff" />
          </Pressable>

          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Pressable
              testID="finish-session"
              onPress={handleFinish}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.18)",
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Finish</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" style={{ marginLeft: 4 }} />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>

      {/* Uploading Overlay */}
      {uploading && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", alignItems: "center", zIndex: 999 }]}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 20 }}>
            {uploadProgressText}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 8 }}>
            Please keep the app open
          </Text>
        </View>
      )}
    </View>
  );
}

const AnglePill: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => {
  return (
    <View
      style={{
        backgroundColor: "rgba(0,0,0,0.55)",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        marginRight: 8,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
        minWidth: 78,
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </Text>
      <Text style={{ color: accent ?? "#fff", fontSize: 16, fontWeight: "800", marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  topRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconBtnHud: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  exerciseTag: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  pillsRow: {
    flexDirection: "row",
    marginTop: 12,
    paddingHorizontal: 16,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  recBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  recHalo: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    left: "50%",
    marginLeft: -40,
    opacity: 0.3,
  },
});
