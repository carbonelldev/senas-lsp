"""Genera casos de prueba (puntos crudos + probabilidades esperadas) para
comprobar que web/src/scripts/clasificador.ts calcula lo mismo que Python."""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "entrenar_puntos.py"), encoding="utf-8").read()
ns = {"np": np}
exec(src[src.index("TIPS = "):src.index("def augment")], ns)  # PAIRS y features() tal cual del entrenamiento
meta = json.load(open(sys.argv[1]))
z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
P = z["pts"][z["found"]][::35]
X = ns["features"](P)
h = (X - np.array(meta["mean"])) / np.array(meta["scale"])
for L in meta["layers"]:
    h = h @ np.array(L["W"]) + np.array(L["b"])
    if L["act"] == "relu": h = np.maximum(h, 0)
e = np.exp(h - h.max(1, keepdims=True)); probs = e / e.sum(1, keepdims=True)
json.dump({"pts": P.tolist(), "probs": probs.tolist()}, open(sys.argv[2], "w"))
print(len(P), "casos")
