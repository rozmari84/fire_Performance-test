// ===== 소방설비기사(전기) 실기 기출문제 앱 =====

const STORAGE_KEY = "fireExamStats_v1";

let categories = [];         // [{id, name, yearsFile, fileTemplate}]
let currentCategory = null;  // 현재 선택된 카테고리 객체
let allYears = [];
let currentYear = null;
let currentData = null;      // { year, exam, questions: [...] }
let orderedQuestions = [];   // 현재 모드에 따라 정렬/필터된 문제 배열
let currentIndex = 0;
let stats = loadStats();

const categorySelect = document.getElementById("categorySelect");
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
  const res = await fetch("data/categories.json");
  categories = await res.json();
  categorySelect.innerHTML = categories
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  currentCategory = categories[0];
  categorySelect.value = currentCategory.id;

  categorySelect.addEventListener("change", async () => {
    currentCategory = categories.find((c) => c.id === categorySelect.value);
    await loadYearsForCategory();
  });
  yearSelect.addEventListener("change", async () => {
    currentYear = yearSelect.value;
    await loadYear();
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
    if (confirm("이 카테고리·회차의 채점 기록을 모두 초기화할까요?")) {
      delete stats[statsKey()];
      saveStats();
      render();
      renderStatsBar();
    }
  });

  await loadYearsForCategory();
}

async function loadYearsForCategory() {
  const res = await fetch(`data/${currentCategory.yearsFile}`);
  const rawYears = await res.json();
  // 항목이 그냥 문자열("2025")이면 4자리 숫자일 때만 "년"을 붙이고,
  // 그 외(예: "경계구역 계산" 같은 주제명)는 그대로 라벨로 쓴다.
  // {id, label} 형태의 객체도 지원한다.
  allYears = rawYears.map((y) => {
    if (typeof y === "string") {
      const label = /^\d{4}$/.test(y) ? `${y}년` : y;
      return { id: y, label };
    }
    return y;
  });

  if (!allYears.length) {
    yearSelect.innerHTML = "";
    currentYear = null;
    currentData = null;
    orderedQuestions = [];
    render();
    return;
  }

  yearSelect.innerHTML = allYears
    .map((y) => `<option value="${y.id}">${y.label}</option>`)
    .join("");
  currentYear = allYears[0].id;
  yearSelect.value = currentYear;
  await loadYear();
}

async function loadYear() {
  const fileName = currentCategory.fileTemplate.replace("{year}", currentYear);
  const res = await fetch(`data/${fileName}`);
  currentData = await res.json();
  buildOrder();
  currentIndex = 0;
  render();
}

// 카테고리별로 채점 기록을 분리하기 위한 저장 키.
// 기존 "실기 기출문제"(gicho) 카테고리는 연도만으로 저장해와서(과거 기록 유지),
// 그 외 카테고리는 "카테고리아이디_연도"로 구분한다.
function statsKey() {
  if (!currentCategory || !currentYear) return null;
  return currentCategory.id === "gicho" ? currentYear : `${currentCategory.id}_${currentYear}`;
}

function buildOrder() {
  if (!currentData) {
    orderedQuestions = [];
    return;
  }
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
  const key = statsKey();
  const savedStats = (key && stats[key]) || {};
  return q.parts.some((p, i) => savedStats[`${q.id}-${i}`] === "X");
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
  const key = statsKey();
  if (!key) return;
  if (!stats[key]) stats[key] = {};
  const cellKey = `${qId}-${partIdx}`;
  if (stats[key][cellKey] === grade) {
    delete stats[key][cellKey]; // 다시 누르면 취소
  } else {
    stats[key][cellKey] = grade;
  }
  saveStats();
}

function getGrade(qId, partIdx) {
  const key = statsKey();
  const savedStats = (key && stats[key]) || {};
  return savedStats[`${qId}-${partIdx}`];
}

function render() {
  if (!currentYear || !orderedQuestions.length) {
    const msg = !currentYear
      ? "아직 이 카테고리에는 등록된 회차가 없습니다."
      : "해당 조건의 문제가 없습니다.<br>(틀린 문제 모드는 먼저 채점을 해야 표시됩니다)";
    quizArea.innerHTML = `<div class="empty-state">${msg}</div>`;
    progressLabel.textContent = "";
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    renderStatsBar();
    return;
  }

  const q = orderedQuestions[currentIndex];
  const card = document.createElement("div");
  card.className = "question-card";

  const imageList = q.images ? q.images : (q.image ? [q.image] : []);
  const imageHtml = imageList
    .map((src) => `<img class="q-image" src="${src}" alt="문제 ${q.id} 그림">`)
    .join("");

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
  const key = statsKey();
  const savedStats = (key && stats[key]) || {};
  let total = 0, correct = 0, wrong = 0;
  Object.values(savedStats).forEach((g) => {
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
