# Ijisho

**Ijisho** ("eye" in Kinyarwanda) checks a bean leaf for disease from a phone photo, **fully offline**.
A farmer or extension officer takes a photo of one leaf; Ijisho says whether it looks like
**angular leaf spot**, **bean rust**, or **healthy**, and what to do next, in **English or Kinyarwanda**.
If the photo isn't a bean leaf (a laptop, a bottle, a maize leaf…), it says so.
When it isn't confident, it says so and points to a human agronomist instead of guessing.

**Try it: [ijisho-amber.vercel.app](https://ijisho-amber.vercel.app)** · open it once on a phone, then it works with no connection. On Android, use *Add to Home screen* to install it like an app.

<p>
  <img src="docs/screen-home.png" alt="Ijisho home screen with Take a photo and Choose a photo buttons" width="260">
  &nbsp;
  <img src="docs/screen-result.png" alt="Ijisho result: bean rust, 98% confidence, with five steps to take" width="260">
</p>

<sub>Leaf photo from the Makerere AI Lab beans test set (MIT).</sub>

It is a *small AI* project in the World Bank's sense: a small model trained on local, relevant data, running
on the phone farmers already have, with no internet, no server and no cost per use.

## Why

Rwanda's ICT ministry has set four priorities for AI in agriculture: farmer advisory, crop and livestock
intelligence, markets and finance, and government intelligence. It has also asked builders for solutions that
"adapt to the farmer", working on basic phones, by voice and **offline**, and released as digital public goods
others can build on. Farm extension coverage is meant to grow from 35% (2023) to 69% (2029); tools like this
help each extension officer reach more farmers.

Ijisho covers one piece of *crop intelligence*: spotting two common bean diseases early. Beans are a staple
food and a key protein source across East Africa.

## How it works

| Part | What it is |
|---|---|
| Model | MobileNetV3-Small, ImageNet weights, fine-tuned for 4 classes: 3 bean classes + "not a bean leaf" |
| Data | [Makerere AI Lab "beans" dataset](https://huggingface.co/datasets/AI-Lab-Makerere/beans): 1,295 field photos from Ugandan farms, taken on basic smartphones, labelled by NaCRRI experts (MIT licence). Plus 528 freely licensed Wikimedia Commons photos of everyday objects and other crops for "not a bean leaf" (`training/collect_negatives.py`, credits in `NEGATIVES_CREDITS.csv`) |
| Runtime | [ONNX Runtime Web](https://onnxruntime.ai/) (WebAssembly) in the browser; the photo never leaves the phone |
| App | A static Progressive Web App; a service worker caches everything on first visit, then it works offline |
| Uncertainty | Below 70% confidence, Ijisho answers "not sure" and gives retake tips plus a pointer to an agronomist |
| Ask an agronomist | Under every result: opens the phone's share menu with a small copy of the photo (long side 1,280 px) and a pre-written message, so the farmer sends it to their own extension officer or farmer promoter on WhatsApp or SMS. The farmer can save that person's WhatsApp number once (stored only on the phone) for a one-tap chat. No server: the photo only goes where the farmer sends it. A pilot partner number can be set in `app/content.js` (`PARTNER`) |

## Results

Measured on held-out **test photos** never used for training or for choosing the model: the dataset's 128 bean
test photos plus 88 "not a bean leaf" photos (15% of each Wikimedia search, set aside before training).
The validation split picked the best epoch.

| | 3-class model (v1) | 4-class model (current) |
|---|---|---|
| Bean disease accuracy, same 128 photos | 92.2% (browser 90.6%) | **93.8%** (browser 93.8%) |
| Real bean leaves wrongly called "not a bean leaf" | n/a | **0 / 128** |
| Non-bean test photos caught | none (no such answer) | **88 / 88** |
| Other photos from different sources (people, screenshots, graphics) | n/a | 7 / 7 caught |
| Model size | 6.1 MB | 6.1 MB (8-bit version rejected again: accuracy collapsed) |

Test confusion matrix, current model (rows = true class, columns = predicted):

| | angular leaf spot | bean rust | healthy | not a bean leaf |
|---|---|---|---|---|
| **angular leaf spot** | 40 | 3 | 0 | 0 |
| **bean rust** | 4 | 39 | 0 | 0 |
| **healthy** | 0 | 1 | 41 | 0 |
| **not a bean leaf** | 0 | 0 | 0 | 88 |

The "not a bean leaf" test photos come from the same Wikimedia searches as the training ones, so 88/88 is
optimistic: expect some real-world photos to slip through. Below 70% confidence the app still answers
"not sure". Speed: about 35 ms per photo on a laptop CPU; first download about 21 MB, then offline.
Training: about 15 minutes on a 4-core laptop CPU (no GPU).

## Run it

```bash
# 1. Train (CPU is fine)
python3 -m venv .venv
.venv/bin/pip install -r training/requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
# download the three parquet files from huggingface.co/datasets/AI-Lab-Makerere/beans (data/ folder) into ./data
.venv/bin/python training/collect_negatives.py   # "not a bean leaf" photos from Wikimedia Commons
.venv/bin/python training/train.py
.venv/bin/python training/export.py   # writes app/model/ijisho-beans.onnx

# 2. Serve the app (any static host works; the live copy runs on Vercel, see vercel.json)
cd app && python3 -m http.server 8000
```

Open http://localhost:8000 on a phone or desktop. After the first load it works with no connection.

## Limitations (read before field use)

- **It only knows two bean diseases.** Photos that aren't bean leaves are usually caught as "not a bean leaf",
  but another bean disease (e.g. common bacterial blight, anthracnose, bean common mosaic virus) or pest damage
  on a bean leaf will still be forced into one of the known answers, sometimes with low confidence ("not sure").
- **The data is from Uganda.** Varieties, light and backgrounds in Rwanda may differ. Before recommending it to
  farmers, it should be tested on photos from Rwandan fields and checked with RAB agronomists.
- **The Kinyarwanda text is a first draft** and needs review by a native speaker and an agronomist.
- **The advice is general and preventive.** It never names a pesticide or dose; that is for an agronomist.
- **It is a screening aid, not a diagnosis.** It does not replace an extension officer.

## Roadmap

- Rwandan field photos and validation with agronomists
- More bean diseases, then cassava and potato
- Voice output in Kinyarwanda for low-literacy users
- Android packaging for phones that can't install web apps

## Credits and licences

- Code: MIT © 2026 Theoneste NZAKIZWANIMANA ([theoneste.dev](https://theoneste-dev.vercel.app))
- Data: Makerere AI Lab with the National Crops Resources Research Institute (NaCRRI), Uganda, MIT
- "Not a bean leaf" photos: Wikimedia Commons contributors, CC0 / public domain / CC BY / CC BY-SA; every photo
  is credited in `NEGATIVES_CREDITS.csv` (the photos themselves are not in this repo)
- Base model weights: torchvision MobileNetV3-Small (BSD-3-Clause)
- Runtime: ONNX Runtime Web © Microsoft, MIT (see `app/vendor/LICENSE`)
