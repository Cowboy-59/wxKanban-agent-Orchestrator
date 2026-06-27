#!/usr/bin/env python3
"""Extract the explicit cross-scope dependency graph from specs/Project-Scope/*.md.

This handles the MECHANICAL half of the scope-flow-map skill: it reads every scope
doc, pulls each scope's number/title/status, and parses the **Depends On** and
**Related Scopes** metadata lines into a resolved edge list. References are resolved
against the set of scope numbers that actually exist on disk, which filters out
years, dates, version strings, and FR/task numbers that would otherwise look like
edges.

It deliberately does NOT infer the implicit, cross-process connections that are the
real point of the skill (those live in prose and need judgment) — it emits a clean,
deterministic baseline plus a list of unresolved references for Claude to reason over.

Usage:
    python extract_scope_edges.py [--scopes-dir DIR] [--format json|mermaid|both]

Output is written to stdout. Run with PYTHONUTF8=1 on Windows consoles.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Regexes
# ---------------------------------------------------------------------------
# Strip these noise patterns from a dependency line BEFORE harvesting numbers,
# so dates/versions/FR-task ids never masquerade as scope references.
NOISE_PATTERNS = [
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),     # ISO dates  2026-06-14
    re.compile(r"\bv?\d+\.\d+(?:\.\d+)*\b"),  # versions   1.5.118 / v0.1.7
    re.compile(r"\bFR-\d+\b", re.I),          # FR ids
    re.compile(r"\bT\d{2,4}\b"),              # task ids   T042
    re.compile(r"\bAES-256\b", re.I),         # known false friend
    re.compile(r"\bUUID\s*v?\d+\b", re.I),    # UUID v7
]

# Candidate references inside a (cleaned) dependency line. Group 1 captures the
# citation form so the resolver can honour the SCOPE-NNN vs SPEC-NNN namespace:
#   SCOPE-NNN              -> always a scope node (namespace="scope")
#   SPEC-NNN               -> always an impl-spec, external node (namespace="spec")
#   "spec NNN" / "Spec NNN"-> legacy spaced prose; resolve to a scope if one
#                             exists, else an impl-spec  (namespace="specword")
#   bare NNN / (NNN)       -> resolve to a scope if one exists, else DROP
#                             (bare numbers are too noisy to mint external nodes)
REF_PATTERN = re.compile(
    r"(SCOPE-|SPEC-|spec\s+|Spec\s+)?\(?(\d{2,3})\b"
)

H1_PATTERN = re.compile(r"^#\s+(.+?)\s*$")
# Strip a leading citation prefix that some H1s carry (SCOPE-060:, Spec 010:, Scope 044 —, 014-).
TITLE_PREFIX = re.compile(
    r"^(?:SCOPE-\d+|SPEC-\d+|Spec\s+\d+|Scope\s+\d+|\d+)\s*[:\-—]?\s*", re.I
)
NUM_FROM_NAME = re.compile(r"^(\d+)")
STATUS_PATTERN = re.compile(r"^\*\*Status\*\*\s*:\s*`?([^`\n]+?)`?\s*$", re.I)
DEPENDS_PATTERN = re.compile(r"^\*\*Depends On\*\*\s*:\s*(.+)$", re.I)
RELATED_PATTERN = re.compile(r"^\*\*Related Scopes\*\*\s*:\s*(.+)$", re.I)


def classify(prefix: str | None) -> str:
    if not prefix:
        return "bare"
    p = prefix.upper()
    if p.startswith("SCOPE-"):
        return "scope"
    if p == "SPEC-":
        return "spec"
    return "specword"  # "spec " / "Spec " — legacy, ambiguous


# "SPEC-046/048" / "SCOPE-013/016" — the slash list shares one prefix; expand so
# every number keeps the namespace of the first (otherwise "/048" reads as bare).
SLASH_LIST = re.compile(r"(SCOPE-|SPEC-)(\d{2,3})((?:/\d{2,3})+)")


def _expand_slashed(line: str) -> str:
    def repl(m: re.Match) -> str:
        prefix, first, rest = m.group(1), m.group(2), m.group(3)
        nums = [first] + rest.strip("/").split("/")
        return " ".join(f"{prefix}{n}" for n in nums)
    return SLASH_LIST.sub(repl, line)


def harvest_refs(line: str) -> list[tuple[int, str]]:
    """Return (number, namespace) pairs cited in a dependency line."""
    cleaned = _expand_slashed(line)
    for pat in NOISE_PATTERNS:
        cleaned = pat.sub(" ", cleaned)
    out: list[tuple[int, str]] = []
    seen: set[tuple[int, str]] = set()
    for m in REF_PATTERN.finditer(cleaned):
        pair = (int(m.group(2)), classify(m.group(1)))
        if pair not in seen:
            seen.add(pair)
            out.append(pair)
    return out


def clean_title(raw: str, fallback_slug: str) -> str:
    """Strip citation prefixes / trailing hashes; fall back to a slug."""
    t = TITLE_PREFIX.sub("", raw).strip().strip("#").strip()
    if not t or t == fallback_slug:
        # turn "014-SysAdmin" / "scope-timeandBilling" into something readable
        t = re.sub(r"^\d+[-_]?", "", fallback_slug).replace("-", " ").replace("_", " ").strip()
    return t or fallback_slug


def parse_scope(path: Path) -> dict | None:
    m = NUM_FROM_NAME.match(path.name)
    if not m:
        return None
    number = int(m.group(1))
    slug = path.stem
    title = ""
    status = "unknown"
    depends_raw = ""
    related_raw = ""

    text = path.read_text(encoding="utf-8", errors="replace")
    for line in text.splitlines():
        if not title:
            hm = H1_PATTERN.match(line)
            if hm and line.startswith("#"):
                title = hm.group(1).strip()
        sm = STATUS_PATTERN.match(line)
        if sm and status == "unknown":
            status = sm.group(1).strip().lower()
        dm = DEPENDS_PATTERN.match(line)
        if dm and not depends_raw:
            depends_raw = dm.group(1).strip()
        rm = RELATED_PATTERN.match(line)
        if rm and not related_raw:
            related_raw = rm.group(1).strip()

    return {
        "number": number,
        "title": clean_title(title, slug),
        "status": status,
        "source": path.as_posix(),
        "depends_raw": depends_raw,
        "related_raw": related_raw,
    }


def index_impl_specs(specs_dir: Path) -> dict[int, str]:
    """Map an impl-spec number to a readable label from its specs/NNN-* folder(s)."""
    labels: dict[int, list[str]] = {}
    if not specs_dir.is_dir():
        return {}
    for child in sorted(specs_dir.iterdir()):
        if not child.is_dir():
            continue
        m = NUM_FROM_NAME.match(child.name)
        if not m:
            continue
        num = int(m.group(1))
        label = re.sub(r"^\d+[-_]?", "", child.name).replace("-", " ").replace("_", " ").strip()
        labels.setdefault(num, []).append(label or child.name)
    # join when a number fans out to several folders (e.g. 044 -> two specs)
    return {n: " / ".join(v) for n, v in labels.items()}


def build_graph(scopes_dir: Path) -> dict:
    files = sorted(scopes_dir.glob("*.md"))
    scopes: dict[int, dict] = {}
    for f in files:
        if "_analysis" in f.parts:  # skip generated analysis reports
            continue
        rec = parse_scope(f)
        if rec is None:
            continue
        # first file wins for a given number (avoids dup-number STRUCTURE-REVIEW files)
        scopes.setdefault(rec["number"], rec)

    known = set(scopes.keys())
    spec_labels = index_impl_specs(scopes_dir.parent)

    edges: list[dict] = []           # scope -> scope
    ext_edges: list[dict] = []       # scope -> impl-spec (external node)
    ext_refs: set[int] = set()
    unresolved: list[dict] = []      # explicit SCOPE-NNN with no scope file

    for num, rec in scopes.items():
        for kind, raw in (("dependsOn", rec["depends_raw"]), ("related", rec["related_raw"])):
            if not raw or raw.strip().lower() in {"none", "n/a", "-"}:
                continue
            for ref, ns in harvest_refs(raw):
                if ref == num and ns in ("scope", "bare"):
                    continue  # self-reference noise
                exists = ref in known
                if ns == "spec":
                    # explicit SPEC-NNN: always external, even if a scope shares the int
                    ext_refs.add(ref)
                    ext_edges.append({"from": num, "to": ref, "kind": kind})
                elif ns == "scope":
                    if exists:
                        edges.append({"from": num, "to": ref, "kind": kind})
                    else:
                        unresolved.append({"from": num, "ref": ref, "kind": kind})
                elif ns == "specword":
                    # legacy "spec NNN": scope if one exists, else an impl-spec
                    if exists:
                        edges.append({"from": num, "to": ref, "kind": kind})
                    else:
                        ext_refs.add(ref)
                        ext_edges.append({"from": num, "to": ref, "kind": kind})
                else:  # bare: only trust it if it resolves to a real scope
                    if exists:
                        edges.append({"from": num, "to": ref, "kind": kind})

    edges = _dedup(edges)
    ext_edges = _dedup(ext_edges)

    nodes = [
        {"number": n, "title": s["title"], "status": s["status"], "source": s["source"]}
        for n, s in sorted(scopes.items())
    ]
    externals = [
        {"number": r, "label": spec_labels.get(r, f"SPEC-{r:03d}")}
        for r in sorted(ext_refs)
    ]
    return {
        "nodes": nodes,
        "edges": edges,
        "externals": externals,
        "extEdges": ext_edges,
        "unresolved": unresolved,
    }


def _dedup(edges: list[dict]) -> list[dict]:
    """Collapse duplicate (from,to) pairs; dependsOn wins over related."""
    best: dict[tuple[int, int], str] = {}
    for e in edges:
        key = (e["from"], e["to"])
        if key not in best or e["kind"] == "dependsOn":
            best[key] = e["kind"]
    return [{"from": a, "to": b, "kind": k} for (a, b), k in best.items()]


# Mermaid status classes — keep them in sync with references/scope-corpus.md.
STATUS_CLASS = {
    "draft": "draft",
    "approved": "approved",
    "implemented": "done",
    "shipped": "done",
    "complete": "done",
    "done": "done",
    "deployed": "done",
}


def _trim(label: str, n: int = 42) -> str:
    label = label.replace('"', "'")
    return label[: n - 3] + "..." if len(label) > n else label


def to_mermaid(graph: dict) -> str:
    lines = ["graph LR"]
    for node in graph["nodes"]:
        num = node["number"]
        lines.append(f'  S{num:03d}["SCOPE-{num:03d}<br/>{_trim(node["title"])}"]')
    # external impl-spec nodes (referenced via SPEC-NNN)
    if graph.get("externals"):
        lines.append("")
        lines.append("  subgraph EXT[Impl-specs · no scope node]")
        for ext in graph["externals"]:
            r = ext["number"]
            lines.append(f'    X{r:03d}["SPEC-{r:03d}<br/>{_trim(ext["label"])}"]')
        lines.append("  end")
    lines.append("")
    for e in graph["edges"]:
        arrow = "-->" if e["kind"] == "dependsOn" else "-.->"
        lines.append(f"  S{e['from']:03d} {arrow} S{e['to']:03d}")
    for e in graph.get("extEdges", []):
        arrow = "-->" if e["kind"] == "dependsOn" else "-.->"
        lines.append(f"  S{e['from']:03d} {arrow} X{e['to']:03d}")
    lines.append("")
    # status class assignments for scope nodes
    buckets: dict[str, list[str]] = {}
    for node in graph["nodes"]:
        cls = STATUS_CLASS.get(node["status"], "other")
        buckets.setdefault(cls, []).append(f"S{node['number']:03d}")
    for cls, ids in buckets.items():
        lines.append(f"  class {','.join(ids)} {cls};")
    if graph.get("externals"):
        lines.append(f"  class {','.join('X%03d' % e['number'] for e in graph['externals'])} ext;")
    lines += [
        "  classDef draft fill:#fff3cd,stroke:#b8860b;",
        "  classDef approved fill:#cfe2ff,stroke:#1c5fb8;",
        "  classDef done fill:#d1e7dd,stroke:#0f5132;",
        "  classDef other fill:#eee,stroke:#888;",
        "  classDef ext stroke-dasharray:5 5,fill:#f6f6f6,stroke:#888;",
        "%% solid arrow = Depends On, dotted = Related Scopes; dashed node = impl-spec",
    ]
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scopes-dir", default="specs/Project-Scope")
    ap.add_argument("--format", choices=["json", "mermaid", "both"], default="both")
    args = ap.parse_args()

    scopes_dir = Path(args.scopes_dir)
    if not scopes_dir.is_dir():
        print(f"error: scopes dir not found: {scopes_dir}", file=sys.stderr)
        return 2

    graph = build_graph(scopes_dir)

    if args.format in ("json", "both"):
        print(json.dumps(graph, indent=2, ensure_ascii=False))
    if args.format == "both":
        print("\n--- mermaid ---\n")
    if args.format in ("mermaid", "both"):
        print(to_mermaid(graph))

    print(
        f"\n%% {len(graph['nodes'])} scope nodes, {len(graph['edges'])} scope edges, "
        f"{len(graph['externals'])} impl-spec nodes, {len(graph['extEdges'])} impl-spec edges",
        file=sys.stderr,
    )
    if graph["unresolved"]:
        print(
            f"%% {len(graph['unresolved'])} unresolved SCOPE-NNN reference(s) "
            "(explicit scope citation with no scope file) — review in prose",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
