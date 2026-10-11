import { describe, expect, it } from 'vitest';
import { formatEGP, parseEGP } from '../../shared/money';

describe('money', () => {
  it('parses EGP strings into integer piastres', () => {
    expect(parseEGP('1250')).toBe(125000);
    expect(parseEGP('1,250.5')).toBe(125050);
    expect(parseEGP('١٢٥٠')).toBe(125000);
    expect(parseEGP('0')).toBeNull();
    expect(parseEGP('-5')).toBeNull();
    expect(parseEGP('12.345')).toBeNull();
    expect(parseEGP('abc')).toBeNull();
  });
  it('formats with Latin digits in both languages', () => {
    expect(formatEGP(125000, 'en')).toBe('EGP 1,250');
    expect(formatEGP(125050, 'ar')).toBe('1,250.50 ج.م');
  });
});
