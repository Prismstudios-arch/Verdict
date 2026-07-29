import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Stable device identity that survives uninstall/reinstall.
 *
 * The anti-abuse trick: on iOS, Keychain items (expo-secure-store) are NOT
 * cleared when the app is deleted — only on a full device wipe. So we store
 * the device id in the Keychain. A user who uninstalls and reinstalls to farm
 * a fresh free credit gets the SAME id back, and the server recognises them.
 *
 * AsyncStorage is a mirror: it's wiped on uninstall, but if the Keychain read
 * ever fails (some Android OEMs, or SecureStore unavailable) we fall back to
 * it, and we always write both so an existing AsyncStorage-only id (from
 * before this change) is migrated into the Keychain on next launch.
 */

const KEY = "verdict.deviceId";

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function secureGet(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function secureSet(value: string): Promise<void> {
  try {
    // AFTER_FIRST_UNLOCK keeps the item readable in the background and
    // persists it across reinstalls.
    await SecureStore.setItemAsync(KEY, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  } catch {
    /* SecureStore unavailable — AsyncStorage mirror still holds it */
  }
}

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const [fromKeychain, fromAsync] = await Promise.all([secureGet(), AsyncStorage.getItem(KEY)]);
  // Keychain wins (survives reinstall); otherwise migrate an existing
  // AsyncStorage id; otherwise mint a new one.
  const id = fromKeychain ?? fromAsync ?? uuid();

  // Ensure both stores hold it (migration + mirror).
  if (fromKeychain !== id) await secureSet(id);
  if (fromAsync !== id) await AsyncStorage.setItem(KEY, id);

  cached = id;
  return id;
}

/** Called by "Delete my data": mint a genuinely fresh identity. */
export async function resetDeviceId(): Promise<string> {
  cached = null;
  const id = uuid();
  await secureSet(id);
  await AsyncStorage.setItem(KEY, id);
  cached = id;
  return id;
}
