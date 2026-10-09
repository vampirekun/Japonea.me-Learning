const PROGRESS_KEY = "japonea_course_progress_v1";
const PASS_FALLBACK = 0.8;
const QUESTION_COUNT = 5;
const courseState = {
  course: null,
  activeLesson: null,
  progress: readProgress(),
  assessment: { lessonId: null, questions: [], passed: false, submitted: false }
};
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
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(courseState.progress));
  } catch (error) {
    console.warn("No se pudo guardar el progreso local", error);
  }
}

function allLessons() {
  return courseState.course.units.flatMap((unit) =>
    unit.lessons.map((lesson) => ({ ...lesson, unitId: unit.id, unitTitle: unit.title, unit }))
  );
}

function allPairs() {
  return allLessons().flatMap((lesson) =>
    (lesson.learningItems || []).flatMap((item) => {
      const pairs = [];
      if (item.prompt && item.answer) pairs.push({ jp: String(item.prompt), es: String(item.answer) });
      (item.examples || []).forEach((example) => {
        const jp = example.jp || example.kana;
        if (jp && example.es) pairs.push({ jp: String(jp), es: String(example.es) });
      });
      return pairs;
    })
  );
}

function isComplete(lessonId) {
  return Boolean(courseState.progress[lessonId]?.completedAt);
}

