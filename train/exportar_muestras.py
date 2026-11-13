"""Una mano "ideal" por letra (la foto que el modelo reconoce con mas seguridad),
con los 21 puntos ya normalizados (muneca en 0,0; palma = 1). La web la usa para
dibujar y transformar esqueletos entre letras.  Salida: web/public/model/muestras.json"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
MODEL, OUT = sys.argv[1], sys.argv[2]
src = open(os.path.join(HERE, "entrenar_puntos.py"), encoding="utf-8").read()
ns = {"np": np}; exec(src[src.index("TIPS = "):src.index("def augment")], ns)
meta = json.load(open(MODEL))
z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
P, found, labels = z["pts"], z["found"], z["labels"]
h = (ns["features"](P) - np.array(meta["mean"])) / np.array(meta["scale"])
for L in meta["layers"]:
    h = h @ np.array(L["W"]) + np.array(L["b"])
e = np.exp(h - h.max(1, keepdims=True)); probs = e / e.sum(1, keepdims=True)
out = {}
for c, letter in enumerate(meta["classes"]):
    idx = np.where((labels == letter) & found)[0]
    best = idx[np.argmax(probs[idx, c])]
    p = P[best] - P[best][:1]
    p = p / np.linalg.norm(p[[5, 9, 13, 17], :2], axis=1).mean()
    out[letter] = np.round(p[:, :2].astype(float), 3).tolist()
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print(len(out), "letras ->", OUT, os.path.getsize(OUT), "bytes")
