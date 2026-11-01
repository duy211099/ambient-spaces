import { normalizeSettings, type StudioSettings } from "./settings.ts";

const PREFIX = "v1.";

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const std = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeShare(s: StudioSettings): string {
  return PREFIX + toBase64Url(JSON.stringify(s));
}

export function decodeShare(text: string): StudioSettings | null {
  if (typeof text !== "string" || !text.startsWith(PREFIX)) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(text.slice(PREFIX.length)));
    if (typeof parsed !== "object" || parsed === null || (parsed as { version?: unknown }).version !== 1) return null;
    return normalizeSettings(parsed);
  } catch {
    return null;
  }
}
