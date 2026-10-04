import { sha256Hex } from "./crypto";

async function hmacSha256(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySimpleHmacSignature(
  signatureHeader: string | null,
  payload: string,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) {
    return false;
  }
  const expected = await hmacSha256(secret, payload);
  const normalized = signatureHeader.replace(/^sha256=/i, "");
  // Hash compare helps avoid leaking signature length/timing differences directly.
  return (await sha256Hex(normalized)) === (await sha256Hex(expected));
}
