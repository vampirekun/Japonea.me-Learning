import assert from "node:assert/strict";
import test from "node:test";

import { validateCourseSet } from "../scripts/validate-course-data.mjs";

function fixture() {
  return {
    courses: [
      {
        schemaVersion: 1,
        id: "n5",
        level: "N5",
        title: "Japonés inicial",
        language: "ja",
        locale: "es-MX",
        alignment: "jlpt-aligned",
        prerequisites: [],
        completionPolicy: { requiredLessons: "all" },
        units: [
          {
            id: "n5-unit-1",
            title: "Primeros encuentros",
            order: 1,
            prerequisites: [],
            lessons: [
              {
                id: "n5-lesson-1",
                title: "Saludos",
                order: 1,
                objectives: ["Reconocer saludos."],
                topics: ["greetings"],
                sourceRefs: [{ batchId: "batch-1", category: "phrases" }],
                learningItems: [
                  {
                    id: "n5-item-1",
                    type: "vocabulary",
                    prompt: "こんにちは",
                    answer: "Hola",
                    examples: []
                  }
                ],
                reviewSet: ["n5-item-1"],
                completionPolicy: { minCorrect: 0.8, minAttempts: 1 }
              }
            ]
          }
        ]
      }
    ],
    batches: {
      batches: [
        { id: "batch-1", title: "Batch 1", categories: { phrases: [] } }
      ]
    }
  };
}

test("accepts a valid course and its source batch references", () => {
  const { courses, batches } = fixture();
  assert.deepEqual(validateCourseSet(courses, batches), []);
});

test("accepts lesson prerequisites that point to an earlier unit", () => {
  const { courses, batches } = fixture();
  const course = courses[0];
  course.units.push({
    id: "n5-unit-2",
    title: "Presentaciones",
    order: 2,
    prerequisites: ["n5-unit-1"],
    lessons: [
      {
        id: "n5-lesson-2",
        title: "Presentarse",
        order: 1,
        prerequisites: ["n5-lesson-1"],
        objectives: ["Presentarse."],
        topics: ["introductions"],
        sourceRefs: [{ batchId: "batch-1", category: "phrases" }],
        learningItems: [
          {
            id: "n5-item-2",
            type: "grammar",
            prompt: "わたしはアレハンドロです。",
            answer: "Soy Alejandro.",
            examples: []
          }
        ],
        reviewSet: ["n5-item-1", "n5-item-2"],
        completionPolicy: { minCorrect: 0.8, minAttempts: 1 }
      }
    ]
  });
  assert.deepEqual(validateCourseSet(courses, batches), []);
});

test("rejects unit prerequisites that point forward in course order", () => {
  const { courses, batches } = fixture();
  const course = courses[0];
  course.units[0].prerequisites = ["n5-unit-2"];
  course.units.push({
    id: "n5-unit-2",
    title: "Presentaciones",
    order: 2,
    prerequisites: [],
    lessons: [{
      id: "n5-lesson-2",
      title: "Presentarse",
      order: 1,
      objectives: ["Presentarse."],
      sourceRefs: [{ batchId: "batch-1", category: "phrases" }],
      learningItems: [{ id: "n5-item-2", type: "grammar", prompt: "わたしはアレハンドロです。", answer: "Soy Alejandro.", examples: [] }],
      reviewSet: ["n5-item-2"],
      completionPolicy: { minCorrect: 0.8, minAttempts: 1 }
    }]
  });
  const errors = validateCourseSet(courses, batches);
  assert.ok(errors.some(error => error.includes('unit prerequisite "n5-unit-2" must appear before this unit')));
});

test("rejects lesson prerequisites that point forward in course order", () => {
  const { courses, batches } = fixture();
  const lesson = courses[0].units[0].lessons[0];
  lesson.prerequisites = ["n5-lesson-2"];
  const laterLesson = {
    ...lesson,
    id: "n5-lesson-2",
    title: "Presentarse",
    order: 2,
    prerequisites: [],
    learningItems: lesson.learningItems.map(item => ({ ...item, id: "n5-item-2" })),
    reviewSet: ["n5-item-2"]
  };
  courses[0].units[0].lessons.push(laterLesson);
  const errors = validateCourseSet(courses, batches);
  assert.ok(errors.some(error => error.includes('lesson prerequisite "n5-lesson-2" must appear before this lesson')));
});
test("reports duplicate ids and dangling review references", () => {
  const { courses, batches } = fixture();
  const lesson = courses[0].units[0].lessons[0];
  lesson.learningItems.push({ ...lesson.learningItems[0] });
  lesson.reviewSet = ["missing-item"];

  const errors = validateCourseSet(courses, batches);
  assert.ok(errors.some(error => error.includes("Duplicate id")));
  assert.ok(errors.some(error => error.includes('unknown reviewSet item "missing-item"')));
});

test("reports missing source batches and categories", () => {
  const { courses, batches } = fixture();
  courses[0].units[0].lessons[0].sourceRefs = [
    { batchId: "missing-batch", category: "phrases" },
    { batchId: "batch-1", category: "missing-category" }
  ];

  const errors = validateCourseSet(courses, batches);
  assert.ok(errors.some(error => error.includes('unknown source batch "missing-batch"')));
  assert.ok(errors.some(error => error.includes('unknown category "batch-1/missing-category"')));
});

test("rejects invalid completion thresholds and unsupported item types", () => {
  const { courses, batches } = fixture();
  const lesson = courses[0].units[0].lessons[0];
  lesson.completionPolicy.minCorrect = 1.2;
  lesson.learningItems[0].type = "animation";

  const errors = validateCourseSet(courses, batches);
  assert.ok(errors.some(error => error.includes("minCorrect must be between 0 and 1")));
  assert.ok(errors.some(error => error.includes('unsupported learning item type "animation"')));
});

test("reports malformed null records without crashing", () => {
  const { courses, batches } = fixture();
  courses[0].units.push(null);
  batches.batches.push(null);

  const errors = validateCourseSet(courses, batches);
  assert.ok(errors.some(error => error.includes("positive integer order")));
  assert.ok(errors.some(error => error.includes("Every batch must have a non-empty id")));
});
