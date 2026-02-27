import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
);

const EXPECTED_SLUGS = [
  'food_dining',
  'transport',
  'groceries',
  'entertainment',
  'health',
  'shopping',
  'bills_utilities',
  'education',
  'other',
];

describe('seed data verification', () => {
  it('should have a user with phone +51999888777', async () => {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', '+51999888777')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.currency).toBe('PEN');
    expect(data!.timezone).toBe('America/Lima');
  });

  it('should have exactly 9 categories with correct slugs', async () => {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('phone', '+51999888777')
      .single();

    const { data: categories, error } = await supabase
      .from('categories')
      .select('slug, name, icon, is_default')
      .eq('user_id', user!.id);

    expect(error).toBeNull();
    expect(categories).toHaveLength(9);

    const slugs = categories!.map((c) => c.slug).sort();
    expect(slugs).toEqual([...EXPECTED_SLUGS].sort());

    for (const cat of categories!) {
      expect(cat.is_default).toBe(true);
      expect(cat.icon).toBeTruthy();
      expect(cat.name).toBeTruthy();
    }
  });
});
