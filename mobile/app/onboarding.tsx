import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { colors, spacing, type } from "@/src/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    emoji: "📱",
    title: "Judged like a real visitor",
    body: "Most tools score your site on a desktop. Your visitors are on phones. Verdict loads your site on an iPhone-sized screen, taps your buttons, and judges what it actually sees.",
  },
  {
    emoji: "✍️",
    title: "Specific fixes, not vibes",
    body: "Every finding quotes your actual copy and rewrites it. “Submit” becomes “Get my free plan”. Copy the fix with one tap.",
  },
  {
    emoji: "⚖️",
    title: "Score in about a minute",
    body: "One score, six sub-scores, and the receipts. Your first audit is free — no account, no email.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList>(null);

  const finish = async () => {
    await AsyncStorage.setItem("verdict.onboarded", "1");
    router.replace("/");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
      <Pressable onPress={finish} style={styles.skip} hitSlop={12} accessibilityRole="button">
        <Text style={{ color: colors.dim, fontSize: 15, fontWeight: "600" }}>Skip</Text>
      </Pressable>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={[type.hero, { textAlign: "center", marginBottom: spacing.l }]}>{item.title}</Text>
            <Text style={[type.body, { textAlign: "center", color: colors.dim }]}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && { backgroundColor: colors.accent, width: 22 }]} />
        ))}
      </View>

      <View style={{ paddingHorizontal: spacing.xl }}>
        <PrimaryButton
          title={page === SLIDES.length - 1 ? "Judge my site" : "Next"}
          onPress={() => {
            if (page === SLIDES.length - 1) finish();
            else listRef.current?.scrollToIndex({ index: page + 1, animated: true });
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  skip: { position: "absolute", top: 60, right: 24, zIndex: 2 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emoji: { fontSize: 64, marginBottom: 28 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface2 },
});
