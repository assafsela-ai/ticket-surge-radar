
"""Refresh portable skill downloads and Claude Code's project skill."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

root = Path(__file__).resolve().parent.parent
skill_name = "ticket-surge-radar"
skill_path = root / ".agents" / "skills" / skill_name / "SKILL.md"
skill = skill_path.read_bytes()
claude_path = root / ".claude" / "skills" / skill_name / "SKILL.md"
claude_path.parent.mkdir(parents=True, exist_ok=True)
claude_path.write_bytes(skill)
paths = ["tools/analyze.mjs", "docs/csv.mjs", "docs/demo.mjs", "docs/radar.mjs", "LICENSE"]

with ZipFile(root / "docs" / f"{skill_name}-skill.zip", "w") as archive:
    entries = {"SKILL.md": skill}
    entries.update({path: (root / path).read_bytes() for path in paths})
    for path, content in entries.items():
        entry = ZipInfo(f"{skill_name}/{path}")
        entry.compress_type = ZIP_DEFLATED
        archive.writestr(entry, content)
