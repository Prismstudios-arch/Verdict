import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { absoluteUrl, addMonitor, createAudit, getApiBase, getAudit, getMe, listMonitors, removeMonitor } from "@/src/api";
import { ensurePushRegistered } from "@/src/notifications";
import { FindingCard } from "@/src/components/FindingCard";
import { GradeBadge } from "@/src/components/GradeBadge";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { ScoreRing } from "@/src/components/ScoreRing";
import { Skeleton } from "@/src/components/Skeleton";
import { SubScoreBars } from "@/src/components/SubScoreBars";
import { colors, radius, spacing, type } from "@/src/theme";
import type { AuditSummary, Finding } from "@/src/types";

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [shots, setShots] = useState<{ label: string; url: string }[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [monitorId, setMonitorId] = useState<string | null>(null);
  const [monitorBusy, setMonitorBusy] = useState(false);

  useEffect(() => {
    getAudit(id)
      .then(async (a) => {
        setAudit(a);
        if (!a.report) return;
        const s = a.report.screenshots;
        const entries: { label: string; url: string | null }[] = [
          { label: "Mobile · above the fold", url: await absoluteUrl(s.mobileFold) },
          { label: "Desktop", url: await absoluteUrl(s.desktopFold) },
          ...(await Promise.all(
            s.walk
              .filter((w) => w.path)
              .map(async (w) => ({ label: `Tapped “${w.label}”`, url: await absoluteUrl(w.path) })),
          )),
        ];
        setShots(entries.filter((e): e is { label: string; url: string } => !!e.url));
      })
      .catch(() => Alert.alert("Couldn't load report", "Check your connection and try again."));
  }, [id]);

  useEffect(() => {
    getMe()
      .then((m) => setIsPro(m.entitlement === "pro"))
      .catch(() => {});
  }, []);

  const report = audit?.report;
  const isSample = !!report?.isSample;

  // Is this site already being monitored?
  useEffect(() => {
    if (!report || report.isSample) return;
    listMonitors()
      .then(({ monitors }) => {
        const mine = monitors.find((m) => m.domain === report.domain);
        setMonitorId(mine?.id ?? null);
      })
      .catch(() => {});
  }, [report]);

  const toggleMonitor = async () => {
    if (!audit || !report) return;
    if (!isPro) {
      Alert.alert(
        "Weekly monitoring is a Pro feature",
        "Verdict re-scans your site every week and alerts you if the score changes.",
        [
          { text: "Not now", style: "cancel" },
          { text: "See Pro", onPress: () => router.push("/paywall") },
        ],
      );
      return;
    }
    setMonitorBusy(true);
    try {
      if (monitorId) {
        await removeMonitor(monitorId);
        setMonitorId(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        // Best-effort push permission — monitoring works either way.
        await ensurePushRegistered({ ask: true });
        const { monitor } = await addMonitor(audit.url);
        setMonitorId(monitor.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Monitoring on",
          `We'll re-scan ${report.domain} every week and notify you if the score changes.`,
        );
      }
    } catch (e) {
      Alert.alert("Couldn't update monitoring", e instanceof Error ? e.message : "Try again.");
    } finally {
      setMonitorBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!report) return;
    if (!isPro) {
      Alert.alert("Export PDF is a Pro feature", "Upgrade to download a client-ready PDF of any verdict.", [
        { text: "Not now", style: "cancel" },
        { text: "See Pro", onPress: () => router.push("/paywall") },
      ]);
      return;
    }
    const base = await getApiBase();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // In-app sheet with iOS's native share/save controls for the PDF.
    await WebBrowser.openBrowserAsync(`${base}${report.shareUrl}/pdf`);
  };

  const shareVerdict = async () => {
    if (!report) return;
    const base = await getApiBase();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await Share.share({
      message: `${report.domain} scored ${report.scores.overall}/100 (${report.scores.grade}) on Verdict — “${report.verdictLine}” ${base}${report.shareUrl}`,
    });
  };

  const copyLink = async () => {
    if (!report) return;
    const base = await getApiBase();
    await Clipboard.setStringAsync(`${base}${report.shareUrl}`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1600);
  };

  const rescan = () => {
    if (!audit) return;
    Alert.alert("Re-scan site?", "This uses one audit credit.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Re-scan",
        onPress: async () => {
          try {
            const fresh = await createAudit(audit.url);
            router.replace(`/auditing/${fresh.id}`);
          } catch (e) {
            Alert.alert("Couldn't start re-scan", e instanceof Error ? e.message : "Try again.");
          }
        },
      },
    ]);
  };

  if (!report) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 60 }]}>
        <Skeleton style={{ width: 220, height: 220, borderRadius: 110, alignSelf: "center" }} />
        <Skeleton style={{ marginTop: 32, height: 22, width: "60%", alignSelf: "center" }} />
        <Skeleton style={{ marginTop: 12, height: 14, width: "85%", alignSelf: "center" }} />
        <Skeleton style={{ marginTop: 8, height: 14, width: "75%", alignSelf: "center" }} />
      </View>
    );
  }

  const bySeverity = (sev: Finding["severity"]) => report.findings.filter((f) => f.severity === sev);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + 48 }}
      accessibilityLabel={`Audit report for ${report.domain}`}
    >
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: spacing.xl }}>
        <View style={styles.navRow}>
          <Pressable onPress={() => router.dismissTo("/")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to home">
            <Text style={styles.navBtn}>‹ Home</Text>
          </Pressable>
          {!isSample && (
            <Pressable onPress={rescan} hitSlop={12} accessibilityRole="button" accessibilityLabel="Re-scan this site">
              <Text style={styles.navBtn}>Re-scan ↻</Text>
            </Pressable>
          )}
        </View>

        {/* Score reveal */}
        <View style={{ alignItems: "center", marginTop: 12 }}>
          <Text style={type.label}>The verdict on</Text>
          <Text style={[type.h1, { marginTop: 4, marginBottom: 22 }]} numberOfLines={1}>
            {report.domain}
          </Text>
          <ScoreRing score={report.scores.overall} />
          <View style={{ marginTop: 18 }}>
            <GradeBadge grade={report.scores.grade} score={report.scores.overall} />
          </View>
        </View>

        {/* Re-scan diff */}
        {report.diff && (
          <View style={styles.diffBanner}>
            <Text
              style={[
                styles.diffDelta,
                { color: report.diff.deltaScore >= 0 ? colors.accent : colors.red },
              ]}
            >
              {report.diff.deltaScore >= 0 ? "▲" : "▼"} {report.diff.deltaScore >= 0 ? "+" : ""}
              {report.diff.deltaScore}
            </Text>
            <Text style={styles.diffText}>
              since your last scan ({report.diff.prevScore} · {report.diff.prevGrade},{" "}
              {new Date(report.diff.prevAt).toLocaleDateString()})
              {report.diff.prevCriticalCount !== report.diff.criticalCount
                ? ` · critical issues ${report.diff.prevCriticalCount} → ${report.diff.criticalCount}`
                : ""}
            </Text>
          </View>
        )}

        {isSample && (
          <View style={styles.sampleBanner}>
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>
              This is a sample verdict
            </Text>
            <Text style={{ color: colors.dim, fontSize: 12, marginTop: 2 }}>
              An example of what you get. Audit your own site to see yours.
            </Text>
          </View>
        )}

        {!report.aiAnalysis && (
          <View style={styles.demoBanner}>
            <Text style={{ color: colors.amber, fontSize: 13, lineHeight: 19 }}>
              Demo mode: performance, mobile and accessibility are measured for real; AI judgment is off
              (no API key on the server).
            </Text>
          </View>
        )}

        {/* The Verdict */}
        <Text style={styles.verdictLine}>“{report.verdictLine}”</Text>
        <Text style={[type.body, { marginTop: spacing.l }]}>{report.verdictParagraph}</Text>

        <View style={styles.whoBox}>
          <Text style={type.dim}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Reads as: </Text>
            {report.whatIsThis}
          </Text>
          <Text style={[type.dim, { marginTop: 6 }]}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Aimed at: </Text>
            {report.whoIsItFor}
          </Text>
        </View>

        {/* Actions */}
        {isSample ? (
          <PrimaryButton
            title="Audit your own site →"
            onPress={() => router.dismissTo("/")}
            style={{ marginTop: spacing.xl }}
          />
        ) : (
          <>
            <View style={styles.shareRow}>
              <PrimaryButton title="Share verdict" onPress={shareVerdict} style={{ flex: 1 }} />
              <PrimaryButton
                title={copiedLink ? "Copied ✓" : "Copy link"}
                variant="ghost"
                onPress={copyLink}
                style={{ flex: 1 }}
              />
            </View>
            <PrimaryButton
              title={isPro ? "Export PDF" : "Export PDF (Pro)"}
              variant="ghost"
              onPress={exportPdf}
              style={{ marginTop: spacing.m }}
            />
            <PrimaryButton
              title={
                monitorId
                  ? "Monitoring weekly ✓"
                  : isPro
                    ? "🔔 Monitor weekly"
                    : "🔔 Monitor weekly (Pro)"
              }
              variant="ghost"
              loading={monitorBusy}
              onPress={toggleMonitor}
              style={{ marginTop: spacing.m }}
            />
          </>
        )}

        {/* Sub-scores */}
        <Text style={[type.label, styles.sectionLabel]}>Score breakdown</Text>
        <SubScoreBars scores={report.scores} />

        {/* Fix first */}
        {report.fixFirst.length > 0 && (
          <>
            <Text style={[type.label, styles.sectionLabel]}>Fix these first</Text>
            {report.fixFirst.map((f, i) => (
              <View key={i} style={styles.fixFirstRow}>
                <Text style={styles.fixFirstNum}>{i + 1}</Text>
                <Text style={[type.body, { flex: 1 }]}>{f.issue}</Text>
              </View>
            ))}
          </>
        )}
      </View>

      {/* Screenshots gallery */}
      {shots.length > 0 && (
        <>
          <Text style={[type.label, styles.sectionLabel, { paddingHorizontal: spacing.xl }]}>
            What we saw
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.m }}
          >
            {shots.map((s) => (
              <View key={s.url} style={styles.shotCard}>
                <Image source={{ uri: s.url }} style={styles.shot} resizeMode="cover" />
                <Text style={styles.shotLabel} numberOfLines={1}>
                  {s.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <View style={{ paddingHorizontal: spacing.xl }}>
        {/* Findings grouped by severity */}
        {(["critical", "major", "minor"] as const).map((sev) =>
          bySeverity(sev).length ? (
            <View key={sev}>
              <Text style={[type.label, styles.sectionLabel]}>
                {sev === "critical" ? "Critical" : sev === "major" ? "Major" : "Minor"} ·{" "}
                {bySeverity(sev).length}
              </Text>
              {bySeverity(sev).map((f, i) => (
                <FindingCard key={`${sev}-${i}`} finding={f} />
              ))}
            </View>
          ) : null,
        )}

        {/* Metrics */}
        <Text style={[type.label, styles.sectionLabel]}>Measured on mobile</Text>
        <View style={styles.metricsRow}>
          <Metric label="TTFB" value={`${report.metrics.ttfbMs}ms`} />
          <Metric label="LCP" value={report.metrics.lcpMs ? `${(report.metrics.lcpMs / 1000).toFixed(1)}s` : "—"} />
          <Metric label="Weight" value={`${(report.metrics.totalKb / 1024).toFixed(1)}MB`} />
          <Metric label="Requests" value={String(report.metrics.requestCount)} />
        </View>

        <Text style={[type.dim, { textAlign: "center", marginTop: 32, fontSize: 12 }]}>
          Judged {new Date(report.fetchedAt).toLocaleString()} · mobile-first (390×844)
        </Text>
      </View>
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  navRow: { flexDirection: "row", justifyContent: "space-between" },
  navBtn: { color: colors.accent, fontSize: 15, fontWeight: "600" },
  diffBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.s,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.l,
    marginTop: spacing.xl,
  },
  diffDelta: { fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] },
  diffText: { color: colors.dim, fontSize: 13, flex: 1, lineHeight: 18 },
  sampleBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.s,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.m,
    marginTop: spacing.l,
  },
  demoBanner: {
    backgroundColor: colors.surface,
    borderColor: "#3A3320",
    borderWidth: 1,
    borderRadius: radius.s,
    padding: spacing.m,
    marginTop: spacing.xl,
  },
  verdictLine: {
    color: colors.text,
    fontSize: 20,
    fontStyle: "italic",
    fontWeight: "600",
    lineHeight: 28,
    marginTop: 28,
    paddingLeft: spacing.l,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  whoBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.l,
    marginTop: spacing.xl,
  },
  shareRow: { flexDirection: "row", gap: spacing.m, marginTop: spacing.xl },
  sectionLabel: { marginTop: 36, marginBottom: spacing.l },
  fixFirstRow: {
    flexDirection: "row",
    gap: spacing.m,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    padding: spacing.l,
    marginBottom: spacing.s,
    alignItems: "center",
  },
  fixFirstNum: {
    color: colors.onAccent,
    backgroundColor: colors.accent,
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: "center",
    lineHeight: 25,
    fontWeight: "800",
    overflow: "hidden",
  },
  shotCard: { width: 150 },
  shot: {
    width: 150,
    height: 300,
    borderRadius: radius.m,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shotLabel: { color: colors.dim, fontSize: 11, marginTop: 6 },
  metricsRow: { flexDirection: "row", gap: spacing.s },
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
    paddingVertical: spacing.l,
    alignItems: "center",
  },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  metricLabel: { color: colors.faint, fontSize: 11, marginTop: 4, letterSpacing: 1 },
});
