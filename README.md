# duftfinder

Ich sammle Parfums und wollte zwei Dinge an einem Ort: neue Düfte finden, die zu einem Anlass und zur Jahreszeit passen, und morgens schnell entscheiden, welchen aus meiner Sammlung ich trage.

**Live:** https://antony-bdc.github.io/duftfinder/

![duftfinder, Ansicht «Heute»](docs/preview.png)

## Was es kann

- **Heute:** schlägt aus der eigenen Sammlung einen Duft vor. Berücksichtigt Jahreszeit, Anlass, Wetter, die eigene Bewertung und was in den letzten Tagen schon getragen wurde. Der Duftverlauf zeigt, wie lange Kopf-, Herz- und Basisnote ungefähr wahrnehmbar sind.
- **Finden:** 49 bekannte Düfte nach Anlass, Jahreszeit, Tageszeit, Duftfamilie und Lieblingsnoten filtern, Noten ausschliessen, oder nach Ähnlichkeit zu einem Duft sortieren, den man schon mag.
- **Sammlung:** Düfte bewerten, eigene Düfte erfassen, Sammlung als JSON exportieren und wieder importieren.
- Läuft als PWA auch offline und lässt sich auf dem Handy installieren.

## Wie die Ähnlichkeit berechnet wird

Jeder Duft wird zu einer Menge gewichteter Noten: Kopfnoten 0.6, Herznoten 0.8, Basisnoten 1.0, weil die Basis am längsten auf der Haut bleibt. Zwei Düfte vergleiche ich mit einem gewichteten Jaccard-Index über diese Noten (70 %), dazu kommen gleiche Duftfamilie (20 %) und gemeinsame Jahreszeiten (10 %). Die Logik steckt in [`engine.js`](engine.js) als reine Funktionen ohne DOM-Zugriff und ist mit `node --test` abgedeckt.

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Markup, Styles, Icon-Sprite (Lucide) |
| `app.js` | Oberfläche, Zustand, Speicherung im Browser |
| `engine.js` | Filter, Ranking, Ähnlichkeit, Tagesvorschlag, Import-Prüfung |
| `perfumes.js` | Duftdaten |
| `sw.js` | Offline-Cache |
| `tests/` | Unit-Tests für Daten und Logik |

Kein Build-Schritt, keine Abhängigkeiten zur Laufzeit. Schriften (Instrument Serif, Inter Tight) sind selbst gehostet.

```bash
npm test                       # Tests
python3 -m http.server 8000    # lokal öffnen: http://localhost:8000
```

GitHub Actions testet jeden Push und veröffentlicht `main` auf GitHub Pages.

## Daten

Die Duftnoten stammen aus den Angaben der Hersteller und sind vereinfacht. Jahreszeit, Anlass und Stärke sind meine Einschätzung. Die Sammlung bleibt im `localStorage` des Browsers und verlässt das Gerät nicht.

## Lizenz

Code: MIT. Icons: [Lucide](https://lucide.dev) (ISC). Schriften: Instrument Serif und Inter Tight (SIL Open Font License).
