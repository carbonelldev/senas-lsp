"""Imagenes de la pagina /proceso: la misma letra en los dos fondos, sin y con los 21 puntos.

Uso: python figuras_proceso.py ../orange/data ../web/public/proceso [letra]
"""
import csv
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from mediapipe import Image as MPImage, ImageFormat
from mediapipe.tasks.python import vision, BaseOptions

HERE = os.path.dirname(os.path.abspath(__file__))
DATA, OUT = sys.argv[1], sys.argv[2]
LETRA = sys.argv[3] if len(sys.argv) > 3 else "Y"
LADO = 480  # tamano de salida

CONEXIONES = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7), (7, 8), (5, 9), (9, 10), (10, 11),
              (11, 12), (9, 13), (13, 14), (14, 15), (15, 16), (13, 17), (0, 17), (17, 18), (18, 19), (19, 20)]
PUNTAS = {4, 8, 12, 16, 20}

detector = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=os.path.join(HERE, "base", "hand_landmarker.task")),
    num_hands=1, min_hand_detection_confidence=0.1, min_hand_presence_confidence=0.1,
))


def detectar(im):
    """Las fotos estan muy recortadas: se amplian y se les pone un borde para que MediaPipe encuentre la mano.
    Devuelve los 21 puntos en pixeles de una imagen de LADO x LADO."""
    fill = tuple(np.asarray(im).reshape(-1, 3).mean(0).astype(int))
    for borde in (64, 0, 128, 32):
        up = im.resize((256, 256), Image.BICUBIC)
        var = ImageOps.expand(up, border=borde, fill=fill) if borde else up
        res = detector.detect(MPImage(image_format=ImageFormat.SRGB, data=np.asarray(var)))
        if res.hand_landmarks:
            tam = 256 + 2 * borde
            return [((p.x * tam - borde) * LADO / 256, (p.y * tam - borde) * LADO / 256) for p in res.hand_landmarks[0]]
    return None


def dibujar(im, pts):
    im = im.copy()
    d = ImageDraw.Draw(im)
    for a, b in CONEXIONES:
        d.line([pts[a], pts[b]], fill=(255, 255, 255), width=5)
    for i, (x, y) in enumerate(pts):
        r = 9 if i in PUNTAS else 6
        relleno = (139, 124, 255) if i in PUNTAS else (10, 10, 10)
        borde = (139, 124, 255) if i in PUNTAS else (255, 255, 255)
        d.ellipse([x - r, y - r, x + r, y + r], fill=relleno, outline=borde, width=3)
    return im


def nitidez(im):
    g = np.asarray(im.convert("L"), dtype=float)
    return np.var(np.diff(g, axis=0)) + np.var(np.diff(g, axis=1))


rows = list(csv.reader(open(os.path.join(DATA, "labels.csv"), newline="")))[3:]
os.makedirs(OUT, exist_ok=True)
for fondo in ("library", "wall"):
    # de las fotos de esa letra y ese fondo, la mas nitida en la que se detecta la mano
    fotos = [Image.open(os.path.join(DATA, r[0])).convert("RGB") for r in rows if r[2] == LETRA and r[3] == fondo]
    rutas = [r[0] for r in rows if r[2] == LETRA and r[3] == fondo]
    for k in sorted(range(len(fotos)), key=lambda k: -nitidez(fotos[k])):
        ruta, im = rutas[k], fotos[k]
        pts = detectar(im)
        if pts is None:
            continue
        grande = im.resize((LADO, LADO), Image.LANCZOS)
        grande.save(os.path.join(OUT, f"foto_{fondo}.jpg"), quality=88)
        dibujar(grande, pts).save(os.path.join(OUT, f"puntos_{fondo}.jpg"), quality=88)
        print(fondo, ruta)
        break
