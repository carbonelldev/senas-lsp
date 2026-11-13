"""Caracteristicas de una mano (21 puntos 3D de MediaPipe) para el clasificador.

Es el mismo calculo que web/src/lib/clasificador.ts: si se cambia uno, hay que cambiar el otro
y regenerar los casos de prueba (exportar_prueba.py + `npm test`).

v1: coordenadas normalizadas + distancias entre puntas (70 valores). Se conserva para comparar.
v2: v1 + angulos de flexion de cada articulacion, apertura entre dedos y posicion del pulgar
    respecto a los otros dedos (95 valores). Los angulos no cambian al girar la mano, asi que
    el modelo depende menos del angulo de la camara.
"""
import numpy as np

TIPS = [4, 8, 12, 16, 20]
PAIRS = [(a, b) for i, a in enumerate(TIPS) for b in TIPS[i + 1:]]  # 10 distancias entre puntas
CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]
JOINTS = [(c[k - 1], c[k], c[k + 1]) for c in CHAINS for k in (1, 2, 3)]  # 15 articulaciones
SPREAD = [((1, 4), (5, 8)), ((5, 8), (9, 12)), ((9, 12), (13, 16)), ((13, 16), (17, 20))]  # 4 aperturas
THUMB = [(4, j) for j in (5, 6, 9, 10, 13, 14)]  # 6 distancias punta del pulgar -> base de los dedos
PALMA = [5, 9, 13, 17]


def normalizar(P, version=2):
    """Muneca en el origen; tamano de la palma = 1 (v2 lo mide en 3D, v1 en 2D)."""
    p = P - P[:, :1]
    ejes = slice(0, 3) if version == 2 else slice(0, 2)
    escala = np.linalg.norm(p[:, PALMA, ejes], axis=2).mean(1)[:, None, None]
    return p / np.maximum(escala, 1e-6)


def _dist(p, pares):
    return np.stack([np.linalg.norm(p[:, a] - p[:, b], axis=1) for a, b in pares], 1)


def _cos(u, v):
    return (u * v).sum(-1) / np.maximum(np.linalg.norm(u, axis=-1) * np.linalg.norm(v, axis=-1), 1e-6)


def features(P, version=2):
    """P: [N, 21, 3] en pixeles (z en la escala de x) -> [N, F]."""
    p = normalizar(P, version)
    partes = [p[:, 1:].reshape(len(p), -1), _dist(p, PAIRS)]
    if version == 2:
        partes.append(np.stack([_cos(p[:, b] - p[:, a], p[:, c] - p[:, b]) for a, b, c in JOINTS], 1))
        partes.append(np.stack([_cos(p[:, a2] - p[:, a1], p[:, b2] - p[:, b1]) for (a1, a2), (b1, b2) in SPREAD], 1))
        partes.append(_dist(p, THUMB))
    return np.concatenate(partes, 1).astype(np.float32)


def rotacion(roll, yaw, pitch):
    """Matrices [N,3,3] de giro: roll en el plano de la imagen, yaw de costado, pitch arriba/abajo."""
    def m(eje, a):
        c, s = np.cos(a), np.sin(a)
        R = np.zeros((len(a), 3, 3))
        i, j = [(1, 2), (0, 2), (0, 1)][eje]
        R[:, eje, eje] = 1
        R[:, i, i] = c; R[:, i, j] = -s; R[:, j, i] = s; R[:, j, j] = c
        return R
    return m(2, roll) @ m(1, yaw) @ m(0, pitch)


def girar(P, rng, roll=15, yaw=0, pitch=0):
    """Gira cada mano un angulo aleatorio (grados) alrededor de la muneca."""
    n = len(P)
    a = lambda g: np.deg2rad(rng.uniform(-g, g, n))
    R = rotacion(a(roll), a(yaw), a(pitch))
    return np.einsum("nij,nkj->nki", R, P - P[:, :1])


def aumentar(P, rng, k, version=2):
    """Copias giradas, con escala y ruido. v1: solo giro en el plano (+-15). v2: giro 3D."""
    out = [P - P[:, :1]]
    for _ in range(k):
        Q = girar(P, rng, roll=30, yaw=40, pitch=30) if version == 2 else girar(P, rng, roll=15)
        Q = Q * rng.uniform(0.9, 1.1, (len(P), 1, 3))
        Q += rng.normal(0, 0.015, Q.shape) * np.linalg.norm(Q[:, 9, :2], axis=1)[:, None, None]
        out.append(Q)
    return np.concatenate(out)


def espejo(P):
    Q = P.copy()
    Q[..., 0] *= -1
    return Q


def probabilidades(meta, P):
    """Aplica el modelo exportado (puntos.json) igual que el navegador. Devuelve [N, clases]."""
    h = (features(P, meta.get("features", 1)) - np.array(meta["mean"])) / np.array(meta["scale"])
    for L in meta["layers"]:
        h = h @ np.array(L["W"]) + np.array(L["b"])
        if L["act"] == "relu":
            h = np.maximum(h, 0)
    e = np.exp(h - h.max(1, keepdims=True))
    return e / e.sum(1, keepdims=True)
