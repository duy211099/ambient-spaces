import { GUIDE_ENTRIES } from "../guide/entries.ts";

export interface GuideSession {
  /** Extra content under the entry (the tour's Back / Next / Exit). */
  footer: HTMLElement;
  /** Runs instead of closing when the user presses × or Escape. */
  onDismiss: () => void;
}

let session: GuideSession | null = null;
let opener: HTMLElement | null = null;
let keyBound = false;

const panel = (): HTMLElement | null => document.getElementById("guide-panel");

function dismiss(): void {
  if (session) session.onDismiss();
  else closeGuide();
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape" || panel()?.hidden !== false) return;
  e.preventDefault();
  dismiss();
}

/**
 * Shows an entry in the side panel (a bottom sheet on narrow screens). Non-modal: the page stays usable
 * and the music keeps playing. A plain call while a session is open keeps the session's footer.
 */
export function openGuide(entryId: string, next?: GuideSession | null): void {
  const el = panel();
  const entry = GUIDE_ENTRIES[entryId];
  if (!el || !entry) return;
  if (next !== undefined) session = next;
  if (el.hidden && document.activeElement instanceof HTMLElement && !el.contains(document.activeElement)) opener = document.activeElement;
  if (!keyBound) {
    document.addEventListener("keydown", onKey);
    keyBound = true;
  }

  const head = document.createElement("div");
  head.className = "guide-head";
  const title = document.createElement("h2");
  title.id = "guide-title";
  title.textContent = entry.title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "guide-close";
  close.setAttribute("aria-label", session ? "Exit the tour" : "Close guide");
  close.textContent = "×";
  close.addEventListener("click", dismiss);
  head.append(title, close);

  const body = document.createElement("p");
  body.className = "guide-body";
  body.textContent = entry.body;
  const source = document.createElement("p");
  source.className = "guide-source";
  source.textContent = entry.source;

  el.setAttribute("aria-labelledby", "guide-title");
  el.setAttribute("data-entry", entry.id);
  el.replaceChildren(head, body, source, ...(session ? [session.footer] : []));
  el.hidden = false;
}

export function closeGuide(): void {
  const el = panel();
  session = null;
  if (!el || el.hidden) return;
  const hadFocus = el.contains(document.activeElement);
  el.hidden = true;
  el.replaceChildren();
  el.removeAttribute("data-entry");
  if (hadFocus && opener?.isConnected) opener.focus();
  opener = null;
}
