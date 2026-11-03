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

export function recordLessonAssessmentAttempt(progress, lessonId, attempts, score) {
  if (typeof lessonId !== "string" || !lessonId.trim()) {
    throw new TypeError("lessonId must be a non-empty string");
  }
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError("attempts must be a positive integer");
  }
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new RangeError("score must be an integer between 0 and 100");
  }

  const currentProgress = progress && typeof progress === "object" && !Array.isArray(progress)
    ? progress
    : {};
  const previousLessonProgress = currentProgress[lessonId] && typeof currentProgress[lessonId] === "object"
    ? currentProgress[lessonId]
    : {};
  const previousBest = previousLessonProgress.bestScore;
  const bestScore = Number.isInteger(previousBest) && previousBest >= 0 && previousBest <= 100
    ? Math.max(previousBest, score)
    : score;

  return {
    ...currentProgress,
    [lessonId]: {
      ...previousLessonProgress,
      assessmentAttempts: attempts,
      bestScore
    }
  };
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
  // If any reference is invalid, fail closed instead of silently assessing a partial set.
  let reviewItems;
  if (Array.isArray(lesson?.reviewSet)) {
    const resolvedItems = lesson.reviewSet.map((id) => itemsById.get(id));
    if (!resolvedItems.length || resolvedItems.some((item) => !item)) return [];
    reviewItems = resolvedItems;
  } else {
    // Only legacy lessons without reviewSet fall back to their own learningItems.
    reviewItems = Array.isArray(lesson?.learningItems) ? lesson.learningItems : [];
  }

  const lessonPairs = uniquePairs(collectPairs(reviewItems));
  const allCourseItems = courseLessons.flatMap((courseLesson) =>
    Array.isArray(courseLesson?.learningItems) ? courseLesson.learningItems : []
  );
  const allCoursePairs = uniquePairs(collectPairs(allCourseItems));

  const bank = lessonPairs.flatMap((pair, index) => [
    {
      id: lesson.id + "-jp-" + index,
      prompt: "¿Qué significa esta expresión?\n" + pair.jp,
      correct: pair.es,
      direction: "es"
    },
    {
      id: lesson.id + "-es-" + index,
      prompt: "¿Qué expresión corresponde a esta traducción?\n" + pair.es,
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

export function persistCourseProgress(storage, key, progress) {
  try {
    if (!storage || typeof storage.setItem !== "function") return false;
    storage.setItem(key, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
