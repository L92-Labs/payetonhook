import type { EnqueuedWebhookEvent } from "@payetonhook/shared";
import { runDeliveryWorkflow, type DeliveryEnv } from "../workflows/delivery";

export async function handleQueueBatch(env: DeliveryEnv, batch: MessageBatch<EnqueuedWebhookEvent>): Promise<void> {
  for (const message of batch.messages) {
    try {
      await runDeliveryWorkflow(env, message.body);
      message.ack();
    } catch {
      message.retry();
    }
  }
}
