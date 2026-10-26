"""Real local HTTP integration; all cookies/data below are synthetic fixtures."""
import copy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode = True
import tempfile
import threading
import unittest
from unittest.mock import patch
import zipfile

SCRIPT = Path(__file__).resolve().parents[1] / "extension" / "cvat_annotations.py"
spec = importlib.util.spec_from_file_location("annotation_cli", SCRIPT)
cli = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cli)


def annotations():
    return {"version": 0, "tags": [], "shapes": [], "tracks": [{"id": 123, "label_id": 7, "frame": 0,
        "attributes": [{"spec_id": 99, "value": "car"}], "shapes": [
            {"id": frame + 10, "frame": frame, "type": "cuboid", "outside": False,
             "attributes": [], "points": [frame / 10, 0, .75, 0, 0, 0, 4.5, 1.8, 1.5, 0, 0, 0, 0, 0, 0, 0]}
            for frame in (0, 7, 14)]}]}


class FakeCVAT(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, data, code=200, content_type="application/json"):
        body = data if isinstance(data, bytes) else json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def request_data(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.server.calls.append((self.command, self.path, body))
        return body

    def do_GET(self):
        self.request_data()
        s = self.server
        if self.path == "/api/users/self":
            if s.redirect:
                self.send_response(302)
                self.send_header("Location", "https://example.invalid/api/steal")
                self.end_headers()
            else:
                self.reply({"id": 1, "username": "test-annotator"})
        elif self.path == "/api/jobs/17":
            self.reply({"id": 17, "dimension": s.dimension})
        elif self.path.startswith("/api/labels?"):
            self.reply({"results": s.labels, "next": None})
        elif self.path == "/api/server/annotation/formats":
            f = [{"name": "COCO 1.0", "dimension": "2d"}, {"name": "Datumaro 3D 1.0", "dimension": "3d", "enabled": True},
                 {"name": "Disabled 3D", "dimension": "3d", "enabled": False}]
            self.reply({"exporters": f, "importers": f})
        elif self.path == "/api/jobs/17/annotations":
            s.reads += 1
            if s.race and s.reads == 2:
                s.data["tracks"][0]["shapes"][0]["points"][0] += .3
            self.reply(s.data)
        elif self.path.startswith("/api/requests/"):
            if s.pending:
                self.reply({"status": "started"})
            else:
                self.reply({"status": "finished", "result_url": s.result_url or s.origin + "/api/jobs/17/dataset/export?rq_id=export-test"})
        elif self.path.startswith("/api/jobs/17/dataset/export?"):
            self.reply(s.archive, content_type="application/zip")
        else:
            self.reply({}, 404)

    def do_POST(self):
        body = self.request_data()
        if self.headers.get("X-CSRFToken") != "test-csrf":
            return self.reply({}, 403)
        if "/dataset/export?" in self.path:
            return self.reply({} if self.server.deny_export else {"rq_id": "export-test"}, 403 if self.server.deny_export else 202)
        if "/annotations/?" in self.path:
            if b'name="annotation_file"' not in body or b"PK\x03\x04" not in body:
                return self.reply({}, 400)
            self.server.data["tracks"][0]["shapes"][0]["points"][0] = .25
            return self.reply({"rq_id": "import-test"}, 202)
        self.reply({}, 404)

    def do_PUT(self):
        data = json.loads(self.request_data())
        if self.headers.get("X-CSRFToken") != "test-csrf":
            return self.reply({}, 403)
        data["tracks"][0]["id"] = 999
        data["version"] = 1
        self.server.data = data
        self.reply(data)


class AnnotationCLI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cvat-cli-test-")
        self.directory = Path(self.temp.name)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeCVAT)
        s = self.server
        s.origin = f"http://127.0.0.1:{s.server_port}"
        s.calls, s.data = [], annotations()
        s.labels = [{"id": 7, "name": "vehicles", "attributes": [{"id": 99, "name": "type", "input_type": "select", "mutable": False, "values": ["car", "van"]}]}]
        s.archive, s.reads, s.redirect, s.deny_export, s.race, s.pending, s.result_url, s.dimension = self.zip_bytes(), 0, False, False, False, False, None, "3d"
        self.thread = threading.Thread(target=s.serve_forever, daemon=True)
        self.thread.start()
        self.client = cli.Client(s.origin, 17, "test-session", "test-csrf", interval=.001)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    @staticmethod
    def zip_bytes():
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("annotations/default.json", json.dumps(annotations()))
        return out.getvalue()

    def writes(self):
        return [x for x in self.server.calls if x[0] in ("POST", "PUT")]

    def test_export_native_preserves_keyframes_and_complete_attribute_schema(self):
        output = self.directory / "native.json"
        bundle = self.client.export_native(output)
        self.assertEqual(bundle["annotations"], annotations())
        self.assertEqual(bundle["labels"], self.server.labels)
        self.assertEqual(json.loads(output.read_text())["annotationSha256"], cli.fingerprint(annotations()))
        self.assertFalse(self.writes())
        with self.assertRaises(cli.CLIError):
            self.client.export_native(output)

    def test_dataset_export_download_is_complete_valid_zip(self):
        self.client.preflight()
        output = self.directory / "dataset.zip"
        self.client.export_zip("Datumaro 3D 1.0", output)
        self.assertEqual(output.read_bytes(), self.server.archive)
        self.assertIn("save_images=false", self.writes()[0][1])
        with zipfile.ZipFile(output) as archive:
            self.assertEqual(json.loads(archive.read("annotations/default.json")), annotations())

    def test_export_refusal_does_not_retry_or_create_file(self):
        self.server.deny_export = True
        with self.assertRaisesRegex(cli.CLIError, "HTTP 403"):
            self.client.export_zip("Datumaro 3D 1.0", self.directory / "denied.zip")
        self.assertEqual(len(self.writes()), 1)
        self.assertFalse((self.directory / "denied.zip").exists())

    def test_nonzip_response_and_external_download_are_rejected(self):
        output = self.directory / "bad.zip"
        self.server.archive = b"<html>login</html>"
        with self.assertRaises(cli.CLIError):
            self.client.export_zip("Datumaro 3D 1.0", output)
        self.assertFalse(output.exists())
        self.server.result_url = "https://example.invalid/api/jobs/17/dataset/export"
        with self.assertRaisesRegex(cli.CLIError, "Cross-origin"):
            self.client.export_zip("Datumaro 3D 1.0", output)

    def test_import_zip_creates_verified_native_backup_before_single_upload(self):
        file = self.directory / "in.zip"
        file.write_bytes(self.server.archive)
        self.client.import_zip("Datumaro 3D 1.0", file, self.directory / "backups")
        backups = list((self.directory / "backups").glob("*.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(json.loads(backups[0].read_text())["annotations"], annotations())
        self.assertEqual(len(self.writes()), 1)
        self.assertIn("format=Datumaro+3D+1.0", self.writes()[0][1])
        self.assertIn("use_default_location=false", self.writes()[0][1])
        self.assertEqual(self.server.data["tracks"][0]["shapes"][0]["points"][0], .25)

    def test_native_restore_same_job_keeps_geometry_and_keyframes_with_new_server_ids(self):
        file = self.directory / "source.json"
        self.client.export_native(file)
        self.server.data["tracks"][0]["shapes"][0]["points"][0] = 3
        self.client.import_native(file, self.directory / "backups")
        self.assertEqual(self.server.data["tracks"][0]["id"], 999)
        self.assertEqual(self.server.data["tracks"][0]["shapes"][0]["points"][0], 0)
        self.assertEqual([s["frame"] for s in self.server.data["tracks"][0]["shapes"]], [0, 7, 14])
        self.assertEqual(len(self.writes()), 1)

    def test_wrong_job_and_changed_attribute_schema_never_write(self):
        file = self.directory / "source.json"
        bundle = self.client.export_native(file)
        bundle["jobId"] = 18
        file.write_text(json.dumps(bundle))
        with self.assertRaisesRegex(cli.CLIError, "original server/job"):
            self.client.import_native(file, self.directory / "backups")
        bundle["jobId"] = 17
        file.write_text(json.dumps(bundle))
        self.server.labels[0]["attributes"][0]["name"] = "unrelated"
        with self.assertRaisesRegex(cli.CLIError, "schema"):
            self.client.import_native(file, self.directory / "backups")
        self.assertFalse(self.writes())

    def test_backup_io_failure_and_concurrent_edit_stop_before_import(self):
        file = self.directory / "in.zip"
        file.write_bytes(self.server.archive)
        with patch.object(cli, "write_new", side_effect=OSError("test disk failure")):
            with self.assertRaises(OSError):
                self.client.import_zip("Datumaro 3D 1.0", file, self.directory / "backups")
        self.assertFalse(self.writes())
        self.server.reads, self.server.race = 0, True
        with self.assertRaisesRegex(cli.CLIError, "changed after backup"):
            self.client.import_zip("Datumaro 3D 1.0", file, self.directory / "backups")
        self.assertFalse(self.writes())

    def test_redirect_plain_http_remote_missing_csrf_and_wrong_format_are_blocked(self):
        self.server.redirect = True
        with self.assertRaisesRegex(cli.CLIError, "Redirect refused"):
            self.client.preflight()
        with self.assertRaisesRegex(cli.CLIError, "HTTPS"):
            cli.Client("http://example.invalid", 17, "test-session")
        with self.assertRaisesRegex(cli.CLIError, "CSRF"):
            cli.Client(self.server.origin, 17, "test-session").export_zip("Datumaro 3D 1.0", self.directory / "no.zip")
        with self.assertRaisesRegex(cli.CLIError, "3D exporter"):
            self.client.export_zip("COCO 1.0", self.directory / "wrong.zip")
        self.assertFalse(self.writes())

    def test_poll_timeout_does_not_restart_server_operation(self):
        self.server.pending = True
        self.client.timeout = .01
        with self.assertRaisesRegex(cli.CLIError, "Polling timed out"):
            self.client.poll("pending-test")
        self.assertFalse(self.writes())

    def test_real_cli_process_uses_environment_and_keeps_secrets_out_of_output(self):
        env = {**os.environ, "CVAT_SESSIONID": "fixture-secret-not-real", "CVAT_CSRFTOKEN": "test-csrf", "CVAT_API_TOKEN": ""}
        output = self.directory / "from-process.json"
        result = subprocess.run([sys.executable, str(SCRIPT), "--server", self.server.origin, "--job", "17", "export-native", "--output", str(output)], env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(env["CVAT_SESSIONID"], result.stdout + result.stderr)
        self.assertEqual(len(json.loads(output.read_text())["annotations"]["tracks"]), 1)
        result = subprocess.run([sys.executable, str(SCRIPT), "--server", self.server.origin, "--job", "17", "import-native", "--file", str(output), "--confirm-job", "18", "--editor-closed"], env=env, capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.writes())


if __name__ == "__main__":
    unittest.main()
