import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname } from "node:path";

const exec = promisify(execFile);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = process.env.BACKUP_PATH ?? `./backups/onside-${stamp}.dump`;

await mkdir(dirname(out), { recursive: true });

console.log(`[backup] pg_dump → ${out}`);
const { stderr } = await exec("pg_dump", [
  "--format=custom",
  "--no-owner",
  "--no-privileges",
  "--file",
  out,
  DATABASE_URL,
]);
if (stderr) console.warn(stderr);
console.log("[backup] done");
