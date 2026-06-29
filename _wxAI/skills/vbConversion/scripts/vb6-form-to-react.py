#!/usr/bin/env python3
"""
vb6-form-to-react.py - Regenerate a VB6 form as a modern React + Tailwind + shadcn/ui component.

Reads a pre-convert/<Form>.controls.md (control tree + verbatim Begin..End fence) and the matching
<Form>.page.md (event code), and writes rebuild/pages/<Form>.tsx.

Mapping (intrinsic VB6 -> shadcn):
    VB.TextBox      -> Input (Textarea when MultiLine); DataField-bound -> a record field
    VB.Label        -> <Label> / static text
    VB.CommandButton-> <Button>   (Caption's & accelerator stripped)
    VB.ComboBox     -> <Select>            VB.ListBox  -> list
    VB.CheckBox     -> <Checkbox>          VB.OptionButton -> radio
    VB.Frame        -> <Card>              VB.Data     -> a record-navigator (not a visual control)
    VB.Line/Shape   -> separator (decorative)   VB.Timer -> useEffect interval (noted)
    VB.Menu         -> a menubar (emitted as a comment block — wire to your app shell)
    third-party OCX -> {/* GAP: ... */} placeholder (needs a deliberate library choice)

Behavior is WIRED: each control with an event Sub (cmdAdd_Click, Form_Load) becomes an
`async function on<Ctrl><Event>()` stub carrying the original VB as comments + a TODO; bound fields
read/write a `record` state object whose shape matches the Stage-3 inferred table.

Usage:
    python scripts/vb6-form-to-react.py --page pre-convert/frmMain.controls.md --out rebuild/pages
"""
import argparse
import os
import re

FENCE_RE = re.compile(r"```(?:vb)?\n(.*?)```", re.S)
BEGIN_RE = re.compile(r"^\s*Begin\s+(\S+)\s+(\S+)\s*$", re.I)
END_RE = re.compile(r"^\s*End\s*$", re.I)
PROP_RE = re.compile(r"^\s*(\w+)\s*=\s*(.*)$")
SUB_RE = re.compile(r"^\s*(?:Public\s+|Private\s+|Friend\s+|Static\s+)*(Sub|Function)\s+(\w+)", re.I)


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
    return [m.group(1) for m in FENCE_RE.finditer(text)]


def parse_tree(struct_text):
    """Return (roots, all_nodes). BeginProperty/EndProperty are not control openers (no space after
    'Begin'/'End'), so they fall through as harmless property lines."""
    roots, stack, nodes = [], [], []
    for ln in struct_text.split("\n"):
        m = BEGIN_RE.match(ln)
        if m:
            node = dict(ctype=m.group(1), name=m.group(2), props={}, children=[])
            (stack[-1]["children"] if stack else roots).append(node)
            stack.append(node)
            nodes.append(node)
            continue
        if END_RE.match(ln):
            if stack:
                stack.pop()
            continue
        pm = PROP_RE.match(ln)
        if pm and stack:
            stack[-1]["props"].setdefault(pm.group(1), pm.group(2).strip())
    return roots, nodes


def extract_subs(code):
    """{sub_name: [body_lines]} for each Sub/Function in the form code."""
    procs, lines, i, n = {}, code.split("\n"), 0, 0
    lines = code.split("\n")
    i, n = 0, len(lines)
    while i < n:
        m = SUB_RE.match(lines[i])
        if m:
            kind, name, body = m.group(1), m.group(2), [lines[i]]
            i += 1
            while i < n and not re.match(rf"^\s*End\s+{kind}\b", lines[i], re.I):
                body.append(lines[i])
                i += 1
            if i < n:
                body.append(lines[i])
            procs[name] = body
        i += 1
    return procs


def clean_caption(cap):
    return (cap or "").strip('"').replace("&", "")


def jsx_id(name):
    return re.sub(r"[^A-Za-z0-9_]", "_", name)


def handler_name(sub):
    return "on" + re.sub(r"[^A-Za-z0-9]", "", sub.title().replace("_", ""))


def is_ocx(ctype):
    return not ctype.upper().startswith("VB.")


