# EinsatzPost

Web-Anwendung für die Erstellung von Feuerwehr-Einsatzgrafiken.

## Aktueller Stand

Startfähige Node-Grundstruktur mit Platzhalterseite und Health-Endpunkt. Der geplante Editor, Vorlagen und Export sind noch nicht implementiert: Die hochgeladene `canva-ersastz.md` war in der Entwicklungssitzung nicht lesbar. Die vollständigen Anforderungen müssen vor der Umsetzung übernommen werden.

## Lokal starten

Voraussetzung: Node.js ab Version 22.

```sh
npm start
```

Die Anwendung läuft unter http://localhost:3000. Es sind derzeit keine externen Pakete und kein Build-Schritt erforderlich. `npm run dev` startet mit automatischem Neustart bei Dateiänderungen. `npm run check` prüft die Serversyntax.

Optional kann `PORT` als Umgebungsvariable gesetzt werden. Die Datei `.env.example` dokumentiert die Einstellungen; `.env` wird nicht automatisch geladen.

## Plesk (Linux)

1. Repository in ein Anwendungsverzeichnis klonen oder über die Git-Erweiterung auschecken, beispielsweise `/httpdocs/einsatzpost`.
2. Für die Domain Node.js aktivieren und eine installierte Version ab 22 wählen.
3. **Application Root:** `/httpdocs/einsatzpost`.
4. **Document Root:** `/httpdocs/einsatzpost/public`.
5. **Application Startup File:** `app.js`.
6. **Application Mode:** `production`.
7. Anwendung neu starten.

Die konkreten Pfade hängen vom Git-Zielverzeichnis ab. Der Document Root muss innerhalb des Application Root liegen. Unter Plesk wird der vom Host bereitgestellte `PORT` verwendet; keinen festen Port in den Quellcode eintragen. Für die Domain HTTPS aktivieren.

Aktuell sind weder npm install noch ein Build erforderlich. Nach zukünftigen Änderungen an den Abhängigkeiten bzw. Build-Skripten muss dieser Abschnitt entsprechend aktualisiert werden.

Prüfung: `/api/health` liefert `{"status":"ok","application":"EinsatzPost"}`.

Plesk-Dokumentation: https://docs.plesk.com/en-US/obsidian/administrator-guide/website-management/nodejs-support.76652/
