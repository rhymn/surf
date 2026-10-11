import { loadQuestionBank, filterQuestions, createRound, checkAnswer } from './quiz-bank.mjs';

const element = id => document.getElementById(id);
const storageKey = 'harrypotter.quiz.v1';
const categoryNames = { actors: 'Skådespelare', characters: 'Karaktärer', pets: 'Husdjur', objects: 'Objects' };
const params = new URLSearchParams(location.search);
const entity = params.get('type') && params.get('id') ? { type: params.get('type'), id: params.get('id') } : null;
let bank = [];
let byId = new Map();
let progress = {};
let session = null;

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, progress, session }));
  } catch {
    element('quiz-status').textContent = 'Framsteg kan inte sparas i den här webbläsaren.';
    element('quiz-status').dataset.warning = 'true';
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved?.version !== 1) return;
    if (saved.progress && typeof saved.progress === 'object' && !Array.isArray(saved.progress)) {
      progress = Object.fromEntries(Object.entries(saved.progress).filter(([id, correct]) => byId.has(id) && typeof correct === 'boolean'));
    }
    const candidate = saved.session;
    if (!candidate || !Array.isArray(candidate.round) || candidate.round.length === 0 || candidate.round.length > 50 ||
        !Number.isInteger(candidate.cursor) || candidate.cursor < 0 || candidate.cursor > candidate.round.length ||
        !Array.isArray(candidate.answers) || candidate.answers.length !== candidate.round.length ||
        new Set(candidate.round.map(item => item?.id)).size !== candidate.round.length) return;
    const valid = candidate.round.every((item, index) => byId.has(item?.id) && byId.get(item.id).reviewStatus === 'reviewed' &&
      Array.isArray(item.order) && item.order.length === 4 && new Set(item.order).size === 4 &&
      item.order.every(option => Number.isInteger(option) && option >= 0 && option < 4) &&
      (candidate.answers[index] === null || (Number.isInteger(candidate.answers[index]) && candidate.answers[index] >= 0 && candidate.answers[index] < 4)) &&
      (index < candidate.cursor ? candidate.answers[index] !== null : index > candidate.cursor ? candidate.answers[index] === null : true));
    if (valid) session = candidate;
  } catch {
    session = null;
  }
}

function eligible() {
  return filterQuestions(bank, {
    canon: element('canon').value,
    category: element('category').value,
    difficulty: [...element('difficulty').querySelectorAll('input:checked')].map(input => input.value),
    spoilerThroughBook: Number(element('spoilers').value),
    entity
  });
}

function updateSettings() {
  const questions = eligible();
  element('available').textContent = questions.length === 0 ? 'Inga granskade frågor matchar dina val.' : `${questions.length} frågor tillgängliga`;
  element('start').disabled = questions.length === 0;
  element('practice').disabled = !questions.some(question => progress[question.id] === false);
  const values = Object.values(progress);
  element('progress').textContent = `${values.filter(Boolean).length} rätt av ${values.length} besvarade frågor i frågebanken`;
  element('progress').hidden = values.length === 0;
}

function start(practice = false) {
  let questions = eligible();
  if (practice) questions = questions.filter(question => progress[question.id] === false);
  if (!questions.length) return;
  const previousQuestionIds = session ? session.round.slice(0, session.cursor + 1).map(item => item.id) : [];
  const round = createRound(questions, Number(element('count').value), Math.random, previousQuestionIds);
  session = { round: round.map(item => ({ id: item.question.id, order: item.options.map(option => option.index) })), cursor: 0, answers: round.map(() => null) };
  save();
  render();
}

function detailLink(reference, text) {
  const link = document.createElement('a');
  link.href = `detail.html?type=${encodeURIComponent(reference.type)}&id=${encodeURIComponent(reference.id)}`;
  link.textContent = text;
  return link;
}

