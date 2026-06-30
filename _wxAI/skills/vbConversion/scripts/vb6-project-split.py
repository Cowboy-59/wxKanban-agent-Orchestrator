#!/usr/bin/env python3
"""
vb6-project-split.py - Split a legacy Visual Basic 6 project into one Markdown file per element.

VB6 source is ALREADY text (unlike Access/VBA, which export via SaveAsText). The shapes:
  * .vbp  project: `Form=Form1.frm`, `Module=M; M.bas`, `Class=C; C.cls`, `Object={GUID}#..; ctl.ocx`,
                   `Reference=*\\G{GUID}#..`, `Startup="Form1"`, `Type=Exe`, `Title=..`.
  * .frm  form: a `Begin VB.Form .. End` control tree (controls nest via Begin/End; property groups
                via BeginProperty/EndProperty), then `Attribute VB_Name = ".."` and the WLanguage-like
                event code (`Private Sub Command1_Click() .. End Sub`).
  * .bas  standard module: Declarations + Sub/Function/Property procedures.
  * .cls  class module: a `VERSION 1.0 CLASS .. BEGIN .. END` header + attributes, then code.
  * .ctl  user control: like a .frm whose root is `Begin VB.UserControl`.

Outputs under --out (default pre-convert/):
    <Form>.page.md     one per .frm/.ctl  (overview + control summary + menus + event list + code)
    <Form>.controls.md faithful sidecar: parsed control tree + the verbatim Begin..End structure
    <Module>.proc.md   one per .bas/.cls  (Declarations + procedures = the business-logic layer)
    _project.md        from the .vbp: forms/modules/classes, references, OCX objects, startup
    index.md           manifest
    _discarded.md      files/blocks not classified (review before discarding)

Third-party OCX controls (anything whose type is not `VB.*`) are flagged as GAP candidates for the
form generator (Stage 2), the way wxConversion/cwConversion flag unmapped controls — surfaced, never
dropped. VB6 has no declarative data dictionary; the data model is reconstructed in a later stage from
Data-control RecordSource/DatabaseName, ADO/DAO SQL in code, and any attached .mdb.

Usage:
    python scripts/vb6-project-split.py --vbp conversion/src/App.vbp --out pre-convert
    python scripts/vb6-project-split.py --src "conversion/src/*" --out pre-convert   # no .vbp
"""
import argparse
import glob
import os
import re

import os as _wmos, sys as _wmsys
_wmsys.path.insert(0, _wmos.path.dirname(_wmos.path.abspath(__file__)))
from wxkanban_watermark import stamp_markdown

BEGIN_RE = re.compile(r"^\s*Begin\s+(\S+)\s+(\S+)\s*$", re.I)
BEGINPROP_RE = re.compile(r"^\s*BeginProperty\b", re.I)
ENDPROP_RE = re.compile(r"^\s*EndProperty\b", re.I)
END_RE = re.compile(r"^\s*End\s*$", re.I)
PROP_RE = re.compile(r"^\s*(\w+)\s*=\s*(.*)$")
# A procedure header: optional scope, then Sub/Function/Property <Name>.
PROC_RE = re.compile(
    r"^\s*(?:Public\s+|Private\s+|Friend\s+|Static\s+)*"
    r"(Sub|Function|Property\s+Get|Property\s+Let|Property\s+Set)\s+(\w+)", re.I)
PROC_END_RE = re.compile(r"^\s*End\s+(Sub|Function|Property)\b", re.I)
ATTR_NAME_RE = re.compile(r'^\s*Attribute\s+VB_Name\s*=\s*"([^"]+)"', re.I)


def read_text(path):
    with open(path, "rb") as fh:
        raw = fh.read()
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", "replace")


def safe_name(name):
    return re.sub(r"[^A-Za-z0-9._-]", "_", name).strip("_") or "unnamed"


def fence(body, lang="vb"):
    return f"```{lang}\n{body.rstrip()}\n```\n"


def write_if_new(path, content, written, dry):
    written.append(os.path.basename(path))
    if dry or os.path.exists(path):
        return
    if str(path).endswith('.md'):
        content = stamp_markdown(content, kind='converted', generator='vbConversion')
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)


# ------------------------------------------------------------------ .vbp project
def parse_vbp(text):
    proj = dict(type=None, title=None, startup=None, forms=[], modules=[], classes=[],
                usercontrols=[], references=[], objects=[])
    for raw in text.split("\n"):
        ln = raw.strip()
        if not ln or ln.startswith("'"):
            continue
        m = re.match(r"^(\w+)\s*=\s*(.*)$", ln)
        if not m:
            continue
        key, val = m.group(1).lower(), m.group(2).strip()
        if key == "form":
            proj["forms"].append(val)
        elif key == "module":
            proj["modules"].append(val.split(";")[-1].strip())
        elif key == "class":
            proj["classes"].append(val.split(";")[-1].strip())
        elif key == "usercontrol":
            proj["usercontrols"].append(val.split(";")[-1].strip())
        elif key == "reference":
            proj["references"].append(val)
        elif key == "object":
            proj["objects"].append(val)  # third-party OCX/ActiveX
        elif key == "startup":
            proj["startup"] = val.strip('"')
        elif key == "type":
            proj["type"] = val
        elif key == "title":
            proj["title"] = val.strip('"')
    return proj


