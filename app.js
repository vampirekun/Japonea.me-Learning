const STORAGE_KEYS = {
  seen: "japonea_seen_cards",
  known: "japonea_known_cards",
  lastBatch: "japonea_last_batch",
  quizStats: "japonea_quiz_stats",
  hideKnown: "japonea_hide_known",
  shuffleCards: "japonea_shuffle_cards",
  mode: "japonea_mode",
  audioTutorProgress: "japonea_audio_tutor_progress",
  audioTutorSpeed: "japonea_audio_tutor_speed"
};

const QUIZ_AUTO_NEXT_DELAY = 1200;
const KNOWN_FEEDBACK_DELAY = 280;
const QUIZ_HIGH_SCORE_THRESHOLD = 70;
const MIN_SPEECH_RATE = 0.4;
const MAX_SPEECH_RATE = 1.6;
const VALID_AUDIO_SPEEDS = [0.75, 1, 1.25];
const AUDIO_TUTOR_CONFIG = {
  jpToEsDelayMs: 1000,
  repetitionDelayMs: 3500,
  baseSpeechRate: 0.9
};
const UI_LABELS_ES = {
  all: "Todas",
  phrases: "Frases",
  countries: "Países",
  occupations: "Ocupaciones",
  likes: "Gustos",
  vocabulary: "Vocabulario",
  vida_cotidiana: "Vida cotidiana",
  estudio_y_profesion: "Estudio y profesión",
  lugares_y_movilidad: "Lugares y movilidad",
  naturaleza_y_cultura: "Naturaleza y cultura",
  sociedad_y_conceptos: "Sociedad y conceptos",
  noun: "Sustantivo",
  other: "Otro",
  language: "Idioma",
  place: "Lugar",
  profession: "Profesión",
  person: "Persona",
  object: "Objeto",
  phrase: "Frase",
  country: "País",
  occupation: "Ocupación",
  like: "Gusto",
  card: "Tarjeta"
};
const BATCH_TITLE_TRANSLATIONS = {
  basics: "Básicos",
  intermediate: "Intermedio",
  advanced: "Avanzado"
};

const state = {
  batches: [],
  activeBatchId: "",
  activeCategory: "all",
  batchCards: [],
  cards: [],
  index: 0,
  quizOptions: [],
  hasAnsweredQuiz: false,
  quizAnswerId: "",
  quizSelectedId: "",
  quizAutoNextTimer: null,
  hideKnown: readBooleanStorage(STORAGE_KEYS.hideKnown),
  shuffleCards: readBooleanStorage(STORAGE_KEYS.shuffleCards),
  mode: readModeStorage(),
  quizSession: { total: 0, answered: 0, correct: 0, incorrect: 0, answeredIds: new Set() },
  quizCompleted: false,
  audioTutor: {
    active: false,
    isPlaying: false,
    runId: 0,
    speedMultiplier: readAudioSpeedStorage(),
    unsupported: !("speechSynthesis" in window && "SpeechSynthesisUtterance" in window)
  },
  seenCards: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.seen) || "[]")),
  knownCards: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.known) || "[]")),
  quizStatsByBatch: readQuizStats()
};

