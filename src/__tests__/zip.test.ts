import { describe, it, expect } from "vitest";
import { buildZip, type ZipEntry } from "../lib/zip";

// Minimal ZIP reader for verification — reads local file headers and EOCD.
async function readZip(blob: Blob): Promise<{ name: string; size: number; crc: number }[]> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // Find EOCD signature (0x06054b50) scanning from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd).toBeGreaterThanOrEqual(0);

  const totalEntries = view.getUint16(eocd + 8, true);
  const centralDirOffset = view.getUint32(eocd + 16, true);

  const entries: { name: string; size: number; crc: number }[] = [];
  let p = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const size = view.getUint32(p + 24, true);
    const crc = view.getUint32(p + 16, true);
    const nameBytes = buf.slice(p + 46, p + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    entries.push({ name, size, crc });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("buildZip", () => {
  it("produces a valid ZIP with the correct entries", async () => {
    const entries: ZipEntry[] = [
      { path: "hello.txt", content: "hello world" },
      { path: "nested/file.json", content: '{"a":1}' },
    ];
    const blob = buildZip(entries);
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("application/zip");

    const read = await readZip(blob);
    expect(read.length).toBe(2);
    expect(read[0].name).toBe("hello.txt");
    expect(read[1].name).toBe("nested/file.json");
    expect(read[0].size).toBe(11);
    expect(read[1].size).toBe(7);
  });

  it("stores UTF-8 filenames correctly", async () => {
    const entries: ZipEntry[] = [{ path: "café/naïve.ts", content: "x" }];
    const blob = buildZip(entries);
    const read = await readZip(blob);
    expect(read[0].name).toBe("café/naïve.ts");
  });

  it("handles empty archives", async () => {
    const blob = buildZip([]);
    const read = await readZip(blob);
    expect(read.length).toBe(0);
  });

  it("produces deterministic output for the same input", async () => {
    const entries: ZipEntry[] = [{ path: "a.txt", content: "same" }];
    const b1 = await buildZip(entries).arrayBuffer();
    const b2 = await buildZip(entries).arrayBuffer();
    // Timestamps may differ by <2s, but structure and CRC must match.
    const v1 = new DataView(b1);
    const v2 = new DataView(b2);
    // CRC at offset 14 in the local header
    expect(v1.getUint32(14, true)).toBe(v2.getUint32(14, true));
    // Compressed and uncompressed sizes
    expect(v1.getUint32(18, true)).toBe(v2.getUint32(18, true));
    expect(v1.getUint32(22, true)).toBe(v2.getUint32(22, true));
  });
});