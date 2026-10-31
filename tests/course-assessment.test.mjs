import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLessonAssessmentQuestions,
  canCompleteLessonAssessment,
  getMinimumAttempts
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

  assert.deepEqual(buildLessonAssessmentQuestions(emptyReview, [currentLesson]), []);
  assert.deepEqual(buildLessonAssessmentQuestions(unresolvedReview, [currentLesson]), []);
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