const ui = {
  batchSelect: document.getElementById("batchSelect"),
  modeSelect: document.getElementById("modeSelect"),
  categorySelect: document.getElementById("categorySelect"),
  card: document.getElementById("card"),
  cardAudioBtn: document.getElementById("cardAudioBtn"),
  cardType: document.getElementById("cardType"),
  cardRomajiFront: document.getElementById("cardRomajiFront"),
  cardKana: document.getElementById("cardKana"),
  cardKanji: document.getElementById("cardKanji"),
  cardSpanish: document.getElementById("cardSpanish"),
  cardRomaji: document.getElementById("cardRomaji"),
  cardExampleBlockFront: document.getElementById("cardExampleBlockFront"),
  cardExampleJpFront: document.getElementById("cardExampleJpFront"),
  cardExampleEsFront: document.getElementById("cardExampleEsFront"),
  cardExampleBlockBack: document.getElementById("cardExampleBlockBack"),
  cardExampleJpBack: document.getElementById("cardExampleJpBack"),
  cardExampleEsBack: document.getElementById("cardExampleEsBack"),
  cardCounter: document.getElementById("cardCounter"),
  seenCounter: document.getElementById("seenCounter"),
  knownCounter: document.getElementById("knownCounter"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  knownBtn: document.getElementById("knownBtn"),
  quizOptions: document.getElementById("quizOptions"),
  quizNextBtn: document.getElementById("quizNextBtn"),
  quizStats: document.getElementById("quizStats"),
  progressFill: document.getElementById("progressFill"),
  progressLabel: document.getElementById("progressLabel"),
  hideKnownToggle: document.getElementById("hideKnownToggle"),
  shuffleToggle: document.getElementById("shuffleToggle"),
  splashScreen: document.getElementById("splashScreen"),
  hamburgerBtn: document.getElementById("hamburgerBtn"),
  closeDrawerBtn: document.getElementById("closeDrawerBtn"),
  drawerMenu: document.getElementById("drawerMenu"),
  drawerOverlay: document.getElementById("drawerOverlay"),
  quizResultScreen: document.getElementById("quizResultScreen"),
  quizResultState: document.getElementById("quizResultState"),
  quizResultTitle: document.getElementById("quizResultTitle"),
  quizResultTotal: document.getElementById("quizResultTotal"),
  quizResultCorrect: document.getElementById("quizResultCorrect"),
  quizResultIncorrect: document.getElementById("quizResultIncorrect"),
  quizResultAccuracy: document.getElementById("quizResultAccuracy"),
  retryQuizBtn: document.getElementById("retryQuizBtn"),
  goHomeBtn: document.getElementById("goHomeBtn"),
  audioTutorBtn: document.getElementById("audioTutorBtn"),
  audioTutorPanel: document.getElementById("audioTutorPanel"),
  audioTutorStatus: document.getElementById("audioTutorStatus"),
  audioTutorProgress: document.getElementById("audioTutorProgress"),
  audioSpeedSelect: document.getElementById("audioSpeedSelect"),
  audioTutorPlayPauseBtn: document.getElementById("audioTutorPlayPauseBtn"),
  audioTutorPrevBtn: document.getElementById("audioTutorPrevBtn"),
  audioTutorNextBtn: document.getElementById("audioTutorNextBtn"),
  audioTutorExitBtn: document.getElementById("audioTutorExitBtn"),
  repeatPromptOverlay: document.getElementById("repeatPromptOverlay")
};

async function init() {
  ui.hideKnownToggle.checked = state.hideKnown;
  ui.shuffleToggle.checked = state.shuffleCards;
  ui.modeSelect.value = state.mode;
  ui.audioSpeedSelect.value = String(state.audioTutor.speedMultiplier);
  applyModeUI();
  updateAudioTutorPlayPauseButton();

  const response = await fetch("./data/batches.json");
  const data = await response.json();
  state.batches = data.batches || [];

  if (!state.batches.length) {
    setTimeout(hideSplashScreen, 1200);
    registerServiceWorker();
    return;
  }

  const storedBatch = localStorage.getItem(STORAGE_KEYS.lastBatch);
  const fallbackBatch = state.batches[0].id;
  state.activeBatchId = state.batches.some((batch) => batch.id === storedBatch) ? storedBatch : fallbackBatch;

  renderBatchOptions();
  renderCategoryOptions();
  updateFilteredCards();
  bindEvents();
  setTimeout(hideSplashScreen, 1200);
  registerServiceWorker();
}

function renderBatchOptions() {
  ui.batchSelect.innerHTML = state.batches
    .map((batch) => `<option value="${batch.id}">${translateBatchTitle(batch.title)}</option>`)
    .join("");
  ui.batchSelect.value = state.activeBatchId;
}

function renderCategoryOptions() {
  const batch = getActiveBatch();
  const categories = Object.keys(batch.categories || {});
  const options = ["all", ...categories];

  if (!options.includes(state.activeCategory)) {
    state.activeCategory = "all";
  }

  ui.categorySelect.innerHTML = options
    .map((category) => {
      const label = getSpanishLabel(category);
      return `<option value="${category}">${label}</option>`;
    })
    .join("");

  ui.categorySelect.value = state.activeCategory;
}

function updateFilteredCards() {
  const batch = getActiveBatch();
  state.batchCards = flattenBatchCards(batch);
  const categoryCards =
    state.activeCategory === "all"
      ? state.batchCards
      : state.batchCards.filter((item) => item._category === state.activeCategory);

  const knownFiltered = state.hideKnown ? categoryCards.filter((item) => !state.knownCards.has(item._id)) : categoryCards;
  state.cards = state.shuffleCards ? shuffle([...knownFiltered]) : knownFiltered;

  state.index = 0;
  resetQuizSession();
  hideQuizResult();
  renderCard();
}

function renderCard() {
  const total = state.cards.length;
  const hasCards = total > 0;
  const card = hasCards ? state.cards[state.index] : null;

  clearQuizAutoNext();
  state.hasAnsweredQuiz = false;
  state.quizSelectedId = "";
  state.quizAnswerId = card ? card._id : "";
  state.quizOptions = card && state.mode === "quiz" ? buildQuizOptions(card) : [];

  ui.card.classList.remove("is-flipped");

  ui.cardType.textContent = card ? getSpanishLabel(card.type || state.activeCategory) : "Sin tarjetas";
  ui.cardRomajiFront.textContent = card ? getDisplayRomaji(card) : "No hay contenido";
  const kana = card ? getDisplayKana(card) : "";
  const kanji = card ? getDisplayKanji(card) : "";
  ui.cardKana.textContent = kana;
  ui.cardKanji.textContent = kanji;
  ui.cardKana.hidden = !kana;
  ui.cardKanji.hidden = !kanji;
  ui.cardSpanish.textContent = card ? card.es : "Selecciona otra categoría";
  ui.cardRomaji.textContent = card ? `JP: ${card.jp || getDisplayRomaji(card)}` : "";
  renderCardExamples(card);

  if (card) {
    markSeen(card._id);
  }

  ui.cardCounter.textContent = `${hasCards ? state.index + 1 : 0} / ${total}`;
  ui.seenCounter.textContent = `Vistas: ${state.seenCards.size}`;
  ui.knownCounter.textContent = `Conocidas: ${state.knownCards.size}`;

  ui.prevBtn.disabled = !hasCards;
  ui.nextBtn.disabled = !hasCards;
  ui.knownBtn.disabled = !hasCards;
  ui.cardAudioBtn.disabled = !hasCards || state.audioTutor.active;
  ui.quizNextBtn.hidden = true;
  ui.quizNextBtn.disabled = !hasCards || state.mode !== "quiz";
  renderProgress(total, hasCards ? state.index + 1 : 0);
  renderAudioTutorProgress();

  if (card) {
    ui.knownBtn.classList.toggle("is-known", state.knownCards.has(card._id));
    ui.knownBtn.textContent = state.knownCards.has(card._id) ? "Quitar conocida" : "Marcar conocida";
  } else {
    ui.knownBtn.classList.remove("is-known");
    ui.knownBtn.textContent = "Marcar conocida";
  }

  renderQuizOptions();
  renderQuizStats();
  animateCardTransition();
}

function bindEvents() {
  ui.modeSelect.addEventListener("change", (event) => {
    if (state.audioTutor.active) {
      deactivateAudioTutorMode("Tutor de audio detenido");
    }
    state.mode = event.target.value === "quiz" ? "quiz" : "learning";
    localStorage.setItem(STORAGE_KEYS.mode, state.mode);
    applyModeUI();
    clearQuizAutoNext();
    hideQuizResult();
    state.index = 0;
    resetQuizSession();
    renderCard();
  });

  ui.batchSelect.addEventListener("change", (event) => {
    if (state.audioTutor.active) {
      deactivateAudioTutorMode("Tutor de audio detenido");
    }
    state.activeBatchId = event.target.value;
    localStorage.setItem(STORAGE_KEYS.lastBatch, state.activeBatchId);
    state.activeCategory = "all";
    renderCategoryOptions();
    updateFilteredCards();
  });

  ui.categorySelect.addEventListener("change", (event) => {
    if (state.audioTutor.active) {
      deactivateAudioTutorMode("Tutor de audio detenido");
    }
    state.activeCategory = event.target.value;
    updateFilteredCards();
  });

  ui.hideKnownToggle.addEventListener("change", (event) => {
    if (state.audioTutor.active) {
      deactivateAudioTutorMode("Tutor de audio detenido");
    }
    state.hideKnown = event.target.checked;
    localStorage.setItem(STORAGE_KEYS.hideKnown, String(state.hideKnown));
    updateFilteredCards();
  });

  ui.shuffleToggle.addEventListener("change", (event) => {
    if (state.audioTutor.active) {
      deactivateAudioTutorMode("Tutor de audio detenido");
    }
    state.shuffleCards = event.target.checked;
    localStorage.setItem(STORAGE_KEYS.shuffleCards, String(state.shuffleCards));
    updateFilteredCards();
  });

  ui.prevBtn.addEventListener("click", () => moveCard(-1));
  ui.nextBtn.addEventListener("click", () => moveCard(1));
  ui.quizNextBtn.addEventListener("click", () => moveCard(1));
  ui.retryQuizBtn.addEventListener("click", () => {
    resetQuizSession();
    hideQuizResult();
    state.index = 0;
    renderCard();
  });
  ui.goHomeBtn.addEventListener("click", () => {
    hideQuizResult();
    state.index = 0;
    renderCard();
  });

  ui.knownBtn.addEventListener("click", () => {
    const card = state.cards[state.index];
    if (!card) return;
    const wasKnown = state.knownCards.has(card._id);
    if (state.knownCards.has(card._id)) {
      state.knownCards.delete(card._id);
    } else {
      state.knownCards.add(card._id);
    }
    localStorage.setItem(STORAGE_KEYS.known, JSON.stringify([...state.knownCards]));
    ui.knownBtn.classList.add("is-pulse");
    setTimeout(() => ui.knownBtn.classList.remove("is-pulse"), KNOWN_FEEDBACK_DELAY);
    const becameKnown = !wasKnown && state.knownCards.has(card._id);
    if (state.hideKnown && becameKnown) {
      removeKnownCardFromActiveView(card._id);
      return;
    }
    renderCard();
  });

  ui.card.addEventListener("click", flipCard);
  ui.cardAudioBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    playCardJapaneseAudio();
  });
  ui.card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      flipCard();
    }
    if (event.key === "ArrowRight") moveCard(1);
    if (event.key === "ArrowLeft") moveCard(-1);
  });

  let touchStartX = 0;
  ui.card.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
  });
  ui.card.addEventListener("touchend", (event) => {
    const endX = event.changedTouches[0].clientX;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 35) return;
    moveCard(delta > 0 ? -1 : 1);
  });

  ui.hamburgerBtn.addEventListener("click", openDrawer);
  ui.closeDrawerBtn.addEventListener("click", closeDrawer);
  ui.drawerOverlay.addEventListener("click", closeDrawer);
  ui.audioTutorBtn.addEventListener("click", () => {
    if (state.audioTutor.active) {
      deactivateAudioTutorMode("Tutor de audio detenido");
      closeDrawer();
      return;
    }
    activateAudioTutorMode();
    closeDrawer();
  });
  ui.audioTutorPlayPauseBtn.addEventListener("click", toggleAudioTutorPlayback);
  ui.audioTutorPrevBtn.addEventListener("click", () => audioTutorStep(-1));
  ui.audioTutorNextBtn.addEventListener("click", () => audioTutorStep(1));
  ui.audioTutorExitBtn.addEventListener("click", () => deactivateAudioTutorMode("Tutor de audio detenido"));
  ui.audioSpeedSelect.addEventListener("change", (event) => {
    const selected = Number(event.target.value);
    state.audioTutor.speedMultiplier = isValidAudioSpeed(selected) ? selected : 1;
    localStorage.setItem(STORAGE_KEYS.audioTutorSpeed, String(state.audioTutor.speedMultiplier));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.drawerMenu.classList.contains("is-open")) {
      closeDrawer();
    }
  });
}

