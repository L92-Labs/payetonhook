export type BlobStore = {
  EVENT_BLOB: R2Bucket;
};

export async function putEventPayload(env: BlobStore, eventId: string, payload: string): Promise<string> {
  const key = `events/${eventId}.json`;
  await env.EVENT_BLOB.put(key, payload, {
    httpMetadata: { contentType: "application/json" }
  });
  return key;
}

export async function getEventPayload(env: BlobStore, r2Key: string): Promise<string> {
  const obj = await env.EVENT_BLOB.get(r2Key);
  if (!obj) {
    throw new Error(`Missing payload for key ${r2Key}`);
  }
  return obj.text();
}

export async function putDeliveryResponse(env: BlobStore, attemptId: string, content: string): Promise<string> {
  const key = `responses/${attemptId}.txt`;
  await env.EVENT_BLOB.put(key, content, {
    httpMetadata: { contentType: "text/plain" }
  });
  return key;
}
