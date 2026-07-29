import { config } from "./config.js";

/**
 * Optional Supabase Storage backing (free tier: 500MB DB / 1GB storage).
 *
 * Why: free container hosts (Render free, Cloud Run) have EPHEMERAL disks —
 * every restart/redeploy wipes local files. With SUPABASE_URL +
 * SUPABASE_SERVICE_KEY set, the server mirrors its state snapshot and all
 * screenshots to a private Supabase bucket and restores them on demand, so
 * users/credits/reports survive restarts at £0/month.
 *
 * Without the env vars, everything stays local exactly as before (dev mode).
 * All mirror operations are best-effort: a Supabase hiccup logs a warning
 * and never fails an audit.
 */

export function supabaseEnabled(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceKey);
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    authorization: `Bearer ${config.supabaseServiceKey}`,
    apikey: config.supabaseServiceKey,
    ...extra,
  };
}

function objectUrl(objectPath: string): string {
  return `${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${objectPath}`;
}

export async function sbUpload(
  objectPath: string,
  body: Buffer | string,
  contentType: string,
): Promise<boolean> {
  try {
    const res = await fetch(objectUrl(objectPath), {
      method: "POST",
      headers: authHeaders({ "content-type": contentType, "x-upsert": "true" }),
      body: typeof body === "string" ? body : new Uint8Array(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 140);
      console.warn(`[supabase] upload ${objectPath} failed: ${res.status} ${detail}`);
    }
    return res.ok;
  } catch (err) {
    console.warn(`[supabase] upload ${objectPath} error:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function sbDownload(objectPath: string): Promise<Buffer | null> {
  try {
    const res = await fetch(objectUrl(objectPath), {
      headers: authHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn(`[supabase] download ${objectPath} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}