function openDrawer() {
  ui.drawerMenu.classList.add("is-open");
  ui.drawerOverlay.classList.add("is-open");
  ui.hamburgerBtn.setAttribute("aria-expanded", "true");
}

function closeDrawer() {
  ui.drawerMenu.classList.remove("is-open");
  ui.drawerOverlay.classList.remove("is-open");
  ui.hamburgerBtn.setAttribute("aria-expanded", "false");
}

function moveCard(step) {
  if (!state.cards.length || state.quizCompleted) return;
  clearQuizAutoNext();
  state.index = (state.index + step + state.cards.length) % state.cards.length;
  if (state.audioTutor.active) {
    saveAudioTutorProgress();
  }
  renderCard();
}

function flipCard() {
  if (state.mode !== "learning" || state.audioTutor.active) return;
  ui.card.classList.toggle("is-flipped");
}

function getActiveBatch() {
  return state.batches.find((batch) => batch.id === state.activeBatchId) || state.batches[0];
}

function markSeen(cardId) {
  if (state.seenCards.has(cardId)) return;
  state.seenCards.add(cardId);
  localStorage.setItem(STORAGE_KEYS.seen, JSON.stringify([...state.seenCards]));
}

function flattenBatchCards(batch) {
  const categories = batch.categories || {};
  return Object.entries(categories).flatMap(([category, items], categoryIndex) =>
    (items || []).map((item, itemIndex) => normalizeCard(item, batch.id, category, categoryIndex, itemIndex))
  );
}