function render() {
  updateSettings();
  document.body.dataset.playing = String(Boolean(session && session.cursor < session.round.length));
  element('settings-panel').open = !session || session.cursor === session.round.length;
  element('round').hidden = !session || session.cursor === session.round.length;
  element('result').hidden = !session || session.cursor !== session.round.length;
  if (!session) return;
  if (session.cursor === session.round.length) {
    const score = session.round.filter((item, index) => checkAnswer(byId.get(item.id), session.answers[index])).length;
    element('score').textContent = `${score} rätt av ${session.round.length} frågor`;
    element('result-title').focus();
    return;
  }
  const item = session.round[session.cursor];
  const question = byId.get(item.id);
  const selected = session.answers[session.cursor];
  const answered = selected !== null;
  element('round-progress').textContent = `Fråga ${session.cursor + 1} av ${session.round.length}`;
  element('question-title').textContent = question.question;
  const options = element('answer-options');
  options.replaceChildren();
  const legend = document.createElement('legend');
  legend.textContent = 'Välj ett svar';
  options.appendChild(legend);
  for (const index of item.order) {
    const paragraph = document.createElement('p');
    const button = document.createElement('button');
    button.type = 'button';
    button.name = 'option';
    button.value = String(index);
    button.textContent = question.options[index];
    button.dataset.selected = String(selected === index);
    if (selected === index) button.setAttribute('aria-label', `Ditt svar: ${question.options[index]}`);
    paragraph.appendChild(button);
    options.appendChild(paragraph);
  }
  options.disabled = answered;
  element('next').hidden = !answered;
  element('next').textContent = session.cursor === session.round.length - 1 ? 'Visa resultat' : 'Nästa fråga';
  element('feedback').replaceChildren();
  element('source').replaceChildren();
  element('related').replaceChildren();
  element('answer-details').hidden = !answered;
  element('answer-details').open = false;
  if (answered) {
    const feedback = document.createElement('p');
    feedback.textContent = checkAnswer(question, selected) ? 'Rätt!' : `Fel. Rätt svar: ${question.options[question.correctOptionIndex]}.`;
    element('feedback').appendChild(feedback);
    const explanation = document.createElement('p');
    explanation.textContent = question.explanation;
    element('source').appendChild(explanation);
    const source = document.createElement('p');
    if (question.source.type === 'wiki') {
      source.append('Källa: ', detailLink({ type: question.source.entityType, id: question.source.entityId }, 'Harry Potter-wikin'));
    } else {
      source.textContent = question.source.type === 'book' ? `Källa: bok ${question.source.book}, kapitel ${question.source.chapter}` : `Källa: ${question.source.title}, ${question.source.scene}`;
    }
    element('source').appendChild(source);
    for (const reference of question.entities) {
      const entry = document.createElement('li');
      entry.appendChild(detailLink(reference, `${categoryNames[reference.type] || reference.type}: ${reference.id}`));
      element('related').appendChild(entry);
    }
    element('next').focus({ preventScroll: true });
    element('feedback').scrollIntoView({ block: 'nearest' });
  } else {
    element('question-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }
}

element('quiz-settings').addEventListener('submit', event => {
  event.preventDefault();
  start();
});
element('quiz-settings').addEventListener('change', updateSettings);
element('practice').addEventListener('click', () => start(true));
element('answer-options').addEventListener('click', event => {
  if (!session || session.cursor >= session.round.length || session.answers[session.cursor] !== null) return;
  const button = event.target.closest('button[name="option"]');
  if (!button) return;
  const index = Number(button.value);
  if (!Number.isInteger(index) || index < 0 || index > 3) return;
  const question = byId.get(session.round[session.cursor].id);
  session.answers[session.cursor] = index;
  progress[question.id] = checkAnswer(question, index);
  save();
  render();
});
element('next').addEventListener('click', () => {
  if (!session || session.cursor >= session.round.length || session.answers[session.cursor] === null) return;
  session.cursor += 1;
  save();
  render();
});

try {
  bank = await loadQuestionBank();
  byId = new Map(bank.map(question => [question.id, question]));
  for (const category of [...new Set(bank.filter(question => question.reviewStatus === 'reviewed').map(question => question.category))].sort()) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = categoryNames[category] || category;
    element('category').appendChild(option);
  }
  if (entity) {
    element('entity-filter').hidden = false;
    element('entity-filter').append(`Quiz: ${entity.id} `);
    const clear = document.createElement('a');
    clear.href = 'quiz.html';
    clear.textContent = 'Alla frågor';
    element('entity-filter').appendChild(clear);
  }
  restore();
  if (entity && session && !session.round.every(item => byId.get(item.id).entities.some(reference => reference.type === entity.type && reference.id === entity.id))) session = null;
  element('settings-fields').disabled = false;
  const playableCount = filterQuestions(bank).length;
  const draftCount = bank.filter(question => question.reviewStatus === 'draft' && question.language === 'sv').length;
  element('quiz-status').textContent = `${playableCount + draftCount} frågor: ${playableCount} spelbara, ${draftCount} utkast`;
  render();
} catch {
  element('quiz-status').textContent = 'Kunde inte ladda frågebanken. Försök ladda om sidan.';
}