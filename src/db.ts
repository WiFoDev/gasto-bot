import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import type { User, Category, Expense } from './types.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function getUserByPhone(phone: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getCategories(userId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data ?? [];
}

export async function getCategoryBySlug(
  userId: string,
  slug: string,
): Promise<Category | null> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function insertExpense(
  data: Omit<Expense, 'id' | 'deleted_at' | 'created_at'>,
): Promise<Expense> {
  const { data: expense, error } = await supabase
    .from('expenses')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return expense;
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getLastExpense(userId: string): Promise<Expense | null> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateExpense(
  id: string,
  fields: Partial<
    Pick<Expense, 'category_id' | 'amount' | 'currency' | 'description' | 'merchant'>
  >,
): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .update(fields)
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function softDeleteExpense(id: string): Promise<Expense> {
  const { data, error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw error;
  return data;
}
