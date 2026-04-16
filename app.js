const STORAGE_KEYS = {
  seen: "japonea_seen_cards",
  known: "japonea_known_cards",
  lastBatch: "japonea_last_batch",
  quizStats: "japonea_quiz_stats"
};

const QUIZ_AUTO_NEXT_DELAY = 1200;
const KNOWN_FEEDBACK_DELAY = 320;

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
  seenCards: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.seen) || "[]")),
  knownCards: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.known) || "[]")),
  quizStatsByBatch: readQuizStats()
};

const ui = {
  batchSelect: document.getElementById("batchSelect"),
  categorySelect: document.getElementById("categorySelect"),
  card: document.getElementById("card"),
  cardType: document.getElementById("cardType"),
  cardRomajiFront: document.getElementById("cardRomajiFront"),
  cardKana: document.getElementById("cardKana"),
  cardKanji: document.getElementById("cardKanji"),
  cardSpanish: document.getElementById("cardSpanish"),
  cardRomaji: document.getElementById("cardRomaji"),
  cardCounter: document.getElementById("cardCounter"),
  seenCounter: document.getElementById("seenCounter"),
  knownCounter: document.getElementById("knownCounter"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  knownBtn: document.getElementById("knownBtn"),
  quizOptions: document.getElementById("quizOptions"),
  quizNextBtn: document.getElementById("quizNextBtn"),
  quizStats: document.getElementById("quizStats")
};

async function init() {
  const response = await fetch("./data/batches.json");
  const data = await response.json();
  state.batches = data.batches || [];

  if (!state.batches.length) return;

  const storedBatch = localStorage.getItem(STORAGE_KEYS.lastBatch);
  const fallbackBatch = state.batches[0].id;
  state.activeBatchId = state.batches.some((batch) => batch.id === storedBatch) ? storedBatch : fallbackBatch;

  renderBatchOptions();
  renderCategoryOptions();
  updateFilteredCards();
  bindEvents();
}

function renderBatchOptions() {
  ui.batchSelect.innerHTML = state.batches
    .map((batch) => `<option value="${batch.id}">${batch.title}</option>`)
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
      const label = category === "all" ? "Todas" : capitalize(category);
      return `<option value="${category}">${label}</option>`;
    })
    .join("");

  ui.categorySelect.value = state.activeCategory;
}

function updateFilteredCards() {
  const batch = getActiveBatch();
  state.batchCards = flattenBatchCards(batch);
  state.cards =
    state.activeCategory === "all"
      ? state.batchCards
      : state.batchCards.filter((item) => item._category === state.activeCategory);

  state.index = 0;
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
  state.quizOptions = card ? buildQuizOptions(card) : [];

  ui.card.classList.remove("is-flipped");

  ui.cardType.textContent = card ? capitalize(card.type || state.activeCategory) : "Sin tarjetas";
  ui.cardRomajiFront.textContent = card ? getDisplayRomaji(card) : "No hay contenido";
  const kana = card ? getDisplayKana(card) : "";
  const kanji = card ? getDisplayKanji(card) : "";
  ui.cardKana.textContent = kana;
  ui.cardKanji.textContent = kanji;
  ui.cardKana.hidden = !kana;
  ui.cardKanji.hidden = !kanji;
  ui.cardSpanish.textContent = card ? card.es : "Selecciona otra categoría";
  ui.cardRomaji.textContent = card ? `JP: ${card.jp || getDisplayRomaji(card)}` : "";

  if (card) {
    markSeen(card._id);
  }

  ui.cardCounter.textContent = `${hasCards ? state.index + 1 : 0} / ${total}`;
  ui.seenCounter.textContent = `Vistas: ${state.seenCards.size}`;
  ui.knownCounter.textContent = `Conocidas: ${state.knownCards.size}`;

  ui.prevBtn.disabled = !hasCards;
  ui.nextBtn.disabled = !hasCards;
  ui.knownBtn.disabled = !hasCards;
  ui.quizNextBtn.hidden = true;
  ui.quizNextBtn.disabled = !hasCards;

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
  ui.batchSelect.addEventListener("change", (event) => {
    state.activeBatchId = event.target.value;
    localStorage.setItem(STORAGE_KEYS.lastBatch, state.activeBatchId);
    state.activeCategory = "all";
    renderCategoryOptions();
    updateFilteredCards();
  });

  ui.categorySelect.addEventListener("change", (event) => {
    state.activeCategory = event.target.value;
    updateFilteredCards();
  });

  ui.prevBtn.addEventListener("click", () => moveCard(-1));
  ui.nextBtn.addEventListener("click", () => moveCard(1));
  ui.quizNextBtn.addEventListener("click", () => moveCard(1));

  ui.knownBtn.addEventListener("click", () => {
    const card = state.cards[state.index];
    if (!card) return;
    if (state.knownCards.has(card._id)) {
      state.knownCards.delete(card._id);
    } else {
      state.knownCards.add(card._id);
    }
    localStorage.setItem(STORAGE_KEYS.known, JSON.stringify([...state.knownCards]));
    ui.knownBtn.classList.add("is-pulse");
    setTimeout(() => ui.knownBtn.classList.remove("is-pulse"), KNOWN_FEEDBACK_DELAY);
    renderCard();
  });

  ui.card.addEventListener("click", flipCard);
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
}

function moveCard(step) {
  if (!state.cards.length) return;
  clearQuizAutoNext();
  state.index = (state.index + step + state.cards.length) % state.cards.length;
  renderCard();
}

function flipCard() {
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
  const romaji = (item.romaji || item.jp || "").trim();
  const kana = getKanaFromItem(item);
  const kanji = (item.kanji || "").trim();

  return {
    ...item,
    romaji,
    kana,
    kanji,
    _category: category,
    _id: `${batchId}:${category}:${romaji || item.es || "card"}:${categoryIndex}:${itemIndex}`
  };
}

function getDisplayRomaji(card) {
  return (card.romaji || card.jp || "").toUpperCase();
}

function getDisplayKana(card) {
  return getKanaFromItem(card);
}

function getDisplayKanji(card) {
  return card.kanji || "";
}

function buildQuizOptions(card) {
  const pool = state.batchCards.filter((entry) => entry._id !== card._id);
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

  if (!state.cards.length) {
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
    button.setAttribute("aria-pressed", String(state.quizSelectedId === option.id));
    button.textContent = option.label;
    button.addEventListener("click", () => handleQuizAnswer(button.dataset.optionId || ""));
    fragment.appendChild(button);
  });

  ui.quizOptions.appendChild(fragment);
}

function handleQuizAnswer(optionId) {
  if (!state.cards.length || state.hasAnsweredQuiz) return;
  state.hasAnsweredQuiz = true;
  state.quizSelectedId = optionId;

  const isCorrect = optionId === state.quizAnswerId;
  updateQuizStats(isCorrect);
  renderQuizOptions();
  renderQuizStats();
  ui.quizNextBtn.hidden = false;

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

function readQuizStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.quizStats) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function clearQuizAutoNext() {
  if (!state.quizAutoNextTimer) return;
  clearTimeout(state.quizAutoNextTimer);
  state.quizAutoNextTimer = null;
}

function animateCardTransition() {
  ui.card.classList.remove("is-switching");
  void ui.card.offsetWidth;
  ui.card.classList.add("is-switching");
}

function getKanaFromItem(item) {
  return (item?.kana || item?.reading || "").trim();
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

init();
