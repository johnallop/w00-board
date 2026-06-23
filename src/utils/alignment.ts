import type { LayoutConfig } from '../types/config';

export const horizontalMap: Record<LayoutConfig['horizontalAlignment'], string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

export const verticalMap: Record<LayoutConfig['verticalAlignment'], string> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
};

export const textAlignMap: Record<LayoutConfig['horizontalAlignment'], string> = {
  left: 'left',
  center: 'center',
  right: 'right',
};

export function resolveAlignment(layout: LayoutConfig) {
  return {
    justifyValue: verticalMap[layout.verticalAlignment] ?? 'center',
    alignValue: horizontalMap[layout.horizontalAlignment] ?? 'center',
    textAlignValue: textAlignMap[layout.horizontalAlignment] ?? 'center',
  };
}
