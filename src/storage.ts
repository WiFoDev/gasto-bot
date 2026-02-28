import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = 'receipts';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function extensionFromContentType(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
}

export async function downloadImage(
  mediaUrl: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download image: ${response.status} ${response.statusText}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(
      `Image too large: ${(buffer.length / 1_048_576).toFixed(1)}MB (max 5MB)`,
    );
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  return { buffer, contentType };
}

export async function uploadImage(
  buffer: Buffer,
  id: string,
  contentType: string,
): Promise<string> {
  const ext = extensionFromContentType(contentType);
  const path = `${id}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) {
    throw new Error(`Failed to upload to storage: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function downloadAndStore(
  mediaUrl: string,
  expenseId: string,
): Promise<string> {
  const { buffer, contentType } = await downloadImage(mediaUrl);
  return uploadImage(buffer, expenseId, contentType);
}
