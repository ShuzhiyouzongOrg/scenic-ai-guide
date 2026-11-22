"""Verify project design references and optionally ask the installed Codex to discover Skills."""
import argparse
import json
import os
from pathlib import Path
import queue
import re
import shutil
import struct
import subprocess
import threading
import time
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs/design-system"
SKILLS = ROOT / ".agents/skills"


def check_docs():
    files = [ROOT / "AGENTS.md", *DOCS.rglob("*.md"), *SKILLS.rglob("*.md")]
    links = 0
    for file in files:
        body = file.read_text(encoding="utf-8")
        # Device bounds and code samples can contain literal [a][b] text.
        body = re.sub(r"^```[^\n]*\n.*?^```[^\n]*$", "", body, flags=re.M | re.S)
        body = re.sub(r"`[^`\n]*`", "", body)
        definitions = dict(re.findall(r"^\[([^\]]+)\]:\s+(\S+)\s*$", body, re.M))
        for reference in re.findall(r"\[[^\]\n]+\]\[([^\W\d_][\w-]*)\]", body):
            if reference not in definitions:
                raise ValueError(f"{file.relative_to(ROOT)} -> undefined reference [{reference}]")
        for link in [*re.findall(r"\]\(([^)]+)\)", body), *definitions.values()]:
            path = unquote(link.split("#", 1)[0]).strip("<>")
            if not path or "://" in path or path.startswith("mailto:"):
                continue
            if not (file.parent / path).exists():
                raise ValueError(f"{file.relative_to(ROOT)} -> {path}")
            links += 1
    print(f"{len(files)} Markdown files, {links} local links verified")


def check_rule_sources():
    """Each documented rule in these tables must keep its identity and source."""
    ids = set()
    for file, prefix in (
        ("components/component-guidelines.md", "CMP"),
        ("interaction/interaction-states.md", "INT"),
        ("motion/motion-tokens.md", "TIM"),
        ("motion/motion-principles.md", "FX|VOC|REV"),
        ("engineering/component-architecture.md", "ENG"),
        ("assets/icon-guidelines.md", "ICO"),
        ("references/source-index.md", "HIG|MOT|SRC|NAV|MED"),
        ("components/ai-ambient-orb.md", "ORB"),
        ("motion/ai-ambient-orb-motion.md", "ORB-MOT"),
        ("interaction/ai-ambient-orb-interaction.md", "ORB-INT"),
        ("engineering/ai-ambient-orb-architecture.md", "ORB-ENG"),
        ("components/ai-guide-components.md", "GUIDE-CMP"),
        ("components/navigation.md", "GUIDE-NAV"),
        ("motion/ai-guide-motion.md", "GUIDE-MOT"),
        ("interaction/ai-guide-interaction.md", "GUIDE-INT"),
        ("engineering/ai-guide-architecture.md", "GUIDE-ENG"),
    ):
        body = (DOCS / file).read_text(encoding="utf-8")
        for line in body.splitlines():
            match = re.match(rf"^(?:\| |(?:\d+\. )?\*\*)((?:{prefix})-\d+)\b", line)
            if match:
                rule = match[1]
                if rule in ids or not re.search(r"\[[^\]]+\](?:\([^)]*\)|\[[^\]]+\])", line):
                    raise ValueError(f"{file}: duplicate or unsourced rule {rule}")
                ids.add(rule)
    register = (DOCS / "references/rule-provenance.md").read_text(encoding="utf-8")
    registered = set()
    for rule in re.findall(r"^\| ([A-Z][A-Z-]+-\d+) \|", register, re.M):
        if rule in registered:
            raise ValueError(f"rule-provenance.md: duplicate source entry for {rule}")
        registered.add(rule)
    for path in [*DOCS.joinpath("pages").glob("*.md"), *DOCS.joinpath("foundation").glob("*.md"),
                 *DOCS.joinpath("assets").glob("*.md"), DOCS / "engineering/cross-platform-compatibility.md"]:
        body = path.read_text(encoding="utf-8")
        for match in re.finditer(r"^(?:\| |## |\*\*)((?:HOME|MAP|GUI-AI|TRIP|PROFILE|FND|IMG|ASSET|PLAT)-\d+)\b(.*)$", body, re.M):
            rule, definition = match.groups()
            if rule in ids:
                raise ValueError(f"{path.name}: duplicate rule ID {rule}")
            if not re.search(r"\]\([^)]+\)", definition) and not re.search(rf"^\| {rule} \|[^\n]+\]\([^)]+\)", register, re.M):
                raise ValueError(f"{path.name}: add a concrete source beside {rule} or in rule-provenance.md")
            ids.add(rule)
    unknown = registered - ids
    if unknown:
        raise ValueError(f"rule-provenance.md: entries without a rule definition: {sorted(unknown)}")
    print(f"{len(ids)} rule IDs checked for source references")


