import type { UploadId, OffsetDiagnosis } from './types';
import { ChunkStore } from './ChunkStore';

export class HealthChecker {
  private headers: Record<string, string>;

  constructor(headers?: Record<string, string>) {
    this.headers = headers ?? {};
  }

  async getServerOffset(uploadUrl: string): Promise<number | null> {
    try {
      const response = await fetch(uploadUrl, {
        method: 'HEAD',
        headers: {
          'Tus-Resumable': '1.0.0',
          ...this.headers,
        },
      });

      // 404 or other client errors - upload doesn't exist
      if (response.status === 404) {
        return null;
      }

      // Other HTTP errors - return null for non-success responses
      if (!response.ok) {
        return null;
      }

      const offsetHeader = response.headers.get('Upload-Offset');
      if (offsetHeader === null) return 0;

      const offset = parseInt(offsetHeader, 10);
      return isNaN(offset) ? 0 : offset;
    } catch {
      // Network errors - return null to indicate transient failure
      return null;
    }
  }

  async diagnose(
    uploadId: UploadId,
    uploadUrl: string,
    chunkStore: ChunkStore
  ): Promise<OffsetDiagnosis> {
    const serverOffsetResult = await this.getServerOffset(uploadUrl);
    const serverOffset = serverOffsetResult ?? 0;
    const chunks = await chunkStore.getByUpload(uploadId);

    // Calculate local offset (sum of successful chunk sizes)
    let localOffset = 0;
    for (const chunk of chunks) {
      if (chunk.status === 'success') {
        localOffset += chunk.size;
      }
    }

    // Find lost chunks: chunks that should have been received by server
    // but are not marked as success
    const lostChunkIndexes: number[] = [];
    let lostBytes = 0;

    for (const chunk of chunks) {
      // If server offset is past this chunk's end, but chunk isn't success
      if (chunk.status !== 'success' && chunk.offset + chunk.size <= serverOffset) {
        lostChunkIndexes.push(chunk.chunkIndex);
        lostBytes += chunk.size;
        // Mark as lost in store
        await chunkStore.markStatus(uploadId, chunk.chunkIndex, 'lost');
      }
    }

    return {
      uploadId,
      localOffset,
      serverOffset,
      lostBytes,
      lostChunkIndexes,
    };
  }
}
