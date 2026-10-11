import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadQuestionBank, validateQuestions, filterQuestions, createRound, checkAnswer, publicQuestion } from '../quiz-bank.mjs';

const fetcher = async filename => ({ ok: true, json: async () => JSON.parse(await readFile(new URL(`../data/quiz/${filename}`, import.meta.url), 'utf8')) });
const bank = await loadQuestionBank('', fetcher);
const starter = bank.filter(question => /^film-00[1-5]$|^world-00[1-8]$/.test(question.id));

test('Scabbers keeps its stable ID and Swedish name in the wiki and quiz', async () => {
  const pets = JSON.parse(await readFile(new URL('../data/pets.json', import.meta.url), 'utf8'));
  assert.equal(pets.find(pet => pet.id === 'scabbers').name, 'Scabbers');
  const question = bank.find(question => question.id === 'world-005');
  assert.equal(question.options[question.correctOptionIndex], 'Scabbers');
  assert.ok(question.entities.some(entity => entity.type === 'pets' && entity.id === 'scabbers'));
  assert.equal(JSON.stringify(bank).includes('Skabbis'), false);
});

test('bank has valid questions, existing wiki references, and answers matching local sources', async () => {
  assert.ok(bank.length > 0);
  for (const question of bank) {
    const source = question.source;
    if (source.type === 'wiki') {
      const entities = JSON.parse(await readFile(new URL(`../data/${source.entityType}.json`, import.meta.url), 'utf8'));
      const entity = entities.find(item => item.id === source.entityId);
      assert.ok(entity, question.id);
      assert.equal(question.options[question.correctOptionIndex], entity[source.field], question.id);
    }
    for (const reference of question.entities) {
      const referenced = JSON.parse(await readFile(new URL(`../data/${reference.type}.json`, import.meta.url), 'utf8'));
      assert.ok(referenced.some(item => item.id === reference.id), question.id);
    }
  }
});

test('rejects duplicates, malformed answers, sources, and individual files', async () => {
  assert.throws(() => validateQuestions([bank[0], bank[0]]));
  assert.throws(() => validateQuestions([{ ...bank[0], correctOptionIndex: 4 }]));
  assert.throws(() => validateQuestions([{ ...bank[0], source: {} }]));
  assert.throws(() => validateQuestions([{ ...bank[0], options: ['a', 'a', 'b', 'c'] }]));
  await assert.rejects(loadQuestionBank('', async filename => ({ ok: true, json: async () => filename === 'manifest.json' ? { version: 1, files: ['bad.json'] } : {} })));
  await assert.rejects(loadQuestionBank('', async () => ({ ok: false })));
});

test('filters drafts, canon, spoilers, topics, difficulty, language, and entities', () => {
  const questions = filterQuestions([...starter, { ...starter[0], id: 'draft', reviewStatus: 'draft' }], { canon: 'book', spoilerThroughBook: 1, category: 'pets' });
  assert.equal(questions.length, 3);
  assert.ok(questions.every(question => question.canon === 'book' && question.reviewStatus === 'reviewed'));
  assert.equal(filterQuestions(starter, { language: 'en' }).length, 0);
  assert.ok(filterQuestions(starter, { difficulty: 'medium' }).every(question => question.difficulty === 'medium'));
  assert.equal(filterQuestions(starter, { entity: { type: 'characters', id: 'harry' } }).length, 3);
});

test('extreme difficulty validates and filters without admitting drafts or unknown levels', () => {
  const extreme = { ...starter[0], id: 'extreme-test', difficulty: 'extreme' };
  assert.doesNotThrow(() => validateQuestions([extreme]));
  assert.deepEqual(filterQuestions([starter[0], extreme], { difficulty: 'extreme' }), [extreme]);
  assert.deepEqual(filterQuestions([extreme], { difficulty: 'hard' }), []);
  assert.deepEqual(filterQuestions([{ ...extreme, reviewStatus: 'draft' }], { difficulty: 'extreme' }), []);
  assert.deepEqual(filterQuestions([extreme], { difficulty: 'all' }), [extreme]);
  assert.throws(() => validateQuestions([{ ...extreme, difficulty: 'unknown' }]));
});

test('difficulty selections combine levels and preserve single-level callers', () => {
  const questions = ['easy', 'medium', 'hard', 'extreme'].map(difficulty => ({ ...starter[0], id: `selection-${difficulty}`, difficulty }));
  const draft = { ...questions[3], id: 'selection-draft', reviewStatus: 'draft' };
  assert.deepEqual(filterQuestions([...questions, draft], { difficulty: ['medium', 'extreme'] }), [questions[1], questions[3]]);
  assert.deepEqual(filterQuestions(questions, { difficulty: [] }), []);
  assert.deepEqual(filterQuestions(questions, { difficulty: ['hard'] }), [questions[2]]);
  assert.deepEqual(filterQuestions(questions, { difficulty: ['hard', 'hard'] }), [questions[2]]);
  assert.deepEqual(filterQuestions(questions, { difficulty: 'hard' }), [questions[2]]);
  assert.deepEqual(filterQuestions(questions, { difficulty: 'all' }), questions);
});

