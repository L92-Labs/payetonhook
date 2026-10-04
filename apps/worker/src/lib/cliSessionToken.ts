type CliSessionTokenPayload = {
  userId: string;
  exp: number;
};

function b64UrlEncode(input: Uint8Array): string {
  let binary = "";
  for (const byte of input) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64UrlEncodeText(input: string): string {
  return b64UrlEncode(new TextEncoder().encode(input));
}

function b64UrlDecodeToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

export async function signCliSessionToken(secret: string, payload: CliSessionTokenPayload): Promise<string> {
  const encodedPayload = b64UrlEncodeText(JSON.stringify(payload));
  const signature = await hmacSha256(secret, encodedPayload);
  return `${encodedPayload}.${b64UrlEncode(signature)}`;
}

export async function verifyCliSessionToken(secret: string, token: string): Promise<CliSessionTokenPayload | null> {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) return null;
  let payload: CliSessionTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64UrlDecodeToBytes(payloadPart))) as CliSessionTokenPayload;
  } catch {
    return null;
  }
  if (!payload.userId || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  const expected = await hmacSha256(secret, payloadPart);
  const provided = b64UrlDecodeToBytes(signaturePart);
  if (!safeEqual(expected, provided)) return null;
  return payload;
}
