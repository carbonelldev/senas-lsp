// Logica del desplegable (components/ui/Select.astro): abrir/cerrar con animacion,
// teclado (flechas, Home/End, Enter, Escape), clic fuera, y cambio de opciones.
// Emite un CustomEvent "change" con { value } en el elemento raiz.
import type { Limpieza } from "../pagina";

export type Opcion = { value: string; label: string };

export class Select {
  private trigger: HTMLButtonElement;
  private lista: HTMLElement;
  private etiqueta: HTMLElement;
  private abierto = false;
  private cerrarTimer = 0;
  private quitarDoc: Limpieza | null = null;

  constructor(readonly root: HTMLElement) {
    this.trigger = root.querySelector("[data-select-trigger]")!;
    this.lista = root.querySelector("[data-select-list]")!;
    this.etiqueta = root.querySelector("[data-select-label]")!;

    this.trigger.addEventListener("click", () => (this.abierto ? this.cerrar() : this.abrir()));
    this.trigger.addEventListener("keydown", (e) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        this.abrir(e.key === "ArrowUp" ? "last" : "selected");
      }
    });
    this.lista.addEventListener("keydown", (e) => this.teclas(e));
    this.lista.addEventListener("pointermove", (e) => {
      const li = (e.target as Element).closest<HTMLElement>("[role=option]");
      if (li && !("active" in li.dataset)) this.activar(li);
    });
    this.lista.addEventListener("click", (e) => {
      const li = (e.target as Element).closest<HTMLElement>("[role=option]");
      if (li) this.elegir(li.dataset.value ?? "", true);
    });
  }

  private get items() {
    return [...this.lista.querySelectorAll<HTMLElement>("[role=option]")];
  }

  get valor() {
    return this.lista.querySelector<HTMLElement>("[aria-selected=true]")?.dataset.value ?? "";
  }

  set valor(v: string) {
    if (this.items.some((li) => li.dataset.value === v)) this.elegir(v, false);
  }

  /** Reemplaza las opciones; conserva la seleccion si sigue existiendo. */
  opciones(lista: Opcion[]) {
    const actual = this.valor;
    this.lista.replaceChildren(
      ...lista.map((o, i) => {
        const li = document.createElement("li");
        li.id = `${this.lista.id}-${i}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        li.dataset.value = o.value;
        li.textContent = o.label;
        return li;
      }),
    );
    this.elegir(lista.some((o) => o.value === actual) ? actual : (lista[0]?.value ?? ""), false);
  }

  private elegir(v: string, emitir: boolean) {
    const cambia = v !== this.valor;
    for (const li of this.items) li.setAttribute("aria-selected", li.dataset.value === v ? "true" : "false");
    this.etiqueta.textContent = this.items.find((li) => li.dataset.value === v)?.textContent ?? "";
    if (!emitir) return;
    this.cerrar();
    this.trigger.focus();
    if (cambia) this.root.dispatchEvent(new CustomEvent("change", { detail: { value: v } }));
  }

  abrir(foco: "selected" | "first" | "last" = "selected") {
    if (this.abierto) return;
    clearTimeout(this.cerrarTimer);
    this.abierto = true;
    this.lista.hidden = false;
    const r = this.trigger.getBoundingClientRect();
    const h = this.lista.offsetHeight; // fuerza el layout antes de animar
    this.lista.dataset.side = r.bottom + h + 12 > innerHeight && r.top > h + 12 ? "top" : "bottom";
    setTimeout(() => this.abierto && (this.lista.dataset.open = ""), 0); // en un tick aparte para que la transicion arranque
    this.trigger.setAttribute("aria-expanded", "true");
    const ops = this.items;
    const i = foco === "last" ? ops.length - 1 : foco === "first" ? 0 : Math.max(0, ops.findIndex((li) => li.getAttribute("aria-selected") === "true"));
    this.activar(ops[i]);
    this.lista.focus({ preventScroll: true });

    const fuera = (e: PointerEvent) => {
      if (!this.root.contains(e.target as Node)) this.cerrar();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.cerrar();
        this.trigger.focus();
      }
    };
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    this.quitarDoc = () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }

  cerrar() {
    if (!this.abierto) return;
    this.abierto = false;
    this.quitarDoc?.();
    this.quitarDoc = null;
    delete this.lista.dataset.open;
    this.trigger.setAttribute("aria-expanded", "false");
    this.cerrarTimer = window.setTimeout(() => (this.lista.hidden = true), 200);
  }

  private activar(li?: HTMLElement) {
    for (const o of this.items) delete o.dataset.active;
    if (!li) return;
    li.dataset.active = "";
    this.lista.setAttribute("aria-activedescendant", li.id);
    li.scrollIntoView({ block: "nearest" });
  }

  private teclas(e: KeyboardEvent) {
    const ops = this.items;
    const i = ops.findIndex((li) => "active" in li.dataset);
    const ir = (j: number) => {
      e.preventDefault();
      this.activar(ops[(j + ops.length) % ops.length]);
    };
    switch (e.key) {
      case "ArrowDown": return ir(i + 1);
      case "ArrowUp": return ir(i - 1);
      case "Home": return ir(0);
      case "End": return ir(ops.length - 1);
      case "Enter":
      case " ":
        e.preventDefault();
        if (i >= 0) this.elegir(ops[i].dataset.value ?? "", true);
        return;
      case "Tab":
        this.cerrar();
        return;
    }
  }

  destruir() {
    clearTimeout(this.cerrarTimer);
    this.quitarDoc?.();
  }
}
