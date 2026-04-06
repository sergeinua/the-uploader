export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 implementation
  const hex: string[] = [];
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) {
      hex.push('-');
    }
    const random = Math.random() * 16 | 0;
    const value = i === 12 ? 4 : i === 16 ? (random & 0x3) | 0x8 : random;
    hex.push(value.toString(16));
  }
  return hex.join('');
}
