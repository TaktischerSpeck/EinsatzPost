# EinsatzPost

Mobile Web-App für Feuerwehr-Einsatzgrafiken: feste Vorlage, Live-Vorschau, Bildausschnitt und Export.

## Start

Node.js ab Version 22 installieren und im Projektverzeichnis npm start ausführen.
Anwendung: http://localhost:3000. Keine externen Pakete und kein Build-Schritt erforderlich.

- npm run dev: Entwicklung mit automatischem Neustart.
- npm run check: JavaScript-Syntax prüfen.
- npm test: API- und Renderer-Tests.

## Funktionen

- Einsatzdaten eingeben und Kategorie auswählen.
- Festes Stichwort und Tagfarbe aus den Team-Einstellungen.
- JPG, PNG oder WebP auswählen, alternativ HTTPS-Bildlink mit CORS-Unterstützung.
- Foto im festen Rahmen verschieben, zoomen oder über Regler ausrichten.
- Automatische Schriftanpassung; Textüberlauf sperrt den Export.
- PNG und JPEG in 1080 × 1350 oder 2160 × 2700 Pixeln.
- Ein lokaler Entwurf inklusive Bild pro Browser.
- Admin-Verwaltung für Name, Fußzeile, Kategorien, Farben, Stichwörter und Textvorschläge.

Einsatzdaten und Bilder werden beim Erstellen nicht an den Server gesendet. Der Server speichert nur globale Team-Einstellungen. Der normale Editor ist ohne Anmeldung erreichbar. Die aktuelle Gestaltung ist keine 1:1-Kopie der Canva-Vorlage; exakte Hilfslinien und Originalmedien fehlen noch.

## Plesk (Linux)

1. Node.js-Unterstützung und Git-Erweiterung aktivieren.
2. Repository in ein Anwendungsverzeichnis deployen, beispielsweise /httpdocs/einsatzpost.
3. Node.js-Version ab 22 wählen.
4. Application Root: /httpdocs/einsatzpost.
5. Document Root: /httpdocs/einsatzpost/public.
6. Application Startup File: app.js.
7. Application Mode: production.
8. In den Umgebungsvariablen ADMIN_TOKEN setzen: mindestens 16 Zeichen, besser ein zufälliger 32-Byte-Schlüssel.
9. DATA_DIR auf ein beschreibbares Verzeichnis außerhalb des Deployments setzen, beispielsweise /var/www/vhosts/DEINE-DOMAIN/private/einsatzpost-data.
10. Anwendung neu starten und HTTPS aktivieren.

Die Pfade sind Beispiele und müssen zur Domain passen. DATA_DIR muss für den Node-Benutzer beschreibbar sein. PORT wird von Plesk vorgegeben; dort nicht selbst überschreiben. .env.example ist nur Dokumentation und wird nicht automatisch geladen.

Einen Admin-Schlüssel selbst erzeugen:

    node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

Nur in Plesk setzen und berechtigten Administratoren geben; niemals ins Repository committen. Ohne ADMIN_TOKEN bleibt die Admin-Speicherung deaktiviert.

Standardmäßig liegen die Einstellungen in data/config.json. Dieses Verzeichnis ist von Git ausgeschlossen. Für Plesk Git ausdrücklich DATA_DIR außerhalb des Checkouts verwenden und die Datei regelmäßig sichern. Die Speicherung ist für eine einzelne Node-Instanz ausgelegt.

## Automatisches Deployment mit Plesk Git

1. In Plesk Git dieses Repository und main auswählen.
2. Automatischen Deploymentmodus aktivieren.
3. Von Plesk erzeugte Webhook-URL kopieren.
4. Bei GitHub unter Settings → Webhooks eintragen: Content type application/json, Ereignis Just the push event.
5. Bei einem privaten Repository den von Plesk erzeugten Deploy-Key mit Leserechten hinterlegen; dieses Repository ist öffentlich.
6. In Plesk zusätzliche Deployment-Aktionen aktivieren. Zum Neustart von Passenger im Application Root ausführen:

    mkdir -p tmp
    touch tmp/restart.txt

Sicherstellen, dass die Aktionen im tatsächlichen Application Root laufen. Bei Bedarf vor dem Neustart npm run check und npm test mit der von Plesk bereitgestellten Node-Version ausführen. Falls diese Passenger-Neustartmethode auf dem Host nicht unterstützt wird, die Plesk-Neustartfunktion verwenden.

Der Webhook und Plesk sind noch nicht verbunden. Dazu sind Domain und konkrete Hosting-Konfiguration nötig. GitHub Actions prüft den Code und deployt nicht. Ein direkter Plesk-Webhook wartet nicht auf CI: Für geprüftes Deployment main schützen und erst nach bestandenen Checks mergen oder in Plesk manuell deployen.

Dokumentation:

- https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/nodejs-support.76652/
- https://docs.plesk.com/en-US/obsidian/customer-guide/git-support/using-remote-git-hosting.75848/

## Projektdateien

- app.js: Einstiegspunkt für Node und Plesk.
- server.js: API, Autorisierung und Speicherung.
- config/defaults.json: initiale Team-Einstellungen.
- public/editor.js: Formular, Bilder, Entwürfe und Export.
- public/renderer.js: Canvas-Rendering und Textanpassung.
- public/layout.js: Pixelmaße.
- docs/PROJEKT.md: Anforderungen und Umsetzungsgrenzen.
- tests/: API- und Renderer-Tests.

## Abnahme nach dem Deployment

1. /api/health aufrufen.
2. Einsatz mit langem Text und echtem Foto anlegen.
3. Bildregler und Verschieben testen; Texte und Rahmen bleiben fest.
4. PNG und JPEG in beiden Größen herunterladen, Maße und vollständige Texte prüfen.
5. Entwurf speichern, Seite neu laden und Entwurf laden.
6. Eine Farbe als Admin ändern, Anwendung neu starten und Speicherung prüfen.
7. Auf einem Smartphone testen.

Die visuelle Browserprüfung war während der Entwicklung gesperrt und ist noch offen.
