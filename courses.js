const PROGRESS_KEY = "japonea_course_progress_v1";
const courseState = { course: null, activeLesson: null, progress: readProgress() };
const el = (id) => document.getElementById(id);

function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(courseState.progress));
}

function allLessons() {
  return courseState.course.units.flatMap((unit) => unit.lessons.map((lesson) => ({ ...lesson, unitId: unit.id, unitTitle: unit.title })));
}

function isComplete(lessonId) {
  return Boolean(courseState.progress[lessonId]?.completedAt);
}

function isUnitUnlocked(unit, index) {
  if (!unit.prerequisites?.length) return true;
  return unit.prerequisites.every((id) => {
    const prerequisite = courseState.course.units.find((candidate) => candidate.id === id);
    return prerequisite && prerequisite.lessons.every((lesson) => isComplete(lesson.id));
  });
}

function renderStats() {
  const lessons = allLessons();
  const completed = lessons.filter((lesson) => isComplete(lesson.id)).length;
  const percent = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  el("completedCount").textContent = String(completed);
  el("totalCount").textContent = String(lessons.length);
  el("progressPercent").textContent = percent + "%";
  el("courseProgress").style.width = percent + "%";
}

function renderCourse() {
  const course = courseState.course;
  el("courseTitle").textContent = course.title;
  el("courseDescription").textContent = course.description;
  const list = el("unitList");
  list.replaceChildren();

  course.units.forEach((unit, unitIndex) => {
    const unlocked = isUnitUnlocked(unit, unitIndex);
    const completedCount = unit.lessons.filter((lesson) => isComplete(lesson.id)).length;
    const card = document.createElement("section");
    card.className = "unit-card";
    const heading = document.createElement("div");
    heading.className = "unit-heading";
    const number = document.createElement("span");
    number.className = "unit-number";
    number.textContent = String(unitIndex + 1).padStart(2, "0");
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = unit.title;
    const description = document.createElement("p");
    description.textContent = unit.description || "";
    details.append(title, description);
    const progress = document.createElement("span");
    progress.className = "unit-progress";
    progress.textContent = unlocked ? completedCount + "/" + unit.lessons.length : "Bloqueada";
    heading.append(number, details, progress);
    card.append(heading);

    unit.lessons.forEach((lesson) => {
      const completed = isComplete(lesson.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lesson-row" + (completed ? " completed" : "");
      button.disabled = !unlocked;
      button.setAttribute("aria-label", lesson.title + (completed ? ", completada" : ""));
      const status = document.createElement("span");
      status.className = "lesson-status";
      status.textContent = completed ? "✓" : unlocked ? "○" : "🔒";
      const copy = document.createElement("span");
      copy.className = "lesson-copy";
      const lessonTitle = document.createElement("strong");
      lessonTitle.textContent = lesson.title;
      const meta = document.createElement("small");
      meta.textContent = lesson.objectives.length + " objetivos · " + lesson.learningItems.length + " actividades";
      copy.append(lessonTitle, meta);
      const arrow = document.createElement("span");
      arrow.className = "lesson-arrow";
      arrow.textContent = "→";
      button.append(status, copy, arrow);
      button.addEventListener("click", () => openLesson(unit, lesson));
      card.append(button);
    });
    list.append(card);
  });
  renderStats();
}

function renderLearningItem(item, index) {
  const card = document.createElement("article");
  card.className = "learning-item";
  const type = document.createElement("p");
  type.className = "item-type";
  const labels = { vocabulary: "Vocabulario", grammar: "Gramática", kanji: "Kanji", reading: "Lectura", listening: "Escucha", review: "Repaso" };
  type.textContent = labels[item.type] || "Actividad";
  const prompt = document.createElement("p");
  prompt.className = "item-prompt";
  prompt.textContent = item.prompt;
  card.append(type, prompt);
  if (item.reading) {
    const reading = document.createElement("p");
    reading.className = "item-reading";
    reading.textContent = item.reading;
    card.append(reading);
  }
  if (item.explanation) {
    const explanation = document.createElement("p");
    explanation.className = "item-explanation";
    explanation.textContent = item.explanation;
    card.append(explanation);
  }
  const answer = document.createElement("div");
  answer.className = "item-answer";
  answer.hidden = true;
  const answerLabel = document.createElement("strong");
  answerLabel.textContent = "Respuesta";
  const answerText = document.createElement("p");
  answerText.textContent = item.answer;
  answer.append(answerLabel, answerText);
  const reveal = document.createElement("button");
  reveal.type = "button";
  reveal.className = "reveal-button";
  reveal.textContent = "Mostrar respuesta";
  reveal.setAttribute("aria-expanded", "false");
  reveal.addEventListener("click", () => {
    answer.hidden = !answer.hidden;
    reveal.textContent = answer.hidden ? "Mostrar respuesta" : "Ocultar respuesta";
    reveal.setAttribute("aria-expanded", String(!answer.hidden));
  });
  card.append(reveal, answer);
  (item.examples || []).forEach((example) => {
    const exampleBlock = document.createElement("div");
    exampleBlock.className = "example";
    const jp = document.createElement("p");
    jp.className = "jp";
    jp.textContent = example.jp || example.kana || "";
    const romaji = document.createElement("p");
    romaji.className = "item-reading";
    romaji.textContent = example.romaji || "";
    const es = document.createElement("p");
    es.textContent = example.es || "";
    exampleBlock.append(jp, romaji, es);
    card.append(exampleBlock);
  });
  return card;
}

function openLesson(unit, lesson) {
  courseState.activeLesson = { unit, lesson };
  el("courseOverview").hidden = true;
  el("lessonView").hidden = false;
  el("lessonEyebrow").textContent = "UNIDAD " + (unit.order) + " · LECCIÓN " + lesson.order;
  el("lessonTitle").textContent = lesson.title;
  el("lessonDescription").textContent = lesson.description || "Avanza por las actividades y repasa los ejemplos a tu ritmo.";
  const objectives = el("objectivesList");
  objectives.replaceChildren();
  lesson.objectives.forEach((objective) => {
    const li = document.createElement("li");
    li.textContent = objective;
    objectives.append(li);
  });
  const items = el("learningItems");
  items.replaceChildren();
  lesson.learningItems.forEach((item, index) => items.append(renderLearningItem(item, index)));
  const lessons = allLessons();
  const position = lessons.findIndex((item) => item.id === lesson.id) + 1;
  el("lessonPosition").textContent = "Lección " + position + " de " + lessons.length;
  const completed = isComplete(lesson.id);
  el("completeLesson").disabled = completed;
  el("completeLesson").textContent = completed ? "✓ Lección completada" : "Marcar lección como completada";
  el("completionMessage").textContent = completed ? "Tu progreso está guardado en este dispositivo." : "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCourse() {
  courseState.activeLesson = null;
  el("lessonView").hidden = true;
  el("courseOverview").hidden = false;
  renderCourse();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function init() {
  try {
    const response = await fetch("./data/courses/n5.json");
    if (!response.ok) throw new Error("Course JSON unavailable");
    courseState.course = await response.json();
    if (!Array.isArray(courseState.course.units) || !courseState.course.units.length) throw new Error("Invalid course structure");
    renderCourse();
    el("backToCourse").addEventListener("click", showCourse);
    el("completeLesson").addEventListener("click", () => {
      const active = courseState.activeLesson;
      if (!active) return;
      courseState.progress[active.lesson.id] = { completedAt: new Date().toISOString() };
      saveProgress();
      renderCourse();
      el("completeLesson").disabled = true;
      el("completeLesson").textContent = "✓ Lección completada";
      el("completionMessage").textContent = "¡Bien hecho! Tu progreso quedó guardado en este dispositivo.";
    });
  } catch (error) {
    console.error("No se pudo iniciar el curso", error);
    el("loadError").hidden = false;
  }
}

init();
