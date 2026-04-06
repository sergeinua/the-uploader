import type { ChunkState, ChunkStatus, UploadId } from './types';

const DB_NAME = 'tusd-tracker';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

export class ChunkStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db !== null) return;
    if (this.initPromise) return this.initPromise;

    if (typeof indexedDB === 'undefined') {
      // No-op in environments without IndexedDB (Node.js)
      this.db = null;
      this.initPromise = Promise.resolve();
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: ['uploadId', 'chunkIndex'],
          });
          store.createIndex('by-upload', 'uploadId', { unique: false });
          store.createIndex('by-status', 'status', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async save(chunk: ChunkState): Promise<void> {
    if (typeof indexedDB === 'undefined' || this.db === null) return;

    await this.init();
    if (this.db === null) return;

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(chunk);

      request.onsuccess = () => {};
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getByUpload(uploadId: UploadId): Promise<ChunkState[]> {
    if (typeof indexedDB === 'undefined' || this.db === null) return [];
    
    await this.init();
    if (this.db === null) return [];

    return new Promise<ChunkState[]>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by-upload');
      const request = index.getAll(uploadId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async getLost(): Promise<ChunkState[]> {
    if (typeof indexedDB === 'undefined' || this.db === null) return [];
    
    await this.init();
    if (this.db === null) return [];

    return new Promise<ChunkState[]>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by-status');
      const request = index.getAll('lost');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  async markStatus(
    uploadId: UploadId,
    chunkIndex: number,
    status: ChunkStatus
  ): Promise<void> {
    if (typeof indexedDB === 'undefined' || this.db === null) return;
    
    await this.init();
    if (this.db === null) return;

    const existing = await this.get(uploadId, chunkIndex);
    if (existing === undefined) return;

    const updated: ChunkState = { ...existing, status };
    await this.save(updated);
  }

  private async get(
    uploadId: UploadId,
    chunkIndex: number
  ): Promise<ChunkState | undefined> {
    if (typeof indexedDB === 'undefined' || this.db === null) return undefined;
    
    await this.init();
    if (this.db === null) return undefined;

    return new Promise<ChunkState | undefined>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get([uploadId, chunkIndex]);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteByUpload(uploadId: UploadId): Promise<void> {
    if (typeof indexedDB === 'undefined' || this.db === null) return;

    await this.init();
    if (this.db === null) return;

    const chunks = await this.getByUpload(uploadId);
    if (chunks.length === 0) return;

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const chunk of chunks) {
        store.delete([chunk.uploadId, chunk.chunkIndex]);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear(): Promise<void> {
    if (typeof indexedDB === 'undefined' || this.db === null) return;

    await this.init();
    if (this.db === null) return;

    return new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}
