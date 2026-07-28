from __future__ import annotations

import json
import sys
import urllib.request


base_url = sys.argv[1].rstrip("/")
with urllib.request.urlopen(f"{base_url}/__ato/state", timeout=5) as response:
    state = json.load(response)

assert state == {
    "app": "sushigoto",
    "upstream_commit": "56c577941a41cd8826bd73d3120dbc524c1d9d3e",
    "demo_tasks": 3,
    "primary_screen": "action",
    "external_integrations": False,
    "runtime_downloads": False,
}
