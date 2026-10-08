# -*- coding: utf-8 -*-
import fitz
import json
import os
import re

path = r"C:\Users\golal\Desktop\Розмінування\ВИБУХОНЕБЕЗПЕЧНІ_3UA.pdf"
doc = fitz.open(path)
out_dir = r"C:\Users\golal\mine guide\_pdf_extract\fuzes"
os.makedirs(out_dir, exist_ok=True)


def clean_name(lines):
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s in ("Підривники", "ПІДРИВНИКИ"):
            continue
        if s.isdigit():
            continue
        if s.startswith("©") or s.startswith("Субкатегорія") or s.startswith("Ліворуч"):
            continue
        if s.startswith("Женев") or s.startswith("Maison") or s.startswith("PO Box"):
            continue
        if "підривник" in s.lower() and len(s) > 45:
            continue
        if s.startswith("БАГАТОРЕЖИМНИЙ"):
            return "M782"
        return s
    return None


cards = []
for i in range(245, 277):  # pages 246-277
    page = doc[i]
    t = page.get_text()
    lines = t.splitlines()
    name = clean_name(lines)
    with open(os.path.join(out_dir, f"p{i+1}.txt"), "w", encoding="utf-8") as f:
        f.write(t)

    img_files = []
    for j, img in enumerate(page.get_images(full=True)):
        xref = img[0]
        try:
            pix = fitz.Pixmap(doc, xref)
            if pix.n >= 5:
                pix = fitz.Pixmap(fitz.csRGB, pix)
            if pix.width < 80 or pix.height < 80:
                continue
            fname = f"fuze_p{i+1}_{j}.png"
            fpath = os.path.join(out_dir, fname)
            pix.save(fpath)
            img_files.append({"file": fname, "w": pix.width, "h": pix.height})
        except Exception as e:
            print("img err", i + 1, j, e)

    cards.append({"page": i + 1, "name": name, "images": img_files})
    dims = [(x["w"], x["h"]) for x in img_files]
    print(f"P{i+1}: {name} | imgs={len(img_files)} | {dims}")

with open(os.path.join(out_dir, "cards_meta.json"), "w", encoding="utf-8") as f:
    json.dump(cards, f, ensure_ascii=False, indent=2)
print("TOTAL", len(cards))
