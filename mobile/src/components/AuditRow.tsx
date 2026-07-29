import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, scoreColor, spacing } from "../theme";
import type { AuditSummary } from "../types";

export function AuditRow({ audit }: { audit: AuditSummary }) {
  const router = useRouter();
  const failed = audit.status === "failed_blocked" || audit.status === "failed_error";
  const inFlight = !failed && audit.status !== "complete";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Audit of ${audit.domain}`}
      onPress={() =>
        router.push(audit.status === "complete" ? `/report/${audit.id}` : `/auditing/${audit.id}`)
      }
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.domain} numberOfLines={1}>
          {audit.domain}
        </Text>
        <Text style={styles.meta}>
          {failed
            ? "Failed — credit refunded"
            : inFlight
              ? `${audit.step}…`
              : new Date(audit.createdAt).toLocaleDateString()}
        </Text>
      </View>
      {audit.score !== null ? (
        <View style={[styles.scorePill, { borderColor: scoreColor(audit.score) }]}>
          <Text style={[styles.score, { color: scoreColor(audit.score) }]}>{audit.score}</Text>
        </View>
      ) : (
        <Text style={styles.chev}>{failed ? "!" : "›"}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.l,
    marginBottom: spacing.s,
  },
  domain: { color: colors.text, fontSize: 15, fontWeight: "700" },
  meta: { color: colors.dim, fontSize: 12, marginTop: 3 },
  scorePill: {
    borderWidth: 2,
    borderRadius: 999,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  score: { fontFamily: fonts.rounded, fontWeight: "800", fontSize: 15, fontVariant: ["tabular-nums"] },
  chev: { color: colors.faint, fontSize: 22, paddingHorizontal: 12 },
});
