#!/usr/bin/env python3
"""CVAT 3D annotation CLI. Python 3.10+, standard library only.

Credentials are read from environment or getpass; never from browser profiles.
Imports replace saved server annotations. Close the editor first; every import
requires --confirm-job and --editor-closed and writes a native JSON backup.
"""
import argparse
import copy
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

SCHEMA = "cvat-3d-tool-native-annotations/v1"


class CLIError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise CLIError("Redirect refused; credentials were not forwarded. Check --server.")


def origin_of(value):
    u = urllib.parse.urlsplit(value)
    if u.username or u.password or u.query or u.fragment or u.path not in ("", "/"):
        raise CLIError("Server must be an origin, without credentials, path or query.")
    if not u.hostname or u.scheme not in ("http", "https"):
        raise CLIError("Invalid server origin.")
    if u.scheme != "https" and u.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise CLIError("HTTPS required except for local test servers.")
    return urllib.parse.urlunsplit((u.scheme, u.netloc, "", "", ""))


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def valid_annotations(data):
    if not isinstance(data, dict) or not all(isinstance(data.get(k), list) for k in ("tags", "shapes", "tracks")):
        raise CLIError("Invalid native annotation structure.")
    try:
        fingerprint(data)
    except (ValueError, TypeError) as exc:
        raise CLIError("Annotations contain invalid JSON/numeric values.") from exc
    return data


def counts(data):
    return {key: len(data[key]) for key in ("tags", "shapes", "tracks")}