function isUnitUnlocked(unit) {
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
    const unlocked = isUnitUnlocked(unit);
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

function renderLearningItem(item) {
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

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildAssessmentQuestions(lesson) {
  const lessonPairs = (lesson.learningItems || []).flatMap((item) => {
    const pairs = [];
    if (item.prompt && item.answer) pairs.push({ jp: String(item.prompt), es: String(item.answer) });
    (item.examples || []).forEach((example) => {
      const jp = example.jp || example.kana;
      if (jp && example.es) pairs.push({ jp: String(jp), es: String(example.es) });
    });
    return pairs;
  });
  const bank = [];
  lessonPairs.forEach((pair, index) => {
    bank.push({
      id: lesson.id + "-jp-" + index,
      prompt: "¿Qué significa esta expresión?\n" + pair.jp,
      correct: pair.es,
      direction: "es"
    });
    bank.push({
      id: lesson.id + "-es-" + index,
      prompt: "¿Qué expresión corresponde a esta traducción?\n" + pair.es,
      correct: pair.jp,
      direction: "jp"
    });
  });
  const unique = bank.filter((question, index) =>
    bank.findIndex((candidate) => candidate.prompt === question.prompt && candidate.correct === question.correct) === index
  );
  const selected = shuffle(unique).slice(0, QUESTION_COUNT);
  if (selected.length < QUESTION_COUNT) {
    const used = new Set(selected.map((question) => question.prompt + "|" + question.correct));
    const reviewBank = allPairs().flatMap((pair, index) => [
      { id: lesson.id + "-review-jp-" + index, prompt: "Repaso acumulativo: ¿qué significa esta expresión?\n" + pair.jp, correct: pair.es, direction: "es" },
      { id: lesson.id + "-review-es-" + index, prompt: "Repaso acumulativo: ¿qué expresión corresponde a esta traducción?\n" + pair.es, correct: pair.jp, direction: "jp" }
    ]).filter((question) => !used.has(question.prompt + "|" + question.correct));
    selected.push(...shuffle(reviewBank).slice(0, QUESTION_COUNT - selected.length));
  }
  return selected.map((question) => {
    const answerPool = [...new Set(allPairs().map((pair) => question.direction === "es" ? pair.es : pair.jp))]
      .filter((answer) => answer && answer !== question.correct);
    const distractors = shuffle(answerPool).slice(0, 3);
    return { ...question, options: shuffle([...new Set([question.correct, ...distractors])]) };
  });
}

function renderAssessment(lesson) {
  const questionsRoot = el("assessmentQuestions");
  questionsRoot.replaceChildren();
  const policy = Number(lesson.completionPolicy?.minCorrect);
  const threshold = Number.isFinite(policy) && policy > 0 && policy <= 1 ? policy : PASS_FALLBACK;
  el("assessmentThreshold").textContent = Math.round(threshold * 100) + "% para aprobar";
  courseState.assessment = {
    lessonId: lesson.id,
    questions: buildAssessmentQuestions(lesson),
    passed: false,
    submitted: false,
    score: null,
    threshold
  };

  courseState.assessment.questions.forEach((question, index) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "assessment-question";
    const legend = document.createElement("legend");
    legend.textContent = (index + 1) + ". " + question.prompt;
    fieldset.append(legend);
    const options = document.createElement("div");
    options.className = "assessment-options";
    question.options.forEach((option, optionIndex) => {
      const label = document.createElement("label");
      label.className = "assessment-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "question-" + index;
      input.value = option;
      input.required = optionIndex === 0;
      const text = document.createElement("span");
      text.textContent = option;
      label.append(input, text);
      options.append(label);
    });
    fieldset.append(options);
    questionsRoot.append(fieldset);
  });

  el("assessmentResult").hidden = true;
  el("assessmentResult").className = "assessment-result";
  el("submitAssessment").hidden = false;
  el("submitAssessment").disabled = false;
  el("retryAssessment").hidden = true;
  el("completeLesson").disabled = true;
  el("completeLesson").textContent = "Aprueba la evaluación para completar";
}

function openLesson(unit, lesson) {
  courseState.activeLesson = { unit, lesson };
  el("courseOverview").hidden = true;
  el("lessonView").hidden = false;
  el("lessonEyebrow").textContent = "UNIDAD " + unit.order + " · LECCIÓN " + lesson.order;
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
  lesson.learningItems.forEach((item) => items.append(renderLearningItem(item)));
  const lessons = allLessons();
  const position = lessons.findIndex((item) => item.id === lesson.id) + 1;
  el("lessonPosition").textContent = "Lección " + position + " de " + lessons.length;
  renderAssessment(lesson);
  const completed = isComplete(lesson.id);
  if (completed) {
    el("completeLesson").disabled = true;
    el("completeLesson").textContent = "✓ Lección completada";
    el("completionMessage").textContent = "Tu progreso está guardado en este dispositivo. Puedes volver a practicar la evaluación.";
  } else {
    el("completionMessage").textContent = "";
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showCourse() {
  courseState.activeLesson = null;
  el("lessonView").hidden = true;
  el("courseOverview").hidden = false;
  renderCourse();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function submitAssessment(event) {
  event.preventDefault();
  const assessment = courseState.assessment;
  if (!assessment.questions.length) return;
  const result = el("assessmentResult");
  let correctCount = 0;
  const feedback = [];

  assessment.questions.forEach((question, index) => {
    const selected = el("assessmentQuestions").querySelector('input[name="question-' + index + '"]:checked');
    const correct = selected?.value === question.correct;
    if (correct) correctCount += 1;
    feedback.push({ question, correct });
    el("assessmentQuestions").querySelectorAll('input[name="question-' + index + '"]').forEach((input) => {
      input.disabled = true;
      const label = input.closest("label");
      if (input.value === question.correct) label.classList.add("correct");
      else if (input.checked) label.classList.add("incorrect");
    });
  });

  const score = correctCount / assessment.questions.length;
  assessment.passed = score >= assessment.threshold;
  assessment.submitted = true;
  const percent = Math.round(score * 100);
  assessment.score = percent;
  result.replaceChildren();
  result.className = "assessment-result " + (assessment.passed ? "pass" : "fail");
  const title = document.createElement("strong");
  title.textContent = assessment.passed ? "¡Evaluación aprobada! " + percent + "%" : "Todavía no. Resultado: " + percent + "%";
  const summary = document.createElement("p");
  summary.textContent = correctCount + " de " + assessment.questions.length + " respuestas correctas. " +
    (assessment.passed ? "Ya puedes completar la lección." : "Necesitas al menos " + Math.round(assessment.threshold * 100) + "%. Revisa los errores e inténtalo otra vez.");
  result.append(title, summary);
  const missed = feedback.filter((entry) => !entry.correct);
  if (missed.length) {
    const list = document.createElement("ul");
    missed.forEach(({ question }) => {
      const li = document.createElement("li");
      li.textContent = question.prompt.replace("\n", " ") + " — respuesta: " + question.correct;
      list.append(li);
    });
    result.append(list);
  }
  result.hidden = false;
  el("submitAssessment").hidden = true;
  el("retryAssessment").hidden = assessment.passed;
  const alreadyComplete = isComplete(assessment.lessonId);
  el("completeLesson").disabled = !assessment.passed || alreadyComplete;
  el("completeLesson").textContent = alreadyComplete
    ? "✓ Lección completada"
    : assessment.passed ? "Completar lección y guardar progreso" : "Aprueba la evaluación para completar";
}

function retryAssessment() {
  const active = courseState.activeLesson;
  if (active) renderAssessment(active.lesson);
}

async function init() {
  try {
    const response = await fetch("./data/courses/n5.json");
    if (!response.ok) throw new Error("Course JSON unavailable");
    courseState.course = await response.json();
    if (!Array.isArray(courseState.course.units) || !courseState.course.units.length) throw new Error("Invalid course structure");
    renderCourse();
    el("backToCourse").addEventListener("click", showCourse);
    el("assessmentForm").addEventListener("submit", submitAssessment);
    el("retryAssessment").addEventListener("click", retryAssessment);
    el("completeLesson").addEventListener("click", () => {
      const active = courseState.activeLesson;
      const assessment = courseState.assessment;
      if (!active || !assessment.passed || assessment.lessonId !== active.lesson.id || isComplete(active.lesson.id)) return;
      courseState.progress[active.lesson.id] = {
        completedAt: new Date().toISOString(),
        bestScore: assessment.score
      };
      saveProgress();
      renderCourse();
      el("completeLesson").disabled = true;
      el("completeLesson").textContent = "✓ Lección completada";
      el("completionMessage").textContent = "¡Bien hecho! Aprobaste la evaluación y tu progreso quedó guardado en este dispositivo.";
    });
  } catch (error) {
    console.error("No se pudo iniciar el curso", error);
    el("loadError").hidden = false;
  }
}

init();
