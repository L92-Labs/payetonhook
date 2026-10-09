export type Blueprint = Readonly<{ name: string; version: string; template: string; platformVersion: string; contracts: readonly string[]; checks: readonly string[]; recipe: string }>;
export const blueprints: readonly Blueprint[];
export function blueprintDigest(blueprint: Blueprint): Promise<string>;
export function validateBlueprint(input: unknown): Promise<Blueprint>;
