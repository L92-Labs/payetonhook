import { readFileSync, writeFileSync, readdirSync, realpathSync, lstatSync } from "node:fs";
import { resolve, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { applies } from "./glob.mjs";
import { loadTypeScript, scanTypeScript } from "./typescript.mjs";

const root = realpathSync(process.cwd());
const here = dirname(fileURLToPath(import.meta.url));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const config = JSON.parse(readFileSync(resolve(root, "agent-platform.json"), "utf8"));
if (config.version !== 1 || !config.rules?.length || !config.roots?.length) throw new Error("Invalid architecture policy");
const integrity = JSON.parse(readFileSync(resolve(here, "../integrity.json"), "utf8"));
if (integrity.version !== "1.1.0" || integrity.source !== "loiu92/cf-bootstrap" ||
    !integrity.files || !integrity.files["policy/check.mjs"] || !integrity.files["runtime/task.js"]) {
  throw new Error("Incomplete platform integrity manifest");
}
for (const [file, expected] of Object.entries(integrity.files)) {
  const actual = resolve(here, "..", file);
  if (!actual.startsWith(resolve(here, "..") + "/") || lstatSync(actual).isSymbolicLink() || hash(readFileSync(actual)) !== expected) {
    throw new Error(`Platform snapshot drift: ${file}; update from the canonical cf-bootstrap release`);
  }
}
function verifyInventory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Platform snapshot contains a symlink");
    if (entry.isDirectory()) verifyInventory(path);
    else if (relative(resolve(here, ".."), path) !== "integrity.json" &&
        !Object.hasOwn(integrity.files, relative(resolve(here, ".."), path).replaceAll("\\", "/"))) {
      throw new Error(`Unlisted platform snapshot file: ${path}`);
    }
  }
}
verifyInventory(resolve(here, ".."));
const files = [];
const skip = new Set(["node_modules", ".git", ".next", "dist", "build", "__pycache__", ".venv", ".agent-platform"]);
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.isSymbolicLink()) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile() && [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go"].includes(extname(path)) &&
        !/(?:\.d\.[cm]?ts|\.(?:test|spec)\.[cm]?[tj]sx?|_test\.go|(?:^|\/)test_[^/]+\.py)$/.test(path)) files.push(path);
  }
}
for (const directory of config.roots) {
  const path = resolve(root, directory);
  if (path !== root && !path.startsWith(root + "/")) throw new Error("Source root outside project");
  walk(path);
}
const violations = []; const inputs = { ".py": [], ".go": [] }; let ts;
for (const path of [...new Set(files)].sort()) {
  const file = relative(root, path).replaceAll("\\", "/");
  const rules = config.rules.filter((rule) => applies(file, rule));
  if (!rules.length) continue;
  const source = readFileSync(path, "utf8"); const extension = extname(path);
  if (inputs[extension]) inputs[extension].push({ file, source, rules });
  else {
    ts ??= loadTypeScript(root, process.env.AGENT_TYPESCRIPT);
    violations.push(...scanTypeScript(ts, file, source, rules, config.aliases));
  }
}
for (const [extension, entries] of Object.entries(inputs)) {
  if (!entries.length) continue;
  const command = extension === ".py" ? ["python3", resolve(here, "python.py")] : ["go", "run", resolve(here, "goimports.go")];
  const run = spawnSync(command[0], command.slice(1), { input: JSON.stringify(entries), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`${command[0]} scanner failed: ${run.stderr}`);
  violations.push(...JSON.parse(run.stdout));
}
const fingerprint = (v) => `${v.file}:${v.rule}:${v.detail}`;
const baselinePath = resolve(root, "agent-platform.baseline.json");
if (process.argv.includes("--baseline")) {
  const baseline = Object.fromEntries(violations.map((v) => [fingerprint(v), {
    sha256: hash(readFileSync(resolve(root, v.file))), reason: "Pre-adoption debt; migrate when this source changes",
  }]));
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`BASELINE ${Object.keys(baseline).length} explicit violations`);
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const failures = violations.filter((v) => baseline[fingerprint(v)]?.sha256 !== hash(readFileSync(resolve(root, v.file))));
  for (const v of failures) console.error(`${v.file}:${v.line} ${v.rule}: ${v.detail}. ${v.guidance}`);
  console.log(`${failures.length ? "FAIL" : "PASS"} architecture; ${violations.length - failures.length} pinned legacy findings; ${files.length} source files`);
  if (failures.length) process.exitCode = 1;
}
