export type Command<Tx, I, O> = {
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T>;
  authorize(tx: Tx, input: I): Promise<void>;
  execute(tx: Tx, input: I): Promise<O>;
  audit(tx: Tx, input: I, output: O): Promise<void>;
  enqueue(tx: Tx, input: I, output: O): Promise<void>;
};
export function runCommand<Tx, I, O>(input: I, command: Command<Tx, I, O>): Promise<O>;
export type EventEnvelope<T> = { id: string; type: string; version: number; payload: T };
export type Consumer<Tx, T> = {
  transaction<R>(work: (tx: Tx) => Promise<R>): Promise<R>;
  claim(tx: Tx, event: EventEnvelope<T>): Promise<boolean>;
  apply(tx: Tx, event: EventEnvelope<T>): Promise<void>;
};
export function consumeEvent<Tx, T>(event: EventEnvelope<T>, consumer: Consumer<Tx, T>): Promise<{ duplicate: boolean }>;
