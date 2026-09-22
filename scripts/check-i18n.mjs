/**
 * Check de consistência i18n: garante que toda chave MONSTER_ANATOMY usada
 * em templates HBS e arquivos TS de src existe em lang/en.json e pt-BR.json.
 * Uso: `node scripts/check-i18n.mjs` (exit 1 se faltar chave).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const used = new Set();

function collectHbs(file) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/localize\s+"([^"]+)"/g)) used.add(m[1]);
  const open = (src.match(/\{\{/g) || []).length;
  const close = (src.match(/\}\}/g) || []).length;
  if (open !== close) {
    console.error(`[i18n] ${path.relative(root, file)}: chaves desbalanceadas ({{=${open} }}=${close})`);
    process.exitCode = 1;
  }
}

function collectTs(file) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/"(MONSTER_ANATOMY\.[A-Za-z0-9_.]+)"/g)) used.add(m[1]);
}

function walk(dir, exts) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

for (const f of walk(path.join(root, "templates"), [".hbs"])) collectHbs(f);
for (const f of walk(path.join(root, "src"), [".ts"])) collectTs(f);

const flat = (o, prefix = "", acc = {}) => {
  for (const k of Object.keys(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof o[k] === "object" && o[k] !== null) flat(o[k], key, acc);
    else acc[key] = true;
  }
  return acc;
};

let failed = false;
for (const lang of ["en", "pt-BR"]) {
  const keys = flat(JSON.parse(fs.readFileSync(path.join(root, "lang", `${lang}.json`), "utf8")));
  const missing = [...used].filter((k) => !keys[k]);
  if (missing.length > 0) {
    failed = true;
    console.error(`[i18n] ${lang}.json: faltando ${missing.length}: ${missing.join(", ")}`);
  } else {
    console.log(`[i18n] ${lang}.json: OK (${used.size} chaves usadas)`);
  }
}
if (failed) process.exit(1);
