import type { LayerId, MixState, SceneConfig } from "../core/types";

export interface ControlHandlers {
  onLayer(id: LayerId, value: number): void;
  onMaster(value: number): void;
  onWindow(open: boolean): void;
  onPlayToggle(): void;
  onStart(): void;
}

const IDLE_MS = 4000;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

interface SliderRow {
  row: HTMLElement;
  input: HTMLInputElement;
  out: HTMLOutputElement;
}

function slider(idBase: string, label: string, onInput: (v: number) => void): SliderRow {
  const row = el("div", { class: "control" });
  const input = el("input", {
    type: "range",
    id: `${idBase}-slider`,
    min: "0",
    max: "1",
    step: "0.01",
  });
  const lab = el("label", { for: input.id }, label);
  const out = el("output", { for: input.id, class: "control__value" });
  const head = el("div", { class: "control__head" });
  head.append(lab, out);
  row.append(head, input);
  input.addEventListener("input", () => onInput(Number(input.value)));
  return { row, input, out };
}

function paint(s: SliderRow, v: number): void {
  const pct = Math.round(v * 100);
  s.input.value = String(v);
  s.input.style.setProperty("--fill", `${pct}%`);
  s.out.textContent = `${pct}%`;
  s.input.setAttribute("aria-valuetext", `${pct} percent`);
}

/** Builds the overlay, keeps it in sync with the mix, and fades it out when idle. */
export class Controls {
  private readonly panel: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;
  private readonly windowButton: HTMLButtonElement;
  private readonly master: SliderRow;
  private readonly layers = new Map<LayerId, SliderRow>();
  private idleTimer = 0;

  constructor(
    private readonly root: HTMLElement,
    cfg: SceneConfig,
    handlers: ControlHandlers,
  ) {
    this.startButton = el("button", { type: "button", class: "start" });
    this.startButton.append(
      el("span", { class: "start__title" }, "Tap to start"),
      el("span", { class: "start__hint" }, "sound fades in gently"),
    );
    this.startButton.addEventListener("click", handlers.onStart);

    this.panel = el("section", { class: "panel", "aria-label": `${cfg.title} sound mix` });
    const header = el("div", { class: "panel__header" });
    header.append(el("h1", { class: "panel__title" }, cfg.title));
    this.playButton = el("button", { type: "button", class: "btn", "aria-label": "Pause sound" }, "Pause");
    this.playButton.addEventListener("click", handlers.onPlayToggle);
    this.windowButton = el("button", { type: "button", class: "btn", role: "switch", "aria-checked": "false" });
    this.windowButton.addEventListener("click", () =>
      handlers.onWindow(this.windowButton.getAttribute("aria-checked") !== "true"),
    );
    header.append(this.windowButton, this.playButton);

    const grid = el("div", { class: "panel__grid" });
    for (const l of cfg.layers) {
      const s = slider(l.id, l.label, (v) => handlers.onLayer(l.id, v));
      this.layers.set(l.id, s);
      grid.append(s.row);
    }
    this.master = slider("master", "Master volume", handlers.onMaster);
    this.master.row.classList.add("control--master");
    grid.append(this.master.row);

    this.panel.append(header, grid);
    this.root.append(this.startButton, this.panel);

    for (const ev of ["mousemove", "pointerdown", "touchstart", "keydown", "wheel"] as const) {
      window.addEventListener(ev, this.wake, { passive: true });
    }
    this.panel.addEventListener("focusin", this.wake);
    this.panel.addEventListener("focusout", this.wake);
    this.wake();
  }

  sync(mix: MixState, playing: boolean): void {
    for (const [id, s] of this.layers) paint(s, mix.layers[id]);
    paint(this.master, mix.master);
    this.windowButton.setAttribute("aria-checked", String(mix.windowOpen));
    this.windowButton.textContent = mix.windowOpen ? "Window: open" : "Window: closed";
    this.playButton.textContent = playing ? "Pause" : "Play";
    this.playButton.setAttribute("aria-label", playing ? "Pause sound" : "Play sound");
  }

  setStarted(started: boolean): void {
    this.startButton.hidden = started;
  }

  /** Move keyboard focus to a layer's slider and make sure the panel is visible. */
  focusLayer(id: LayerId): void {
    const s = this.layers.get(id);
    if (!s) return;
    this.wake();
    s.input.focus({ preventScroll: true });
    s.row.classList.add("is-pinged");
    window.setTimeout(() => s.row.classList.remove("is-pinged"), 1600);
  }

  private wake = (): void => {
    this.panel.classList.remove("is-idle");
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(this.maybeIdle, IDLE_MS);
  };

  private maybeIdle = (): void => {
    if (this.panel.contains(document.activeElement)) {
      this.idleTimer = window.setTimeout(this.maybeIdle, IDLE_MS);
      return;
    }
    this.panel.classList.add("is-idle");
  };
}
