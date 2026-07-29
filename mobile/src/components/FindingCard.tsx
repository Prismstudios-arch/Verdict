import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, severityColors, spacing } from "../theme";
import type { Finding } from "../types";

const SOURCE_LABELS: Record<Finding["source"], string> = {
  first_impression: "First impression",
  copy: "Copy & conversion",
  trust: "Trust & flow",
  deterministic: "Measured",
};

export function FindingCard({ finding }: { finding: Finding }) {
  const [copied, setCopied] = useState(false);
  const color = severityColors[finding.severity] ?? colors.dim;
  const hasRewrite = finding.rewriteAfter.trim().length > 0;

  const copyRewrite = async () => {
    await Clipboard.setStringAsync(finding.rewriteAfter);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View style={styles.card}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={[styles.severity, { color }]}>{finding.severity.toUpperCase()}</Text>
          <Text style={styles.source}>{SOURCE_LABELS[finding.source]}</Text>
        </View>
        <Text style={styles.issue}>{finding.issue}</Text>
        {finding.evidence ? <Text style={styles.evidence}>“{finding.evidence}”</Text> : null}
        <Text style={styles.fix}>{finding.fix}</Text>
        {hasRewrite && (
          <View style={styles.rewrite}>
            {finding.rewriteBefore ? (
              <Text style={styles.before} numberOfLines={3}>
                {finding.rewriteBefore}
              </Text>
            ) : null}
            <Text style={styles.after}>{finding.rewriteAfter}</Text>
            <Pressable
              onPress={copyRewrite}
              accessibilityRole="button"
              accessibilityLabel="Copy rewritten copy"
              style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.copyText}>{copied ? "Copied ✓" : "Copy"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    marginBottom: spacing.m,
    overflow: "hidden",
  },
  bar: { width: 4 },
  body: { flex: 1, padding: spacing.l },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  severity: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },
  source: { fontSize: 11, color: colors.faint, fontWeight: "600" },
  issue: { color: colors.text, fontSize: 15, fontWeight: "700", lineHeight: 21 },
  evidence: { color: colors.dim, fontSize: 13, fontStyle: "italic", marginTop: 6, lineHeight: 19 },
  fix: { color: colors.text, fontSize: 14, marginTop: 8, lineHeight: 21, opacity: 0.9 },
  rewrite: {
    marginTop: 12,
    backgroundColor: colors.bg,
    borderRadius: radius.s,
    padding: spacing.m,
    borderWidth: 1,
    borderColor: colors.border,
  },
  before: { color: colors.red, fontSize: 13, textDecorationLine: "line-through", marginBottom: 6 },
  after: { color: colors.accent, fontSize: 14, fontWeight: "600", lineHeight: 20 },
  copyBtn: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface2,
  },
  copyText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
});
