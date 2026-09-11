// ===== 소방설비기사(전기) 실기 기출문제 앱 =====

const STORAGE_KEY = "fireExamStats_v1";

let allYears = [];
let currentYear = null;
let currentData = null;      // { year, exam, questions: [...] }
let orderedQuestions = [];   // 현재 모드에 따라 정렬/필터된 문제 배열
let currentIndex = 0;
let stats = loadStats();

const yearSelect = document.getElementById("yearSelect");
const modeSelect = document.getElementById("modeSelect");
const quizArea = document.getElementById("quizArea");
const statsBar = document.getElementById("statsBar");
const progressLabel = document.getElementById("progressLabel");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const resetStatsBtn = document.getElementById("resetStatsBtn");

init();

async function init() {
  const res = await fetch("data/years.json");
  allYears = await res.json();
  yearSelect.innerHTML = allYears
    .map((y) => `<option value="${y}">${y}년</option>`)
    .join("");
  currentYear = allYears[0];
  yearSelect.value = currentYear;

  yearSelect.addEventListener("change", async () => {
    currentYear = yearSelect.value;
    await loadYear(currentYear);
  });
  modeSelect.addEventListener("change", () => {
    buildOrder();
    currentIndex = 0;
    render();
  });
  prevBtn.addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      render();
    }
  });
  nextBtn.addEventListener("click", () => {
    if (currentIndex < orderedQuestions.length - 1) {
      currentIndex++;
      render();
    }
  });
  resetStatsBtn.addEventListener("click", () => {
    if (confirm("이 회차의 채점 기록을 모두 초기화할까요?")) {
      delete stats[currentYear];
      saveStats();
      render();
      renderStatsBar();
    }
  });

  await loadYear(currentYear);
}

async function loadYear(year) {
  const res = await fetch(`data/${year}.json`);
  currentData = await res.json();
  buildOrder();
  currentIndex = 0;
  render();
}

function buildOrder() {
  const mode = modeSelect.value;
  let qs = currentData.questions.slice();

  if (mode === "random") {
    qs = shuffle(qs);
  } else if (mode === "wrong") {
    qs = qs.filter((q) => questionHasWrong(q));
  }
  orderedQuestions = qs;
}

function questionHasWrong(q) {
  const yearStats = stats[currentYear] || {};
  return q.parts.some((p, i) => yearStats[`${q.id}-${i}`] === "X");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveStats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function setGrade(qId, partIdx, grade) {
  if (!stats[currentYear]) stats[currentYear] = {};
  const key = `${qId}-${partIdx}`;
  if (stats[currentYear][key] === grade) {
    delete stats[currentYear][key]; // 다시 누르면 취소
  } else {
    stats[currentYear][key] = grade;
  }
  saveStats();
}

function getGrade(qId, partIdx) {
  const yearStats = stats[currentYear] || {};
  return yearStats[`${qId}-${partIdx}`];
}

function render() {
  if (!orderedQuestions.length) {
    quizArea.innerHTML = `<div class="empty-state">해당 조건의 문제가 없습니다.<br>(틀린 문제 모드는 먼저 채점을 해야 표시됩니다)</div>`;
    progressLabel.textContent = "";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    renderStatsBar();
    return;
  }

  const q = orderedQuestions[currentIndex];
  const card = document.createElement("div");
  card.className = "question-card";

  const imageHtml = q.image ? `<img class="q-image" src="${q.image}" alt="문제 ${q.id} 그림">` : "";

  const partsHtml = q.parts
    .map((part, idx) => {
      const grade = getGrade(q.id, idx);
      return `
        <div class="part-row">
          <div class="part-label">${escapeHtml(part.label)}</div>
          <textarea class="part-input" data-idx="${idx}" placeholder="답을 입력하세요"></textarea>
          <div class="answer-box" data-idx="${idx}">
            <div class="ans-label">모범 답안</div>
            <div>${escapeHtml(part.answer)}</div>
          </div>
          <div class="grade-btns" data-idx="${idx}">
            <button class="grade-btn o ${grade === "O" ? "active" : ""}" data-idx="${idx}" data-grade="O">O 맞음</button>
            <button class="grade-btn x ${grade === "X" ? "active" : ""}" data-idx="${idx}" data-grade="X">X 틀림</button>
          </div>
        </div>`;
    })
    .join("");

  card.innerHTML = `
    <div class="q-number">문제 ${q.id}</div>
    <div class="q-text">${escapeHtml(q.text)}</div>
    ${imageHtml}
    ${partsHtml}
    <div class="card-actions">
      <button class="primary-btn" id="checkBtn">정답 확인</button>
    </div>
  `;

  quizArea.innerHTML = "";
  quizArea.appendChild(card);

  document.getElementById("checkBtn").addEventListener("click", () => {
    card.querySelectorAll(".answer-box").forEach((el) => el.classList.add("show"));
    card.querySelectorAll(".grade-btns").forEach((el) => el.classList.add("show"));
  });

  card.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = btn.dataset.idx;
      const grade = btn.dataset.grade;
      setGrade(q.id, idx, grade);
      // 버튼 활성화 갱신
      const wrap = card.querySelector(`.grade-btns[data-idx="${idx}"]`);
      wrap.querySelectorAll(".grade-btn").forEach((b) => b.classList.remove("active"));
      if (getGrade(q.id, idx) === grade) {
        btn.classList.add("active");
      }
      renderStatsBar();
    });
  });

  progressLabel.textContent = `${currentIndex + 1} / ${orderedQuestions.length}`;
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === orderedQuestions.length - 1;

  renderStatsBar();
}

function renderStatsBar() {
  const yearStats = stats[currentYear] || {};
  let total = 0, correct = 0, wrong = 0;
  Object.values(yearStats).forEach((g) => {
    total++;
    if (g === "O") correct++;
    if (g === "X") wrong++;
  });
  const totalQuestions = currentData ? currentData.questions.length : 0;
  const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  statsBar.innerHTML = `
    <span>전체 문제 <b>${totalQuestions}</b>개</span>
    <span>채점 <b>${total}</b>개</span>
    <span>정답 <b>${correct}</b> / 오답 <b>${wrong}</b></span>
    <span>정답률 <b>${rate}%</b></span>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
