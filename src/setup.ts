/**
 * Registro de settings + botão de header nas fichas de Actor.
 *
 * Header em v13: hook `getHeaderControls{Classe}` com entradas
 * `ApplicationHeaderControlsEntry` (ex.: `getHeaderControlsActorSheetV2`,
 * disparado também para subclasses como as fichas do dnd5e; cada entrada
 * aceita `onClick`).
 * Mantemos ainda o hook legado `getActorSheetHeaderButtons` como fallback
 * para fichas AppV1 remanescentes.
 */
import { MODULE_ID } from "./constants.js";
import { getModuleApi, getSetting } from "./fvtt.js";
import { registerAttackIntegration } from "./attack-integration.js";
import { registerTargeting } from "./targeting.js";

/** Registros do ciclo `init` que dependem só do módulo. */
export function registerCombatIntegration(): void {
  registerTargeting();
  registerAttackIntegration();
}

export function registerSettings(): void {
  game.settings!.register(MODULE_ID, "showHeaderButton", {
    name: "MONSTER_ANATOMY.Settings.ShowHeaderButton.Name",
    hint: "MONSTER_ANATOMY.Settings.ShowHeaderButton.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "defaultAc", {
    name: "MONSTER_ANATOMY.Settings.DefaultAc.Name",
    hint: "MONSTER_ANATOMY.Settings.DefaultAc.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 10,
  });

  game.settings!.register(MODULE_ID, "defaultHp", {
    name: "MONSTER_ANATOMY.Settings.DefaultHp.Name",
    hint: "MONSTER_ANATOMY.Settings.DefaultHp.Hint",
    scope: "world",
    config: true,
    type: Number,
    default: 20,
  });

  game.settings!.register(MODULE_ID, "damageModel", {
    name: "MONSTER_ANATOMY.Settings.DamageModel.Name",
    hint: "MONSTER_ANATOMY.Settings.DamageModel.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      independent: "MONSTER_ANATOMY.Settings.DamageModel.Independent",
      shared: "MONSTER_ANATOMY.Settings.DamageModel.Shared",
      percent: "MONSTER_ANATOMY.Settings.DamageModel.Percent",
    },
    default: "shared",
  });

  game.settings!.register(MODULE_ID, "damagePercent", {
    name: "MONSTER_ANATOMY.Settings.DamagePercent.Name",
    hint: "MONSTER_ANATOMY.Settings.DamagePercent.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 100, step: 5 },
    default: 50,
  });

  game.settings!.register(MODULE_ID, "brokenBonus", {
    name: "MONSTER_ANATOMY.Settings.BrokenBonus.Name",
    hint: "MONSTER_ANATOMY.Settings.BrokenBonus.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 200, step: 5 },
    default: 50,
  });

  game.settings!.register(MODULE_ID, "showAnnouncement", {
    name: "MONSTER_ANATOMY.Settings.ShowAnnouncement.Name",
    hint: "MONSTER_ANATOMY.Settings.ShowAnnouncement.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "announceDuration", {
    name: "MONSTER_ANATOMY.Settings.AnnounceDuration.Name",
    hint: "MONSTER_ANATOMY.Settings.AnnounceDuration.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 0.5, max: 10, step: 0.5 },
    default: 2.5,
  });

  game.settings!.register(MODULE_ID, "chatMessage", {
    name: "MONSTER_ANATOMY.Settings.ChatMessage.Name",
    hint: "MONSTER_ANATOMY.Settings.ChatMessage.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "tokenEffect", {
    name: "MONSTER_ANATOMY.Settings.TokenEffect.Name",
    hint: "MONSTER_ANATOMY.Settings.TokenEffect.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "breakSound", {
    name: "MONSTER_ANATOMY.Settings.BreakSound.Name",
    hint: "MONSTER_ANATOMY.Settings.BreakSound.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings!.register(MODULE_ID, "promptOnTarget", {
    name: "MONSTER_ANATOMY.Settings.PromptOnTarget.Name",
    hint: "MONSTER_ANATOMY.Settings.PromptOnTarget.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "attackNotes", {
    name: "MONSTER_ANATOMY.Settings.AttackNotes.Name",
    hint: "MONSTER_ANATOMY.Settings.AttackNotes.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "announceTheme", {
    name: "MONSTER_ANATOMY.Settings.AnnounceTheme.Name",
    hint: "MONSTER_ANATOMY.Settings.AnnounceTheme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      persona: "MONSTER_ANATOMY.Settings.AnnounceTheme.Persona",
      monsterhunter: "MONSTER_ANATOMY.Settings.AnnounceTheme.MonsterHunter",
      jrpg: "MONSTER_ANATOMY.Settings.AnnounceTheme.Jrpg",
      minimal: "MONSTER_ANATOMY.Settings.AnnounceTheme.Minimal",
      impact: "MONSTER_ANATOMY.Settings.AnnounceTheme.Impact",
      arcade: "MONSTER_ANATOMY.Settings.AnnounceTheme.Arcade",
      carved: "MONSTER_ANATOMY.Settings.AnnounceTheme.Carved",
    },
    default: "persona",
  });

  game.settings!.register(MODULE_ID, "customKickerBreak", {
    name: "MONSTER_ANATOMY.Settings.CustomKickerBreak.Name",
    hint: "MONSTER_ANATOMY.Settings.CustomKickerBreak.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings!.register(MODULE_ID, "customKickerSever", {
    name: "MONSTER_ANATOMY.Settings.CustomKickerSever.Name",
    hint: "MONSTER_ANATOMY.Settings.CustomKickerSever.Hint",
    scope: "world",
    config: true,
    type: String,
    default: "",
  });

  game.settings!.register(MODULE_ID, "tokenShake", {
    name: "MONSTER_ANATOMY.Settings.TokenShake.Name",
    hint: "MONSTER_ANATOMY.Settings.TokenShake.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "screenFlash", {
    name: "MONSTER_ANATOMY.Settings.ScreenFlash.Name",
    hint: "MONSTER_ANATOMY.Settings.ScreenFlash.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "reducedMotion", {
    name: "MONSTER_ANATOMY.Settings.ReducedMotion.Name",
    hint: "MONSTER_ANATOMY.Settings.ReducedMotion.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });

  game.settings!.register(MODULE_ID, "particles", {
    name: "MONSTER_ANATOMY.Settings.Particles.Name",
    hint: "MONSTER_ANATOMY.Settings.Particles.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "screenShake", {
    name: "MONSTER_ANATOMY.Settings.ScreenShake.Name",
    hint: "MONSTER_ANATOMY.Settings.ScreenShake.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings!.register(MODULE_ID, "templatesJson", {
    name: "MONSTER_ANATOMY.Settings.TemplatesJson.Name",
    hint: "MONSTER_ANATOMY.Settings.TemplatesJson.Hint",
    scope: "world",
    config: false,
    type: String,
    default: "[]",
  });
}

function resolveActor(app: unknown): Actor | undefined {
  const doc = (app as { document?: unknown })?.document;
  return doc instanceof Actor ? doc : undefined;
}

function headerEnabled(): boolean {
  try {
    return getSetting("showHeaderButton");
  } catch {
    return true;
  }
}

function injectControl(app: unknown, controls: unknown): void {
  const actor = resolveActor(app);
  if (!actor || !Array.isArray(controls) || !headerEnabled()) return;
  if (controls.some((c) => (c as Record<string, unknown>)?.action === "monster-anatomy")) {
    return; // ambos os ganchos disparam para a mesma ficha: sem duplicar
  }
  controls.unshift({
    action: "monster-anatomy",
    label: "MONSTER_ANATOMY.Panel.OpenButton",
    icon: "fa-solid fa-dragon",
    onClick: () => {
      void getModuleApi()?.openAnatomy(actor);
    },
  });
}

export function registerHeaderButtons(): void {
  // ApplicationV2 (v13+) — gancho específico da ficha de Actor...
  Hooks.on("getHeaderControlsActorSheetV2", (...args: unknown[]) => {
    injectControl(args[0], args[1]);
  });

  // ...e gancho genérico (dispara para TODA app V2, inclusive renomeações de
  // classe em v14). O filtro por documento garante que só fichas de Actor ganham o botão.
  Hooks.on("getHeaderControlsApplicationV2", (...args: unknown[]) => {
    injectControl(args[0], args[1]);
  });

  // Fallback AppV1 (formato legado de entrada).
  Hooks.on("getActorSheetHeaderButtons", (...args: unknown[]) => {
    const [app, buttons] = args as [unknown, Array<Record<string, unknown>>];
    const candidate = resolveActor(app) ?? (app as { actor?: unknown })?.actor;
    if (!(candidate instanceof Actor) || !Array.isArray(buttons) || !headerEnabled()) return;
    const actor = candidate;
    buttons.unshift({
      class: "monster-anatomy-open",
      icon: "fas fa-dragon",
      label: "MONSTER_ANATOMY.Panel.OpenButton",
      onclick: () => {
        void getModuleApi()?.openAnatomy(actor);
      },
    });
  });
}

export async function preloadTemplates(): Promise<void> {
  await foundry.applications.handlebars.loadTemplates([
    "modules/monster-anatomy/templates/anatomy-panel.hbs",
    "modules/monster-anatomy/templates/anatomy-tracker.hbs",
    "modules/monster-anatomy/templates/loot-summary.hbs",
    "modules/monster-anatomy/templates/part-editor.hbs",
    "modules/monster-anatomy/templates/target-map.hbs",
  ]);
}
