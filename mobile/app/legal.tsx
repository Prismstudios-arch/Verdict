import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LEGAL_UPDATED, PRIVACY, TERMS, type LegalSection } from "@/src/legal";
import { colors, spacing, type } from "@/src/theme";

/** Native legal screen — renders bundled text; never opens an external site. */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTerms = doc === "terms";
  const sections: LegalSection[] = isTerms ? TERMS : PRIVACY;
  const title = isTerms ? "Terms of Use" : "Privacy Policy";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={type.h2} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 40 }}
      >
        <Text style={[type.dim, { fontStyle: "italic", marginBottom: spacing.xl }]}>
          Last updated: {LEGAL_UPDATED}
        </Text>
        {sections.map((s, i) => (
          <View key={i} style={{ marginBottom: spacing.xl }}>
            {s.heading ? <Text style={styles.h}>{s.heading}</Text> : null}
            {s.body ? <Text style={[type.body, styles.p]}>{s.body}</Text> : null}
            {s.bullets?.map((b, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.dot}>•</Text>
                <Text style={[type.body, styles.p, { flex: 1 }]}>{b}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.m,
  },
  back: { color: colors.accent, fontSize: 15, fontWeight: "600", width: 60 },
  h: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: spacing.s },
  p: { color: colors.dim, lineHeight: 23 },
  bulletRow: { flexDirection: "row", gap: 10, marginTop: spacing.s },
  dot: { color: colors.accent, fontSize: 16, lineHeight: 23 },
});
