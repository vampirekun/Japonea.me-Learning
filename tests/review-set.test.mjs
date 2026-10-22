import assert from "node:assert/strict";
import test from "node:test";
import { selectReviewItems } from "../review-set.mjs";

const earlierItem = { id: "n5-greeting-konnichiwa", prompt: "こんにちは", answer: "Hola" };
const localItem = { id: "n5-grammar-desu", prompt: "です", answer: "ser/estar" };

test("uses configured review items from earlier lessons and deduplicates IDs", () => {
  const course = {
    units: [
      { lessons: [{ id: "lesson-1", learningItems: [earlierItem] }] },
      { lessons: [{ id: "lesson-2", learningItems: [localItem], reviewSet: [earlierItem.id, earlierItem.id] }] }
    ]
  };
  const lesson = course.units[1].lessons[0];
  assert.deepEqual(selectReviewItems(lesson, course), [earlierItem]);
});

test("preserves lesson-local behavior when no review set is configured", () => {
  const lesson = { learningItems: [localItem] };
  assert.deepEqual(selectReviewItems(lesson, { units: [] }), [localItem]);
});

test("falls back to lesson-local items when configured IDs no longer resolve", () => {
  const lesson = { learningItems: [localItem], reviewSet: ["deleted-item"] };
  assert.deepEqual(selectReviewItems(lesson, { units: [{ lessons: [lesson] }] }), [localItem]);
});
