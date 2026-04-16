const STORAGE_KEYS = {
  seen: "japonea_seen_cards",
  known: "japonea_known_cards",
  lastBatch: "japonea_last_batch"
};

const state = {
  batches: [],
  activeBatchId: "",
  activeCategory: "all",
  cards: [],
  index: 0,
  seenCards: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.seen) || "[]")),
  knownCards: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.known) || "[]"))
};

const ui = {
  batchSelect: document.getElementById("batchSelect"),
  categorySelect: document.getElementById("categorySelect"),
  card: document.getElementById("card"),
  cardType: document.getElementById("cardType"),
  cardJapanese: document.getElementById("cardJapanese"),
  cardReading: document.getElementById("cardReading"),
  cardSpanish: document.getElementById("cardSpanish"),
  cardRomaji: document.getElementById("cardRomaji"),
  cardCounter: document.getElementById("cardCounter"),
  seenCounter: document.getElementById("seenCounter"),
  knownCounter: document.getElementById("knownCounter"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  knownBtn: document.getElementById("knownBtn")
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
  const categories = batch.categories || {};
  const entries = Object.entries(categories);

  const source = state.activeCategory === "all" ? entries : entries.filter(([key]) => key === state.activeCategory);

  state.cards = source.flatMap(([category, items], categoryIndex) =>
    (items || []).map((item, itemIndex) => ({
      ...item,
      _id: `${batch.id}:${category}:${item.romaji}:${categoryIndex}:${itemIndex}`
    }))
  );

  state.index = 0;
  renderCard();
}

function renderCard() {
  const total = state.cards.length;
  const hasCards = total > 0;
  const card = hasCards ? state.cards[state.index] : null;

  ui.card.classList.remove("is-flipped");

  ui.cardType.textContent = card ? capitalize(card.type || state.activeCategory) : "Sin tarjetas";
  ui.cardJapanese.textContent = card ? card.romaji.toUpperCase() : "No hay contenido";
  ui.cardReading.textContent = card && card.reading ? card.reading : "";
  ui.cardSpanish.textContent = card ? card.es : "Selecciona otra categoría";
  ui.cardRomaji.textContent = card ? `JP: ${card.jp}` : "";

  if (card) {
    markSeen(card._id);
  }

  ui.cardCounter.textContent = `${hasCards ? state.index + 1 : 0} / ${total}`;
  ui.seenCounter.textContent = `Vistas: ${state.seenCards.size}`;
  ui.knownCounter.textContent = `Conocidas: ${state.knownCards.size}`;

  ui.prevBtn.disabled = !hasCards;
  ui.nextBtn.disabled = !hasCards;
  ui.knownBtn.disabled = !hasCards;

  if (card) {
    ui.knownBtn.classList.toggle("is-known", state.knownCards.has(card._id));
    ui.knownBtn.textContent = state.knownCards.has(card._id) ? "Quitar conocida" : "Marcar conocida";
  } else {
    ui.knownBtn.classList.remove("is-known");
    ui.knownBtn.textContent = "Marcar conocida";
  }
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

  ui.knownBtn.addEventListener("click", () => {
    const card = state.cards[state.index];
    if (!card) return;
    if (state.knownCards.has(card._id)) {
      state.knownCards.delete(card._id);
    } else {
      state.knownCards.add(card._id);
    }
    localStorage.setItem(STORAGE_KEYS.known, JSON.stringify([...state.knownCards]));
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

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

init();
