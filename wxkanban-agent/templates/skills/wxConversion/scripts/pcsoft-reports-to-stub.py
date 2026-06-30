#!/usr/bin/env python3
"""
pcsoft-reports-to-stub.py - Document the PCSoft reports (RPT_*) as ONE rebuild stub.

Input : pre-convert/*.report.md   (one file per WinDev report)
Output: rebuild/scopes/RPT-reports-stub.md
          - per report: type, data-source type, source name, page format, and every query /
            data file referenced in the print-time WLanguage code, plus a rebuild target.

Legacy WinDev reports are pixel-positioned `.wde` layouts whose data is assembled at print time
by `Before printing` / `After printing` handlers. The doc captures the data source + bound
items + print code, but not a clean template — so this is a STUB: move the print-time data
assembly into an API/server data-prep step, then render with a React PDF/print component.

Usage:
    python scripts/pcsoft-reports-to-stub.py --src pre-convert --out rebuild/scopes
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

LABELS = {
    "Logical report name", "Physical report name", "Type", "Data source type",
    "Source name", "Page format", "Page height (mm)", "Page width (mm)",
    "Top margin (mm)", "Bottom margin (mm)", "Left margin (mm)", "Right margin (mm)",
    "Label height (mm)", "Label width (mm)", "Vertical spacing (mm)",
    "Horizontal spacing (mm)", "General information", "Information on controls",
    "Control code", "Code", "Image", "Procedures",
}
REPORT_TYPES = {"Free", "Label", "Form", "Cross-tab", "Mailing", "Blank",
                "Multi-column", "Multicolumn"}


def val_after(lines, label, name):
    """Value on the line after `label`; '' if that line is itself a label/echo."""
    for i, l in enumerate(lines):
        if l == label and i + 1 < len(lines):
            nxt = lines[i + 1]
            if nxt in LABELS or nxt == name:
                return ""
            return nxt
    return ""


def report_type(lines):
    """The General-info 'Type' value (a known report type) — not the controls-table 'Type'
    column header, which is followed by 'X'."""
    for i, l in enumerate(lines):
        if l == "Type" and i + 1 < len(lines) and lines[i + 1] in REPORT_TYPES:
            return lines[i + 1]
    return "Free"


def data_objects(text):
    objs = []
    for m in re.findall(r"\bQRY_\w+", text):
        if m not in objs:
            objs.append(m)
    for m in re.findall(r"H(?:ReadSeekFirst|ReadSeek|ExecuteQuery|Read)\(\s*([A-Za-z_]\w*)", text):
        if not m.startswith("QRY_") and m not in objs:
            objs.append(m)
    for m in re.findall(r"\bFOR EACH\s+([A-Za-z_]\w*)", text):
        if not m.startswith("QRY_") and m not in objs:
            objs.append(m)
    return objs


def purpose(name):
    n = name.replace("RPT_", "")
    words = re.sub(r"(?<!^)(?=[A-Z])", " ", n).strip().lower()
    return f"Prints the {words} report."


def parse(path):
    name = os.path.basename(path).split(".")[0]
    text = open(path, encoding="utf-8").read()
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    dstype = val_after(lines, "Data source type", name)
    source = val_after(lines, "Source name", name)
    pfmt = val_after(lines, "Page format", name)
    if not pfmt and val_after(lines, "Label height (mm)", name):
        pfmt = f'Label {val_after(lines,"Label width (mm)",name)} x {val_after(lines,"Label height (mm)",name)} mm'
    if source.startswith(":") and not dstype:
        dstype = "Array / variable"
    return dict(name=name, rtype=report_type(lines), dstype=dstype or "(see code)",
                source=source or "—", pfmt=pfmt or "—", objs=data_objects(text))


def rebuild_target(r):
    nm = r["name"].lower()
    if any(k in nm for k in ("label", "barcode", "parcel", "royalmail", "receipt")):
        return "Label/barcode print template — `@react-pdf/renderer` or a print-CSS view; barcodes via `bwip-js`/`jsbarcode`."
    return "`@react-pdf/renderer` document (server-rendered PDF) or a dedicated print-CSS route; bind data from the API."


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/scopes")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.src, "*.report.md")))
    reps = [parse(f) for f in files]
    os.makedirs(args.out, exist_ok=True)
    md = [
        "# Scope — Reports (RPT_*) — rebuild stub", "",
        "_One scope for all WinDev reports (`RPT_*`). Generated from the converted `*.report.md`._", "",
        "> **Stub, not a 1:1 layout port.** Legacy WinDev reports are pixel-positioned `.wde` "
        "layouts whose data is assembled at print time by WLanguage `Before printing` / "
        "`After printing` handlers (running totals, per-row seeks, VAT roll-ups). The PDF doc "
        "captures the **data source**, the **bound items**, and the **print-time code** — but not "
        "a clean template. For each report below: move the print-time data assembly into an **API/"
        "server data-prep step**, then render with a React PDF/print component. The matching "
        "`rebuild/pages/RPT_*.tsx` files are placeholder shells for that view.", "",
        f"## Summary ({len(reps)} reports)", "",
        "| Report | Type | Data source | Source name | Referenced data objects |",
        "|---|---|---|---|---|",
    ]
    for r in reps:
        objs = ", ".join(r["objs"][:6]) + (" …" if len(r["objs"]) > 6 else "")
        md.append(f"| {r['name']} | {r['rtype']} | {r['dstype']} | `{r['source']}` | {objs or '—'} |")
    md.append("\n---\n")
    for r in reps:
        md.append(f"## {r['name']}\n")
        md.append(f"**Purpose (inferred):** {purpose(r['name'])}\n")
        md.append(f"- **Report type:** {r['rtype']}")
        md.append(f"- **Data source type:** {r['dstype']}")
        md.append(f"- **Source name:** `{r['source']}`")
        md.append(f"- **Page format:** {r['pfmt']}")
        if r["objs"]:
            md.append("\n**Referenced data objects (queries / data files in the print code):**\n")
            for o in r["objs"]:
                md.append(f"- `{o}`")
        md.append("\n**Rebuild target:** " + rebuild_target(r))
        md.append(f"\n_Print-time WLanguage handlers are in `pre-convert/{r['name']}.report.md`; "
                  "port their logic to the data-prep layer, not the React view._")
        md.append("\n---\n")
    out_path = os.path.join(args.out, "RPT-reports-stub.md")
    open(out_path, "w", encoding="utf-8").write(
        stamp_markdown("\n".join(md) + "\n", kind="converted", generator="wxConversion"))
    print(f"reports={len(reps)}  -> {out_path}")


if __name__ == "__main__":
    main()
