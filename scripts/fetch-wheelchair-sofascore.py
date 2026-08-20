#!/usr/bin/env python3
"""fetch-wheelchair-sofascore.py — Fetch wheelchair tennis data from Sofascore API.
Uses curl_cffi to spoof TLS fingerprint (Chrome) and bypass WAF blocking.
Produces: wheelchair.json (root) and web-github/wheelchair.json.
Run locally or in GitHub Actions.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    from curl_cffi import requests as cffi_requests
    SESSION = cffi_requests.Session(impersonate="chrome")
except ImportError:
    print("ERROR: curl_cffi not installed. Run: pip install curl_cffi")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
OUT_ROOT = ROOT / "wheelchair.json"
OUT_PAGES = ROOT / "web-github" / "wheelchair.json"

BASE = "https://api.sofascore.com/api/v1"
HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.sofascore.com/",
}


def get(url, retries=2):
    for attempt in range(retries + 1):
        try:
            r = SESSION.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                return r.json()
            print(f"  HTTP {r.status_code}: {url} (attempt {attempt+1})")
        except Exception as e:
            print(f"  Error: {url} — {e} (attempt {attempt+1})")
        if attempt < retries:
            time.sleep(2)
    return None


def discover_wc_tournaments():
    """Find wheelchair tennis tournament IDs from Sofascore."""
    data = get(f"{BASE}/sport/tennis/unique-tournaments")
    if not data:
        return []

    wc = []
    for t in data.get("uniqueTournament", []):
        name = t.get("name", "")
        cat = t.get("category", {}).get("name", "")
        if any(kw in name.lower() for kw in ("wheelchair", "uniqlo", "unisylo")):
            wc.append(t)
        elif "wheelchair" in cat.lower():
            wc.append(t)
    return wc


def fetch_tournament_events(tournament_id):
    """Fetch all events for the current season of a tournament."""
    seasons_data = get(f"{BASE}/unique-tournaments/{tournament_id}/seasons")
    if not seasons_data or not seasons_data.get("seasons"):
        return []

    season = seasons_data["seasons"][0]
    season_id = season["id"]
    events = []
    page = 0

    while True:
        resp = get(
            f"{BASE}/tournaments/{tournament_id}/events"
            f"?editionId={season_id}&page={page}&course_events=last"
        )
        if not resp or not resp.get("events"):
            break
        events.extend(resp["events"])
        if len(resp["events"]) < 50:
            break
        page += 1
        time.sleep(0.5)

    return events


def parse_event(ev, tournament_name, tournament_cat):
    """Parse a Sofascore event into our format."""
    status_code = ev.get("status", {}).get("code", 0)
    home = ev.get("homeTeam", {}).get("name", "")
    away = ev.get("awayTeam", {}).get("name", "")
    ts = ev.get("startTimestamp", 0)
    dt = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None

    venue = ev.get("venue", {})
    city = venue.get("city", {}) if venue else {}
    location = ""
    if city:
        parts = [city.get("name", ""), city.get("country", {}).get("alpha2", "")]
        location = ", ".join(p for p in parts if p)

    return {
        "id": ev.get("id"),
        "tournament": tournament_name,
        "home": home,
        "away": away,
        "homeScore": ev.get("homeScore", {}).get("current"),
        "awayScore": ev.get("awayScore", {}).get("current"),
        "status": status_code,
        "statusDesc": ev.get("status", {}).get("description", ""),
        "date": dt.strftime("%d %b %Y") if dt else "",
        "dateShort": dt.strftime("%b %Y") if dt else "",
        "location": location,
        "category": tournament_cat,
        "round": ev.get("roundInfo", {}).get("round"),
    }


def main():
    print("=== Discovering wheelchair tennis tournaments ===")
    wc_tournaments = discover_wc_tournaments()
    print(f"  Found {len(wc_tournaments)} wheelchair tournaments")
    for t in wc_tournaments:
        print(f"    {t['name']} (id={t['id']})")

    if not wc_tournaments:
        print("\nNo wheelchair tournaments found on Sofascore.")
        print("This might mean Sofascore doesn't label them separately.")
        print("Falling back to static data only.")
        # Just copy existing to pages
        if OUT_ROOT.exists():
            import shutil
            shutil.copy2(OUT_ROOT, OUT_PAGES)
            print(f"Copied existing {OUT_ROOT} to {OUT_PAGES}")
        return

    all_events = []
    calendar = []
    results = []

    for t in wc_tournaments:
        tid = t["id"]
        tname = t["name"]
        tcat = t.get("category", {}).get("name", "")
        print(f"\n  Fetching: {tname}")
        events = fetch_tournament_events(tid)
        print(f"    {len(events)} events")

        for ev in events:
            parsed = parse_event(ev, tname, tcat)
            all_events.append(parsed)

            if parsed["status"] == 2:  # finished
                results.append({
                    "tournament": parsed["tournament"],
                    "date": parsed["dateShort"],
                    "surface": "",
                    "match": f"{parsed['home']} d. {parsed['away']}",
                    "score": f"{parsed['homeScore']}-{parsed['awayScore']}",
                })
            elif parsed["status"] in (0, 1):  # scheduled or live
                calendar.append({
                    "name": f"{parsed['home']} vs {parsed['away']}",
                    "date": parsed["date"],
                    "location": parsed["location"],
                    "category": parsed["category"],
                    "surface": "",
                    "status": "Live" if parsed["status"] == 1 else "",
                })

    print(f"\n=== Results ===")
    print(f"  Total events: {len(all_events)}")
    print(f"  Calendar: {len(calendar)}")
    print(f"  Results: {len(results)}")

    # Merge with existing
    existing = None
    if OUT_ROOT.exists():
        try:
            existing = json.loads(OUT_ROOT.read_text(encoding="utf-8"))
            print(f"  Existing data (updated: {existing.get('updated', '?')})")
        except Exception:
            pass

    # Preserve existing rankings
    rankings = (existing or {}).get("rankings", {
        "menSingles": [], "womenSingles": [],
        "menDoubles": [], "womenDoubles": [], "quad": []
    })

    # Merge calendars (keep existing, add new)
    existing_cal_names = set()
    merged_calendar = list((existing or {}).get("calendar", []))
    for c in merged_calendar:
        existing_cal_names.add(c.get("name", ""))
    for c in calendar:
        if c["name"] not in existing_cal_names:
            merged_calendar.append(c)

    # Merge results (keep existing, add new)
    merged_results = list((existing or {}).get("recentResults", []))
    existing_keys = set()
    for r in merged_results:
        existing_keys.add(f"{r.get('tournament','')}|{r.get('date','')}")
    for r in results:
        key = f"{r['tournament']}|{r['date']}"
        if key not in existing_keys:
            merged_results.append(r)

    output = {
        "ok": True,
        "updated": datetime.now().strftime("%Y-%m-%d"),
        "rankings": rankings,
        "calendar": merged_calendar,
        "recentResults": merged_results,
        "source": "Sofascore API + ITF/Wikipedia",
        "sofaScoreTournaments": [{"id": t["id"], "name": t["name"]} for t in wc_tournaments],
    }

    OUT_ROOT.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\n  Written: {OUT_ROOT}")

    OUT_PAGES.parent.mkdir(parents=True, exist_ok=True)
    OUT_PAGES.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Written: {OUT_PAGES}")
    print(f"\nDone!")


if __name__ == "__main__":
    main()
