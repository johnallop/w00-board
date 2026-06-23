import { describe, it, expect } from 'vitest';
import { horizontalMap, verticalMap, textAlignMap, resolveAlignment } from '../utils/alignment';

describe('horizontalMap', () => {
  it('maps left to flex-start', () => expect(horizontalMap.left).toBe('flex-start'));
  it('maps center to center', () => expect(horizontalMap.center).toBe('center'));
  it('maps right to flex-end', () => expect(horizontalMap.right).toBe('flex-end'));
});

describe('verticalMap', () => {
  it('maps top to flex-start', () => expect(verticalMap.top).toBe('flex-start'));
  it('maps center to center', () => expect(verticalMap.center).toBe('center'));
  it('maps bottom to flex-end', () => expect(verticalMap.bottom).toBe('flex-end'));
});

describe('textAlignMap', () => {
  it('maps left to left', () => expect(textAlignMap.left).toBe('left'));
  it('maps center to center', () => expect(textAlignMap.center).toBe('center'));
  it('maps right to right', () => expect(textAlignMap.right).toBe('right'));
});

describe('resolveAlignment', () => {
  it('resolves center/center', () => {
    expect(resolveAlignment({ horizontalAlignment: 'center', verticalAlignment: 'center' })).toEqual({
      justifyValue: 'center',
      alignValue: 'center',
      textAlignValue: 'center',
    });
  });

  it('resolves left/top', () => {
    expect(resolveAlignment({ horizontalAlignment: 'left', verticalAlignment: 'top' })).toEqual({
      justifyValue: 'flex-start',
      alignValue: 'flex-start',
      textAlignValue: 'left',
    });
  });

  it('resolves right/bottom', () => {
    expect(resolveAlignment({ horizontalAlignment: 'right', verticalAlignment: 'bottom' })).toEqual({
      justifyValue: 'flex-end',
      alignValue: 'flex-end',
      textAlignValue: 'right',
    });
  });
});
