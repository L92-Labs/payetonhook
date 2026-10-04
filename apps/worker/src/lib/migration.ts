export type ReadSource = "d1" | "external";

export type MigrationConfig = {
  dualWriteEnabled: boolean;
  readSource: ReadSource;
};

export function getMigrationConfig(env: { DUAL_WRITE_ENABLED?: string; READ_SOURCE?: string }): MigrationConfig {
  return {
    dualWriteEnabled: env.DUAL_WRITE_ENABLED === "true",
    readSource: env.READ_SOURCE === "external" ? "external" : "d1"
  };
}

export type CutoverStep =
  | "read-old-write-both"
  | "read-new-write-both"
  | "read-new-write-new"
  | "decommission-old";

export const cutoverOrder: CutoverStep[] = [
  "read-old-write-both",
  "read-new-write-both",
  "read-new-write-new",
  "decommission-old"
];
