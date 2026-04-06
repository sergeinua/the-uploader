export type UploadId = string;

export type ChunkStatus = 'pending' | 'uploading' | 'success' | 'failed' | 'lost';

export type UploadStatus =
  | 'queued'
  | 'uploading'
  | 'paused'
  | 'recovering'
  | 'done'
  | 'failed'
  | 'cancelled';

/**
 * File-like interface compatible with both browser File and Node.js file objects.
 * Provides the minimum required properties for upload tracking.
 */
export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export interface ChunkState {
  uploadId: UploadId;
  chunkIndex: number;
  offset: number;
  size: number;
  status: ChunkStatus;
  attempts: number;
  lastAttempt: number;   // unix ms
  checksum?: string;     // optional CRC32 hex
  error?: string;
}

export interface UploadEntry {
  id: UploadId;
  file: File | FileLike;
  uploadUrl?: string;          // set after tusd creates the upload
  status: UploadStatus;
  bytesTotal: number;
  bytesUploaded: number;
  percent: number;             // 0–100
  chunkSize: number;
  totalChunks: number;
  successChunks: number;
  failedChunks: number;
  lostChunks: number;          // count of confirmed lost chunks
  startedAt: number;           // unix ms
  finishedAt?: number;
  speed: number;               // bytes/sec (rolling average)
  eta: number;                 // seconds remaining
  retryCount: number;
  serverOffset?: number;       // last confirmed HEAD offset
  offsetDiff?: number;         // localOffset − serverOffset
  error?: string;
  metadata: Record<string, string>;
}

export interface OffsetDiagnosis {
  uploadId: UploadId;
  localOffset: number;
  serverOffset: number;
  lostBytes: number;
  lostChunkIndexes: number[];
}

export interface DiagnosticsPayload {
  uploadId: UploadId;
  timestamp: number;
  userAgent: string;
  diagnosis: OffsetDiagnosis | null;
  lostChunks: ChunkState[];
}

export interface TrackerStats {
  total: number;
  queued: number;
  uploading: number;
  done: number;
  failed: number;
  paused: number;
  totalBytes: number;
  uploadedBytes: number;
  overallPercent: number;
  currentSpeed: number;        // sum of active upload speeds
  lostChunksTotal: number;
}

export interface TusdTrackerConfig {
  endpoint: string;                       // tusd server URL
  chunkSize?: number;                     // default: 5 * 1024 * 1024 (5 MB)
  maxRetries?: number;                    // default: 5
  retryBaseDelay?: number;               // default: 1000 ms
  retryMaxDelay?: number;                // default: 30000 ms
  retryJitter?: boolean;                 // default: true
  autoResume?: boolean;                  // default: true (resume on 'online')
  parallelUploads?: number;             // default: 3
  persistState?: boolean;               // default: true (IndexedDB)
  diagnosticsEndpoint?: string | null;   // optional POST URL
  headers?: Record<string, string>;     // extra headers for all tus requests
  onProgress?: (entry: UploadEntry) => void;
  onComplete?: (entry: UploadEntry) => void;
  onError?: (entry: UploadEntry, error: Error) => void;
  onChunkLost?: (uploadId: UploadId, diagnosis: OffsetDiagnosis) => void;
  onStatsUpdate?: (stats: TrackerStats) => void;
}

// Event emitter types — for subscribe() API
export type TrackerEventMap = {
  'entry:update': UploadEntry;
  'entry:done': UploadEntry;
  'entry:failed': UploadEntry;
  'entry:cancelled': UploadEntry;
  'stats:update': TrackerStats;
  'chunk:lost': { uploadId: UploadId; diagnosis: OffsetDiagnosis };
  'network:online': void;
  'network:offline': void;
};

export type TrackerEventName = keyof TrackerEventMap;
