"""Collect "not a bean leaf" photos from Wikimedia Commons for Ijisho's 4th class.

Only freely licensed files (CC0, public domain, CC BY, CC BY-SA) are kept. Every file's author, licence and
source page go into data/negatives/attribution.csv (published as NEGATIVES_CREDITS.csv in the repo).
Anything whose title mentions beans is skipped so no bean leaf ends up labelled "not a bean leaf".

    .venv/bin/python training/collect_negatives.py
"""
import csv
import html
import json
import random
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "negatives"
API = "https://commons.wikimedia.org/w/api.php"
UA = "IjishoDatasetBuilder/0.1 (https://github.com/theoneste2060/ijisho)"
PER_QUERY = 12
ALLOWED = re.compile(r"^(CC0|Public domain|PD|CC BY(-SA)? ?\d)", re.I)
BEANISH = re.compile(r"bean|phaseolus|haricot|vigna|ibishyimbo|frijol|feij", re.I)

# Things farmers might point the camera at instead of a bean leaf.
QUERIES = {
    "objects": [
        "laptop computer", "desktop computer monitor", "plastic water bottle", "glass bottle", "smartphone in hand",
        "computer keyboard", "coffee mug", "chair", "table indoors", "portrait person Africa", "human hand",
        "motorcycle Rwanda", "car street", "house Rwanda", "street Kigali", "shoes", "handbag", "printed document paper",
        "book cover", "plate of food", "dog", "cat", "chicken", "goat", "cow", "jerrycan", "bicycle Africa",
    ],
    "other_plants": [
        "maize leaf", "cassava leaf", "banana leaf", "potato plant leaves", "coffee plant leaves", "sweet potato leaves",
        "sorghum leaf", "tomato plant leaves", "cabbage field", "lawn grass", "weeds field", "tree leaves close up",
        "tea plantation Rwanda", "rice plant", "flowers garden", "soil field Africa", "eucalyptus leaves",
    ],
}


def api(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()[:120]


def search(query):
    d = api({
        "action": "query", "generator": "search", "gsrnamespace": 6, "gsrlimit": 40,
        "gsrsearch": f"{query} filetype:bitmap", "prop": "imageinfo",
        "iiprop": "url|extmetadata|mime|size", "iiurlwidth": 512,
    })
    return list(d.get("query", {}).get("pages", {}).values())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows, seen = [], set()
    rng = random.Random(7)
    for group, queries in QUERIES.items():
        for q in queries:
            kept = 0
            for page in search(q):
                if kept >= PER_QUERY:
                    break
                title = page["title"]
                ii = (page.get("imageinfo") or [{}])[0]
                meta = ii.get("extmetadata", {})
                lic = meta.get("LicenseShortName", {}).get("value", "")
                if title in seen or BEANISH.search(title) or not ALLOWED.match(lic):
                    continue
                if ii.get("mime") not in ("image/jpeg", "image/png") or ii.get("width", 0) < 400:
                    continue
                thumb = ii.get("thumburl")
                if not thumb:
                    continue
                slug = re.sub(r"[^a-z0-9]+", "-", q.lower()).strip("-")
                name = f"{group}-{slug}-{kept:02d}.jpg"
                try:
                    req = urllib.request.Request(thumb, headers={"User-Agent": UA})
                    data = urllib.request.urlopen(req, timeout=30).read()
                except Exception as e:  # skip anything that fails to download
                    print("skip", title, e)
                    continue
                (OUT / name).write_bytes(data)
                seen.add(title)
                kept += 1
                rows.append({
                    "file": name, "group": group, "query": q, "title": title,
                    "author": clean(meta.get("Artist", {}).get("value")), "license": lic,
                    "source": ii.get("descriptionurl", ""),
                })
                time.sleep(0.3)  # be polite to Wikimedia
            print(f"{group:13s} {q:32s} {kept}", flush=True)

    # 70 / 15 / 15 split, stratified by search query, so every kind of object appears in every split.
    by_q = {}
    for r in rows:
        by_q.setdefault(r["query"], []).append(r)
    for items in by_q.values():
        rng.shuffle(items)
        n = len(items)
        for i, r in enumerate(items):
            r["split"] = "test" if i < round(n * 0.15) else "val" if i < round(n * 0.30) else "train"

    with open(OUT / "attribution.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "split", "group", "query", "title", "author", "license", "source"])
        w.writeheader()
        w.writerows(rows)
    print({s: sum(r["split"] == s for r in rows) for s in ("train", "val", "test")}, "total", len(rows))


if __name__ == "__main__":
    main()
