"""
CVAT REST API Client Module
Handles authentication, downloading job annotations & pointclouds, and uploading updated payloads.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

# Add parent directory to sys.path to import config
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config.cvat_config import CVAT_BASE_URL, get_auth_headers, CVAT_JOB_ID, DATA_DIR

class CVATClient:
    def __init__(self, base_url: str = None, headers: dict = None):
        self.base_url = (base_url or CVAT_BASE_URL).rstrip("/")
        self.headers = headers or get_auth_headers()

    def get_job_meta(self, job_id: int = CVAT_JOB_ID) -> dict:
        """Fetch metadata for a specific CVAT job."""
        url = f"{self.base_url}/api/jobs/{job_id}"
        req = urllib.request.Request(url, headers=self.headers)
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def get_annotations(self, job_id: int = CVAT_JOB_ID) -> dict:
        """Retrieve annotations payload (tracks, shapes, tags) for a job."""
        url = f"{self.base_url}/api/jobs/{job_id}/annotations"
        req = urllib.request.Request(url, headers=self.headers)
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def put_annotations(self, job_id: int, payload: dict) -> dict:
        """Overwrite annotations on CVAT server via PUT."""
        url = f"{self.base_url}/api/jobs/{job_id}/annotations"
        data_bytes = json.dumps(payload).encode("utf-8")
        put_headers = {
            **self.headers,
            "Content-Type": "application/json"
        }
        req = urllib.request.Request(url, data=data_bytes, headers=put_headers, method="PUT")
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {"status": resp.status}

    def download_pcd_frame(self, job_id: int, frame_idx: int, out_dir: Path) -> tuple[int, bool, int]:
        """Download a single 3D LiDAR point cloud (.pcd) frame."""
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / f"frame_{frame_idx:02d}.pcd"
        if target.exists() and target.stat().st_size > 1000:
            return frame_idx, True, target.stat().st_size

        url = f"{self.base_url}/api/jobs/{job_id}/data?type=frame&quality=original&number={frame_idx}"
        req = urllib.request.Request(url, headers=self.headers)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    content = resp.read()
                    target.write_bytes(content)
                    return frame_idx, True, len(content)
            except Exception as e:
                time.sleep(1)
                if attempt == 2:
                    print(f"Error downloading frame {frame_idx}: {e}")
                    return frame_idx, False, 0

    def download_pointclouds(self, job_id: int, total_frames: int, out_dir: Path = None, max_workers: int = 6):
        """Download all PCD frames concurrently using ThreadPoolExecutor."""
        target_dir = out_dir or (DATA_DIR / f"job_{job_id}" / "pointclouds")
        print(f"Downloading {total_frames} frames for Job {job_id} into {target_dir}...")
        start = time.time()
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = [pool.submit(self.download_pcd_frame, job_id, f, target_dir) for f in range(total_frames)]
            results = [f.result() for f in futures]
        
        success = sum(1 for _, ok, _ in results if ok)
        print(f"Downloaded {success}/{total_frames} frames in {time.time() - start:.1f}s.")
        return target_dir

if __name__ == "__main__":
    client = CVATClient()
    try:
        ann = client.get_annotations(CVAT_JOB_ID)
        print(f"Connected to CVAT! Job {CVAT_JOB_ID} has {len(ann.get('tracks', []))} tracks.")
    except Exception as e:
        print(f"Connection test info: {e}")
