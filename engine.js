// Pure logic for duftfinder. No DOM access here, so everything is unit-testable with `node --test`.

export const SEASONS = ["fruehling", "sommer", "herbst", "winter"];

/** Season for a date (meteorological, northern hemisphere). */
export function seasonForDate(date = new Date()) {
  const m = date.getMonth(); // 0 = Jan
  if (m === 11 || m <= 1) return "winter";
  if (m <= 4) return "fruehling";
  if (m <= 7) return "sommer";
  return "herbst";
}

const norm = (s) => s.trim().toLowerCase();

/** Note -> weight map. Base notes last longest on skin, so they count most. */
export function noteWeights(p) {
  const w = new Map();
  const add = (list, weight) => list.forEach((n) => w.set(norm(n), Math.max(w.get(norm(n)) ?? 0, weight)));
  add(p.top, 0.6);
  add(p.heart, 0.8);
  add(p.base, 1);
  return w;
}

export function allNotes(perfumes) {
  const set = new Map();
  for (const p of perfumes) for (const n of [...p.top, ...p.heart, ...p.base]) set.set(norm(n), n);
  return [...set.values()].sort((a, b) => a.localeCompare(b, "de"));
}

/** Weighted Jaccard over notes, plus small bonuses for same family and shared seasons. Returns 0..1. */
export function similarity(a, b) {
  if (a.id === b.id) return 1;
  const wa = noteWeights(a);
  const wb = noteWeights(b);
  let inter = 0;
  let union = 0;
  for (const k of new Set([...wa.keys(), ...wb.keys()])) {
    const x = wa.get(k) ?? 0;
    const y = wb.get(k) ?? 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  const notes = union ? inter / union : 0;
  const family = a.family === b.family ? 1 : 0;
  const seasons = a.seasons.filter((s) => b.seasons.includes(s)).length / 4;
  // Rounded so the result does not depend on the iteration order of the note sets.
  return Math.round(Math.min(1, notes * 0.7 + family * 0.2 + seasons * 0.1) * 1e6) / 1e6;
}

const has = (p, note) => noteWeights(p).has(norm(note));

/**
 * Score a perfume against filters. Every active filter contributes; an empty filter set gives 0.5.
 * filters: { occasion, season, time, families: [], likes: [], dislikes: [] }
 * Returns { score: 0..1, reasons: string[], excluded: boolean }
 */
export function scorePerfume(p, filters = {}, labels = {}) {
  const { occasion, season, time, families = [], likes = [], dislikes = [] } = filters;
  const reasons = [];
  let total = 0;
  let got = 0;

  if (dislikes.some((n) => has(p, n))) return { score: 0, reasons: [], excluded: true };

  const check = (weight, ok, reason) => {
    total += weight;
    if (ok) {
      got += weight;
      if (reason) reasons.push(reason);
    }
  };

  if (occasion) check(3, p.occasions.includes(occasion), labels[occasion] ?? occasion);
  if (season) check(2, p.seasons.includes(season), labels[season] ?? season);
  if (time) check(1, p.time.includes(time), labels[time] ?? time);
  if (families.length) check(2, families.includes(p.family), labels[p.family] ?? p.family);
  if (likes.length) {
    const hits = likes.filter((n) => has(p, n));
    total += 3;
    got += (3 * hits.length) / likes.length;
    if (hits.length) reasons.push(`enthält ${hits.join(", ")}`);
  }

  const score = total ? got / total : 0.5;
  return { score, reasons, excluded: false };
}

/**
 * Rank perfumes. With `similarTo` the similarity to that perfume decides,
 * otherwise the filter score. Ties fall back to name order so results are stable.
 */
export function rank(perfumes, filters = {}, { similarTo = null, labels = {} } = {}) {
  return perfumes
    .filter((p) => !similarTo || p.id !== similarTo.id)
    .map((p) => {
      const base = scorePerfume(p, filters, labels);
      if (base.excluded) return null;
      if (!similarTo) return { perfume: p, ...base };
      const sim = similarity(similarTo, p);
      const hasFilters = Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v));
      const score = hasFilters ? sim * 0.75 + base.score * 0.25 : sim;
      const shared = [...noteWeights(similarTo).keys()].filter((n) => noteWeights(p).has(n));
      const reasons = shared.length
        ? [`teilt ${shared.slice(0, 3).map((n) => n[0].toUpperCase() + n.slice(1)).join(", ")}`, ...base.reasons]
        : base.reasons;
      return { perfume: p, score, reasons };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.perfume.name.localeCompare(b.perfume.name, "de"));
}