def check_visual_resources():
    app = ROOT / "visitor-app"
    tokens = json.loads((app / "design/tokens.json").read_text(encoding="utf-8"))
    themes = json.loads((app / "theme.json").read_text(encoding="utf-8"))
    def luminance(hex_color):
        values = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        linear = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in values]
        return sum(a * b for a, b in zip(linear, [0.2126, 0.7152, 0.0722]))
    pairs = [(fg, bg) for fg in ["text", "muted", "primary", "error", "warning", "success", "ai"]
             for bg in ["surface", "background", "inset"]]
    pairs.extend([("on-primary", "primary"), ("on-hero", "hero")])
    for index, theme in enumerate(["light", "dark"]):
        for fg, bg in pairs:
            hi, lo = sorted((luminance(tokens["color"][role][index]) for role in (fg, bg)), reverse=True)
            if (hi + 0.05) / (lo + 0.05) < 4.5:
                raise ValueError(f"{theme} {fg}/{bg} has insufficient text contrast")
        for name in ["home", "map", "ai", "trip", "profile"]:
            for state in ["Icon", "Selected"]:
                path = app / themes[theme][name + state]
                data = path.read_bytes()
                if data[:8] != bytes.fromhex("89504e470d0a1a0a") or struct.unpack(">II", data[16:24]) != (72, 72):
                    raise ValueError(f"Invalid tab resource: {path}")
    print(f"{2 * len(pairs)} contrast pairs and 20 tab icons verified")


def repo_skills():
    names = set()
    for folder in sorted(p for p in SKILLS.iterdir() if p.is_dir()):
        entry = folder / "SKILL.md"
        header = re.match(r"\A---\n(.*?)\n---\n", entry.read_text(encoding="utf-8"), re.S)
        if not header:
            raise ValueError(f"Missing frontmatter: {entry}")
        name = re.search(r"^name: ([a-z0-9-]+)$", header[1], re.M)
        if not name or name[1] != folder.name or name[1] in names or not re.search(r"^description: \S", header[1], re.M):
            raise ValueError(f"Invalid Skill identity: {entry}")
        names.add(name[1])
    return names


def discover(names):
    cli = shutil.which("codex.cmd" if os.name == "nt" else "codex")
    if not cli:
        raise RuntimeError("Codex CLI missing")
    process = subprocess.Popen([cli, "app-server", "--stdio"], cwd=ROOT,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               text=True, encoding="utf-8")
    messages = queue.Queue()
    def receive():
        for line in process.stdout:
            messages.put(line)
    threading.Thread(target=receive, daemon=True).start()
    def send(message):
        process.stdin.write(json.dumps(message) + "\n")
        process.stdin.flush()
    def call(number, method, params):
        send({"jsonrpc": "2.0", "id": number, "method": method, "params": params})
        deadline = time.monotonic() + 50
        while time.monotonic() < deadline:
            reply = json.loads(messages.get(timeout=max(0.01, deadline - time.monotonic())))
            if reply.get("id") == number:
                if "error" in reply:
                    raise RuntimeError(reply["error"])
                return reply["result"]
        raise TimeoutError(method)
    try:
        call(1, "initialize", {"clientInfo": {"name": "scenic-design-audit", "version": "1"}})
        send({"jsonrpc": "2.0", "method": "initialized"})
        result = call(2, "skills/list", {"cwds": [str(ROOT)], "forceReload": True})
        actual = set()
        for group in result["data"]:
            for skill in group["skills"]:
                if Path(skill["path"]).resolve().is_relative_to(SKILLS):
                    if not skill.get("enabled", True):
                        raise ValueError(f"Disabled: {skill['name']}")
                    actual.add(skill["name"])
                    print(f"{skill['name']} ({skill['scope']})")
            for error in group.get("errors", []):
                if str(SKILLS).lower() in str(error).lower():
                    raise ValueError(error)
        if actual != names:
            raise ValueError(f"Discovery mismatch: expected {sorted(names)}, got {sorted(actual)}")
    finally:
        process.stdin.close()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.terminate()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex", action="store_true", help="Verify actual skills/list results")
    parser.add_argument("--discovery-only", action="store_true")
    args = parser.parse_args()
    installed = repo_skills()
    if not args.discovery_only:
        check_docs()
        check_rule_sources()
        check_visual_resources()
    if args.codex:
        discover(installed)
    print(f"{len(installed)} project skills checked")
