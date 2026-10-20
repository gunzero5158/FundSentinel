"""Cloud scheduler: heartbeat -> unique funds -> persisted NAV -> per-user atomic evaluation.

Run with --dry-run for a configuration-only check (no network or notifications).
"""
from __future__ import annotations
import concurrent.futures
import datetime as dt
import json
import os
import sys
import urllib.request
from services.fund_fetcher import fetch_fund

def request(url: str, headers: dict, method="GET", data=None):
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode()
    req = urllib.request.Request(url, data=body, method=method, headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=65) as response:
        raw = response.read()
        return json.loads(raw) if raw else None

def main():
    required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_URL", "MONITOR_SECRET"]
    missing = [key for key in required if not os.getenv(key)]
    if "--dry-run" in sys.argv:
        print(json.dumps({"version": "0.1.0", "configured": not missing, "missing": missing, "schedule_beijing": ["21:17", "22:47", "08:47"]}, ensure_ascii=False))
        return
    if missing:
        raise RuntimeError("Missing configuration: " + ", ".join(missing))
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": "Bearer " + key, "Prefer": "resolution=merge-duplicates,return=minimal"}
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    # Always perform heartbeat, including weekends and long public holidays. A request is not a hosting SLA.
    request(base + "system_heartbeat?on_conflict=id", headers, "POST", {"id": 1, "last_seen": now.isoformat()})
    # Query even on weekends: QDII/FOF late confirmation must not be skipped by a mainland-only calendar.
    positions = []
    for offset in range(0, 100_000, 1000):
        page = request(base + f"user_positions?select=user_id,fund_code&order=user_id,id&limit=1000&offset={offset}", headers)
        positions.extend(page)
        if len(page) < 1000:
            break
    codes = sorted({p["fund_code"] for p in positions})
    failures = []
    def sync(code):
        fund = fetch_fund(code)
        request(base + "rpc/upsert_fund", headers, "POST", {"p_code": code, "p_payload": fund})
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(sync, code): code for code in codes}
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception:
                failures.append(futures[future])
    for user in sorted({p["user_id"] for p in positions}):
        try:
            request(os.environ["APP_URL"].rstrip("/") + "/api/monitor", {"x-monitor-secret": os.environ["MONITOR_SECRET"]}, "POST", {"user": user, "evaluateOnly": True})
        except Exception:
            failures.append("user:" + user[:8])
    print(json.dumps({"fund_count": len(codes), "failures": failures, "heartbeat": now.isoformat()}, ensure_ascii=False))
    if failures:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
