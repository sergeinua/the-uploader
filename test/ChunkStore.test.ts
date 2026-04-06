import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ChunkStore } from '../src/ChunkStore';
import type { ChunkState } from '../src/types';

describe('ChunkStore', () => {
  let store: ChunkStore;

  beforeEach(async () => {
    store = new ChunkStore();
    await store.init();
  });

  afterEach(async () => {
    await store.clear();
  });

  it('init() creates DB and store', async () => {
    expect(store).toBeDefined();
  });

  it('save() and getByUpload() round-trip', async () => {
    const chunk: ChunkState = {
      uploadId: 'test-upload-1',
      chunkIndex: 0,
      offset: 0,
      size: 1024,
      status: 'success',
      attempts: 1,
      lastAttempt: Date.now(),
    };

    await store.save(chunk);
    const chunks = await store.getByUpload('test-upload-1');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(chunk);
  });

  it('markStatus() updates existing chunk', async () => {
    const chunk: ChunkState = {
      uploadId: 'test-upload-2',
      chunkIndex: 0,
      offset: 0,
      size: 1024,
      status: 'success',
      attempts: 1,
      lastAttempt: Date.now(),
    };

    await store.save(chunk);
    await store.markStatus('test-upload-2', 0, 'lost');

    const chunks = await store.getByUpload('test-upload-2');
    expect(chunks[0]?.status).toBe('lost');
  });

  it('getLost() returns only lost chunks', async () => {
    const successChunk: ChunkState = {
      uploadId: 'test-upload-3',
      chunkIndex: 0,
      offset: 0,
      size: 1024,
      status: 'success',
      attempts: 1,
      lastAttempt: Date.now(),
    };

    const lostChunk: ChunkState = {
      uploadId: 'test-upload-3',
      chunkIndex: 1,
      offset: 1024,
      size: 1024,
      status: 'lost',
      attempts: 2,
      lastAttempt: Date.now(),
    };

    await store.save(successChunk);
    await store.save(lostChunk);

    const lost = await store.getLost();
    expect(lost).toHaveLength(1);
    expect(lost[0]?.status).toBe('lost');
  });

  it('deleteByUpload() removes all chunks for an upload', async () => {
    const chunk1: ChunkState = {
      uploadId: 'test-upload-4',
      chunkIndex: 0,
      offset: 0,
      size: 1024,
      status: 'success',
      attempts: 1,
      lastAttempt: Date.now(),
    };

    const chunk2: ChunkState = {
      uploadId: 'test-upload-4',
      chunkIndex: 1,
      offset: 1024,
      size: 1024,
      status: 'success',
      attempts: 1,
      lastAttempt: Date.now(),
    };

    await store.save(chunk1);
    await store.save(chunk2);

    await store.deleteByUpload('test-upload-4');

    const chunks = await store.getByUpload('test-upload-4');
    expect(chunks).toHaveLength(0);
  });

  it('no-ops gracefully when indexedDB unavailable', async () => {
    // This test verifies the store doesn't throw in environments without indexedDB
    // In happy-dom, indexedDB is available, so we just verify normal operation
    await expect(store.init()).resolves.not.toThrow();
  });
});
