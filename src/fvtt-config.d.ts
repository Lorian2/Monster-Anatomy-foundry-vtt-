/**
 * Augmentação dos registros de tipos do Foundry (padrão oficial do fvtt-types).
 *
 * - `FlagConfig`: declara `flags.monster-anatomy.parts` nos Actors, tipando
 *   `getFlag`/`setFlag`/`unsetFlag` sem casts.
 * - `SettingConfig`: declara as settings do módulo, tipando
 *   `game.settings.register/get` por namespace.
 * - `ModuleConfig`: declara `game.modules.get("monster-anatomy").api`.
 */
import type { MonsterAnatomyAPI } from "./api.js";
import type { MonsterPart } from "./part-model.js";
import type { LootEntry } from "./rewards.js";

declare global {
  interface FlagConfig {
    Actor: {
      "monster-anatomy": {
        parts: MonsterPart[];
        attrBackup?: Record<string, Record<string, unknown>>;
        loot?: LootEntry[];
        hideAc?: boolean;
        mapLayout?: string;
      };
    };
    ActiveEffect: {
      "monster-anatomy": {
        partId: string;
        kind: string;
      };
    };
  }

  interface SettingConfig {
    "monster-anatomy.showHeaderButton": boolean;
    "monster-anatomy.defaultAc": number;
    "monster-anatomy.defaultHp": number;
    "monster-anatomy.damageModel": string;
    "monster-anatomy.damagePercent": number;
    "monster-anatomy.brokenBonus": number;
    "monster-anatomy.showAnnouncement": boolean;
    "monster-anatomy.announceDuration": number;
    "monster-anatomy.chatMessage": boolean;
    "monster-anatomy.tokenEffect": boolean;
    "monster-anatomy.breakSound": string;
    "monster-anatomy.promptOnTarget": boolean;
    "monster-anatomy.attackNotes": boolean;
    "monster-anatomy.announceTheme": string;
    "monster-anatomy.customKickerBreak": string;
    "monster-anatomy.customKickerSever": string;
    "monster-anatomy.tokenShake": boolean;
    "monster-anatomy.screenFlash": boolean;
    "monster-anatomy.reducedMotion": boolean;
    "monster-anatomy.particles": boolean;
    "monster-anatomy.screenShake": boolean;
    "monster-anatomy.templatesJson": string;
  }

  interface ModuleConfig {
    "monster-anatomy": {
      api: MonsterAnatomyAPI;
    };
  }
}

export {};
