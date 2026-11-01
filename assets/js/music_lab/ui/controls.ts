import type { DriftSettings, DriftTarget, LayerSettings, StudioSettings } from "../settings.ts";
import {
  addDrift, addLayer, driftTargets, MAX_DRIFTS, removeDrift, updateDrift, applyControl, CONTROL_DEFS, layerNotes, MAX_LAYERS, MODE_GUIDES, readControl, removeLayer, setWeight,
  weightDef, type ControlDef,
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
  let focusAfterRender: { kind: "layer"; id: string } | { kind: "add" } | null = null;
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
    if (def.kind === "number") {
      value = Math.floor(value as number);
      input.value = String(Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, value as number)));
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
    for (const note of layerNotes(layer)) {
      const def = weightDef(note);
      const { row, b } = build(def, layer.id, note, def.id);
      b.input.addEventListener("input", () => emit(setWeight(current, layer.id, note, Number(b.input.value))));
      bound.push(b);
      host.append(row);
    }
  }

  function renderLayer(layer: LayerSettings): HTMLElement {
    const panel = el("section", { class: "panel", "data-layer": layer.id });
    const h2 = el("h2");
    h2.append(el("span", {}, layer.label));
    const actions = el("span", { class: "panel-actions" });
    const add = el("button", { type: "button", "data-add-layer": layer.id, "aria-label": `Add a layer like Notes (after ${layer.label})`, title: "Add a layer like Notes" }, "+ Layer");
    const remove = el("button", { type: "button", "data-remove-layer": layer.id, "aria-label": `Remove ${layer.label} layer`, title: "Remove this layer" }, "Remove");
    const canRemove = current.layers.length > 1;
    remove.disabled = !canRemove;
    remove.setAttribute("aria-disabled", String(!canRemove));
    const canAdd = current.layers.length < MAX_LAYERS;
    add.disabled = !canAdd;
    add.setAttribute("aria-disabled", String(!canAdd));
    add.addEventListener("click", () => {
      const before = current.layers.length;
      emit(addLayer(current));
      if (current.layers.length > before) focusAfterRender = { kind: "layer", id: current.layers[current.layers.length - 1].id };
      if (focusAfterRender) restoreFocus();
    });
    remove.addEventListener("click", () => {
      emit(removeLayer(current, layer.id));
      focusAfterRender = { kind: "add" };
      restoreFocus();
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
    driftHost = el("section", { class: "panel", "data-drifts": "" });
    root.append(driftHost);
    renderDrifts();
    structureKey = current.layers.map((l) => l.id).join("|");
    for (const b of bound) show(b, current);
  }

  function renderDriftRow(d: DriftSettings): HTMLElement {
    const row = el("div", { class: "ctl drift", "data-drift": d.id });
    const field = (labelText: string, input: HTMLElement, guide?: string): HTMLElement => {
      const wrap = el("div", { class: "drift-field" });
      const label = el("label", { for: input.id }, labelText);
      wrap.append(label, input);
      if (guide) wrap.append(el("button", { type: "button", class: "info", "data-guide": guide, "aria-label": `About ${labelText}` }, "ⓘ"));
      return wrap;
    };
    const mk = (kind: string) => `ctl-${++uid}-${kind}`;

    const target = el("select", { id: mk("target"), "data-field": "target" });
    for (const [value, text] of Object.entries(driftTargets(current))) target.append(el("option", { value }, text));
    target.addEventListener("change", () => emit(updateDrift(current, d.id, { target: target.value as DriftTarget })));

    const period = el("input", { id: mk("period"), type: "range", min: "5", max: "1800", step: "5", "data-field": "period" });
    const periodOut = el("em", { "data-out": "period" });
    period.addEventListener("input", () => emit(updateDrift(current, d.id, { periodSec: Number(period.value) })));

    const depth = el("input", { id: mk("depth"), type: "range", min: "0", max: "1", step: "0.01", "data-field": "depth" });
    const depthOut = el("em", { "data-out": "depth" });
    depth.addEventListener("input", () => emit(updateDrift(current, d.id, { depth: Number(depth.value) })));

    const enabled = el("input", { id: mk("enabled"), type: "checkbox", "data-field": "enabled" });
    enabled.addEventListener("change", () => emit(updateDrift(current, d.id, { enabled: enabled.checked })));

    const modBy = el("select", { id: mk("modby"), "data-field": "modulatedBy" });
    modBy.append(el("option", { value: "" }, "Nothing"));
    for (const other of current.drifts) {
      if (other.id !== d.id) modBy.append(el("option", { value: other.id }, driftLabel(other)));
    }
    modBy.addEventListener("change", () => emit(updateDrift(current, d.id, { modulatedBy: modBy.value === "" ? null : modBy.value })));

    const remove = el("button", { type: "button", "data-remove-drift": d.id, "aria-label": `Remove drift on ${driftLabel(d)}` }, "Remove");
    remove.addEventListener("click", () => emit(removeDrift(current, d.id)));

    const periodField = field("Period (s)", period);
    periodField.append(periodOut);
    const depthField = field("Depth", depth);
    depthField.append(depthOut);
    const toggle = field("On", enabled);
    row.append(field("Drift on", target, "drift"), periodField, depthField, toggle, field("Modulated by", modBy, "drift-on-drift"), remove);
    return row;
  }

  const driftLabel = (d: DriftSettings): string => `${driftTargets(current)[d.target] ?? d.target} (${d.id})`;

  function showDrift(row: HTMLElement, d: DriftSettings): void {
    const set = (field: string, value: string) => {
      const input = row.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field="${field}"]`);
      if (input && document.activeElement !== input) input.value = value;
    };
    for (const opt of row.querySelectorAll<HTMLOptionElement>('[data-field="modulatedBy"] option')) {
      const other = current.drifts.find((x) => x.id === opt.value);
      if (other) opt.textContent = driftLabel(other);
    }
    set("target", d.target);
    set("period", String(d.periodSec));
    set("depth", String(d.depth));
    set("modulatedBy", d.modulatedBy ?? "");
    const on = row.querySelector<HTMLInputElement>('[data-field="enabled"]');
    if (on) on.checked = d.enabled;
    const po = row.querySelector('[data-out="period"]');
    if (po) po.textContent = fmt(d.periodSec);
    const dop = row.querySelector('[data-out="depth"]');
    if (dop) dop.textContent = fmt(d.depth);
  }

  const driftKey = (s: StudioSettings): string =>
    `${s.layers.map((l) => `${l.id}:${l.label}`).join("|")}#${s.drifts.map((d) => d.id).join("|")}`;
  let driftHost: HTMLElement | null = null;
  let driftStructure = "";

  function renderDrifts(): void {
    if (!driftHost) return;
    driftStructure = driftKey(current);
    const head = el("h2");
    head.append(el("span", {}, "Slow drift"));
    const actions = el("span", { class: "panel-actions" });
    const add = el("button", { type: "button", "data-add-drift": "", title: "Add a slow drift" }, "+ Drift");
    add.disabled = current.drifts.length >= MAX_DRIFTS;
    add.addEventListener("click", () => emit(addDrift(current)));
    actions.append(add);
    head.append(actions);
    driftHost.replaceChildren(head);
    for (const d of current.drifts) driftHost.append(renderDriftRow(d));
    syncDrifts();
  }

  function syncDrifts(): void {
    if (!driftHost) return;
    for (const d of current.drifts) {
      const row = driftHost.querySelector<HTMLElement>(`[data-drift="${d.id}"]`);
      if (row) showDrift(row, d);
    }
  }

  function restoreFocus(): void {
    const f = focusAfterRender;
    focusAfterRender = null;
    if (!f) return;
    const target = f.kind === "layer"
      ? root.querySelector<HTMLElement>(`section[data-layer="${f.id}"] .ctl select, section[data-layer="${f.id}"] .ctl input`)
      : root.querySelector<HTMLElement>("button[data-add-layer]:not(:disabled)");
    target?.focus();
  }

  renderAll();

  return {
    sync(s: StudioSettings): void {
      current = s;
      const key = s.layers.map((l) => l.id).join("|");
      if (key !== structureKey) return renderAll();
      if (driftKey(s) !== driftStructure) renderDrifts();
      else syncDrifts();
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
