import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMe } from "@/src/api";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import {
  FALLBACK_PRODUCTS,
  getProducts,
  isExpoGo,
  purchase,
  restorePurchases,
  type Product,
} from "@/src/purchases";
import { colors, radius, spacing, type } from "@/src/theme";

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [selected, setSelected] = useState<Product["id"]>("pro_yearly"); // yearly pre-selected
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProducts().then(setProducts);
  }, []);

  const buy = async () => {
    setBusy(true);
    try {
      const ok = await purchase(selected);
      if (ok) {
        await getMe().catch(() => null); // refresh entitlement state
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("You're in 🎉", "Credits added to your account.", [
          { text: "Start judging", onPress: () => router.back() },
        ]);
      }
    } catch (e) {
      Alert.alert("Purchase failed", e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    try {
      await restorePurchases();
      await getMe().catch(() => null);
      Alert.alert("Restored", "Your purchases have been restored.");
    } catch {
      Alert.alert("Nothing to restore", "No previous purchases found for this account.");
    }
  };

  const subtitle = (p: Product) =>
    p.id === "pro_yearly" ? "Best value" : p.id === "pro_monthly" ? "Flexible" : "No subscription";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 32 }}>
        {/* Visible close button — no dark patterns. */}
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Close paywall"
          style={styles.close}
        >
          <Text style={{ color: colors.dim, fontSize: 22, fontWeight: "600" }}>✕</Text>
        </Pressable>

        <Text style={[type.hero, { marginTop: 12 }]}>
          Verdict <Text style={{ color: colors.accent }}>Pro</Text>
        </Text>
        <Text style={[type.dim, { marginTop: 8, marginBottom: 24 }]}>
          30 audits a month, re-scans, client-ready PDF exports, and every roast your competitors deserve.
        </Text>

        {isExpoGo && (
          <View style={styles.testBanner}>
            <Text style={{ color: colors.amber, fontSize: 13, lineHeight: 19 }}>
              Expo Go test mode: purchases are simulated (no charge) so you can test the full flow.
              Real StoreKit purchases activate in a development build with RevenueCat.
            </Text>
          </View>
        )}

        {products.map((p) => {
          const active = selected === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                Haptics.selectionAsync();
                setSelected(p.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={[styles.card, active && { borderColor: colors.accent, backgroundColor: colors.surface2 }]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.cardTitle}>{p.title}</Text>
                  <View style={[styles.tag, p.id === "pro_yearly" && { backgroundColor: colors.accent }]}>
                    <Text
                      style={[
                        styles.tagText,
                        p.id === "pro_yearly" && { color: colors.onAccent },
                      ]}
                    >
                      {subtitle(p)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardNote}>{p.note}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.price}>{p.price}</Text>
                <Text style={styles.period}>{p.period}</Text>
              </View>
            </Pressable>
          );
        })}

        <PrimaryButton
          title={selected === "credits_5" ? "Buy 5 audits" : "Start Pro"}
          onPress={buy}
          loading={busy}
          style={{ marginTop: spacing.l }}
        />

        <View style={styles.footerRow}>
          <Pressable onPress={restore} hitSlop={8}>
            <Text style={styles.footerLink}>Restore purchases</Text>
          </Pressable>
          <Text style={{ color: colors.faint }}>·</Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.footerLink}>Not now</Text>
          </Pressable>
        </View>
        <View style={[styles.footerRow, { marginTop: spacing.m }]}>
          {/* Native in-app legal screens — never leave the app. */}
          <Pressable onPress={() => router.push("/legal?doc=terms")} hitSlop={8}>
            <Text style={styles.legalLink}>Terms of Use</Text>
          </Pressable>
          <Text style={{ color: colors.faint }}>·</Text>
          <Pressable onPress={() => router.push("/legal?doc=privacy")} hitSlop={8}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
        </View>
        <Text style={[type.dim, { fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 16 }]}>
          Subscriptions renew automatically and can be cancelled anytime in iOS Settings. Credits are
          consumed per audit; failed audits are refunded automatically.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  close: { alignSelf: "flex-end" },
  testBanner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#3A3320",
    borderRadius: radius.s,
    padding: spacing.m,
    marginBottom: spacing.l,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.l,
    padding: spacing.l,
    marginBottom: spacing.m,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  cardNote: { color: colors.dim, fontSize: 12, marginTop: 4 },
  tag: { backgroundColor: colors.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { color: colors.dim, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  price: { color: colors.text, fontSize: 18, fontWeight: "800" },
  period: { color: colors.faint, fontSize: 11 },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginTop: spacing.xl,
    alignItems: "center",
  },
  footerLink: { color: colors.dim, fontSize: 14, fontWeight: "600" },
  legalLink: { color: colors.faint, fontSize: 12, textDecorationLine: "underline" },
});
