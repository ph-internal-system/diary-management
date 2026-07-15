import { requireAuth, db, logout } from "./auth.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { renderCalendar, monthRangeStrings, pad2, leaveLabel, isLeaveType } from "./calendar.js";

let email = "";
const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth() + 1;

const dateInput = document.getElementById("entry-date");
const leaveInput = document.getElementById("entry-leave");
const tantouInput = document.getElementById("entry-tantou");
const progressInput = document.getElementById("entry-progress");
const statusInput = document.getElementById("entry-status");
const learnedInput = document.getElementById("entry-learned");
const tomorrowInput = document.getElementById("entry-tomorrow");
const otherInput = document.getElementById("entry-other");
const entrySaveError = document.getElementById("entry-save-error");
const entrySaveMessage = document.getElementById("entry-save-message");
const entryForm = document.getElementById("entry-form");

const calendarContainer = document.getElementById("calendar");
const monthLabel = document.getElementById("month-label");

const modalOverlay = document.getElementById("detail-modal");
const modalClose = document.getElementById("detail-close");
const detailPrevDayBtn = document.getElementById("detail-prev-day");
const detailNextDayBtn = document.getElementById("detail-next-day");

let entriesByDateMap = {};
let sortedEntryDates = [];

const workFields = [tantouInput, progressInput, statusInput, learnedInput, tomorrowInput];

// 終日休の場合、「その他」以外を非活性にする（午前休・午後休は勤務した分の報告が必要なため活性のまま）
function applyLeaveMode() {
  const isFullLeave = leaveInput.value === "full";
  workFields.forEach((el) => { el.disabled = isFullLeave; });
}

leaveInput.addEventListener("change", applyLeaveMode);

(async () => {
  const authInfo = await requireAuth("member");
  email = authInfo.email;
  document.getElementById("user-email").textContent = authInfo.name;

  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  flatpickr(dateInput, {
    dateFormat: "Y-m-d",
    defaultDate: todayStr,
    allowInput: false,
    locale: "ja",
    onChange: () => loadEntryIntoForm(),
  });
  await loadEntryIntoForm();

  await loadCalendar();
})();

document.getElementById("logout-btn").addEventListener("click", async () => {
  await logout();
  location.href = "index.html";
});

async function loadEntryIntoForm() {
  entrySaveMessage.textContent = "";
  entrySaveError.textContent = "";
  const date = dateInput.value;
  if (!date) return;

  const snap = await getDoc(doc(db, "entries", `${email}_${date}`));
  if (snap.exists()) {
    const d = snap.data();
    leaveInput.value = d.leaveType || "normal";
    tantouInput.value = d.tantou || "";
    progressInput.value = String(d.progress ?? "0");
    statusInput.value = d.status || "";
    learnedInput.value = d.learned || "";
    tomorrowInput.value = d.tomorrow || "";
    otherInput.value = d.other || "";
  } else {
    leaveInput.value = "normal";
    tantouInput.value = "";
    progressInput.value = "0";
    statusInput.value = "";
    learnedInput.value = "";
    tomorrowInput.value = "";
    otherInput.value = "";
  }
  applyLeaveMode();
}

entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  entrySaveError.textContent = "";
  entrySaveMessage.textContent = "";

  const date = dateInput.value;
  const leaveType = leaveInput.value;
  const isFullLeave = leaveType === "full";

  const tantou = isFullLeave ? "" : tantouInput.value.trim();
  const progress = isFullLeave ? 0 : Number(progressInput.value);
  const status = isFullLeave ? "" : statusInput.value;
  const learned = isFullLeave ? "" : learnedInput.value;
  const tomorrow = isFullLeave ? "" : tomorrowInput.value;
  const other = otherInput.value;

  if (!date || !leaveType) {
    entrySaveError.textContent = "必須項目が入力されていません。";
    return;
  }

  if (!isFullLeave && (!tantou || !status.trim() || !learned.trim() || !tomorrow.trim())) {
    entrySaveError.textContent = "必須項目が入力されていません。";
    return;
  }

  try {
    const ref = doc(db, "entries", `${email}_${date}`);
    await setDoc(ref, { email, date, leaveType, tantou, progress, status, learned, tomorrow, other }, { merge: true });
    entrySaveMessage.textContent = "保存しました。";
    await loadCalendar();
  } catch (err) {
    entrySaveError.textContent = "保存に失敗しました。時間をおいて再度お試しください。";
  }
});

document.getElementById("prev-month").addEventListener("click", () => {
  viewMonth -= 1;
  if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; }
  loadCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  viewMonth += 1;
  if (viewMonth > 12) { viewMonth = 1; viewYear += 1; }
  loadCalendar();
});

async function loadCalendar() {
  monthLabel.textContent = `${viewYear}年${viewMonth}月`;
  const { start, end } = monthRangeStrings(viewYear, viewMonth);

  const q = query(
    collection(db, "entries"),
    where("email", "==", email),
    where("date", ">=", start),
    where("date", "<=", end),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  const entriesByDate = {};
  snap.forEach((d) => { entriesByDate[d.data().date] = d.data(); });

  entriesByDateMap = entriesByDate;
  sortedEntryDates = Object.keys(entriesByDate).sort();

  renderCalendar(calendarContainer, viewYear, viewMonth, entriesByDate, openDetail);
}

function openDetail(dateStr, entry) {
  document.getElementById("detail-date").textContent = dateStr;

  const leaveRow = document.getElementById("detail-leave-row");
  const onLeave = isLeaveType(entry.leaveType);
  if (onLeave) {
    leaveRow.hidden = false;
    document.getElementById("detail-leave").textContent = leaveLabel(entry.leaveType);
  } else {
    leaveRow.hidden = true;
  }

  document.getElementById("detail-tantou").textContent = entry.tantou || (entry.leaveType === "full" ? "（休暇のため入力なし）" : "");
  document.getElementById("detail-progress").textContent = entry.leaveType === "full" ? "" : `${entry.progress}%`;
  document.getElementById("detail-status").textContent = entry.status;
  document.getElementById("detail-learned").textContent = entry.learned || "";
  document.getElementById("detail-tomorrow").textContent = entry.tomorrow;
  document.getElementById("detail-other").textContent = entry.other || "（なし）";

  const replySection = document.getElementById("detail-reply-section");
  if (entry.reply && entry.reply.text) {
    replySection.hidden = false;
    document.getElementById("detail-reply-author").textContent = `（回答者：${entry.reply.author || "不明"}）`;
    document.getElementById("detail-reply-text").textContent = entry.reply.text;
  } else {
    replySection.hidden = true;
  }

  const idx = sortedEntryDates.indexOf(dateStr);
  detailPrevDayBtn.disabled = idx <= 0;
  detailNextDayBtn.disabled = idx === -1 || idx >= sortedEntryDates.length - 1;

  modalOverlay.hidden = false;
}

detailPrevDayBtn.addEventListener("click", () => {
  const idx = sortedEntryDates.indexOf(document.getElementById("detail-date").textContent);
  if (idx > 0) {
    const prevDate = sortedEntryDates[idx - 1];
    openDetail(prevDate, entriesByDateMap[prevDate]);
  }
});

detailNextDayBtn.addEventListener("click", () => {
  const idx = sortedEntryDates.indexOf(document.getElementById("detail-date").textContent);
  if (idx !== -1 && idx < sortedEntryDates.length - 1) {
    const nextDate = sortedEntryDates[idx + 1];
    openDetail(nextDate, entriesByDateMap[nextDate]);
  }
});

modalClose.addEventListener("click", () => { modalOverlay.hidden = true; });
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.hidden = true;
});
