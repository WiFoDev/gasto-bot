import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, DEFAULT_TIMEZONE } from './config.js';
import { receiptParserPrompt } from './prompts/receipt-parser.js';
import type { ReceiptResult } from './types.js';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

type MediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function makeErrorResult(): ReceiptResult {
  return {
    merchant: null,
    amount: null,
    currency: null,
    date: null,
    confidence: 0,
    items: [],
  };
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1].trim();
  return text.trim();
}

export function detectMediaType(buffer: Buffer): MediaType {
  if (buffer.length < 12) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return 'image/webp';
  }
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
  return 'image/jpeg';
}

export async function parseReceipt(
  imageBuffer: Buffer,
): Promise<ReceiptResult> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
  }).format(new Date());

  const mediaType = detectMediaType(imageBuffer);

  const startMs = Date.now();

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0,
      system: receiptParserPrompt(today),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: 'Extract the receipt data.',
            },
          ],
        },
      ],
    });

    if (!response.content.length || response.content[0].type !== 'text') {
      return makeErrorResult();
    }

    const raw = response.content[0].text;
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as ReceiptResult;
    if (!parsed.items) parsed.items = [];

    console.log(JSON.stringify({
      event: 'parse',
      type: 'receipt',
      confidence: parsed.confidence,
      latency_ms: Date.now() - startMs,
      timestamp: new Date().toISOString(),
    }));

    return parsed;
  } catch (error) {
    console.log(JSON.stringify({
      event: 'parse',
      type: 'receipt',
      confidence: 0,
      latency_ms: Date.now() - startMs,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));

    if (error instanceof SyntaxError) {
      return makeErrorResult();
    }
    return makeErrorResult();
  }
}
