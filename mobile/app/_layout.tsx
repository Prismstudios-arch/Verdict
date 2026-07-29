import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ensureSession } from "@/src/api";
import { ensurePushRegistered } from "@/src/notifications";
import { initPurchases } from "@/src/purchases";
import { colors } from "@/src/theme";

export default function RootLayout() {
  useEffect(() => {
    ensureSession()
      .then(() => initPurchases())
      // Silent token refresh — only if the user already granted notifications
      // (never prompts here; the prompt happens when enabling monitoring).
      .then(() => ensurePushRegistered({ ask: false }))
      .catch(() => {
        /* offline at launch — screens surface their own errors */
      });
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade_from_bottom",
        }}
      >
        <Stack.Screen name="paywall" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      </Stack>
    </>
  );
}
