"""Check how Ijisho handles zoomed-out photos (a whole trifoliate leaf, several leaves) and compare
single-view inference with "zoom in and look again" inference.

Synthetic test sets are built only from held-out test photos:
  zoomed_out  bean test photos shrunk to 40-55% and placed on held-out soil/field photos
  three_up    three bean test photos (same label) side by side, like three leaflets
They are stand-ins for real field photos of whole leaves, which the dataset lacks.

    .venv/bin/python training/eval_views.py
"""
import csv
import io
import json
import random
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pyarrow.parquet as pq
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MODEL = ROOT / "app" / "model" / "ijisho-beans.onnx"
NEG = ROOT / "data" / "negatives"
CLASSES = ["angular_leaf_spot", "bean_rust", "healthy", "not_bean"]
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
CONFIDENT = 0.7
BACKGROUND_QUERIES = ["soil field Africa", "lawn grass", "weeds field"]
rng = random.Random(3)
sess = ort.InferenceSession(str(MODEL), providers=["CPUExecutionProvider"])


def tensor(img):
    w, h = img.size
    s = 256 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BILINEAR)
    w, h = img.size
    l, t = (w - 224) // 2, (h - 224) // 2
    a = (np.asarray(img.crop((l, t, l + 224, t + 224)), dtype=np.float32) / 255 - MEAN) / STD
    return a.transpose(2, 0, 1)[None]


def probs(img):
    z = sess.run(None, {"image": tensor(img)})[0][0]
    e = np.exp(z - z.max())
    return e / e.sum()


def views(img):
    """Zoomed-in views, same as the app: centre 70% and four overlapping corners at 60% of the short side."""
    w, h = img.size
    out = []
    for frac, spots in ((0.7, [(0.5, 0.5)]), (0.6, [(0, 0), (1, 0), (0, 1), (1, 1)])):
        s = frac * min(w, h)
        for fx, fy in spots:
            x = (w - s) * fx
            y = (h - s) * fy
            out.append(img.crop((round(x), round(y), round(x + s), round(y + s))))
    return out


def predict_single(img):
    p = probs(img)
    return int(p.argmax()), float(p.max())


def predict_multi(img):
    """What the app does: look at the whole photo; only if it says 'not a bean leaf' (or isn't sure),
    zoom into five parts. If a part clearly shows a bean leaf, answer from the clearest part."""
    p = probs(img)
    if p.argmax() != 3:
        return int(p.argmax()), float(p.max())
    best = None
    for v in views(img):
        q = probs(v)
        c = int(q.argmax())
        if c != 3 and q[c] >= CONFIDENT and q[3] < 0.15 and (best is None or q[c] > best[1]):
            best = (c, float(q[c]))
    return best or (int(p.argmax()), float(p.max()))


def bean_test():
    t = pq.read_table(ROOT / "data" / "test.parquet").to_pydict()
    return [(Image.open(io.BytesIO(r["bytes"])).convert("RGB"), l) for r, l in zip(t["image"], t["labels"])]


def negatives(split="test", group=None, query=None):
    with open(NEG / "attribution.csv") as f:
        rows = [r for r in csv.DictReader(f) if r["split"] == split and (not group or r["group"] == group) and (not query or r["query"] == query)]
    return [(Image.open(NEG / r["file"]).convert("RGB"), 3) for r in rows]


def zoomed_out(beans, backgrounds):
    out = []
    for img, label in beans:
        bg = rng.choice(backgrounds)[0].resize((800, 800))
        f = rng.uniform(0.40, 0.55)
        leaf = img.resize((round(800 * f), round(800 * f)))
        bg.paste(leaf, (rng.randint(0, 800 - leaf.width), rng.randint(0, 800 - leaf.height)))
        out.append((bg, label))
    return out


def three_up(beans):
    by = {}
    for img, l in beans:
        by.setdefault(l, []).append(img)
    out = []
    for l, imgs in by.items():
        for i in range(0, len(imgs) - 2, 3):
            canvas = Image.new("RGB", (900, 300))
            for k in range(3):
                canvas.paste(imgs[i + k].resize((300, 300)), (300 * k, 0))
            out.append((canvas, l))
    return out


def score(name, items, fn):
    right = rej = conf_wrong = unsure = 0
    for img, label in items:
        c, p = fn(img)
        right += c == label
        rej += label != 3 and c == 3
        if p < CONFIDENT:
            unsure += 1
        elif c != label:
            conf_wrong += 1
    n = len(items)
    return {"set": name, "n": n, "correct": round(right / n, 3), "bean_called_not_bean": rej, "confidently_wrong": conf_wrong, "unsure": unsure}


def main():
    beans = bean_test()
    # Backgrounds the model never trained on (validation and test splits only).
    soil = [x for q in BACKGROUND_QUERIES for sp in ("val", "test") for x in negatives(sp, query=q)]
    sets = {
        "bean_test": beans,
        "zoomed_out": zoomed_out(beans, soil),
        "three_up": three_up(beans),
        "not_bean_test": negatives("test"),
    }
    report = []
    for name, items in sets.items():
        for mode, fn in (("single", predict_single), ("zoom-in", predict_multi)):
            r = score(name, items, fn)
            r["mode"] = mode
            report.append(r)
            print(json.dumps(r), flush=True)
    (ROOT / "models" / "eval_views.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
