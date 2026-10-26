import os
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT_DIR / "config"
DATA_DIR = ROOT_DIR / "data"
SAMPLES_DIR = ROOT_DIR / "samples"

# Try loading .env if present
def load_env_file():
    env_file = ROOT_DIR / ".env"
    if not env_file.exists():
        env_file = CONFIG_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

load_env_file()

# Core configuration
CVAT_BASE_URL = os.environ.get("CVAT_BASE_URL", "https://cvat-test.vantixapps.net").rstrip("/")
CVAT_SESSION_ID = os.environ.get("CVAT_SESSION_ID", "")
CVAT_CSRF_TOKEN = os.environ.get("CVAT_CSRF_TOKEN", "")
CVAT_API_TOKEN = os.environ.get("CVAT_API_TOKEN", "")
CVAT_JOB_ID = int(os.environ.get("CVAT_JOB_ID", "58"))

def get_auth_headers():
    """Build HTTP request headers based on configured credentials."""
    headers = {
        "Referer": f"{CVAT_BASE_URL}/",
        "Accept": "application/json",
    }
    
    # 1. Prefer API Token if available
    if CVAT_API_TOKEN:
        headers["Authorization"] = f"Token {CVAT_API_TOKEN}"
        return headers
    
    # 2. Use Session Cookie if provided
    if CVAT_SESSION_ID:
        cookie = f"sessionid={CVAT_SESSION_ID}"
        if CVAT_CSRF_TOKEN:
            cookie += f"; csrftoken={CVAT_CSRF_TOKEN}"
            headers["X-CSRFToken"] = CVAT_CSRF_TOKEN
        headers["Cookie"] = cookie
        return headers
        
    return headers
