import type { PropertyAnalysis } from "./types";

const KEY = "vastgoedai:history:v1";
const MAX = 30;
const TTL_MS = 24 * 60 * 60 * 1000;

export function loadHistory(): PropertyAnalysis[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr: PropertyAnalysis[] = JSON.parse(raw);
    return arr.filter((a) => Date.now() - a.timestamp < TTL_MS);
  } catch {
    return [];
  }
}

export function saveAnalysis(a: PropertyAnalysis) {
  if (typeof window === "undefined") return;
  const list = loadHistory().filter((x) => x.id !== a.id);
  list.unshift(a);
  const trimmed = list.slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function findCached(input: string): PropertyAnalysis | undefined {
  return loadHistory().find((a) => a.input.toLowerCase() === input.toLowerCase());
}

export function deleteAnalysis(id: string) {
  const list = loadHistory().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}
