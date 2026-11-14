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
Compound prompts get an action-coverage checklist from checklists.json.

Optional: to show a "Reference keyframes" strip above a clip, put an image with
the same name as the video next to it, e.g. "<video name>.png" (or .jpg/.webp).
"""

import json
import re
import subprocess
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

# Accepts all naming styles used so far, e.g.
#   ..._s1234_k5__left-LTX_GVHMR__right-Kimodo[0000-0299]
#   ..._H3_s43_LEFT-Kimodo__RIGHT_video_H3
#   ..._H3_s43_k5_LEFT_Kimodo-RIGHT_H3
#   ..._H3_s43_k5_LEFT-H3__RIGHT-Kimodo
NAME_RE = re.compile(
    r"^(?P<pid>A\d+)_(?P<slug>.+?)(?:_H3)?_s(?P<seed>\d+)(?:_k(?P<k>\d+))?"
    r"_+(?i:left)[-_](?P<left>.+?)(?:__|-|_)(?i:right)[-_](?P<right>.+?)(?:\d{4}-\d{4})?$"
)

# Different spellings of the same method in filenames -> one name in the data.
METHOD_ALIASES = {
    "video_h3": "H3",
    "h3": "H3",
}


def method_type(name: str) -> str:
    low = name.lower()
    for key, kind in METHOD_TYPES:
        if key in low:
            return kind
    return "unknown"


def slug_to_prompt(slug: str) -> str:
    text = slug.replace("_", " ").strip()
    return text[:1].upper() + text[1:] + "."


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def canonical_method(name: str) -> str:
    return METHOD_ALIASES.get(name.lower(), name)


def duration_of(path: Path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return round(float(out), 2)
    except Exception:
        return None


def load_checklists(problems):
    """checklists.json: full prompt sentence -> {relation, actions, relationText?}, keyed here by slug."""
    path = ROOT / "checklists.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for sentence, c in raw.items():
        if sentence.startswith("_"):
            continue
        actions = [a.strip() for a in c.get("actions", []) if a.strip()]
        relation = c.get("relation")
        if relation not in ("order", "simultaneous") or len(actions) < 2:
            problems.append(f"checklists.json: {sentence!r} needs relation 'order'/'simultaneous' and 2+ actions")
            continue
        entry = {"relation": relation, "actions": actions}
        if c.get("relationText"):
            entry["relationText"] = c["relationText"].strip()
        out[slugify(sentence)] = {"sentence": sentence, "checklist": entry, "used": False}
    return out


def main() -> int:
    prompts_path = ROOT / "prompts.json"
    prompts = json.loads(prompts_path.read_text(encoding="utf-8")) if prompts_path.exists() else {}
    problems = []
    checklists = load_checklists(problems)

    manifest = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "experiments": {},
    }

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

            pid, slug = m["pid"], m["slug"]
            # prompts.json gives the full sentence (filenames may cut it off), but only
            # trust it when it agrees with the filename: some IDs were reused for
            # different wording (e.g. A140 "mimes a volleyball spike" vs "spikes a volleyball").
            if pid in prompts and slugify(prompts[pid]).startswith(slug):
                prompt = prompts[pid]
            else:
                prompt = slug_to_prompt(slug)
                if pid in prompts:
                    note = f"prompts.json has a different sentence ({prompts[pid]!r})"
                else:
                    note = "no entry in prompts.json"
                problems.append(f"[{key}] {pid}: {note}; using filename text {prompt!r}")
                if len(slug) >= 50:
                    problems.append(f"[{key}] {pid}: filename text may be cut off - add the full sentence to prompts.json")

            keyframes = None
            for ext in IMAGE_EXTS:
                for cand in (exp_dir / f"{f.stem}{ext}", exp_dir / "keyframes" / f"{f.stem}{ext}"):
                    if cand.exists():
                        keyframes = cand.relative_to(ROOT).as_posix()
                        break
                if keyframes:
                    break

            left, right = canonical_method(m["left"]), canonical_method(m["right"])
            cl = checklists.get(slugify(prompt))
            if cl:
                cl["used"] = True
            trials.append({
                "id": f"{key}:{f.stem}",
                "src": f.relative_to(ROOT).as_posix(),
                "promptId": pid,
                "prompt": prompt,
                # Same action = same prompt sentence (IDs are not reliable).
                # A participant sees each action in only one experiment (assets/plan.js).
                "actionKey": slugify(prompt),
                "seed": int(m["seed"]),
                "k": int(m["k"]) if m["k"] else None,
                "left": left,
                "right": right,
                "leftType": method_type(left),
                "rightType": method_type(right),
                "duration": duration_of(f),
                "keyframes": keyframes,
                # Compound prompts only: rows of the action-coverage checklist.
                "checklist": cl["checklist"] if cl else None,
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
            dur = f"{t['duration']:>5.1f}s" if t["duration"] else "   ? "
            cl = f"  [checklist: {len(t['checklist']['actions'])} actions, {t['checklist']['relation']}]" if t["checklist"] else ""
            print(f"   {t['promptId']:>6} {dur}  L={t['left']:<10} R={t['right']:<10} {t['prompt']}{kf}{cl}")
    print(f"\nWrote {out.name} with {total} clips.")

    actions = {}
    for key, exp in manifest["experiments"].items():
        for t in exp["trials"]:
            a = actions.setdefault(t["actionKey"], {"prompt": t["prompt"], "exps": []})
            if key not in a["exps"]:
                a["exps"].append(key)
    shared = {k: v for k, v in actions.items() if len(v["exps"]) > 1}
    print(f"{len(actions)} different actions; each participant sees each action once, so about "
          f"{len(actions)} clips per person.")
    if shared:
        print(f"{len(shared)} actions appear in several experiments (each participant gets one of them):")
        for k, v in sorted(shared.items()):
            print(f"   {''.join(v['exps']):<4} {v['prompt']}")

    compound = {k for k, v in actions.items() if any(
        t["checklist"] for e in manifest["experiments"].values() for t in e["trials"] if t["actionKey"] == k)}
    print(f"{len(compound)} of {len(actions)} actions have an action-coverage checklist (checklists.json).")
    for c in checklists.values():
        if not c["used"]:
            problems.append(f"checklists.json: no clip has the prompt {c['sentence']!r} (check the spelling)")

    if problems:
        print("\nCheck these:")
        for p in problems:
            print("  -", p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
