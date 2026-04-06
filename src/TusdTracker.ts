import * as tus from 'tus-js-client';
import type {
  TusdTrackerConfig,
  UploadEntry,
  UploadId,
  UploadStatus,
  ChunkState,
  TrackerStats,
  TrackerEventMap,
  TrackerEventName,
  OffsetDiagnosis,
} from './types';
import { ChunkStore } from './ChunkStore';
import { HealthChecker } from './HealthChecker';
import { DiagnosticsReporter } from './DiagnosticsReporter';
import { NetworkMonitor } from './NetworkMonitor';
import { SpeedTracker } from './SpeedTracker';
import { generateId } from './utils/uuid';
import { buildRetryDelays } from './RetryScheduler';

const DEFAULT_CONFIG: {
  chunkSize: number;
  maxRetries: number;
  retryBaseDelay: number;
  retryMaxDelay: number;
  retryJitter: boolean;
  autoResume: boolean;
  parallelUploads: number;
  persistState: boolean;
  diagnosticsEndpoint: string | null;
  headers: Record<string, string>;
} = {
  chunkSize: 5 * 1024 * 1024,
  maxRetries: 5,
  retryBaseDelay: 1000,
  retryMaxDelay: 30000,
  retryJitter: true,
  autoResume: true,
  parallelUploads: 3,
  persistState: true,
  diagnosticsEndpoint: null,
  headers: {},
};

type Listener<K extends TrackerEventName> = (data: TrackerEventMap[K]) => void;

export class TusdTracker {
  private config: TusdTrackerConfig & {
    chunkSize: number;
    maxRetries: number;
    retryBaseDelay: number;
    retryMaxDelay: number;
    retryJitter: boolean;
    autoResume: boolean;
    parallelUploads: number;
    persistState: boolean;
    diagnosticsEndpoint: string | null;
    headers: Record<string, string>;
  };

  private entries: Map<UploadId, UploadEntry> = new Map();
  private queue: UploadId[] = [];
  private tusUploads: Map<UploadId, tus.Upload> = new Map();
  private listeners: Map<TrackerEventName, Set<Listener<TrackerEventName>>> = new Map();
  
  private chunkStore: ChunkStore;
  private speedTracker: SpeedTracker;
  private networkMonitor: NetworkMonitor;
  private healthChecker: HealthChecker;
  private diagnosticsReporter?: DiagnosticsReporter;
  private statsInterval?: number;

