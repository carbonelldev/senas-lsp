// Letras aprendidas, guardadas solo en este navegador.
const CLAVE = "senas-aprendidas";

export function leerAprendidas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAVE) || "[]"));
  } catch {
    return new Set();
  }
}

export function guardarAprendidas(set: Set<string>) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...set]));
  } catch {}
}
