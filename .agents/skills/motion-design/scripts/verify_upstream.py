"""Verify the two pinned, read-only motion libraries with Python's standard library."""

import csv
import hashlib
import zipfile
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
AUDIT = SKILL.parents[2] / "docs/design-system/audit"
ARCHIVES = {
    "EM": ("emil-skills-64eb3deb9a5f.zip", "6ddc652fba566c7195ac7385c754cac7c5bea42c317c14417a1766c394405499"),
    "DMP": ("design-motion-principles-4a9ca879f24a.zip", "7b630a1612555e49900ec2e9279d8eb144a4306a3dd6e61c53c7f0e11fb866c1"),
}


def records(filename, source):
    with (AUDIT / filename).open(encoding="utf-8", newline="") as stream:
        return [row for row in csv.DictReader(stream, delimiter="\t") if row["source"] == source]


def verify(source, name, digest):
    path = SKILL / "references/upstream" / name
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError(f"Archive digest mismatch: {name}")
    inventory = records("upstream-files.tsv", source)
    edges = records("upstream-references.tsv", source)
    paths = {row["path"] for row in inventory}
    with zipfile.ZipFile(path) as archive:
        members = archive.namelist()
        if len(set(members)) != len(members) or set(members) != paths or "LICENSE" not in paths:
            raise ValueError(f"Unexpected archive membership: {name}")
        for entry in inventory:
            data = archive.read(entry["path"])
            blob = f"blob {len(data)}\0".encode("ascii") + data
            if len(data) != int(entry["bytes"]) or hashlib.sha1(blob).hexdigest() != entry["git_blob_sha1"]:
                raise ValueError(f"Upstream blob mismatch: {entry['path']}")
    for edge in edges:
        if edge["from_path"] not in paths or edge["to_path"] not in paths:
            raise ValueError(f"Unresolved inventory relationship: {edge}")
    print(f"{source}: {len(paths)} original files, {len(edges)} local references, LICENSE and digests OK")


if __name__ == "__main__":
    for key, (filename, sha256) in ARCHIVES.items():
        verify(key, filename, sha256)
