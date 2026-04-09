import type { UploadId, OffsetDiagnosis } from './types';
import { ChunkStore } from './ChunkStore';

export class HealthChecker {
  private headers: Record<string, string>;

  constructor(headers?: Record<string, string>) {
    this.headers = headers ?? {};
  }

  async getServerOffset(uploadUrl: string): Promise<number | undefined> {
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
        return undefined;
      }

      // Other HTTP errors - return undefined for non-success responses
      if (!response.ok) {
        return undefined;
      }

      const offsetHeader = response.headers.get('Upload-Offset');
      if (offsetHeader === null) return 0;

      const offset = parseInt(offsetHeader, 10);
      return isNaN(offset) ? 0 : offset;
    } catch {
      // Network errors - return undefined to indicate transient failure
      return undefined;
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
    const markErrors: Array<{ chunkIndex: number; error: unknown }> = [];

    for (const chunk of chunks) {
      // If server offset is past this chunk's end, but chunk isn't success
      if (chunk.status !== 'success' && chunk.offset + chunk.size <= serverOffset) {
        lostChunkIndexes.push(chunk.chunkIndex);
        lostBytes += chunk.size;
        // Mark as lost in store
        try {
          await chunkStore.markStatus(uploadId, chunk.chunkIndex, 'lost');
        } catch (error) {
          markErrors.push({ chunkIndex: chunk.chunkIndex, error });
          console.error(
            `[HealthChecker] Failed to mark chunk ${chunk.chunkIndex} as lost:`,
            error
          );
        }
      }
    }

    // Log if there were marking errors
    if (markErrors.length > 0) {
      console.warn(
        `[HealthChecker] ${markErrors.length} chunk(s) failed to be marked as lost`
      );
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
