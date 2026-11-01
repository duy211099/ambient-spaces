import { CAPS, type LayerSettings, type StudioSettings } from "../settings.ts";
import {
  applyControl, CONTROL_DEFS, layerNotes, MODE_GUIDES, readControl, setPath, type ControlDef,
} from "./control-defs.ts";

export interface Controls {
  sync(s: StudioSettings): void;
}

interface Bound {
  def: ControlDef;
  layerId: string | null;
  input: HTMLInputElement | HTMLSelectElement;
  out: HTMLElement | null;
  info: HTMLButtonElement;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));
let uid = 0;

export function renderControls(root: HTMLElement, initial: StudioSettings, onChange: (next: StudioSettings) => void): Controls {
  let current = initial;
  let bound: Bound[] = [];
  let structureKey = "";
  const weightHosts = new Map<string, { host: HTMLElement; key: string }>();

  const emit = (next: StudioSettings) => {
    current = next;
    onChange(next);
  };

  function build(def: ControlDef, layerId: string | null, labelText = def.label, id = def.id): { row: HTMLElement; b: Bound } {
    const inputId = `ctl-${++uid}`;
    const info = el("button", { type: "button", class: "info", "data-guide": def.guide, "aria-label": `About ${labelText}` }, "ⓘ");
    const row = el("div", { class: def.kind === "toggle" ? "ctl ctl--toggle" : "ctl", "data-control": id });
    if (layerId) row.setAttribute("data-layer", layerId);
    const label = el("label", { for: inputId }, labelText);
    let input: HTMLInputElement | HTMLSelectElement;
    let out: HTMLElement | null = null;

    if (def.kind === "select") {
      const select = el("select", { id: inputId });
      for (const [value, text] of Object.entries(def.options ?? {})) select.append(el("option", { value }, text));
      input = select;
    } else {
      const inp = el("input", { id: inputId });
      if (def.kind === "toggle") inp.type = "checkbox";
      else if (def.kind === "number") inp.type = "number";
      else inp.type = "range";
      if (def.kind !== "toggle") {
        inp.min = String(def.min);
        inp.max = String(def.max);
        inp.step = String(def.step ?? 1);
      }
      input = inp;
    }

    if (def.kind === "toggle") {
      row.append(input, label, info);
    } else {
      const head = el("div", { class: "ctl-head" });
      head.append(label);
      if (def.kind === "range") {
        out = el("em");
        head.append(out);
      }
      head.append(info);
      row.append(head, input);
    }
    return { row, b: { def, layerId, input, out, info } };
  }

  function show(b: Bound, s: StudioSettings): void {
    const layer = b.layerId ? s.layers.find((l) => l.id === b.layerId) : undefined;
    if (b.def.scope === "layer" && !layer) return;
    const v = readControl(b.def, s, layer) ?? (b.def.id.startsWith("weight-") ? 1 : undefined);
    if (b.input instanceof HTMLInputElement && b.input.type === "checkbox") b.input.checked = Boolean(v);
    else if (document.activeElement !== b.input || b.def.kind === "select") b.input.value = String(v);
    if (b.out && typeof v === "number") b.out.textContent = fmt(v);
    if (b.def.id === "mode" && layer) b.info.setAttribute("data-guide", MODE_GUIDES[layer.mode] ?? b.def.guide);
  }

  function onInput(def: ControlDef, layerId: string | null, input: HTMLInputElement | HTMLSelectElement): void {
    let value: unknown;
    if (input instanceof HTMLInputElement && input.type === "checkbox") value = input.checked;
    else if (def.kind === "select") value = input.value;
    else {
      value = Number(input.value);
      if (!Number.isFinite(value as number) || input.value === "") return;
    }
    if (layerId === null) return emit(applyControl(current, def, value));
    const idx = current.layers.findIndex((l) => l.id === layerId);
    if (idx >= 0) emit(applyControl(current, def, value, idx));
  }

  function bind(def: ControlDef, layerId: string | null, parent: HTMLElement): void {
    const { row, b } = build(def, layerId);
    const evt = def.kind === "select" || def.kind === "toggle" || def.kind === "number" ? "change" : "input";
    b.input.addEventListener(evt, () => onInput(def, layerId, b.input));
    bound.push(b);
    parent.append(row);
  }

  function renderWeights(layer: LayerSettings, host: HTMLElement): void {
    for (const b of bound.filter((x) => x.layerId === layer.id && x.def.id.startsWith("weight-"))) {
      bound = bound.filter((x) => x !== b);
    }
    host.replaceChildren(el("summary", {}, "Note weights"));
    const weightDef = (note: string): ControlDef => ({
      id: `weight-${note}`, label: note, kind: "range", scope: "layer", path: `weights.${note}`,
      min: CAPS.weight[0], max: CAPS.weight[1], step: 0.05, guide: "weights",
    });
    for (const note of layerNotes(layer)) {
      const def = weightDef(note);
      const { row, b } = build(def, layer.id, note, def.id);
      b.input.addEventListener("input", () => {
        const idx = current.layers.findIndex((l) => l.id === layer.id);
        if (idx < 0) return;
        const next = setPath(current, `layers.${idx}.weights.${note}`, Number(b.input.value));
        emit(next);
      });
      bound.push(b);
      host.append(row);
    }
  }

  function renderLayer(layer: LayerSettings): HTMLElement {
    const panel = el("section", { class: "panel", "data-layer": layer.id });
    const h2 = el("h2");
    h2.append(el("span", {}, layer.label));
    const actions = el("span", { class: "panel-actions" });
    const add = el("button", { type: "button", "data-add-layer": layer.id, title: "Add a layer like Notes" }, "+ Layer");
    const remove = el("button", { type: "button", "data-remove-layer": layer.id, title: "Remove this layer" }, "Remove");
    add.addEventListener("click", () => {
      const base = current.layers.find((l) => l.id === "notes") ?? current.layers[0];
      let n = current.layers.length + 1;
      while (current.layers.some((l) => l.id === `layer${n}`)) n++;
      const copy: LayerSettings = { ...structuredClone(base), id: `layer${n}`, label: `Layer ${n}` };
      emit({ ...current, layers: [...current.layers, copy] });
      renderAll();
    });
    remove.addEventListener("click", () => {
      if (current.layers.length <= 1) return;
      emit({ ...current, layers: current.layers.filter((l) => l.id !== layer.id) });
      renderAll();
    });
    actions.append(add, remove);
    h2.append(actions);
    panel.append(h2);
    for (const def of CONTROL_DEFS.filter((d) => d.scope === "layer")) bind(def, layer.id, panel);
    const host = el("details", { class: "weights", "data-weights": layer.id });
    panel.append(host);
    renderWeights(layer, host);
    weightHosts.set(layer.id, { host, key: layerNotes(layer).join(",") });
    return panel;
  }

  function renderAll(): void {
    bound = [];
    weightHosts.clear();
    root.replaceChildren();
    for (const scope of ["global", "bus"] as const) {
      const panel = el("section", { class: "panel" });
      panel.append(el("h2", {}, scope === "global" ? "Overall" : "Space and echo"));
      for (const def of CONTROL_DEFS.filter((d) => d.scope === scope)) bind(def, null, panel);
      root.append(panel);
    }
    for (const layer of current.layers) root.append(renderLayer(layer));
    structureKey = current.layers.map((l) => l.id).join("|");
    for (const b of bound) show(b, current);
  }

  renderAll();

  return {
    sync(s: StudioSettings): void {
      current = s;
      const key = s.layers.map((l) => l.id).join("|");
      if (key !== structureKey) return renderAll();
      for (const layer of s.layers) {
        const w = weightHosts.get(layer.id);
        const notesKey = layerNotes(layer).join(",");
        if (w && w.key !== notesKey) {
          const wasOpen = (w.host as HTMLDetailsElement).open;
          renderWeights(layer, w.host);
          (w.host as HTMLDetailsElement).open = wasOpen;
          w.key = notesKey;
          for (const b of bound) if (b.layerId === layer.id && b.def.id.startsWith("weight-")) show(b, s);
        }
      }
      for (const b of bound) show(b, s);
    },
  };
}
