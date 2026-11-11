"""
Scan the experiment folders and write manifest.json for the survey website.

GitHub Pages cannot list folder contents, so the website reads this manifest
instead. Re-run this script every time you add, remove or rename a video:

    python build_manifest.py

Expected video name pattern (the "0000-0299" frame-range suffix is optional):

    A344_a_person_marches_in_place_while_clapping_s1234__left-LTX_GVHMR__right-Kimodo0000-0299.mp4
    A163_a_person_throws_a_hook_punch_s5678_k8__left-Kimodo__right-LTX_GVHMR.mp4
    └id┘ └──────── prompt slug ───────────┘ └seed┘└k┘    └left method┘   └right method┘

Full prompt text comes from prompts.json (filenames truncate long prompts).

Optional: to show a "Reference keyframes" strip above a clip, put an image with
the same name as the video next to it, e.g. "<video name>.png" (or .jpg/.webp).
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Experiment key -> folder name. Order here does not matter; the website shows
# experiments in the order given in config.js.
EXPERIMENTS = {
    "A": "exp A",
    "B": "exp B",
    "C": "exp C",
}

# Method name (lower-case substring) -> category. First match wins.
METHOD_TYPES = [
    ("kimodo", "motion"),
    ("motiongpt", "motion"),
    ("mgpt", "motion"),
    ("condmdi", "motion"),
    ("ltx", "video"),
    ("h3", "video"),
]

VIDEO_EXTS = {".mp4", ".webm", ".mov"}
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")

NAME_RE = re.compile(
    r"^(?P<pid>A\d+)_(?P<slug>.+?)_s(?P<seed>\d+)(?:_k(?P<k>\d+))?"
    r"__left-(?P<left>.+?)__right-(?P<right>.+?)(?:\d{4}-\d{4})?$"
)


def method_type(name: str) -> str:
    low = name.lower()
    for key, kind in METHOD_TYPES:
        if key in low:
            return kind
    return "unknown"


def slug_to_prompt(slug: str) -> str:
    text = slug.replace("_", " ").strip()
    return text[:1].upper() + text[1:] + "."


def main() -> int:
    prompts_path = ROOT / "prompts.json"
    prompts = json.loads(prompts_path.read_text(encoding="utf-8")) if prompts_path.exists() else {}

    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "experiments": {},
    }
    problems = []

    for key, folder in EXPERIMENTS.items():
        exp_dir = ROOT / folder
        trials = []
        if not exp_dir.is_dir():
            problems.append(f"[{key}] folder not found: {folder}")
            manifest["experiments"][key] = {"folder": folder, "trials": []}
            continue

        for f in sorted(exp_dir.iterdir()):
            if f.suffix.lower() not in VIDEO_EXTS:
                continue
            m = NAME_RE.match(f.stem)
            if not m:
                problems.append(f"[{key}] skipped (name not understood): {f.name}")
                continue

            pid = m["pid"]
            if pid in prompts:
                prompt = prompts[pid]
            else:
                prompt = slug_to_prompt(m["slug"])
                problems.append(f"[{key}] {pid}: no entry in prompts.json, using filename text: {prompt!r}")

            keyframes = None
            for ext in IMAGE_EXTS:
                for cand in (exp_dir / f"{f.stem}{ext}", exp_dir / "keyframes" / f"{f.stem}{ext}"):
                    if cand.exists():
                        keyframes = cand.relative_to(ROOT).as_posix()
                        break
                if keyframes:
                    break

            left, right = m["left"], m["right"]
            trials.append({
                "id": f"{key}:{f.stem}",
                "src": f.relative_to(ROOT).as_posix(),
                "promptId": pid,
                "prompt": prompt,
                "seed": int(m["seed"]),
                "k": int(m["k"]) if m["k"] else None,
                "left": left,
                "right": right,
                "leftType": method_type(left),
                "rightType": method_type(right),
                "keyframes": keyframes,
            })
            if "unknown" in (method_type(left), method_type(right)):
                problems.append(f"[{key}] unknown method type in {f.name} - add it to METHOD_TYPES")

        manifest["experiments"][key] = {"folder": folder, "trials": trials}

    out = ROOT / "manifest.json"
    out.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    total = 0
    for key, exp in manifest["experiments"].items():
        trials = exp["trials"]
        total += len(trials)
        lefts = {}
        for t in trials:
            lefts[t["leftType"]] = lefts.get(t["leftType"], 0) + 1
        balance = ", ".join(f"{v} with {k} model on the left" for k, v in sorted(lefts.items()))
        print(f"Experiment {key} ({exp['folder']}): {len(trials)} clips  [{balance}]")
        for t in trials:
            kf = "  +keyframes" if t["keyframes"] else ""
            print(f"   {t['promptId']:>6}  L={t['left']:<10} R={t['right']:<10} {t['prompt']}{kf}")
    print(f"\nWrote {out.name} with {total} clips.")

    if problems:
        print("\nCheck these:")
        for p in problems:
            print("  -", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
