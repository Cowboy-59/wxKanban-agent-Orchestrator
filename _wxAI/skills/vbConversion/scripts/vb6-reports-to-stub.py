#!/usr/bin/env python3
"""
vb6-reports-to-stub.py - Document VB6 report artifacts as one rebuild stub.

VB6 reporting is typically a **Data Report** (`.dsr` / `DataReport` designer) or **Crystal Reports**
(`.rpt` + the CrystalReport OCX). This records what exists (or that none does) and the rebuild path:
move data assembly to an API step and render with a React PDF/print component.

Input : pre-convert/*.report.md (if the splitter classified any), plus a scan of *.page.md / *.proc.md
        for Crystal / DataReport / Printer references.
Output: rebuild/scopes/RPT-reports-stub.md

Usage:
    python scripts/vb6-reports-to-stub.py --src pre-convert --out rebuild/scopes
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
import sys  # noqa: E402
import wxconv_redact as rd  # noqa: E402 - the watermark stamp now lives inside rd.write_text()

FENCE_RE = re.compile(r"```(?:vb)?\n(.*?)```", re.S)
SIGNALS = re.compile(r"\b(CrystalReport|CRViewer|\.rpt\b|DataReport|rptText|Printer\.Print|"
                     r"PrintForm|Printer\.EndDoc)\b", re.I)


def read(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("latin-1", "replace")
    return text.replace("\r\n", "\n").replace("\r", "\n")


def fences(text):
    return "\n".join(m.group(1) for m in FENCE_RE.finditer(text))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/scopes")
    rd.add_redaction_args(ap, scan=False)
    args = ap.parse_args()

    state = rd.RedactionState()

    reports = [os.path.basename(p) for p in sorted(glob.glob(os.path.join(args.src, "*.report.md")))]
    signals = {}
    for p in sorted(glob.glob(os.path.join(args.src, "*.page.md")) + glob.glob(os.path.join(args.src, "*.proc.md"))):
        hits = sorted(set(m.group(1) for m in SIGNALS.finditer(fences(read(p)))))
        if hits:
            signals[os.path.basename(p)] = hits

    os.makedirs(args.out, exist_ok=True)
    out = ["# Reports stub (VB6)", "",
           "_VB6 reports are Data Report designers (`.dsr`) or Crystal Reports (`.rpt`). Rebuild path:_"
           "_ move the print-time data assembly into an API/server step, then render with a React_"
           "_ PDF/print component (`@react-pdf/renderer` or a print-CSS route)._", ""]
    if not reports and not signals:
        out.append("**No reports detected** — no `.report.md` elements and no Crystal / DataReport / "
                   "Printer references in code. Nothing to rebuild here.\n")
    else:
        if reports:
            out.append(f"## Report designers ({len(reports)})\n")
            for r in reports:
                out.append(f"- `{r}` — see the element file for bands/fields; rebuild as a React PDF "
                           "component fed by an API data-prep endpoint.")
            out.append("")
        if signals:
            out.append("## Reporting / printing references found in code\n")
            for f, hits in signals.items():
                out.append(f"- `{f}`: {', '.join(hits)}")
            out.append("\n- Each indicates a print/report path — confirm the engine (Crystal vs "
                       "DataReport vs raw Printer) and rebuild via the API + React-PDF path above.")
    # [SCOPE 125 / T010] Through the shared funnel (FR-007): redacts, accumulates findings and
    # stamps the watermark on .md, so the manual stamp_markdown call is gone, not duplicated.
    rd.write_text(os.path.join(args.out, "RPT-reports-stub.md"), "\n".join(out) + "\n", state, generator='vbConversion')
    print(f"report-designers={len(reports)}  code-signals={len(signals)}  "
          f"-> {os.path.join(args.out, 'RPT-reports-stub.md')}")

    # [SCOPE 125 / T010] Credential report, rendered from the accumulated state and written
    # last so it covers every emission this run made. The summary prints unconditionally,
    # including when nothing was found: a run that says nothing about credentials is the
    # defect this scope fixes.
    sidecar_path = os.path.join(args.out, rd.SIDECAR_NAME)
    if state.findings:
        rd.write_text(sidecar_path, rd.render_sidecar(state), state, generator='vbConversion')
    print(rd.summary_line(state, sidecar_path))
    return rd.exit_code(len(state.findings), args.fail_on_secrets)


if __name__ == "__main__":
    sys.exit(main())
