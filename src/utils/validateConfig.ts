import type { BillboardConfig } from '../types/config';

const VALID_H = ['left', 'center', 'right'] as const;
const VALID_V = ['top', 'center', 'bottom'] as const;

export function validateConfig(config: unknown): asserts config is BillboardConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('config.json : doit être un objet JSON valide');
  }

  const c = config as Record<string, unknown>;

  if (!Array.isArray(c.billboards) || c.billboards.length === 0) {
    throw new Error('config.json : "billboards" doit être un tableau non vide');
  }

  c.billboards.forEach((board: unknown, i: number) => {
    if (typeof board !== 'object' || board === null) {
      throw new Error(`config.json : "billboards[${i}]" doit être un objet`);
    }
    const b = board as Record<string, unknown>;
    if (typeof b.id !== 'string' || b.id.trim() === '') {
      throw new Error(`config.json : "billboards[${i}].id" doit être une chaîne non vide`);
    }
    if (typeof b.message !== 'string' || b.message.trim() === '') {
      throw new Error(`config.json : "billboards[${i}].message" doit être une chaîne non vide`);
    }
    if (typeof b.author !== 'string' || b.author.trim() === '') {
      throw new Error(`config.json : "billboards[${i}].author" doit être une chaîne non vide`);
    }
    if (b.tags !== undefined && (!Array.isArray(b.tags) || !b.tags.every((t: unknown) => typeof t === 'string'))) {
      throw new Error(`config.json : "billboards[${i}].tags" doit être un tableau de chaînes`);
    }
    if (b.accentColor !== undefined && typeof b.accentColor !== 'string') {
      throw new Error(`config.json : "billboards[${i}].accentColor" doit être une chaîne`);
    }
  });

  if (typeof c.theme !== 'object' || c.theme === null) {
    throw new Error('config.json : "theme" doit être un objet');
  }
  const theme = c.theme as Record<string, unknown>;
  for (const key of ['backgroundColor', 'textColor', 'accentColor', 'fontSize', 'fontFamily'] as const) {
    if (typeof theme[key] !== 'string' || (theme[key] as string).trim() === '') {
      throw new Error(`config.json : "theme.${key}" doit être une chaîne non vide`);
    }
  }

  if (typeof c.layout !== 'object' || c.layout === null) {
    throw new Error('config.json : "layout" doit être un objet');
  }
  const layout = c.layout as Record<string, unknown>;
  if (!VALID_H.includes(layout.horizontalAlignment as (typeof VALID_H)[number])) {
    throw new Error(`config.json : "layout.horizontalAlignment" doit être parmi : ${VALID_H.join(', ')}`);
  }
  if (!VALID_V.includes(layout.verticalAlignment as (typeof VALID_V)[number])) {
    throw new Error(`config.json : "layout.verticalAlignment" doit être parmi : ${VALID_V.join(', ')}`);
  }
}
