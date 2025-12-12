const csvInput = document.getElementById('csvInput');
const questionEl = document.getElementById('question');
const optionsEl = document.getElementById('options');
const timerEl = document.getElementById('timer');
const remainingEl = document.getElementById('remaining');
const answeredTodayEl = document.getElementById('answeredToday');
const cardStatusEl = document.getElementById('cardStatus');
const loadStatusEl = document.getElementById('loadStatus');
const nextButton = document.getElementById('nextCard');
const calendarEl = document.getElementById('calendar');

let currentCard = null;
let timerInterval = null;
let questionStart = null;

const STORAGE_KEY = 'flashcardDailyCounts';

csvInput.addEventListener('change', handleFileUpload);
nextButton.addEventListener('click', () => showNextCard());

async function handleFileUpload(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  setStatus(loadStatusEl, 'Uploading CSV...', false);
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Upload failed.');
    }

    setStatus(loadStatusEl, `${data.count} cards loaded.`, false);
    setStatus(cardStatusEl, 'Click an answer to start the smart review.', false);
    answeredTodayEl.textContent = getTodayCount();
    await showNextCard();
  } catch (err) {
    console.error(err);
    setStatus(loadStatusEl, err.message, true);
  }
}

async function showNextCard() {
  resetTimer();
  try {
    const response = await fetch('/api/next');
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Could not load next card.');
    }
    currentCard = data.card;
    renderCard(currentCard);
    remainingEl.textContent = data.remaining;
    startTimer();
    setStatus(cardStatusEl, 'Answer to update scheduling.', false);
  } catch (err) {
    setStatus(cardStatusEl, err.message, true);
    questionEl.textContent = '';
    optionsEl.innerHTML = '';
  }
}

function renderCard(card) {
  if (!card) return;
  questionEl.textContent = card.question;
  optionsEl.innerHTML = '';
  card.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.className = 'option';
    button.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
    button.addEventListener('click', () => handleAnswer(index));
    optionsEl.appendChild(button);
  });
}

async function handleAnswer(selectedIndex) {
  if (!currentCard) return;
  const elapsed = Date.now() - questionStart;
  stopTimer();

  const optionNodes = optionsEl.querySelectorAll('.option');
  optionNodes.forEach((option) => (option.disabled = true));

  try {
    const response = await fetch('/api/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: currentCard.id,
        selectedIndex,
        elapsedMs: elapsed,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Could not submit answer.');
    }

    highlightAnswers(optionNodes, data.correctIndex, selectedIndex);

    if (data.correct) {
      setStatus(cardStatusEl, 'Nice work! Priority updated.', false);
    } else {
      setStatus(cardStatusEl, 'Marked for more review based on your answer.', true);
    }

    incrementTodayCount();
    answeredTodayEl.textContent = getTodayCount();
    renderCalendar();
    remainingEl.textContent = data.remaining;

    setTimeout(showNextCard, 800);
  } catch (err) {
    setStatus(cardStatusEl, err.message, true);
  }
}

function highlightAnswers(optionNodes, correctIndex, selectedIndex) {
  optionNodes.forEach((option, idx) => {
    if (idx === correctIndex) option.classList.add('correct');
    if (idx === selectedIndex && idx !== correctIndex) option.classList.add('incorrect');
  });
}

function startTimer() {
  questionStart = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - questionStart;
    timerEl.textContent = formatTime(elapsed);
  }, 200);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function resetTimer() {
  stopTimer();
  questionStart = Date.now();
  timerEl.textContent = '00:00';
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setStatus(node, message, isError = false) {
  node.textContent = message;
  node.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getCounts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (err) {
    console.warn('Could not read saved stats', err);
    return {};
  }
}

function saveCounts(counts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
}

function incrementTodayCount() {
  const key = getTodayKey();
  const counts = getCounts();
  counts[key] = (counts[key] || 0) + 1;
  saveCounts(counts);
}

function getTodayCount() {
  const counts = getCounts();
  return counts[getTodayKey()] || 0;
}

function renderCalendar() {
  const counts = getCounts();
  const today = new Date();
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells = [];

  for (let day = 1; day <= monthEnd; day++) {
    const date = new Date(today.getFullYear(), today.getMonth(), day);
    const key = date.toISOString().slice(0, 10);
    const count = counts[key] || 0;
    cells.push(createDayCell(day, count));
  }

  calendarEl.innerHTML = '';
  cells.forEach((cell) => calendarEl.appendChild(cell));
}

function createDayCell(day, count) {
  const cell = document.createElement('div');
  cell.className = 'calendar__cell';

  const dayLabel = document.createElement('div');
  dayLabel.className = 'calendar__day';
  dayLabel.textContent = new Date(new Date().getFullYear(), new Date().getMonth(), day).toLocaleDateString(
    undefined,
    { weekday: 'short' },
  );

  const dayNumber = document.createElement('div');
  dayNumber.className = 'calendar__count';
  dayNumber.textContent = count;

  const badge = document.createElement('div');
  badge.textContent = `Day ${day}`;
  badge.style.color = 'var(--muted)';
  badge.style.fontSize = '12px';

  cell.appendChild(dayLabel);
  cell.appendChild(dayNumber);
  cell.appendChild(badge);
  return cell;
}

renderCalendar();
answeredTodayEl.textContent = getTodayCount();
