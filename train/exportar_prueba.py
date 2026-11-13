"""Genera casos de prueba (puntos crudos + probabilidades esperadas) para comprobar
que web/src/lib/clasificador.ts calcula lo mismo que Python (`npm test` en web/).
Incluye manos giradas para cubrir los angulos de flexion en posiciones raras.

Uso: .venv/Scripts/python exportar_prueba.py <puntos.json> <web/scripts/casos_prueba.json>
"""
import json, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from caracteristicas import features, girar  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(sys.argv[1]))
z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
P = z["pts"][z["found"]][::35]
P = np.concatenate([P, girar(P[:20], np.random.default_rng(7), roll=40, yaw=50, pitch=40) + P[:20, :1]])
h = (features(P) - np.array(meta["mean"])) / np.array(meta["scale"])
for L in meta["layers"]:
    h = h @ np.array(L["W"]) + np.array(L["b"])
    if L["act"] == "relu":
        h = np.maximum(h, 0)
e = np.exp(h - h.max(1, keepdims=True))
probs = e / e.sum(1, keepdims=True)
json.dump({"pts": np.round(P, 4).tolist(), "probs": probs.tolist()}, open(sys.argv[2], "w"))
print(len(P), "casos")
