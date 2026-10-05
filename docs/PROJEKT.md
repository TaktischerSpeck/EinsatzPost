# EinsatzPost – Umsetzung

Mobile Web-App für eine feste Feuerwehr-Einsatzgrafik. Die Anwendung verhindert das versehentliche Verschieben oder Skalieren von Layout-Elementen.

## Verhalten

- Einsatznummer, Datum, Kategorie, Kurzbeschreibung, Alarmierungszeit, Ort und Bild.
- Kategorien liefern festes Stichwort und Tagfarbe. Nur Administratoren können diese Vorgaben ändern.
- Die Kurzbeschreibung steht über dem festen Stichwort, entsprechend der ursprünglichen Projektidee.
- Nur der Bildausschnitt ist verschiebbar und zoombar. Alle Texte und Rahmen bleiben fest.
- Automatische Textverkleinerung und Umbruch; Überlauf sperrt den Export.
- Live-Vorschau und PNG-/JPEG-Export in 1080 × 1350 oder 2160 × 2700 Pixeln.
- Lokaler Entwurf inklusive Bild in IndexedDB. Ein Entwurf pro Browser, keine Synchronisierung zwischen Geräten.
- Globale Team-Einstellungen auf dem Server: Name, Fußzeile, Kategorien, Farben, Stichwörter und Textvorschläge.

## Architektur

Node.js ab Version 22, statisches Frontend mit ES-Modulen und Canvas. Keine externen Laufzeitabhängigkeiten und kein Build-Schritt.

Die ursprünglich genannten Frameworks, Datenbanken und Bildbibliotheken waren technische Beispiele. Diese Version verwendet native Canvas-Funktionen für Textanpassung und Crop. Rendering und Export laufen im Browser; ein serverseitiger POST-/generate-Endpunkt ist nicht erforderlich und nicht enthalten.

Fotos werden nicht an den Server übertragen. Uploads werden auf maximal 2400 Pixel an der langen Seite normalisiert. Bild-URLs werden durch den Browser geladen und benötigen CORS-Unterstützung des Bildanbieters.

## Pixelmaße

Alle Koordinaten beziehen sich auf 1080 × 1350 Pixel.

| Element | X | Y | Breite | Höhe |
| --- | ---: | ---: | ---: | ---: |
| Bild | 60 | 272 | 960 | 566 |
| Kurzbeschreibung | 60 | 895 | 960 | 146 |
| Einsatzstichwort | 60 | 1060 | 960 | 48 |
| Ort | 235 | 1191 | 785 | 60 |

Zentrale Layoutdefinition: public/layout.js. Kopfbereich, Tag, Trennlinie und Fußzeile: public/renderer.js. Der hochauflösende Export multipliziert alle Koordinaten mit 2.

Exakte Canva-Hilfslinien, Originalschrift, Logos und Quelldateien lagen nicht vor. Die Vorlage ist daher eine neue feste Gestaltung und keine pixelgenaue Kopie. Mit den Referenzmaßen und Medien können die Layoutwerte angepasst werden. 3:4 ist nicht enthalten.

## Verwaltung und API

ADMIN_TOKEN mit mindestens 16 Zeichen aktiviert Admin-Schreibrechte. Ohne Schlüssel ist die Verwaltung gesperrt. Der Schlüssel wird nicht dauerhaft im Browser gespeichert.

- GET /api/config: Einstellungen, Revisionswert und Admin-Verfügbarkeit.
- PUT /api/config: Bearer-Token, Konfiguration und aktuelle Revision erforderlich.
- GET /api/health: Serverstatus.

Die Revision ist ein Hash der Einstellungen. Schreibzugriffe werden serialisiert; veraltete Revisionen führen zu HTTP 409. Die Konfiguration wird über temporäre Datei und Umbenennung gespeichert. DATA_DIR bestimmt den Speicherort. Diese Lösung ist für eine einzelne Node-Instanz ausgelegt; mehrere unabhängig gestartete Instanzen benötigen eine gemeinsame Datenbank.

Der Editor ist öffentlich erreichbar. Allgemeine Nutzeranmeldung, serverseitiges Einsatzarchiv und automatische Instagram-Veröffentlichung sind nicht enthalten.

## Prüfung

Syntaxprüfung sowie API-Tests für Zugriffsschutz, ungültige Daten, Pfadzugriffe, Speicherung, Neustart, konkurrierende Änderungen und Begrenzung ungültiger Anmeldeversuche. Renderer-Tests prüfen Textanpassung, Überlauf, Crop-Grenzen und Exportmaße. GitHub Actions prüft Node 22 und 24 bei Push und Pull Request.

Die visuelle Browserprüfung sowie echte Bildauswahl, Downloads und mobile Bedienung waren in der Entwicklungssitzung gesperrt und müssen nach dem Deployment geprüft werden.
