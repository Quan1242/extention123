import json
import urllib.request
import urllib.error
import sys

CVAT_URL = "https://cvat-test.vantixapps.net"

def test_session(sessionid: str, csrftoken: str = ""):
    headers = {
        "Cookie": f"sessionid={sessionid}; csrftoken={csrftoken}",
        "X-CSRFToken": csrftoken,
        "Referer": f"{CVAT_URL}/",
    }
    req = urllib.request.Request(f"{CVAT_URL}/api/users/self", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            print("Status:", resp.status)
            user_data = json.loads(resp.read().decode())
            print("Logged in as:", user_data.get("username"), f"({user_data.get('email')})")
            return True, user_data
    except urllib.error.HTTPError as e:
        print("Auth failed:", e.code, e.read().decode())
        return False, None
    except Exception as e:
        print("Error:", e)
        return False, None

if __name__ == "__main__":
    if len(sys.argv) > 1:
        sess = sys.argv[1]
        csrf = sys.argv[2] if len(sys.argv) > 2 else ""
        test_session(sess, csrf)
    else:
        print("Usage: python cvat_session_test.py <sessionid> [csrftoken]")
