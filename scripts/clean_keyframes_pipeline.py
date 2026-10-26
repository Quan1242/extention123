"""
Clean Keyframes Pipeline for CVAT 3D Annotation
================================================
Critical Architectural Rule:
In CVAT's annotation model, EVERY shape stored in a track's `shapes` list acts as an immutable anchor keyframe.
If an automated script dumps shapes on every consecutive frame (e.g., frames 20 to 29), CVAT treats every single
frame as a rigid keyframe. Consequently:
1. When a human annotator modifies keyframe 23 or 29, the intermediate frames (24..28) CANNOT interpolate!
   They stay locked on the old coordinates, causing wild bounding box jumping and visual jitter.
2. Stripping intermediate auto-generated shapes and keeping ONLY true keyframes (e.g., 0, 5, 8, 9, 10, 15, 16, 19, 23, 29)
   allows CVAT's native linear 3D interpolator to produce smooth, jitter-free transitions.

Usage:
    python clean_keyframes_pipeline.py [--job-id 58] [--input path/to/input.json] [--upload]
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config.cvat_config import CVAT_JOB_ID, SAMPLES_DIR, ROOT_DIR
from scripts.cvat_client import CVATClient

def clean_track_keyframes(raw_tracks: list, allowed_frames: set = None, keep_frames_under: int = 20) -> list:
    """
    Strips intermediate frozen shapes from tracks, keeping only true anchor keyframes.
    
    Args:
        raw_tracks: List of track dicts from CVAT API or JSON export.
        allowed_frames: Explicit set of frame indices allowed to remain as keyframes (e.g., {23, 29}).
        keep_frames_under: Automatically keep all shapes with frame < keep_frames_under.
    """
    clean_tracks = []
    
    for idx, t in enumerate(raw_tracks):
        shapes = t.get("shapes", [])
        s_map = {s["frame"]: s for s in shapes}
        
        # 1. Base keyframes under threshold
        kept_shapes = [s for s in shapes if s["frame"] < keep_frames_under]
        
        # 2. Selectively keep explicit keyframes (if requested)
        if allowed_frames:
            for f in sorted(allowed_frames):
                if f >= keep_frames_under and f in s_map:
                    kept_shapes.append(s_map[f])
        else:
            # If no explicit set is provided, keep frames marked with keyframe=True or first/last
            # and prune dense sequences
            for s in shapes:
                if s["frame"] >= keep_frames_under:
                    # Keep if marked as explicit keyframe or if at boundary
                    if s.get("keyframe", False) and s["frame"] in (23, 29): # default safe cadence
                        if s not in kept_shapes:
                            kept_shapes.append(s)
                            
        # Sort shapes by frame index
        kept_shapes.sort(key=lambda x: x["frame"])
        
        # Build clean track copy without server-assigned shape IDs so CVAT recreates them cleanly
        t_clean = dict(t)
        if "id" in t_clean:
            del t_clean["id"]
            
        clean_shapes = []
        for s in kept_shapes:
            sc = dict(s)
            if "id" in sc:
                del sc["id"]
            sc["keyframe"] = True
            clean_shapes.append(sc)
            
        t_clean["shapes"] = clean_shapes
        clean_tracks.append(t_clean)
        
        frames_summary = [s["frame"] for s in clean_shapes]
        print(f"Track {idx+1:02d} (Label {t.get('label_id')}): Keyframes -> {frames_summary}")
        
    return clean_tracks

def run_pipeline(input_file: Path = None, job_id: int = CVAT_JOB_ID, upload: bool = False, output_file: Path = None):
    client = CVATClient()
    
    # 1. Obtain annotations
    if input_file and Path(input_file).exists():
        print(f"Loading annotations from file: {input_file}")
        with open(input_file, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        print(f"Fetching live annotations from CVAT server for Job {job_id}...")
        data = client.get_annotations(job_id)
        
    raw_tracks = data.get("tracks", [])
    print(f"Found {len(raw_tracks)} tracks. Processing keyframe cleaning...")
    
    # 2. Clean keyframes
    # For job 58: keep frames <= 19, plus curated keyframes 23 and 29
    allowed_keyframes = {23, 29}
    clean_tracks = clean_track_keyframes(raw_tracks, allowed_frames=allowed_keyframes, keep_frames_under=20)
    
    payload = {
        "version": data.get("version", 0),
        "tags": data.get("tags", []),
        "shapes": [],
        "tracks": clean_tracks
    }
    
    # 3. Save clean payload
    out_path = output_file or (ROOT_DIR / f"job{job_id}_clean_keyframes_payload.json")
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Clean payload saved to: {out_path}")
    
    # 4. Optional direct upload
    if upload:
        print(f"\nUploading clean annotations to CVAT Job {job_id} via PUT...")
        res = client.put_annotations(job_id, payload)
        print("Upload result:", res)
        print("Verification: Check CVAT UI; intermediate frames will now interpolate smoothly without box jumps.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean CVAT 3D keyframe sequences to restore smooth native interpolation.")
    parser.add_argument("--job-id", type=int, default=CVAT_JOB_ID, help="CVAT Job ID")
    parser.add_argument("--input", type=str, default="", help="Path to input annotations JSON file")
    parser.add_argument("--output", type=str, default="", help="Path to output annotations JSON file")
    parser.add_argument("--upload", action="store_true", help="Directly upload cleaned payload to CVAT server")
    args = parser.parse_args()
    
    in_p = Path(args.input) if args.input else None
    out_p = Path(args.output) if args.output else None
    run_pipeline(input_file=in_p, job_id=args.job_id, upload=args.upload, output_file=out_p)