# ------------------------------------------------------------------ .frm / .ctl forms
def parse_control_tree(lines, i):
    """From a `Begin <Type> <Name>` line at index i, return (node, next_index).
    BeginProperty..EndProperty groups are skipped as opaque property values."""
    m = BEGIN_RE.match(lines[i])
    node = dict(ctype=m.group(1), name=m.group(2), props={}, children=[])
    i += 1
    n = len(lines)
    while i < n:
        ln = lines[i]
        if BEGINPROP_RE.match(ln):
            depth = 1
            i += 1
            while i < n and depth > 0:
                if BEGINPROP_RE.match(lines[i]):
                    depth += 1
                elif ENDPROP_RE.match(lines[i]):
                    depth -= 1
                i += 1
            continue
        if BEGIN_RE.match(ln):
            child, i = parse_control_tree(lines, i)
            node["children"].append(child)
            continue
        if END_RE.match(ln):
            return node, i + 1
        pm = PROP_RE.match(ln)
        if pm:
            node["props"][pm.group(1)] = pm.group(2).strip()
        i += 1
    return node, i


def split_form(text):
    """Return (root_control_or_None, struct_text, code_text, vb_name)."""
    lines = text.split("\n")
    start = next((k for k, ln in enumerate(lines) if BEGIN_RE.match(ln)), None)
    vb_name = None
    nm = ATTR_NAME_RE.search(text)
    if nm:
        vb_name = nm.group(1)
    if start is None:
        return None, "", text, vb_name
    root, end = parse_control_tree(lines, start)
    struct_text = "\n".join(lines[start:end])
    code_text = "\n".join(lines[end:])
    return root, struct_text, code_text, vb_name


def is_third_party(ctype):
    """Intrinsic VB6 controls are `VB.*`; everything else is a third-party OCX/ActiveX."""
    return not ctype.upper().startswith("VB.")


def flatten_controls(node, depth=0, out=None, menus=None):
    if out is None:
        out, menus = [], []
    bucket = menus if node["ctype"].lower() == "vb.menu" else out
    bucket.append((depth, node))
    for c in node["children"]:
        flatten_controls(c, depth + 1, out, menus)
    return out, menus


def list_event_procs(code_text):
    """Names of event/handler procedures defined in the form code (Ctrl_Event)."""
    procs = []
    for ln in code_text.split("\n"):
        m = PROC_RE.match(ln)
        if m:
            procs.append((m.group(1).strip(), m.group(2)))
    return procs


# ------------------------------------------------------------------ .bas / .cls modules
def split_procedures(code_text):
    """Yield ('declarations'|kind, name, body) blocks. Declarations = everything before proc 1."""
    lines = code_text.split("\n")
    starts = [k for k, ln in enumerate(lines) if PROC_RE.match(ln)]
    blocks = []
    decl_end = starts[0] if starts else len(lines)
    decl = "\n".join(lines[:decl_end]).strip()
    if decl:
        blocks.append(("declarations", "(module-level)", decl))
    for idx, s in enumerate(starts):
        e = starts[idx + 1] if idx + 1 < len(starts) else len(lines)
        m = PROC_RE.match(lines[s])
        blocks.append((m.group(1).strip(), m.group(2), "\n".join(lines[s:e]).rstrip()))
    return blocks


# ------------------------------------------------------------------ writers
def controls_md(name, root, struct_text):
    flat, menus = flatten_controls(root)
    rows = ["| Control | Type | Name | Caption | Index | OCX gap |",
            "|---|---|---|---|---|---|"]
    for depth, node in flat:
        indent = "&nbsp;" * (depth * 2)
        cap = node["props"].get("Caption", node["props"].get("Text", "")).strip('"')
        idx = node["props"].get("Index", "")
        gap = "⚠ yes" if is_third_party(node["ctype"]) else ""
        rows.append(f"| {indent}{node['name']} | {node['ctype']} | {node['name']} | {cap} | {idx} | {gap} |")
    menu_md = ""
    if menus:
        menu_md = "\n## Menus\n\n" + "\n".join(
            f"{'  ' * d}- {n['name']} — {n['props'].get('Caption', '').strip(chr(34))}" for d, n in menus
        ) + "\n"
    return (f"# Form controls: {name}\n\n## Control tree\n\n" + "\n".join(rows) + "\n"
            + menu_md + "\n## Source\n\n" + fence(struct_text))


def page_md(name, root, code_text):
    cap = root["props"].get("Caption", "").strip('"') if root else ""
    events = list_event_procs(code_text)
    ev_md = "\n".join(f"- `{k} {n}`" for k, n in events) or "_(none detected)_"
    n_ctrl = sum(1 for _ in flatten_controls(root)[0]) if root else 0
    n_ocx = sum(1 for _, c in flatten_controls(root)[0] if is_third_party(c["ctype"])) if root else 0
    return (f"# Page (form): {name}\n\n"
            f"- caption: {cap}\n- controls: {n_ctrl}  (third-party OCX: {n_ocx})\n"
            f"- controls sidecar: `{safe_name(name)}.controls.md`\n\n"
            f"## Event / handler procedures\n\n{ev_md}\n\n"
            f"## Form code (Declarations + event procedures)\n\n{fence(code_text)}")


