# Glyphfield im Browser

Glyphfield ist ein lokales Markenstudio für Windows x64. Die Browserfassung verbindet [Glyphfield von Kevin Liu](https://github.com/Kevin-Liu-01/Glyphfield) mit den Studio-Erweiterungen dieses Projekts.

## Öffnen

1. Lade das ZIP der [aktuellen Browserfassung](https://github.com/richardkulinna/glyphfield-windows/releases/latest) herunter.
2. Wähle im Explorer **Alle extrahieren**. Bewahre den vollständigen Ordner auf.
3. Doppelklicke auf **Glyphfield starten.cmd**. Der Starter öffnet das Studio in deinem Standardbrowser. Für deinen Desktop kannst du eine Verknüpfung zu diesem Starter erstellen.

Der lokale Webserver und seine Laufzeit sind im Paket enthalten. Das Studio läuft nach dem Download offline auf deinem PC. Die Adresse ist immer `http://127.0.0.1:43496/studio`. Während der Server läuft, kannst du sie über ein Lesezeichen oder **Studio.html** wieder öffnen. **Glyphfield beenden.cmd** beendet den lokalen Server. Externe Links führen gegebenenfalls aus dem lokalen Studio heraus.

## Projekte und Updates

Marken, Bearbeitungsstände und Assets liegen im Speicher deines Browserprofils. Öffne das Studio im selben Browser und Profil. Das Löschen der Websitedaten oder ein privates Browserfenster kann den Zugriff auf diese Daten beenden. Sichere wichtige Marken über den Kit-Export.

Für ein Update entpackst du die neue Version in einen eigenen Ordner und öffnest den dortigen Starter. Die feste lokale Adresse erhält den Zugriff auf die Projekte im selben Browserprofil. Die frühere Electron-Ausgabe hat ein eigenes Datenverzeichnis. Ihre installierten Projekte werden durch das Entpacken allein nicht übertragen.

Eine vorbereitete persönliche Migrationssicherung kann lokal als `private/Projekt.glyphfield.json` neben dem Starter abgelegt werden. Der Starter führt beim Öffnen zur Übernahme. Eine bereits bearbeitete Identität lässt sich behalten oder als separate Kopie ergänzen. Der öffentliche Download enthält keine solchen Sicherungen. Herkömmliche Marken-Kits importierst du im Studio.

## Brandbook bearbeiten und exportieren

Öffne **Brand book** und wähle eine Seite. Unter **Content** bearbeitest du deren Inhalt, unter **Elements** platzierst du Text, Bilder und Icons. **Style** enthält die Gestaltungsoptionen für die aktuelle Seite. Mit **Add page** ergänzt du Vorlagen, mit **Restore** holst du entfernte Seiten und Abschnitte samt ihren Änderungen zurück.

**Export PowerPoint** lädt die sichtbaren Seiten in ihrer Reihenfolge als PPTX. Text, Farbflächen und Linien sind einzeln auswählbar. Fotos, Logos und Icons werden als eigenständige Bilder eingebettet. Installiere die verwendeten Markenschriften auf dem Präsentationsrechner, damit PowerPoint sie originalgetreu darstellen kann.

## Entwicklung

- `studio/src/` enthält die Studio-Erweiterungen, `studio/upstream-files.json` die geprüften Upstream-Dateien.
- `browser/` enthält die lokalen Starter und die Importseite. `desktop/` enthält den Quellstand des früheren Windows-Clients.
- GitHub Actions prüft Änderungen am Repository und regelmäßig den Upstream-Zweig aus `upstream.json`. Jeder Build verweist auf den exakten Upstream-Commit. Die Veröffentlichung setzt erfolgreiche Tests des Quellcodes und des entpackten ZIPs voraus.
- Für lokale Builds brauchst du Windows x64, Node.js 24 und die in `vendor/package.json` festgelegte pnpm-Version. Checke das Original nach `vendor/` aus. Führe im Projekt `npm ci` und `npx playwright install chromium --only-shell` aus, danach in `vendor/` den Befehl `pnpm install --frozen-lockfile --node-linker=hoisted`. Es folgen `npm run prepare:web` im Projekt, `npm run build` in `vendor/` und anschließend `npm run stage:web`, `npm test`, `npm run pack` und `npm run smoke` im Projekt. Das Ergebnis liegt in `dist/`.

Die Lizenzdateien von Glyphfield, Node.js und den eingebundenen Komponenten liegen im Paket.
