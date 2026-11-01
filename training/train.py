"""Train Ijisho's bean leaf disease classifier on CPU.

Data: Makerere AI Lab "beans" dataset (MIT), field photos from Ugandan farms taken on basic smartphones and
labelled by NaCRRI experts. Model: MobileNetV3-Small (ImageNet weights) fine-tuned for 3 classes.

The validation split is used only to pick the best epoch; the test split is scored once at the end.

    .venv/bin/python training/train.py
"""
import io
import json
import random
import time
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "models"
# Order of the dataset's integer labels (see the dataset card).
CLASSES = ["angular_leaf_spot", "bean_rust", "healthy"]
SIZE = 224
MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

torch.manual_seed(7)
random.seed(7)
np.random.seed(7)
torch.set_num_threads(4)


def load_split(name):
    table = pq.read_table(DATA / f"{name}.parquet").to_pydict()
    images = [row["bytes"] for row in table["image"]]
    labels = table["labels"]
    return images, labels


class Beans(Dataset):
    def __init__(self, split, tf):
        self.images, self.labels = load_split(split)
        self.tf = tf

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, i):
        img = Image.open(io.BytesIO(self.images[i])).convert("RGB")
        return self.tf(img), self.labels[i]


# Field photos vary in light, angle and distance, so training augments for that.
train_tf = transforms.Compose([
    transforms.RandomResizedCrop(SIZE, scale=(0.55, 1.0)),
    transforms.RandomHorizontalFlip(),
    transforms.RandomVerticalFlip(),
    transforms.RandomRotation(20),
    transforms.ColorJitter(0.3, 0.3, 0.3, 0.03),
    transforms.ToTensor(),
    transforms.Normalize(MEAN, STD),
])
# The app does exactly this: resize the short side to 256, centre-crop 224.
eval_tf = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(SIZE),
    transforms.ToTensor(),
    transforms.Normalize(MEAN, STD),
])


def build_model():
    m = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.IMAGENET1K_V1)
    m.classifier[3] = nn.Linear(m.classifier[3].in_features, len(CLASSES))
    return m


@torch.no_grad()
def evaluate(model, loader):
    model.eval()
    preds, gold = [], []
    for x, y in loader:
        preds += model(x).argmax(1).tolist()
        gold += y.tolist()
    preds, gold = np.array(preds), np.array(gold)
    cm = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
    for g, p in zip(gold, preds):
        cm[g, p] += 1
    return float((preds == gold).mean()), cm


def per_class(cm):
    out = {}
    for i, c in enumerate(CLASSES):
        tp = cm[i, i]
        prec = tp / cm[:, i].sum() if cm[:, i].sum() else 0.0
        rec = tp / cm[i, :].sum() if cm[i, :].sum() else 0.0
        out[c] = {"precision": round(float(prec), 3), "recall": round(float(rec), 3), "support": int(cm[i, :].sum())}
    return out


def run_epochs(model, params, loaders, epochs, lr, log, best):
    opt = torch.optim.AdamW(params, lr=lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)
    for ep in range(epochs):
        model.train()
        t0, total, n = time.time(), 0.0, 0
        for x, y in loaders["train"]:
            opt.zero_grad()
            loss = loss_fn(model(x), y)
            loss.backward()
            opt.step()
            total += loss.item() * len(y)
            n += len(y)
        sched.step()
        val_acc, _ = evaluate(model, loaders["val"])
        line = f"{log} epoch {ep + 1}/{epochs} loss {total / n:.3f} val_acc {val_acc:.3f} ({time.time() - t0:.0f}s)"
        print(line, flush=True)
        if val_acc > best["acc"]:
            best.update(acc=val_acc, state={k: v.clone() for k, v in model.state_dict().items()}, where=line)
    return best


def main():
    OUT.mkdir(exist_ok=True)
    loaders = {
        "train": DataLoader(Beans("train", train_tf), batch_size=32, shuffle=True, num_workers=2),
        "val": DataLoader(Beans("validation", eval_tf), batch_size=64, num_workers=2),
        "test": DataLoader(Beans("test", eval_tf), batch_size=64, num_workers=2),
    }
    print({k: len(v.dataset) for k, v in loaders.items()}, flush=True)

    model = build_model()
    best = {"acc": -1.0}

    # Stage 1: train only the new classifier head.
    for p in model.features.parameters():
        p.requires_grad = False
    best = run_epochs(model, [p for p in model.parameters() if p.requires_grad], loaders, 3, 1e-3, "head", best)

    # Stage 2: fine-tune the whole network gently.
    for p in model.parameters():
        p.requires_grad = True
    best = run_epochs(model, model.parameters(), loaders, 10, 3e-4, "full", best)

    model.load_state_dict(best["state"])
    torch.save(model.state_dict(), OUT / "ijisho_beans_mnv3s.pt")
    val_acc, _ = evaluate(model, loaders["val"])
    test_acc, cm = evaluate(model, loaders["test"])
    metrics = {
        "model": "MobileNetV3-Small, ImageNet init, fine-tuned",
        "classes": CLASSES,
        "input": {"size": SIZE, "resize_short_side": 256, "mean": MEAN, "std": STD},
        "selected": best["where"],
        "validation_accuracy": round(val_acc, 4),
        "test_accuracy": round(test_acc, 4),
        "test_confusion_matrix": cm.tolist(),
        "test_per_class": per_class(cm),
    }
    (OUT / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
