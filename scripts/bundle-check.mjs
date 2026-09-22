/**
 * Sanidade do bundle: garante que dist não vazou imports de tipos,
 * jQuery ou classes AppV1 depreciadas.
 * Uso: `node scripts/bundle-check.mjs` (exit 1 se achar problema).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = fs.readFileSync(path.join(root, "dist", "scripts", "main.js"), "utf8");

const problems = [];
for (const [label, re] of [
  ["import de tipos", /from\s+["']fvtt-types\//],
  ["jQuery", /\bjQuery\b/],
  ["AppV1 (FormApplication)", /\bFormApplication\b/],
  ["ActorSheet V1", /[^V2]ActorSheet\b/],
]) {
  if (re.test(bundle)) problems.push(label);
}

if (problems.length > 0) {
  console.error(`[bundle] problemas: ${problems.join(", ")}`);
  process.exit(1);
}
console.log(`[bundle] OK (${bundle.length} bytes)`);
