import Constants, { ExecutionEnvironment } from "expo-constants";
import { getUserId, simulatePurchase } from "./api";

/**
 * RevenueCat wrapper.
 *
 * - In a dev/production build: uses react-native-purchases with the key from
 *   EXPO_PUBLIC_RC_IOS_KEY, identified by the server userId (which is also
 *   the RevenueCat app_user_id the webhook uses to grant entitlements).
 * - Inside Expo Go: native IAP modules can't run, so purchases are mocked —
 *   clearly labeled in the UI — and fulfilled via the server's dev-only
 *   simulate-purchase endpoint so the whole entitlement flow stays
 *   server-authoritative and testable end to end.
 */

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export interface Product {
  id: "pro_yearly" | "pro_monthly" | "credits_5";
  title: string;
  price: string;
  period: string;
  note: string;
}

export const FALLBACK_PRODUCTS: Product[] = [
  { id: "pro_yearly", title: "Pro Yearly", price: "£39.99", period: "/year", note: "30 audits/mo — about 11p per audit" },
  { id: "pro_monthly", title: "Pro Monthly", price: "£4.99", period: "/month", note: "30 audits every month" },
  { id: "credits_5", title: "5 Audit Pack", price: "£3.99", period: "one-off", note: "No subscription, no strings" },
];

let configured = false;

async function rc() {
  const mod = await import("react-native-purchases");
  return mod.default;
}

export async function initPurchases(): Promise<void> {
  if (isExpoGo || configured) return;
  const apiKey = process.env.EXPO_PUBLIC_RC_IOS_KEY;
  // Treat an empty or still-placeholder key as "not set up yet".
  if (!apiKey || apiKey.includes("REPLACE")) return;
  try {
    const Purchases = await rc();
    const userId = await getUserId();
    Purchases.configure({ apiKey, appUserID: userId ?? undefined });
    configured = true;
  } catch (err) {
    console.warn("RevenueCat init failed:", err);
  }
}

const DISPLAY_ORDER: Record<string, number> = { pro_yearly: 0, pro_monthly: 1, credits_5: 2 };

export async function getProducts(): Promise<Product[]> {
  if (isExpoGo || !configured) return FALLBACK_PRODUCTS;
  try {
    const Purchases = await rc();
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    if (!packages.length) return FALLBACK_PRODUCTS;
    return packages
      .map((p) => ({
        id: (p.product.identifier as Product["id"]) ?? "pro_monthly",
        title: p.product.title,
        price: p.product.priceString,
        period: p.packageType === "ANNUAL" ? "/year" : p.packageType === "MONTHLY" ? "/month" : "one-off",
        note: p.product.description,
      }))
      // RevenueCat returns packages in its own order — show yearly (the
      // best-value anchor) first, credit pack last.
      .sort((a, b) => (DISPLAY_ORDER[a.id] ?? 9) - (DISPLAY_ORDER[b.id] ?? 9));
  } catch {
    return FALLBACK_PRODUCTS;
  }
}

/** Returns true on success. Throws with a user-readable message on failure. */
export async function purchase(productId: Product["id"]): Promise<boolean> {
  if (isExpoGo) {
    // Expo Go: simulated purchase — server grants the entitlement exactly
    // as the RevenueCat webhook would.
    await simulatePurchase(productId);
    return true;
  }
  if (!configured) {
    // A real build where RevenueCat isn't set up yet (e.g. this first
    // TestFlight test build). Fail with a clear message instead of hitting
    // the dev-only simulate endpoint (which is disabled in production).
    throw new Error("Purchases aren't enabled in this build yet — coming soon.");
  }
  const Purchases = await rc();
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages.find((p) => p.product.identifier === productId);
  if (!pkg) throw new Error("Product unavailable right now.");
  try {
    await Purchases.purchasePackage(pkg);
    return true;
  } catch (err: any) {
    if (err?.userCancelled) return false;
    throw new Error(err?.message ?? "Purchase failed.");
  }
}

export async function restorePurchases(): Promise<void> {
  if (isExpoGo || !configured) return;
  const Purchases = await rc();
  await Purchases.restorePurchases();
}
