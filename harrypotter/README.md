# Harry Potter-världen (MVP)

Minimal klientbaserad wiki/spel-start med:

- HTML5 (semantisk markup)
- JSON-datafiler
- Liten renderer i vanilla JavaScript
- Gemensamt, mobilanpassat mörkt tema med långsamt skiftande gradient och guldfärgade detaljer
- Ingen backend

Bakgrunden skiftar mellan smaragdgrönt, kolsvart och dämpad plommonfärg över
52 sekunder. Vid inställningen reducerad rörelse visas en stilla gradient.

## Struktur

- `index.html` — startsida och navigering
- `characters.html`, `actors.html`, `pets.html`, `years.html`, `relationships.html` — listsidor
- `detail.html` — gemensam detaljsida (`?type=...&id=...`)
- `app.js` — rendering av listor + detalj från JSON
- `styles.css` — gemensam typografi, färger, navigering och kontroller för wiki och quiz
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

## Quiz

Öppna `quiz.html` för ett soloquiz med ämne, svårighetsgrad, bok/film,
spoilergräns och 5–50 frågor per omgång. Om färre frågor matchar används alla
matchande frågor. Wikiartiklar länkar till quiz om respektive entitet.
Senaste omgången och senaste resultatet per fråga sparas lokalt i webbläsaren.
Nya omgångar blandar frågorna och prioriterar sådana som inte visades i den
föregående omgången. Svarsalternativen blandas också; en omladdning återupptar
den sparade omgången utan att ändra dess ordning.
Felaktigt besvarade frågor kan övas igen inom de valda filtren.
Svårighetsgrader väljs med kryssrutor och kan kombineras. Alla fyra nivåer är
förvalda; utan valda nivåer kan ingen omgång startas.

### Frågebanken

`data/quiz/manifest.json` listar JSON-filerna som ska laddas. Banken innehåller
122 frågor: 13 startfrågor i `films.json` och `cross-series.json`, kontrollerade
mot befintliga lokala wikiuppgifter, samt 109 svenska bokfrågor i
`book-1.json` till `book-7.json` (15–17 per bok).

Svårighetsnivån `extreme` (Extrem) är för små, svårmemorerade bokdetaljer.
Fyra sådana frågor finns som utkast i bok 2 och bok 5. Nivån följer samma
granskning och spoilerfilter som övriga frågor; inga extrema frågor är ännu
godkända för spel.

Tre hårda bokfrågor är granskade mot Harry Potter Lexicons kapitelreferenser;
referenslänkarna finns i `source.verificationUrl`. Totalt är 16 frågor spelbara.
De övriga 106 bokfrågorna är utkast med kapitelhänvisningar, egna förklaringar
och varierade svarspositioner. Svar, svenska namn, kapitelhänvisningar och spoilergränser
behöver kontrolleras mot böckerna innan `reviewStatus` ändras från `draft`
till `reviewed`.
Fortsätt lägga till frågor i respektive bokfil med nya stabila ID:n; ingen
kodändring behövs. Detta är en första utökning mot 1 000+ frågor, inte en
komplett bank eller en fullständig extern kanongranskning.

Varje fråga har följande fält:

- `id`: unikt, stabilt ID; återanvänd aldrig ett borttaget ID.
- `language`: exempelvis `sv`.
- `canon`: `book` eller `film`.
- `spoilerThroughBook`: högsta boknummer som frågan, alternativen eller förklaringen avslöjar (1–7).
- `category`: exempelvis `characters`, `pets`, `actors` eller `spells`.
- `difficulty`: `easy`, `medium`, `hard` eller `extreme`.
- `question`, fyra unika `options`, samt `correctOptionIndex` (0–3).
- `explanation`: egen kort förklaring, inte kopierad boktext.
- `source`: `{ "type": "book", "book": 1, "chapter": 6 }`,
	`{ "type": "film", "title": "...", "scene": "..." }` eller en lokal
	wikireferens med `type`, `entityType`, `entityId` och `field`.
- `entities`: wikianknytningar med `type` och `id`.
- `reviewStatus`: `draft` tills svar, källa, formulering och spoilergräns
	kontrollerats; endast `reviewed` används i quiz.

Kör validering och tester från repots rot:

```bash
node --test harrypotter/tests/quiz.test.mjs
```

### Simple Chat senare

`quiz-bank.mjs` fungerar både i webbläsaren och som en dynamisk Node-import.
Frågebanken är den enda redigerade källan. Kopiera banken och modulen till
Simple Chats serverdel vid bygg/deploy, inte till dess publika katalog.
Det kräver att deploysteget har tillgång till wiki-katalogen; de nuvarande
apparna distribueras separat. Något sådant deploysteg är ännu inte tillagt.

Servern kan läsa JSON-filer med `node:fs/promises`, köra `validateQuestions`
och använda `filterQuestions`. `publicQuestion` ger endast ID, frågetext,
alternativ, ämne och svårighetsgrad. Behåll rätt svar och förklaringar på
servern tills omgångens svar avslöjas. Wikiquizet är lokalt och skyddar inte
sina JSON-svar mot inspektion. Realtime-rundor, serverpoäng och chatpanelen
är nästa integration, inte del av denna version.
