import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listAudits } from "@/src/api";
import { AuditRow } from "@/src/components/AuditRow";
import { Skeleton } from "@/src/components/Skeleton";
import { colors, spacing, type } from "@/src/theme";
import type { AuditSummary } from "@/src/types";

export default function History() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [audits, setAudits] = useState<AuditSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await listAudits();
      setAudits(r.audits);
    } catch {
      setAudits((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={type.h2}>All verdicts</Text>
        <View style={{ width: 50 }} />
      </View>
      {audits === null ? (
        <View style={{ padding: spacing.xl }}>
          <Skeleton style={{ height: 68, marginBottom: 8 }} />
          <Skeleton style={{ height: 68, marginBottom: 8, opacity: 0.7 }} />
          <Skeleton style={{ height: 68, opacity: 0.5 }} />
        </View>
      ) : (
        <FlatList
          data={audits}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => <AuditRow audit={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.accent}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <Text style={[type.dim, { textAlign: "center", marginTop: 60 }]}>No verdicts yet.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.m,
  },
  back: { color: colors.accent, fontSize: 15, fontWeight: "600", width: 50 },
});
