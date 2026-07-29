import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { registerPushToken } from "./api";

/**
 * Push registration for weekly-monitor alerts ("yoursite.com dropped 71→64").
 *
 * Remote push does not exist inside Expo Go — there we silently no-op
 * (monitoring still works, just without alerts). In real builds we register
 * the Expo push token with the server, which is the only place pushes are
 * sent from.
 */

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Show notifications as banners even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Ensures we have notification permission (optionally prompting) and that
 * the server has our current push token. Returns true when alerts will work.
 */
export async function ensurePushRegistered(opts: { ask: boolean }): Promise<boolean> {
  if (isExpoGo) return false;
  try {
    let perms = await Notifications.getPermissionsAsync();
    if (perms.status !== "granted" && opts.ask) {
      perms = await Notifications.requestPermissionsAsync();
    }
    if (perms.status !== "granted") return false;
    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
    await registerPushToken(token);
    return true;
  } catch (err) {
    console.warn("push registration failed:", err);
    return false;
  }
}
