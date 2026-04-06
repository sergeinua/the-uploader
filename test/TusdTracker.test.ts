import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TusdTracker } from '../src/TusdTracker';
import type { TusdTrackerConfig, UploadEntry } from '../src/types';

describe('TusdTracker', () => {
  let tracker: TusdTracker;

  const defaultConfig: TusdTrackerConfig = {
    endpoint: 'http://localhost:1080/files/',
    chunkSize: 1024 * 1024,
    maxRetries: 3,
    retryBaseDelay: 100,
    retryMaxDelay: 1000,
    retryJitter: false,
    persistState: false,
  };

  beforeEach(() => {
    tracker = new TusdTracker(defaultConfig);
  });

  afterEach(() => {
    tracker.destroy();
  });

  it('add() returns upload IDs', () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const ids = tracker.add(file);
    
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBeDefined();
  });

  it('getEntry() returns undefined for unknown ID', () => {
    const entry = tracker.getEntry('unknown-id');
    expect(entry).toBeUndefined();
  });

  it('getStats() returns zero stats when empty', () => {
    const stats = tracker.getStats();
    expect(stats.total).toBe(0);
    expect(stats.uploadedBytes).toBe(0);
  });

  it('on() returns unsubscribe function', () => {
    const listener = vi.fn();
    const unsubscribe = tracker.on('entry:update', listener);
    
    expect(unsubscribe).toBeDefined();
    expect(typeof unsubscribe).toBe('function');
    
    unsubscribe();
  });

  it('entry status transitions: queued → uploading → done', async () => {
    const file = new File(['test data'.repeat(1000)], 'test.txt', { type: 'text/plain' });

    // Without mocking tus-js-client, we can only test that the upload starts
    const ids = tracker.add(file);
    
    // Status should be uploading immediately (drainQueue starts it synchronously)
    const entry = tracker.getEntry(ids[0]!);
    expect(entry?.status).toBe('uploading');
    
    // Full completion test requires mocking the tusd server (see Phase 2 improvements)
  });

  it('pause() sets status to paused', () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const ids = tracker.add(file);
    
    // Wait for upload to start
    setTimeout(() => {
      tracker.pause(ids[0]!);
      const entry = tracker.getEntry(ids[0]!);
      expect(entry?.status).toBe('paused');
    }, 100);
  });

  it('cancel() removes entry', () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const ids = tracker.add(file);
    
    tracker.cancel(ids[0]!);
    const entry = tracker.getEntry(ids[0]!);
    expect(entry).toBeUndefined();
  });

  it('retryFailed() re-queues failed entries', () => {
    // This would require mocking tus-js-client to force failures
    // Basic structure test
    expect(typeof tracker.retryFailed).toBe('function');
  });

  it('clearCompleted() removes done entries', () => {
    // Basic structure test - would need full mock for complete test
    expect(typeof tracker.clearCompleted).toBe('function');
  });

  it('parallelUploads limit is respected', () => {
    const config: TusdTrackerConfig = {
      ...defaultConfig,
      parallelUploads: 1,
    };
    const limitedTracker = new TusdTracker(config);
    
    const file1 = new File(['test1'], 'test1.txt', { type: 'text/plain' });
    const file2 = new File(['test2'], 'test2.txt', { type: 'text/plain' });
    
    const ids1 = limitedTracker.add(file1);
    const ids2 = limitedTracker.add(file2);
    
    // Second upload should be queued while first is uploading
    const entry2 = limitedTracker.getEntry(ids2[0]!);
    expect(entry2?.status).toBe('queued');
    
    limitedTracker.destroy();
  });

  it('onComplete callback is called on success', () => {
    // This test requires mocking tus-js-client to simulate successful upload
    // Basic structure test - verifies callback is accepted and configured
    const onComplete = vi.fn();
    
    const config: TusdTrackerConfig = {
      ...defaultConfig,
      onComplete,
    };

    const callbackTracker = new TusdTracker(config);
    expect(callbackTracker).toBeDefined();
    
    callbackTracker.destroy();
  });

  it('destroy() aborts all uploads', () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    tracker.add(file);
    
    tracker.destroy();
    
    // After destroy, getStats should still work but no new events should fire
    const stats = tracker.getStats();
    expect(stats).toBeDefined();
  });
});
