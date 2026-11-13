"""Clasificador de letras a partir de los 21 puntos de la mano.

Compara modelos (como el Test and Score de Orange) con dos pruebas:
  - validacion cruzada estratificada de 10 particiones
  - fondo nuevo: entrenar con un fondo (library/wall) y probar con el otro
y exporta el mejor a JSON para el navegador.

Uso: .venv/Scripts/python entrenar_puntos.py <carpeta salida web/public/model>
"""
import json, os, sys, time
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
found = z["found"]
P, labels, bgs = z["pts"][found], z["labels"][found], z["backgrounds"][found]
classes = sorted(set(z["labels"]))
y = np.array([classes.index(l) for l in labels])
TIPS = [4, 8, 12, 16, 20]
PAIRS = [(a, b) for i, a in enumerate(TIPS) for b in TIPS[i + 1:]]


def features(P):
    """P: [N,21,3] -> [N,F]. Igual que featuresDe() en el navegador."""
    p = P - P[:, :1]
    scale = np.linalg.norm(p[:, [5, 9, 13, 17], :2], axis=2).mean(1)[:, None, None]
    p = p / np.maximum(scale, 1e-6)
    d = np.stack([np.linalg.norm(p[:, a] - p[:, b], axis=1) for a, b in PAIRS], 1)
    return np.concatenate([p[:, 1:].reshape(len(p), -1), d], 1).astype(np.float32)


def augment(P, rng, k):
    out = [P]
    for _ in range(k):
        a = np.deg2rad(rng.uniform(-15, 15, len(P)))
        c, s = np.cos(a), np.sin(a)
        R = np.zeros((len(P), 3, 3)); R[:, 0, 0] = c; R[:, 0, 1] = -s; R[:, 1, 0] = s; R[:, 1, 1] = c; R[:, 2, 2] = 1
        Q = np.einsum("nij,nkj->nki", R, P - P[:, :1]) * rng.uniform(0.9, 1.1, (len(P), 1, 3))
        Q += rng.normal(0, 0.015, Q.shape) * np.linalg.norm(Q[:, 9, :2], axis=1)[:, None, None]
        out.append(Q)
    return np.concatenate(out)


def mirror(P):
    Q = P.copy(); Q[..., 0] *= -1
    return Q


MODELS = {
    "Logistic Regression": lambda: LogisticRegression(C=1.0, max_iter=5000),
    "SVM": lambda: SVC(C=10, gamma="scale"),
    "Neural Network": lambda: MLPClassifier((128, 64), alpha=1e-3, max_iter=1500, random_state=0),
    "kNN": lambda: KNeighborsClassifier(5),
}
K_AUG = 4


def fit(name, idx, rng):
    Pa = augment(P[idx], rng, K_AUG)
    Pa = np.concatenate([Pa, mirror(Pa)])
    ya = np.tile(y[idx], (K_AUG + 1) * 2)
    X = features(Pa)
    sc = StandardScaler().fit(X)
    return sc, MODELS[name]().fit(sc.transform(X), ya)


def score(model, idx, flip=False):
    sc, clf = model
    Q = mirror(P[idx]) if flip else P[idx]
    return float((clf.predict(sc.transform(features(Q))) == y[idx]).mean())


print(f"{len(y)} imagenes con mano detectada ({found.mean():.1%} del total)\n")
print(f"{'modelo':20} {'CV10':>6} {'fondo nuevo':>12} {'mano izq.':>10}")
res = {}
for name in MODELS:
    t = time.time(); rng = np.random.default_rng(0)
    skf = StratifiedKFold(10, shuffle=True, random_state=0)
    cv = np.mean([score(fit(name, tr, rng), te) for tr, te in skf.split(P, y)])
    bg, fl = [], []
    for b in ("library", "wall"):
        m = fit(name, np.where(bgs == b)[0], rng)
        te = np.where(bgs != b)[0]
        bg.append(score(m, te)); fl.append(score(m, te, flip=True))
    res[name] = (cv, np.mean(bg), np.mean(fl))
    print(f"{name:20} {cv:6.3f} {np.mean(bg):12.3f} {np.mean(fl):10.3f}   [{time.time() - t:.0f}s]")

# para la web: LR o red neuronal (las dos son faciles de ejecutar en JS)
best = max(["Logistic Regression", "Neural Network"], key=lambda n: res[n][1])
print("\nexportando:", best)
sc, clf = fit(best, np.arange(len(y)), np.random.default_rng(1))
if best == "Logistic Regression":
    layers = [{"W": clf.coef_.T.tolist(), "b": clf.intercept_.tolist(), "act": "softmax"}]
else:
    layers = [{"W": W.tolist(), "b": b.tolist(), "act": "relu"} for W, b in zip(clf.coefs_, clf.intercepts_)]
    layers[-1]["act"] = "softmax"
# redondear para que el JSON pese poco
for L in layers:
    L["W"] = np.round(np.array(L["W"]), 5).tolist(); L["b"] = np.round(np.array(L["b"]), 5).tolist()

# prueba de que el calculo "a mano" (como en JS) coincide con sklearn
def forward(X):
    h = (X - sc.mean_) / sc.scale_
    for L in layers:
        h = h @ np.array(L["W"]) + np.array(L["b"])
        if L["act"] == "relu": h = np.maximum(h, 0)
    e = np.exp(h - h.max(1, keepdims=True)); return e / e.sum(1, keepdims=True)
X = features(P)
same = (forward(X).argmax(1) == clf.predict(sc.transform(X))).mean()
print(f"coincidencia JSON vs sklearn: {same:.4f}")

cv, bg, fl = res[best]
meta = {
    "classes": classes, "model": best,
    "mean": np.round(sc.mean_, 6).tolist(), "scale": np.round(sc.scale_, 6).tolist(),
    "layers": layers, "pairs": PAIRS,
    "metrics": {"cv10": round(cv, 4), "newBackground": round(bg, 4), "leftHand": round(fl, 4),
                "detected": round(float(found.mean()), 4)},
    "all": {k: [round(v, 4) for v in r] for k, r in res.items()},
    "trained": time.strftime("%Y-%m-%d"),
}
os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, "puntos.json")
json.dump(meta, open(path, "w"), separators=(",", ":"))
print("guardado", path, f"{os.path.getsize(path) / 1e3:.0f} KB")
