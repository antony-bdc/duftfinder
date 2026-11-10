import { PERFUMES, BY_ID, FAMILIES } from "./perfumes.js";
import {
  seasonForDate, rank, suggestToday, similarity, isoDate, daysBetween, allNotes, parseCollection, isValidCustom,
} from "./engine.js";
import { bottleSVG, FAMILY_COLORS } from "./bottle.js";

const gsap = window.gsap;
const Flip = window.Flip;
if (gsap && Flip) gsap.registerPlugin(Flip);

const LABELS = {
  alltag: "Alltag", buero: "Büro", date: "Date", abend: "Ausgang", sport: "Sport", anlass: "Besonderer Anlass",
  fruehling: "Frühling", sommer: "Sommer", herbst: "Herbst", winter: "Winter",
  tag: "Tag", nacht: "Abend & Nacht", warm: "warm", mild: "mild", kalt: "kalt",
  ...FAMILIES,
};
const OCCASIONS = [
  ["alltag", "coffee"], ["buero", "briefcase"], ["date", "heart"], ["abend", "moon"], ["sport", "dumbbell"], ["anlass", "sparkles"],
];
const SEASON_ICONS = { fruehling: "leaf", sommer: "sun", herbst: "wind", winter: "snowflake" };
const WEATHER = [["warm", "sun"], ["mild", "cloud-sun"], ["kalt", "snowflake"]];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- storage (per browser; wrapped because it can throw in private modes or when full) ----------
const KEY = "duftfinder:v1";
const PHOTO = (id) => `duftfinder:photo:${id}`;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { collection: [], custom: [] };
    const data = JSON.parse(raw);
    return { collection: data.collection ?? [], custom: (data.custom ?? []).filter(isValidCustom) };
  } catch { return { collection: [], custom: [] }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ collection: state.collection, custom: state.custom })); } catch { /* blocked */ }
}
const photoOf = (id) => { try { return localStorage.getItem(PHOTO(id)); } catch { return null; } };

const state = {
  ...load(),
  view: null,
  filters: { occasion: null, season: seasonForDate(), time: null, families: [], likes: [], dislikes: [] },
  similarTo: null,
  moreOpen: false,
  today: { occasion: null, weather: null, index: 0 },
};

const catalogue = () => [...PERFUMES, ...state.custom];
const byId = () => ({ ...BY_ID, ...Object.fromEntries(state.custom.map((p) => [p.id, p])) });
const owned = (id) => state.collection.some((e) => e.id === id);

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const pct = (x) => `${Math.round(x * 100)}%`;
const tint = (p) => (FAMILY_COLORS[p.family] ?? ["#ccc", "#888"])[0];

function art(p, { animate = true, big = false } = {}) {
  const photo = photoOf(p.id);
  const style = `--tint:${tint(p)}`;
  if (photo) return `<div class="art has-photo${big ? " big" : ""}" style="${style}"><img src="${photo}" alt="Foto von ${esc(p.name)}" loading="lazy"></div>`;
  return `<div class="art${big ? " big" : ""}" style="${style}">${bottleSVG(p, { animate: animate && !reduced })}</div>`;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- navigation ----------
function setView(view, push = true) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== view));
  if (push) history.replaceState(null, "", `#${view}`);
  render({ entrance: true });
  window.scrollTo({ top: 0, behavior: "auto" });
}

function render(opts = {}) {
  if (state.view === "heute") renderToday(opts);
  if (state.view === "finden") renderFind(opts);
  if (state.view === "sammlung") renderCollection(opts);
  $("#count-sammlung").textContent = state.collection.length || "";
}

function entrance(root) {
  if (reduced || !gsap) return;
  gsap.from(root.querySelectorAll("[data-rise]"), { y: 28, opacity: 0, duration: 0.8, ease: "power3.out", stagger: 0.06 });
}

// ---------- shared pieces ----------
function chip({ group, value, label, ico, active, title }) {
  return `<button type="button" class="chip" data-group="${group}" data-value="${esc(value)}" aria-pressed="${active}"${title ? ` title="${esc(title)}"` : ""}>${ico ? icon(ico) : ""}<span>${esc(label)}</span></button>`;
}

