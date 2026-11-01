import { TOUR_LAYER, TOUR_STEPS, type TourStep } from "../guide/tour.ts";
import { normalizeSettings } from "../settings.ts";
import type { SettingsStore } from "../store.ts";
import { closeGuide, openGuide } from "./guide-panel.ts";

const FOCUS_CLASS = "tour-focus";

function button(text: string, onClick: () => void, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  b.addEventListener("click", onClick);
  return b;
}

/** The control a step points at: its `focus` control on the tour layer, or the control whose ⓘ shows the entry. */
function targetOf(step: TourStep): HTMLElement | null {
  const root = document.getElementById("music-studio");
  if (!root) return null;
  if (step.focus !== null) {
    return root.querySelector<HTMLElement>(`[data-control="${step.focus}"][data-layer="${TOUR_LAYER}"]`)
      ?? root.querySelector<HTMLElement>(`[data-control="${step.focus}"]`);
  }
  const info = root.querySelector(`[data-layer="${TOUR_LAYER}"] [data-guide="${step.entryId}"]`)
    ?? root.querySelector(`[data-controls] [data-guide="${step.entryId}"]`);
  return info?.closest<HTMLElement>(".ctl") ?? null;
}

function clearFocus(): void {
  for (const el of document.querySelectorAll(`.${FOCUS_CLASS}`)) el.classList.remove(FOCUS_CLASS);
}

function highlight(step: TourStep): void {
  clearFocus();
  const target = targetOf(step);
  if (!target) return;
  for (let d = target.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
  target.classList.add(FOCUS_CLASS);
  target.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

/**
 * Walks through TOUR_STEPS on live settings. Settings are previewed (not saved) until the user exits;
 * "Back to my mix" restores the settings from before the tour, "Keep this sound" saves the current ones.
 */
export function runTour(store: SettingsStore, startAudio: () => void): void {
  if (store.previewing) return;
  store.beginPreview();
  const base = store.get();
  let index = 0;

  const finish = (keep: boolean) => {
    clearFocus();
    closeGuide();
    store.endPreview(keep);
    document.querySelector<HTMLElement>("[data-tour]")?.focus();
  };

  const askExit = () => {
    const footer = document.createElement("div");
    footer.className = "tour-nav";
    const ask = document.createElement("p");
    ask.className = "tour-ask";
    ask.textContent = "Leave the tour. Which sound do you want?";
    const back = button("Back to my mix", () => finish(false), { "data-tour-restore": "" });
    const keep = button("Keep this sound", () => finish(true), { "data-tour-keep": "" });
    footer.append(ask, back, keep);
    openGuide(TOUR_STEPS[index].entryId, { footer, onDismiss: () => finish(false) });
    back.focus();
  };

  const show = (i: number) => {
    index = i;
    let s = base;
    for (const step of TOUR_STEPS.slice(0, i + 1)) s = step.apply(s);
    store.set(normalizeSettings(s));

    const last = i === TOUR_STEPS.length - 1;
    const footer = document.createElement("div");
    footer.className = "tour-nav";
    const count = document.createElement("span");
    count.className = "tour-count";
    count.textContent = `Step ${i + 1} of ${TOUR_STEPS.length}`;
    const back = button("Back", () => show(i - 1), { "data-tour-back": "" });
    back.disabled = i === 0;
    const next = button(last ? "Finish" : "Next", () => (last ? askExit() : show(i + 1)), { "data-tour-next": "" });
    const exit = button("Exit", askExit, { "data-tour-exit": "" });
    footer.append(count, back, next, exit);
    openGuide(TOUR_STEPS[i].entryId, { footer, onDismiss: askExit });
    highlight(TOUR_STEPS[i]);
    next.focus({ preventScroll: true });
  };

  show(0);
  startAudio();
}
