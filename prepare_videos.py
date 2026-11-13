"""
Make the study videos web-ready, then run build_manifest.py.

    python prepare_videos.py            # process everything that needs it
    python prepare_videos.py --dry-run  # only show what would happen

What it does, per video in the experiment folders:
  * Trims clips listed in TRIMS below (keeps the first N seconds).
  * Re-encodes anything browsers can't reliably play (e.g. 10-bit "High 10"
    H.264, which Safari and Firefox can't decode) to standard 8-bit H.264,
    with "faststart" so playback begins before the whole file downloads.
  * Keeps the untouched original in _originals/<folder>/ (git-ignored) and
    always re-encodes FROM that original, so re-running never trims twice or
    stacks quality loss. To change a trim, edit TRIMS and run again.

Requires ffmpeg and ffprobe on PATH.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FOLDERS = ["exp A", "exp B", "exp C"]
BACKUP_DIR = ROOT / "_originals"
STATE_FILE = BACKUP_DIR / "processed.json"
CRF = 18  # visually lossless for these renders; lower = bigger files

# "<folder>/<video name without .mp4>": seconds to keep from the start
TRIMS = {
    # Experiment A
    "exp A/A140_a_person_spikes_a_volleyball_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp A/A141_a_person_rolls_a_bowling_ball_down_a_lane_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp A/A144_a_person_shoots_a_basketball_toward_a_hoop_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp A/A518_a_person_walks_forward_while_carrying_a_box_H3_s43_LEFT-video_H3__RIGHT_Kimodo": 5,
    "exp A/A1416_a_person_walks_to_a_ladder_climbs_up_and_sits_at_t_H3_s43_LEFT-video_H3__RIGHT_Kimodo": 5,
    # Experiment B
    "exp B/A140_a_person_spikes_a_volleyball_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp B/A141_a_person_rolls_a_bowling_ball_down_a_lane_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp B/A144_a_person_shoots_a_basketball_toward_a_hoop_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp B/A1416_a_person_walks_to_a_ladder_climbs_up_and_sits_at_t_H3_s43_LEFT-video_H3__RIGHT_Kimodo": 5,
    # Experiment C
    "exp C/A011_a_person_does_calf_raises_H3_s43_k5_LEFT-H3__RIGHT-Kimodo": 5,
    "exp C/A017_a_person_twists_the_torso_left_and_right_H3_s43_k5_LEFT-Kimodo__RIGHT-H3": 5,
    "exp C/A140_a_person_spikes_a_volleyball_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp C/A141_a_person_swings_a_golf_club_H3_s43_LEFT-Kimodo__RIGHT_video_H3": 5,
    "exp C/A269_a_person_jumps_over_a_high_bar_H3_s43_k5_LEFT-H3__RIGHT-Kimodo": 5,
    "exp C/A518_a_person_walks_forward_while_carrying_a_box_H3_s43_LEFT-video_H3__RIGHT_Kimodo": 5,
    "exp C/A632_a_person_walks_forward_while_throwing_a_ball_up_an_H3_s43_k5_LEFT-Kimodo__RIGHT-H3": 5,
    "exp C/A899_a_person_walks_forward_picks_something_up_from_the_H3_s43_k5_LEFT-Kimodo__RIGHT-H3": 5,
}

WEB_SAFE_PROFILES = {"Constrained Baseline", "Baseline", "Main", "High"}


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=codec_name,profile,pix_fmt:format=duration",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    data = json.loads(out)
    s = (data.get("streams") or [{}])[0]
    return {
        "codec": s.get("codec_name"),
        "profile": s.get("profile"),
        "pix_fmt": s.get("pix_fmt"),
        "duration": float(data.get("format", {}).get("duration", 0) or 0),
    }


def web_safe(info: dict) -> bool:
    return info["codec"] == "h264" and info["pix_fmt"] == "yuv420p" and info["profile"] in WEB_SAFE_PROFILES


def encode(src: Path, dst: Path, trim):
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", str(src)]
    if trim:
        cmd += ["-t", str(trim)]
    cmd += [
        "-map", "0:v:0", "-an",
        "-c:v", "libx264", "-preset", "slow", "-crf", str(CRF),
        "-pix_fmt", "yuv420p", "-profile:v", "high",
        "-movflags", "+faststart",
        str(dst),
    ]
    subprocess.run(cmd, check=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        print("ffmpeg/ffprobe not found on PATH.")
        return 1

    state = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    seen_trims = set()
    changed = 0

    for folder in FOLDERS:
        for f in sorted((ROOT / folder).glob("*.mp4")):
            key = f"{folder}/{f.stem}"
            trim = TRIMS.get(key)
            if trim:
                seen_trims.add(key)
            backup = BACKUP_DIR / folder / f.name
            wanted = {"trim": trim, "crf": CRF}

            if backup.exists():
                if state.get(key) == wanted and f.exists():
                    continue  # already processed with these settings
                source = backup
            else:
                info = probe(f)
                if web_safe(info) and not trim:
                    continue  # fine as is
                source = f

            info = probe(source)
            why = []
            if trim:
                why.append(f"trim to {trim}s (from {info['duration']:.1f}s)")
            if not web_safe(info):
                why.append(f"convert {info['profile']}/{info['pix_fmt']} -> 8-bit")
            if not why:
                why.append("re-encode from original")
            print(f"{key[:95]}\n    {', '.join(why)}")
            if args.dry_run:
                continue

            if not backup.exists():
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, backup)
            tmp = f.with_name(f.stem + ".__tmp__.mp4")
            encode(backup, tmp, trim)
            tmp.replace(f)
            state[key] = wanted
            changed += 1

    missing = sorted(set(TRIMS) - seen_trims)
    if missing:
        print("\nTRIMS entries with no matching video (check the names):")
        for m in missing:
            print("  -", m)

    if not args.dry_run:
        BACKUP_DIR.mkdir(exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
        print(f"\nProcessed {changed} video(s). Originals are in {BACKUP_DIR.name}/.")
        print("Next: python build_manifest.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
