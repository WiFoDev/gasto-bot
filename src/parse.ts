import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, DEFAULT_TIMEZONE } from './config.js';
import { expenseParserPrompt } from './prompts/expense-parser.js';
import type { Category, ParseResult } from './types.js';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function makeErrorResult(message: string): ParseResult {
  return {
    intent: 'error',
    confidence: 0,
    amount: null,
    currency: null,
    category_slug: null,
    description: null,
    merchant: null,
    date: null,
    period: null,
    correction_field: null,
    error_message: message,
  };
}

function extractJson(text: string): string {
  // Strip markdown code fences if present
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

export async function parseMessage(
  text: string,
  categories: Category[],
): Promise<ParseResult> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date()); // en-CA gives YYYY-MM-DD format

  const systemPrompt = expenseParserPrompt(categories, today);

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    });

    if (!response.content.length || response.content[0].type !== 'text') {
      return makeErrorResult('Empty or non-text response from AI');
    }

    const raw = response.content[0].text;
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as ParseResult;

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return makeErrorResult('Failed to parse AI response as JSON');
    }
    const message =
      error instanceof Error ? error.message : 'Unknown error during parsing';
    return makeErrorResult(message);
  }
}
