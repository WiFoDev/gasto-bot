import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from './config.js';
import { merchantCategorizerPrompt } from './prompts/merchant-categorizer.js';
import type { Category, MerchantCategorization } from './types.js';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const FALLBACK: MerchantCategorization = {
  category_slug: null,
  suggested_category_name: null,
  description: null,
  confidence: 0,
};

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * ONE Claude call per bank email (only when merchant memory misses).
 * Never throws: any failure returns a zero-confidence result so the caller
 * falls back to `other`.
 */
export async function categorizeMerchant(
  merchant: string,
  amount: number,
  currency: string,
  categories: Category[],
): Promise<MerchantCategorization> {
  const startMs = Date.now();

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0,
      system: merchantCategorizerPrompt(categories),
      messages: [{ role: 'user', content: `Merchant: ${merchant}\nAmount: ${amount} ${currency}` }],
    });

    if (!response.content.length || response.content[0].type !== 'text') {
      throw new Error('Empty or non-text response from AI');
    }

    const parsed = JSON.parse(extractJson(response.content[0].text)) as Record<string, unknown>;

    const rawSlug = asString(parsed.category_slug);
    const category_slug = rawSlug && categories.some((c) => c.slug === rawSlug) ? rawSlug : null;
    const confidence = typeof parsed.confidence === 'number'
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;

    const result: MerchantCategorization = {
      category_slug,
      suggested_category_name: category_slug ? null : asString(parsed.suggested_category_name),
      description: asString(parsed.description),
      confidence,
    };

    console.log(JSON.stringify({
      event: 'categorize_merchant',
      category_slug: result.category_slug,
      confidence: result.confidence,
      latency_ms: Date.now() - startMs,
    }));

    return result;
  } catch (error) {
    console.log(JSON.stringify({
      event: 'categorize_merchant',
      error: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - startMs,
    }));
    return { ...FALLBACK };
  }
}
