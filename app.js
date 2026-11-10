import { PERFUMES, BY_ID, FAMILIES } from "./perfumes.js";
import {
  seasonForDate, rank, suggestToday, similarity, isoDate, daysBetween, allNotes, parseCollection, isValidCustom,
} from "./engine.js";

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

// ---------- storage (per browser; wrapped because it can throw in private modes) ----------
const KEY = "duftfinder:v1";
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { collection: [], custom: [] };
    const data = JSON.parse(raw);
    return { collection: data.collection ?? [], custom: (data.custom ?? []).filter(isValidCustom) };
  } catch { return { collection: [], custom: [] }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ collection: state.collection, custom: state.custom })); } catch { /* storage full or blocked */ }
}

const state = {
  ...load(),
  view: null,
  filters: { occasion: null, season: seasonForDate(), time: null, families: [], likes: [], dislikes: [] },
  similarTo: null,
  today: { occasion: null, weather: null, index: 0 },
};

const catalogue = () => [...PERFUMES, ...state.custom];
const byId = () => ({ ...BY_ID, ...Object.fromEntries(state.custom.map((p) => [p.id, p])) });
const owned = (id) => state.collection.some((e) => e.id === id);

// ---------- tiny helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const icon = (name, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const pct = (x) => `${Math.round(x * 100)}%`;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- navigation ----------
function setView(view, push = true) {
  state.view = view;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== view));
  if (push) history.replaceState(null, "", `#${view}`);
  render();
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

function render() {
  if (state.view === "heute") renderToday();
  if (state.view === "finden") renderFind();
  if (state.view === "sammlung") renderCollection();
  $("#count-sammlung").textContent = state.collection.length || "";
}

// ---------- shared pieces ----------
function chip({ group, value, label, ico, active, title }) {
  return `<button type="button" class="chip" data-group="${group}" data-value="${esc(value)}" aria-pressed="${active}"${title ? ` title="${esc(title)}"` : ""}>${ico ? icon(ico) : ""}<span>${esc(label)}</span></button>`;
}

