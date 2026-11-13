// Panel "Deletreo" (components/detector/Writer.astro): texto, sugerencias, botones,
// teclado, voz y ajustes. El detector le pasa en cada fotograma la letra de la mano principal.
import { Escritor } from "../lib/escritor";
import { $, type Limpieza } from "../lib/pagina";
import { Select } from "../lib/ui/select";

const WRITE_CONF = 0.6;
const ESPACIO_MS = 1300;

export function montarDeletreo(root: HTMLElement, anillo: { caja: HTMLElement; circulo: SVGCircleElement }) {
  const panel = $(root, "[data-writer]");
  const salida = $(panel, "[data-text]");
  const sugs = $(panel, "[data-sugs]");
  const auto = $<HTMLInputElement>(panel, "[data-auto]");
  const autoEspacio = $<HTMLInputElement>(root, "[data-autospace]");
  const holdBar = $(panel, "[data-hold]");
  const speakBtn = $<HTMLButtonElement>(panel, "[data-speak]");
  const copyLabel = $(panel, "[data-copy-label]");
  const velocidad = new Select($(root, "[data-select=speed]"));
  const circ = Number(anillo.circulo.style.getPropertyValue("--c")) || 364;
  const limpiezas: Limpieza[] = [() => velocidad.destruir()];

  const escritor = new Escritor(
    { conf: WRITE_CONF, holdMs: Number(velocidad.valor) || 900, espacioAuto: autoEspacio.checked, espacioMs: ESPACIO_MS },
    (texto, escrita) => pintar(texto, !!escrita),
  );

  // ----- pintar -----
  function pintar(texto: string, nueva: boolean) {
    if (!texto) {
      const ph = document.createElement("span");
      ph.className = "placeholder text-sm font-normal tracking-normal text-dim";
      ph.textContent = "Mantén una letra y aparecerá aquí";
      salida.replaceChildren(ph);
    } else {
      const letras = [...texto].map((ch, i) => {
        const s = document.createElement("span");
        s.className = "l" + (nueva && i === texto.length - 1 ? " nueva" : "");
        s.textContent = ch === " " ? " " : ch;
        return s;
      });
      const caret = document.createElement("span");
      caret.className = "caret";
      salida.replaceChildren(...letras, caret);
    }
    pintarSugerencias();
    if (nueva) {
      anillo.caja.removeAttribute("data-escrita");
      void anillo.caja.getBoundingClientRect();
      anillo.caja.dataset.escrita = "";
    }
  }

  function pintarSugerencias() {
    const lista = escritor.sugerencias();
    if (!lista.length) {
      const vacio = document.createElement("span");
      vacio.className = "label-mono";
      vacio.textContent = escritor.palabraActual ? "sin sugerencias" : "sugerencias de palabras";
      return sugs.replaceChildren(vacio);
    }
    sugs.replaceChildren(
      ...lista.map((p, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = p;
        if (i === 0) {
          const k = document.createElement("kbd");
          k.textContent = "Tab";
          b.append(k);
        }
        b.addEventListener("click", () => escritor.completar(p));
        return b;
      }),
    );
  }

  function progreso(p: number) {
    holdBar.style.width = `${p * 100}%`;
    anillo.circulo.style.strokeDashoffset = String(circ * (1 - p));
  }

  // ----- acciones -----
  const leer = () => {
    const texto = escritor.texto.trim();
    if (!texto || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto.toLowerCase());
    const voces = speechSynthesis.getVoices();
    const voz = voces.find((v) => v.lang === "es-PE") ?? voces.find((v) => v.lang.startsWith("es-4")) ?? voces.find((v) => v.lang.startsWith("es"));
    if (voz) u.voice = voz;
    u.lang = voz?.lang ?? "es-PE";
    speechSynthesis.speak(u);
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(escritor.texto.trim());
      copyLabel.textContent = "Copiado";
    } catch {
      copyLabel.textContent = "No se pudo";
    }
    setTimeout(() => (copyLabel.textContent = "Copiar"), 1400);
  };
  if (!("speechSynthesis" in window)) speakBtn.hidden = true;

  $(panel, "[data-space]").addEventListener("click", () => escritor.espacio());
  $(panel, "[data-back]").addEventListener("click", () => escritor.borrar());
  $(panel, "[data-clear]").addEventListener("click", () => escritor.limpiar());
  speakBtn.addEventListener("click", leer);
  $(panel, "[data-copy]").addEventListener("click", copiar);
  velocidad.root.addEventListener("change", (e) => {
    escritor.opts.holdMs = Number((e as CustomEvent<{ value: string }>).detail.value);
    escritor.reiniciar();
  });
  autoEspacio.addEventListener("change", () => (escritor.opts.espacioAuto = autoEspacio.checked));
  auto.addEventListener("change", () => {
    escritor.reiniciar();
    progreso(0);
  });

  // teclado: solo si el foco no esta en un control (asi no se pisa con botones ni desplegables)
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (e.altKey || e.metaKey || t?.closest("input, textarea, button, [contenteditable], [role=listbox], [role=combobox], a")) return;
    if (e.key === " ") {
      e.preventDefault();
      escritor.espacio();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      e.ctrlKey ? escritor.borrarPalabra() : escritor.borrar();
    } else if (e.key === "Tab" && !e.shiftKey && escritor.sugerencias(1).length) {
      e.preventDefault();
      escritor.completar(escritor.sugerencias(1)[0]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      leer();
    }
  };
  document.addEventListener("keydown", onKey);
  limpiezas.push(() => document.removeEventListener("keydown", onKey));

  return {
    /** Fotograma con la mano principal. */
    tick(letra: string, conf: number, now: number) {
      if (!auto.checked) return progreso(0);
      progreso(escritor.tick(letra, conf, now).progreso);
    },
    /** Fotograma sin manos. */
    sinMano(now: number) {
      progreso(0);
      if (auto.checked) escritor.sinMano(now);
    },
    reiniciar() {
      escritor.reiniciar();
      progreso(0);
    },
    destruir() {
      speechSynthesis?.cancel();
      limpiezas.forEach((f) => f());
    },
  };
}
