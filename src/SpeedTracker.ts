interface SpeedSample {
  bytesUploaded: number;
  timestamp: number;
}

export class SpeedTracker {
  private samples: Map<string, SpeedSample[]> = new Map();
  private readonly maxSamples = 10;

  record(uploadId: string, bytesUploaded: number): void {
    if (!this.samples.has(uploadId)) {
      this.samples.set(uploadId, []);
    }
    const currentSamples = this.samples.get(uploadId)!;
    
    currentSamples.push({
      bytesUploaded,
      timestamp: Date.now(),
    });

    // Keep only last N samples
    if (currentSamples.length > this.maxSamples) {
      currentSamples.shift();
    }
  }

  getSpeed(uploadId: string): number {
    const currentSamples = this.samples.get(uploadId) ?? [];
    
    if (currentSamples.length < 2) {
      return 0;
    }
    
    const oldest = currentSamples[0]!;
    const newest = currentSamples[currentSamples.length - 1]!;
    
    const bytesDelta = newest.bytesUploaded - oldest.bytesUploaded;
    const timeDelta = (newest.timestamp - oldest.timestamp) / 1000; // seconds
    
    if (timeDelta <= 0) {
      return 0;
    }
    
    return bytesDelta / timeDelta;
  }

  getEta(uploadId: string, bytesRemaining: number): number {
    const speed = this.getSpeed(uploadId);
    
    if (speed <= 0) {
      return Infinity;
    }
    
    return bytesRemaining / speed;
  }

  reset(uploadId: string): void {
    this.samples.delete(uploadId);
  }
}
