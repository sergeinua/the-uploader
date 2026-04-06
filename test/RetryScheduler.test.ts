import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildRetryDelays, waitForOnline } from '../src/RetryScheduler';

describe('RetryScheduler', () => {
  describe('buildRetryDelays', () => {
    it('returns correct count of delays', () => {
      const delays = buildRetryDelays(5, 1000, 30000, false);
      expect(delays).toHaveLength(5);
    });

    it('delays are exponential', () => {
      const delays = buildRetryDelays(5, 1000, 30000, false);
      expect(delays[0]).toBe(1000);
      expect(delays[1]).toBe(2000);
      expect(delays[2]).toBe(4000);
      expect(delays[3]).toBe(8000);
      expect(delays[4]).toBe(16000);
    });

    it('delays are capped at maxDelay', () => {
      const delays = buildRetryDelays(10, 1000, 5000, false);
      for (const delay of delays) {
        expect(delay).toBeLessThanOrEqual(5000);
      }
    });

    it('jitter produces values within ±25% of base', () => {
      // Run multiple times to ensure randomness
      for (let i = 0; i < 10; i++) {
        const delays = buildRetryDelays(5, 1000, 30000, true);
        for (let j = 0; j < delays.length; j++) {
          const baseDelay = Math.min(1000 * Math.pow(2, j), 30000);
          expect(delays[j]).toBeGreaterThanOrEqual(baseDelay * 0.75);
          expect(delays[j]).toBeLessThanOrEqual(baseDelay * 1.25);
        }
      }
    });

    it('jitter=false produces exact values', () => {
      const delays1 = buildRetryDelays(5, 1000, 30000, false);
      const delays2 = buildRetryDelays(5, 1000, 30000, false);
      expect(delays1).toEqual(delays2);
    });
  });

  describe('waitForOnline', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('resolves immediately when already online', async () => {
      await expect(waitForOnline()).resolves.toBeUndefined();
    });

    it('waits for online event when offline', async () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      
      const promise = waitForOnline();
      
      // Trigger online event
      window.dispatchEvent(new Event('online'));
      
      await expect(promise).resolves.toBeUndefined();
    });
  });
});
