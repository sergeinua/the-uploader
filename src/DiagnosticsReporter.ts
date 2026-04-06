import type { OffsetDiagnosis, ChunkState } from './types';

export class DiagnosticsReporter {
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(endpoint: string, headers?: Record<string, string>) {
    // Validate URL format
    try {
      new URL(endpoint);
    } catch {
      throw new Error(`Invalid diagnostics endpoint URL: ${endpoint}`);
    }
    
    this.endpoint = endpoint;
    this.headers = headers ?? {};
  }

  async report(
    uploadId: string,
    diagnosis: OffsetDiagnosis | null,
    lostChunks: ChunkState[]
  ): Promise<void> {
    const userAgent = typeof navigator !== 'undefined' && navigator.userAgent
      ? navigator.userAgent
      : '';
    
    const payload = {
      uploadId,
      timestamp: Date.now(),
      userAgent,
      diagnosis,
      lostChunks,
    };
    
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      // Fire-and-forget - log errors for debugging
      console.warn('[DiagnosticsReporter] Failed to send report:', err);
    }
  }
}
