"""Evaluacion del clasificador de puntos para la memoria del proyecto:
validacion cruzada (10 particiones) con matriz de confusion y acierto por letra,
y la prueba de fondo nuevo (entrenar en un fondo, probar en el otro) por letra.

Uso: .venv/Scripts/python evaluar.py <web/public/model/evaluacion.json>
"""
import json, os, sys, time
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
src = open(os.path.join(HERE, "entrenar_puntos.py"), encoding="utf-8").read()
ns = {"np": np}
exec(src[src.index("TIPS = "):src.index("MODELS = ")], ns)  # features, augment, mirror, PAIRS
features, augment, mirror = ns["features"], ns["augment"], ns["mirror"]

z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
found = z["found"]
P, labels, bgs = z["pts"][found], z["labels"][found], z["backgrounds"][found]
classes = sorted(set(z["labels"]))
y = np.array([classes.index(l) for l in labels])
K_AUG = 4


def fit(idx, rng):
    Pa = augment(P[idx], rng, K_AUG)
    Pa = np.concatenate([Pa, mirror(Pa)])
    ya = np.tile(y[idx], (K_AUG + 1) * 2)
    X = features(Pa)
    sc = StandardScaler().fit(X)
    return sc, LogisticRegression(C=1.0, max_iter=5000).fit(sc.transform(X), ya)


def predict(model, idx):
    sc, clf = model
    return clf.predict(sc.transform(features(P[idx])))


t = time.time()
rng = np.random.default_rng(0)
pred_cv = np.zeros_like(y)
for tr, te in StratifiedKFold(10, shuffle=True, random_state=0).split(P, y):
    pred_cv[te] = predict(fit(tr, rng), te)
cm = np.zeros((len(classes), len(classes)), int)
for a, b in zip(y, pred_cv):
    cm[a, b] += 1
acc_cv = float((pred_cv == y).mean())
print(f"CV10: {acc_cv:.4f}  [{time.time() - t:.0f}s]")

# fondo nuevo: cada foto se predice con el modelo entrenado en el OTRO fondo
pred_bg = np.zeros_like(y)
for b in ("library", "wall"):
    tr, te = np.where(bgs == b)[0], np.where(bgs != b)[0]
    pred_bg[te] = predict(fit(tr, rng), te)
acc_bg = float((pred_bg == y).mean())
print(f"fondo nuevo: {acc_bg:.4f}")

por_letra = []
for c, letra in enumerate(classes):
    m = y == c
    tp = int(cm[c, c]); fn = int(m.sum() - tp); fp = int(cm[:, c].sum() - tp)
    conf = sorted(((classes[j], int(cm[c, j])) for j in range(len(classes)) if j != c and cm[c, j]), key=lambda x: -x[1])[:3]
    por_letra.append({
        "letra": letra, "n": int(m.sum()),
        "recall": round(tp / max(1, tp + fn), 4), "precision": round(tp / max(1, tp + fp), 4),
        "fondoNuevo": round(float((pred_bg[m] == c).mean()), 4),
        "confundidaCon": conf,
    })
    print(f"{letra} recall {por_letra[-1]['recall']:.2f} prec {por_letra[-1]['precision']:.2f} bg {por_letra[-1]['fondoNuevo']:.2f} {conf}")

json.dump({
    "classes": classes, "n": int(len(y)),
    "cv10": round(acc_cv, 4), "fondoNuevo": round(acc_bg, 4),
    "macroF1": round(float(np.mean([2 * p["precision"] * p["recall"] / max(1e-9, p["precision"] + p["recall"]) for p in por_letra])), 4),
    "matriz": cm.tolist(), "porLetra": por_letra,
    "fecha": time.strftime("%Y-%m-%d"),
}, open(OUT, "w"), separators=(",", ":"))
print("guardado", OUT)
