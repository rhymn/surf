# Harry Potter-världen (MVP)

Minimal klientbaserad wiki/spel-start med:

- HTML5 (semantisk markup)
- JSON-datafiler
- Liten renderer i vanilla JavaScript
- Ingen CSS
- Ingen backend

## Struktur

- `index.html` — startsida och navigering
- `characters.html`, `actors.html`, `pets.html`, `years.html`, `relationships.html` — listsidor
- `detail.html` — gemensam detaljsida (`?type=...&id=...`)
- `app.js` — rendering av listor + detalj från JSON
- `data/*.json` — källdata

## Kör lokalt

Eftersom `fetch()` används för JSON-filer behöver mappen serveras via en statisk server.

### Alternativ 1: Python

```bash
cd harrypotter
python3 -m http.server 4173
```

Öppna: `http://localhost:4173`

### Alternativ 2: Node (om du har `npx`)

```bash
cd harrypotter
npx serve .
```

## Bygg vidare senare

- Lägg till fler entiteter och länkar i `data/*.json`
- Behåll stabila ID:n (`id`) så relationer fortsätter fungera
- Migrera till backend senare utan att ändra datamodellens form
