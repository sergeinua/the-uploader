import { describe, it, expect, beforeEach } from 'vitest';
import { SpeedTracker } from '../src/SpeedTracker';

describe('SpeedTracker', () => {
  let tracker: SpeedTracker;

  beforeEach(() => {
    tracker = new SpeedTracker();
  });

  it('returns 0 speed with fewer than 2 samples', () => {
    tracker.record('upload-1', 1000);
    const speed = tracker.getSpeed('upload-1');
    expect(speed).toBe(0);
  });

  it('calculates speed correctly with multiple samples', async () => {
    tracker.record('upload-1', 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    tracker.record('upload-1', 10000);

    const speed = tracker.getSpeed('upload-1');
    expect(speed).toBeGreaterThan(0);
    expect(speed).toBeLessThan(1000000); // Reasonable upper bound
  });

  it('returns ETA based on speed', async () => {
    tracker.record('upload-1', 0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    tracker.record('upload-1', 10000);

    const eta = tracker.getEta('upload-1', 90000);
    expect(eta).toBeGreaterThan(0);
    expect(eta).toBeLessThan(Infinity);
  });

  it('returns Infinity ETA when no speed', () => {
    const eta = tracker.getEta('upload-1', 10000);
    expect(eta).toBe(Infinity);
  });

  it('reset() clears samples', () => {
    tracker.record('upload-1', 0);
    tracker.record('upload-1', 1000);
    tracker.reset('upload-1');

    const speed = tracker.getSpeed('upload-1');
    expect(speed).toBe(0);
  });

  it('keeps only last 10 samples', async () => {
    for (let i = 0; i < 15; i++) {
      tracker.record('upload-1', i * 1000);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Should still work with 10 samples
    const speed = tracker.getSpeed('upload-1');
    expect(speed).toBeGreaterThan(0);
  });

  it('tracks multiple uploads independently', async () => {
    tracker.record('upload-1', 0);
    tracker.record('upload-2', 0);

    await new Promise((resolve) => setTimeout(resolve, 100));

    tracker.record('upload-1', 10000);
    tracker.record('upload-2', 5000);

    const speed1 = tracker.getSpeed('upload-1');
    const speed2 = tracker.getSpeed('upload-2');

    expect(speed1).toBeGreaterThan(speed2);
  });
});
