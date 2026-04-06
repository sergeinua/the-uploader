import type { UploadOptions } from 'tus-js-client';

export interface MockTusServerConfig {
  failAt?: number;      // Fail at this chunk index
  dropConnection?: boolean;
}

interface MockUpload {
  offset: number;
  size: number;
  data: Uint8Array[];
  metadata: Record<string, string>;
  failAt?: number;           // Per-upload failure point
  dropConnection?: boolean;  // Per-upload connection drop flag
}

export class MockTusServer {
  private uploads: Map<string, MockUpload> = new Map();

  // Global fallback settings (deprecated, kept for backwards compatibility)
  private globalFailAt?: number;
  private globalDropConnection = false;

  /**
   * Configure a specific upload to fail at a given chunk index.
   */
  setFailAt(uploadUrl: string, chunkIndex?: number): void {
    const upload = this.uploads.get(uploadUrl);
    if (upload) {
      upload.failAt = chunkIndex;
    } else {
      // Fallback to global for backwards compatibility
      this.globalFailAt = chunkIndex;
    }
  }

  /**
   * Configure a specific upload to drop connection on next request.
   */
  dropConnection(uploadUrl: string): void {
    const upload = this.uploads.get(uploadUrl);
    if (upload) {
      upload.dropConnection = true;
    } else {
      // Fallback to global for backwards compatibility
      this.globalDropConnection = true;
    }
  }

  /**
   * Legacy API - sets global drop connection flag.
   * @deprecated Use dropConnection(uploadUrl) instead
   */
  setDropConnection(value: boolean): void {
    this.globalDropConnection = value;
  }

  getServerOffset(uploadUrl: string): number {
    const upload = this.uploads.get(uploadUrl);
    return upload?.offset ?? 0;
  }

  createUpload(size: number, metadata: Record<string, string>): string {
    const uploadUrl = `http://localhost:1080/files/${Date.now()}-${Math.random()}`;
    this.uploads.set(uploadUrl, {
      offset: 0,
      size,
      data: [],
      metadata,
    });
    return uploadUrl;
  }

  /**
   * Simulate tus-js-client PATCH request.
   * Returns success status and error if any.
   */
  simulateUpload(
    uploadUrl: string,
    chunkIndex: number,
    chunkSize: number
  ): { success: boolean; error?: Error; serverOffset?: number } {
    const upload = this.uploads.get(uploadUrl);
    if (!upload) {
      return { success: false, error: new Error('Upload not found') };
    }

    // Check for connection drop
    if (upload.dropConnection || this.globalDropConnection) {
      upload.dropConnection = false; // Reset after triggering
      this.globalDropConnection = false;
      return { success: false, error: new Error('Connection dropped') };
    }

    // Check for configured failure
    if (upload.failAt === chunkIndex || this.globalFailAt === chunkIndex) {
      upload.failAt = undefined; // Reset after triggering
      this.globalFailAt = undefined;
      return { success: false, error: new Error('Simulated failure') };
    }

    const offset = chunkIndex * chunkSize;
    const remaining = upload.size - offset;
    const actualChunkSize = Math.min(chunkSize, remaining);

    upload.offset = offset + actualChunkSize;
    return { success: true };
  }

  /**
   * Reset all uploads and settings.
   */
  reset(): void {
    this.uploads.clear();
    this.globalFailAt = undefined;
    this.globalDropConnection = false;
  }

  /**
   * Get upload info for verification.
   */
  getUploadInfo(uploadUrl: string): { offset: number; size: number; exists: boolean } {
    const upload = this.uploads.get(uploadUrl);
    if (!upload) {
      return { offset: 0, size: 0, exists: false };
    }
    return { offset: upload.offset, size: upload.size, exists: true };
  }

  /**
   * Get all recorded chunks for an upload.
   */
  getChunks(uploadUrl: string): Array<{ offset: number; size: number }> {
    const upload = this.uploads.get(uploadUrl);
    if (!upload) return [];
    const chunks: Array<{ offset: number; size: number }> = [];
    let currentOffset = 0;
    for (const data of upload.data) {
      chunks.push({ offset: currentOffset, size: data.length });
      currentOffset += data.length;
    }
    return chunks;
  }

  /**
   * Check if upload is complete.
   */
  isComplete(uploadUrl: string): boolean {
    const upload = this.uploads.get(uploadUrl);
    return upload?.offset === upload.size;
  }
}

export function createMockTusOptions(
  server: MockTusServer,
  options: Partial<UploadOptions>
): Partial<UploadOptions> {
  return {
    ...options,
    onBeforeRequest: (req) => {
      // Mock request object
      const headers: Record<string, string> = {};
      return {
        setHeader: (key: string, value: string) => {
          headers[key] = value;
        },
        getHeader: (key: string) => headers[key],
      };
    },
  };
}
