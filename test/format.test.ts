import { describe, it, expect } from 'vitest';
import { formatBytes, formatSpeed, formatEta, formatDuration } from '../src/utils/format';

describe('format utils', () => {
  describe('formatBytes', () => {
    it('formats zero bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1572864)).toBe('1.5 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(1610612736)).toBe('1.5 GB');
    });

    it('respects decimals parameter', () => {
      expect(formatBytes(1536, 2)).toBe('1.50 KB');
      expect(formatBytes(1536, 0)).toBe('2 KB');
    });
  });

  describe('formatSpeed', () => {
    it('formats speed in bytes per second', () => {
      expect(formatSpeed(1536)).toBe('1.5 KB/s');
    });

    it('formats speed in megabytes per second', () => {
      expect(formatSpeed(1572864)).toBe('1.5 MB/s');
    });
  });

  describe('formatEta', () => {
    it('returns -- for invalid values', () => {
      expect(formatEta(NaN)).toBe('--');
      expect(formatEta(-1)).toBe('--');
      expect(formatEta(Infinity)).toBe('--');
    });

    it('formats seconds only', () => {
      expect(formatEta(45)).toBe('45s');
    });

    it('formats minutes and seconds', () => {
      expect(formatEta(65)).toBe('1m 5s');
      expect(formatEta(125)).toBe('2m 5s');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(1500)).toBe('1s');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(65000)).toBe('1m 5s');
    });
  });
});
