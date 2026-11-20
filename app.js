const STORAGE_KEY = "fie401-flashcards-v1";

const state = {
  cards: [],
  visibleCards: [],
  currentIndex: 0,
  flipped: false,
  topic: "all",
  shuffled: false,
  progress: loadProgress(),
  highlights: loadHighlights(),
  dailyScores: loadDailyScores(),
};

const $ = (selector) => document.querySelector(selector);

async function init() {
  try {
    const source = await fetch("questions.txt").then((response) => {
      if (!response.ok) throw new Error(`Could not load questions.txt (${response.status})`);
      return response.text();
    });
    state.cards = parseCards(source);
    if (state.cards.length !== 63) throw new Error(`Expected 63 cards, found ${state.cards.length}`);
    buildTopicSelect();
    render();
  } catch (error) {
    $("#question-text").textContent = "The question file could not be loaded.";
    console.error(error);
  }
}

function parseCards(source) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const cards = [];
  const questionPattern = /^(\d+)\.\s(.+)$/;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(questionPattern);
    if (!match) continue;
    const questionNumber = Number(match[1]);
    let answerStart = index + 1;
    while (answerStart < lines.length && !lines[answerStart].trim()) answerStart += 1;
    const answerLines = [];
    for (let answerIndex = answerStart; answerIndex < lines.length; answerIndex += 1) {
      if (lines[answerIndex].trim() === "________________" || questionPattern.test(lines[answerIndex])) break;
      answerLines.push(lines[answerIndex]);
    }
    const answer = answerLines.join("\n").trim();
    const previousSeparator = lines.slice(0, index).reverse().find((line) => line.trim() === "________________");
    const topic = previousSeparator ? findTopic(lines, index) : "Week 3: Simple regression";
    cards.push({ id: questionNumber, question: match[2], answer, topic });
  }
  return cards;
}

function findTopic(lines, questionIndex) {
  for (let index = questionIndex - 1; index >= 0; index -= 1) {
    if (lines[index].startsWith("Week ")) return lines[index].trim();
  }
  return "All questions";
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    console.warn("Saved progress was invalid and has been reset.", error);
    return {};
  }
}

