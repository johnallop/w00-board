import type { BillboardConfig } from '../types/config';

const VALID_H = ['left', 'center', 'right'] as const;
const VALID_V = ['top', 'center', 'bottom'] as const;

export function validateConfig(config: unknown): asserts config is BillboardConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('config.json : doit être un objet JSON valide');
  }

  const c = config as Record<string, unknown>;

  if (typeof c.message !== 'string' || c.message.trim() === '') {
    throw new Error('config.json : "message" doit être une chaîne non vide');
  }
  if (typeof c.author !== 'string' || c.author.trim() === '') {
    throw new Error('config.json : "author" doit être une chaîne non vide');
  }

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
