/**
 * Helper de desenvolvimento: cria um symlink
 *   <Foundry userData>/Data/modules/monster-anatomy  →  <repo>/dist
 * para testar o módulo sem copiar arquivos a cada build.
 *
 * Uso: `npm run link [-- --dataPath "C:/caminho/para/FoundryVTT"]`
 *
 * Detecção do userData:
 *  1. --dataPath explícito
 *  2. env FOUNDRY_DATA_PATH
 *  3. defaults por SO (%LOCALAPPDATA%/FoundryVTT no Windows,
 *     ~/.local/share/FoundryVTT no Linux, ~/Library/Application Support/FoundryVTT no Mac)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function defaultDataPath() {
  const platform = os.platform();
  if (platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(local, "FoundryVTT");
  }
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "FoundryVTT");
  return path.join(os.homedir(), ".local", "share", "FoundryVTT");
}

const dataPath = argValue("--dataPath") ?? process.env.FOUNDRY_DATA_PATH ?? defaultDataPath();
const target = path.join(dataPath, "Data", "modules", "monster-anatomy");

if (!fs.existsSync(distDir)) {
  console.error(`[link] dist/ não existe. Rode "npm run build" antes de "npm run link".`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(target), { recursive: true });

try {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink() || stat.isDirectory()) {
    console.log(`[link] Removendo destino existente: ${target}`);
    fs.rmSync(target, { recursive: true, force: true });
  }
} catch {
  /* destino não existe — segue o jogo */
}

const type = os.platform() === "win32" ? "junction" : "dir";
fs.symlinkSync(distDir, target, type);
console.log(`[link] OK: ${target} → ${distDir}`);