def comment_block(lines, indent="    "):
    return "\n".join(f"{indent}// {ln.rstrip()}" for ln in lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--page", required=True, help="pre-convert/<Form>.controls.md")
    ap.add_argument("--out", default="rebuild/pages")
    args = ap.parse_args()

    controls_text = read(args.page)
    base = os.path.basename(args.page)[: -len(".controls.md")]
    page_md = os.path.join(os.path.dirname(args.page), f"{base}.page.md")
    code = "\n".join(fences(read(page_md))) if os.path.exists(page_md) else ""
    subs = extract_subs(code)

    struct = fences(controls_text)
    roots, nodes = parse_tree(struct[0]) if struct else ([], [])
    form = roots[0] if roots else dict(name=base, props={}, children=[])
    title = clean_caption(form["props"].get("Caption")) or base

    bound, buttons, checks, combos, labels, menus, gaps, timers = [], [], [], [], [], [], [], []
    for nd in nodes:
        ct = nd["ctype"].lower()
        if ct == "vb.menu":
            menus.append(nd)
        elif is_ocx(nd["ctype"]):
            gaps.append(nd)
        elif ct == "vb.textbox":
            bound.append(nd)  # textbox -> field (bound or free)
        elif ct == "vb.commandbutton":
            buttons.append(nd)
        elif ct == "vb.checkbox":
            checks.append(nd)
        elif ct == "vb.combobox" or ct == "vb.listbox":
            combos.append(nd)
        elif ct == "vb.label":
            labels.append(nd)
        elif ct == "vb.timer":
            timers.append(nd)

    # ---- assemble the component ----
    L = []
    L.append("// [vbConversion] Regenerated from VB6 form '%s'. Modern app-shell, NOT a 1:1 layout." % base)
    L.append('import { useState } from "react";')
    L.append('import { Button } from "@/components/ui/button";')
    L.append('import { Input } from "@/components/ui/input";')
    L.append('import { Label } from "@/components/ui/label";')
    L.append('import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";')
    if checks:
        L.append('import { Checkbox } from "@/components/ui/checkbox";')
    L.append("")
    # record shape from the bound DataFields
    fields = [(nd["props"].get("DataField", "").strip('"'), nd["name"]) for nd in bound if nd["props"].get("DataField")]
    L.append("type RecordShape = {")
    for df, _ in fields:
        L.append(f"  {jsx_id(df)}?: string;")
    L.append("};")
    L.append("")
    L.append(f"export default function {jsx_id(base)}() {{")
    L.append("  const [record, setRecord] = useState<RecordShape>({});")
    L.append("  const setField = (k: keyof RecordShape, v: string) => setRecord((r) => ({ ...r, [k]: v }));")
    L.append("")
    # event handler stubs (only those referenced by a control event or form lifecycle)
    emitted = set()
    for sub, body in subs.items():
        hn = handler_name(sub)
        if hn in emitted:
            continue
        emitted.add(hn)
        L.append(f"  // [VB6] {sub} — port this logic (original below):")
        L.append(f"  async function {hn}() {{")
        L.append(comment_block(body, "    "))
        L.append("    // TODO: implement against your API / data layer.")
        L.append("  }")
        L.append("")
    # render
    L.append("  return (")
    L.append("    <Card className=\"max-w-3xl mx-auto my-6\">")
    L.append(f"      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>")
    L.append("      <CardContent className=\"grid grid-cols-2 gap-4\">")
    for nd in bound:
        df = nd["props"].get("DataField", "").strip('"')
        ml = nd["props"].get("MultiLine", "")
        key = jsx_id(df) if df else jsx_id(nd["name"])
        lbl = df or nd["name"]
        bind = (f' value={{record.{key} ?? ""}} onChange={{(e) => setField("{key}", e.target.value)}}'
                if df else "")
        L.append("        <div className=\"flex flex-col gap-1\">")
        L.append(f"          <Label htmlFor=\"{key}\">{lbl}</Label>")
        L.append(f"          <Input id=\"{key}\"{bind} />")
        L.append("        </div>")
    for nd in checks:
        cap = clean_caption(nd["props"].get("Caption")) or nd["name"]
        L.append(f"        <div className=\"flex items-center gap-2\"><Checkbox id=\"{jsx_id(nd['name'])}\" />"
                 f"<Label htmlFor=\"{jsx_id(nd['name'])}\">{cap}</Label></div>")
    for nd in gaps:
        L.append(f"        {{/* GAP: VB6 third-party control {nd['ctype']} '{nd['name']}' — choose a React "
                 f"library (grid/media/etc.) and wire it. */}}")
    if buttons:
        L.append("      </CardContent>")
        L.append("      <CardContent className=\"flex flex-wrap gap-2 border-t pt-4\">")
        for nd in buttons:
            cap = clean_caption(nd["props"].get("Caption")) or nd["name"]
            click = subs.get(f"{nd['name']}_Click")
            onclick = f" onClick={{{handler_name(nd['name'] + '_Click')}}}" if click else ""
            L.append(f"        <Button{onclick}>{cap}</Button>")
    L.append("      </CardContent>")
    L.append("    </Card>")
    L.append("  );")
    L.append("}")

    # menus / timers as a trailing note
    if menus or timers:
        L.append("")
        L.append("/* Not rendered inline — wire into your app shell:")
        for nd in menus:
            L.append(f" *   Menu  {nd['name']} — \"{clean_caption(nd['props'].get('Caption'))}\""
                     + (f"  (handler {handler_name(nd['name'] + '_Click')})" if f"{nd['name']}_Click" in subs else ""))
        for nd in timers:
            L.append(f" *   Timer {nd['name']} — Interval {nd['props'].get('Interval', '?')}ms"
                     " -> useEffect(() => {{ const id = setInterval(...); return () => clearInterval(id); }})")
        L.append(" */")

    os.makedirs(args.out, exist_ok=True)
    out_path = os.path.join(args.out, f"{jsx_id(base)}.tsx")
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

    print(f"{base}: controls={len(nodes)}  fields={len(bound)}  buttons={len(buttons)}  "
          f"handlers={len(emitted)}  menus={len(menus)}  ocx-gaps={len(gaps)}")
    print(f"  -> {out_path}")


if __name__ == "__main__":
    main()
