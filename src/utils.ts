export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Merchant memory key for bank-email expenses. Strips one payment-processor
 * prefix (`DLC*`, `IZI*`, `PYU*`, `WL *` …: a code, an optional space, a star
 * glued to the name), collapses whitespace and uppercases. A star followed by
 * a space (`ANTHROPIC* CLAUDE SUB`) is the merchant's own descriptor and stays.
 */
export function normalizeMerchant(merchant: string): string {
  const clean = merchant.replace(/\s+/g, ' ').trim().toUpperCase();
  const stripped = clean.replace(/^[A-Z0-9]+ ?\*(?=\S)/, '');
  return stripped || clean;
}
