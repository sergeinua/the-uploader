# @tusd-tracker/core

Framework-agnostic TypeScript library for resumable file uploads via tusd with chunk-level tracking, auto-retry, and diagnostics reporting.

## Features

- **Zero framework dependencies** - Works in vanilla JS, React, Vue, Angular, Node.js
- **Resumable uploads** - Leverages tus protocol for reliable file transfers
- **Chunk-level tracking** - Tracks each chunk's status in IndexedDB
- **Auto-retry with exponential backoff** - Configurable retry strategy with jitter
- **Lost chunk detection** - HEAD-based offset diagnosis to detect and report lost chunks
- **Speed & ETA calculation** - Rolling average speed tracking
- **Network awareness** - Auto-resume on reconnect
- **Parallel uploads** - Configurable concurrent upload limit

## Installation

```bash
npm install @tusd-tracker/core
```

## Quick Start

### Browser (Vanilla JS)

```javascript
import { TusdTracker } from '@tusd-tracker/core';

const tracker = new TusdTracker({
  endpoint: 'http://localhost:1080/files/',
  chunkSize: 5 * 1024 * 1024, // 5MB
  maxRetries: 5,
  parallelUploads: 3,
  onProgress: (entry) => {
    console.log(`${entry.file.name}: ${entry.percent.toFixed(1)}%`);
  },
  onComplete: (entry) => {
    console.log(`Upload complete: ${entry.file.name}`);
  },
  onError: (entry, error) => {
    console.error(`Upload failed: ${error.message}`);
  },
});

// Add files to upload
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  const uploadIds = tracker.add(files);
  console.log('Started uploads:', uploadIds);
});

// Subscribe to events
const unsubscribe = tracker.on('entry:done', (entry) => {
  console.log('Done:', entry.id, entry.file.name);
});

// Control uploads
tracker.pause(uploadIds[0]);
tracker.resume(uploadIds[0]);
tracker.cancel(uploadIds[0]);

// Pause/resume all
tracker.pauseAll();
tracker.resumeAll();

// Retry failed uploads
tracker.retryFailed();

// Get stats
const stats = tracker.getStats();
console.log(stats);

// Cleanup
tracker.destroy();
```

### React

```tsx
import { TusdTracker } from '@tusd-tracker/core';
import { useEffect, useState } from 'react';

function Uploader() {
  const [tracker] = useState(() => new TusdTracker({
    endpoint: 'http://localhost:1080/files/',
    onProgress: (entry) => {
      // Update state or use a store
    },
  }));

  useEffect(() => {
    return () => tracker.destroy();
  }, [tracker]);

  const handleFileSelect = (files: File[]) => {
    const ids = tracker.add(files);
  };

  return (
    <div>
      <input type="file" multiple onChange={(e) => handleFileSelect(Array.from(e.target.files))} />
    </div>
  );
}
```

### Node.js

```typescript
import { TusdTracker } from '@tusd-tracker/core';
import { statSync } from 'fs';

// Create a File-like object for Node.js
class NodeFile {
  name: string;
  size: number;
  type: string;
  
  constructor(path: string, name: string, size: number) {
    this.name = name;
    this.size = size;
    this.type = 'application/octet-stream';
  }
}

const stats = statSync('./video.mp4');
const file = new NodeFile('./video.mp4', 'video.mp4', stats.size);

const tracker = new TusdTracker({
  endpoint: 'http://localhost:1080/files/',
  persistState: false, // No IndexedDB in Node.js
});

const ids = tracker.add(file as unknown as File);
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | string | required | tusd server URL |
| `chunkSize` | number | 5MB | Size of each chunk |
| `maxRetries` | number | 5 | Maximum retry attempts |
| `retryBaseDelay` | number | 1000ms | Base delay for exponential backoff |
| `retryMaxDelay` | number | 30000ms | Maximum retry delay |
| `retryJitter` | boolean | true | Add random jitter to delays |
| `autoResume` | boolean | true | Resume on network reconnect |
| `parallelUploads` | number | 3 | Concurrent upload limit |
| `persistState` | boolean | true | Store chunk state in IndexedDB |
| `diagnosticsEndpoint` | string | optional | URL for diagnostics reports |
| `headers` | Record<string, string> | {} | Extra headers for tus requests |
| `onProgress` | function | optional | Called on progress updates |
| `onComplete` | function | optional | Called on upload success |
| `onError` | function | optional | Called on upload failure |
| `onChunkLost` | function | optional | Called when chunks are detected as lost |
| `onStatsUpdate` | function | optional | Called when stats change |

## Events

```typescript
// Subscribe to events
const unsubscribe = tracker.on('entry:update', (entry) => {
  console.log('Entry updated:', entry);
});

tracker.on('entry:done', (entry) => {
  console.log('Upload complete:', entry);
});

tracker.on('entry:failed', (entry) => {
  console.log('Upload failed:', entry);
});

tracker.on('entry:cancelled', (entry) => {
  console.log('Upload cancelled:', entry);
});

tracker.on('stats:update', (stats) => {
  console.log('Stats:', stats);
});

tracker.on('chunk:lost', ({ uploadId, diagnosis }) => {
  console.log('Lost chunks detected:', diagnosis);
});

tracker.on('network:online', () => {
  console.log('Network is online');
});

tracker.on('network:offline', () => {
  console.log('Network is offline');
});

// Unsubscribe
unsubscribe();
```

## Utilities

```typescript
import { formatBytes, formatSpeed, formatEta, formatDuration, generateId, crc32 } from '@tusd-tracker/core';

formatBytes(1024 * 1024);     // "1 MB"
formatSpeed(1024 * 500);      // "500 KB/s"
formatEta(125);               // "2m 5s"
formatDuration(1500);         // "1.5s"
generateId();                 // "550e8400-e29b-41d4-a716-446655440000"
await crc32(buffer);          // "d87f7e0c"
```

## CORS Considerations

When using the `DiagnosticsReporter` with a cross-origin endpoint, ensure your diagnostics server has proper CORS headers configured:

```javascript
// Example Express CORS configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://your-app.com');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
```

The diagnostics endpoint must accept `POST` requests with `Content-Type: application/json` headers. If your diagnostics server is on a different origin, the browser will send a CORS preflight `OPTIONS` request that must be handled.

## Examples

See the `examples/` directory:

- `examples/vanilla-browser/` - Browser demo with drag & drop
- `examples/node-upload/` - Node.js CLI upload script
- `examples/diagnostics-server/` - Express server for receiving diagnostics

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Test coverage
npm run test:coverage

# Lint
npm run lint
```

## License

MIT
