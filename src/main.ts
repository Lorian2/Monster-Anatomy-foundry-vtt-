/**
 * Entry point do módulo (listado em `esmodules` no module.json).
 * Ciclo: init (registros) → setup → ready (mundo disponível).
 */
import "../styles/monster-anatomy.css";
import { MODULE_ID } from "./constants.js";
import { buildApi, exposeGlobal } from "./api.js";
import { preloadTemplates, registerCombatIntegration, registerHeaderButtons, registerSettings } from "./setup.js";
import { registerSockets } from "./sockets.js";

/** Uma etapa do init nunca pode derrubar as demais. */
function safely(step: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`${MODULE_ID} | falha no init (${step})`, err);
  }
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  safely("settings", registerSettings);
  safely("header", registerHeaderButtons);
  safely("combat", registerCombatIntegration);
  const api = buildApi();
  const module = game.modules?.get(MODULE_ID);
  if (module) module.api = api;
  exposeGlobal(api);
  void preloadTemplates();
});

Hooks.once("setup", () => {
  console.log(`${MODULE_ID} | setup`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready (v${game.modules?.get(MODULE_ID)?.version ?? "?"})`);
  registerSockets(); // socket só após conexão estabelecida
});
