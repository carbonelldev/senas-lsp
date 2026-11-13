"""Detecta los 21 puntos de la mano (MediaPipe Hand Landmarker) en cada imagen
del dataset y los guarda en cache/puntos.npz.

Las fotos son recortes de 100x100 muy pegados a la mano, asi que se prueban
varias versiones (ampliada, con margen) hasta que el detector encuentra la mano.
"""
import csv, os, sys
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import vision, BaseOptions
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = sys.argv[1]
OUT = os.path.join(HERE, "cache", "puntos.npz")

rows = list(csv.reader(open(os.path.join(DATA, "labels.csv"), newline="")))[3:]
opts = vision.HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(HERE, "base", "hand_landmarker.task")),
    num_hands=1, min_hand_detection_confidence=0.1, min_hand_presence_confidence=0.1,
)
detector = vision.HandLandmarker.create_from_options(opts)


def variants(im):
    fill = tuple(np.asarray(im).reshape(-1, 3).mean(0).astype(int))
    up = im.resize((256, 256), Image.BICUBIC)
    yield ImageOps.expand(up, border=64, fill=fill)
    yield im
    yield ImageOps.expand(up, border=128, fill=fill)
    yield up
    yield ImageOps.expand(up, border=32, fill=fill)
    yield ImageOps.expand(up, border=96, fill=fill)


pts = np.zeros((len(rows), 21, 3), np.float32)
found = np.zeros(len(rows), bool)
for i, r in enumerate(rows):
    im = Image.open(os.path.join(DATA, r[0])).convert("RGB")
    for v in variants(im):
        res = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.asarray(v)))
        if res.hand_landmarks:
            w, h = v.size
            # coordenadas en pixeles para que x e y tengan la misma escala
            pts[i] = [(p.x * w, p.y * h, p.z * w) for p in res.hand_landmarks[0]]
            found[i] = True
            break
    if i % 200 == 0:
        print(f"{i}/{len(rows)}  encontradas {found[:i + 1].mean():.0%}", flush=True)

labels = np.array([r[2] for r in rows])
backgrounds = np.array([r[3] for r in rows])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
np.savez_compressed(OUT, pts=pts, found=found, labels=labels, backgrounds=backgrounds)
print(f"mano encontrada en {found.sum()}/{len(rows)} ({found.mean():.1%})")
for l in sorted(set(labels)):
    m = labels == l
    print(l, f"{found[m].mean():.0%}", end="  ")
print()
