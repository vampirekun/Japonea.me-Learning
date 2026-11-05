const LAST_ACTIVE_SCHEMA_VERSION = 1;

function isValidLastActiveLesson(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.schemaVersion === LAST_ACTIVE_SCHEMA_VERSION &&
    typeof value.courseId === "string" &&
    value.courseId.trim() &&
    typeof value.lessonId === "string" &&
    value.lessonId.trim() &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}

export function readLastActiveLesson(storage, key) {
  try {
    if (!storage || typeof storage.getItem !== "function") return null;
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined || raw === "") return null;

    const value = JSON.parse(raw);
    return isValidLastActiveLesson(value)
      ? {
          schemaVersion: LAST_ACTIVE_SCHEMA_VERSION,
          courseId: value.courseId,
          lessonId: value.lessonId,
          updatedAt: value.updatedAt
        }
      : null;
  } catch {
    return null;
  }
}

export function persistLastActiveLesson(storage, key, record) {
  try {
    if (!storage || typeof storage.setItem !== "function" || !isValidLastActiveLesson(record)) {
      return false;
    }

    storage.setItem(key, JSON.stringify({
      schemaVersion: LAST_ACTIVE_SCHEMA_VERSION,
      courseId: record.courseId,
      lessonId: record.lessonId,
      updatedAt: record.updatedAt
    }));
    return true;
  } catch {
    return false;
  }
}

export function findResumableLesson(course, progress, lastActive) {
  if (
    !course ||
    typeof course.id !== "string" ||
    !Array.isArray(course.units) ||
    !isValidLastActiveLesson(lastActive) ||
    lastActive.courseId !== course.id
  ) {
    return null;
  }

  const lessonEntries = course.units.flatMap((unit) =>
    Array.isArray(unit?.lessons)
      ? unit.lessons.map((lesson) => ({ unit, lesson }))
      : []
  );
  const target = lessonEntries.find(({ lesson }) => lesson?.id === lastActive.lessonId);
  if (!target) return null;

  const progressMap = progress && typeof progress === "object" && !Array.isArray(progress)
    ? progress
    : {};
  const isComplete = (lessonId) => Boolean(progressMap[lessonId]?.completedAt);
  const unitsById = new Map(course.units.filter((unit) => typeof unit?.id === "string").map((unit) => [unit.id, unit]));

  const isUnitUnlocked = (unit) => {
    const prerequisites = unit?.prerequisites ?? [];
    if (!Array.isArray(prerequisites)) return false;
    return prerequisites.every((unitId) => {
      const prerequisite = unitsById.get(unitId);
      return Boolean(
        prerequisite &&
        Array.isArray(prerequisite.lessons) &&
        prerequisite.lessons.length > 0 &&
        prerequisite.lessons.every((lesson) => isComplete(lesson.id))
      );
    });
  };

  const isLessonUnlocked = (lesson, unit) => {
    if (!isUnitUnlocked(unit)) return false;
    const prerequisites = lesson?.prerequisites ?? [];
    return Array.isArray(prerequisites) && prerequisites.every(isComplete);
  };

  return isComplete(target.lesson.id) || isLessonUnlocked(target.lesson, target.unit)
    ? target
    : null;
}