function normalizeCard(item, batchId, category, categoryIndex, itemIndex) {
  const baseCard = {
    ...item,
    reading: (item.reading || "").trim(),
    romaji: (item.romaji || item.jp || "").trim(),
    kana: getKanaFromItem(item),
    kanji: (item.kanji || "").trim(),
    _category: category
  };
  const examples = getCardExamples(baseCard);

  return {
    ...baseCard,
    example_jp: examples.example_jp,
    example_es: examples.example_es,
    _id: `${batchId}:${category}:${baseCard.romaji || item.es || "card"}:${categoryIndex}:${itemIndex}`
  };
}

function getDisplayRomaji(card) {
  return (card.romaji || card.jp || "").trim();
}

function getDisplayKana(card) {
  return getKanaFromItem(card);
}

function getDisplayKanji(card) {
  const kana = getDisplayKana(card);
  const kanji = (card.kanji || "").trim();
  const hasKana = normalizeJapaneseText(kana).length > 0;
  if (!kanji) return "";
  if (normalizeJapaneseText(kanji) === normalizeJapaneseText(kana)) return "";
  if (isKatakanaOnly(kanji) && hasKana) return "";
  return kanji;
}

function buildQuizOptions(card) {
  const pool = state.batchCards.filter((entry) => entry._id !== card._id && entry._category === card._category);
  const uniquePool = [];
  const seenEs = new Set();

  for (const item of pool) {
    const answerText = getOptionLabel(item).toLowerCase();
    if (!answerText || seenEs.has(answerText)) continue;
    seenEs.add(answerText);
    uniquePool.push(item);
  }

  const distractors = shuffle([...uniquePool]).slice(0, 3);
  if (distractors.length < 3) {
    const selected = new Set(distractors.map((item) => item._id));
    const selectedLabels = new Set(distractors.map((item) => getOptionLabel(item).toLowerCase()));
    selectedLabels.add(getOptionLabel(card).toLowerCase());
    for (const item of shuffle([...pool])) {
      const itemLabel = getOptionLabel(item).toLowerCase();
      if (selected.has(item._id)) continue;
      if (!itemLabel || selectedLabels.has(itemLabel)) continue;
      distractors.push(item);
      selected.add(item._id);
      selectedLabels.add(itemLabel);
      if (distractors.length === 3) break;
    }
  }

  const options = [
    ...distractors.slice(0, 3).map((item) => ({ id: item._id, label: getOptionLabel(item), isCorrect: false })),
    { id: card._id, label: getOptionLabel(card), isCorrect: true }
  ].filter((option) => option.label);

  return shuffle(options);
}

