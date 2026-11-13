"""Clasificador de letras a partir de los 21 puntos de la mano.

Compara modelos (como el Test and Score de Orange) con tres pruebas:
  - validacion cruzada estratificada de 10 particiones
  - fondo nuevo: entrenar con un fondo (library/wall) y probar con el otro
  - angulo nuevo (simulado): las manos de prueba se giran en 3D (de costado, inclinadas,
    rotadas) antes de clasificarlas; el modelo nunca vio esas manos ni esos angulos
Tambien compara las caracteristicas v1 (anteriores) con v2 y exporta el mejor modelo a JSON.

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from caracteristicas import PAIRS, aumentar, espejo, features, girar  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
z = np.load(os.path.join(HERE, "cache", "puntos.npz"))
found = z["found"]
P, labels, bgs = z["pts"][found], z["labels"][found], z["backgrounds"][found]
classes = sorted(set(z["labels"]))
y = np.array([classes.index(l) for l in labels])

MODELS = {
    "Logistic Regression": lambda: LogisticRegression(C=1.0, max_iter=5000),
    "SVM": lambda: SVC(C=10, gamma="scale"),
    "Neural Network": lambda: MLPClassifier((128, 64), alpha=1e-3, max_iter=400, early_stopping=True, random_state=0),
    "kNN": lambda: KNeighborsClassifier(5),
}
K_AUG = {1: 4, 2: 6}


def fit(name, idx, rng, version=2):
    Pa = aumentar(P[idx], rng, K_AUG[version], version)
    Pa = np.concatenate([Pa, espejo(Pa)])
    ya = np.tile(y[idx], (K_AUG[version] + 1) * 2)
    X = features(Pa, version)
    sc = StandardScaler().fit(X)
    return sc, MODELS[name]().fit(sc.transform(X), ya), version


def score(model, idx, Q=None):
    sc, clf, version = model
    Q = P[idx] if Q is None else Q
    return float((clf.predict(sc.transform(features(Q, version))) == y[idx]).mean())


def evaluar(name, version=2):
    rng = np.random.default_rng(0)
    rot = np.random.default_rng(123)  # mismos giros de prueba para todos los modelos
    cv, ang = [], []
    for tr, te in StratifiedKFold(10, shuffle=True, random_state=0).split(P, y):
        m = fit(name, tr, rng, version)
        cv.append(score(m, te))
        ang.append(score(m, te, girar(P[te], rot, roll=30, yaw=35, pitch=25)))
    bg, fl = [], []
    for b in ("library", "wall"):
        m = fit(name, np.where(bgs == b)[0], rng, version)
        te = np.where(bgs != b)[0]
        bg.append(score(m, te))
        fl.append(score(m, te, espejo(P[te])))
    return float(np.mean(cv)), float(np.mean(bg)), float(np.mean(fl)), float(np.mean(ang))


print(f"{len(y)} imagenes con mano detectada ({found.mean():.1%} del total)\n")
cab = f"{'modelo':28} {'CV10':>6} {'fondo nuevo':>12} {'mano izq.':>10} {'angulo nuevo':>13}"
t = time.time()
v1 = evaluar("Logistic Regression", version=1)
print(cab)
print(f"{'LR · caracteristicas v1':28} {v1[0]:6.3f} {v1[1]:12.3f} {v1[2]:10.3f} {v1[3]:13.3f}   [{time.time() - t:.0f}s]")
res = {}
for name in MODELS:
    t = time.time()
    res[name] = evaluar(name)
    r = res[name]
    print(f"{name + ' · v2':28} {r[0]:6.3f} {r[1]:12.3f} {r[2]:10.3f} {r[3]:13.3f}   [{time.time() - t:.0f}s]", flush=True)

# para la web: LR o red neuronal (las dos se ejecutan facil en JS); gana la mas robusta
robustez = lambda n: (res[n][1] + res[n][3]) / 2
best = max(["Logistic Regression", "Neural Network"], key=robustez)
print("\nexportando:", best)
sc, clf, _ = fit(best, np.arange(len(y)), np.random.default_rng(1))
if best == "Logistic Regression":
    layers = [{"W": clf.coef_.T, "b": clf.intercept_, "act": "softmax"}]
else:
    layers = [{"W": W, "b": b, "act": "relu"} for W, b in zip(clf.coefs_, clf.intercepts_)]
    layers[-1]["act"] = "softmax"
for L in layers:  # redondear para que el JSON pese poco
    L["W"] = np.round(np.array(L["W"]), 5).tolist()
    L["b"] = np.round(np.array(L["b"]), 5).tolist()


def forward(X):  # el mismo calculo que hace el navegador
    h = (X - sc.mean_) / sc.scale_
    for L in layers:
        h = h @ np.array(L["W"]) + np.array(L["b"])
        if L["act"] == "relu":
            h = np.maximum(h, 0)
    return h.argmax(1)


X = features(P)
print(f"coincidencia JSON vs sklearn: {(forward(X) == clf.predict(sc.transform(X))).mean():.4f}")

cv, bg, fl, ang = res[best]
meta = {
    "classes": classes, "model": best, "features": 2,
    "mean": np.round(sc.mean_, 6).tolist(), "scale": np.round(sc.scale_, 6).tolist(),
    "layers": layers, "pairs": PAIRS,
    "metrics": {"cv10": round(cv, 4), "newBackground": round(bg, 4), "leftHand": round(fl, 4),
                "newAngle": round(ang, 4), "detected": round(float(found.mean()), 4)},
    "all": {k: [round(v, 4) for v in r] for k, r in res.items()},
    "v1": [round(v, 4) for v in v1],
    "trained": time.strftime("%Y-%m-%d"),
}
os.makedirs(OUT, exist_ok=True)
path = os.path.join(OUT, "puntos.json")
json.dump(meta, open(path, "w"), separators=(",", ":"))
print("guardado", path, f"{os.path.getsize(path) / 1e3:.0f} KB")
