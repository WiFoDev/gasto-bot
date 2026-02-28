import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock references
let mockUpload: ReturnType<typeof vi.fn>;
let mockGetPublicUrl: ReturnType<typeof vi.fn>;

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
      }),
    },
  }),
}));

// Mock config to avoid env var validation
vi.mock('../../src/config.js', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_KEY: 'test-key',
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { downloadAndStore } from '../../src/storage.js';

function createMockResponse(body: Buffer, contentType = 'image/jpeg', ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: () => Promise.resolve(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)),
  } as unknown as Response;
}

describe('downloadAndStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload = vi.fn();
    mockGetPublicUrl = vi.fn();
  });

  it('downloads, uploads, and returns public URL', async () => {
    const imageBuffer = Buffer.from('fake-image-data');
    mockFetch.mockResolvedValueOnce(createMockResponse(imageBuffer));

    mockUpload.mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/receipts/exp-1.jpg' },
    });

    const url = await downloadAndStore('https://kapso.example.com/media/img1', 'exp-1');

    expect(mockFetch).toHaveBeenCalledWith('https://kapso.example.com/media/img1');
    expect(mockUpload).toHaveBeenCalledWith(
      'exp-1.jpg',
      expect.any(Buffer),
      { contentType: 'image/jpeg', upsert: true },
    );
    expect(url).toBe('https://test.supabase.co/storage/v1/object/public/receipts/exp-1.jpg');
  });

  it('uses correct extension for PNG content type', async () => {
    const imageBuffer = Buffer.from('fake-png-data');
    mockFetch.mockResolvedValueOnce(createMockResponse(imageBuffer, 'image/png'));

    mockUpload.mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/receipts/exp-2.png' },
    });

    await downloadAndStore('https://kapso.example.com/media/img2', 'exp-2');

    expect(mockUpload).toHaveBeenCalledWith(
      'exp-2.png',
      expect.any(Buffer),
      { contentType: 'image/png', upsert: true },
    );
  });

  it('uses correct extension for WebP content type', async () => {
    const imageBuffer = Buffer.from('fake-webp-data');
    mockFetch.mockResolvedValueOnce(createMockResponse(imageBuffer, 'image/webp'));

    mockUpload.mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/receipts/exp-3.webp' },
    });

    await downloadAndStore('https://kapso.example.com/media/img3', 'exp-3');

    expect(mockUpload).toHaveBeenCalledWith(
      'exp-3.webp',
      expect.any(Buffer),
      { contentType: 'image/webp', upsert: true },
    );
  });

  it('throws on failed download (expired URL)', async () => {
    mockFetch.mockResolvedValueOnce(
      createMockResponse(Buffer.alloc(0), 'text/html', false, 404),
    );

    await expect(
      downloadAndStore('https://kapso.example.com/media/expired', 'exp-4'),
    ).rejects.toThrow('Failed to download image: 404 Not Found');
  });

  it('throws on oversized image (>5MB)', async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024); // 6 MB
    mockFetch.mockResolvedValueOnce(createMockResponse(oversized));

    await expect(
      downloadAndStore('https://kapso.example.com/media/huge', 'exp-5'),
    ).rejects.toThrow('Image too large');
  });

  it('throws on Supabase upload failure', async () => {
    const imageBuffer = Buffer.from('fake-image-data');
    mockFetch.mockResolvedValueOnce(createMockResponse(imageBuffer));

    mockUpload.mockResolvedValueOnce({
      error: { message: 'Bucket not found' },
    });

    await expect(
      downloadAndStore('https://kapso.example.com/media/img6', 'exp-6'),
    ).rejects.toThrow('Failed to upload to storage: Bucket not found');
  });

  it('defaults to JPEG when content-type header is missing', async () => {
    const imageBuffer = Buffer.from('no-content-type');
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      arrayBuffer: () => Promise.resolve(imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength)),
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(response);

    mockUpload.mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/receipts/exp-7.jpg' },
    });

    await downloadAndStore('https://kapso.example.com/media/img7', 'exp-7');

    expect(mockUpload).toHaveBeenCalledWith(
      'exp-7.jpg',
      expect.any(Buffer),
      { contentType: 'image/jpeg', upsert: true },
    );
  });

  it('accepts images exactly at 5MB limit', async () => {
    const exactLimit = Buffer.alloc(5 * 1024 * 1024); // Exactly 5 MB
    mockFetch.mockResolvedValueOnce(createMockResponse(exactLimit));

    mockUpload.mockResolvedValueOnce({ error: null });
    mockGetPublicUrl.mockReturnValueOnce({
      data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/receipts/exp-8.jpg' },
    });

    const url = await downloadAndStore('https://kapso.example.com/media/img8', 'exp-8');
    expect(url).toBeTruthy();
  });
});
