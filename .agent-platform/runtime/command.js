/** Authorization, mutation, audit and outbox insertion share the caller's transaction. */
export async function runCommand(input, command) {
  return command.transaction(async (tx) => {
    await command.authorize(tx, input);
    const result = await command.execute(tx, input);
    await command.audit(tx, input, result);
    await command.enqueue(tx, input, result);
    return result;
  });
}

/** Claim and projection are atomic. External effects belong in an outbox. */
export async function consumeEvent(event, consumer) {
  if (typeof event.id !== "string" || !event.id.trim() || typeof event.type !== "string" ||
      !event.type.trim() || !Number.isSafeInteger(event.version) || event.version < 1) {
    throw new TypeError("Invalid event envelope");
  }
  return consumer.transaction(async (tx) => {
    if (!await consumer.claim(tx, event)) return { duplicate: true };
    await consumer.apply(tx, event);
    return { duplicate: false };
  });
}
