# Glyphfield Windows

Unabhängige Windows-Ausgabe von [Glyphfield](https://github.com/Kevin-Liu-01/Glyphfield), entwickelt von Kevin Liu. Der Windows-Build kombiniert das Original mit dem hier gepflegten Studio-Editor für Marken, Brandbooks und Moodboards.

## Installation

[Aktuelle Windows-Version herunterladen](https://github.com/richardkulinna/glyphfield-windows/releases/latest). Die Datei `Glyphfield-Windows-Setup-….exe` starten und den Installationsschritten folgen. Kein separat installiertes Node.js erforderlich. Der Installer ist derzeit nicht mit einem kommerziellen Windows-Zertifikat signiert.

## Updates

GitHub Actions prüft alle sechs Stunden den Originalentwickler-Zweig `main`. Ein unveränderlicher Commit wird gebaut. Erst wenn Typprüfung, Originaltests, Produktionsbuild und Tests der gepackten Windows-App erfolgreich sind, wird eine neue Version veröffentlicht. Fehler lassen die letzte veröffentlichte Version unangetastet. Zeitpläne können durch GitHub verzögert werden; GitHub kann Zeitpläne öffentlicher, längere Zeit inaktiver Repositories deaktivieren. Der Workflow lässt sich unter Actions auch manuell starten.

Die Windows-App prüft beim Start und alle sechs Stunden auf veröffentlichte Windows-Versionen. Installation erfolgt nur auf ausdrücklichen Klick im App-Menü. Während der Arbeit wird keine Version ungefragt installiert.

## Daten und Wiederherstellung

Projekte liegen in `%APPDATA%\Glyphfield Windows`, getrennt von den Programmdateien. Der lokale Ursprung `http://127.0.0.1:43127` bleibt stabil, damit Browserdaten auch nach Updates erreichbar bleiben. Ein belegter Port führt zu einer verständlichen Fehlermeldung, nicht zu einem leeren Ersatzprofil.

Unter **App → Update installieren** lädt die App zunächst den bisherigen Installer samt verifizierter SHA-256-Prüfsumme und das neue Update. Erst nach dem vollständigen Beenden der App kopiert ein separater Helfer die geschlossenen Datenbanken. Schlägt diese Sicherung fehl, wird nicht installiert.

**App → Letztes Update zurücknehmen** installiert den gesicherten Vorgänger und stellt dessen Projektdaten wieder her. Neuere Daten bleiben zusätzlich als `before-rollback-…` erhalten. Danach pausieren Update-Prüfungen, bis du manuell wieder nach Updates suchst. Es wird der unmittelbare Vorgänger gesichert; dessen Eignung für jeden individuellen Arbeitsablauf kann kein automatischer Test garantieren.

Falls die Oberfläche nicht startet: Im Windows-Startmenü **Glyphfield Windows - Wiederherstellen** öffnen. Dieser Einstieg startet die Wiederherstellung ohne den Webserver. Auch der Startfehlerdialog bietet die Rücknahme an.

Das App-Menü öffnet Daten und Sicherungen. Externe Dateien und seit der Sicherung noch nicht gespeicherte Änderungen sind nicht Bestandteil der Wiederherstellung. Beim ersten Installieren existiert noch kein Vorgänger. Für das erste Update muss der bisherige Installer auf GitHub erreichbar sein; sonst wird die Installation abgebrochen. Sicherungen werden nicht automatisch gelöscht.

## Entwicklung und eigene Erweiterungen

- `studio/src/`: bearbeitbarer Studio-Quellcode des Windows-Forks. Die Einträge in `studio/upstream-files.json` prüfen vor Tests und Build, ob sich eine übernommene Originaldatei geändert hat.
- `desktop/`: Electron-Fenster, lokale Serverlaufzeit, Update- und Wiederherstellungsfunktionen.
- `scripts/`: überprüfte Anpassungen ausschließlich in der temporären Build-Kopie.
- `tests/`: Desktop-Vertrag und Datenpersistenz.
- `upstream.json`: Originalrepository und Ausgangsstand.
- `vendor/`: temporärer Originalcheckout, nicht Bestandteil dieses Repositorys.

Eigene Funktionen möglichst im Desktop-Bereich oder über die öffentliche `window.glyphfield.studio`-Schnittstelle ergänzen. Unvermeidbare Änderungen am Webkern als überprüfbare Build-Patches in `scripts/` halten und mit Regressionstests absichern. Patches müssen bei unpassendem Kontext abbrechen. Keine automatische Konfliktauflösung, kein Überschreiben eigener Änderungen. Beliebige zukünftige Originaländerungen können dennoch eine manuelle Adapteranpassung erfordern.

Für lokale Builds Node.js 24, den im Original gepinnten pnpm und Windows x64 verwenden. `npm ci`, Original nach `vendor` klonen, dort `pnpm install --frozen-lockfile --node-linker=hoisted`, dann `npm run prepare:web`, in `vendor` `npm run build`, anschließend `npm run stage:web`, `npm run pack`, `npm run smoke`, `npm run dist`. `npm run build` bewahrt die für Windows benötigte Abhängigkeitsstruktur. Die CI führt zusätzlich Originaltests und Typprüfung aus. Build-Metadaten enthalten den exakten Originalcommit.

Original und Windows-Hülle stehen unter MIT. Original-Lizenz und Drittlizenzen werden mit dem Programm ausgeliefert.

### Testanpassungen

Die Originaltests laufen unter Linux, da mehrere Tests POSIX-Dateipfade voraussetzen. Zwei veraltete Testannahmen werden ausschließlich in der temporären Testkopie angepasst: Der Radius-Test erhält ausdrücklich seine erwartete Eingabe von 6 Pixeln; der Moodboard-Test überprüft echte Bildassets und schließt Bildschirmaufnahmen aus, statt ausschließlich auf das inzwischen unvollständige ID-Präfix `library-` zu vertrauen. Keine dieser Anpassungen verändert die ausgelieferte Anwendung. Weitere Testfehler blockieren die Veröffentlichung.
