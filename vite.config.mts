import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// IMPORTANTE (Foundry): saída com nomes fixos, SEM [hash].
// O module.json referencia paths exatos — hash quebraria o manifesto.
export default defineConfig({
  base: "/modules/monster-anatomy/",
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // Fontes woff2 referenciadas no CSS são embutidas em base64 no bundle final:
    // distribuição em arquivo único, offline e sem risco de path/404 no Foundry.
    assetsInlineLimit: 0,
    lib: {
      entry: path.resolve(__dirname, "src/main.ts"),
      formats: ["es"],
      // dist/scripts/main.js — bate com "esmodules" do module.json
      fileName: () => "scripts/main.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "styles/monster-anatomy.css";
          return "assets/[name][extname]";
        },
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "module.json", dest: "." },
        { src: "templates", dest: "." },
        // styles/ NÃO é copiado: o CSS entra via `import` no main.ts e o
        // próprio Vite o emite em dist/styles/monster-anatomy.css (ver assetFileNames).
        { src: "lang", dest: "." },
        { src: "README.md", dest: "." },
      ],
      structured: true,
    }),
  ],
  server: {
    port: 30001,
    proxy: {
      // Tudo que não for arquivo do módulo vai para o Foundry (porta padrão 30000).
      "^(?!/modules/monster-anatomy)": "http://localhost:30000/",
    },
  },
});
