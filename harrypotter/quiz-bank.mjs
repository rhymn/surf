const entityTypes = ['characters', 'actors', 'pets', 'years', 'relationships'];

export function validateQuestions(questions) {
  if (!Array.isArray(questions)) throw new Error('Question bank must be an array.');
  const ids = new Set();
  const prompts = new Set();
  for (const question of questions) {
    const validText = value => typeof value === 'string' && value.trim().length > 0;
    if (!question || !validText(question.id) || ids.has(question.id) ||
        !validText(question.question) || prompts.has(question.question.trim()) ||
        !validText(question.language) || !validText(question.category) ||
        !['book', 'film'].includes(question.canon) ||
        !['easy', 'medium', 'hard', 'extreme'].includes(question.difficulty) ||
        !['draft', 'reviewed'].includes(question.reviewStatus) ||
        !Number.isInteger(question.spoilerThroughBook) || question.spoilerThroughBook < 1 || question.spoilerThroughBook > 7 ||
        !Array.isArray(question.options) || question.options.length !== 4 ||
        !question.options.every(validText) || new Set(question.options.map(option => option.trim())).size !== 4 ||
        !Number.isInteger(question.correctOptionIndex) || question.correctOptionIndex < 0 || question.correctOptionIndex > 3 ||
        !validText(question.explanation) || !question.source ||
        !Array.isArray(question.entities) || !question.entities.every(entity => entity && entityTypes.includes(entity.type) && validText(entity.id))) {
      throw new Error(`Invalid or duplicate question: ${question?.id ?? 'unknown'}`);
    }
    const source = question.source;
    if (source.type === 'wiki') {
      if (!entityTypes.includes(source.entityType) || !validText(source.entityId) || !validText(source.field)) {
        throw new Error(`Invalid wiki source: ${question.id}`);
      }
    } else if (source.type === 'book') {
      if (!Number.isInteger(source.book) || source.book < 1 || source.book > 7 || !Number.isInteger(source.chapter) || source.chapter < 1) {
        throw new Error(`Invalid book source: ${question.id}`);
      }
    } else if (source.type === 'film') {
      if (!validText(source.title) || !validText(source.scene)) throw new Error(`Invalid film source: ${question.id}`);
    } else {
      throw new Error(`Unknown source type: ${question.id}`);
    }
    ids.add(question.id);
    prompts.add(question.question.trim());
  }
  return questions;
}

export async function loadQuestionBank(baseURL = './data/quiz/', fetcher = fetch) {
  const readJSON = async filename => {
    const response = await fetcher(`${baseURL}${filename}`);
    if (!response.ok) throw new Error(`Could not load ${filename}.`);
    return response.json();
  };
  const manifest = await readJSON('manifest.json');
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length === 0 ||
      !manifest.files.every(filename => typeof filename === 'string' && /^[a-z0-9-]+\.json$/.test(filename)) ||
      new Set(manifest.files).size !== manifest.files.length) throw new Error('Invalid question manifest.');
  const banks = await Promise.all(manifest.files.map(readJSON));
  banks.forEach(validateQuestions);
  return validateQuestions(banks.flat());
}

export function filterQuestions(questions, { category = 'all', canon = 'all', difficulty = 'all', spoilerThroughBook = 7, language = 'sv', entity = null } = {}) {
  const difficulties = Array.isArray(difficulty) ? difficulty : difficulty === 'all' ? null : [difficulty];
  return questions.filter(question => question.reviewStatus === 'reviewed' && question.language === language &&
    (category === 'all' || question.category === category) && (canon === 'all' || question.canon === canon) &&
    (!difficulties || difficulties.includes(question.difficulty)) && question.spoilerThroughBook <= spoilerThroughBook &&
    (!entity || question.entities.some(reference => reference.type === entity.type && reference.id === entity.id)));
}

export function shuffle(items, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

export function createRound(questions, count = 10, random = Math.random) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid round length.');
  return shuffle(questions, random).slice(0, count).map(question => ({
    question,
    options: shuffle(question.options.map((text, index) => ({ text, index })), random)
  }));
}

export function checkAnswer(question, optionIndex) {
  return Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < question.options.length && optionIndex === question.correctOptionIndex;
}

export function publicQuestion(question) {
  return { id: question.id, question: question.question, options: [...question.options], category: question.category, difficulty: question.difficulty };
}