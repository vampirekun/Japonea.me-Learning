#!/usr/bin/env node
/** Validate the static course model against existing vocabulary batches. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COURSE_DIR = join(ROOT, "data", "courses");
const BATCH_FILE = join(ROOT, "data", "batches.json");
const SUPPORTED_ITEM_TYPES = new Set([
  "vocabulary",
  "grammar",
  "kanji",
  "reading",
  "listening",
  "review"
]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateOrderList(records, context, errors) {
  const seen = new Set();
  for (const record of records) {
    if (!Number.isInteger(record?.order) || record.order < 1) {
      errors.push(`${context} ${record?.id ?? "(missing id)"} must have a positive integer order`);
      continue;
    }
    if (seen.has(record.order)) {
      errors.push(`${context} has duplicate order ${record.order}`);
    }
    seen.add(record.order);
  }
}

function validateAcyclicPrerequisites(records, context, errors) {
  const recordsById = new Map();
  for (const record of records) {
    if (isNonEmptyString(record?.id) && !recordsById.has(record.id)) {
      recordsById.set(record.id, record);
    }
  }

  const state = new Map();
  const path = [];
  const reportedCycles = new Set();

  function visit(id) {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      const cycleStart = path.indexOf(id);
      const cycle = path.slice(cycleStart).concat(id);
      if (cycle.length > 2) {
        const key = cycle.slice(0, -1).slice().sort().join("|");
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key);
          errors.push(`${context} prerequisite cycle detected: ${cycle.join(" -> ")}.`);
        }
      }
      return;
    }

    state.set(id, 1);
    path.push(id);
    const prerequisites = recordsById.get(id)?.prerequisites;
    if (Array.isArray(prerequisites)) {
      for (const prerequisite of prerequisites) {
        if (typeof prerequisite === "string" && prerequisite !== id && recordsById.has(prerequisite)) {
          visit(prerequisite);
        }
      }
    }
    path.pop();
    state.set(id, 2);
  }

  for (const id of recordsById.keys()) visit(id);
}

function comparePositions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function validateEarlierPrerequisites(records, context, positionsById, errors) {
  for (const record of records) {
    if (!Array.isArray(record?.prerequisites)) continue;
    const currentPosition = positionsById.get(record?.id);
    if (!Array.isArray(currentPosition) || currentPosition.some(order => !Number.isInteger(order) || order < 1)) {
      continue;
    }

    for (const prerequisite of record.prerequisites) {
      const prerequisitePosition = positionsById.get(prerequisite);
      if (
        !Array.isArray(prerequisitePosition) ||
        prerequisitePosition.length !== currentPosition.length ||
        prerequisitePosition.some(order => !Number.isInteger(order) || order < 1)
      ) {
        continue;
      }
      if (comparePositions(prerequisitePosition, currentPosition) >= 0) {
        errors.push(`${context} ${record?.id ?? "(missing id)"} prerequisite "${prerequisite}" must appear earlier in the learning path.`);
      }
    }
  }
}

function validateEarlierCoursePrerequisites(courses, errors) {
  const coursesById = new Map(
    courses
      .filter(course => isNonEmptyString(course?.id))
      .map(course => [course.id, course])
  );

  for (const course of courses) {
    const currentLevel = /^N([1-5])$/.exec(course?.level ?? "");
    if (!currentLevel || !Array.isArray(course?.prerequisites)) continue;

    for (const prerequisite of course.prerequisites) {
      const prerequisiteCourse = coursesById.get(prerequisite);
      const prerequisiteLevel = /^N([1-5])$/.exec(prerequisiteCourse?.level ?? "");
      if (!prerequisiteLevel) continue;

      // N5 is foundational; prerequisite levels must precede the current level.
      if (Number(prerequisiteLevel[1]) <= Number(currentLevel[1])) {
        errors.push(
          `${course?.id ?? "(missing course id)"} course prerequisite "${prerequisite}" must be at an earlier JLPT level (N5 before N4, N4 before N3, and so on).`
        );
      }
    }
  }
}

export function validateCourseSet(courses, batchData) {
  const errors = [];
  if (!Array.isArray(courses) || courses.length === 0) {
    return ["No course JSON files were found."];
  }

  const batches = Array.isArray(batchData?.batches) ? batchData.batches : [];
  if (batches.length === 0) errors.push("data/batches.json must contain a non-empty batches array.");
  const batchesById = new Map();
  for (const batch of batches) {
    const batchId = batch?.id ?? "(missing id)";
    if (!batch?.categories || typeof batch.categories !== "object" || Array.isArray(batch.categories)) {
      errors.push(`Batch ${batchId} must have a categories object.`);
    }
    if (!isNonEmptyString(batch?.id)) {
      errors.push("Every batch must have a non-empty id.");
    } else if (batchesById.has(batch.id)) {
      errors.push(`Duplicate batch id: ${batch.id}`);
    } else {
      batchesById.set(batch.id, batch);
    }
  }

  const courseIds = new Set(courses.map(course => course?.id).filter(isNonEmptyString));
  validateAcyclicPrerequisites(courses, "course", errors);
  validateEarlierCoursePrerequisites(courses, errors);
  const idOwners = new Map();
  const itemIdsByCourse = new Map();
  const registerId = (id, context) => {
    if (!isNonEmptyString(id) || !ID_PATTERN.test(id)) {
      errors.push(`${context} must have a lowercase kebab-case id.`);
      return;
    }
    if (idOwners.has(id)) {
      errors.push(`Duplicate id "${id}" in ${context}; first used by ${idOwners.get(id)}.`);
      return;
    }
    idOwners.set(id, context);
  };

  for (const course of courses) {
    registerId(course?.id, "course");
    const courseItemIds = new Set();
    itemIdsByCourse.set(course?.id, courseItemIds);
    for (const unit of Array.isArray(course?.units) ? course.units : []) {
      registerId(unit?.id, `unit in ${course?.id}`);
      for (const lesson of Array.isArray(unit?.lessons) ? unit.lessons : []) {
        registerId(lesson?.id, `lesson in ${unit?.id}`);
        for (const item of Array.isArray(lesson?.learningItems) ? lesson.learningItems : []) {
          registerId(item?.id, `learning item in ${lesson?.id}`);
          if (isNonEmptyString(item?.id)) courseItemIds.add(item.id);
        }
      }
    }
  }

  for (const course of courses) {
    const courseId = course?.id ?? "(missing course id)";
    for (const field of ["level", "title", "language", "locale", "alignment"]) {
      if (!isNonEmptyString(course?.[field])) errors.push(`${courseId}: missing ${field}.`);
    }
    if (course?.schemaVersion !== 1) errors.push(`${courseId}: schemaVersion must be 1.`);
    if (!Array.isArray(course?.prerequisites)) errors.push(`${courseId}: prerequisites must be an array.`);
    else {
      const seenCoursePrerequisites = new Set();
      for (const prerequisite of course.prerequisites) {
        if (seenCoursePrerequisites.has(prerequisite)) {
          errors.push(`${courseId}: duplicate course prerequisite "${prerequisite}".`);
        }
        seenCoursePrerequisites.add(prerequisite);
        if (prerequisite === course.id) {
          errors.push(`${courseId}: course cannot be its own prerequisite.`);
        } else if (!courseIds.has(prerequisite)) {
          errors.push(`${courseId}: unknown course prerequisite "${prerequisite}".`);
        }
      }
    }

    const coursePolicy = course?.completionPolicy;
    if (!coursePolicy || !(
      coursePolicy.requiredLessons === "all" ||
      (Number.isInteger(coursePolicy.requiredLessons) && coursePolicy.requiredLessons > 0)
    )) {
      errors.push(`${courseId}: completionPolicy.requiredLessons must be "all" or a positive integer.`);
    }

    const units = Array.isArray(course?.units) ? course.units : [];
    const lessonCount = units.reduce(
      (total, unit) => total + (Array.isArray(unit?.lessons) ? unit.lessons.length : 0),
      0
    );
    if (
      Number.isInteger(coursePolicy?.requiredLessons) &&
      coursePolicy.requiredLessons > lessonCount
    ) {
      errors.push(`${courseId}: completionPolicy.requiredLessons cannot exceed the ${lessonCount} lesson(s) in the course.`);
    }
    if (units.length === 0) errors.push(`${courseId}: units must be a non-empty array.`);
    validateOrderList(units, `${courseId} units`, errors);
    const unitIds = new Set(units.map(unit => unit?.id).filter(isNonEmptyString));
    validateAcyclicPrerequisites(units, `${courseId} unit`, errors);
    const unitPositions = new Map(units.filter(unit => isNonEmptyString(unit?.id)).map(unit => [unit.id, [unit.order]]));
    validateEarlierPrerequisites(units, `${courseId} unit`, unitPositions, errors);
    const courseLessonIds = new Set(units.flatMap(unit =>
      (Array.isArray(unit?.lessons) ? unit.lessons : []).map(lesson => lesson?.id).filter(isNonEmptyString)
    ));
    const lessonsInCourse = units.flatMap(unit => Array.isArray(unit?.lessons) ? unit.lessons : []);
    const lessonPositions = new Map();
    for (const unit of units) {
      for (const lesson of Array.isArray(unit?.lessons) ? unit.lessons : []) {
        if (isNonEmptyString(lesson?.id)) lessonPositions.set(lesson.id, [unit.order, lesson.order]);
      }
    }
    validateAcyclicPrerequisites(lessonsInCourse, `${courseId} lesson`, errors);
    validateEarlierPrerequisites(lessonsInCourse, `${courseId} lesson`, lessonPositions, errors);

    for (const unit of units) {
      const unitId = unit?.id ?? "(missing unit id)";
      if (!isNonEmptyString(unit?.title)) errors.push(`${unitId}: missing title.`);
      if (!Array.isArray(unit?.prerequisites)) errors.push(`${unitId}: prerequisites must be an array.`);
      else {
        const seenUnitPrerequisites = new Set();
        for (const prerequisite of unit.prerequisites) {
          if (seenUnitPrerequisites.has(prerequisite)) {
            errors.push(`${unitId}: duplicate unit prerequisite "${prerequisite}".`);
          }
          seenUnitPrerequisites.add(prerequisite);
          if (!unitIds.has(prerequisite) || prerequisite === unit.id) {
            errors.push(`${unitId}: invalid unit prerequisite "${prerequisite}".`);
          }
        }
      }

      const lessons = Array.isArray(unit?.lessons) ? unit.lessons : [];
      if (lessons.length === 0) errors.push(`${unitId}: lessons must be a non-empty array.`);
      validateOrderList(lessons, `${unitId} lessons`, errors);
      const courseItemIds = itemIdsByCourse.get(course?.id) ?? new Set();

      for (const lesson of lessons) {
        const lessonId = lesson?.id ?? "(missing lesson id)";
        if (!isNonEmptyString(lesson?.title)) errors.push(`${lessonId}: missing title.`);
        if (!Array.isArray(lesson?.objectives) || lesson.objectives.length === 0) {
          errors.push(`${lessonId}: objectives must be a non-empty array.`);
        }
        if (!Array.isArray(lesson?.learningItems) || lesson.learningItems.length === 0) {
          errors.push(`${lessonId}: learningItems must be a non-empty array.`);
        }
        if (lesson?.prerequisites !== undefined) {
          if (!Array.isArray(lesson.prerequisites)) errors.push(`${lessonId}: prerequisites must be an array.`);
          else {
            const seenLessonPrerequisites = new Set();
            for (const prerequisite of lesson.prerequisites) {
              if (seenLessonPrerequisites.has(prerequisite)) {
                errors.push(`${lessonId}: duplicate lesson prerequisite "${prerequisite}".`);
              }
              seenLessonPrerequisites.add(prerequisite);
              if (!courseLessonIds.has(prerequisite) || prerequisite === lesson.id) {
                errors.push(`${lessonId}: invalid lesson prerequisite "${prerequisite}".`);
              }
            }
          }
        }

        if (!Array.isArray(lesson?.reviewSet)) errors.push(`${lessonId}: reviewSet must be an array.`);
        else {
          if (lesson.reviewSet.length === 0) errors.push(`${lessonId}: reviewSet must contain at least one item.`);
          const seenReviewIds = new Set();
          for (const itemId of lesson.reviewSet) {
            if (seenReviewIds.has(itemId)) errors.push(`${lessonId}: duplicate reviewSet id "${itemId}".`);
            seenReviewIds.add(itemId);
            if (!courseItemIds.has(itemId)) errors.push(`${lessonId}: unknown reviewSet item "${itemId}".`);
          }
        }

        if (lesson?.sourceRefs !== undefined && !Array.isArray(lesson.sourceRefs)) {
          errors.push(`${lessonId}: sourceRefs must be an array when provided.`);
        }
        for (const sourceRef of Array.isArray(lesson?.sourceRefs) ? lesson.sourceRefs : []) {
          const batch = batchesById.get(sourceRef?.batchId);
          if (!batch) {
            errors.push(`${lessonId}: unknown source batch "${sourceRef?.batchId}".`);
          } else if (!Object.hasOwn(batch.categories ?? {}, sourceRef?.category)) {
            errors.push(`${lessonId}: unknown category "${sourceRef?.batchId}/${sourceRef?.category}".`);
          }
        }

        const policy = lesson?.completionPolicy;
        if (!policy || !Number.isFinite(policy.minCorrect) || policy.minCorrect < 0 || policy.minCorrect > 1) {
          errors.push(`${lessonId}: completionPolicy.minCorrect must be between 0 and 1.`);
        }
        if (!Number.isInteger(policy?.minAttempts) || policy.minAttempts < 1) {
          errors.push(`${lessonId}: completionPolicy.minAttempts must be a positive integer.`);
        }

        for (const item of Array.isArray(lesson?.learningItems) ? lesson.learningItems : []) {
          const itemId = item?.id ?? "(missing item id)";
          if (!SUPPORTED_ITEM_TYPES.has(item?.type)) errors.push(`${itemId}: unsupported learning item type "${item?.type}".`);
          if (!isNonEmptyString(item?.prompt)) errors.push(`${itemId}: prompt must be non-empty.`);
          if (!isNonEmptyString(item?.answer)) errors.push(`${itemId}: answer must be non-empty.`);
          if (item?.examples !== undefined && !Array.isArray(item.examples)) {
            errors.push(`${itemId}: examples must be an array when provided.`);
          }
        }
      }
    }
  }

  return errors;
}

function main() {
  try {
    const courseFiles = readdirSync(COURSE_DIR).filter(file => file.endsWith(".json")).sort();
    const courses = courseFiles.map(file => JSON.parse(readFileSync(join(COURSE_DIR, file), "utf8")));
    const batches = JSON.parse(readFileSync(BATCH_FILE, "utf8"));
    const errors = validateCourseSet(courses, batches);

    if (errors.length > 0) {
      console.error(`Course data validation failed with ${errors.length} error(s):`);
      for (const error of errors) console.error(`- ${error}`);
      process.exitCode = 1;
      return;
    }

    const units = courses.reduce((sum, course) => sum + course.units.length, 0);
    const lessons = courses.reduce(
      (sum, course) => sum + course.units.reduce((unitSum, unit) => unitSum + unit.lessons.length, 0),
      0
    );
    const items = courses.reduce(
      (sum, course) => sum + course.units.reduce(
        (unitSum, unit) => unitSum + unit.lessons.reduce((lessonSum, lesson) => lessonSum + lesson.learningItems.length, 0),
        0
      ),
      0
    );
    console.log(`Validated ${courses.length} course(s), ${units} units, ${lessons} lessons, ${items} learning items; no data errors.`);
  } catch (error) {
    console.error(`Course data validation could not run: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
