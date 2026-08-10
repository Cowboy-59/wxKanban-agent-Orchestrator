#!/usr/bin/env python3
"""
vb6-procs-to-scope.py - Document VB6 modules/classes as one business-logic (backend) scope.

Reads pre-convert/*.proc.md (.bas standard modules + .cls class modules) and produces one scope
summarizing each module's procedures and what they touch. Two callouts matter for the rebuild:
  * `Declare` statements = Win32 API (P/Invoke) — platform-specific, do NOT port to the browser;
    replace with a web-native equivalent or drop (e.g. SetWindowPos/always-on-top has no web analog).
  * DB access (`Recordset`, `datX.`, DAO/ADO) = the data layer → an API endpoint, not UI.

Input : pre-convert/*.proc.md
Output: rebuild/scopes/PROC-procedures-scope.md

Usage:
    python scripts/vb6-procs-to-scope.py --src pre-convert --out rebuild/scopes
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
PROC_RE = re.compile(r"^\s*(?:Public\s+|Private\s+|Friend\s+|Static\s+)*"
                     r"(Sub|Function|Property\s+Get|Property\s+Let|Property\s+Set)\s+(\w+)\s*\(([^)]*)\)",
                     re.I | re.M)
DECLARE_RE = re.compile(r"^\s*(?:Public\s+|Private\s+)?Declare\s+(?:PtrSafe\s+)?(?:Function|Sub)\s+(\w+)"
                        r"\s+Lib\s+\"([^\"]+)\"", re.I | re.M)


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


def title_of(text, fallback):
    m = re.search(r"^#\s*(?:Module \(standard\)|Class module|.*?):\s*(.+)$", text, re.M)
    return m.group(1).strip() if m else fallback


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="pre-convert")
    ap.add_argument("--out", default="rebuild/scopes")
    rd.add_redaction_args(ap, scan=False)
    args = ap.parse_args()

    state = rd.RedactionState()

    mods = []
    for p in sorted(glob.glob(os.path.join(args.src, "*.proc.md"))):
        text = read(p)
        name = title_of(text, os.path.basename(p).split(".")[0])
        code = fences(text)
        procs = [(m.group(1).strip(), m.group(2), m.group(3).strip()) for m in PROC_RE.finditer(code)]
        declares = DECLARE_RE.findall(code)
        touches = set()
        if re.search(r"\bRecordset\b|\.RecordSource|\bOpenRecordset\b|\bADODB\b|\bDAO\b", code, re.I):
            touches.add("database")
        if re.search(r'\bOpen\s+"|\bPrint\s+#|\bGet\s+#|\bPut\s+#|\bFreeFile\b', code):
            touches.add("file I/O")
        if declares:
            touches.add("Win32 API")
        mods.append(dict(name=name, file=os.path.basename(p), procs=procs, declares=declares, touches=touches))

    os.makedirs(args.out, exist_ok=True)
    out = ["# Business-logic scope (VB6 modules & classes)", "",
           "_The backend layer: standard modules (`.bas`) and class modules (`.cls`). Procedures that_"
           "_ touch the database become API endpoints; UI lives in the page scopes, not here._", ""]
    total_proc = sum(len(m["procs"]) for m in mods)
    out.append(f"**{len(mods)} module(s), {total_proc} procedure(s).**\n")
    win32 = [m for m in mods if m["declares"]]
    if win32:
        out.append("> ⚠ **Win32 API (`Declare`) found — platform-specific, does NOT port to the web.** "
                   "Replace with a web-native behavior or drop:")
        for m in win32:
            for fn, lib in m["declares"]:
                out.append(f">  - `{fn}` from `{lib}`  _({m['name']})_")
        out.append("")
    for m in mods:
        tags = ", ".join(sorted(m["touches"])) or "pure logic"
        out.append(f"## {m['name']}  _({m['file']})_  — touches: {tags}\n")
        if not m["procs"]:
            out.append("_(no procedures parsed)_\n")
            continue
        out.append("| Procedure | Kind | Parameters |")
        out.append("|---|---|---|")
        for kind, pname, params in m["procs"]:
            out.append(f"| {pname} | {kind} | {params or '—'} |")
        out.append("")
        out.append("- Rebuild: port DB/logic procedures to the API/server layer; keep pure helpers as "
                   "shared utilities. Flag any Win32/`Declare` calls as non-portable.\n")
    # [SCOPE 125 / T010] Through the shared funnel (FR-007): redacts, accumulates findings and
    # stamps the watermark on .md, so the manual stamp_markdown call is gone, not duplicated.
    rd.write_text(os.path.join(args.out, "PROC-procedures-scope.md"), "\n".join(out) + "\n", state, generator='vbConversion')
    print(f"modules={len(mods)}  procedures={total_proc}  win32-modules={len(win32)}  "
          f"-> {os.path.join(args.out, 'PROC-procedures-scope.md')}")

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
