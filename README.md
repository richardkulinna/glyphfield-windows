# Glyphfield Windows

Unabhängige Windows-Ausgabe von [Glyphfield](https://github.com/Kevin-Liu-01/Glyphfield), entwickelt von Kevin Liu. Die originale Oberfläche und der originale Anwendungscode bleiben erhalten. Dieses Repository enthält ausschließlich die Windows-Hülle, Tests und den Update-Prozess.

## Installation

[Aktuelle Windows-Version herunterladen](https://github.com/richardkulinna/glyphfield-windows/releases/latest). Die Datei `Glyphfield-Windows-Setup-….exe` starten und den Installationsschritten folgen. Kein separat installiertes Node.js erforderlich. Der Installer ist derzeit nicht mit einem kommerziellen Windows-Zertifikat signiert.

## Updates

GitHub Actions prüft alle sechs Stunden den Originalentwickler-Zweig `main`. Ein unveränderlicher Commit wird gebaut. Erst wenn Typprüfung, Originaltests, Produktionsbuild und Tests der gepackten Windows-App erfolgreich sind, wird eine neue Version veröffentlicht. Fehler lassen die letzte veröffentlichte Version unangetastet. Zeitpläne können durch GitHub verzögert werden; GitHub kann Zeitpläne öffentlicher, längere Zeit inaktiver Repositories deaktivieren. Der Workflow lässt sich unter Actions auch manuell starten.

Die Windows-App prüft beim Start und alle sechs Stunden auf veröffentlichte Windows-Versionen. Installation erfolgt nur auf ausdrücklichen Klick im App-Menü. Während der Arbeit wird keine Version ungefragt installiert.

## Daten und Wiederherstellung

Projekte liegen in `%APPDATA%\Glyphfield Windows`, getrennt von den Programmdateien. Der lokale Ursprung `http://127.0.0.1:43127` bleibt stabil, damit Browserdaten auch nach Updates erreichbar bleiben. Ein belegter Port führt zu einer verständlichen Fehlermeldung, nicht zu einem leeren Ersatzprofil.

Vor Versionswechseln werden Daten gesichert. Das App-Menü öffnet Daten und Sicherungen. Beim Zurücksetzen immer auch den zur alten Version passenden Datenstand verwenden: Neue Datenformate müssen nicht rückwärtskompatibel sein. Neuere Daten bleiben als separate Sicherung erhalten. Externe Dateien und seit der Sicherung noch nicht gespeicherte Änderungen sind nicht Bestandteil der Wiederherstellung.

## Entwicklung und eigene Erweiterungen

- `desktop/`: Electron-Fenster, lokale Serverlaufzeit, Update- und Wiederherstellungsfunktionen.
- `scripts/`: überprüfte Anpassungen ausschließlich in der temporären Build-Kopie.
- `tests/`: Desktop-Vertrag und Datenpersistenz.
- `upstream.json`: Originalrepository und Ausgangsstand.
- `vendor/`: temporärer Originalcheckout, nicht Bestandteil dieses Repositorys.

Eigene Funktionen möglichst im Desktop-Bereich oder über die öffentliche `window.glyphfield.studio`-Schnittstelle ergänzen. Unvermeidbare Änderungen am Webkern als überprüfbare Build-Patches in `scripts/` halten und mit Regressionstests absichern. Patches müssen bei unpassendem Kontext abbrechen. Keine automatische Konfliktauflösung, kein Überschreiben eigener Änderungen. Beliebige zukünftige Originaländerungen können dennoch eine manuelle Adapteranpassung erfordern.

Für lokale Builds Node.js 24, den im Original gepinnten pnpm und Windows x64 verwenden. `npm ci`, Original nach `vendor` klonen, dort `pnpm install --frozen-lockfile`, dann `npm run prepare:web`, in `vendor` `pnpm build`, anschließend `npm run stage:web`, `npm run pack`, `npm run smoke`, `npm run dist`. Die CI führt zusätzlich Originaltests und Typprüfung aus. Build-Metadaten enthalten den exakten Originalcommit.

Original und Windows-Hülle stehen unter MIT. Original-Lizenz und Drittlizenzen werden mit dem Programm ausgeliefert.
