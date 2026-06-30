#!/usr/bin/env python3
"""
pcsoft-procs-to-scope.py - Document the PCSoft global/server WLanguage procedure sets as ONE
backend scope. This is the application's business-logic layer (incl. HFSQL "trigger"
procedures), which has no UI and is NOT scaffolded as React pages.

Input : pre-convert/*.proc.md   (one file per "Set of procedures")
Output: rebuild/scopes/PROC-procedures-scope.md
          - a TRIGGERS callout (every *Trigger procedure, across all sets),
          - a summary table (set, #procedures, #triggers, server procedures called),
          - a per-set section listing each procedure's name + signature (triggers flagged),
            the HFSQL server procedures it calls (HExecuteProcedure), and referenced queries.

WLanguage procedure declarations in the doc look like `PROCEDURE Name(p1, p2)` (NOT SQL); HFSQL
"triggers" are ordinary WLanguage procedures (named *Trigger here) invoked by the rules engine
or registered via HDescribeTrigger. Port these to the API/server layer the React pages call.

Usage:
    python scripts/pcsoft-procs-to-scope.py --src pre-convert --out rebuild/scopes
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

PROC_RE = re.compile(r"^PROCEDURE\s+([A-Za-z_]\w*)\s*\(([^)]*)\)", re.M)
SRVPROC_RE = re.compile(r'HExecuteProcedure\s*\([^,]*,\s*"([^"]+)"')
QRY_RE = re.compile(r"\bQRY_\w+")


def parse(path):
    name = os.path.basename(path).split(".")[0]
    text = open(path, encoding="utf-8").read()
    procs = []
    for m in PROC_RE.finditer(text):
        pname, params = m.group(1), re.sub(r"\s+", " ", m.group(2)).strip()
        procs.append((pname, params))
    # dedupe preserving order
    seen, uniq = set(), []
    for p in procs:
        if p[0] not in seen:
            seen.add(p[0])
            uniq.append(p)
    srv = []
    for s in SRVPROC_RE.findall(text):
        if s not in srv:
            srv.append(s)
    qrys = []
    for q in QRY_RE.findall(text):
        if q not in qrys:
            qrys.append(q)
    return dict(name=name, procs=uniq, srv=srv, qrys=qrys)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/scopes")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.src, "*.proc.md")))
    sets = [parse(f) for f in files]
    os.makedirs(args.out, exist_ok=True)

    # all trigger procedures across every set
    triggers = [(s["name"], pn, pp) for s in sets for pn, pp in s["procs"]
                if "trigger" in pn.lower()]
    total_procs = sum(len(s["procs"]) for s in sets)

    md = [
        "# Scope — Server / Global Procedures (Sets of procedures)", "",
        "_The application's backend business-logic layer: global & HFSQL-server WLanguage "
        "procedure sets. Generated from the converted `*.proc.md`. These have **no UI** and are "
        "**not** scaffolded as React pages — port them to the API/server modules the pages call._",
        "",
        "> **HFSQL triggers are WLanguage procedures, not SQL `CREATE TRIGGER`.** They look like "
        "ordinary procedures (named `*Trigger` here) and are invoked by the custom-rules engine "
        "or registered with `HDescribeTrigger`. They are listed in the callout below and flagged "
        "inline in their set.",
        "",
        f"## Trigger procedures ({len(triggers)})", "",
    ]
    if triggers:
        md += ["| Procedure | Signature | Set of procedures |", "|---|---|---|"]
        for setn, pn, pp in sorted(triggers):
            md.append(f"| **{pn}** | `({pp})` | {setn} |")
    else:
        md.append("_None found._")
    md.append("")

    md += [f"## Summary ({len(sets)} sets, {total_procs} procedures)", "",
           "| Set of procedures | Procedures | Triggers | HFSQL server procedures called |",
           "|---|---|---|---|"]
    for s in sets:
        ntrig = sum(1 for pn, _ in s["procs"] if "trigger" in pn.lower())
        srv = ", ".join(f"`{x}`" for x in s["srv"][:6]) + (" …" if len(s["srv"]) > 6 else "")
        md.append(f"| {s['name']} | {len(s['procs'])} | {ntrig or '-'} | {srv or '-'} |")
    md.append("\n---\n")

    for s in sets:
        md.append(f"## {s['name']}\n")
        md.append(f"- **Procedures:** {len(s['procs'])}")
        if s["srv"]:
            md.append(f"- **HFSQL server procedures called:** {', '.join('`'+x+'`' for x in s['srv'])}")
        if s["qrys"]:
            shown = ", ".join(s["qrys"][:12]) + (f" … (+{len(s['qrys'])-12})" if len(s["qrys"]) > 12 else "")
            md.append(f"- **Referenced queries:** {shown}")
        if s["procs"]:
            md.append("\n**Procedures:**\n")
            for pn, pp in s["procs"]:
                flag = "  **← trigger**" if "trigger" in pn.lower() else ""
                md.append(f"- `{pn}({pp})`{flag}")
        md.append("\n_Source: `pre-convert/" + s["name"] + ".proc.md` — port logic to the API/server layer._")
        md.append("\n---\n")

    out_path = os.path.join(args.out, "PROC-procedures-scope.md")
    open(out_path, "w", encoding="utf-8").write(
        stamp_markdown("\n".join(md) + "\n", kind="converted", generator="wxConversion"))
    print(f"sets={len(sets)}  procedures={total_procs}  triggers={len(triggers)}  -> {out_path}")
    for s in sets:
        print(f"  {s['name']}: {len(s['procs'])} procs, {len(s['srv'])} server-procs, {len(s['qrys'])} qry refs")


if __name__ == "__main__":
    main()
