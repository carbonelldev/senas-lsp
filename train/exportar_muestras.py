"""Una mano "ideal" por letra (la foto que el modelo reconoce con mas seguridad),
con los 21 puntos ya normalizados (muneca en 0,0; palma = 1). La web la usa para
dibujar y transformar esqueletos entre letras.

Uso: .venv/Scripts/python exportar_muestras.py <puntos.json> <web/public/model/muestras.json>
"""
import json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from caracteristicas import probabilidades  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL, OUT = sys.argv[1], sys.argv[2]
meta = json.load(open(MODEL))
z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
P, found, labels = z["pts"], z["found"], z["labels"]
probs = probabilidades(meta, P)
out = {}
for c, letter in enumerate(meta["classes"]):
    idx = np.where((labels == letter) & found)[0]
    best = idx[np.argmax(probs[idx, c])]
    p = P[best] - P[best][:1]
    p = p / np.linalg.norm(p[[5, 9, 13, 17], :2], axis=1).mean()
    out[letter] = np.round(p[:, :2].astype(float), 3).tolist()
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print(len(out), "letras ->", OUT, os.path.getsize(OUT), "bytes")
