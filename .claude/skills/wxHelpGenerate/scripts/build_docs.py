#!/usr/bin/env python3
"""Build an HTML help site and/or a PDF manual from section Markdown + config.

Reads a docs-workspace produced by the app-help-docs skill:
    docs-workspace/
        config.json
        sections/*.md
        screens/<id>/img/*        (images referenced by sections)

Outputs:
    docs-workspace/site/                       (HTML help site, self-contained)
    docs-workspace/<ProductName>-User-Guide.pdf (PDF manual)

Usage:
    python build_docs.py docs-workspace --html --pdf
    python build_docs.py docs-workspace --html            # HTML only
    python build_docs.py docs-workspace --pdf --css my.css # PDF with custom CSS

Cross-links between sections use the target filename, e.g. [Card](card-detail.md);
they are rewritten to card-detail.html (HTML) or internal anchors (PDF).

Markdown rendering uses the `markdown` package if available, else a small
built-in converter that covers headings, paragraphs, lists, images, links,
bold/italic, code, and tables.

PDF engine order: weasyprint -> wkhtmltopdf -> headless Chrome --print-to-pdf.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import date

# ---------- Markdown ----------

try:
    import markdown as _md

    def md_to_html(text):
        return _md.markdown(text, extensions=["tables", "fenced_code", "toc"])
    HAVE_MD = True
except ImportError:
    HAVE_MD = False

    def _inline(s):
        s = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r'<img alt="\1" src="\2">', s)
        s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
        s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return s

    def md_to_html(text):
        out, lines = [], text.split("\n")
        i, n = 0, len(lines)
        list_open = False
        while i < n:
            ln = lines[i]
            if not ln.strip():
                if list_open:
                    out.append("</ul>"); list_open = False
                i += 1; continue
            m = re.match(r"^(#{1,6})\s+(.*)$", ln)
            if m:
                if list_open:
                    out.append("</ul>"); list_open = False
                lvl = len(m.group(1))
                out.append(f"<h{lvl}>{_inline(m.group(2))}</h{lvl}>")
                i += 1; continue
            if "|" in ln and i + 1 < n and re.match(r"^[\s|:-]+$", lines[i + 1]):
                header = [c.strip() for c in ln.strip().strip("|").split("|")]
                rows = []
                i += 2
                while i < n and "|" in lines[i] and lines[i].strip():
                    rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                    i += 1
                t = ["<table><thead><tr>"] + [f"<th>{_inline(h)}</th>" for h in header] + ["</tr></thead><tbody>"]
                for r in rows:
                    t.append("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>")
                t.append("</tbody></table>")
                out.append("".join(t)); continue
            m = re.match(r"^\s*[-*]\s+(.*)$", ln)
            if m:
                if not list_open:
                    out.append("<ul>"); list_open = True
                out.append(f"<li>{_inline(m.group(1))}</li>")
                i += 1; continue
            m = re.match(r"^\s*\d+\.\s+(.*)$", ln)
            if m:
                if not list_open:
                    out.append("<ol>"); list_open = True
                out.append(f"<li>{_inline(m.group(1))}</li>")
                i += 1; continue
            if list_open:
                out.append("</ul>"); list_open = False
            out.append(f"<p>{_inline(ln)}</p>")
            i += 1
        if list_open:
            out.append("</ul>")
        return "\n".join(out)


# ---------- Model ----------

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


class Section:
    def __init__(self, sid, path, ws):
        self.id = sid
        self.path = path
        with open(path, encoding="utf-8") as f:
            self.raw = f.read()
        m = re.search(r"^#\s+(.*)$", self.raw, re.M)
        self.title = m.group(1).strip() if m else sid
        self.ws = ws

    def fields(self):
        """Extract '**Field** — desc' lines under 'Fields and what they show'."""
        out = []
        m = re.search(r"##\s+Fields and what they show(.*?)(?:\n##\s|\Z)",
                      self.raw, re.S | re.I)
        if not m:
            return out
        block = m.group(1)
        for line in block.split("\n"):
            fm = re.match(r"^\s*[-*]?\s*\*\*(.+?)\*\*\s*[—:-]\s*(.+)$", line)
            if fm:
                out.append((fm.group(1).strip(), fm.group(2).strip()))
            else:  # table rows: | Field | desc |
                tm = re.match(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|", line)
                if tm and tm.group(1).lower() not in ("field", "column", ":--", "---"):
                    out.append((tm.group(1).strip(), tm.group(2).strip()))
        return out

    def body_html(self, link_map, for_pdf=False):
        text = self.raw
        # rewrite cross-links foo.md -> foo.html (or #anchor for pdf)
        def repl(m):
            label, target = m.group(1), m.group(2)
            base = os.path.basename(target)
            if base.endswith(".md"):
                tid = base[:-3]
                if for_pdf:
                    return f"[{label}](#sec-{slug(tid)})"
                return f"[{label}]({link_map.get(tid, tid + '.html')})"
            return m.group(0)
        text = re.sub(r"\[([^\]]+)\]\(([^)]+\.md)\)", repl, text)
        html = md_to_html(text)
        # fix image src to point at the section img dir
        html = re.sub(r'src="img/',
                      f'src="{self._img_prefix(for_pdf)}', html)
        return html

    def _img_prefix(self, for_pdf):
        if for_pdf:
            return f"screens/{self.id}/img/"
        return f"assets/img/{self.id}/"


def load_workspace(ws):
    cfg_path = os.path.join(ws, "config.json")
    cfg = {}
    if os.path.exists(cfg_path):
        with open(cfg_path, encoding="utf-8") as f:
            cfg = json.load(f)
    cfg.setdefault("product_name", "Application")
    cfg.setdefault("theme", {})
    sec_dir = os.path.join(ws, "sections")
    files = {}
    if os.path.isdir(sec_dir):
        for fn in os.listdir(sec_dir):
            if fn.endswith(".md"):
                sid = fn[:-3]
                files[sid] = Section(sid, os.path.join(sec_dir, fn), ws)
    order = cfg.get("section_order", [])
    ordered = [files[s] for s in order if s in files]
    ordered += [files[s] for s in sorted(files) if s not in order]
    if not ordered:
        sys.exit(f"No sections found in {sec_dir}. Nothing to build.")
    return cfg, ordered


# ---------- CSS ----------

def css(cfg, custom=None):
    if custom and os.path.exists(custom):
        return open(custom, encoding="utf-8").read()
    t = cfg.get("theme", {})
    accent = t.get("accent", "#2563eb")
    font = {"serif": "Georgia, 'Times New Roman', serif",
            "system": "-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"} \
        .get(t.get("font", "system"), t.get("font", "-apple-system, Segoe UI, Roboto, sans-serif"))
    return f"""
