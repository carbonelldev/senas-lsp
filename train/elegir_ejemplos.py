"""Elige 2 fotos claras por letra (una de cada fondo): las que el modelo de
puntos reconoce con mas seguridad. Las copia a web/public/ejemplos/.

Uso: .venv/Scripts/python elegir_ejemplos.py <carpeta data> <puntos.json> <web/public/ejemplos>
"""
import csv, json, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from caracteristicas import probabilidades  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA, MODEL, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
meta = json.load(open(MODEL))
rows = list(csv.reader(open(os.path.join(DATA, "labels.csv"), newline="")))[3:]
z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
found = z["found"]
probs = probabilidades(meta, z["pts"])
os.makedirs(OUT, exist_ok=True)
for c, letter in enumerate(meta["classes"]):
    for k, bg in enumerate(("wall", "library"), 1):
        idx = [i for i, r in enumerate(rows) if r[2] == letter and r[3] == bg and found[i]]
        best = max(idx, key=lambda i: probs[i, c])
        shutil.copy2(os.path.join(DATA, rows[best][0]), os.path.join(OUT, f"{letter}_{k}.jpg"))
        print(letter, bg, rows[best][0], f"{probs[best, c]:.2f}")
