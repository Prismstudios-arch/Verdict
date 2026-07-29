import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAudit } from "@/src/api";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { ProgressTimeline, type TimelineStep } from "@/src/components/ProgressTimeline";
import { colors, spacing, type } from "@/src/theme";
import type { AuditSummary } from "@/src/types";

const STEPS: { label: string; at: number }[] = [
  { label: "Visiting your site", at: 10 },
  { label: "Browsing on a phone & tapping buttons", at: 30 },
  { label: "Judging", at: 55 },
  { label: "Scoring", at: 85 },
];

export default function Auditing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [pollError, setPollError] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    const poll = async () => {
      if (stopped.current) return;
      try {
        const a = await getAudit(id);
        setPollError(false);
        setAudit(a);
        if (a.status === "complete") {
          stopped.current = true;
          router.replace(`/report/${id}`);
          return;
        }
        if (a.status === "failed_blocked" || a.status === "failed_error") {
          stopped.current = true;
          return;
        }
      } catch {
        setPollError(true);
      }
      if (!stopped.current) setTimeout(poll, 2000);
    };
    poll();
    return () => {
      stopped.current = true;
    };
  }, [id, router]);

  const percent = audit?.percent ?? 2;
  const failed = audit?.status === "failed_blocked" || audit?.status === "failed_error";
  const steps: TimelineStep[] = STEPS.map((s, i) => {
    const next = STEPS[i + 1]?.at ?? 100;
    return {
      label: s.label,
      state: percent >= next ? "done" : percent >= s.at ? "active" : "pending",
    };
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={type.label}>Judging</Text>
      <Text style={[type.h1, { marginTop: 6, marginBottom: 40 }]} numberOfLines={1}>
        {audit?.domain ?? "…"}
      </Text>

      {failed ? (
        <View style={{ flex: 1 }}>
          <View style={styles.failedBox}>
            <Text style={{ fontSize: 30, marginBottom: 10 }}>
              {audit?.status === "failed_blocked" ? "🚧" : "💥"}
            </Text>
            <Text style={[type.h2, { marginBottom: 8 }]}>
              {audit?.status === "failed_blocked" ? "We couldn't get in" : "Something broke on our side"}
            </Text>
            <Text style={[type.dim, { textAlign: "center" }]}>{audit?.error}</Text>
            <Text style={[type.dim, { textAlign: "center", marginTop: 12, color: colors.accent }]}>
              Your credit has been refunded automatically.
            </Text>
          </View>
          <PrimaryButton title="Back home" onPress={() => router.dismissTo("/")} style={{ marginTop: "auto" }} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ProgressTimeline steps={steps} />
          {pollError ? (
            <Text style={[type.dim, { color: colors.amber, marginTop: 8 }]}>
              Connection hiccup — retrying…
            </Text>
          ) : null}
          <Text style={[type.dim, { marginTop: 10 }]}>
            Real progress, not a fake bar. Most verdicts land in under 90 seconds.
          </Text>
          <PrimaryButton
            title="Cancel — keep judging in background"
            variant="ghost"
            onPress={() => router.dismissTo("/")}
            style={{ marginTop: "auto" }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl },
  failedBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: spacing.xxxl,
  },
});