def module_md(name, kind, code_text):
    blocks = split_procedures(code_text)
    summary = "\n".join(f"- `{k}` **{n}**" for k, n, _ in blocks) or "_(empty)_"
    return (f"# {kind}: {name}\n\n## Procedures\n\n{summary}\n\n## Source\n\n{fence(code_text)}")


def project_md(proj, vbp_path, extra_files):
    lines = ["# Project overview (Visual Basic 6)", ""]
    if vbp_path:
        lines.append(f"- Project file: `{vbp_path}`")
    if proj:
        lines += [f"- Type: {proj.get('type') or '?'}", f"- Title: {proj.get('title') or ''}",
                  f"- Startup object: {proj.get('startup') or '?'}",
                  f"- Forms: {len(proj['forms'])}", f"- Modules: {len(proj['modules'])}",
                  f"- Classes: {len(proj['classes'])}", f"- User controls: {len(proj['usercontrols'])}", ""]
        if proj["objects"]:
            lines.append("## Third-party OCX / ActiveX objects (Stage 2 GAP candidates)")
            lines += [f"- `{o}`" for o in proj["objects"]] + [""]
        if proj["references"]:
            lines.append("## References")
            lines += [f"- `{r}`" for r in proj["references"]] + [""]
    if extra_files:
        lines.append("## Source files processed")
        lines += [f"- `{f}`" for f in extra_files]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vbp", help="path to the .vbp project file")
    ap.add_argument("--src", help="glob for source files when no .vbp (e.g. \"conversion/src/*\")")
    ap.add_argument("--out", default="pre-convert")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not args.dry_run:
        os.makedirs(args.out, exist_ok=True)

    written, manifest, discarded = [], [], []
    proj = None
    base = os.path.dirname(args.vbp) if args.vbp else ""
    files = []
    if args.vbp and os.path.exists(args.vbp):
        proj = parse_vbp(read_text(args.vbp))
        for rel in proj["forms"]:
            files.append(os.path.join(base, rel))
        for rel in proj["modules"] + proj["classes"] + proj["usercontrols"]:
            files.append(os.path.join(base, rel))
    if args.src:
        files += [p for p in sorted(glob.glob(args.src))
                  if p.lower().endswith((".frm", ".bas", ".cls", ".ctl"))]
    files = [f for f in dict.fromkeys(files) if os.path.exists(f)]  # dedupe, keep existing

    processed = []
    for path in files:
        ext = os.path.splitext(path)[1].lower()
        text = read_text(path)
        processed.append(os.path.basename(path))
        if ext in (".frm", ".ctl"):
            root, struct, code, vbname = split_form(text)
            name = safe_name(vbname or os.path.splitext(os.path.basename(path))[0])
            if root is None:
                discarded.append(f"{os.path.basename(path)}: no `Begin VB.Form` structure found")
            write_if_new(os.path.join(args.out, f"{name}.controls.md"),
                         controls_md(name, root, struct) if root else f"# {name}\n\n(no control tree)\n",
                         written, args.dry_run)
            write_if_new(os.path.join(args.out, f"{name}.page.md"),
                         page_md(name, root, code), written, args.dry_run)
            manifest.append(f"- `{name}.page.md` (+controls) — {os.path.basename(path)}")
        elif ext in (".bas", ".cls"):
            nm = ATTR_NAME_RE.search(text)
            name = safe_name(nm.group(1) if nm else os.path.splitext(os.path.basename(path))[0])
            kind = "Module (standard)" if ext == ".bas" else "Class module"
            write_if_new(os.path.join(args.out, f"{name}.proc.md"),
                         module_md(name, kind, text), written, args.dry_run)
            manifest.append(f"- `{name}.proc.md` — {kind} ({os.path.basename(path)})")
        else:
            discarded.append(f"{os.path.basename(path)}: unsupported extension")

    write_if_new(os.path.join(args.out, "_project.md"),
                 project_md(proj, args.vbp, processed), written, args.dry_run)
    if discarded:
        write_if_new(os.path.join(args.out, "_discarded.md"),
                     "# Not captured (review before discarding)\n\n" + "\n".join(f"- {d}" for d in discarded) + "\n",
                     written, args.dry_run)
    idx = ["# Conversion manifest (pre-convert)", "",
           "_Generated by vb6-project-split.py. Downstream scripts re-parse each element file._", ""]
    idx += sorted(set(manifest))
    write_if_new(os.path.join(args.out, "index.md"), "\n".join(idx) + "\n", written, args.dry_run)

    print(f"wrote {len(set(written))} files to {args.out}/  ({len(files)} source file(s))")
    for line in sorted(set(manifest)):
        print("  " + line)
    if discarded:
        print("\nNOT CAPTURED (see _discarded.md):")
        for d in discarded:
            print("  " + d)


if __name__ == "__main__":
    main()