function strengthDots(n) {
  return `<span class="dots" aria-label="Stärke ${n} von 5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
}

/** Drydown over a day: how long each layer of the pyramid stays noticeable. Durations scale with strength. */
function drydown(p) {
  const hours = 3 + p.strength * 1.6; // rough total wear time
  const rows = [
    ["Kopf", p.top, 0, Math.min(0.75, hours * 0.08)],
    ["Herz", p.heart, 0.15, hours * 0.55],
    ["Basis", p.base, 0.6, hours],
  ];
  const max = 12;
  return `<div class="drydown" role="img" aria-label="Duftverlauf: Kopfnote bis etwa ${Math.round(rows[0][3] * 60)} Minuten, Herznote bis etwa ${Math.round(rows[1][3])} Stunden, Basisnote bis etwa ${Math.round(hours)} Stunden.">
    <div class="dd-scale">${[0, 2, 4, 6, 8, 10, 12].map((h) => `<span style="left:${(h / max) * 100}%">${h} h</span>`).join("")}</div>
    ${rows.map(([name, notes, from, to], i) => `
      <div class="dd-row">
        <span class="dd-label">${name}</span>
        <div class="dd-track"><span class="dd-bar dd-${i}" style="--from:${(from / max) * 100}%;--to:${(Math.min(to, max) / max) * 100}%"></span></div>
        <span class="dd-notes">${notes.map(esc).join(" · ")}</span>
      </div>`).join("")}
  </div>`;
}

function perfumeRow(r, { compact = false, showMatch = true } = {}) {
  const p = r.perfume;
  const isOwned = owned(p.id);
  return `<article class="row" data-id="${p.id}">
    <button type="button" class="row-main" data-open="${p.id}" aria-label="${esc(p.name)} von ${esc(p.house)} öffnen">
      <span class="house">${esc(p.house)}</span>
      <span class="name">${esc(p.name)}</span>
      <span class="meta">${esc(LABELS[p.family])} · ${[...p.top, ...p.heart, ...p.base].slice(0, 4).map(esc).join(", ")}</span>
      ${r.reasons?.length ? `<span class="why">${esc(r.reasons.join(" · "))}</span>` : ""}
    </button>
    ${compact ? "" : `<div class="row-side">
      ${showMatch ? `<span class="match" title="Übereinstimmung"><span class="bar"><i style="width:${pct(r.score)}"></i></span>${pct(r.score)}</span>` : ""}
      <button type="button" class="icon-btn ${isOwned ? "is-on" : ""}" data-toggle-owned="${p.id}" aria-label="${isOwned ? "Aus Sammlung entfernen" : "Zur Sammlung hinzufügen"}" title="${isOwned ? "In deiner Sammlung" : "Zur Sammlung"}">${icon(isOwned ? "check" : "plus")}</button>
    </div>`}
  </article>`;
}

// ---------- HEUTE ----------
function renderToday() {
  const el = $("#heute");
  const t = state.today;
  const season = seasonForDate();
  const head = `<header class="view-head">
      <p class="kicker">${new Date().toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" })} · ${LABELS[season]}</p>
      <h1>Was trage ich heute?</h1>
    </header>
    <div class="controls">
      <div class="chips" role="group" aria-label="Anlass">${OCCASIONS.map(([v, i]) => chip({ group: "t-occ", value: v, label: LABELS[v], ico: i, active: t.occasion === v })).join("")}</div>
      <div class="chips" role="group" aria-label="Wetter">${WEATHER.map(([v, i]) => chip({ group: "t-wx", value: v, label: v[0].toUpperCase() + v.slice(1), ico: i, active: t.weather === v })).join("")}</div>
    </div>`;

  if (!state.collection.length) {
    el.innerHTML = `${head}<div class="empty">
      <p>Deine Sammlung ist noch leer. Füge die Düfte hinzu, die du besitzt, dann schlage ich dir jeden Tag einen passenden vor.</p>
      <button type="button" class="btn" data-goto="finden">${icon("search")} Düfte finden</button>
    </div>`;
    return;
  }

  const ranked = suggestToday(state.collection, byId(), { occasion: t.occasion, weather: t.weather, labels: LABELS });
  const pick = ranked[t.index % ranked.length];
  const p = pick.perfume;
  const entry = state.collection.find((e) => e.id === p.id);
  const wornToday = entry.lastWorn === isoDate();

  el.innerHTML = `${head}
    <article class="pick" data-id="${p.id}">
      <p class="house">${esc(p.house)}</p>
      <h2 class="pick-name">${esc(p.name)}</h2>
      ${pick.reasons.length ? `<p class="why">${esc(pick.reasons.join(" · "))}</p>` : ""}
      ${drydown(p)}
      <div class="pick-actions">
        <button type="button" class="btn" data-wear="${p.id}" ${wornToday ? "disabled" : ""}>${icon("check")} ${wornToday ? "Heute getragen" : "Trage ich heute"}</button>
        ${ranked.length > 1 ? `<button type="button" class="btn ghost" data-next>${icon("shuffle")} Anderer Vorschlag</button>` : ""}
        <button type="button" class="btn ghost" data-open="${p.id}">Details</button>
      </div>
    </article>
    ${ranked.length > 1 ? `<h3 class="sub">Auch passend</h3><div class="list">${ranked.filter((r) => r.perfume.id !== p.id).slice(0, 3).map((r) => perfumeRow(r, { compact: true })).join("")}</div>` : ""}`;

  if (!reduced) el.querySelector(".pick").animate(
    [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
    { duration: 520, easing: "cubic-bezier(.2,.7,.2,1)" },
  );
}

// ---------- FINDEN ----------
function renderFind() {
  const f = state.filters;
  const notes = allNotes(catalogue());
  const results = rank(catalogue(), f, { similarTo: state.similarTo ? byId()[state.similarTo] : null, labels: LABELS });
  const now = seasonForDate();
  const moreActive = (f.time ? 1 : 0) + f.families.length + f.likes.length + f.dislikes.length + (state.similarTo ? 1 : 0);

  $("#find-filters").innerHTML = `
    <div class="filter">
      <h3>Anlass</h3>
      <div class="chips">${OCCASIONS.map(([v, i]) => chip({ group: "occasion", value: v, label: LABELS[v], ico: i, active: f.occasion === v })).join("")}</div>
    </div>
    <div class="filter">
      <h3>Jahreszeit</h3>
      <div class="chips">${Object.keys(SEASON_ICONS).map((v) => chip({ group: "season", value: v, label: LABELS[v] + (v === now ? " · jetzt" : ""), ico: SEASON_ICONS[v], active: f.season === v })).join("")}</div>
    </div>
    <details class="more" ${matchMedia("(min-width: 861px)").matches || state.moreOpen ? "open" : ""}>
    <summary>${icon("plus")} Weitere Filter${moreActive ? ` <span class="badge">${moreActive}</span>` : ""}</summary>
    <div class="filter">
      <h3>Tageszeit</h3>
      <div class="chips">${chip({ group: "time", value: "tag", label: "Tag", ico: "sun", active: f.time === "tag" })}${chip({ group: "time", value: "nacht", label: "Abend & Nacht", ico: "moon", active: f.time === "nacht" })}</div>
    </div>
    <div class="filter">
      <h3>Duftfamilie</h3>
      <div class="chips">${Object.keys(FAMILIES).map((v) => chip({ group: "families", value: v, label: LABELS[v], active: f.families.includes(v) })).join("")}</div>
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

  // A percentage only helps when it can differ between results.
  const active = [f.occasion, f.season, f.time, f.families.length, f.likes.length].filter(Boolean).length;
  const informative = Boolean(state.similarTo) || f.likes.length > 0 || active >= 2;
  $("#find-results").innerHTML = `
    <p class="result-head">${state.similarTo ? `Am nächsten an <strong>${esc(byId()[state.similarTo].name)}</strong>` : `${results.length} Düfte, beste Treffer zuerst`}</p>
    <div class="list">${results.slice(0, 40).map((r) => perfumeRow(r, { showMatch: informative })).join("") || `<p class="empty">Keine Treffer. Lockere einen Filter.</p>`}</div>`;
}

function addNote(kind) {
  const input = $("#note-input");
  const value = input.value.trim();
  if (!value) return input.focus();
  const notes = allNotes(catalogue());
  const match = notes.find((n) => n.toLowerCase() === value.toLowerCase());
  if (!match) return toast(`«${value}» kommt in keinem Duft vor`);
  const f = state.filters;
  f.likes = f.likes.filter((n) => n !== match);
  f.dislikes = f.dislikes.filter((n) => n !== match);
  (kind === "like" ? f.likes : f.dislikes).push(match);
  renderFind();
  $("#note-input").focus();
}

// ---------- SAMMLUNG ----------
function renderCollection() {
  const el = $("#sammlung");
  const items = state.collection.map((e) => ({ e, p: byId()[e.id] })).filter((x) => x.p);
  const today = isoDate();
  el.innerHTML = `<header class="view-head">
      <p class="kicker">${items.length ? `${items.length} ${items.length === 1 ? "Duft" : "Düfte"}` : "Noch leer"}</p>
      <h1>Meine Sammlung</h1>
    </header>
    ${items.length ? `<div class="list">${items.map(({ e, p }) => `
      <article class="row coll" data-id="${p.id}">
        <button type="button" class="row-main" data-open="${p.id}">
          <span class="house">${esc(p.house)}</span>
          <span class="name">${esc(p.name)}</span>
          <span class="meta">${e.lastWorn ? (e.lastWorn === today ? "heute getragen" : `zuletzt vor ${daysBetween(e.lastWorn, today)} ${daysBetween(e.lastWorn, today) === 1 ? "Tag" : "Tagen"}`) : "noch nie getragen"}</span>
        </button>
        <div class="row-side">
          <span class="stars" role="radiogroup" aria-label="Bewertung">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${e.rating === n}" aria-label="${n} von 5" data-rate="${p.id}" data-value="${n}" class="${n <= e.rating ? "on" : ""}">${icon("star")}</button>`).join("")}</span>
          <button type="button" class="icon-btn" data-toggle-owned="${p.id}" aria-label="Entfernen" title="Entfernen">${icon("trash-2")}</button>
        </div>
      </article>`).join("")}</div>`
    : `<div class="empty"><p>Füge Düfte über «Finden» hinzu oder erfasse einen eigenen, der nicht in der Liste ist.</p><button type="button" class="btn" data-goto="finden">${icon("search")} Düfte finden</button></div>`}

    <details class="add-own">
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

    <div class="io">
      <button type="button" class="link" data-export>${icon("download")} Sammlung exportieren</button>
      <label class="link">${icon("upload")} Importieren<input type="file" accept="application/json" data-import hidden></label>
    </div>`;
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

// ---------- detail sheet ----------
function openDetail(id) {
  const p = byId()[id];
  if (!p) return;
  const similar = catalogue().filter((x) => x.id !== p.id).map((x) => ({ perfume: x, score: similarity(p, x), reasons: [] }))
    .sort((a, b) => b.score - a.score).slice(0, 4);
  const dlg = $("#detail");
  $("#detail-body").innerHTML = `
    <p class="house">${esc(p.house)}${p.year ? ` · ${p.year}` : ""}</p>
    <h2 id="detail-title">${esc(p.name)}</h2>
    <p class="facts">${esc(LABELS[p.family])} · ${strengthDots(p.strength)}</p>
    ${drydown(p)}
    <dl class="tags">
      <div><dt>Jahreszeit</dt><dd>${p.seasons.map((s) => LABELS[s]).join(", ")}</dd></div>
      <div><dt>Anlass</dt><dd>${p.occasions.map((o) => LABELS[o]).join(", ")}</dd></div>
      <div><dt>Tageszeit</dt><dd>${p.time.map((t) => LABELS[t]).join(", ")}</dd></div>
    </dl>
    <div class="pick-actions">
      <button type="button" class="btn" data-toggle-owned="${p.id}">${icon(owned(p.id) ? "check" : "plus")} ${owned(p.id) ? "In deiner Sammlung" : "Zur Sammlung"}</button>
      <button type="button" class="btn ghost" data-similar="${p.id}">${icon("compass")} Ähnliche finden</button>
    </div>
    <h3 class="sub">Am ähnlichsten</h3>
    <div class="list">${similar.map((r) => perfumeRow(r, { compact: true })).join("")}</div>`;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
}

// ---------- events ----------
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button, [data-goto]");
  if (!t) return;
  const d = t.dataset;

  if (d.view) return setView(d.view);
  if (d.goto) { $("#detail").open && $("#detail").close(); return setView(d.goto); }
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
    return renderFind();
  }
  if (d.note) return addNote(d.note);
  if (d.reset !== undefined) {
    state.filters = { occasion: null, season: null, time: null, families: [], likes: [], dislikes: [] };
    state.similarTo = null;
    return renderFind();
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
    }
    save();
    render();
    if ($("#detail").open) openDetail($("#detail-body .btn[data-toggle-owned]")?.dataset.toggleOwned ?? id);
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
  if (d.next !== undefined) { state.today.index += 1; return renderToday(); }
  if (d.export !== undefined) {
    const blob = new Blob([JSON.stringify({ app: "duftfinder", version: 1, collection: state.collection, custom: state.custom }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `duftfinder-sammlung-${isoDate()}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  }
});

document.addEventListener("change", async (ev) => {
  const t = ev.target;
  if (t.id === "similar") { state.similarTo = t.value || null; return renderFind(); }
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

document.addEventListener("toggle", (ev) => {
  if (ev.target.matches?.(".more")) state.moreOpen = ev.target.open;
}, true);

document.addEventListener("keydown", (ev) => {
  if (ev.target.id === "note-input" && ev.key === "Enter") { ev.preventDefault(); addNote("like"); }
});

document.addEventListener("submit", (ev) => {
  if (ev.target.id === "own-form") { ev.preventDefault(); addOwn(ev.target); }
});

$("#detail").addEventListener("click", (ev) => { if (ev.target.id === "detail") $("#detail").close(); });

// ---------- start ----------
const initial = location.hash.slice(1);
setView(["heute", "finden", "sammlung"].includes(initial) ? initial : state.collection.length ? "heute" : "finden", false);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("./sw.js").catch(() => {});
