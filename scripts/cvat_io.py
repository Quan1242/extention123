"""
CVAT Universal I/O CLI Tool (Export & Import)
=============================================
Supports exporting and importing 3D annotations directly using ANY CVAT link
(e.g., VinFast CVAT https://cvat-test.vantixapps.net/tasks/.../jobs/58 or any custom domain/IP).

Usage:
    # 1. Export annotations from any VinFast link:
    python scripts/cvat_io.py export "https://cvat-test.vantixapps.net/tasks/12/jobs/58" --output job58_backup.json

    # 2. Import annotations into any VinFast link:
    python scripts/cvat_io.py import "https://cvat-test.vantixapps.net/tasks/12/jobs/58" --file my_annotations.json --clean

    # 3. Inspect annotations of a job:
    python scripts/cvat_io.py inspect "https://cvat-test.vantixapps.net/tasks/12/jobs/58"
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path
from urllib.parse import urlparse

# Add parent directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
from config.cvat_config import CVAT_BASE_URL, get_auth_headers

def parse_cvat_url(target: str) -> tuple[str, int]:
    """
    Parses any CVAT URL or raw job ID.
    Examples:
        - https://cvat-test.vantixapps.net/tasks/12/jobs/58 -> ('https://cvat-test.vantixapps.net', 58)
        - https://cvat-test.vantixapps.net/api/jobs/58/annotations -> ('https://cvat-test.vantixapps.net', 58)
        - https://cvat.vinfast.vn/jobs/123 -> ('https://cvat.vinfast.vn', 123)
        - 58 -> ('https://cvat-test.vantixapps.net', 58)
    """
    target = target.strip()
    
    # 1. Plain integer
    if target.isdigit():
        return CVAT_BASE_URL, int(target)
        
    # 2. URL parsing
    parsed = urlparse(target)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"URL không hợp lệ: '{target}'. Vui lòng nhập link đầy đủ (ví dụ: https://cvat-test.vantixapps.net/tasks/12/jobs/58)")
        
    base_url = f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    
    # Extract job ID via regex
    match = re.search(r"/jobs/(\d+)", parsed.path)
    if not match:
        raise ValueError(f"Không tìm thấy Job ID trong link: '{target}'. Link cần chứa '/jobs/<id>'.")
        
    job_id = int(match.group(1))
    return base_url, job_id

def get_headers(base_url: str) -> dict:
    """Build request headers with credentials and referer matching target base_url."""
    session_id = os.environ.get("CVAT_SESSION_ID", "u2l51ifu59j1dndin6torw7cz7mpmtjt")
    csrf_token = os.environ.get("CVAT_CSRF_TOKEN", "pJWTy2t3dtai2G0n1VgMwnC3nlbzxG3m")
    api_token = os.environ.get("CVAT_API_TOKEN", "")
    
    headers = {
        "Referer": f"{base_url}/",
        "Accept": "*/*"
    }
    
    # 1. Prefer Session Cookie if present
    if session_id:
        cookie = f"sessionid={session_id}"
        if csrf_token:
            cookie += f"; csrftoken={csrf_token}"
            headers["X-CSRFToken"] = csrf_token
        headers["Cookie"] = cookie
        return headers
        
    # 2. Use API Token if available
    if api_token:
        headers["Authorization"] = f"Token {api_token}"
        return headers

    return headers

def export_annotations(target: str, out_path: Path = None):
    """Exports all 3D annotations from the specified CVAT link or Job ID."""
    base_url, job_id = parse_cvat_url(target)
    url = f"{base_url}/api/jobs/{job_id}/annotations"
    headers = get_headers(base_url)
    
    print(f"\n[EXPORT] Đang kết nối CVAT Server: {base_url}")
    print(f"[EXPORT] Job ID mục tiêu: {job_id}")
    print(f"[EXPORT] GET {url} ...")
    
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[LỖI HTTP {e.code}]: {e.reason}")
        if e.code == 401 or e.code == 403:
            print(" -> Hãy kiểm tra lại sessionid hoặc API token trong .env hoặc file config.")
        sys.exit(1)
        
    tracks = data.get("tracks", [])
    shapes = data.get("shapes", [])
    
    # Summary
    print(f"\n✅ EXPORT THÀNH CÔNG từ Job {job_id}:")
    print(f" - Tổng số tracks: {len(tracks)}")
    print(f" - Tổng số shapes độc lập: {len(shapes)}")
    
    label_counts = {}
    for t in tracks:
        lbl = t.get("label_id", "unknown")
        label_counts[lbl] = label_counts.get(lbl, 0) + 1
    print(f" - Phân bố theo Label ID: {label_counts}")
    
    # Save to file
    if not out_path:
        out_path = Path(f"cvat_job_{job_id}_export.json")
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n📁 Đã lưu file annotations tại: {out_path.resolve()}\n")
    return data

def clean_keyframe_shapes(tracks: list) -> list:
    """Removes redundant intermediate shapes to restore smooth 3D interpolation."""
    clean_tracks = []
    for t in tracks:
        t_copy = dict(t)
        if "id" in t_copy:
            del t_copy["id"]
            
        shapes = t.get("shapes", [])
        clean_shapes = []
        for s in shapes:
            sc = dict(s)
            if "id" in sc:
                del sc["id"]
            sc["keyframe"] = True
            clean_shapes.append(sc)
            
        t_copy["shapes"] = clean_shapes
        clean_tracks.append(t_copy)
    return clean_tracks

def import_annotations(target: str, in_path: Path, clean: bool = True, mode: str = "replace"):
    """Imports an annotations JSON file into the specified CVAT link or Job ID."""
    base_url, job_id = parse_cvat_url(target)
    headers = get_headers(base_url)
    
    if mode == "append":
        url = f"{base_url}/api/jobs/{job_id}/annotations/?action=create"
        http_method = "PATCH"
        mode_label = "THÊM VÀO / APPEND"
    else:
        url = f"{base_url}/api/jobs/{job_id}/annotations"
        http_method = "PUT"
        mode_label = "GHI ĐÈ / REPLACE"
    
    if not in_path.exists():
        print(f"[LỖI] Không tìm thấy file nguồn: {in_path}")
        sys.exit(1)
        
    print(f"\n[IMPORT] Đang đọc file: {in_path.resolve()}")
    data = json.loads(in_path.read_text(encoding="utf-8"))
    
    raw_tracks = data.get("tracks", [])
    raw_shapes = data.get("shapes", [])
    print(f"[IMPORT] File chứa {len(raw_tracks)} tracks và {len(raw_shapes)} shapes.")
    
    if clean:
        print("[IMPORT] Kích hoạt chuẩn hóa keyframes (loại bỏ ID server cũ và chống khóa cứng nội suy)...")
        clean_tracks = clean_keyframe_shapes(raw_tracks)
    else:
        clean_tracks = raw_tracks
        
    clean_shapes = []
    for s in raw_shapes:
        sc = dict(s)
        if "id" in sc:
            del sc["id"]
        clean_shapes.append(sc)

    # Fetch target job labels to support importing files from other jobs/tasks
    target_labels = []
    try:
        lbl_url = f"{base_url}/api/labels?job_id={job_id}"
        lbl_req = urllib.request.Request(lbl_url, headers=headers)
        with urllib.request.urlopen(lbl_req, timeout=15) as lbl_resp:
            lbl_data = json.loads(lbl_resp.read().decode("utf-8"))
            target_labels = lbl_data.get("results", [])
    except Exception as e:
        print(f"[IMPORT] Lưu ý: Không thể lấy danh sách nhãn ({e}); giữ nguyên label_id nguồn.")

    if target_labels:
        valid_label_ids = {l["id"] for l in target_labels}
        label_map = {}
        imported_label_ids = {t.get("label_id") for t in clean_tracks if t.get("label_id") is not None}
        imported_label_ids.update({s.get("label_id") for s in clean_shapes if s.get("label_id") is not None})

        for imp_id in imported_label_ids:
            if imp_id in valid_label_ids:
                label_map[imp_id] = imp_id
                continue
            # Infer label from attributes and dimensions
            matched_id = None
            sample_tracks = [t for t in clean_tracks if t.get("label_id") == imp_id]
            for tr in sample_tracks:
                for sh in tr.get("shapes", []):
                    for attr in sh.get("attributes", []):
                        val = str(attr.get("value", "")).lower()
                        if val in ["standing", "sitting", "bending", "child", "adult"]:
                            matched_id = next((l["id"] for l in target_labels if "pedestrian" in l.get("name", "").lower()), None)
                            break
                        if val in ["true", "false"]:
                            matched_id = next((l["id"] for l in target_labels if any(k in l.get("name", "").lower() for k in ["two-wheel", "cyclist", "motor"])), None)
                            break
                        if val in ["car", "truck", "bus", "van", "pickup"]:
                            matched_id = next((l["id"] for l in target_labels if any(k in l.get("name", "").lower() for k in ["vehicle", "car"])), None)
                            break
                    if matched_id:
                        break
                    pts = sh.get("points", [])
                    if len(pts) >= 9:
                        l, w, h = pts[6], pts[7], pts[8]
                        if h > 1.2 and l < 0.9 and w < 0.9:
                            matched_id = next((l["id"] for l in target_labels if "pedestrian" in l.get("name", "").lower()), None)
                            break
                        elif 1.2 <= l <= 2.4 and w <= 1.2:
                            matched_id = next((l["id"] for l in target_labels if any(k in l.get("name", "").lower() for k in ["two-wheel", "cyclist", "motor"])), None)
                            break
                        elif l >= 2.5:
                            matched_id = next((l["id"] for l in target_labels if any(k in l.get("name", "").lower() for k in ["vehicle", "car"])), None)
                            break
                if matched_id:
                    break

            if not matched_id and target_labels:
                matched_id = target_labels[0]["id"]
            if matched_id:
                label_map[imp_id] = matched_id
                print(f"[IMPORT] Tự động ánh xạ nhãn ngoại lai ID {imp_id} -> ID {matched_id}")

        # Apply label map and attribute sanitization
        for tr in clean_tracks:
            if tr.get("label_id") in label_map:
                tr["label_id"] = label_map[tr["label_id"]]
            target_label = next((l for l in target_labels if l["id"] == tr.get("label_id")), None)
            valid_spec_ids = {a["id"] for a in target_label.get("attributes", [])} if target_label else set()
            for sh in tr.get("shapes", []):
                cleaned_attrs = []
                for attr in sh.get("attributes", []):
                    if attr.get("spec_id") in valid_spec_ids:
                        cleaned_attrs.append(attr)
                    else:
                        val = str(attr.get("value", "")).lower()
                        matching_attr = next((a for a in target_label.get("attributes", []) if any(str(v).lower() == val for v in a.get("values", [])) or (a.get("input_type") == "checkbox" and val in ["true", "false"])), None) if target_label else None
                        if matching_attr:
                            cleaned_attrs.append({"spec_id": matching_attr["id"], "value": attr.get("value")})
                sh["attributes"] = cleaned_attrs

        for sh in clean_shapes:
            if sh.get("label_id") in label_map:
                sh["label_id"] = label_map[sh["label_id"]]
        
    payload = {
        "version": data.get("version", 0),
        "tags": data.get("tags", []),
        "shapes": clean_shapes,
        "tracks": clean_tracks
    }
    
    print(f"[IMPORT] Đang nạp lên CVAT: {base_url} (Job {job_id}) chế độ [{mode_label}] via {http_method} ...")
    req_headers = {
        **headers,
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=req_headers,
        method=http_method
    )
    
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8")
            status = resp.status
    except urllib.error.HTTPError as e:
        print(f"[LỖI HTTP {e.code}]: {e.reason}")
        err_msg = e.read().decode("utf-8", errors="ignore")
        print(f"Chi tiết: {err_msg[:250]}")
        sys.exit(1)
        
    print(f"\n✅ IMPORT [{mode_label}] THÀNH CÔNG vào Job {job_id} (Status HTTP {status})!")
    print(f" - Đã nạp {len(clean_tracks)} tracks vào hệ thống.")
    print(f" - Truy cập link sau để kiểm tra: {base_url}/tasks/.../jobs/{job_id}")

def inspect_job(target: str):
    """Inspects live annotations and keyframe cadences of a job."""
    base_url, job_id = parse_cvat_url(target)
    url = f"{base_url}/api/jobs/{job_id}/annotations"
    headers = get_headers(base_url)
    
    print(f"\n[INSPECT] Đang kiểm tra Job {job_id} trên {base_url} ...")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        
    tracks = data.get("tracks", [])
    print(f"Job {job_id} hiện có {len(tracks)} tracks:")
    for idx, t in enumerate(tracks):
        shapes = t.get("shapes", [])
        frames = [s["frame"] for s in shapes]
        print(f" - Track {idx+1:02d} (Label {t.get('label_id')}): Keyframes={frames}")

def main():
    parser = argparse.ArgumentParser(
        description="CVAT Universal I/O Tool: Export & Import 3D annotations by URL or Job ID.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ví dụ sử dụng:
  python scripts/cvat_io.py export "https://cvat-test.vantixapps.net/tasks/12/jobs/58" --output backup.json
  python scripts/cvat_io.py import "https://cvat-test.vantixapps.net/tasks/12/jobs/58" --file backup.json --clean
  python scripts/cvat_io.py inspect "https://cvat-test.vantixapps.net/tasks/12/jobs/58"
        """
    )
    subparsers = parser.add_subparsers(dest="action", required=True, help="Hành động: export, import, inspect")
    
    # Export
    p_export = subparsers.add_parser("export", help="Export annotations từ link hoặc Job ID")
    p_export.add_argument("url", type=str, help="Link CVAT (hoặc Job ID) cần export")
    p_export.add_argument("--output", "-o", type=str, default="", help="Đường dẫn file .json đầu ra")
    
    # Import
    p_import = subparsers.add_parser("import", help="Import annotations vào link hoặc Job ID")
    p_import.add_argument("url", type=str, help="Link CVAT (hoặc Job ID) cần import")
    p_import.add_argument("--file", "-f", type=str, required=True, help="Đường dẫn file .json cần nạp")
    p_import.add_argument("--mode", "-m", choices=["replace", "append"], default="replace", help="Chế độ import: replace (ghi đè toàn bộ) hoặc append (thêm vào annotations hiện có)")
    p_import.add_argument("--clean", action="store_true", default=True, help="Tự động lọc bỏ ID server cũ và chống khóa cứng nội suy (mặc định bật)")
    p_import.add_argument("--no-clean", action="store_false", dest="clean", help="Không tự động lọc bỏ keyframe thừa")
    
    # Inspect
    p_inspect = subparsers.add_parser("inspect", help="Xem chi tiết các tracks và keyframes của Job")
    p_inspect.add_argument("url", type=str, help="Link CVAT (hoặc Job ID)")
    
    args = parser.parse_args()
    
    if args.action == "export":
        out = Path(args.output) if args.output else None
        export_annotations(args.url, out)
    elif args.action == "import":
        import_annotations(args.url, Path(args.file), clean=args.clean, mode=args.mode)
    elif args.action == "inspect":
        inspect_job(args.url)

if __name__ == "__main__":
    main()
