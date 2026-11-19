"""SCOPE-082 — wxKanban generated-output watermark (Python port).

Byte-compatible with the TypeScript module @wxkanban/watermark
(shared/watermark/src/*). Used by the conversion skills (wxConversion,
cwConversion, vbConversion) to stamp the per-element Markdown + scaffold they
emit, so the artifact carries a wxKanban attribution back to www.wxperts.com.

Branding / funnel mark, NOT a tamper-proof control: the visible footer is
removable and the zero-width signature is brittle under reformatting.

The zero-width codec, signature payload (``wxk1|G|<version>`` / ``...|C|...``),
frontmatter keys and footer text MUST stay identical to the TS module so that
either side can verify the other's output.
"""

import os
from datetime import datetime, timezone

# Zero-width signal characters (identical to shared/watermark/src/zero-width.ts).
ZW_BIT0 = chr(0x200b)      # ZERO WIDTH SPACE        -> bit 0
ZW_BIT1 = chr(0x200c)      # ZERO WIDTH NON-JOINER   -> bit 1
ZW_SENTINEL = chr(0x2060)  # WORD JOINER             -> payload delimiter

WATERMARK_URL = "https://www.wxperts.com"
WATERMARK_HOST = "www.wxperts.com"
SIG_PREFIX = "wxk1"


def encode_zero_width(payload):
    """Encode a payload string as a sentinel-delimited zero-width run."""
    bits = []
    for byte in payload.encode("utf-8"):
        for i in range(7, -1, -1):
            bits.append(ZW_BIT1 if (byte >> i) & 1 else ZW_BIT0)
    return ZW_SENTINEL + "".join(bits) + ZW_SENTINEL


def decode_zero_width(text):
    """Recover the payload from the first sentinel-delimited run, or None."""
    first = text.find(ZW_SENTINEL)
    if first == -1:
        return None
    second = text.find(ZW_SENTINEL, first + 1)
    if second == -1:
        return None
    between = text[first + 1:second]
    bits = "".join("0" if c == ZW_BIT0 else "1" if c == ZW_BIT1 else "" for c in between)
    if not bits or len(bits) % 8 != 0:
        return None
    raw = bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits), 8))
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return None


def verify_markdown(content):
    """Return {'present': bool, 'kind'?: str, 'version'?: str}."""
    payload = decode_zero_width(content)
    if not payload:
        return {"present": False}
    parts = payload.split("|")
    if len(parts) != 3 or parts[0] != SIG_PREFIX:
        return {"present": False}
    kind = "converted" if parts[1] == "C" else "generated"
    return {"present": True, "kind": kind, "version": parts[2]}


def _inject_frontmatter(content, generator, version, generated_at):
    lines = [
        "wxkanbanGenerator: %s" % generator,
        "wxkanbanVersion: %s" % version,
        "wxkanbanGeneratedAt: %s" % generated_at,
        "wxkanbanSource: %s" % WATERMARK_URL,
    ]
    if content.startswith("---\n") or content.startswith("---\r\n"):
        close = content.find("\n---", 3)
        if close != -1:
            return content[:close] + "\n" + "\n".join(lines) + content[close:]
    return "---\n" + "\n".join(lines) + "\n---\n\n" + content


def stamp_markdown(content, kind="converted", version=None, generator=None, generated_at=None):
    """Stamp Markdown with frontmatter + visible footer + zero-width signature.

    Idempotent (re-stamping returns the input unchanged) and fail-open (returns
    the original content on any internal error) so a generator never blocks.
    """
    try:
        if verify_markdown(content)["present"]:
            return content
        if version is None:
            version = os.environ.get("WXKANBAN_VERSION", "kit")
        if generated_at is None:
            generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        if generator is None:
            generator = kind
        date = generated_at[:10]

        with_fm = _inject_frontmatter(content, generator, version, generated_at)
        sig_char = "C" if kind == "converted" else "G"
        signature = encode_zero_width("%s|%s|%s" % (SIG_PREFIX, sig_char, version))
        verb = "Converted" if kind == "converted" else "Generated"
        body = with_fm.rstrip()
        footer = "*%s with wxKanban — %s · v%s · %s* [↗](%s)" % (
            verb, WATERMARK_HOST, version, date, WATERMARK_URL,
        )
        return "%s\n\n---\n\n<!-- wxkanban:watermark -->\n%s%s\n" % (body, footer, signature)
    except Exception:
        return content


if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 3 and sys.argv[1] in ("stamp", "verify"):
        with open(sys.argv[2], "r", encoding="utf-8") as fh:
            data = fh.read()
        if sys.argv[1] == "verify":
            info = verify_markdown(data)
            if info["present"]:
                print("watermark: PRESENT — kind=%s version=%s" % (info["kind"], info["version"]))
                sys.exit(0)
            print("watermark: ABSENT")
            sys.exit(1)
        sys.stdout.write(stamp_markdown(data, kind="converted"))
    else:
        sys.stderr.write("usage: wxkanban_watermark.py [stamp|verify] <file>\n")
        sys.exit(2)
