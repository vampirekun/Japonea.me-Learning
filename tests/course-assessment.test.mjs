import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLessonAssessmentQuestions,
  canCompleteLessonAssessment,
  getMinimumAttempts,
  persistCourseProgress,
  recordLessonAssessmentAttempt
} from "../scripts/course-assessment.mjs";

const earlierLesson = {
  id: "n5-lesson-1",
  learningItems: [{
    id: "n5-greeting-konnichiwa",
    prompt: "こんにちは",
    answer: "Hola",
    examples: []
  }]
};

const currentLesson = {
  id: "n5-lesson-2",
  reviewSet: ["n5-greeting-konnichiwa"],
  learningItems: [{
    id: "n5-animal-neko",
    prompt: "ねこ",
    answer: "Gato",
    examples: []
  }],
  completionPolicy: { minCorrect: 0.8, minAttempts: 1 }
};

test("builds lesson questions only from the explicit reviewSet, including earlier lesson items", () => {
  const questions = buildLessonAssessmentQuestions(
    currentLesson,
    [earlierLesson, currentLesson],
    5,
    () => 0.5
  );

  assert.equal(questions.length, 2);
  assert.ok(questions.every((question) => question.prompt.includes(String.fromCharCode(10))));
  assert.ok(questions.every((question) => !question.prompt.includes(String.fromCharCode(92) + "n")));
  assert.ok(questions.every((question) =>
    question.prompt.includes("こんにちは") || question.prompt.includes("Hola")
  ));
  assert.ok(questions.every((question) =>
    question.correct === "Hola" || question.correct === "こんにちは"
  ));
  assert.ok(questions.every((question) => question.options.includes(question.correct)));
  assert.ok(questions.every((question) => new Set(question.options).size === question.options.length));
  assert.ok(!questions.some((question) =>
    question.prompt.includes("ねこ") || question.correct === "Gato"
  ));
});

test("does not silently replace an explicit empty or unresolved reviewSet with unrelated lesson content", () => {
  const emptyReview = { ...currentLesson, reviewSet: [] };
  const unresolvedReview = { ...currentLesson, reviewSet: ["missing-item"] };
  const partiallyUnresolvedReview = {
    ...currentLesson,
    reviewSet: ["n5-greeting-konnichiwa", "missing-item"]
  };

  assert.deepEqual(buildLessonAssessmentQuestions(emptyReview, [currentLesson]), []);
  assert.deepEqual(buildLessonAssessmentQuestions(unresolvedReview, [currentLesson]), []);
  assert.deepEqual(
    buildLessonAssessmentQuestions(partiallyUnresolvedReview, [earlierLesson, partiallyUnresolvedReview]),
    []
  );
});

test("supports legacy lessons that do not yet declare reviewSet", () => {
  const legacyLesson = { ...currentLesson };
  delete legacyLesson.reviewSet;

  const questions = buildLessonAssessmentQuestions(legacyLesson, [legacyLesson], 5, () => 0.5);
  assert.equal(questions.length, 2);
  assert.ok(questions.every((question) =>
    question.prompt.includes("ねこ") || question.prompt.includes("Gato")
  ));
});

test("caps assessment size and respects the configured minimum attempt count", () => {
  const lesson = {
    ...currentLesson,
    reviewSet: ["n5-greeting-konnichiwa", "n5-animal-neko"],
    completionPolicy: { minCorrect: 0.8, minAttempts: 2 }
  };
  const questions = buildLessonAssessmentQuestions(lesson, [earlierLesson, lesson], 5, () => 0.5);

  assert.ok(questions.length <= 5);
  assert.equal(getMinimumAttempts(lesson), 2);
  assert.equal(canCompleteLessonAssessment({ passed: true, attempts: 1 }, lesson), false);
  assert.equal(canCompleteLessonAssessment({ passed: true, attempts: 2 }, lesson), true);
  assert.equal(canCompleteLessonAssessment({ passed: false, attempts: 2 }, lesson), false);
});

test("preserves the highest score across persisted assessment attempts", () => {
  const firstAttempt = recordLessonAssessmentAttempt(
    { "n5-lesson-2": { note: "keep this" }, otherLesson: { completedAt: "2026-01-01" } },
    "n5-lesson-2",
    1,
    100
  );
  const secondAttempt = recordLessonAssessmentAttempt(firstAttempt, "n5-lesson-2", 2, 80);

  assert.deepEqual(secondAttempt["n5-lesson-2"], {
    note: "keep this",
    assessmentAttempts: 2,
    bestScore: 100
  });
  assert.deepEqual(secondAttempt.otherLesson, { completedAt: "2026-01-01" });

  const thirdAttempt = recordLessonAssessmentAttempt(secondAttempt, "n5-lesson-2", 3, 95);
  assert.equal(thirdAttempt["n5-lesson-2"].bestScore, 100);
  assert.equal(thirdAttempt["n5-lesson-2"].assessmentAttempts, 3);
});

test("rejects invalid assessment attempt records", () => {
  assert.throws(() => recordLessonAssessmentAttempt({}, "lesson-1", 0, 80), /positive integer/);
  assert.throws(() => recordLessonAssessmentAttempt({}, "lesson-1", 1, 101), /between 0 and 100/);
  assert.throws(() => recordLessonAssessmentAttempt({}, "", 1, 80), /non-empty string/);
});

test("reports local-storage failures instead of claiming progress was saved", () => {
  let written = null;
  const workingStorage = {
    setItem(key, value) {
      written = { key, value };
    }
  };

  assert.equal(
    persistCourseProgress(workingStorage, "course-progress", { lesson: { assessmentAttempts: 1 } }),
    true
  );
  assert.deepEqual(written, {
    key: "course-progress",
    value: JSON.stringify({ lesson: { assessmentAttempts: 1 } })
  });

  const quotaExceededStorage = {
    setItem() {
      throw new Error("QuotaExceededError");
    }
  };
  assert.equal(
    persistCourseProgress(quotaExceededStorage, "course-progress", { lesson: { completedAt: "now" } }),
    false
  );
  assert.equal(persistCourseProgress(null, "course-progress", {}), false);
});


test("keeps the minimum-attempt gate and best score across a storage reload", () => {
  const lesson = {
    ...currentLesson,
    completionPolicy: { minCorrect: 0.8, minAttempts: 2 }
  };
  const storage = {
    value: null,
    setItem(_key, value) {
      this.value = value;
    }
  };

  const firstAttempt = recordLessonAssessmentAttempt({}, lesson.id, 1, 100);
  assert.equal(persistCourseProgress(storage, "course-progress", firstAttempt), true);
  const restoredAfterFirst = JSON.parse(storage.value);

  assert.equal(restoredAfterFirst[lesson.id].assessmentAttempts, 1);
  assert.equal(restoredAfterFirst[lesson.id].bestScore, 100);
  assert.equal(
    canCompleteLessonAssessment(
      { passed: true, attempts: restoredAfterFirst[lesson.id].assessmentAttempts },
      lesson
    ),
    false
  );

  const secondAttempt = recordLessonAssessmentAttempt(restoredAfterFirst, lesson.id, 2, 80);
  assert.equal(persistCourseProgress(storage, "course-progress", secondAttempt), true);
  const restoredAfterSecond = JSON.parse(storage.value);

  assert.equal(restoredAfterSecond[lesson.id].assessmentAttempts, 2);
  assert.equal(restoredAfterSecond[lesson.id].bestScore, 100);
  assert.equal(
    canCompleteLessonAssessment(
      { passed: true, attempts: restoredAfterSecond[lesson.id].assessmentAttempts },
      lesson
    ),
    true
  );
});
