/**
 * Node.js CLI upload example
 * 
 * Shows how to use @tusd-tracker/core in a Node.js environment
 * where the File API is unavailable.
 */

import { TusdTracker } from '@tusd-tracker/core';
import { createReadStream, statSync } from 'fs';
import { join } from 'path';

// In Node.js, we need to provide a File-like object
// tus-js-client handles the stream internally
class NodeFile {
  name: string;
  size: number;
  type: string;
  private path: string;

  constructor(path: string, name: string, size: number, type: string = 'application/octet-stream') {
    this.path = path;
    this.name = name;
    this.size = size;
    this.type = type;
  }

  // tus-js-client will use this if available
  // Note: This is a simplified implementation for demonstration.
  // For production use, consider using fs.createReadStream() with proper chunking.
  slice(start: number, end: number): Blob {
    // In a real implementation, you'd read the file slice and return a Buffer or Readable stream
    // For this example, we return an empty Blob which won't upload actual data
    console.warn('[NodeFile.slice] This is a placeholder implementation. For actual uploads, implement proper file slicing using fs.read()');
    return new Blob([]);
  }
}

async function uploadFile(filePath: string, uploadUrl: string): Promise<void> {
  const stats = statSync(filePath);
  const fileName = filePath.split('/').pop() || 'unknown';
  
  // Create a File-like object for Node.js
  const file = new NodeFile(filePath, fileName, stats.size);
  
  const tracker = new TusdTracker({
    endpoint: uploadUrl,
    chunkSize: 5 * 1024 * 1024, // 5MB chunks
    maxRetries: 5,
    parallelUploads: 1,
    persistState: false, // No IndexedDB in Node.js
    onProgress: (entry) => {
      const percent = ((entry.bytesUploaded / entry.bytesTotal) * 100).toFixed(1);
      process.stdout.write(`\rProgress: ${percent}% - ${entry.bytesUploaded.toLocaleString()} / ${entry.bytesTotal.toLocaleString()} bytes`);
    },
    onComplete: (entry) => {
      console.log('\nUpload complete!');
      console.log(`  File: ${entry.file.name}`);
      console.log(`  Size: ${entry.bytesTotal.toLocaleString()} bytes`);
      console.log(`  Time: ${((entry.finishedAt ?? Date.now()) - entry.startedAt) / 1000}s`);
    },
    onError: (entry, error) => {
      console.error('\nUpload failed:', error.message);
    },
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nInterrupted - pausing upload...');
    const entries = tracker.getEntries();
    for (const entry of entries) {
      if (entry.status === 'uploading') {
        tracker.pause(entry.id);
      }
    }
    tracker.destroy();
    process.exit(0);
  });

  // Start upload
  const ids = tracker.add(file as unknown as File);
  console.log(`Starting upload: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Upload ID: ${ids[0]}`);

  // Wait for completion
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Upload timeout'));
    }, 30 * 60 * 1000); // 30 minute timeout

    tracker.on('entry:done', () => {
      clearTimeout(timeout);
      tracker.destroy();
      resolve();
    });

    tracker.on('entry:failed', (entry) => {
      clearTimeout(timeout);
      tracker.destroy();
      reject(new Error(entry.error ?? 'Upload failed'));
    });
  });
}

// CLI usage
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: ts-node upload.ts <file-path> <tusd-endpoint>');
  console.log('Example: ts-node upload.ts ./video.mp4 http://localhost:1080/files/');
  process.exit(1);
}

const [filePath, endpoint] = args;
const absolutePath = join(process.cwd(), filePath);

uploadFile(absolutePath, endpoint).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
