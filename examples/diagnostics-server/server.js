/**
 * Diagnostics receiver server
 *
 * Receives POST requests from TusdTracker when chunk loss is detected.
 * This is a simple Express server that logs diagnostics payloads.
 *
 * Usage:
 *   node server.js
 *   # or with custom port:
 *   PORT=3001 node server.js
 */

import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

const diagnosticsLog = [];

app.post('/diagnostics', (req, res) => {
  const payload = req.body;

  console.log('=== DIAGNOSTICS REPORT ===');
  console.log(`Time: ${new Date(payload.timestamp).toISOString()}`);
  console.log(`Upload ID: ${payload.uploadId}`);
  console.log(`User Agent: ${payload.userAgent}`);

  if (payload.diagnosis) {
    console.log('Diagnosis:');
    console.log(`  Local Offset: ${payload.diagnosis.localOffset}`);
    console.log(`  Server Offset: ${payload.diagnosis.serverOffset}`);
    console.log(`  Lost Bytes: ${payload.diagnosis.lostBytes}`);
    console.log(`  Lost Chunks: ${payload.diagnosis.lostChunkIndexes.join(', ')}`);
  }

  if (payload.lostChunks && payload.lostChunks.length > 0) {
    console.log(`Lost Chunks: ${payload.lostChunks.length}`);
    for (const chunk of payload.lostChunks) {
      console.log(`  - Chunk ${chunk.chunkIndex}: ${chunk.size} bytes, ${chunk.attempts} attempts`);
    }
  }

  console.log('=========================\n');

  diagnosticsLog.push({
    receivedAt: Date.now(),
    payload,
  });

  res.json({ success: true });
});

app.get('/diagnostics', (req, res) => {
  res.json({
    count: diagnosticsLog.length,
    entries: diagnosticsLog.slice(-10), // Last 10 entries
  });
});

app.delete('/diagnostics', (req, res) => {
  diagnosticsLog.length = 0;
  res.json({ success: true, message: 'Log cleared' });
});

app.listen(PORT, () => {
  console.log(`Diagnostics server listening on http://localhost:${PORT}`);
  console.log(`  POST /diagnostics - Receive diagnostics`);
  console.log(`  GET /diagnostics - View last 10 reports`);
  console.log(`  DELETE /diagnostics - Clear log`);
});
