# Learning domain model (N5–N1)

## Purpose

Japonea.me courses are structured learning paths, not just larger vocabulary batches. The same content model must work for the current static web app and the planned offline mobile app. Course content is **aligned with a JLPT level**, but must not be described as official JLPT material.

## Domain concepts

- **Course** — a level-specific learning path (n5 through n1), with a title, summary, level, prerequisites, units and completion policy.
- **Unit** — a coherent milestone inside a course. Units contain ordered lessons and may depend on earlier units.
- **Lesson** — a teachable session with explicit objectives, topics, source references, learning items, a review set and completion criteria.
- **Topic** — a subject or skill such as introductions, particles, vocabulary, kanji, reading or listening. Topics are metadata and may appear in multiple lessons.
- **LearningItem** — a typed piece of learning content. Initial supported types are vocabulary, grammar, kanji, reading, listening and review. Items have stable IDs so progress and review history can refer to them even when lesson order changes.

## Content conventions

- Use stable, lowercase IDs with hyphens.
- Keep user-facing explanations in Spanish; Japanese content should include kana and romaji where useful for beginners.
- Prefer natural, contextual examples over isolated translations.
- sourceRefs link existing weekly batches/categories instead of copying their vocabulary. A missing source reference should not prevent the lesson from loading.
- A listening item may initially provide a transcript and an optional audio asset reference. Missing audio must not block study.
- Keep review items explicit and traceable to earlier items.
- Content files must be static JSON and work offline; no runtime API is required to load a course.
- Do not mark a lesson complete merely because it was opened. Completion should be driven by the lesson policy and persisted by the host app.

## Shared JSON shape

```json
{
  "schemaVersion": 1,
  "id": "n5",
  "level": "N5",
  "title": "Japonés inicial",
  "language": "ja",
  "locale": "es-MX",
  "alignment": "jlpt-aligned",
  "prerequisites": [],
  "completionPolicy": { "requiredLessons": "all" },
  "units": [{
    "id": "n5-unit-1",
    "title": "Primeros encuentros",
    "order": 1,
    "prerequisites": [],
    "lessons": [{
      "id": "n5-lesson-1",
      "title": "Saludar y participar en clase",
      "order": 1,
      "objectives": ["Reconocer saludos frecuentes"],
      "topics": ["greetings"],
      "sourceRefs": [{ "batchId": "batch-1", "category": "phrases" }],
      "learningItems": [{
        "id": "n5-greeting-konnichiwa",
        "type": "vocabulary",
        "prompt": "こんにちは",
        "answer": "Hola / buenas tardes",
        "reading": "konnichiwa",
        "explanation": "Saludo habitual durante el día.",
        "examples": []
      }],
      "reviewSet": ["n5-greeting-konnichiwa"],
      "completionPolicy": { "minCorrect": 0.8, "minAttempts": 1 }
    }]
  }]
}
```

## Completion and progression

- A **lesson** is complete when the host app's configured completion policy is met; the initial policy uses a minimum correct-answer ratio and at least one attempt.
- A **unit** is complete when all required lessons in that unit are complete.
- A **course** is complete when all required units are complete.
- A unit/lesson prerequisite is an ID reference. The host app is responsible for locking/unlocking and showing prerequisite state.
- Persist completion by stable course/unit/lesson IDs. Persist item review state separately so it can support spaced repetition later without changing the course schema.
- Unknown optional fields should be ignored by older readers; increment schemaVersion only for incompatible structural changes.

## Existing batches migration

The current data/batches.json remains the source of truth for its existing cards. Course lessons can reference batches/categories through sourceRefs; migrate or duplicate card content only when a later client explicitly requires a self-contained course bundle. The current web UI still loads batches directly; consuming the new course model is separate integration work.

## MVP scope vs. later work

**MVP:** read static course JSON offline; list course/unit/lesson; display objectives and typed learning items; practice/review; persist lesson completion and resume position; respect prerequisites.

**Later:** adaptive spaced repetition, richer listening assets, analytics, authoring tools, cloud sync and cross-device progress.