:root {{ --accent: {accent}; }}
* {{ box-sizing: border-box; }}
body {{ font-family: {font}; color: #1f2328; line-height: 1.6; margin: 0; }}
a {{ color: var(--accent); text-decoration: none; }}
a:hover {{ text-decoration: underline; }}
h1,h2,h3 {{ line-height: 1.25; }}
h1 {{ font-size: 1.9rem; border-bottom: 2px solid var(--accent); padding-bottom: .3em; }}
h2 {{ font-size: 1.35rem; margin-top: 1.8em; }}
img {{ max-width: 100%; border: 1px solid #d0d7de; border-radius: 6px; margin: .5em 0; }}
code {{ background: #f6f8fa; padding: .1em .35em; border-radius: 4px; font-size: .9em; }}
table {{ border-collapse: collapse; width: 100%; margin: 1em 0; }}
th,td {{ border: 1px solid #d0d7de; padding: .5em .7em; text-align: left; vertical-align: top; }}
th {{ background: #f6f8fa; }}
.layout {{ display: flex; align-items: flex-start; }}
.sidebar {{ width: 250px; min-width: 250px; padding: 1.2em; border-right: 1px solid #d0d7de;
  height: 100vh; position: sticky; top: 0; overflow-y: auto; background: #fafbfc; }}
.sidebar h3 {{ margin: 0 0 .3em; font-size: .8rem; text-transform: uppercase; color: #57606a; }}
.sidebar a {{ display: block; padding: .25em 0; color: #1f2328; }}
.sidebar a.active {{ color: var(--accent); font-weight: 600; }}
.content {{ padding: 2em 3em; max-width: 900px; }}
.brand {{ font-weight: 700; font-size: 1.1rem; margin-bottom: 1em; color: var(--accent); }}
.search {{ width: 100%; padding: .5em; margin-bottom: 1em; border: 1px solid #d0d7de; border-radius: 6px; }}
.card {{ border: 1px solid #d0d7de; border-radius: 8px; padding: 1em 1.2em; margin: .6em 0; }}
.card a {{ font-weight: 600; font-size: 1.1rem; }}
@media print {{ .sidebar, .search {{ display: none; }} }}
"""


# ---------- HTML site ----------

def page(cfg, title, nav, body, theme_css, depth_home="index.html"):
    logo = ""
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — {cfg['product_name']} Help</title>
<style>{theme_css}</style></head>
<body><div class="layout">
<nav class="sidebar">
<div class="brand"><a href="{depth_home}">{cfg['product_name']} Help</a></div>
<input class="search" id="q" placeholder="Search…" onkeyup="flt()">
{nav}
</nav>
<main class="content">{body}</main>
</div>
<script>
function flt(){{var v=document.getElementById('q').value.toLowerCase();
document.querySelectorAll('.sidebar a[data-t]').forEach(function(a){{
a.style.display=a.getAttribute('data-t').indexOf(v)>-1?'block':'none';}});}}
</script></body></html>"""


def build_nav(sections, active=None):
    items = ['<h3>Sections</h3>']
    for s in sections:
        cls = ' class="active"' if s.id == active else ''
        items.append(f'<a{cls} data-t="{s.title.lower()}" href="{s.id}.html">{s.title}</a>')
    items.append('<h3>Reference</h3>')
    items.append('<a data-t="fields index" href="fields-index.html">A–Z field index</a>')
    return "\n".join(items)


def build_html(ws, cfg, sections, custom_css):
    site = os.path.join(ws, "site")
    if os.path.exists(site):
        shutil.rmtree(site)
    os.makedirs(os.path.join(site, "assets", "img"), exist_ok=True)
    theme_css = css(cfg, custom_css)
    open(os.path.join(site, "assets", "style.css"), "w", encoding="utf-8").write(theme_css)

    # copy images
    for s in sections:
        src = os.path.join(ws, "screens", s.id, "img")
        if os.path.isdir(src):
            dst = os.path.join(site, "assets", "img", s.id)
            shutil.copytree(src, dst, dirs_exist_ok=True)
    # copy logo
    logo = cfg.get("theme", {}).get("logo")
    if logo and os.path.exists(os.path.join(ws, logo)):
        shutil.copy(os.path.join(ws, logo), os.path.join(site, "assets", "logo.png"))

    link_map = {s.id: f"{s.id}.html" for s in sections}
    unresolved = []

    # home / index
    cards = [f'<div class="card"><a href="{s.id}.html">{s.title}</a></div>' for s in sections]
    home_body = f"<h1>{cfg['product_name']} Help</h1><p>Select a topic:</p>" + "".join(cards)
    open(os.path.join(site, "index.html"), "w", encoding="utf-8").write(
        page(cfg, "Home", build_nav(sections), home_body, theme_css))

    # section pages
    for s in sections:
        body = s.body_html(link_map, for_pdf=False)
        for m in re.finditer(r'href="([^"]+\.html)"', body):
            tgt = m.group(1)
            if tgt not in link_map.values() and not tgt.startswith("http"):
                unresolved.append((s.id, tgt))
        open(os.path.join(site, f"{s.id}.html"), "w", encoding="utf-8").write(
            page(cfg, s.title, build_nav(sections, s.id), body, theme_css))

    # fields index
    entries = []
    for s in sections:
        for name, desc in s.fields():
            entries.append((name, desc, s))
    entries.sort(key=lambda e: e[0].lower())
    rows = "".join(
        f'<tr><td><strong>{n}</strong></td><td>{d}</td>'
        f'<td><a href="{s.id}.html">{s.title}</a></td></tr>'
        for n, d, s in entries)
    fbody = ("<h1>A–Z field index</h1>"
             "<p>Every documented field, column, filter, and status.</p>"
             "<table><thead><tr><th>Field</th><th>What it shows</th><th>Screen</th></tr></thead>"
             f"<tbody>{rows}</tbody></table>")
    open(os.path.join(site, "fields-index.html"), "w", encoding="utf-8").write(
        page(cfg, "Field index", build_nav(sections), fbody, theme_css))

    print(f"HTML site -> {site}  ({len(sections)} sections, {len(entries)} fields)")
    if unresolved:
        print("  WARNING unresolved links:")
        for sid, tgt in unresolved:
            print(f"    {sid}.html -> {tgt}")
    return unresolved


# ---------- PDF ----------

def build_pdf(ws, cfg, sections, custom_css):
    theme_css = css(cfg, custom_css)
    parts = [f"<style>{theme_css}\n.pdf-cover{{text-align:center;padding-top:30vh;}}"
             ".pagebreak{page-break-before:always;} .content{max-width:none;padding:0 1cm;}</style>"]
    parts.append('<div class="content">')
    # cover
    logo = cfg.get("theme", {}).get("logo")
    logo_html = ""
    if logo and os.path.exists(os.path.join(ws, logo)):
        logo_html = f'<img src="{logo}" style="max-width:200px;border:none">'
    parts.append(f'<div class="pdf-cover">{logo_html}<h1 style="border:none">'
                 f'{cfg["product_name"]}<br>User Guide</h1>'
                 f'<p>{date.today().isoformat()}</p></div>')
    # toc
    toc = ['<div class="pagebreak"><h1>Contents</h1><ol>']
    for s in sections:
        toc.append(f'<li><a href="#sec-{slug(s.id)}">{s.title}</a></li>')
    toc.append("</ol></div>")
    parts.append("\n".join(toc))
    # sections
    for s in sections:
        body = s.body_html({}, for_pdf=True)
        parts.append(f'<div class="pagebreak"><a name="sec-{slug(s.id)}"></a>{body}</div>')
    parts.append("</div>")
    html = "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>" + \
           "\n".join(parts) + "</body></html>"

    tmp = os.path.join(ws, "_pdf_build.html")
    open(tmp, "w", encoding="utf-8").write(html)
    out = os.path.join(ws, f"{re.sub(r'[^A-Za-z0-9]+','-',cfg['product_name']).strip('-')}-User-Guide.pdf")

    # engine 1: weasyprint
    try:
        from weasyprint import HTML
        HTML(tmp, base_url=ws).write_pdf(out)
        os.remove(tmp)
        print(f"PDF -> {out}  (weasyprint)")
        return out
    except Exception as e:
        w_err = e
    # engine 2: wkhtmltopdf
    if shutil.which("wkhtmltopdf"):
        try:
            subprocess.run(["wkhtmltopdf", "--enable-local-file-access", tmp, out], check=True)
            os.remove(tmp)
            print(f"PDF -> {out}  (wkhtmltopdf)")
            return out
        except Exception:
            pass
    # engine 3: headless chrome
    chrome = next((c for c in ("google-chrome", "chromium", "chromium-browser",
                               "chrome") if shutil.which(c)), None)
    if chrome:
        try:
            subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu",
                            f"--print-to-pdf={out}", "--no-pdf-header-footer",
                            f"file://{os.path.abspath(tmp)}"], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"PDF -> {out}  (headless chrome)")
            return out
        except Exception:
            pass
    print(f"PDF build failed. Install weasyprint (pip install weasyprint) or "
          f"wkhtmltopdf. HTML kept at {tmp}. weasyprint error: {w_err}")
    return None


def main():
    ap = argparse.ArgumentParser(description="Build HTML help site and/or PDF manual.")
    ap.add_argument("workspace", help="path to docs-workspace")
    ap.add_argument("--html", action="store_true")
    ap.add_argument("--pdf", action="store_true")
    ap.add_argument("--css", help="custom stylesheet override")
    ap.add_argument("--base-url", default="", help="base URL for hosted HTML links")
    args = ap.parse_args()
    if not (args.html or args.pdf):
        args.html = args.pdf = True

    cfg, sections = load_workspace(args.workspace)
    if args.base_url:
        cfg["base_url"] = args.base_url
    if args.html:
        build_html(args.workspace, cfg, sections, args.css)
    if args.pdf:
        build_pdf(args.workspace, cfg, sections, args.css)


if __name__ == "__main__":
    main()
