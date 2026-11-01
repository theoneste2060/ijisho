# Ijisho roadmap

Updated 1 November 2026. Live app: https://ijisho-amber.vercel.app · Code: https://github.com/theoneste2060/ijisho

**Focus: model quality and local (Rwandan) data.** Ijisho stays a fully offline app with no server or database.

## Where things stand

- **App:** offline bean leaf check (angular leaf spot, bean rust, healthy, "not a bean leaf"), English + draft Kinyarwanda, install card, works offline. "Ask an agronomist" opens the phone's share menu with the photo and result; nothing is uploaded.
- **Model:** v3 (commit 566fc9a). Bean test 94.5% in the browser, 0/128 bean leaves rejected, 88/88 non-bean photos caught; zoomed-out / whole-leaf photos 87.5% right (synthetic test). Training data: Makerere AI Lab beans (Uganda, MIT) + 528 Wikimedia "not a bean leaf" photos.
- **Removed (Nov 1):** agronomist registry, admin page, photo uploads, Cloudflare Worker `ijisho-api` and D1 database `ijisho`. Code remains in git history if ever needed.
- **Open item:** check the real 3-leaf photo that was called "not a bean leaf" against v3.

## 1. Local data (most important)

1. **Collect Rwandan bean photos:** 100–300 to start, then more. Healthy, angular leaf spot, rust, plus other bean problems; close-ups and whole leaves; different districts, varieties, light and phones.
2. **Label them with agronomists:** 1–2 RAB or district agronomists confirm each label. Keep a simple sheet: photo, label, district, date, who labelled.
3. **Consent and licence:** written OK from whoever takes the photos so they can be used to train and, ideally, be shared openly (CC BY) as a Rwandan dataset: a digital public good.
4. **Simple local collection tool** (no server): a page that saves labelled photos into a folder on the phone/laptop, or a shared Google Drive folder structure per label.

## 2. Model quality

5. **Real-world test set first:** keep 20–30% of the Rwandan photos aside and never train on them. Report accuracy on them in the README (the honest number).
6. **Retrain on Uganda + Rwanda data**, compare with v3 on the Rwandan test set.
7. **More bean problems:** common bacterial blight, anthracnose, bean common mosaic virus, pest damage.
8. **Better "not a bean leaf":** add Rwandan photos of other crops and weeds that grow next to beans.
9. **Calibration:** check the 70% "not sure" threshold on Rwandan photos; tune so confident answers are right ≥ 95% of the time.
10. **Error review:** look at every wrong answer with an agronomist; add similar photos.
11. **Model size/speed:** try a smaller or quantisation-friendly model for cheap phones (current 6.1 MB, 8-bit failed).
12. **More crops later:** potato (late blight; links to the SPF seed-potato client), cassava, maize, banana.

## 3. Before farmers rely on it

13. **Kinyarwanda review** of all app text (`app/content.js`).
14. **Agronomist check of the advice text.**
15. **Small field trial:** a few farmers with an agronomist alongside, comparing Ijisho with the agronomist's diagnosis.

## Later (only if needed)

- WhatsApp bot (`~/projects/theoneste-whatsapp-bot`, waiting for the Meta hold), Kinyarwanda voice, Android app, own domain, partnerships and funding (World Bank, GIZ, FAO, RAB, Digital Public Goods Alliance).

## Suggested next three

1. Start collecting and labelling Rwandan bean photos (1–3).
2. Build the Rwandan held-out test set and measure v3 on it (5).
3. Kinyarwanda review (13).