function strengthDots(n) {
  return `<span class="dots" aria-label="Stärke ${n} von 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
}

/** How long each layer of the pyramid stays noticeable on skin. Durations scale with strength. */
function drydown(p) {
  const hours = 3 + p.strength * 1.6;
  const rows = [
    ["Kopf", p.top, 0, Math.min(0.75, hours * 0.08)],
    ["Herz", p.heart, 0.15, hours * 0.55],
    ["Basis", p.base, 0.6, hours],
  ];
  const max = 12;
  return `<div class="drydown" role="img" aria-label="Duftverlauf: Kopfnote bis etwa ${Math.round(rows[0][3] * 60)} Minuten, Herznote bis etwa ${Math.round(rows[1][3])} Stunden, Basisnote bis etwa ${Math.round(hours)} Stunden.">
    <div class="dd-scale">${[0, 4, 8, 12].map((h) => `<span style="left:${(h / max) * 100}%">${h} h</span>`).join("")}</div>
    ${rows.map(([name, notes, from, to], i) => `
      <div class="dd-row">
        <span class="dd-label">${name}</span>
        <div class="dd-track"><span class="dd-bar dd-${i}" style="--from:${(from / max) * 100}%;--to:${(Math.min(to, max) / max) * 100}%"></span></div>
        <span class="dd-notes">${notes.map(esc).join(" · ")}</span>
      </div>`).join("")}
  </div>`;
}

function card(r, { showMatch = true } = {}) {
  const p = r.perfume;
  const isOwned = owned(p.id);
  return `<article class="card" data-flip-id="${p.id}" style="--tint:${tint(p)}">
    <button type="button" class="card-open" data-open="${p.id}" aria-label="${esc(p.name)} von ${esc(p.house)} öffnen">
      ${art(p, { animate: false })}
      <span class="card-body">
        <span class="house">${esc(p.house)}</span>
        <span class="name">${esc(p.name)}</span>
        <span class="meta">${esc(LABELS[p.family])} · ${[...p.top, ...p.heart, ...p.base].slice(0, 3).map(esc).join(", ")}</span>
        ${r.reasons?.length ? `<span class="why">${esc(r.reasons.join(" · "))}</span>` : ""}
      </span>
    </button>
    ${showMatch ? `<span class="match" title="Übereinstimmung">${pct(r.score)}</span>` : ""}
    <button type="button" class="add ${isOwned ? "is-on" : ""}" data-toggle-owned="${p.id}" aria-label="${isOwned ? "Aus Sammlung entfernen" : "Zur Sammlung hinzufügen"}" title="${isOwned ? "In deiner Sammlung" : "Zur Sammlung"}">${icon(isOwned ? "check" : "plus")}</button>
  </article>`;
}

// ---------- HEUTE ----------
let particleTl = null;

function renderToday({ entrance: enter = false } = {}) {
  const el = $("#heute");
  const t = state.today;
  const season = seasonForDate();
  const controls = `<div class="controls" data-rise>
      <div class="chips" role="group" aria-label="Anlass">${OCCASIONS.map(([v, i]) => chip({ group: "t-occ", value: v, label: LABELS[v], ico: i, active: t.occasion === v })).join("")}</div>
      <div class="chips" role="group" aria-label="Wetter">${WEATHER.map(([v, i]) => chip({ group: "t-wx", value: v, label: v[0].toUpperCase() + v.slice(1), ico: i, active: t.weather === v })).join("")}</div>
    </div>`;
  particleTl?.kill();

  if (!state.collection.length) {
    const demo = BY_ID["coral-fantasy-uomo"];
    el.innerHTML = `<div class="stage empty-stage">
      <div class="stage-art" data-rise>${art(demo, { big: true })}</div>
      <div class="stage-copy">
        <p class="kicker" data-rise>${new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })} · ${LABELS[season]}</p>
        <h1 data-rise>Welcher Duft<br><em>passt heute?</em></h1>
        <p class="lead" data-rise>Leg die Parfums an, die du besitzt. Danach schlägt dir duftfinder jeden Morgen einen vor, passend zu Anlass, Wetter und dem, was du zuletzt getragen hast.</p>
        <div class="actions" data-rise><button type="button" class="btn" data-goto="finden">${icon("search")} Düfte finden</button></div>
      </div>
    </div>`;
    if (enter) entrance(el);
    return;
  }

  const ranked = suggestToday(state.collection, byId(), { occasion: t.occasion, weather: t.weather, labels: LABELS });
  const pick = ranked[t.index % ranked.length];
  const p = pick.perfume;
  const entry = state.collection.find((e) => e.id === p.id);
  const wornToday = entry.lastWorn === isoDate();

  el.innerHTML = `
    <div class="stage" style="--tint:${tint(p)}">
      <div class="stage-art" data-rise>
        ${art(p, { big: true })}
        <div class="particles" aria-hidden="true"></div>
      </div>
      <div class="stage-copy">
        <p class="kicker" data-rise>${new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })} · ${LABELS[season]}</p>
        <p class="today-label" data-rise>Heute trägst du</p>
        <p class="house" data-rise>${esc(p.house)}</p>
        <h1 class="pick-name" data-rise>${esc(p.name)}</h1>
        ${pick.reasons.length ? `<p class="why" data-rise>${esc(pick.reasons.join(" · "))}</p>` : ""}
        <div data-rise>${drydown(p)}</div>
        <div class="actions" data-rise>
          <button type="button" class="btn" data-wear="${p.id}" ${wornToday ? "disabled" : ""}>${icon("check")} ${wornToday ? "Heute getragen" : "Trage ich heute"}</button>
          ${ranked.length > 1 ? `<button type="button" class="btn ghost" data-next>${icon("shuffle")} Anderer Vorschlag</button>` : ""}
          <button type="button" class="btn ghost" data-open="${p.id}">Details</button>
        </div>
      </div>
    </div>
    ${controls}
    ${ranked.length > 1 ? `<h2 class="sub" data-rise>Auch passend aus deiner Sammlung</h2>
      <div class="grid small">${ranked.filter((r) => r.perfume.id !== p.id).slice(0, 4).map((r) => card(r, { showMatch: false })).join("")}</div>` : ""}`;

  if (enter) entrance(el);
  startParticles(el.querySelector(".particles"), p);
}

/**
 * Notes drift up from the bottle like they leave the skin: top notes rise first and vanish fast,
 * heart notes follow, base notes are slow and stay longest. Same order as the drydown below.
 */
function startParticles(host, p) {
  if (!host || reduced || !gsap) return;
  const layers = [[p.top, 2.6, 0.9], [p.heart, 4.2, 0.75], [p.base, 6.5, 0.6]];
  particleTl = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
  layers.forEach(([notes, dur, op], li) => {
    notes.slice(0, 4).forEach((n, i) => {
      const s = document.createElement("span");
      s.className = `note n${li}`;
      s.textContent = n;
      s.style.left = `${18 + ((i * 23 + li * 11) % 64)}%`;
      host.appendChild(s);
      particleTl.fromTo(s,
        { y: 0, opacity: 0, scale: 0.9 },
        { y: -170 - li * 30, opacity: 0, scale: 1, duration: dur, ease: "sine.out",
          keyframes: { opacity: [0, op, op, 0] } },
        li * 1.4 + i * 0.35);
    });
  });
}

// ---------- FINDEN ----------
function renderFind({ entrance: enter = false, flip = false } = {}) {
  const f = state.filters;
  const notes = allNotes(catalogue());
  const results = rank(catalogue(), f, { similarTo: state.similarTo ? byId()[state.similarTo] : null, labels: LABELS });
  const now = seasonForDate();
  const moreActive = (f.time ? 1 : 0) + f.families.length + f.likes.length + f.dislikes.length + (state.similarTo ? 1 : 0);
  const desktop = matchMedia("(min-width: 901px)").matches;
  const flipState = flip && gsap && Flip && !reduced ? Flip.getState("#find-results .card") : null;

  $("#find-filters").innerHTML = `
    <div class="filter">
      <h3>Anlass</h3>
      <div class="chips">${OCCASIONS.map(([v, i]) => chip({ group: "occasion", value: v, label: LABELS[v], ico: i, active: f.occasion === v })).join("")}</div>
    </div>
    <div class="filter">
      <h3>Jahreszeit</h3>
      <div class="chips">${Object.keys(SEASON_ICONS).map((v) => chip({ group: "season", value: v, label: LABELS[v] + (v === now ? " · jetzt" : ""), ico: SEASON_ICONS[v], active: f.season === v })).join("")}</div>
    </div>
    <details class="more" ${desktop || state.moreOpen ? "open" : ""}>
      <summary>${icon("plus")} Weitere Filter${moreActive ? ` <span class="badge">${moreActive}</span>` : ""}</summary>
      <div class="filter">
        <h3>Tageszeit</h3>
        <div class="chips">${chip({ group: "time", value: "tag", label: "Tag", ico: "sun", active: f.time === "tag" })}${chip({ group: "time", value: "nacht", label: "Abend & Nacht", ico: "moon", active: f.time === "nacht" })}</div>
      </div>
      <div class="filter">
        <h3>Duftfamilie</h3>
        <div class="chips">${Object.keys(FAMILIES).map((v) => `<button type="button" class="chip fam" data-group="families" data-value="${v}" aria-pressed="${f.families.includes(v)}" style="--tint:${FAMILY_COLORS[v][0]}"><i class="swatch"></i><span>${LABELS[v]}</span></button>`).join("")}</div>
      </div>
      <div class="filter">
        <h3><label for="note-input">Noten</label></h3>
        <div class="note-field">
          ${icon("search")}
          <input id="note-input" list="note-list" placeholder="z. B. Vanille, Tabak, Zitrone" autocomplete="off" enterkeyhint="done">
          <datalist id="note-list">${notes.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        </div>
        <div class="note-actions"><button type="button" class="link" data-note="like">${icon("heart")} mag ich</button><button type="button" class="link" data-note="dislike">${icon("x")} mag ich nicht</button></div>
        <div class="chips">${f.likes.map((n) => chip({ group: "likes", value: n, label: n, ico: "heart", active: true, title: "Entfernen" })).join("")}${f.dislikes.map((n) => chip({ group: "dislikes", value: n, label: n, ico: "x", active: true, title: "Entfernen" })).join("")}</div>
      </div>
      <div class="filter">
        <h3><label for="similar">Ähnlich wie</label></h3>
        <select id="similar">
          <option value="">Kein Vergleich</option>
          ${catalogue().slice().sort((a, b) => a.name.localeCompare(b.name, "de")).map((p) => `<option value="${p.id}" ${state.similarTo === p.id ? "selected" : ""}>${esc(p.name)} · ${esc(p.house)}</option>`).join("")}
        </select>
      </div>
    </details>
    <button type="button" class="link reset" data-reset>Filter zurücksetzen</button>`;

  const active = [f.occasion, f.season, f.time, f.families.length, f.likes.length].filter(Boolean).length;
  const informative = Boolean(state.similarTo) || f.likes.length > 0 || active >= 2;
  $("#find-results").innerHTML = `
    <p class="result-head">${state.similarTo ? `Am nächsten an <strong>${esc(byId()[state.similarTo].name)}</strong>` : `<strong>${results.length}</strong> Düfte, beste Treffer zuerst`}</p>
    <div class="grid">${results.slice(0, 36).map((r) => card(r, { showMatch: informative })).join("") || `<p class="empty">Keine Treffer. Lockere einen Filter.</p>`}</div>`;

  if (flipState) {
    Flip.from(flipState, {
      targets: "#find-results .card", duration: 0.55, ease: "power2.inOut", absolute: false, simple: true,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.45, ease: "power2.out" }),
      onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.2 }),
    });
  } else if (enter && gsap && !reduced) {
    gsap.from("#find-results .card", { y: 24, opacity: 0, duration: 0.7, ease: "power3.out", stagger: { each: 0.035, from: "start" } });
    entrance($("#finden"));
  }
}

function addNote(kind) {
  const input = $("#note-input");
  const value = input.value.trim();
  if (!value) return input.focus();
  const match = allNotes(catalogue()).find((n) => n.toLowerCase() === value.toLowerCase());
  if (!match) return toast(`«${value}» kommt in keinem Duft vor`);
  const f = state.filters;
  f.likes = f.likes.filter((n) => n !== match);
  f.dislikes = f.dislikes.filter((n) => n !== match);
  (kind === "like" ? f.likes : f.dislikes).push(match);
  renderFind({ flip: true });
  $("#note-input").focus();
}

// ---------- SAMMLUNG ----------
function renderCollection({ entrance: enter = false } = {}) {
  const el = $("#sammlung");
  const items = state.collection.map((e) => ({ e, p: byId()[e.id] })).filter((x) => x.p);
  const today = isoDate();
  el.innerHTML = `<header class="view-head">
      <p class="kicker" data-rise>${items.length ? `${items.length} ${items.length === 1 ? "Duft" : "Düfte"}` : "Noch leer"}</p>
      <h1 data-rise>Meine Sammlung</h1>
    </header>
    ${items.length ? `<div class="grid coll">${items.map(({ e, p }) => {
      const worn = e.lastWorn ? (e.lastWorn === today ? "heute getragen" : `zuletzt vor ${daysBetween(e.lastWorn, today)} ${daysBetween(e.lastWorn, today) === 1 ? "Tag" : "Tagen"}`) : "noch nie getragen";
      return `<article class="card" data-flip-id="${p.id}" style="--tint:${tint(p)}">
        <button type="button" class="card-open" data-open="${p.id}">
          ${art(p, { animate: false })}
          <span class="card-body">
            <span class="house">${esc(p.house)}</span>
            <span class="name">${esc(p.name)}</span>
            <span class="meta">${worn}</span>
          </span>
        </button>
        <div class="card-foot">
          <span class="stars" role="radiogroup" aria-label="Bewertung">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${e.rating === n}" aria-label="${n} von 5" data-rate="${p.id}" data-value="${n}" class="${n <= e.rating ? "on" : ""}">${icon("star")}</button>`).join("")}</span>
          <span class="card-tools">
            <label class="tool" title="${photoOf(p.id) ? "Foto ersetzen" : "Foto deiner Flasche"}">${icon("camera")}<input type="file" accept="image/*" capture="environment" data-photo="${p.id}" hidden></label>
            <button type="button" class="tool" data-toggle-owned="${p.id}" aria-label="Entfernen" title="Entfernen">${icon("trash-2")}</button>
          </span>
        </div>
      </article>`;
    }).join("")}</div>`
    : `<div class="empty" data-rise><p>Füge Düfte über «Finden» hinzu oder erfasse einen eigenen, der nicht in der Liste ist.</p><button type="button" class="btn" data-goto="finden">${icon("search")} Düfte finden</button></div>`}

    <details class="add-own" data-rise>
      <summary>${icon("plus")} Eigenen Duft erfassen</summary>
      <form id="own-form" class="own-form">
        <label>Name<input name="name" required maxlength="80" autocomplete="off"></label>
        <label>Marke<input name="house" maxlength="60" autocomplete="off"></label>
        <label>Duftfamilie<select name="family">${Object.entries(FAMILIES).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label>Kopfnoten<input name="top" placeholder="durch Komma getrennt" autocomplete="off"></label>
        <label>Herznoten<input name="heart" autocomplete="off"></label>
        <label>Basisnoten<input name="base" autocomplete="off"></label>
        <fieldset><legend>Jahreszeiten</legend>${Object.keys(SEASON_ICONS).map((s) => `<label class="check"><input type="checkbox" name="seasons" value="${s}" checked>${LABELS[s]}</label>`).join("")}</fieldset>
        <fieldset><legend>Anlässe</legend>${OCCASIONS.map(([o]) => `<label class="check"><input type="checkbox" name="occasions" value="${o}" ${o === "alltag" ? "checked" : ""}>${LABELS[o]}</label>`).join("")}</fieldset>
        <label>Stärke<input type="range" name="strength" min="1" max="5" value="3"></label>
        <button class="btn" type="submit">${icon("plus")} Hinzufügen</button>
      </form>
    </details>

    <div class="io" data-rise>
      <button type="button" class="link" data-export>${icon("download")} Sammlung exportieren</button>
      <label class="link">${icon("upload")} Importieren<input type="file" accept="application/json" data-import hidden></label>
    </div>`;
  if (enter) {
    entrance(el);
    if (gsap && !reduced) gsap.from(el.querySelectorAll(".card"), { y: 24, opacity: 0, duration: 0.7, ease: "power3.out", stagger: 0.05 });
  }
}

function addOwn(form) {
  const d = new FormData(form);
  const list = (k) => String(d.get(k) || "").split(",").map((s) => s.trim()).filter(Boolean);
  const top = list("top"), heart = list("heart"), base = list("base");
  if (!top.length && !heart.length && !base.length) return toast("Mindestens eine Note angeben");
  const p = {
    id: `eigen-${Date.now().toString(36)}`,
    name: String(d.get("name")).trim(),
    house: String(d.get("house") || "Eigener Eintrag").trim(),
    year: null,
    family: String(d.get("family")),
    top: top.length ? top : heart.length ? heart : base,
    heart: heart.length ? heart : top.length ? top : base,
    base: base.length ? base : heart.length ? heart : top,
    seasons: d.getAll("seasons").map(String),
    occasions: d.getAll("occasions").map(String),
    time: ["tag", "nacht"],
    strength: Number(d.get("strength")) || 3,
  };
  if (!p.seasons.length) p.seasons = ["fruehling", "sommer", "herbst", "winter"];
  if (!p.occasions.length) p.occasions = ["alltag"];
  state.custom.push(p);
  state.collection.push({ id: p.id, rating: 3, lastWorn: null });
  save();
  toast(`${p.name} hinzugefügt`);
  render();
}

/** Downscale a photo to max 720px and keep it as JPEG in localStorage. */
async function storePhoto(id, file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 720 / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.82);
  try {
    localStorage.setItem(PHOTO(id), url);
    toast("Foto gespeichert");
  } catch {
    toast("Speicher voll. Entferne ein anderes Foto.");
  }
}

// ---------- detail ----------
function openDetail(id) {
  const p = byId()[id];
  if (!p) return;
  const similar = catalogue().filter((x) => x.id !== p.id).map((x) => ({ perfume: x, score: similarity(p, x), reasons: [] }))
    .sort((a, b) => b.score - a.score).slice(0, 4);
  const dlg = $("#detail");
  $("#detail-body").innerHTML = `
    <div class="detail-top" style="--tint:${tint(p)}">
      <div class="detail-art">${art(p, { big: true })}</div>
      <div>
        <p class="house">${esc(p.house)}${p.year ? ` · ${p.year}` : ""}</p>
        <h2 id="detail-title">${esc(p.name)}</h2>
        <p class="facts"><span class="fam-tag"><i class="swatch"></i>${esc(LABELS[p.family])}</span> ${strengthDots(p.strength)}</p>
        <dl class="tags">
          <div><dt>Jahreszeit</dt><dd>${p.seasons.map((s) => LABELS[s]).join(", ")}</dd></div>
          <div><dt>Anlass</dt><dd>${p.occasions.map((o) => LABELS[o]).join(", ")}</dd></div>
          <div><dt>Tageszeit</dt><dd>${p.time.map((t) => LABELS[t]).join(", ")}</dd></div>
        </dl>
        <div class="actions">
          <button type="button" class="btn" data-toggle-owned="${p.id}">${icon(owned(p.id) ? "check" : "plus")} ${owned(p.id) ? "In deiner Sammlung" : "Zur Sammlung"}</button>
          <button type="button" class="btn ghost" data-similar="${p.id}">${icon("compass")} Ähnliche finden</button>
        </div>
      </div>
    </div>
    ${drydown(p)}
    <h3 class="sub">Am ähnlichsten</h3>
    <div class="grid small">${similar.map((r) => card(r, { showMatch: false })).join("")}</div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

// ---------- events ----------
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button, [data-goto]");
  if (!t) return;
  const d = t.dataset;

  if (d.view) return setView(d.view);
  if (d.goto) { if ($("#detail").open) $("#detail").close(); return setView(d.goto); }
  if (d.open) return openDetail(d.open);
  if (d.close !== undefined) return $("#detail").close();

  if (d.group) {
    const f = state.filters;
    const v = d.value;
    if (d.group === "t-occ") { state.today.occasion = state.today.occasion === v ? null : v; state.today.index = 0; return renderToday(); }
    if (d.group === "t-wx") { state.today.weather = state.today.weather === v ? null : v; state.today.index = 0; return renderToday(); }
    if (d.group === "families") f.families = f.families.includes(v) ? f.families.filter((x) => x !== v) : [...f.families, v];
    else if (d.group === "likes") f.likes = f.likes.filter((x) => x !== v);
    else if (d.group === "dislikes") f.dislikes = f.dislikes.filter((x) => x !== v);
    else f[d.group] = f[d.group] === v ? null : v;
    return renderFind({ flip: true });
  }
  if (d.note) return addNote(d.note);
  if (d.reset !== undefined) {
    state.filters = { occasion: null, season: null, time: null, families: [], likes: [], dislikes: [] };
    state.similarTo = null;
    return renderFind({ flip: true });
  }
  if (d.toggleOwned) {
    const id = d.toggleOwned;
    const p = byId()[id];
    if (owned(id)) {
      state.collection = state.collection.filter((e) => e.id !== id);
      toast(`${p.name} entfernt`);
    } else {
      state.collection.push({ id, rating: 3, lastWorn: null });
      toast(`${p.name} ist in deiner Sammlung`);
      if (gsap && !reduced) gsap.fromTo(t, { scale: 0.6 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    }
    save();
    const detailId = $("#detail").open ? $("#detail-body [data-toggle-owned]")?.dataset.toggleOwned : null;
    render();
    if (detailId) openDetail(detailId);
    return;
  }
  if (d.similar) {
    state.similarTo = d.similar;
    $("#detail").close();
    return setView("finden");
  }
  if (d.rate) {
    const e = state.collection.find((x) => x.id === d.rate);
    e.rating = Number(d.value);
    save();
    return renderCollection();
  }
  if (d.wear) {
    const e = state.collection.find((x) => x.id === d.wear);
    e.lastWorn = isoDate();
    save();
    toast("Eingetragen. Viel Spass damit.");
    return renderToday();
  }
  if (d.next !== undefined) {
    state.today.index += 1;
    const stage = $("#heute .stage");
    if (gsap && !reduced && stage) {
      return gsap.to(stage, { opacity: 0, y: -12, duration: 0.25, ease: "power2.in", onComplete: () => { renderToday(); gsap.from("#heute .stage", { opacity: 0, y: 16, duration: 0.5, ease: "power3.out" }); } });
    }
    return renderToday();
  }
  if (d.export !== undefined) {
    const blob = new Blob([JSON.stringify({ app: "duftfinder", version: 1, collection: state.collection, custom: state.custom }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `duftfinder-sammlung-${isoDate()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }
});

document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.id === "similar") { state.similarTo = t.value || null; return renderFind({ flip: true }); }
  if (t.matches("[data-photo]") && t.files[0]) {
    await storePhoto(t.dataset.photo, t.files[0]);
    return render();
  }
  if (t.matches("[data-import]") && t.files[0]) {
    try {
      const { collection, custom } = parseCollection(await t.files[0].text(), BY_ID);
      state.collection = collection;
      state.custom = custom;
      save();
      toast(`${collection.length} Düfte importiert`);
      render();
    } catch (err) { toast(err.message.startsWith("Keine") ? err.message : "Die Datei konnte nicht gelesen werden"); }
  }
});

document.addEventListener("toggle", (ev) => { if (ev.target.matches?.(".more")) state.moreOpen = ev.target.open; }, true);
document.addEventListener("keydown", (ev) => {
  if (ev.target.id === "note-input" && ev.key === "Enter") { ev.preventDefault(); addNote("like"); }
});
document.addEventListener("submit", (ev) => {
  if (ev.target.id === "own-form") { ev.preventDefault(); addOwn(ev.target); }
});
$("#detail").addEventListener("click", (ev) => { if (ev.target.id === "detail") $("#detail").close(); });

// ---------- start ----------
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
const initial = location.hash.slice(1);
setView(["heute", "finden", "sammlung"].includes(initial) ? initial : "heute", false);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});
