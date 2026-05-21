# Agile Schulentwicklung erleben

Browserbasierte Simulation für die Erstqualifizierung schulischer Leitungskräfte.

## Ziel

Die Simulation unterstützt das Kennenlernen agiler Schulentwicklung:

- Entwicklungsvorhaben priorisieren
- Aufwand gemeinsam klären
- Führungsdilemmata entscheiden
- Blockaden erkennen
- passende Interventionen nutzen
- Ergebnisse im Review prüfen
- Arbeitsweise in der Retrospektive verbessern

## GitHub Pages

Diese Version ist für GitHub Pages vorbereitet.

### Struktur

```text
/
├─ index.html
├─ css/
│  └─ styles.css
├─ js/
│  ├─ data.js
│  └─ app.js
├─ assets/
│  └─ images/
├─ .nojekyll
└─ README.md
```

### Veröffentlichung

1. Repository auf GitHub erstellen.
2. Alle Dateien aus diesem Ordner in das Repository hochladen.
3. In GitHub: **Settings → Pages**.
4. Source: **Deploy from a branch**.
5. Branch: `main`, Folder: `/root`.
6. Speichern.
7. GitHub erzeugt eine URL.

## Hinweise für den Einsatz in Qualifizierungen

Die Anwendung läuft vollständig im Browser. Es werden keine personenbezogenen Daten gespeichert und kein Server benötigt.

Für den Einsatz in Gruppen empfiehlt sich:

1. Gemeinsame Einführung durch die Fortbildungsleitung.
2. Gemeinsame Aufwandsklärung.
3. Arbeit in Gruppen mit 4–8 Personen.
4. Nach jedem Entwicklungszyklus Review und Retrospektive im Plenum.
5. Transfer auf reale Entwicklungsvorhaben der eigenen Schule.


## Wenn der Start-Button nicht reagiert

Bitte prüfen:

1. Nicht die `index.html` direkt aus der ZIP-Datei öffnen.
2. ZIP vollständig entpacken.
3. Sicherstellen, dass diese Struktur erhalten bleibt:

```text
index.html
css/styles.css
js/data.js
js/app.js
assets/images/
```

4. Bei GitHub Pages müssen alle Ordner mit hochgeladen werden.
5. Im Browser ggf. mit F12 → Console prüfen, ob `data.js` oder `app.js` nicht geladen wurde.

Diese Version enthält zusätzlich eine sichtbare Ladefehlermeldung in der Startansicht.
