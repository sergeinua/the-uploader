// Cached CRC32 lookup table
let crcTable: number[] | null = null;

function getCrcTable(): number[] {
  if (!crcTable) {
    crcTable = [];
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
      crcTable[i] = crc;
    }
  }
  return crcTable;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
export function crc32(buffer: ArrayBuffer): string {
  const table = getCrcTable();
  const data = new Uint8Array(buffer);
  let crc = 0xffffffff;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }

  crc = crc ^ 0xffffffff;

  // Convert to hex string (unsigned)
  return (crc >>> 0).toString(16).padStart(8, '0');
}
