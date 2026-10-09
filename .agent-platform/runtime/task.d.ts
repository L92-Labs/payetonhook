export class TaskError extends Error { readonly code: string; constructor(code: string, task: string); }
export type TaskUsage = { provider?: string; model?: string; inputTokens?: number; outputTokens?: number };
export type Task<I, O> = { name: string; timeoutMs: number; maxOutputTokens: number; validate: (value: unknown) => O };
export type TaskAdapter<I> = {
  execute(input: I, context: { task: string; signal: AbortSignal; maxOutputTokens: number }): Promise<{ value: unknown; usage?: TaskUsage }>;
  recordUsage?: (usage: TaskUsage & { task: string }) => void | Promise<void>;
};
export function runTask<I, O>(task: Task<I, O>, input: I, adapter: TaskAdapter<I>, signal?: AbortSignal): Promise<{ value: O; usage?: TaskUsage }>;
