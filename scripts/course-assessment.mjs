function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function collectPairs(items) {
  return items.flatMap((item) => {
    const pairs = [];
    if (item?.prompt && item?.answer) {
      pairs.push({ jp: String(item.prompt), es: String(item.answer) });
    }
    (Array.isArray(item?.examples) ? item.examples : []).forEach((example) => {
      const jp = example?.jp || example?.kana;
      if (jp && example?.es) pairs.push({ jp: String(jp), es: String(example.es) });
    });
    return pairs;
  });
}

function uniquePairs(pairs) {
  const seen = new Set();
  return pairs.filter((pair) => {
    const key = JSON.stringify([
      pair.jp.normalize("NFKC").trim(),
      pair.es.normalize("NFKC").trim()
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getMinimumAttempts(lesson) {
  const value = lesson?.completionPolicy?.minAttempts;
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export function canCompleteLessonAssessment(assessment, lesson) {
  return Boolean(
    assessment?.passed &&
    Number.isInteger(assessment?.attempts) &&
    assessment.attempts >= getMinimumAttempts(lesson)
  );
}

export function buildLessonAssessmentQuestions(lesson, lessons, questionCount = 5, random = Math.random) {
  const courseLessons = Array.isArray(lessons) ? lessons : [lesson].filter(Boolean);
  const itemsById = new Map();

  courseLessons.forEach((courseLesson) => {
    (Array.isArray(courseLesson?.learningItems) ? courseLesson.learningItems : []).forEach((item) => {
      if (typeof item?.id === "string") itemsById.set(item.id, item);
    });
  });

  // An explicit reviewSet is authoritative and may reference items from earlier lessons.
  // Only legacy lessons without reviewSet fall back to their own learningItems.
  const reviewItems = Array.isArray(lesson?.reviewSet)
    ? lesson.reviewSet.map((id) => itemsById.get(id)).filter(Boolean)
    : (Array.isArray(lesson?.learningItems) ? lesson.learningItems : []);
  const lessonPairs = uniquePairs(collectPairs(reviewItems));
  const allCourseItems = courseLessons.flatMap((courseLesson) =>
    Array.isArray(courseLesson?.learningItems) ? courseLesson.learningItems : []
  );
  const allCoursePairs = uniquePairs(collectPairs(allCourseItems));

  const bank = lessonPairs.flatMap((pair, index) => [
    {
      id: lesson.id + "-jp-" + index,
      prompt: "¿Qué significa esta expresión?\\n" + pair.jp,
      correct: pair.es,
      direction: "es"
    },
    {
      id: lesson.id + "-es-" + index,
      prompt: "¿Qué expresión corresponde a esta traducción?\\n" + pair.es,
      correct: pair.jp,
      direction: "jp"
    }
  ]);
  const uniqueQuestions = bank.filter((question, index) =>
    bank.findIndex((candidate) =>
      candidate.prompt === question.prompt && candidate.correct === question.correct
    ) === index
  );
  const limit = Number.isInteger(questionCount) && questionCount >= 0 ? questionCount : 5;
  const selected = shuffle(uniqueQuestions, random).slice(0, limit);

  return selected.map((question) => {
    const answerPool = [...new Set(allCoursePairs.map((pair) =>
      question.direction === "es" ? pair.es : pair.jp
    ))].filter((answer) => answer && answer !== question.correct);
    const distractors = shuffle(answerPool, random).slice(0, 3);
    return {
      ...question,
      options: shuffle([...new Set([question.correct, ...distractors])], random)
    };
  });
}
