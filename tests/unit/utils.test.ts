import { describe, it, expect } from 'vitest';
import { slugify } from '../../src/utils.js';

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
