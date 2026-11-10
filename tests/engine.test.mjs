import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seasonForDate, similarity, scorePerfume, rank, suggestToday, daysBetween, isoDate, parseCollection, allNotes,
} from "../engine.js";
import { PERFUMES, BY_ID, FAMILIES } from "../perfumes.js";

test("data: ids are unique and every field is valid", () => {
  const ids = new Set();
  for (const p of PERFUMES) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(FAMILIES[p.family], `${p.id}: unknown family ${p.family}`);
    assert.ok(p.top.length && p.heart.length && p.base.length, `${p.id}: empty pyramid`);
    assert.ok(p.seasons.every((s) => ["fruehling", "sommer", "herbst", "winter"].includes(s)), p.id);
    assert.ok(p.occasions.every((o) => ["alltag", "buero", "date", "abend", "sport", "anlass"].includes(o)), p.id);
    assert.ok(p.time.length && p.time.every((t) => ["tag", "nacht"].includes(t)), p.id);
    assert.ok(p.strength >= 1 && p.strength <= 5, p.id);
  }
});

test("seasonForDate follows meteorological seasons", () => {
  assert.equal(seasonForDate(new Date(2026, 0, 15)), "winter");
  assert.equal(seasonForDate(new Date(2026, 2, 1)), "fruehling");
  assert.equal(seasonForDate(new Date(2026, 6, 20)), "sommer");
  assert.equal(seasonForDate(new Date(2026, 10, 10)), "herbst");
  assert.equal(seasonForDate(new Date(2026, 11, 1)), "winter");
});

test("similarity is symmetric, 1 for itself and higher for close relatives", () => {
  const a = BY_ID["aventus"], b = BY_ID["cdnim"], c = BY_ID["cool-water"];
  assert.equal(similarity(a, a), 1);
  assert.equal(similarity(a, b), similarity(b, a));
  assert.ok(similarity(a, b) > similarity(a, c), "Club de Nuit should be closer to Aventus than Cool Water");
  assert.ok(similarity(BY_ID["sauvage-edt"], BY_ID["sauvage-elixir"]) > similarity(BY_ID["sauvage-edt"], BY_ID["colonia"]));
});

test("scorePerfume: disliked notes exclude, matching filters raise the score", () => {
  const p = BY_ID["tobacco-vanille"];
  assert.equal(scorePerfume(p, { dislikes: ["vanille"] }).excluded, true);
  const winter = scorePerfume(p, { season: "winter", occasion: "abend" });
  const summer = scorePerfume(p, { season: "sommer", occasion: "sport" });
  assert.equal(winter.score, 1);
  assert.equal(summer.score, 0);
  assert.equal(scorePerfume(p, {}).score, 0.5);
});

test("scorePerfume: liked notes count partially", () => {
  const r = scorePerfume(BY_ID["coral-fantasy-uomo"], { likes: ["Tabak", "Vanille"] });
  assert.equal(r.score, 0.5);
  assert.deepEqual(r.reasons, ["enthält Tabak"]);
});

test("rank with similarTo excludes the reference and explains shared notes", () => {
  const res = rank(PERFUMES, {}, { similarTo: BY_ID["aventus"] });
  assert.ok(res.every((r) => r.perfume.id !== "aventus"));
  assert.equal(res[0].perfume.id, "cdnim");
  assert.match(res[0].reasons[0], /^teilt /);
});

test("rank is stable and sorted by score", () => {
  const res = rank(PERFUMES, { season: "sommer", occasion: "sport" });
  for (let i = 1; i < res.length; i++) assert.ok(res[i - 1].score >= res[i].score);
  assert.ok(res[0].score > 0.9);
});

test("daysBetween and isoDate", () => {
  assert.equal(daysBetween("2026-11-08", "2026-11-10"), 2);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(isoDate(new Date(2026, 0, 5)), "2026-01-05");
});

test("suggestToday avoids what was worn today and follows the weather", () => {
  const date = new Date(2026, 6, 15); // summer
  const collection = [
    { id: "adg-edt", rating: 4, lastWorn: "2026-07-15" },
    { id: "light-blue-homme", rating: 4, lastWorn: null },
    { id: "tobacco-vanille", rating: 5, lastWorn: null },
  ];
  const res = suggestToday(collection, BY_ID, { date, weather: "warm" });
  assert.equal(res[0].perfume.id, "light-blue-homme");
  assert.equal(res.at(-1).perfume.id === "tobacco-vanille" || res.at(-1).perfume.id === "adg-edt", true);
  assert.ok(res.find((r) => r.perfume.id === "adg-edt").reasons.includes("heute schon getragen"));
});

test("suggestToday prefers the occasion", () => {
  const date = new Date(2026, 10, 10);
  const collection = [{ id: "sauvage-edt", rating: 3 }, { id: "angels-share", rating: 3 }];
  assert.equal(suggestToday(collection, BY_ID, { date, occasion: "sport" })[0].perfume.id, "sauvage-edt");
  assert.equal(suggestToday(collection, BY_ID, { date, occasion: "anlass", weather: "kalt" })[0].perfume.id, "angels-share");
});

test("parseCollection cleans bad entries and keeps custom perfumes", () => {
  const custom = { id: "eigen-1", name: "Mein Duft", house: "", family: "holzig", top: ["Zeder"], heart: [], base: [], seasons: ["winter"], occasions: ["alltag"], time: ["tag"], strength: 3 };
  const text = JSON.stringify({
    collection: [{ id: "aventus", rating: 9, lastWorn: "gestern" }, { id: "gibt-es-nicht" }, { id: "eigen-1", rating: 5 }],
    custom: [custom],
  });
  const { collection, custom: c } = parseCollection(text, BY_ID);
  assert.deepEqual(collection, [{ id: "aventus", rating: 3, lastWorn: null }, { id: "eigen-1", rating: 5, lastWorn: null }]);
  assert.equal(c.length, 1);
  assert.throws(() => parseCollection("{}", BY_ID), /Keine Sammlung/);
});

test("allNotes is de-duplicated and sorted", () => {
  const notes = allNotes(PERFUMES);
  assert.equal(new Set(notes.map((n) => n.toLowerCase())).size, notes.length);
  assert.deepEqual([...notes].sort((a, b) => a.localeCompare(b, "de")), notes);
});