test('hard difficulty has verified playable questions and still respects spoiler limits', () => {
  const hard = filterQuestions(bank, { difficulty: ['hard'] });
  const verifiedIds = ['book2-007', 'book4-015', 'book5-015'];
  const verified = verifiedIds.map(id => hard.find(question => question.id === id));
  assert.ok(verified.every(Boolean));
  assert.ok(hard.every(question => question.reviewStatus === 'reviewed'));
  for (const question of verified) {
    assert.equal(new URL(question.source.verificationUrl).hostname, 'www.hp-lexicon.org');
  }
  assert.deepEqual(filterQuestions(verified, { difficulty: 'hard', spoilerThroughBook: 1 }), []);
  assert.deepEqual(filterQuestions(verified, { difficulty: 'hard', spoilerThroughBook: 2 }).map(question => question.id), ['book2-007']);
});

test('rounds are capped, do not mutate the bank, and retain answer indices', () => {
  const original = JSON.stringify(bank);
  const round = createRound(bank, bank.length + 1, () => 0);
  assert.equal(round.length, bank.length);
  assert.equal(new Set(round.map(item => item.question.id)).size, bank.length);
  assert.equal(JSON.stringify(bank), original);
  for (const item of round) {
    assert.equal(item.options.filter(option => checkAnswer(item.question, option.index)).length, 1);
  }
  assert.equal(createRound([], 10).length, 0);
  assert.throws(() => createRound(bank, 0));
  assert.equal(checkAnswer(bank[0], '0'), false);
});

test('new rounds prioritize questions not recently shown and shuffle both groups', () => {
  const questions = bank.slice(0, 6);
  const previous = questions.slice(0, 3).map(question => question.id);
  const original = JSON.stringify(questions);
  const round = createRound(questions, 3, () => 0, previous);
  assert.deepEqual(round.map(item => item.question.id), [questions[4].id, questions[5].id, questions[3].id]);
  const longer = createRound(questions, 5, () => 0, previous);
  assert.equal(longer.filter(item => previous.includes(item.question.id)).length, 2);
  assert.equal(new Set(longer.map(item => item.question.id)).size, 5);
  assert.equal(JSON.stringify(questions), original);
  assert.deepEqual(previous, questions.slice(0, 3).map(question => question.id));
});

test('small pools avoid immediately repeating the last shown question when possible', () => {
  const questions = bank.slice(0, 3);
  const previous = [questions[0].id, questions[2].id, questions[1].id];
  const round = createRound(questions, 1, () => 0, previous);
  assert.notEqual(round[0].question.id, previous.at(-1));
  assert.equal(createRound([questions[0]], 10, () => 0, [questions[0].id]).length, 1);
  assert.equal(createRound([], 10, () => 0, previous).length, 0);
  const changedFilter = createRound(questions.slice(1), 2, () => 0, [questions[0].id]);
  assert.ok(changedFilter.every(item => item.question.id !== questions[0].id));
});

test('multiplayer projection withholds answers, explanations, and source metadata', () => {
  assert.deepEqual(Object.keys(publicQuestion(bank[0])).sort(), ['category', 'difficulty', 'id', 'options', 'question']);
});

test('book batches cover all seven books with valid chapter bounds and spoiler limits', () => {
  const chapterCounts = [17, 18, 22, 37, 38, 30, 36];
  const playableIds = new Set(filterQuestions(bank).map(question => question.id));
  for (let book = 1; book <= 7; book += 1) {
    const questions = bank.filter(question => question.source.type === 'book' && question.source.book === book);
    assert.ok(questions.length >= 15, `Missing questions for book ${book}`);
    assert.equal(new Set(questions.map(question => question.correctOptionIndex)).size, 4, `Answer positions for book ${book}`);
    for (const question of questions) {
      assert.equal(question.canon, 'book', question.id);
      assert.ok(question.id.startsWith(`book${book}-`), question.id);
      assert.ok(question.source.chapter <= chapterCounts[book - 1], question.id);
      assert.ok(question.spoilerThroughBook >= book, question.id);
      if (question.reviewStatus === 'draft') assert.equal(playableIds.has(question.id), false, question.id);
    }
  }
});

test('additional batch contains 49 Swedish questions across seven books and four levels', () => {
  const firstIds = [16, 18, 16, 16, 18, 16, 16];
  const additions = [];
  const playableIds = new Set(filterQuestions(bank).map(question => question.id));
  for (let book = 1; book <= 7; book += 1) {
    for (let offset = 0; offset < 7; offset += 1) {
      const id = `book${book}-${String(firstIds[book - 1] + offset).padStart(3, '0')}`;
      const question = bank.find(question => question.id === id);
      assert.ok(question, id);
      assert.equal(question.language, 'sv', id);
      assert.equal(question.source.book, book, id);
      if (question.reviewStatus === 'draft') assert.equal(playableIds.has(id), false, id);
      additions.push(question);
    }
  }
  assert.equal(additions.length, 49);
  assert.deepEqual([...new Set(additions.map(question => question.difficulty))].sort(), ['easy', 'extreme', 'hard', 'medium']);
});