  constructor(config: TusdTrackerConfig) {
    // Validate config values
    if (config.parallelUploads !== undefined && config.parallelUploads < 1) {
      throw new Error('parallelUploads must be >= 1');
    }
    if (config.chunkSize !== undefined && config.chunkSize <= 0) {
      throw new Error('chunkSize must be > 0');
    }
    if (config.maxRetries !== undefined && config.maxRetries < 0) {
      throw new Error('maxRetries must be >= 0');
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    this.chunkStore = new ChunkStore();
    this.speedTracker = new SpeedTracker();
    this.healthChecker = new HealthChecker(this.config.headers);
    
    if (this.config.diagnosticsEndpoint) {
      this.diagnosticsReporter = new DiagnosticsReporter(
        this.config.diagnosticsEndpoint,
        this.config.headers
      );
    }

    this.networkMonitor = new NetworkMonitor(
      this.handleOnline,
      this.handleOffline
    );

    if (this.config.persistState) {
      this.chunkStore.init().catch(console.error);
    }

    this.networkMonitor.start();
    this.startStatsInterval();
  }

  private startStatsInterval(): void {
    this.statsInterval = globalThis.setInterval(() => {
      this.emitStats();
    }, 500);
  }

  private handleOnline = (): void => {
    this.emit('network:online', undefined);
    if (this.config.autoResume) {
      this.resumeAll();
    }
  };

  private handleOffline = (): void => {
    this.emit('network:offline', undefined);
  };

  /**
   * Add a new file upload to the queue.
   * @param file - The file to upload (File object or FileLike interface for Node.js)
   * @param metadata - Optional metadata to attach to the upload
   * @returns Array of upload entry IDs
   */
  add(file: File | File[], metadata?: Record<string, string>): UploadId[] {
    const files = Array.isArray(file) ? file : [file];
    const ids: UploadId[] = [];

    for (const f of files) {
      const entry = this.createEntry(f, metadata ?? {});
      this.entries.set(entry.id, entry);
      ids.push(entry.id);
      this.queue.push(entry.id);
    }

    this.emitStats();
    this.drainQueue();
    return ids;
  }

  /**
   * Start upload(s). If uploadId is provided, start that specific upload.
   * Otherwise, drain the queue to start pending uploads.
   * @param uploadId - Optional specific upload ID to start
   */
  start(uploadId?: UploadId): void {
    if (uploadId !== undefined) {
      const entry = this.entries.get(uploadId);
      if (entry && entry.status === 'queued') {
        this.startUpload(uploadId);
      }
    } else {
      this.drainQueue();
    }
  }

  /**
   * Pause a specific upload.
   * @param uploadId - The upload ID to pause
   */
  pause(uploadId: UploadId): void {
    const entry = this.entries.get(uploadId);
    if (!entry || entry.status === 'done' || entry.status === 'failed') return;

    const tusUpload = this.tusUploads.get(uploadId);
    if (tusUpload) {
      void tusUpload.abort(false);
    }

    this.updateEntry(uploadId, { status: 'paused' });
  }

  /**
   * Resume a paused upload. The upload must be in 'paused' status.
   * @param uploadId - The upload ID to resume
   */
  resume(uploadId: UploadId): void {
    const entry = this.entries.get(uploadId);
    if (!entry || entry.status !== 'paused') return;

    const tusUpload = this.tusUploads.get(uploadId);
    if (tusUpload) {
      void tusUpload.start();
      this.updateEntry(uploadId, { status: 'uploading' });
    } else {
      // No existing tusUpload - re-queue
      entry.status = 'queued';
      this.queue.push(uploadId);
      this.drainQueue();
    }
  }

  /**
   * Cancel and remove an upload. This will abort the upload on the server.
   * @param uploadId - The upload ID to cancel
   */
  cancel(uploadId: UploadId): void {
    const entry = this.entries.get(uploadId);
    if (!entry) return;

    const tusUpload = this.tusUploads.get(uploadId);
    if (tusUpload) {
      void tusUpload.abort(true);
      this.tusUploads.delete(uploadId);
    }

    this.entries.delete(uploadId);
    
    if (this.config.persistState) {
      this.chunkStore.deleteByUpload(uploadId).catch(console.error);
    }

    this.speedTracker.reset(uploadId);
    this.emit('entry:cancelled', entry);
    this.emitStats();
  }

  /**
   * Pause all active and queued uploads.
   */
  pauseAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.status === 'uploading' || entry.status === 'queued') {
        this.pause(entry.id);
      }
    }
  }

  /**
   * Resume all paused uploads and start pending uploads from the queue.
   */
  resumeAll(): void {
    const paused = Array.from(this.entries.values())
      .filter((e) => e.status === 'paused')
      .map((e) => e.id);

    for (const id of paused) {
      this.resume(id);
    }
    // drainQueue() is already called by resume() for each entry
  }

  /**
   * Retry all failed uploads. This resets their retry count and re-queues them.
   */
  retryFailed(): void {
    const failed = Array.from(this.entries.values())
      .filter((e) => e.status === 'failed');
    
    for (const entry of failed) {
      entry.status = 'queued';
      entry.retryCount = 0;
      delete entry.error;
      this.queue.push(entry.id);
    }
    
    this.drainQueue();
  }

  /**
   * Remove all completed and cancelled uploads from the entries map.
   */
  clearCompleted(): void {
    const toRemove: UploadId[] = [];
    for (const [id, entry] of this.entries.entries()) {
      if (entry.status === 'done' || entry.status === 'cancelled') {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.entries.delete(id);
    }
    this.emitStats();
  }

  /**
   * Get a snapshot of a specific upload entry.
   * @param uploadId - The upload ID to retrieve
   * @returns Upload entry snapshot or undefined if not found
   */
  getEntry(uploadId: UploadId): UploadEntry | undefined {
    const entry = this.entries.get(uploadId);
    return entry ? { ...entry } : undefined;
  }

  /**
   * Get all upload entries sorted by start time (newest first).
   * @returns Array of upload entry snapshots
   */
  getEntries(): UploadEntry[] {
    return Array.from(this.entries.values())
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  /**
   * Get current upload statistics.
   * @returns Statistics object with upload counts, bytes, and progress
   */
  getStats(): TrackerStats {
    return this.computeStats();
  }

  /**
   * Subscribe to a tracker event.
   * @param event - Event name to listen for
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  on<K extends TrackerEventName>(
    event: K,
    listener: Listener<K>
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set<Listener<TrackerEventName>>());
    }
    this.listeners.get(event)!.add(listener as Listener<TrackerEventName>);
    return () => this.off(event, listener);
  }

  /**
   * Unsubscribe from a tracker event.
   * @param event - Event name to remove listener from
   * @param listener - Callback function to remove
   */
  off<K extends TrackerEventName>(
    event: K,
    listener: Listener<K>
  ): void {
    this.listeners.get(event)?.delete(listener as Listener<TrackerEventName>);
  }

  /**
   * Destroy the tracker, aborting all active uploads and cleaning up resources.
   * This should be called when the tracker is no longer needed.
   */
  destroy(): void {
    // Abort all active uploads (keep server resources)
    for (const tusUpload of this.tusUploads.values()) {
      void tusUpload.abort(false);
    }
    this.tusUploads.clear();

    // Stop network monitor
    this.networkMonitor.stop();

    // Stop stats interval
    if (this.statsInterval !== undefined) {
      clearInterval(this.statsInterval);
    }

    // Clear all listeners
    this.listeners.clear();
  }

  private createEntry(file: File | { name: string; size: number; type: string }, metadata: Record<string, string>): UploadEntry {
    const id = generateId();
    const chunkSize = this.config.chunkSize;
    const bytesTotal = file.size;
    const totalChunks = Math.ceil(bytesTotal / chunkSize);

    return {
      id,
      file,
      status: 'queued',
      bytesTotal,
      bytesUploaded: 0,
      percent: 0,
      chunkSize,
      totalChunks,
      successChunks: 0,
      failedChunks: 0,
      lostChunks: 0,
      startedAt: Date.now(),
      speed: 0,
      eta: 0,
      retryCount: 0,
      metadata,
    };
  }

  private startUpload(uploadId: UploadId): void {
    const entry = this.entries.get(uploadId);
    if (!entry) return;

    this.updateEntry(uploadId, { status: 'uploading' });

    const tusOptions: tus.UploadOptions = {
      endpoint: this.config.endpoint,
      chunkSize: entry.chunkSize,
      retryDelays: this.buildRetryDelays(),
      metadata: {
        filename: entry.file.name,
        filetype: entry.file.type,
        ...entry.metadata,
      },
      headers: this.config.headers,
      onProgress: (bytesUploaded, _bytesTotal) => {
        this.handleProgress(uploadId, bytesUploaded);
      },
      onChunkComplete: (_sent, _previous, _total) => {
        this.handleChunkComplete(uploadId);
      },
      onSuccess: () => {
        this.handleSuccess(uploadId);
      },
      onError: (error: Error) => {
        this.handleError(uploadId, error);
      },
      onBeforeRequest: (req) => {
        req.setHeader('X-Upload-Id', uploadId);
      },
    };

    // Add upload URL if we have it from previous upload
    if (entry.uploadUrl) {
      tusOptions.uploadUrl = entry.uploadUrl;
    }

    const tusUpload = new tus.Upload(entry.file as File | Blob, tusOptions);
    this.tusUploads.set(uploadId, tusUpload);

    // Check for previous uploads
    tusUpload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          tusUpload.resumeFromPreviousUpload(previousUploads[0]!);
        }
        tusUpload.start();
      })
      .catch((err) => {
        console.error('[TusdTracker] Error finding previous uploads:', err);
        console.error('[TusdTracker] Starting upload from scratch due to error');
        // Start from scratch if we can't find previous uploads
        tusUpload.start();
      });
  }

  private handleProgress(uploadId: UploadId, bytesUploaded: number): void {
    const entry = this.entries.get(uploadId);
    if (!entry) return;

    const percent = (bytesUploaded / entry.bytesTotal) * 100;
    this.speedTracker.record(uploadId, bytesUploaded);
    const speed = this.speedTracker.getSpeed(uploadId);
    const eta = this.speedTracker.getEta(uploadId, entry.bytesTotal - bytesUploaded);

    this.updateEntry(uploadId, {
      bytesUploaded,
      percent,
      speed,
      eta: isFinite(eta) ? eta : 0,
    });
  }

  private async handleChunkComplete(uploadId: UploadId): Promise<void> {
    const entry = this.entries.get(uploadId);
    if (!entry) return;

    // Calculate chunk index from bytesUploaded
    const chunkIndex = Math.floor(entry.bytesUploaded / entry.chunkSize);
    
    const chunkState: ChunkState = {
      uploadId,
      chunkIndex,
      offset: entry.bytesUploaded - entry.chunkSize,
      size: Math.min(entry.chunkSize, entry.bytesTotal - (entry.bytesUploaded - entry.chunkSize)),
      status: 'success',
      attempts: 1,
      lastAttempt: Date.now(),
    };

    if (this.config.persistState) {
      await this.chunkStore.save(chunkState);
    }

    this.updateEntry(uploadId, {
      successChunks: entry.successChunks + 1,
    });
  }

  private handleSuccess(uploadId: UploadId): void {
    const entry = this.entries.get(uploadId);
    if (!entry) return;

    this.tusUploads.delete(uploadId);
    this.speedTracker.reset(uploadId);

    this.updateEntry(uploadId, {
      status: 'done',
      finishedAt: Date.now(),
      bytesUploaded: entry.bytesTotal,
      percent: 100,
    });

    // Emit snapshot to prevent mutation of internal state
    const entrySnapshot = { ...entry };
    this.emit('entry:done', entrySnapshot);
    this.drainQueue();

    if (this.config.onComplete) {
      this.config.onComplete(entrySnapshot);
    }
  }

  private async handleError(uploadId: UploadId, error: Error): Promise<void> {
    const entry = this.entries.get(uploadId);
    if (!entry) return;

    entry.retryCount++;

    // Diagnose if we have upload URL
    let diagnosis: OffsetDiagnosis | null = null;
    if (entry.uploadUrl) {
      diagnosis = await this.healthChecker.diagnose(
        uploadId,
        entry.uploadUrl,
        this.chunkStore
      );

      if (diagnosis.lostChunkIndexes.length > 0) {
        this.updateEntry(uploadId, {
          lostChunks: entry.lostChunks + diagnosis.lostChunkIndexes.length,
          offsetDiff: diagnosis.localOffset - diagnosis.serverOffset,
          serverOffset: diagnosis.serverOffset,
        });

        this.emit('chunk:lost', {
          uploadId,
          diagnosis,
        });

        if (this.config.onChunkLost) {
          this.config.onChunkLost(uploadId, diagnosis);
        }

        // Send diagnostics report
        if (this.diagnosticsReporter) {
          const lostChunks = await this.chunkStore.getByUpload(uploadId);
          const lostStates = lostChunks.filter((c) => c.status === 'lost');
          await this.diagnosticsReporter.report(uploadId, diagnosis, lostStates);
        }
      }
    }

    if (entry.retryCount >= this.config.maxRetries) {
      this.tusUploads.delete(uploadId);
      this.speedTracker.reset(uploadId);

      this.updateEntry(uploadId, {
        status: 'failed',
        error: error.message,
      });

      // Emit snapshot to prevent mutation of internal state
      const entrySnapshot = { ...entry };
      this.emit('entry:failed', entrySnapshot);

      if (this.config.onError) {
        this.config.onError(entrySnapshot, error);
      }
    } else {
      this.updateEntry(uploadId, {
        status: 'recovering',
        error: error.message,
      });
      // tus-js-client handles retry via retryDelays
    }
  }

  private drainQueue(): void {
    while (
      this.tusUploads.size < this.config.parallelUploads &&
      this.queue.length > 0
    ) {
      const nextId = this.queue.shift();
      if (nextId) {
        const entry = this.entries.get(nextId);
        if (entry && entry.status === 'queued') {
          this.startUpload(nextId);
        }
      }
    }
  }

  private buildRetryDelays(): number[] {
    return buildRetryDelays(
      this.config.maxRetries,
      this.config.retryBaseDelay,
      this.config.retryMaxDelay,
      this.config.retryJitter
    );
  }

  private computeStats(): TrackerStats {
    const entries = Array.from(this.entries.values());
    
    const stats: TrackerStats = {
      total: 0,
      queued: 0,
      uploading: 0,
      done: 0,
      failed: 0,
      paused: 0,
      totalBytes: 0,
      uploadedBytes: 0,
      overallPercent: 0,
      currentSpeed: 0,
      lostChunksTotal: 0,
    };

    // Single-pass iteration for better performance
    for (const entry of entries) {
      stats.total++;
      
      // Count status - treat 'recovering' as 'uploading' for stats
      if (entry.status === 'uploading' || entry.status === 'recovering') {
        stats.uploading++;
        stats.currentSpeed += entry.speed;
      } else if (entry.status === 'queued' || entry.status === 'done' || 
                 entry.status === 'failed' || entry.status === 'paused' || 
                 entry.status === 'cancelled') {
        stats[entry.status]++;
      }
      
      stats.totalBytes += entry.bytesTotal;
      stats.uploadedBytes += entry.bytesUploaded;
      stats.overallPercent += entry.percent;
      stats.lostChunksTotal += entry.lostChunks;
    }

    // Calculate averages
    if (stats.total > 0) {
      stats.overallPercent /= stats.total;
    }

    return stats;
  }

  private emitStats(): void {
    const stats = this.computeStats();
    this.emit('stats:update', stats);
    if (this.config.onStatsUpdate) {
      this.config.onStatsUpdate(stats);
    }
  }

  private updateEntry(
    uploadId: UploadId,
    patch: Partial<UploadEntry>
  ): void {
    const entry = this.entries.get(uploadId);
    if (!entry) return;

    Object.assign(entry, patch);
    
    // Emit update with snapshot
    this.emit('entry:update', { ...entry });
    
    if (this.config.onProgress) {
      this.config.onProgress({ ...entry });
    }
  }

  private emit<K extends TrackerEventName>(event: K, data: TrackerEventMap[K]): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    for (const listener of listeners) {
      listener(data);
    }
  }
}