function renderQuizOptions() {
  ui.quizOptions.innerHTML = "";

  if (state.mode !== "quiz" || !state.cards.length) {
    ui.quizNextBtn.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();

  state.quizOptions.forEach((option) => {
    const classes = ["quiz-option"];
    if (state.hasAnsweredQuiz) {
      if (option.id === state.quizAnswerId) classes.push("is-correct");
      if (option.id === state.quizSelectedId && option.id !== state.quizAnswerId) classes.push("is-incorrect");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = classes.join(" ");
    button.dataset.optionId = option.id;
    button.disabled = state.hasAnsweredQuiz;
    button.textContent = option.label;
    button.addEventListener("click", () => handleQuizAnswer(button.dataset.optionId || ""));
    fragment.appendChild(button);
  });

  ui.quizOptions.appendChild(fragment);
}

function handleQuizAnswer(optionId) {
  if (state.mode !== "quiz" || !state.cards.length || state.hasAnsweredQuiz || state.quizCompleted) return;
  state.hasAnsweredQuiz = true;
  state.quizSelectedId = optionId;

  const isCorrect = optionId === state.quizAnswerId;
  const card = state.cards[state.index];
  if (card && !state.quizSession.answeredIds.has(card._id)) {
    state.quizSession.answeredIds.add(card._id);
    state.quizSession.answered += 1;
    if (isCorrect) {
      state.quizSession.correct += 1;
    } else {
      state.quizSession.incorrect += 1;
    }
  }

  updateQuizStats(isCorrect);
  renderQuizOptions();
  renderQuizStats();
  ui.quizNextBtn.hidden = false;

  if (state.quizSession.answered >= state.quizSession.total && state.quizSession.total > 0) {
    state.quizCompleted = true;
    showQuizResult();
    return;
  }

  clearQuizAutoNext();
  state.quizAutoNextTimer = setTimeout(() => {
    moveCard(1);
  }, QUIZ_AUTO_NEXT_DELAY);
}

function updateQuizStats(isCorrect) {
  const batchId = state.activeBatchId;
  const current = state.quizStatsByBatch[batchId] || { correct: 0, incorrect: 0, accuracy: 0 };
  const correct = current.correct + (isCorrect ? 1 : 0);
  const incorrect = current.incorrect + (isCorrect ? 0 : 1);
  const total = correct + incorrect;
  state.quizStatsByBatch[batchId] = {
    correct,
    incorrect,
    accuracy: total ? Number(((correct / total) * 100).toFixed(1)) : 0
  };
  localStorage.setItem(STORAGE_KEYS.quizStats, JSON.stringify(state.quizStatsByBatch));
}

function renderQuizStats() {
  const current = state.quizStatsByBatch[state.activeBatchId] || { correct: 0, incorrect: 0, accuracy: 0 };
  ui.quizStats.textContent = `✅ ${current.correct} · ❌ ${current.incorrect} · Precisión: ${current.accuracy}%`;
}

function renderProgress(total, position) {
  const percent = total ? Math.round((position / total) * 100) : 0;
  ui.progressFill.style.width = `${percent}%`;
  ui.progressLabel.textContent = `Progreso: ${percent}%`;
}

function readQuizStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.quizStats) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function resetQuizSession() {
  state.quizCompleted = false;
  state.quizSession = {
    total: state.cards.length,
    answered: 0,
    correct: 0,
    incorrect: 0,
    answeredIds: new Set()
  };
}

function clearQuizAutoNext() {
  if (!state.quizAutoNextTimer) return;
  clearTimeout(state.quizAutoNextTimer);
  state.quizAutoNextTimer = null;
}

function showQuizResult() {
  clearQuizAutoNext();
  const { total, correct, incorrect } = state.quizSession;
  const accuracy = total ? Number(((correct / total) * 100).toFixed(1)) : 0;
  const highScore = accuracy >= QUIZ_HIGH_SCORE_THRESHOLD;

  ui.quizResultScreen.hidden = false;
  ui.quizResultScreen.classList.toggle("is-high", highScore);
  ui.quizResultScreen.classList.toggle("is-low", !highScore);
  ui.quizResultState.textContent = highScore ? "¡Excelente!" : "Buen intento";
  ui.quizResultTitle.textContent = highScore ? "¡Gran resultado en tu quiz!" : "Sigue practicando, vas muy bien";
  ui.quizResultTotal.textContent = String(total);
  ui.quizResultCorrect.textContent = String(correct);
  ui.quizResultIncorrect.textContent = String(incorrect);
  ui.quizResultAccuracy.textContent = `${accuracy}%`;
  document.body.classList.add("showing-result");
  if (highScore) triggerConfetti();
}

function hideQuizResult() {
  ui.quizResultScreen.hidden = true;
  ui.quizResultScreen.classList.remove("is-high", "is-low");
  document.body.classList.remove("showing-result");
  document.querySelectorAll(".confetti-layer").forEach((node) => node.remove());
}

function hideSplashScreen() {
  if (!ui.splashScreen) return;
  ui.splashScreen.classList.add("is-hidden");
  setTimeout(() => {
    ui.splashScreen.hidden = true;
  }, 380);
}

function removeKnownCardFromActiveView(cardId) {
  if (!state.cards.length) return;
  const wasAnswered = state.quizSession.answeredIds.has(cardId);
  const nextCards = state.cards.filter((item) => item._id !== cardId);
  if (nextCards.length === state.cards.length) {
    renderCard();
    return;
  }
  state.cards = nextCards;
  state.index = Math.min(state.index, Math.max(state.cards.length - 1, 0));
  if (!wasAnswered) {
    state.quizSession.total = Math.max(state.quizSession.total - 1, 0);
  }
  hideQuizResult();
  renderCard();
}

function readBooleanStorage(key) {
  return localStorage.getItem(key) === "true";
}

function readModeStorage() {
  const mode = localStorage.getItem(STORAGE_KEYS.mode);
  return mode === "quiz" ? "quiz" : "learning";
}

function applyModeUI() {
  if (ui.modeSelect) {
    ui.modeSelect.value = state.mode;
  }
  document.body.classList.toggle("mode-quiz", state.mode === "quiz");
  document.body.classList.toggle("mode-learning", state.mode === "learning");
  document.body.classList.toggle("mode-audio-tutor", state.audioTutor.active);
  ui.card.setAttribute("aria-label", state.mode === "learning" ? "Tarjeta (toca para girar)" : "Tarjeta de quiz");
  if (ui.audioTutorPanel) {
    ui.audioTutorPanel.hidden = !state.audioTutor.active;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch((error) => {
    console.warn("No se pudo registrar el service worker:", error);
  });
}

function animateCardTransition() {
  ui.card.classList.remove("is-switching");
  void ui.card.offsetWidth;
  ui.card.classList.add("is-switching");
}

function renderCardExamples(card) {
  const exampleJp = (card?.example_jp || "").trim();
  const exampleEs = (card?.example_es || "").trim();
  const hasExamples = Boolean(exampleJp || exampleEs);

  ui.cardExampleBlockFront.hidden = !hasExamples;
  ui.cardExampleBlockBack.hidden = !hasExamples;
  ui.cardExampleJpFront.textContent = exampleJp;
  ui.cardExampleEsFront.textContent = exampleEs;
  ui.cardExampleJpBack.textContent = exampleJp;
  ui.cardExampleEsBack.textContent = exampleEs;
}

function getCardExamples(card) {
  const existingJp = (card?.example_jp || "").trim();
  const existingEs = (card?.example_es || "").trim();
  if (existingJp || existingEs) {
    return {
      example_jp: existingJp,
      example_es: existingEs
    };
  }
  return generateBeginnerExamplePair(card);
}

function generateBeginnerExamplePair(card) {
  const rawJpWord = getDisplayKanji(card) || getDisplayKana(card) || getDisplayRomaji(card) || card?.jp || "";
  const jpWord = normalizeExampleToken(rawJpWord) || "これ";
  const esWord = normalizeExampleToken(card?.es || "") || "esto";
  const type = (card?.type || card?._category || "").toLowerCase();

  if (type === "phrase") {
    return {
      example_jp: ensureJapanesePunctuation(jpWord),
      example_es: ensureSpanishPunctuation(card?.es || `Frase: ${esWord}`)
    };
  }
  if (/(country|país|place|lugar)/.test(type)) {
    return {
      example_jp: ensureJapanesePunctuation(`${jpWord}へいきます`),
      example_es: ensureSpanishPunctuation(`Voy a ${esWord}`)
    };
  }
  if (/(occupation|profesi|person)/.test(type)) {
    return {
      example_jp: ensureJapanesePunctuation(`わたしは${jpWord}です`),
      example_es: ensureSpanishPunctuation(`Yo soy ${esWord}`)
    };
  }
  return {
    example_jp: ensureJapanesePunctuation(`これは${jpWord}です`),
    example_es: ensureSpanishPunctuation(`Esto es ${esWord}`)
  };
}

function normalizeExampleToken(value = "") {
  return String(value)
    .replace(/\[[^\]]+]/g, "")
    .replace(/~/g, "")
    .trim();
}

function ensureJapanesePunctuation(value = "") {
  const text = value.trim();
  if (!text) return "";
  return /[。！？]$/.test(text) ? text : `${text}。`;
}

function ensureSpanishPunctuation(value = "") {
  const text = value.trim();
  if (!text) return "";
  return /[.!?¡¿]$/.test(text) ? text : `${text}.`;
}

function getKanaFromItem(item) {
  const kana = (item?.kana || item?.reading || "").trim();
  const kanji = (item?.kanji || "").trim();
  if (isKatakanaOnly(kana)) return kana;
  if (isKatakanaOnly(kanji)) return kanji;
  return kana;
}

function getOptionLabel(item) {
  return (item?.es || item?.jp || item?.romaji || "").trim();
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getSpanishLabel(value = "") {
  return UI_LABELS_ES[value] || capitalize(value);
}

function translateBatchTitle(title = "") {
  const match = title.match(/^Week\s+(\d+)\s*-\s*(.+)$/i);
  if (!match) return title;
  const [, week, level] = match;
  const levelKey = level.trim().toLowerCase();
  const translatedLevel = BATCH_TITLE_TRANSLATIONS[levelKey] || level.trim();
  return `Semana ${week} - ${translatedLevel}`;
}

function normalizeJapaneseText(value = "") {
  return value.replace(/\s+/g, "").trim();
}

function isKatakanaOnly(value = "") {
  if (!value) return false;
  // Katakana block + prolonged sound mark + middle dot + spaces.
  return /^[\u30A0-\u30FFー・\s]+$/.test(value.trim());
}

function triggerConfetti() {
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  const colors = ["#e4007c", "#00a8e8", "#ffca3a", "#11b47a", "#ff7b00"];
  for (let i = 0; i < 30; i += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.25}s`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 140}px`);
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}

function activateAudioTutorMode() {
  state.audioTutor.active = true;
  hideRepeatPromptOverlay();
  if (state.cards.length) {
    state.index = readAudioTutorProgressIndex();
  }
  renderCard();
  applyModeUI();
  if (!state.cards.length) {
    state.audioTutor.isPlaying = false;
    updateAudioTutorStatus("No hay tarjetas disponibles");
    updateAudioTutorPlayPauseButton();
    return;
  }
  if (state.audioTutor.unsupported) {
    updateAudioTutorStatus("Audio no disponible en este navegador");
    updateAudioTutorPlayPauseButton();
    return;
  }
  state.audioTutor.isPlaying = true;
  updateAudioTutorStatus("Iniciando tutor de audio...");
  updateAudioTutorPlayPauseButton();
  runAudioTutorLoop();
}

function deactivateAudioTutorMode(message = "Tutor de audio detenido") {
  stopAudioTutorPlayback();
  state.audioTutor.active = false;
  state.audioTutor.isPlaying = false;
  updateAudioTutorStatus(message);
  updateAudioTutorPlayPauseButton();
  applyModeUI();
  renderCard();
}

function toggleAudioTutorPlayback() {
  if (!state.audioTutor.active || state.audioTutor.unsupported) return;
  if (state.audioTutor.isPlaying) {
    state.audioTutor.isPlaying = false;
    stopAudioTutorPlayback(false);
    updateAudioTutorStatus("Pausado");
    updateAudioTutorPlayPauseButton();
    return;
  }
  state.audioTutor.isPlaying = true;
  updateAudioTutorStatus("Reanudando...");
  updateAudioTutorPlayPauseButton();
  runAudioTutorLoop();
}

function audioTutorStep(step) {
  if (!state.audioTutor.active || !state.cards.length) return;
  stopAudioTutorPlayback(false);
  moveCard(step);
  if (state.audioTutor.unsupported || !state.audioTutor.isPlaying) return;
  runAudioTutorLoop();
}

async function runAudioTutorLoop() {
  if (!state.audioTutor.active || !state.audioTutor.isPlaying || state.audioTutor.unsupported || !state.cards.length) return;
  const runId = ++state.audioTutor.runId;

  while (state.audioTutor.active && state.audioTutor.isPlaying && runId === state.audioTutor.runId) {
    const card = state.cards[state.index];
    if (!card) break;

    ui.card.classList.remove("is-flipped");
    renderAudioTutorProgress();
    saveAudioTutorProgress();
    updateAudioTutorStatus("Escucha la pronunciación en japonés");
    await speakWithTutorVoice(getAudioTutorJapaneseText(card), "ja-JP");
    if (!isAudioTutorRunActive(runId)) return;

    await waitForAudioTutor(AUDIO_TUTOR_CONFIG.jpToEsDelayMs, runId);
    if (!isAudioTutorRunActive(runId)) return;

    ui.card.classList.add("is-flipped");
    updateAudioTutorStatus("Escucha el significado en español");
    await speakWithTutorVoice(card.es, "es-MX");
    if (!isAudioTutorRunActive(runId)) return;

    updateAudioTutorStatus("Repite en voz alta");
    showRepeatPromptOverlay();
    await waitForAudioTutor(AUDIO_TUTOR_CONFIG.repetitionDelayMs, runId);
    hideRepeatPromptOverlay();
    if (!isAudioTutorRunActive(runId)) return;

    if (state.index >= state.cards.length - 1) {
      state.audioTutor.isPlaying = false;
      updateAudioTutorStatus("Tutor completado");
      updateAudioTutorPlayPauseButton();
      return;
    }
    moveCard(1);
  }
}

function isAudioTutorRunActive(runId) {
  return state.audioTutor.active && state.audioTutor.isPlaying && runId === state.audioTutor.runId;
}

function stopAudioTutorPlayback(resetPlaying = true) {
  state.audioTutor.runId += 1;
  hideRepeatPromptOverlay();
  if (resetPlaying) {
    state.audioTutor.isPlaying = false;
  }
  if (!state.audioTutor.unsupported) {
    window.speechSynthesis.cancel();
  }
}

function waitForAudioTutor(ms, runId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!isAudioTutorRunActive(runId)) {
        resolve();
        return;
      }
      resolve();
    }, ms);
  });
}

