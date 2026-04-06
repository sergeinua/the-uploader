import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealthChecker } from '../src/HealthChecker';
import { ChunkStore } from '../src/ChunkStore';

describe('HealthChecker', () => {
  let healthChecker: HealthChecker;
  let chunkStore: ChunkStore;

  beforeEach(async () => {
    healthChecker = new HealthChecker();
    chunkStore = new ChunkStore();
    await chunkStore.init();
    await chunkStore.clear();
  });

  it('getServerOffset returns null on fetch failure', async () => {
    const offset = await healthChecker.getServerOffset('http://invalid-url/');
    expect(offset).toBeNull();
  });

  it('getServerOffset parses Upload-Offset header', async () => {
    // Mock fetch for successful HEAD request
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => {
          if (name === 'Upload-Offset') return '1024';
          return null;
        },
      },
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch as any;

    const offset = await healthChecker.getServerOffset('http://example.com/upload/123');
    expect(offset).toBe(1024);

    global.fetch = originalFetch;
  });

  it('getServerOffset returns 0 when Upload-Offset missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => null,
      },
    });

    const originalFetch = global.fetch;
    global.fetch = mockFetch as any;

    const offset = await healthChecker.getServerOffset('http://example.com/upload/123');
    expect(offset).toBe(0);

    global.fetch = originalFetch;
  });
});