def write_new(path, data):
    """Exclusive creation, fsync, and remove only this newly created file on failure."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        stream = path.open("xb")
    except FileExistsError as exc:
        raise CLIError(f"Output exists; choose a new filename: {path}") from exc
    try:
        with stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path


def check_zip(path, limit):
    try:
        with zipfile.ZipFile(path) as archive:
            files = archive.infolist()
            if not files or sum(f.file_size for f in files) > limit:
                raise CLIError("Empty ZIP or expanded size exceeds --max-mib.")
            if archive.testzip() is not None:
                raise CLIError("ZIP CRC validation failed.")
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise CLIError("File is not a readable, valid ZIP.") from exc


class Client:
    def __init__(self, server, job, session="", csrf="", token="", scheme="Token", max_mib=256, timeout=1200, interval=2):
        self.server, self.job = origin_of(server), job
        self.limit, self.timeout, self.interval = max_mib * 1024 * 1024, timeout, interval
        self.root = f"/api/jobs/{job}"
        self.opener = urllib.request.build_opener(NoRedirect())
        self.headers = {"Accept": "application/vnd.cvat+json", "Referer": self.server + "/"}
        self.cookie_auth, self.csrf = not bool(token), csrf
        for value in (session, csrf, token, scheme):
            if any(c in value for c in ("\r", "\n")):
                raise CLIError("Invalid authentication value.")
        if token:
            if scheme not in ("Token", "Bearer"):
                raise CLIError("Token scheme must be Token or Bearer.")
            self.headers["Authorization"] = scheme + " " + token
        elif session:
            if ";" in session or ";" in csrf:
                raise CLIError("Supply cookie values only, not a full Cookie header.")
            self.headers["Cookie"] = "sessionid=" + session + ("; csrftoken=" + csrf if csrf else "")
        else:
            raise CLIError("Set CVAT_SESSIONID (and CVAT_CSRFTOKEN for writes), or use --prompt-auth.")

    def url(self, path):
        u = urllib.parse.urlsplit(urllib.parse.urljoin(self.server + "/", path))
        if urllib.parse.urlunsplit((u.scheme, u.netloc, "", "", "")) != self.server or u.username or u.password or u.fragment:
            raise CLIError("Cross-origin URL refused; credentials were not sent.")
        if not u.path.startswith("/api/"):
            raise CLIError("Only CVAT API URLs are permitted.")
        return u.geturl()

    def open(self, path, method="GET", body=None, headers=None):
        outgoing = {**self.headers, **(headers or {})}
        if method != "GET" and self.cookie_auth:
            if not self.csrf:
                raise CLIError("CVAT_CSRFTOKEN required for cookie-authenticated writes.")
            outgoing["X-CSRFToken"] = self.csrf
        request = urllib.request.Request(self.url(path), data=body, headers=outgoing, method=method)
        try:
            return self.opener.open(request, timeout=60)
        except urllib.error.HTTPError as exc:
            # Do not echo response bodies, headers or authentication values.
            if exc.code in (401, 403):
                raise CLIError(f"CVAT refused {method} (HTTP {exc.code}); check session, CSRF and account permissions. Python does not grant extra permissions.") from None
            raise CLIError(f"CVAT API HTTP {exc.code}. If a write was attempted, inspect Requests before retrying.") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise CLIError("Network/TLS error or timeout. Writes are not retried; inspect CVAT Requests before retrying.") from None

    def json(self, path, method="GET", body=None, headers=None):
        with self.open(path, method, body, headers) as response:
            data = response.read(self.limit + 1)
        if len(data) > self.limit:
            raise CLIError("API JSON exceeds --max-mib.")
        try:
            return json.loads(data) if data else {}
        except (ValueError, UnicodeError):
            raise CLIError("CVAT returned invalid JSON; no authentication content was logged.") from None

    def preflight(self):
        user = self.json("/api/users/self")
        job = self.json(self.root)
        if job.get("id") != self.job or job.get("dimension") != "3d":
            raise CLIError("Expected the selected 3D job.")
        print(f"Authenticated; 3D job {self.job}. Server annotations only; unsaved editor changes are not included.")
        return user, job

    def formats(self):
        data = self.json("/api/server/annotation/formats")
        return {key: [f for f in data.get(key, []) if f.get("dimension") == "3d" and f.get("enabled", True)] for key in ("exporters", "importers")}

    def annotations(self):
        return valid_annotations(self.json(self.root + "/annotations"))

    def labels(self):
        path = "/api/labels?" + urllib.parse.urlencode({"job_id": self.job, "page_size": 100})
        labels = []
        for _ in range(100):
            data = self.json(path)
            if isinstance(data, list):
                return labels + data
            labels.extend(data.get("results", []))
            path = data.get("next")
            if not path:
                return labels
            parsed = urllib.parse.urlsplit(self.url(path))
            if parsed.path.rstrip("/") != "/api/labels" or urllib.parse.parse_qs(parsed.query).get("job_id") != [str(self.job)]:
                raise CLIError("Invalid label pagination URL.")
        raise CLIError("Too many label pages.")

    def native_bundle(self):
        data = self.annotations()
        return {"schema": SCHEMA, "origin": self.server, "jobId": self.job,
                "exportedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "source": "saved-server-annotations", "labels": self.labels(), "annotations": data,
                "annotationSha256": fingerprint(data)}

    def export_native(self, output):
        bundle = self.native_bundle()
        write_new(output, json.dumps(bundle, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8"))
        print(f"Native JSON saved: {output}; {counts(bundle['annotations'])}")
        return bundle

    def poll(self, request_id):
        if not isinstance(request_id, str) or not request_id or len(request_id) > 2048:
            raise CLIError("Missing/invalid rq_id. Check CVAT Requests before retrying.")
        print(f"Request: {request_id}")
        deadline, previous = time.monotonic() + self.timeout, None
        while time.monotonic() < deadline:
            data = self.json("/api/requests/" + urllib.parse.quote(request_id, safe=""))
            status = data.get("status")
            if status != previous:
                print("CVAT status:", status)
                previous = status
            if status == "finished":
                return data
            if status in ("failed", "canceled", "cancelled"):
                raise CLIError("CVAT request failed/canceled. See Requests; do not blindly retry.")
            if status not in ("queued", "started", "deferred", "scheduled"):
                raise CLIError("Unknown CVAT request state; check Requests before retrying.")
            time.sleep(self.interval)
        raise CLIError("Polling timed out. Server work may still be running; inspect Requests before retrying.")

    def export_zip(self, fmt, output):
        if fmt not in [f["name"] for f in self.formats()["exporters"]]:
            raise CLIError("Choose an enabled 3D exporter from the formats command.")
        if Path(output).exists():
            raise CLIError("Output exists; choose a new filename.")
        started = self.json(self.root + "/dataset/export?" + urllib.parse.urlencode({"format": fmt, "save_images": "false", "location": "local"}), "POST", b"")
        ready = self.poll(started.get("rq_id"))
        url = ready.get("result_url")
        if not url:
            raise CLIError("Server returned no local result_url.")
        parsed = urllib.parse.urlsplit(self.url(url))
        if not (parsed.path.startswith(self.root + "/dataset/") or parsed.path.startswith("/api/requests/")):
            raise CLIError("Unexpected dataset download endpoint.")
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="cvat-export-", dir=Path(output).parent) as directory:
            temporary = Path(directory) / "archive.zip"
            size = 0
            with self.open(url) as response, temporary.open("wb") as stream:
                if int(response.headers.get("Content-Length", "0")) > self.limit:
                    raise CLIError("Export exceeds --max-mib.")
                while block := response.read(65536):
                    size += len(block)
                    if size > self.limit:
                        raise CLIError("Export exceeds --max-mib.")
                    stream.write(block)
            check_zip(temporary, self.limit)
            # Publish only a validated archive; exclusive creation avoids overwrite.
            with temporary.open("rb") as source:
                write_new(output, source.read())
        print(f"Dataset annotation ZIP saved: {output} ({size} bytes; no point clouds/images).")

    def backup(self, directory):
        path = Path(directory) / f"job{self.job}-before-import-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{uuid.uuid4().hex[:8]}.json"
        bundle = self.export_native(path)
        saved = json.loads(path.read_text(encoding="utf-8"))
        if fingerprint(saved["annotations"]) != fingerprint(bundle["annotations"]):
            raise CLIError("Backup verification failed; import stopped.")
        if fingerprint(self.annotations()) != fingerprint(bundle["annotations"]):
            raise CLIError("Server annotations changed after backup; import stopped.")
        return path

    def import_zip(self, fmt, file, backup_dir):
        if fmt not in [f["name"] for f in self.formats()["importers"]]:
            raise CLIError("Choose an enabled 3D importer from the formats command.")
        file = Path(file)
        if not file.is_file() or not 0 < file.stat().st_size <= self.limit:
            raise CLIError("Missing/empty input file or size exceeds --max-mib.")
        with file.open("rb") as stream:
            contents = stream.read(self.limit + 1)
        if len(contents) > self.limit:
            raise CLIError("Input exceeds --max-mib.")
        check_zip(io.BytesIO(contents), self.limit)
        boundary = "cvat-tool-" + uuid.uuid4().hex
        # Fixed multipart filename avoids header injection from local filenames.
        prefix = (f'--{boundary}\r\nContent-Disposition: form-data; name="annotation_file"; filename="annotations.zip"\r\nContent-Type: application/zip\r\n\r\n').encode()
        suffix = f"\r\n--{boundary}--\r\n".encode()
        backup = self.backup(backup_dir)
        body = prefix + contents + suffix
        started = self.json(self.root + "/annotations/?" + urllib.parse.urlencode({"format": fmt, "location": "local", "use_default_location": "false"}), "POST", body,
                            {"Content-Type": "multipart/form-data; boundary=" + boundary})
        self.poll(started.get("rq_id"))
        print(f"Server import finished; read-back {counts(self.annotations())}; backup: {backup}")

    def import_native(self, file, backup_dir):
        file = Path(file)
        if not file.is_file() or not 0 < file.stat().st_size <= self.limit:
            raise CLIError("Missing/empty JSON or size exceeds --max-mib.")
        try:
            bundle = json.loads(file.read_text(encoding="utf-8"))
        except (ValueError, UnicodeError):
            raise CLIError("Invalid JSON file.") from None
        if bundle.get("schema") != SCHEMA or bundle.get("origin") != self.server or bundle.get("jobId") != self.job:
            raise CLIError("Native JSON restore is restricted to its original server/job.")
        annotations = valid_annotations(bundle.get("annotations"))
        current_labels = {l["id"]: l for l in self.labels()}
        if not bundle.get("labels") or any(current_labels.get(l.get("id"), {}).get("name") != l.get("name") for l in bundle["labels"]):
            raise CLIError("Label IDs/names changed or label mapping missing; restore stopped.")
        source_labels = {l["id"]: l for l in bundle["labels"]}
        def validate_attributes(items, label_id):
            current = {a["id"]: a for a in current_labels[label_id].get("attributes", [])}
            source = {a["id"]: a for a in source_labels[label_id].get("attributes", [])}
            for attribute in items:
                spec = attribute.get("spec_id")
                if spec not in current or spec not in source or any(current[spec].get(k) != source[spec].get(k) for k in ("name", "input_type", "mutable", "values")):
                    raise CLIError("Attribute schema missing/changed. Use a Python native export with full label definitions; restore stopped.")
        def validate_shape(shape, label_id, cuboid=True):
            if not isinstance(shape.get("frame"), int) or shape["frame"] < 0:
                raise CLIError("Invalid annotation frame.")
            validate_attributes(shape.get("attributes", []), label_id)
            if cuboid:
                points = shape.get("points", [])
                if shape.get("type") != "cuboid" or len(points) != 16 or any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in points) or any(v <= 0 for v in points[6:9]):
                    raise CLIError("Native restore supports valid CVAT16 cuboids and tags only.")
        for key in ("tags", "shapes", "tracks"):
            for item in annotations[key]:
                label_id = item.get("label_id")
                if label_id not in source_labels or label_id not in current_labels:
                    raise CLIError("Unknown label ID in native annotations.")
                validate_attributes(item.get("attributes", []), label_id)
                if key == "tracks":
                    if not isinstance(item.get("shapes"), list) or not item["shapes"]:
                        raise CLIError("Invalid track shape list.")
                    for shape in item["shapes"]:
                        validate_shape(shape, label_id)
                else:
                    validate_shape(item, label_id, key == "shapes")
        def without_ids(value):
            if isinstance(value, dict):
                return {k: without_ids(v) for k, v in value.items() if k != "id"}
            if isinstance(value, list):
                return [without_ids(v) for v in value]
            return value
        payload = without_ids(copy.deepcopy(annotations))
        backup = self.backup(backup_dir)
        self.json(self.root + "/annotations", "PUT", json.dumps(payload, allow_nan=False).encode(), {"Content-Type": "application/json"})
        readback = without_ids(self.annotations())
        # Native IDs can change on replacement; no claim that server IDs survive.
        if fingerprint({k: readback[k] for k in ("tags", "shapes", "tracks")}) != fingerprint({k: payload[k] for k in ("tags", "shapes", "tracks")}):
            raise CLIError(f"Server accepted the write but exact read-back differs; inspect CVAT before retrying. Backup: {backup}")
        print(f"Native restore read-back matches; server IDs may change. Backup: {backup}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--server", default=os.environ.get("CVAT_BASE_URL"), required=not bool(os.environ.get("CVAT_BASE_URL")))
    parser.add_argument("--job", type=int, required=True)
    parser.add_argument("--prompt-auth", action="store_true", help="Read sessionID/CSRF with hidden prompts; do not put secrets in command history")
    parser.add_argument("--max-mib", type=int, default=256)
    parser.add_argument("--timeout", type=int, default=1200, help="Polling deadline in seconds")
    subs = parser.add_subparsers(dest="command", required=True)
    subs.add_parser("formats")
    for command in ("export", "export-native", "import", "import-native"):
        sub = subs.add_parser(command)
        if command in ("export", "import"):
            sub.add_argument("--format", default="Datumaro 3D 1.0")
        if command.startswith("export"):
            sub.add_argument("--output", required=True)
        else:
            sub.add_argument("--file", required=True)
            sub.add_argument("--backup-dir", default="cvat-backups")
            sub.add_argument("--confirm-job", type=int, required=True)
            sub.add_argument("--editor-closed", action="store_true", required=True, help="Close the editor before server writes; reload before editing again")
    args = parser.parse_args(argv)
    if args.job < 1 or not 1 <= args.max_mib <= 4096 or not 1 <= args.timeout <= 86400:
        raise CLIError("Invalid job, size limit or timeout.")
    if args.command.startswith("import") and args.confirm_job != args.job:
        raise CLIError("--confirm-job must match --job; no request sent.")
    session = os.environ.get("CVAT_SESSIONID") or os.environ.get("CVAT_SESSION_ID", "")
    csrf = os.environ.get("CVAT_CSRFTOKEN") or os.environ.get("CVAT_CSRF_TOKEN", "")
    token = os.environ.get("CVAT_API_TOKEN", "")
    if args.prompt_auth:
        session, csrf, token = getpass.getpass("SessionID (hidden): "), getpass.getpass("CSRF token (hidden; needed for writes): "), ""
    client = Client(args.server, args.job, session, csrf, token, os.environ.get("CVAT_TOKEN_SCHEME", "Token"), args.max_mib, args.timeout)
    client.preflight()
    if args.command == "formats":
        print(json.dumps(client.formats(), indent=2))
    elif args.command == "export":
        client.export_zip(args.format, args.output)
    elif args.command == "export-native":
        client.export_native(args.output)
    else:
        if client.cookie_auth and not client.csrf:
            raise CLIError("CVAT_CSRFTOKEN required before import.")
        print("IMPORT REPLACES SAVED ANNOTATIONS. A verified native JSON backup is required. Keep the editor closed.")
        if args.command == "import":
            client.import_zip(args.format, args.file, args.backup_dir)
        else:
            client.import_native(args.file, args.backup_dir)
        print("Reload CVAT before editing. Never Save a previously open editor over imported data.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (CLIError, OSError, ValueError, KeyError, TypeError) as error:
        # CLIError messages deliberately contain no response bodies/credentials.
        print("ERROR:", str(error) if isinstance(error, CLIError) else "Local file or response structure error; operation stopped. Check Requests if a write was attempted.", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("Interrupted. Server work may still be running; check Requests before retrying.", file=sys.stderr)
        sys.exit(130)