function getAudioTutorJapaneseText(card) {
  return getDisplayKana(card) || getDisplayKanji(card) || getDisplayRomaji(card) || card.jp || "";
}

function speakWithTutorVoice(text, language) {
  return new Promise((resolve) => {
    const phrase = (text || "").trim();
    if (!phrase || state.audioTutor.unsupported) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = language === "es-MX" ? resolveSpanishVoiceLang() : "ja-JP";
    utterance.rate = getAudioSpeechRate();

    const voice = pickTutorVoice(utterance.lang);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function pickTutorVoice(language) {
  if (state.audioTutor.unsupported) return null;
  const voices = window.speechSynthesis.getVoices();
  const target = language.toLowerCase();
  return (
    voices.find((voice) => voice.lang.toLowerCase() === target) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(target.slice(0, 2))) ||
    null
  );
}

function resolveSpanishVoiceLang() {
  if (state.audioTutor.unsupported) return "es-MX";
  const voices = window.speechSynthesis.getVoices();
  if (voices.some((voice) => voice.lang.toLowerCase() === "es-mx")) return "es-MX";
  if (voices.some((voice) => voice.lang.toLowerCase() === "es-es")) return "es-ES";
  return "es-MX";
}

function getAudioTutorProgressKey() {
  return `${state.activeBatchId}:${state.activeCategory}:${state.hideKnown ? 1 : 0}:${state.shuffleCards ? 1 : 0}`;
}

function readAudioTutorProgressIndex() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.audioTutorProgress) || "{}");
    if (!saved || typeof saved !== "object") return 0;
    const value = Number(saved[getAudioTutorProgressKey()]);
    if (!Number.isInteger(value)) return 0;
    return Math.min(Math.max(value, 0), Math.max(state.cards.length - 1, 0));
  } catch {
    return 0;
  }
}

function saveAudioTutorProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.audioTutorProgress) || "{}");
    const next = saved && typeof saved === "object" ? saved : {};
    next[getAudioTutorProgressKey()] = state.index;
    localStorage.setItem(STORAGE_KEYS.audioTutorProgress, JSON.stringify(next));
  } catch {
    // No-op on storage errors.
  }
}

function updateAudioTutorStatus(message) {
  if (!ui.audioTutorStatus) return;
  ui.audioTutorStatus.textContent = message;
}

function updateAudioTutorPlayPauseButton() {
  if (!ui.audioTutorPlayPauseBtn) return;
  ui.audioTutorPlayPauseBtn.textContent = state.audioTutor.isPlaying ? "Pausar" : "Reproducir";
  ui.audioTutorPlayPauseBtn.disabled = state.audioTutor.unsupported;
}

function renderAudioTutorProgress() {
  if (!ui.audioTutorProgress) return;
  const total = state.cards.length;
  const current = total ? state.index + 1 : 0;
  ui.audioTutorProgress.textContent = `Progreso: ${current} / ${total}`;
}

function getAudioSpeechRate() {
  const rate = AUDIO_TUTOR_CONFIG.baseSpeechRate * state.audioTutor.speedMultiplier;
  return Math.max(MIN_SPEECH_RATE, Math.min(rate, MAX_SPEECH_RATE));
}

function readAudioSpeedStorage() {
  const raw = Number(localStorage.getItem(STORAGE_KEYS.audioTutorSpeed));
  if (isValidAudioSpeed(raw)) return raw;
  return 1;
}

function isValidAudioSpeed(value) {
  return VALID_AUDIO_SPEEDS.includes(value);
}

function showRepeatPromptOverlay() {
  if (!ui.repeatPromptOverlay) return;
  ui.repeatPromptOverlay.hidden = false;
}

function hideRepeatPromptOverlay() {
  if (!ui.repeatPromptOverlay) return;
  ui.repeatPromptOverlay.hidden = true;
}

function playCardJapaneseAudio() {
  if (state.audioTutor.unsupported || state.audioTutor.active || !state.cards.length) return;
  const card = state.cards[state.index];
  if (!card) return;
  window.speechSynthesis.cancel();
  speakWithTutorVoice(getAudioTutorJapaneseText(card), "ja-JP");
}

init();
