// SCOPE-082 — invisible zero-width signature codec for @wxkanban/watermark.
// Encodes a short ASCII/UTF-8 payload as a run of zero-width characters that
// survive copy-paste but are invisible when the Markdown is read or rendered.
//
// Known limitation (documented in scope 082): the mark is brittle under
// reformatting and removable if detected. This is a branding/funnel signal,
// NOT a tamper-proof control.
//
// Wire format (must stay byte-for-byte identical to the Python port that the
// conversion skills use — see scripts/wxkanban_watermark.py):
//   SENTINEL  payload-bits  SENTINEL
// where each UTF-8 byte of the payload is emitted MSB-first as 8 bit-chars.
// Codepoints are written via String.fromCodePoint so the source never contains
// raw invisible characters.

// [SCOPE 082 / T001] BEGIN — zero-width character constants
/** Bit 0 — ZERO WIDTH SPACE (U+200B). */
export const ZW_BIT0 = String.fromCodePoint(0x200b);
/** Bit 1 — ZERO WIDTH NON-JOINER (U+200C). */
export const ZW_BIT1 = String.fromCodePoint(0x200c);
/** Payload delimiter — WORD JOINER (U+2060). Wraps the bit run so it can be located. */
export const ZW_SENTINEL = String.fromCodePoint(0x2060);

/** All three chars, for stripping a signature back out of a document. */
export const ZW_ALL = [ZW_BIT0, ZW_BIT1, ZW_SENTINEL];
// [SCOPE 082 / T001] END

// [SCOPE 082 / T001] BEGIN — encodeZeroWidth (payload string -> invisible run)
/**
 * Encode a payload string as an invisible, sentinel-delimited zero-width run.
 * UTF-8 bytes are emitted MSB-first, one zero-width char per bit.
 */
export function encodeZeroWidth(payload: string): string {
  const bytes = new TextEncoder().encode(payload);
  let bits = '';
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i -= 1) {
      bits += (byte >> i) & 1 ? ZW_BIT1 : ZW_BIT0;
    }
  }
  return ZW_SENTINEL + bits + ZW_SENTINEL;
}
// [SCOPE 082 / T001] END

// [SCOPE 082 / T001] BEGIN — decodeZeroWidth (recover payload from a document)
/**
 * Recover the payload from the first sentinel-delimited zero-width run found in
 * `text`. Returns null when no well-formed signature is present. Tolerant of
 * other characters between the sentinels (only bit-chars are decoded).
 */
export function decodeZeroWidth(text: string): string | null {
  const first = text.indexOf(ZW_SENTINEL);
  if (first === -1) return null;
  const second = text.indexOf(ZW_SENTINEL, first + 1);
  if (second === -1) return null;

  const between = text.slice(first + 1, second);
  let bits = '';
  for (const ch of between) {
    if (ch === ZW_BIT0) bits += '0';
    else if (ch === ZW_BIT1) bits += '1';
  }
  if (bits.length === 0 || bits.length % 8 !== 0) return null;

  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
// [SCOPE 082 / T001] END

// [SCOPE 082 / T001] BEGIN — stripZeroWidth (remove all zero-width signal chars)
/** Remove every zero-width signal character used by this codec from `text`. */
export function stripZeroWidth(text: string): string {
  let out = text;
  for (const ch of ZW_ALL) out = out.split(ch).join('');
  return out;
}
// [SCOPE 082 / T001] END
