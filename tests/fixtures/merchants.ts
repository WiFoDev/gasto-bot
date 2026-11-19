/**
 * Real BCP "Empresa" strings with categories hand-labeled by the user
 * (2026-11-19) against their own categories (GATE #5). Merchants whose
 * category can't be inferred from the name alone (store codes, a podologist
 * named "LIMABLUE") were left out on purpose: those fall back to `other`
 * and merchant memory takes over after the first WhatsApp correction.
 */

export interface MerchantFixture {
  merchant: string;
  amount: number;
  currency: 'PEN' | 'USD';
  expected_slug: string;
}

export const MERCHANT_FIXTURES: MerchantFixture[] = [
  // Transport
  { merchant: 'DLC*UBER RIDES', amount: 22.9, currency: 'PEN', expected_slug: 'transport' },
  { merchant: 'PYU*UBER', amount: 15.5, currency: 'PEN', expected_slug: 'transport' },
  { merchant: 'PYU*Cabify PE', amount: 18.9, currency: 'PEN', expected_slug: 'transport' },
  // Food & dining
  { merchant: 'SAN MARCELO RESTAURANTE', amount: 64, currency: 'PEN', expected_slug: 'food_dining' },
  { merchant: 'SHIMAYA RAMEN AURORA', amount: 52, currency: 'PEN', expected_slug: 'food_dining' },
  { merchant: 'NEIRA CAFE LAB', amount: 34, currency: 'PEN', expected_slug: 'food_dining' },
  { merchant: 'IZI*LATTE BAKERY EL POL', amount: 21.5, currency: 'PEN', expected_slug: 'food_dining' },
  { merchant: 'LA MORA', amount: 28, currency: 'PEN', expected_slug: 'food_dining' },
  { merchant: 'DLC*RAPPI PERU', amount: 46.7, currency: 'PEN', expected_slug: 'food_dining' },
  // Sports (user category "Deportes")
  { merchant: 'ONE PADEL TRIGAL', amount: 60, currency: 'PEN', expected_slug: 'deportes' },
  { merchant: 'One padel Orue', amount: 55, currency: 'PEN', expected_slug: 'deportes' },
  { merchant: 'IZI*X3 PADEL CLUB', amount: 57.75, currency: 'PEN', expected_slug: 'deportes' },
  // Groceries
  { merchant: 'E WONG BENAVIDES', amount: 142.3, currency: 'PEN', expected_slug: 'groceries' },
  { merchant: 'OXXO ARONA', amount: 12.5, currency: 'PEN', expected_slug: 'groceries' },
  // Subscriptions (user category "Suscripciones")
  { merchant: 'AMAZON PRIME PMTS', amount: 14.99, currency: 'USD', expected_slug: 'suscripciones' },
  { merchant: 'APPLE.COM/BILL', amount: 1.16, currency: 'USD', expected_slug: 'suscripciones' },
  { merchant: 'RAILWAY', amount: 5, currency: 'USD', expected_slug: 'suscripciones' },
  { merchant: 'ANTHROPIC* CLAUDE SUB', amount: 23.6, currency: 'USD', expected_slug: 'suscripciones' },
  // Entertainment
  { merchant: 'WL *STEAM PURCHASE', amount: 30.52, currency: 'USD', expected_slug: 'entertainment' },
  { merchant: 'PYU*CINEPLANET', amount: 86, currency: 'PEN', expected_slug: 'entertainment' },
  // Health
  { merchant: 'OPENPAY*TERAPIAS CV SALIM', amount: 150, currency: 'PEN', expected_slug: 'health' },
  // Shopping (Mercado Pago → Mercado Libre purchase)
  { merchant: 'MDOPAGO*FREEPASS', amount: 389, currency: 'PEN', expected_slug: 'shopping' },
];

/** The user's real category set (production, 2026-11-19). */
export const USER_CATEGORY_SEED: Array<{ slug: string; name: string; icon: string }> = [
  { slug: 'food_dining', name: 'Food & Dining', icon: '🍽' },
  { slug: 'transport', name: 'Transport', icon: '🚗' },
  { slug: 'groceries', name: 'Groceries', icon: '🛒' },
  { slug: 'entertainment', name: 'Entertainment', icon: '🎬' },
  { slug: 'health', name: 'Health', icon: '💊' },
  { slug: 'shopping', name: 'Shopping', icon: '🛍' },
  { slug: 'bills_utilities', name: 'Bills & Utilities', icon: '💡' },
  { slug: 'education', name: 'Education', icon: '📚' },
  { slug: 'other', name: 'Other', icon: '📌' },
  { slug: 'deportes', name: 'Deportes', icon: '🎾' },
  { slug: 'suscripciones', name: 'Suscripciones', icon: '🔁' },
  { slug: 'salidas', name: 'Salidas', icon: '🍻' },
  { slug: 'cuidado_personal', name: 'Cuidado Personal', icon: '💈' },
  { slug: 'familia', name: 'Familia', icon: '👨‍👩‍👧' },
];
