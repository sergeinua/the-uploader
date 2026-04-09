export { TusdTracker } from './TusdTracker';
export { ChunkStore } from './ChunkStore';
export { HealthChecker } from './HealthChecker';
export { DiagnosticsReporter } from './DiagnosticsReporter';
export { SpeedTracker } from './SpeedTracker';
export { buildRetryDelays, waitForOnline } from './RetryScheduler';
export { formatBytes, formatSpeed, formatEta, formatDuration } from './utils/format';
export { generateId } from './utils/uuid';
export { crc32 } from './utils/checksum';

// Export default config values for user reference
export const DEFAULTS = {
  CHUNK_SIZE: 5 * 1024 * 1024,        // 5 MB
  MAX_RETRIES: 5,
  RETRY_BASE_DELAY: 1000,             // 1 second
  RETRY_MAX_DELAY: 30000,             // 30 seconds
  PARALLEL_UPLOADS: 3,
  PERSIST_STATE: true,
  VERIFY_CHECKSUMS: false,
  DEBUG: false,
} as const;

export type {
  TusdTrackerConfig,
  UploadEntry,
  UploadId,
  UploadStatus,
  ChunkState,
  ChunkStateUnion,
  ChunkStatus,
  OffsetDiagnosis,
  DiagnosticsPayload,
  TrackerStats,
  TrackerEventMap,
  TrackerEventName,
  UploadMetadata,
  FileLike,
} from './types';
