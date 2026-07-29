import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, createAudit, getMe, listAudits } from "@/src/api";
import { AuditRow } from "@/src/components/AuditRow";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Skeleton } from "@/src/components/Skeleton";
import { colors, radius, spacing, type } from "@/src/theme";
import type { AuditSummary, Me } from "@/src/types";

function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(s.trim());
}

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [audits, setAudits] = useState<AuditSummary[] | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [pasteSuggestion, setPasteSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem("verdict.onboarded").then((seen) => {
      if (!seen) router.replace("/onboarding");
    });
  }, [router]);

  const refresh = useCallback(() => {
    listAudits()
      .then((r) => {
        setAudits(r.audits);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Can't reach the Verdict server."));
    getMe()
      .then(setMe)
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // Paste detection: offer the clipboard URL as a one-tap chip.
      Clipboard.getStringAsync()
        .then((clip) => {
          if (clip && clip.length < 200 && looksLikeUrl(clip)) setPasteSuggestion(clip.trim());
        })
        .catch(() => {});
    }, [refresh]),
  );

  const submit = async (value?: string) => {
    const target = (value ?? url).trim();
    if (!looksLikeUrl(target)) {
      Alert.alert("Hmm", "That doesn't look like a website address.");
      return;
    }
    setSubmitting(true);
    try {
      const audit = await createAudit(target);
      setUrl("");
      router.push(`/auditing/${audit.id}`);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 402 || e.code === "no_credits")) {
        router.push("/paywall");
      } else if (e instanceof ApiError && e.status === 422) {
        Alert.alert("Can't audit that", e.message);
      } else if (e instanceof ApiError && e.status === 429) {
        Alert.alert("Slow down", e.message);
      } else {
        Alert.alert("Something went wrong", e instanceof Error ? e.message : "Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const recents = audits?.slice(0, 6) ?? null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 18, paddingHorizontal: spacing.xl, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <Text style={styles.logo}>
            Verdict<Text style={{ color: colors.accent }}>.</Text>
          </Text>
          <Pressable
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={12}
          >
            <Text style={styles.gear}>⚙︎</Text>
          </Pressable>
        </View>

        <Text style={[type.hero, styles.hero]}>Your website.{"\n"}Judged.</Text>
        <Text style={[type.dim, { marginBottom: spacing.xxl }]}>
          Paste a URL and get scored the way visitors actually see you — on a phone. Verdict in about a minute.
        </Text>

        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="yoursite.com"
          placeholderTextColor={colors.faint}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={() => submit()}
          accessibilityLabel="Website address"
        />
        {pasteSuggestion && pasteSuggestion !== url ? (
          <Pressable
            onPress={() => {
              setUrl(pasteSuggestion);
              submit(pasteSuggestion);
            }}
            style={({ pressed }) => [styles.pasteChip, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.pasteText} numberOfLines={1}>
              Paste “{pasteSuggestion.replace(/^https?:\/\//, "")}”
            </Text>
          </Pressable>
        ) : null}

        <PrimaryButton
          title="Get the verdict"
          onPress={() => submit()}
          loading={submitting}
          style={{ marginTop: spacing.l }}
        />

        {me ? (
          <Pressable onPress={() => router.push("/paywall")} hitSlop={8}>
            <Text style={styles.credits}>
              {me.entitlement === "pro" ? "Pro · " : ""}
              {me.credits} audit{me.credits === 1 ? "" : "s"} left
              {me.credits <= 1 ? "  ·  Get more →" : ""}
            </Text>
          </Pressable>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={{ color: colors.amber, fontSize: 13, lineHeight: 19 }}>
              {error} Check the server address in Settings.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push("/report/sample")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="See a sample verdict"
        >
          <Text style={styles.sampleLink}>See a sample verdict — no credit →</Text>
        </Pressable>

        <View style={styles.recentHeader}>
          <Text style={type.label}>Recent verdicts</Text>
          {audits && audits.length > 6 ? (
            <Pressable onPress={() => router.push("/history")} hitSlop={8}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          ) : null}
        </View>

        {recents === null ? (
          <>
            <Skeleton style={{ height: 68, marginBottom: 8 }} />
            <Skeleton style={{ height: 68, marginBottom: 8, opacity: 0.7 }} />
          </>
        ) : recents.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 28, marginBottom: 8 }}>⚖️</Text>
            <Text style={[type.dim, { textAlign: "center" }]}>
              No verdicts yet. Paste a URL above — the first one&apos;s on us.
            </Text>
          </View>
        ) : (
          recents.map((a) => <AuditRow key={a.id} audit={a} />)
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  logo: { color: colors.text, fontSize: 21, fontWeight: "800", letterSpacing: -0.5 },
  gear: { color: colors.dim, fontSize: 22 },
  hero: { marginBottom: spacing.m },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.l,
    height: 56,
    paddingHorizontal: 18,
    color: colors.text,
    fontSize: 17,
  },
  pasteChip: {
    alignSelf: "flex-start",
    marginTop: spacing.s,
    backgroundColor: colors.surface2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pasteText: { color: colors.accent, fontSize: 13, fontWeight: "600", maxWidth: 280 },
  credits: { color: colors.dim, fontSize: 13, textAlign: "center", marginTop: spacing.l },
  sampleLink: { color: colors.accent, fontSize: 13, fontWeight: "600", textAlign: "center", marginTop: spacing.l },
  errorBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.s,
    borderWidth: 1,
    borderColor: "#3A3320",
    padding: spacing.m,
    marginTop: spacing.l,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 36,
    marginBottom: spacing.m,
  },
  seeAll: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  empty: {
    alignItems: "center",
    padding: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: radius.m,
  },
});
