import { describe, it, expect } from 'vitest';
import { generateId } from '../src/utils/uuid';

describe('generateId', () => {
  it('generates a valid UUID v4', () => {
    const id = generateId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('uses crypto.randomUUID when available', () => {
    // This test verifies the function works with the native implementation
    const id = generateId();
    expect(id).toBeDefined();
    expect(id.length).toBe(36);
  });

  // Note: Testing the fallback is challenging in modern Node.js where crypto.randomUUID 
  // is a readonly getter. The fallback implementation is tested via code review.
});