/** Days between two ISO dates (yyyy-mm-dd), ignoring time zones. */
export function daysBetween(isoA, isoB) {
  const a = Date.UTC(...isoA.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
  const b = Date.UTC(...isoB.split("-").map((n, i) => (i === 1 ? n - 1 : +n)));
  return Math.round((b - a) / 86400000);
}

export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const WEATHER = {
  warm: { seasons: ["sommer", "fruehling"], maxStrength: 3, families: ["zitrisch", "aquatisch", "aromatisch", "fruchtig"] },
  mild: { seasons: ["fruehling", "herbst"], maxStrength: 4, families: [] },
  kalt: { seasons: ["winter", "herbst"], maxStrength: 5, families: ["ambriert", "gourmand", "ledrig", "holzig", "wuerzig"] },
};

/**
 * Pick from the user's collection for today.
 * collection: [{ id, rating (1..5), lastWorn: 'yyyy-mm-dd' | null }]
 * Returns ranked [{ perfume, score, reasons }] so the UI can offer "anderer Vorschlag".
 */
export function suggestToday(collection, byId, { date = new Date(), occasion = null, weather = null, labels = {} } = {}) {
  const today = isoDate(date);
  const season = seasonForDate(date);
  const w = weather ? WEATHER[weather] : null;

  return collection
    .map((entry) => {
      const p = byId[entry.id];
      if (!p) return null;
      const reasons = [];
      let score = 0;

      if (occasion) {
        if (p.occasions.includes(occasion)) {
          score += 3;
          reasons.push(`passt zu ${labels[occasion] ?? occasion}`);
        } else score -= 1;
      }
      const seasonOk = w ? p.seasons.some((s) => w.seasons.includes(s)) : p.seasons.includes(season);
      if (seasonOk) {
        score += 2;
        reasons.push(w ? `gut bei ${labels[weather] ?? weather}em Wetter` : `passt in den ${labels[season] ?? season}`);
      }
      if (w) {
        if (p.strength > w.maxStrength) score -= 1.5;
        if (w.families.includes(p.family)) score += 1;
      }
      score += ((entry.rating ?? 3) - 3) * 0.6;

      if (entry.lastWorn) {
        const ago = daysBetween(entry.lastWorn, today);
        if (ago <= 0) {
          score -= 4;
          reasons.push("heute schon getragen");
        } else if (ago <= 2) {
          score -= 2;
          reasons.push(`vor ${ago === 1 ? "einem Tag" : `${ago} Tagen`} getragen`);
        } else if (ago >= 10) {
          score += 1;
          reasons.push("länger nicht mehr getragen");
        }
      } else {
        score += 0.5;
      }
      return { perfume: p, score, reasons };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.perfume.name.localeCompare(b.perfume.name, "de"));
}

/** Validate an imported collection file; returns the cleaned list or throws. */
export function parseCollection(text, byId) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.collection;
  if (!Array.isArray(list)) throw new Error("Keine Sammlung in der Datei gefunden.");
  const custom = Array.isArray(data.custom) ? data.custom.filter(isValidCustom) : [];
  const known = { ...byId, ...Object.fromEntries(custom.map((p) => [p.id, p])) };
  const collection = list
    .filter((e) => e && typeof e.id === "string" && known[e.id])
    .map((e) => ({
      id: e.id,
      rating: Number.isInteger(e.rating) && e.rating >= 1 && e.rating <= 5 ? e.rating : 3,
      lastWorn: typeof e.lastWorn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.lastWorn) ? e.lastWorn : null,
    }));
  return { collection, custom };
}

export function isValidCustom(p) {
  return (
    p && typeof p.id === "string" && p.id.startsWith("eigen-") && typeof p.name === "string" && p.name.trim() &&
    Array.isArray(p.top) && Array.isArray(p.heart) && Array.isArray(p.base) &&
    Array.isArray(p.seasons) && Array.isArray(p.occasions) && Array.isArray(p.time)
  );
}
