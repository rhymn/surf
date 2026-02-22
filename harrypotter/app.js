const TYPE_TO_FILE = {
  characters: 'characters.json',
  actors: 'actors.json',
  pets: 'pets.json',
  years: 'years.json',
  relationships: 'relationships.json'
};

const TYPE_TO_TITLE = {
  characters: 'Karaktär',
  actors: 'Skådespelare',
  pets: 'Husdjur',
  years: 'År',
  relationships: 'Relation'
};

const PAGE_TO_BACKGROUND = {
  characters: '#f3f8ff',
  actors: '#fff7ef',
  pets: '#f2fff4',
  years: '#f7f3ff',
  relationships: '#fff3f8'
};

const page = document.body.dataset.page;

async function loadAll() {
  const entries = await Promise.all(
    Object.entries(TYPE_TO_FILE).map(async ([type, file]) => {
      const response = await fetch(`data/${file}`);
      if (!response.ok) {
        throw new Error(`Kunde inte ladda ${file}`);
      }
      const value = await response.json();
      return [type, value];
    })
  );

  const db = Object.fromEntries(entries);
  return {
    ...db,
    byType: {
      characters: Object.fromEntries(db.characters.map((item) => [item.id, item])),
      actors: Object.fromEntries(db.actors.map((item) => [item.id, item])),
      pets: Object.fromEntries(db.pets.map((item) => [item.id, item])),
      years: Object.fromEntries(db.years.map((item) => [item.id, item])),
      relationships: Object.fromEntries(db.relationships.map((item) => [item.id, item]))
    }
  };
}

function entityName(type, item, db) {
  if (!item) return 'Okänd';
  if (type === 'years') return item.label;
  if (type === 'relationships') {
    const from = db.byType.characters[item.fromId]?.name || item.fromId;
    const to = db.byType.characters[item.toId]?.name || item.toId;
    return `${from} -> ${to} (${item.type})`;
  }
  return item.name;
}

