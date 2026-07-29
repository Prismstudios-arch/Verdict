import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteMyData, ensureSession, getApiBase, getMe, listMonitors, removeMonitor, setApiBase } from "@/src/api";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { colors, radius, spacing, type } from "@/src/theme";
import type { Me, Monitor } from "@/src/types";

const SUPPORT_EMAIL = "VerdictAI2026@outlook.com";

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me | null>(null);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [base, setBase] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    getMe().then(setMe).catch(() => {});
    listMonitors().then((r) => setMonitors(r.monitors)).catch(() => {});
    getApiBase().then(setBase);
  }, []);

  const saveBase = async () => {
    await setApiBase(base);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    getMe().then(setMe).catch(() => Alert.alert("Heads up", "Couldn't reach the server at that address."));
  };

  // Legal pages are native in-app screens — never open an external site.
  const openLegal = (doc: "privacy" | "terms") => router.push(`/legal?doc=${doc}`);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingHorizontal: spacing.xl,
        paddingBottom: insets.bottom + 40,
      }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={type.h2}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={[type.label, styles.section]}>Usage</Text>
      <View style={styles.card}>
        <Row label="Plan" value={me ? (me.entitlement === "pro" ? "Verdict Pro" : "Free") : "…"} />
        <Row label="Audits remaining" value={me ? String(me.credits) : "…"} />
        {me?.entitlementExpiresAt ? (
          <Row label="Renews" value={new Date(me.entitlementExpiresAt).toLocaleDateString()} />
        ) : null}
      </View>
      <PrimaryButton
        title={me?.entitlement === "pro" ? "Manage plan" : "Upgrade to Pro"}
        onPress={() => router.push("/paywall")}
        style={{ marginTop: spacing.m }}
      />

      {me && me.ledger.length > 0 && (
        <>
          <Text style={[type.label, styles.section]}>Recent activity</Text>
          <View style={styles.card}>
            {me.ledger.slice(0, 8).map((l) => (
              <View key={l.id} style={styles.ledgerRow}>
                <Text style={[type.dim, { flex: 1 }]} numberOfLines={1}>
                  {l.reason}
                </Text>
                <Text
                  style={{
                    color: l.delta > 0 ? colors.accent : colors.dim,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {l.delta > 0 ? `+${l.delta}` : l.delta}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {monitors.length > 0 && (
        <>
          <Text style={[type.label, styles.section]}>Monitoring weekly</Text>
          <View style={styles.card}>
            {monitors.map((m) => (
              <View key={m.id} style={styles.row}>
                <View>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{m.domain}</Text>
                  <Text style={[type.dim, { fontSize: 12, marginTop: 2 }]}>
                    {m.lastScore !== null ? `Last score ${m.lastScore}` : "First scan pending"}
                  </Text>
                </View>
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop monitoring ${m.domain}`}
                  onPress={async () => {
                    try {
                      await removeMonitor(m.id);
                      setMonitors((prev) => prev.filter((x) => x.id !== m.id));
                    } catch {
                      Alert.alert("Couldn't remove", "Check your connection and try again.");
                    }
                  }}
                >
                  <Text style={{ color: colors.red, fontSize: 13, fontWeight: "700" }}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[type.label, styles.section]}>About</Text>
      <View style={styles.card}>
        <Row label="Version" value={Constants.expoConfig?.version ?? "1.0"} />
        <LinkRow label="Privacy Policy" onPress={() => openLegal("privacy")} />
        <LinkRow label="Terms of Use" onPress={() => openLegal("terms")} />
        <LinkRow
          label="Contact support"
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Verdict%20support`)}
        />
      </View>
      <Text style={[type.dim, { fontSize: 11, marginTop: spacing.l, lineHeight: 16 }]}>
        Verdict judges websites the way real visitors see them — on a phone. Your audits are
        anonymous: no account, no email, and nothing is ever sold or shared.
      </Text>

      {__DEV__ && (
        <>
          <Text style={[type.label, styles.section]}>Server (dev only)</Text>
          <Text style={[type.dim, { marginBottom: spacing.s }]}>
            Where the Verdict API is running. Auto-detected from Metro in Expo Go. This section is
            hidden in release builds.
          </Text>
          <TextInput
            style={styles.input}
            value={base}
            onChangeText={setBase}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.50:8787"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Server address"
          />
          <PrimaryButton
            title={savedFlash ? "Saved ✓" : "Save server address"}
            variant="ghost"
            onPress={saveBase}
            style={{ marginTop: spacing.s }}
          />
        </>
      )}

      <Text style={[type.label, styles.section]}>Danger zone</Text>
      <PrimaryButton
        title="Delete my data"
        variant="danger"
        onPress={() => {
          Alert.alert(
            "Delete everything?",
            "This permanently removes your audits, screenshots, credits and identity from the server. It can't be undone.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  try {
                    await deleteMyData();
                    await ensureSession(); // fresh anonymous identity
                    Alert.alert("Done", "All your data has been deleted.", [
                      { text: "OK", onPress: () => router.dismissTo("/") },
                    ]);
                  } catch {
                    Alert.alert("Couldn't delete", "Check your connection and try again.");
                  }
                },
              },
            ],
          );
        }}
      />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={type.dim}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14 }}>{value}</Text>
    </View>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: colors.faint, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { color: colors.accent, fontSize: 15, fontWeight: "600", width: 50 },
  section: { marginTop: 32, marginBottom: spacing.m },
  card: { backgroundColor: colors.surface, borderRadius: radius.m, padding: spacing.l },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 9 },
  ledgerRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, gap: 12 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.m,
    height: 50,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 15,
  },
});
