/**
 * Resolve a lesson's configured review set to stable learning-item IDs.
 * Review sets may refer to items introduced in earlier lessons in the same course.
 */
export function selectReviewItems(lesson, course) {
  const localItems = Array.isArray(lesson?.learningItems) ? lesson.learningItems : [];
  if (!Array.isArray(lesson?.reviewSet)) return localItems;

  const courseItems = Array.isArray(course?.units)
    ? course.units
      .flatMap((unit) => Array.isArray(unit.lessons) ? unit.lessons : [])
      .flatMap((candidate) => Array.isArray(candidate.learningItems) ? candidate.learningItems : [])
    : [];
  const itemsById = new Map(
    courseItems
      .filter((item) => item?.id)
      .map((item) => [item.id, item])
  );
  const selected = [...new Set(lesson.reviewSet)]
    .map((id) => itemsById.get(id))
    .filter(Boolean);

  // A malformed/obsolete review set should not make the lesson unusable.
  return selected.length ? selected : localItems;
}