function createDetailLink(type, id, text) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = `detail.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
  a.textContent = text;
  li.appendChild(a);
  return li;
}

function renderList(type, db) {
  const list = document.getElementById('entity-list');
  if (!list) return;

  db[type].forEach((item) => {
    list.appendChild(createDetailLink(type, item.id, entityName(type, item, db)));
  });
}

function addConnection(list, type, id, db, prefix = '') {
  const item = db.byType[type][id];
  if (!item) return;
  list.appendChild(createDetailLink(type, id, `${prefix}${entityName(type, item, db)}`));
}

function renderCharacterConnections(item, list, db) {
  addConnection(list, 'actors', item.actorId, db, 'Skådespelare: ');
  item.petIds.forEach((id) => addConnection(list, 'pets', id, db, 'Husdjur: '));
  item.yearIds.forEach((id) => addConnection(list, 'years', id, db, 'År: '));

  db.relationships
    .filter((rel) => rel.fromId === item.id || rel.toId === item.id)
    .forEach((rel) => addConnection(list, 'relationships', rel.id, db, 'Relation: '));
}

function renderActorConnections(item, list, db) {
  item.characterIds.forEach((id) => addConnection(list, 'characters', id, db, 'Karaktär: '));
}

function renderPetConnections(item, list, db) {
  addConnection(list, 'characters', item.ownerId, db, 'Ägare: ');
}

function renderYearConnections(item, list, db) {
  db.characters
    .filter((character) => character.yearIds.includes(item.id))
    .forEach((character) => addConnection(list, 'characters', character.id, db, 'Karaktär: '));
}

function renderRelationshipConnections(item, list, db) {
  addConnection(list, 'characters', item.fromId, db, 'Från: ');
  addConnection(list, 'characters', item.toId, db, 'Till: ');
}

function applyBackground() {
  if (PAGE_TO_BACKGROUND[page]) {
    document.body.style.backgroundColor = PAGE_TO_BACKGROUND[page];
    return;
  }

  if (page === 'detail') {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    if (type && PAGE_TO_BACKGROUND[type]) {
      document.body.style.backgroundColor = PAGE_TO_BACKGROUND[type];
    }
  }
}

function renderDetail(type, id, db) {
  const detail = document.getElementById('detail');
  const connections = document.getElementById('connections');
  if (!detail || !connections) return;

  const item = db.byType[type]?.[id];

  if (!item) {
    const notFound = document.createElement('p');
    notFound.textContent = 'Entiteten hittades inte.';
    detail.appendChild(notFound);
    return;
  }

  document.title = `${TYPE_TO_TITLE[type]}: ${entityName(type, item, db)}`;

  const h2 = document.createElement('h2');
  h2.textContent = `${TYPE_TO_TITLE[type]}: ${entityName(type, item, db)}`;
  detail.appendChild(h2);

  const description = document.createElement('p');
  description.textContent = item.description || 'Ingen beskrivning tillgänglig.';
  detail.appendChild(description);

  if (type === 'characters') {
    const houseLine = document.createElement('p');
    houseLine.textContent = `Elevhem: ${item.house}`;
    detail.appendChild(houseLine);

    const birthLine = document.createElement('p');
    birthLine.textContent = `Födelseår: ${item.birthYear ?? 'Okänt'}`;
    detail.appendChild(birthLine);

    if (item.deathYear != null) {
      const deathLine = document.createElement('p');
      deathLine.textContent = `Dödsår: ${item.deathYear}`;
      detail.appendChild(deathLine);
    }

    const trivia = document.createElement('p');
    trivia.textContent = `Kuriosa: ${item.kuriosa || 'Ingen kuriosa tillgänglig.'}`;
    detail.appendChild(trivia);

    renderCharacterConnections(item, connections, db);
  }

  if (type === 'actors') {
    renderActorConnections(item, connections, db);
  }

  if (type === 'pets') {
    const deathYear = item.deathYear ?? 'Lever';
    const speciesLine = document.createElement('p');
    speciesLine.textContent = `Art: ${item.species}`;
    detail.appendChild(speciesLine);

    const colorLine = document.createElement('p');
    colorLine.textContent = `Färg: ${item.color || 'Okänd'}`;
    detail.appendChild(colorLine);

    const birthLine = document.createElement('p');
    birthLine.textContent = `Födelseår: ${item.birthYear ?? 'Okänt'}`;
    detail.appendChild(birthLine);

    const deathLine = document.createElement('p');
    deathLine.textContent = `Dödsår: ${deathYear}`;
    detail.appendChild(deathLine);

    const trivia = document.createElement('p');
    trivia.textContent = `Kuriosa: ${item.kuriosa || 'Ingen kuriosa tillgänglig.'}`;
    detail.appendChild(trivia);

    renderPetConnections(item, connections, db);
  }

  if (type === 'years') {
    const meta = document.createElement('p');
    meta.textContent = `Läsår: ${item.schoolYear}`;
    detail.appendChild(meta);
    renderYearConnections(item, connections, db);
  }

  if (type === 'relationships') {
    renderRelationshipConnections(item, connections, db);
  }
}

async function run() {
  if (!page || page === 'home') return;

  applyBackground();

  const db = await loadAll();

  if (page === 'detail') {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    const id = params.get('id');

    if (!type || !id || !TYPE_TO_FILE[type]) {
      const detail = document.getElementById('detail');
      if (detail) {
        const message = document.createElement('p');
        message.textContent = 'Saknade eller ogiltiga query-parametrar.';
        detail.appendChild(message);
      }
      return;
    }

    renderDetail(type, id, db);
    return;
  }

  if (TYPE_TO_FILE[page]) {
    renderList(page, db);
  }
}

run().catch((error) => {
  const main = document.querySelector('main');
  if (main) {
    const p = document.createElement('p');
    p.textContent = `Fel: ${error.message}`;
    main.appendChild(p);
  }
});
