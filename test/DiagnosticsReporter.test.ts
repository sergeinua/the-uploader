import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiagnosticsReporter } from '../src/DiagnosticsReporter';
import type { OffsetDiagnosis, ChunkState } from '../src/types';

describe('DiagnosticsReporter', () => {
  let reporter: DiagnosticsReporter;
  const endpoint = 'http://localhost:3001/diagnostics';

  beforeEach(() => {
    reporter = new DiagnosticsReporter(endpoint);
  });

  it('creates reporter instance', () => {
    expect(reporter).toBeDefined();
  });

  it('throws error for invalid URL', () => {
    expect(() => new DiagnosticsReporter('not-a-url')).toThrow(
      'Invalid diagnostics endpoint URL: not-a-url'
    );
  });

  it('sends POST request with correct payload structure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    const uploadId = 'test-upload-1';
    const diagnosis: OffsetDiagnosis = {
      uploadId,
      localOffset: 1024,
      serverOffset: 512,
      lostBytes: 512,
      lostChunkIndexes: [1, 2],
    };
    const lostChunks: ChunkState[] = [
      {
        uploadId,
        chunkIndex: 1,
        offset: 512,
        size: 512,
        status: 'lost',
        attempts: 2,
        lastAttempt: Date.now(),
      },
    ];

    await reporter.report(uploadId, diagnosis, lostChunks);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0]!;
    expect(callArgs[0]).toBe(endpoint);
    expect(callArgs[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Parse and verify body structure
    const body = JSON.parse(callArgs[1]!.body as string);
    expect(body).toMatchObject({
      uploadId,
      timestamp: expect.any(Number),
      diagnosis,
      lostChunks,
    });

    global.fetch = originalFetch;
  });

  it('handles network errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const uploadId = 'test-upload-1';
    await reporter.report(uploadId, null, []);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[DiagnosticsReporter] Failed to send report:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
    global.fetch = originalFetch;
  });

  it('includes custom headers when provided', async () => {
    const reporterWithHeaders = new DiagnosticsReporter(endpoint, {
      'Authorization': 'Bearer token123',
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    const originalFetch = global.fetch;
    global.fetch = mockFetch;

    await reporterWithHeaders.report('test-upload-1', null, []);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0]!;
    expect(callArgs[0]).toBe(endpoint);
    expect(callArgs[1]).toMatchObject({
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token123',
        'Content-Type': 'application/json',
      },
    });
    
    // Parse and verify body structure
    const body = JSON.parse(callArgs[1]!.body as string);
    expect(body).toMatchObject({
      uploadId: 'test-upload-1',
      timestamp: expect.any(Number),
      diagnosis: null,
      lostChunks: [],
    });

    global.fetch = originalFetch;
  });
});
