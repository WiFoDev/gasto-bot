import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── Parse .env directly (bypass config.ts which validates all env vars) ──

function loadEnv(): Record<string, string> {
  const envPath = resolve(import.meta.dirname, '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const vars: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    vars[key] = value;
  }
  return vars;
}

// ── CLI arg parsing ──

function parseArgs(args: string[]): {
  phone: string;
  name: string;
  currency: string;
  timezone: string;
} {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') && i + 1 < args.length) {
      flags[arg.slice(2)] = args[++i];
    }
  }

  if (!flags.phone || !flags.name) {
    console.log(
      'Usage: npm run add-user -- --phone <+phone> --name <name> [--currency <code>] [--timezone <tz>]',
    );
    console.log('');
    console.log('Examples:');
    console.log('  npm run add-user -- --phone +51912345678 --name "Maria"');
    console.log(
      '  npm run add-user -- --phone +1555123456 --name "John" --currency USD --timezone America/New_York',
    );
    process.exit(1);
  }

  if (!flags.phone.startsWith('+')) {
    console.error('Error: phone must start with "+"');
    process.exit(1);
  }

  return {
    phone: flags.phone,
    name: flags.name,
    currency: flags.currency ?? 'PEN',
    timezone: flags.timezone ?? 'America/Lima',
  };
}

// ── Default categories (matches seed.sql) ──

const DEFAULT_CATEGORIES = [
  { name: 'Food & Dining', slug: 'food_dining', icon: '🍽' },
  { name: 'Transport', slug: 'transport', icon: '🚗' },
  { name: 'Groceries', slug: 'groceries', icon: '🛒' },
  { name: 'Entertainment', slug: 'entertainment', icon: '🎬' },
  { name: 'Health', slug: 'health', icon: '💊' },
  { name: 'Shopping', slug: 'shopping', icon: '🛍' },
  { name: 'Bills & Utilities', slug: 'bills_utilities', icon: '💡' },
  { name: 'Education', slug: 'education', icon: '📚' },
  { name: 'Other', slug: 'other', icon: '📌' },
] as const;

// ── Main ──

async function main() {
  const { phone, name, currency, timezone } = parseArgs(process.argv.slice(2));
  const env = loadEnv();

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_KEY must be set in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Insert user
  const { data: user, error: userError } = await supabase
    .from('users')
    .upsert({ phone, name, currency, timezone }, { onConflict: 'phone', ignoreDuplicates: true })
    .select()
    .single();

  if (userError) {
    // If ignoreDuplicates returns no row, fetch existing user
    const { data: existing } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .single();

    if (existing) {
      console.log(
        JSON.stringify({
          event: 'user_exists',
          phone,
          userId: existing.id,
          name: existing.name,
        }),
      );
    } else {
      console.error(JSON.stringify({ event: 'user_insert_error', error: userError.message }));
      process.exit(1);
    }
    return;
  }

  console.log(
    JSON.stringify({ event: 'user_created', userId: user.id, phone, name, currency, timezone }),
  );

  // Insert default categories
  const categoryRows = DEFAULT_CATEGORIES.map((cat) => ({
    user_id: user.id,
    name: cat.name,
    slug: cat.slug,
    icon: cat.icon,
    is_default: true,
  }));

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .upsert(categoryRows, { onConflict: 'user_id,slug', ignoreDuplicates: true })
    .select();

  if (catError) {
    console.error(JSON.stringify({ event: 'categories_insert_error', error: catError.message }));
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      event: 'categories_created',
      userId: user.id,
      count: categories?.length ?? 0,
    }),
  );
}

main();
