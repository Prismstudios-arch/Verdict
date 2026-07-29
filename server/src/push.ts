/**
 * Push notifications via Expo's push service — a single HTTPS call, no SDK.
 * Best-effort: failures are logged, never thrown into the caller.
 */
export async function sendPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  if (!token.startsWith("ExponentPushToken")) {
    console.warn(`[push] skipping invalid token format`);
    return false;
  }
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ to: token, title, body, sound: "default", data: data ?? {} }),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { status?: string; message?: string };
    } | null;
    const ok = res.ok && json?.data?.status !== "error";
    if (!ok) console.warn(`[push] send failed: ${res.status} ${json?.data?.message ?? ""}`);
    else console.log(`[push] sent: "${title}"`);
    return ok;
  } catch (err) {
    console.warn("[push] send error:", err instanceof Error ? err.message : err);
    return false;
  }
}
