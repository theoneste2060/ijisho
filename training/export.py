"""Export the trained model to ONNX for the browser, make an 8-bit version, and check both on the test set.

    .venv/bin/python training/export.py

Writes app/model/ijisho-beans.onnx (the file the app loads) and models/export.json with the numbers.
The 8-bit model is only used if it scores within 1 point of the full-precision one on the test split.
"""
import io
import json
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
from onnxruntime.quantization.shape_inference import quant_pre_process
from PIL import Image

from train import CLASSES, build_model, eval_tf, load_split

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
APP_MODEL = ROOT / "app" / "model"
FP32 = MODELS / "ijisho-beans-fp32.onnx"
PRE = MODELS / "ijisho-beans-pre.onnx"
INT8 = MODELS / "ijisho-beans-int8.onnx"


def tensors(split, limit=None):
    images, labels = load_split(split)
    if limit:
        images, labels = images[:limit], labels[:limit]
    for b, y in zip(images, labels):
        x = eval_tf(Image.open(io.BytesIO(b)).convert("RGB")).unsqueeze(0).numpy()
        yield x, y


def accuracy(path):
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    hits = total = 0
    for x, y in tensors("test"):
        hits += int(sess.run(None, {"image": x})[0].argmax() == y)
        total += 1
    return hits / total


class Calib(CalibrationDataReader):
    """Feeds 120 training photos (never test photos) to pick the 8-bit ranges."""

    def __init__(self):
        self.it = ({"image": x} for x, _ in tensors("train", limit=120))

    def get_next(self):
        return next(self.it, None)


def main():
    model = build_model()
    model.load_state_dict(torch.load(MODELS / "ijisho_beans_mnv3s.pt", map_location="cpu"))
    model.eval()
    torch.onnx.export(
        model, torch.zeros(1, 3, 224, 224), str(FP32),
        input_names=["image"], output_names=["logits"], opset_version=17, dynamo=False,
    )

    quant_pre_process(str(FP32), str(PRE))
    quantize_static(
        str(PRE), str(INT8), Calib(),
        quant_format=QuantFormat.QDQ, activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8, per_channel=True,
    )

    fp32_acc, int8_acc = accuracy(FP32), accuracy(INT8)
    use_int8 = int8_acc >= fp32_acc - 0.01
    chosen = INT8 if use_int8 else FP32
    APP_MODEL.mkdir(parents=True, exist_ok=True)
    shutil.copy(chosen, APP_MODEL / "ijisho-beans.onnx")

    info = {
        "fp32": {"test_accuracy": round(fp32_acc, 4), "size_mb": round(FP32.stat().st_size / 1e6, 2)},
        "int8": {"test_accuracy": round(int8_acc, 4), "size_mb": round(INT8.stat().st_size / 1e6, 2)},
        "shipped": "int8" if use_int8 else "fp32",
        "classes": CLASSES,
    }
    (MODELS / "export.json").write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))


if __name__ == "__main__":
    main()
