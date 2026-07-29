import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getDeviceId, resetDeviceId } from "./device";
import type { AuditSummary, Me, Monitor } from "./types";

/**
 * API client: anonymous device auth with access/refresh rotation, automatic
 * base-URL discovery (in Expo Go the dev machine's LAN IP comes from the
 * Metro hostUri, so pointing the app at the local server is zero-config).
 */

const KEYS = {
  apiBase: "verdict.apiBase",
  access: "verdict.access",
  refresh: "verdict.refresh",
  userId: "verdict.userId",
};

let cachedBase: string | null = null;
let access: string | null = null;
let refresh: string | null = null;

export async function getApiBase(): Promise<string> {
  if (cachedBase) return cachedBase;
  let base: string;
  const override = await AsyncStorage.getItem(KEYS.apiBase);
  // Priority: manual override (Settings) → production URL baked in via
  // eas.json env → LAN address derived from Metro (Expo Go dev) → localhost.
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (override) {
    base = override.replace(/\/$/, "");
  } else if (envUrl) {
    base = envUrl.replace(/\/$/, "");
  } else {
    const hostUri: string | undefined =
      Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
    const host = hostUri?.split(":")[0];
    base = host ? `http://${host}:8787` : "http://localhost:8787";
  }
  cachedBase = base;
  return base;
}

export async function setApiBase(url: string): Promise<void> {
  cachedBase = null;
  if (url.trim()) await AsyncStorage.setItem(KEYS.apiBase, url.trim());
  else await AsyncStorage.removeItem(KEYS.apiBase);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

let sessionInFlight: Promise<string> | null = null;

export async function ensureSession(): Promise<string> {
  if (access) return access;
  // Single-flight: concurrent callers at first launch (e.g. _layout + Home)
  // must share one login, or we'd create two anonymous accounts and burn two
  // free-credit grants.
  if (sessionInFlight) return sessionInFlight;
  sessionInFlight = (async () => {
    const [storedAccess, storedRefresh] = await Promise.all([
      AsyncStorage.getItem(KEYS.access),
      AsyncStorage.getItem(KEYS.refresh),
    ]);
    access = storedAccess;
    refresh = storedRefresh;
    if (access) return access;
    return loginAnonymous();
  })();
  try {
    return await sessionInFlight;
  } finally {
    sessionInFlight = null;
  }
}

async function loginAnonymous(): Promise<string> {
  const deviceId = await getDeviceId(); // Keychain-backed; survives reinstall
  const base = await getApiBase();
  const res = await fetch(`${base}/v1/auth/anonymous`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) throw new ApiError(res.status, "Could not reach the Verdict server");
  const data = (await res.json()) as { userId: string; accessToken: string; refreshToken: string };
  access = data.accessToken;
  refresh = data.refreshToken;
  await AsyncStorage.multiSet([
    [KEYS.access, data.accessToken],
    [KEYS.refresh, data.refreshToken],
    [KEYS.userId, data.userId],
  ]);
  return access;
}

async function tryRefresh(): Promise<boolean> {
  if (!refresh) return false;
  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/v1/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    access = data.accessToken;
    refresh = data.refreshToken;
    await AsyncStorage.multiSet([
      [KEYS.access, data.accessToken],
      [KEYS.refresh, data.refreshToken],
    ]);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  await ensureSession();
  const base = await getApiBase();
  const doFetch = () =>
    fetch(`${base}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${access}`,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = (await tryRefresh()) || (await loginAnonymous().then(() => true).catch(() => false));
    if (refreshed) res = await doFetch();
  }
  if (!res.ok) {
    let code: string | undefined;
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      code = data.error;
      if (data.message) message = data.message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, code);
  }
  return (await res.json()) as T;
}

export async function getUserId(): Promise<string | null> {
  await ensureSession();
  return AsyncStorage.getItem(KEYS.userId);
}

// ---- Typed endpoints ----

/** Deletes all server-side data for this user and resets the local session. */
export async function deleteMyData(): Promise<void> {
  await request<{ ok: boolean }>("/v1/me", { method: "DELETE" });
  access = null;
  refresh = null;
  await AsyncStorage.multiRemove([KEYS.access, KEYS.refresh, KEYS.userId]);
  // Genuine GDPR reset: mint a fresh Keychain identity so the old one is
  // forgotten. (The server's per-IP cap still guards against farming.)
  await resetDeviceId();
}

export const createAudit = (url: string) => post<AuditSummary>("/v1/audits", { url });
export const getAudit = (id: string) =>
  id === "sample"
    ? request<AuditSummary>("/v1/sample")
    : request<AuditSummary>(`/v1/audits/${id}`);
export const listAudits = () => request<{ audits: AuditSummary[] }>("/v1/audits");
export const getMe = () => request<Me>("/v1/me");
export const registerPushToken = (token: string) => post<{ ok: boolean }>("/v1/push-token", { token });
export const listMonitors = () => request<{ monitors: Monitor[] }>("/v1/monitors");
export const addMonitor = (url: string) => post<{ monitor: Monitor }>("/v1/monitors", { url });
export const removeMonitor = (id: string) =>
  request<{ ok: boolean }>(`/v1/monitors/${id}`, { method: "DELETE" });
export const simulatePurchase = (product: string) =>
  post<{ ok: boolean }>("/v1/dev/simulate-purchase", { product });

export async function absoluteUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${await getApiBase()}${path}`;
}