function loadHighlights() {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY}-highlights`)) || {};
  } catch (error) {
    console.warn("Saved highlights were invalid and have been reset.", error);
    return {};
  }
}

function loadDailyScores() {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY}-daily-scores`)) || {};
  } catch (error) {
    console.warn("Saved daily scores were invalid and have been reset.", error);
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function saveHighlights() {
  localStorage.setItem(`${STORAGE_KEY}-highlights`, JSON.stringify(state.highlights));
}

function saveDailyScores() {
  localStorage.setItem(`${STORAGE_KEY}-daily-scores`, JSON.stringify(state.dailyScores));
}

function buildTopicSelect() {
  const topics = [...new Set(state.cards.map((card) => card.topic))];
  $("#topic-select").innerHTML = ['<option value="all">All topics</option>', ...topics.map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`)].join("");
}

function render() {
  state.visibleCards = state.topic === "all" ? state.cards : state.cards.filter((card) => card.topic === state.topic);
  state.currentIndex = Math.min(state.currentIndex, state.visibleCards.length - 1);
  const card = state.visibleCards[state.currentIndex];
  state.flipped = false;
  $("#flashcard").classList.remove("flipped");
  $("#topic-title").textContent = state.topic === "all" ? "All questions" : state.topic.replace(/^Week \d+: /, "");
  $("#visible-total").textContent = state.visibleCards.length;
  $("#current-number").textContent = card.id;
  $("#front-number").textContent = String(card.id).padStart(2, "0");
  $("#back-number").textContent = String(card.id).padStart(2, "0");
  $("#front-topic").textContent = card.topic.replace(/^Week \d+: /, "");
  $("#back-topic").textContent = card.topic.replace(/^Week \d+: /, "");
  $("#question-text").textContent = card.question;
  renderAnswer(card);
  $("#topic-select").value = state.topic;
  renderStats();
  renderList();
  renderChart();
}

function updateShuffleButton() {
  const button = $("#shuffle-button");
  button.classList.toggle("is-on", state.shuffled);
  button.setAttribute("aria-pressed", String(state.shuffled));
  button.setAttribute("aria-label", state.shuffled ? "Shuffle mode on" : "Shuffle mode off");
}

function renderAnswer(card) {
  const ranges = state.highlights[card.id] || [];
  let cursor = 0;
  let html = "";
  ranges.forEach((range) => {
    html += escapeHtml(card.answer.slice(cursor, range.start));
    html += `<mark>${escapeHtml(card.answer.slice(range.start, range.end))}</mark>`;
    cursor = range.end;
  });
  $("#answer-text").innerHTML = `${html}${escapeHtml(card.answer.slice(cursor))}`;
}

function renderStats() {
  const entries = Object.values(state.progress);
  const total = entries.reduce((sum, item) => sum + item.practice, 0);
  const correct = entries.reduce((sum, item) => sum + item.correct, 0);
  const rated = state.cards.reduce((counts, card) => {
    const item = state.progress[card.id];
    const score = item?.score ?? (item?.correct > 0 ? 2 : item?.practice > 0 ? 0 : null);
    if (score === 2) counts.green += 1;
    else if (score === 1) counts.yellow += 1;
    else if (score === 0) counts.red += 1;
    else counts.unrated += 1;
    return counts;
  }, { red: 0, yellow: 0, green: 0, unrated: 0 });
  const mastered = rated.green;
  const percent = Math.round((mastered / state.cards.length) * 100);
  $("#mastered-count").textContent = mastered;
  $("#progress-percent").textContent = `${percent}%`;
  $("#red-progress").style.width = `${(rated.red / state.cards.length) * 100}%`;
  $("#yellow-progress").style.width = `${(rated.yellow / state.cards.length) * 100}%`;
  $("#green-progress").style.width = `${(rated.green / state.cards.length) * 100}%`;
  $("#unrated-progress").style.width = `${(rated.unrated / state.cards.length) * 100}%`;
  $("#red-count").textContent = rated.red;
  $("#yellow-count").textContent = rated.yellow;
  $("#green-count").textContent = rated.green;
  $("#practice-total").textContent = total;
  $("#accuracy").textContent = total ? `${Math.round((correct / total) * 100)}%` : "—";
  $("#progress-caption").textContent = mastered ? `${state.cards.length - mastered} cards still waiting for a win.` : "Rate a card to start building your progress.";
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderChart() {
  const chart = $("#score-chart");
  const width = 800;
  const height = 260;
  const plotLeft = 64;
  const plotRight = 785;
  const plotTop = 22;
  const plotBottom = 210;
  const dayWidth = (plotRight - plotLeft) / 13;
  const today = new Date();
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setHours(12, 0, 0, 0);
    date.setDate(today.getDate() - (13 - index));
    const key = localDateKey(date);
    const scores = state.dailyScores[key] || [];
    return { date, key, average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null };
  });
  const y = (score) => plotBottom - (score / 2) * (plotBottom - plotTop);
  const icon = (score, x, centerY, size = 22) => {
    const radius = size * .42;
    const stroke = "#5d5145";
    const mouth = score === 0 ? `M${x - radius * .45} ${centerY + radius * .52} Q${x} ${centerY + radius * .05} ${x + radius * .45} ${centerY + radius * .52}` : score === 1 ? `M${x - radius * .45} ${centerY + radius * .48} H${x + radius * .45}` : `M${x - radius * .45} ${centerY + radius * .05} Q${x} ${centerY + radius * .58} ${x + radius * .45} ${centerY + radius * .05}`;
    return `<g class="chart-face"><circle cx="${x}" cy="${centerY}" r="${radius}" fill="${score === 0 ? "#d98370" : score === 1 ? "#d5a248" : "#6c9b7d"}" stroke="${stroke}" /><circle cx="${x - radius * .34}" cy="${centerY - radius * .2}" r="${radius * .1}" fill="${stroke}" /><circle cx="${x + radius * .34}" cy="${centerY - radius * .2}" r="${radius * .1}" fill="${stroke}" /><path d="${mouth}" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" /></g>`;
  };
  const linePoints = days.filter((day) => day.average !== null).map((day) => {
    const x = plotLeft + days.indexOf(day) * dayWidth;
    return `${x},${y(day.average)}`;
  }).join(" ");
  const grid = [0, 1, 2].map((score) => `<line x1="${plotLeft}" x2="${plotRight}" y1="${y(score)}" y2="${y(score)}" />`).join("");
  const xLabels = days.map((day, index) => index % 2 === 0 ? `<text x="${plotLeft + index * dayWidth}" y="242">${day.date.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)}</text>` : "").join("");
  const points = days.map((day, index) => day.average === null ? "" : `<circle class="score-point" cx="${plotLeft + index * dayWidth}" cy="${y(day.average)}" r="4" />`).join("");
  chart.innerHTML = `<g class="chart-grid">${grid}</g><g class="chart-y-labels">${icon(2, 25, y(2))}${icon(1, 25, y(1))}${icon(0, 25, y(0))}</g>${linePoints ? `<polyline class="score-line" points="${linePoints}" />` : ""}<g>${points}</g><g class="chart-x-labels">${xLabels}</g>`;
}

function renderList() {
  $("#question-list").innerHTML = state.cards.map((card) => {
    const practice = state.progress[card.id]?.practice || 0;
    const active = state.visibleCards[state.currentIndex]?.id === card.id ? " active" : "";
    return `<button class="list-item${active}" type="button" data-card-id="${card.id}">
      <span class="list-number">${String(card.id).padStart(2, "0")}</span>
      <span class="list-question">${escapeHtml(card.question)}</span>
      <span class="list-count${practice ? " seen" : ""}">${practice}</span>
    </button>`;
  }).join("");
}

function flip() {
  state.flipped = !state.flipped;
  $("#flashcard").classList.toggle("flipped", state.flipped);
}

function move(direction) {
  state.currentIndex = (state.currentIndex + direction + state.visibleCards.length) % state.visibleCards.length;
  const flashcard = $("#flashcard");
  flashcard.classList.remove("slide-next", "slide-previous");
  void flashcard.offsetWidth;
  flashcard.classList.add(direction > 0 ? "slide-next" : "slide-previous");
  render();
  window.setTimeout(() => flashcard.classList.remove("slide-next", "slide-previous"), 420);
}

function review(score) {
  const card = state.visibleCards[state.currentIndex];
  const existing = state.progress[card.id] || { practice: 0, correct: 0, wrong: 0 };
  existing.practice += 1;
  existing.score = score;
  existing[score === 2 ? "correct" : "wrong"] += 1;
  state.progress[card.id] = existing;
  const dateKey = localDateKey();
  state.dailyScores[dateKey] = [...(state.dailyScores[dateKey] || []), score];
  saveProgress();
  saveDailyScores();
  if (score === 2) celebrate();
  showToast(score === 2 ? "Nice work — card mastered!" : score === 1 ? "Almost there — keep going." : "Keep it in the rotation.");
  move(1);
}

function celebrate() {
  const colors = ["#e8795f", "#2f6555", "#f1bf54", "#8baed0", "#d18baf"];
  const layer = $("#confetti-layer");
  for (let index = 0; index < 34; index += 1) {
    const piece = document.createElement("i");
    piece.className = "confetti";
    piece.style.left = `${45 + Math.random() * 10}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty("--x", `${(Math.random() - .5) * 70}vw`);
    piece.style.animationDelay = `${Math.random() * 140}ms`;
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 1100);
  }
}

let toastTimeout;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 1800);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function addHighlightFromSelection() {
  const selection = window.getSelection();
  const answer = $("#answer-text");
  if (!selection || selection.isCollapsed || !answer.contains(selection.anchorNode) || !answer.contains(selection.focusNode)) return;
  const range = selection.getRangeAt(0);
  const before = range.cloneRange();
  before.selectNodeContents(answer);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  if (end <= start) return;
  const card = state.visibleCards[state.currentIndex];
  const existing = state.highlights[card.id] || [];
  const covered = existing.some((item) => start >= item.start && end <= item.end);
  if (covered) {
    state.highlights[card.id] = existing.flatMap((item) => {
      if (end <= item.start || start >= item.end) return [item];
      return [
        ...(start > item.start ? [{ start: item.start, end: start }] : []),
        ...(end < item.end ? [{ start: end, end: item.end }] : []),
      ];
    });
  } else {
    const ranges = [...existing, { start, end }].sort((a, b) => a.start - b.start);
    const merged = [];
    ranges.forEach((item) => {
      const previous = merged[merged.length - 1];
      if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
      else merged.push({ start: item.start, end: item.end });
    });
    state.highlights[card.id] = merged;
  }
  saveHighlights();
  renderAnswer(card);
  selection.removeAllRanges();
  showToast(covered ? "Highlight removed." : "Highlight saved.");
}

$("#flashcard").addEventListener("click", (event) => {
  if (window.getSelection()?.toString() || $("#answer-text").contains(event.target)) return;
  flip();
});
document.querySelectorAll(".rating-button").forEach((button) => {
  button.addEventListener("click", () => review(Number(button.dataset.score)));
});
$("#answer-text").addEventListener("mouseup", addHighlightFromSelection);
$("#answer-text").addEventListener("touchend", addHighlightFromSelection);
$("#flashcard").addEventListener("keydown", (event) => {
  if (event.target !== $("#flashcard")) return;
  if (event.code === "Space" || event.key === "Enter") {
    event.preventDefault();
    flip();
  }
});
$("#topic-select").addEventListener("change", (event) => {
  state.topic = event.target.value;
  state.currentIndex = 0;
  render();
});
$("#shuffle-button").addEventListener("click", () => {
  const currentId = state.visibleCards[state.currentIndex]?.id;
  state.shuffled = !state.shuffled;
  if (state.shuffled) {
    for (let index = state.cards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [state.cards[index], state.cards[swapIndex]] = [state.cards[swapIndex], state.cards[index]];
    }
  } else {
    state.cards.sort((a, b) => a.id - b.id);
  }
  state.currentIndex = 0;
  render();
  if (currentId) {
    const currentIndex = state.visibleCards.findIndex((card) => card.id === currentId);
    if (currentIndex >= 0) {
      state.currentIndex = currentIndex;
      render();
    }
  }
  updateShuffleButton();
  showToast(state.shuffled ? "Shuffle mode on." : "Chronological mode on.");
});
$("#question-list").addEventListener("click", (event) => {
  const item = event.target.closest("[data-card-id]");
  if (!item) return;
  state.currentIndex = state.visibleCards.findIndex((card) => card.id === Number(item.dataset.cardId));
  render();
  window.scrollTo({ top: document.querySelector(".study-area").offsetTop - 25, behavior: "smooth" });
});
let resetTimeout;
$("#reset-progress").addEventListener("click", (event) => {
  const button = event.currentTarget;
  if (!button.dataset.armed) {
    button.dataset.armed = "true";
    button.textContent = "Confirm reset";
    button.setAttribute("aria-label", "Confirm reset of all progress and highlights");
    clearTimeout(resetTimeout);
    resetTimeout = setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = "↺";
      button.setAttribute("aria-label", "Reset all progress");
    }, 3500);
    showToast("Click “Confirm reset” within 3 seconds to continue.");
    return;
  }
  delete button.dataset.armed;
  button.textContent = "↺";
  button.setAttribute("aria-label", "Reset all progress");
  clearTimeout(resetTimeout);
  state.progress = {};
  state.highlights = {};
  state.dailyScores = {};
  saveProgress();
  saveHighlights();
  saveDailyScores();
  render();
  showToast("Progress and highlights reset.");
});
document.addEventListener("keydown", (event) => {
  if (event.target.matches("select, input, textarea")) return;
  if (event.code === "Space") { event.preventDefault(); flip(); }
  if (event.key === "ArrowRight") move(1);
  if (event.key === "ArrowLeft") move(-1);
});

init();
