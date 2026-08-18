"""
Self-host the subset of echo images that live on img.game8.co, and rewrite
their pictureUrl in the echo catalog to point at the local copy instead.

Why this exists: the Build Card's "Copy Image"/"Download" export (see
BuildCard.tsx) renders the card client-side via html-to-image, which needs
to actually fetch each embedded image's raw pixel bytes via JS (not just
display it via a plain <img> tag). img.game8.co sends no
Access-Control-Allow-Origin header at all (confirmed 2026-08-19 via
`curl -I`), which blocks that fetch outright -- a real user's export showed
every echo icon as a broken/garbled image while the character portrait and
weapon icon (served from guide-res.aki-game.net, which DOES send
`Access-Control-Allow-Origin: *`) rendered fine. This affects 149 of 180
echoes (83%) -- systematic, not occasional, and not fixable with a
client-side request-options tweak (CORS is a hard browser security
boundary, not something the requester can waive).

Self-hosting sidesteps the problem entirely: once these images are served
from this app's own origin, the export's image fetch is same-origin and
CORS never enters into it. guide-res.aki-game.net echoes are left as-is
(31 of 180) -- they already work, no need to duplicate them locally.

Output: frontend/public/echo-images/<hash>.png (one file per unique image,
named after the stable hash segment already in game8's own URL, e.g.
".../4543953/c8c5e35c2290152c2e2418105be50f72.png/show" ->
"c8c5e35c2290152c2e2418105be50f72.png"), and rewrites data/echo_catalog.json
+ its mirrors (frontend/public/data/, supabase/functions/agent/) to point
each affected echo's pictureUrl at "/echo-images/<hash>.png".

Rerun whenever data/echo_catalog.json changes (e.g. after
fetch_echo_data.py picks up new echoes) -- new game8.co-sourced echoes need
a local copy fetched too, or they'll hit the same broken-export problem.
"""

import json
import re
import shutil
import sys
import io
import time
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

CATALOG_PATH = "data/echo_catalog.json"
FRONTEND_COPY_PATH = "frontend/public/data/echo_catalog.json"
FUNCTION_COPY_PATH = "supabase/functions/agent/echo_catalog.json"
IMAGES_DIR = "frontend/public/echo-images"

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# Matches ".../<numeric id>/<hash>.png/show" -- the hash segment is a stable,
# collision-free filename (confirmed 2026-08-19: all 149 game8.co URLs in
# the catalog are already unique).
GAME8_URL_RE = re.compile(r"img\.game8\.co/\d+/([0-9a-f]+)\.png")


def download(url, dest_path):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        with open(dest_path, "wb") as f:
            f.write(resp.read())


def main():
    import os

    os.makedirs(IMAGES_DIR, exist_ok=True)

    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = json.load(f)

    downloaded = 0
    skipped_existing = 0
    failed = []
    for echo in catalog["echoes"]:
        url = echo["pictureUrl"]
        m = GAME8_URL_RE.search(url)
        if not m:
            continue  # already guide-res.aki-game.net or already localized

        filename = f"{m.group(1)}.png"
        local_path = os.path.join(IMAGES_DIR, filename)

        if not os.path.exists(local_path):
            try:
                download(url, local_path)
                downloaded += 1
                time.sleep(0.1)
            except Exception as e:
                failed.append((echo["name"], url, str(e)))
                continue
        else:
            skipped_existing += 1

        echo["pictureUrl"] = f"/echo-images/{filename}"

    with open(CATALOG_PATH, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
    shutil.copyfile(CATALOG_PATH, FRONTEND_COPY_PATH)
    shutil.copyfile(CATALOG_PATH, FUNCTION_COPY_PATH)

    print(f"Downloaded {downloaded} new image(s), {skipped_existing} already present")
    if failed:
        print(f"\n{len(failed)} FAILED to download (left pointing at the original game8.co URL):")
        for name, url, err in failed:
            print(f"  {name}: {url} -- {err}")
    print(f"\nWrote {CATALOG_PATH}, {FRONTEND_COPY_PATH}, {FUNCTION_COPY_PATH}")


if __name__ == "__main__":
    main()
