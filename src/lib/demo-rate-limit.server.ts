import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/** Only trust Vercel's edge-supplied address, never a browser-selected bucket. */
export function demoQuotaRequest(
  request: Request,
  env: Record<string, string | undefined> = process.env,
) {
  const secret = env["DEMO_RATE_LIMIT_SECRET"];
  if (env["VERCEL"] !== "1" || !secret || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error("DEMO_QUOTA_NOT_CONFIGURED");
  }
  const address = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!address || !isIP(address)) throw new Error("DEMO_CLIENT_ADDRESS_UNAVAILABLE");
  const normalized = isIP(address) === 6 ? new URL(`http://[${address}]/`).hostname : address;
  const bucket = createHmac("sha256", secret).update(`demo-login:v2:${normalized}`).digest("hex");
  return { p_secret: secret, p_bucket: bucket };
}
