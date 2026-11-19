import { describe, it, expect } from 'vitest';
import { slugify, normalizeMerchant } from '../../src/utils.js';

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('COMIDA')).toBe('comida');
  });

  it('replaces spaces with underscores', () => {
    expect(slugify('Gym & Fitness')).toBe('gym_fitness');
  });

  it('passes through simple lowercase words', () => {
    expect(slugify('Mascotas')).toBe('mascotas');
  });

  it('removes accents', () => {
    expect(slugify('Café/Snack')).toBe('cafe_snack');
  });

  it('replaces special characters with underscores', () => {
    expect(slugify('Bills & Utilities')).toBe('bills_utilities');
  });

  it('collapses multiple underscores', () => {
    expect(slugify('food -- dining')).toBe('food_dining');
  });

  it('trims leading and trailing underscores', () => {
    expect(slugify('  hello  ')).toBe('hello');
    expect(slugify('--test--')).toBe('test');
  });

  it('handles accented characters', () => {
    expect(slugify('Educación')).toBe('educacion');
    expect(slugify('Música')).toBe('musica');
    expect(slugify('Línea de Crédito')).toBe('linea_de_credito');
  });

  it('truncates to 40 characters', () => {
    const long = 'a'.repeat(50);
    expect(slugify(long)).toBe('a'.repeat(40));
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles string with only special characters', () => {
    expect(slugify('&&&')).toBe('');
  });

  it('handles slashes', () => {
    expect(slugify('Food/Drinks')).toBe('food_drinks');
  });

  it('handles ñ correctly', () => {
    expect(slugify('Niños')).toBe('ninos');
  });
});

describe('normalizeMerchant', () => {
  // Real BCP "Empresa" strings
  it.each([
    ['DLC*UBER RIDES', 'UBER RIDES'],
    ['IZI*X3 PADEL CLUB', 'X3 PADEL CLUB'],
    ['PYU*UBER', 'UBER'],
    ['PYU*Cabify PE', 'CABIFY PE'],
    ['Rapyd*Cabify PE', 'CABIFY PE'],
    ['WL *STEAM PURCHASE', 'STEAM PURCHASE'],
    ['MDOPAGO*FREEPASS', 'FREEPASS'],
    ['OPENPAY*TERAPIAS CV SALIM', 'TERAPIAS CV SALIM'],
  ])('strips the payment-processor prefix: %s → %s', (input, expected) => {
    expect(normalizeMerchant(input)).toBe(expected);
  });

  it.each([
    ['CABIFY PE', 'CABIFY PE'],
    ['E WONG BENAVIDES', 'E WONG BENAVIDES'],
    ['APPLE.COM/BILL', 'APPLE.COM/BILL'],
    ['One padel Orue', 'ONE PADEL ORUE'],
  ])('leaves merchants without a prefix alone (uppercased): %s', (input, expected) => {
    expect(normalizeMerchant(input)).toBe(expected);
  });

  it('makes processor variants of the same merchant equal', () => {
    expect(normalizeMerchant('PYU*Cabify PE')).toBe(normalizeMerchant('CABIFY PE'));
  });

  it('collapses and trims whitespace', () => {
    expect(normalizeMerchant('  DLC*UBER    RIDES  ')).toBe('UBER RIDES');
  });

  it('only strips one prefix', () => {
    expect(normalizeMerchant('DLC*IZI*FOO')).toBe('IZI*FOO');
  });

  it('keeps the original when stripping would leave nothing', () => {
    expect(normalizeMerchant('DLC*')).toBe('DLC*');
  });

  it('does not strip "NAME* PRODUCT" (space after the star)', () => {
    // Card-network descriptor convention: the merchant itself, not a processor code
    expect(normalizeMerchant('ANTHROPIC* CLAUDE SUB')).toBe('ANTHROPIC* CLAUDE SUB');
  });
});
