import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  areUnitPrerequisitesComplete,
  findResumableLesson,
  persistLastActiveLesson,
  readLastActiveLesson
} from "../scripts/course-progress.mjs";

const activeLesson = {
  schemaVersion: 1,
  courseId: "n5",
  lessonId: "n5-lesson-2",
  updatedAt: "2026-11-05T17:00:00.000Z"
};

const course = {
  id: "n5",
  units: [
    {
      id: "n5-unit-1",
      prerequisites: [],
      lessons: [
        { id: "n5-lesson-1", prerequisites: [] },
        { id: "n5-lesson-2", prerequisites: ["n5-lesson-1"] }
      ]
    },
    {
      id: "n5-unit-2",
      prerequisites: ["n5-unit-1"],
      lessons: [
        { id: "n5-lesson-3", prerequisites: ["n5-lesson-2"] }
      ]
    }
  ]
};

test("persists and restores a versioned last-active lesson pointer", () => {
  const storage = {
    value: null,
    setItem(key, value) {
      assert.equal(key, "last-active");
      this.value = value;
    },
    getItem(key) {
      assert.equal(key, "last-active");
      return this.value;
    }
  };

  assert.equal(persistLastActiveLesson(storage, "last-active", activeLesson), true);
  assert.deepEqual(JSON.parse(storage.value), activeLesson);
  assert.deepEqual(readLastActiveLesson(storage, "last-active"), activeLesson);
});

test("ignores malformed, unsupported, and incomplete last-active records", () => {
  for (const raw of [
    "{broken json",
    "[]",
    "null",
    JSON.stringify({ ...activeLesson, schemaVersion: 2 }),
    JSON.stringify({ ...activeLesson, courseId: "" }),
    JSON.stringify({ ...activeLesson, lessonId: 42 }),
    JSON.stringify({ ...activeLesson, updatedAt: "not-a-date" })
  ]) {
    assert.equal(
      readLastActiveLesson({ getItem: () => raw }, "last-active"),
      null
    );
  }

  assert.equal(readLastActiveLesson(null, "last-active"), null);
  assert.equal(readLastActiveLesson({}, "last-active"), null);
  assert.equal(readLastActiveLesson({ getItem() { throw new Error("SecurityError"); } }, "last-active"), null);
});

test("reports unavailable, invalid, and quota-exceeded storage without claiming persistence", () => {
  assert.equal(persistLastActiveLesson(null, "last-active", activeLesson), false);
  assert.equal(persistLastActiveLesson({}, "last-active", activeLesson), false);
  assert.equal(persistLastActiveLesson({ setItem() { throw new Error("QuotaExceededError"); } }, "last-active", activeLesson), false);
  assert.equal(persistLastActiveLesson({ setItem() {} }, "last-active", { ...activeLesson, lessonId: "" }), false);
});

test("resolves an unlocked last-active lesson in its matching course", () => {
  const result = findResumableLesson(
    course,
    { "n5-lesson-1": { completedAt: "2026-11-05T16:00:00.000Z" } },
    activeLesson
  );

  assert.equal(result.unit.id, "n5-unit-1");
  assert.equal(result.lesson.id, "n5-lesson-2");
});

test("does not unlock a unit when a prerequisite unit has no lessons", () => {
  const emptyUnit = { id: "empty-unit", prerequisites: [], lessons: [] };
  const targetUnit = {
    id: "target-unit",
    prerequisites: ["empty-unit"],
    lessons: [{ id: "n5-lesson-2", prerequisites: [] }]
  };

  assert.equal(
    areUnitPrerequisitesComplete(targetUnit, [emptyUnit, targetUnit], () => true),
    false
  );
  assert.equal(
    findResumableLesson(
      { id: "n5", units: [emptyUnit, targetUnit] },
      {},
      activeLesson
    ),
    null
  );
});

test("requires every lesson in a prerequisite unit to be complete", () => {
  const prerequisite = {
    id: "unit-1",
    lessons: [{ id: "lesson-1" }, { id: "lesson-2" }]
  };
  const target = { id: "unit-2", prerequisites: ["unit-1"] };
  const units = [prerequisite, target];

  assert.equal(
    areUnitPrerequisitesComplete(target, units, (id) => id === "lesson-1"),
    false
  );
  assert.equal(
    areUnitPrerequisitesComplete(target, units, () => true),
    true
  );
  assert.equal(
    areUnitPrerequisitesComplete({ id: "first-unit", prerequisites: [] }, units, () => false),
    true
  );
});

test("course UI uses the shared unit prerequisite guard", async () => {
  const ui = await readFile(new URL("../courses.js", import.meta.url), "utf8");
  assert.match(
    ui,
    /function isUnitUnlocked\(unit\)\s*\{\s*return areUnitPrerequisitesComplete\(unit, courseState\.course\.units, isComplete\);\s*\}/
  );
});

test("does not resume a lesson from another course, an unknown lesson, or a locked unit", () => {
  assert.equal(
    findResumableLesson(course, {}, { ...activeLesson, courseId: "n4" }),
    null
  );
  assert.equal(
    findResumableLesson(course, {}, { ...activeLesson, lessonId: "missing-lesson" }),
    null
  );
  assert.equal(
    findResumableLesson(course, {}, { ...activeLesson, lessonId: "n5-lesson-3" }),
    null
  );
});

test("does not unlock a lesson from stale progress for a removed prerequisite", () => {
  const courseWithRemovedPrerequisite = {
    id: "n5",
    units: [{
      id: "n5-unit-1",
      prerequisites: [],
      lessons: [{
        id: "n5-lesson-2",
        prerequisites: ["removed-lesson"]
      }]
    }]
  };
  const staleProgress = {
    "removed-lesson": { completedAt: "2026-11-05T16:00:00.000Z" }
  };

  assert.equal(
    findResumableLesson(courseWithRemovedPrerequisite, staleProgress, activeLesson),
    null
  );
});

test("allows a previously completed lesson to be resumed for review", () => {
  const result = findResumableLesson(
    course,
    { "n5-lesson-2": { completedAt: "2026-11-05T16:00:00.000Z" } },
    activeLesson
  );

  assert.equal(result.lesson.id, "n5-lesson-2");
});

test("moves keyboard focus to the visible heading when switching course views", async () => {
  const [html, ui] = await Promise.all([
    readFile(new URL("../courses.html", import.meta.url), "utf8"),
    readFile(new URL("../courses.js", import.meta.url), "utf8")
  ]);

  assert.match(html, /<h2 id="courseTitle" tabindex="-1">/);
  assert.match(html, /<h2 id="lessonTitle" tabindex="-1">/);

  const openStart = ui.indexOf("function openLesson(");
  const returnStart = ui.indexOf("function showCourse()");
  const assessmentStart = ui.indexOf("function submitAssessment(");
  assert.ok(openStart >= 0 && returnStart > openStart && assessmentStart > returnStart);

  const openLesson = ui.slice(openStart, returnStart);
  const showCourse = ui.slice(returnStart, assessmentStart);
  assert.ok(openLesson.indexOf('el("lessonView").hidden = false;') < openLesson.indexOf('el("lessonTitle").focus();'));
  assert.ok(showCourse.indexOf('el("courseOverview").hidden = false;') < showCourse.indexOf('el("courseTitle").focus();'));
});
