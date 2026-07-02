export function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function parseNumber(value, fallback = 0) {
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundUpToTenth(value) {
  return Math.ceil(value * 10) / 10;
}
