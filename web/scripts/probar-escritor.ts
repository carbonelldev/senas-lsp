// node scripts/probar-escritor.ts  -> simula fotogramas y comprueba el deletreo y las sugerencias
import { Escritor } from "../src/lib/escritor.ts";
import { sugerir } from "../src/data/palabras.ts";

let ok = true;
const check = (n: string, a: unknown, b: unknown) => {
  const p = JSON.stringify(a) === JSON.stringify(b);
  ok &&= p;
  if (!p) console.log("FALLA", n, "→", JSON.stringify(a), `(esperado ${JSON.stringify(b)})`);
};
const e = new Escritor({ conf: 0.6, holdMs: 900, espacioAuto: true, espacioMs: 1300 });
let t = 0;
const mano = (l: string, ms: number, conf = 0.9) => { for (const end = t + ms; t < end; t += 33) e.tick(l, conf, t); };
const nada = (ms: number) => { for (const end = t + ms; t < end; t += 33) e.sinMano(t); };

mano("H", 1000); check("mantener H 1 s escribe H", e.texto, "H");
mano("H", 2000); check("seguir con H no la repite", e.texto, "H");
mano("O", 1000); mano("L", 1000); mano("A", 1000); check("HOLA sin bajar la mano", e.texto, "HOLA");
nada(1500); check("bajar la mano pone espacio", e.texto, "HOLA ");
mano("L", 1000); nada(400); mano("L", 1000); check("LL bajando la mano un momento", e.texto, "HOLA LL");
mano("A", 300); mano("E", 100); mano("A", 700); check("un parpadeo no reinicia", e.texto, "HOLA LLA");
mano("M", 500, 0.4); check("confianza baja no escribe", e.texto, "HOLA LLA");
mano("M", 600); check("letra breve no se escribe", e.texto, "HOLA LLA");
e.borrarPalabra(); check("borrar palabra", e.texto, "HOLA ");
mano("M", 1000); mano("A", 1000); mano("N", 1000);
check("sugerencias de MAN", e.sugerencias(), ["MANZANA", "MAÑANA"]);
e.completar("MAÑANA"); check("completar", e.texto, "HOLA MAÑANA ");
check("sugerir GRA", sugerir("GRA", 2), ["GRACIAS", "GRANDE"]);
check("MAMA sugiere MAMÁ", sugerir("MAMA").includes("MAMÁ"), true);
check("prefijo vacío", sugerir(""), []);

console.log(ok ? "deletreo: 14 comprobaciones OK" : "deletreo: hay fallos");
if (!ok) process.exit(1);
