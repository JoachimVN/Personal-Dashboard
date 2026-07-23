/** Pure-JS MD5 (RFC 1321), used only to reproduce Fandom's CDN path-sharding scheme for wiki
 * asset URLs (see `clashRoyaleWikiCardImageUrl`) — there's no secret or user-supplied data being
 * hashed, so this isn't a "weak hash in a sensitive context" case, but it needs to stay bit-for-bit
 * identical to `crypto.createHash('md5')` since Fandom's own filenames are hashed the same way. */

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4,
  11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

function toLittleEndianWords(bytes: Uint8Array): Uint32Array {
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 2 ** 32), true);

  const words = new Uint32Array(paddedLength / 4);
  for (let i = 0; i < words.length; i++) words[i] = view.getUint32(i * 4, true);
  return words;
}

/** Bit-for-bit equivalent to `createHash('md5').update(input).digest('hex')`. */
export function md5Hex(input: string): string {
  const words = toLittleEndianWords(new TextEncoder().encode(input));

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let chunk = 0; chunk < words.length; chunk += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];

    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      f = (f + a + K[i] + words[chunk + g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotl(f, S[i])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .map((word) => {
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setUint32(0, word, true);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    })
    .join('');
}
