import { requireAuth, db, logout } from "./auth.js";
import {
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { renderCalendar, monthRangeStrings, leaveLabel, isLeaveType, pad2, truncateText } from "./calendar.js";

let adminEmail = "";
let adminName = "";
let selectedMemberEmail = "";
let currentEntry = null;
let currentDateStr = "";

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth() + 1;
const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

const memberButtons = document.getElementById("member-buttons");
const calendarContainer = document.getElementById("calendar");
const monthLabel = document.getElementById("month-label");

const modalOverlay = document.getElementById("detail-modal");
const modalClose = document.getElementById("detail-close");
const detailPrevDayBtn = document.getElementById("detail-prev-day");
const detailNextDayBtn = document.getElementById("detail-next-day");
const replyForm = document.getElementById("reply-form");
const replyAuthorInput = document.getElementById("reply-author");
const replyInput = document.getElementById("reply-input");
const replyError = document.getElementById("reply-error");
const replyMessage = document.getElementById("reply-message");

const announcementForm = document.getElementById("announcement-form");
const announcementInput = document.getElementById("announcement-input");
const announcementError = document.getElementById("announcement-error");
const announcementMessage = document.getElementById("announcement-message");
const announcementList = document.getElementById("announcement-list");
const announcementManageEmpty = document.getElementById("announcement-manage-empty");

let entriesByDateMap = {};
let sortedEntryDates = [];

(async () => {
  const authInfo = await requireAuth("admin");
  adminEmail = authInfo.email;
  adminName = authInfo.name;
  document.getElementById("user-email").textContent = authInfo.name;

  await loadMemberList();
  await loadAnnouncements();
})();

document.getElementById("logout-btn").addEventListener("click", async () => {
  await logout();
  location.href = "index.html";
});

// 指定メンバーの「今日以前で一番新しい」エントリ（担当・進捗率の表示用）を取得
async function fetchLatestEntry(email) {
  const q = query(
    collection(db, "entries"),
    where("email", "==", email),
    where("date", "<=", todayStr),
    orderBy("date", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].data();
}

async function loadMemberList() {
  const q = query(collection(db, "users"), where("role", "==", "member"));
  const snap = await getDocs(q);

  const members = snap.docs.map((d) => ({ email: d.id, name: d.data().name || d.id }));

  memberButtons.innerHTML = "";

  if (members.length === 0) {
    calendarContainer.innerHTML = "<p class='hint'>メンバーが登録されていません。</p>";
    return;
  }

  // 各メンバーの最新エントリを取得し、直近で日報を入力した順（新しい日付が先）に並べ替える。
  // 入力が一件もないメンバーは末尾に回す。
  const membersWithLatest = await Promise.all(
    members.map(async (member) => ({ ...member, latest: await fetchLatestEntry(member.email) }))
  );
  membersWithLatest.sort((a, b) => {
    if (!a.latest && !b.latest) return 0;
    if (!a.latest) return 1;
    if (!b.latest) return -1;
    return b.latest.date.localeCompare(a.latest.date);
  });

  for (const member of membersWithLatest) {
    const latest = member.latest;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "member-button";
    btn.dataset.email = member.email;

    const nameEl = document.createElement("span");
    nameEl.className = "member-name";
    nameEl.textContent = member.name;
    btn.appendChild(nameEl);

    if (!latest) {
      const metaEl = document.createElement("span");
      metaEl.className = "member-meta";
      metaEl.textContent = "入力なし";
      btn.appendChild(metaEl);
    } else if (isLeaveType(latest.leaveType)) {
      const metaEl = document.createElement("span");
      metaEl.className = "member-meta";
      metaEl.textContent = leaveLabel(latest.leaveType);
      btn.appendChild(metaEl);
    } else {
      const tantouEl = document.createElement("span");
      tantouEl.className = "member-meta";
      tantouEl.textContent = truncateText(latest.tantou, 10);
      btn.appendChild(tantouEl);

      const progressEl = document.createElement("span");
      progressEl.className = "member-meta";
      progressEl.textContent = `${latest.progress}%`;
      btn.appendChild(progressEl);
    }

    btn.addEventListener("click", () => selectMember(member.email));
    memberButtons.appendChild(btn);
  }

  selectMember(membersWithLatest[0].email);
}

function selectMember(email) {
  selectedMemberEmail = email;
  memberButtons.querySelectorAll(".member-button").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.email === email);
  });
  loadCalendar();
}

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
  if (!selectedMemberEmail) return;
  monthLabel.textContent = `${viewYear}年${viewMonth}月`;
  const { start, end } = monthRangeStrings(viewYear, viewMonth);

  const q = query(
    collection(db, "entries"),
    where("email", "==", selectedMemberEmail),
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
  currentEntry = entry;
  currentDateStr = dateStr;

  document.getElementById("detail-date").textContent = dateStr;

  const leaveRow = document.getElementById("detail-leave-row");
  if (isLeaveType(entry.leaveType)) {
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

  replyError.textContent = "";
  replyMessage.textContent = "";

  const statusEl = document.getElementById("detail-reply-status");
  if (entry.reply && entry.reply.text) {
    statusEl.textContent = entry.replyRead ? "既読" : "未読";
    statusEl.className = "reply-status " + (entry.replyRead ? "is-read" : "is-unread");
    replyInput.value = entry.reply.text;
    replyAuthorInput.value = entry.reply.author || "";
  } else {
    statusEl.textContent = "";
    statusEl.className = "";
    replyInput.value = "";
    replyAuthorInput.value = "";
  }

  const idx = sortedEntryDates.indexOf(dateStr);
  detailPrevDayBtn.disabled = idx <= 0;
  detailNextDayBtn.disabled = idx === -1 || idx >= sortedEntryDates.length - 1;

  modalOverlay.hidden = false;
}

detailPrevDayBtn.addEventListener("click", () => {
  const idx = sortedEntryDates.indexOf(currentDateStr);
  if (idx > 0) {
    const prevDate = sortedEntryDates[idx - 1];
    openDetail(prevDate, entriesByDateMap[prevDate]);
  }
});

detailNextDayBtn.addEventListener("click", () => {
  const idx = sortedEntryDates.indexOf(currentDateStr);
  if (idx !== -1 && idx < sortedEntryDates.length - 1) {
    const nextDate = sortedEntryDates[idx + 1];
    openDetail(nextDate, entriesByDateMap[nextDate]);
  }
});

modalClose.addEventListener("click", () => { modalOverlay.hidden = true; });
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.hidden = true;
});

replyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  replyError.textContent = "";
  replyMessage.textContent = "";

  const text = replyInput.value.trim();
  const author = replyAuthorInput.value.trim();
  if (!author || !text) {
    replyError.textContent = "お名前とリプライを入力してください。";
    return;
  }

  try {
    const ref = doc(db, "entries", `${selectedMemberEmail}_${currentDateStr}`);
    await updateDoc(ref, { reply: { text, author }, replyRead: false });
    replyMessage.textContent = "リプライを送信しました。";
    await loadCalendar();
  } catch (err) {
    replyError.textContent = "送信に失敗しました。時間をおいて再度お試しください。";
  }
});

function formatDateTime(date) {
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

async function loadAnnouncements() {
  const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);

  announcementList.innerHTML = "";
  announcementManageEmpty.hidden = snap.size > 0;

  snap.forEach((d) => {
    const data = d.data();
    const li = document.createElement("li");
    li.className = "announcement-manage-item";

    const content = document.createElement("div");
    content.className = "announcement-content";

    const textEl = document.createElement("div");
    textEl.className = "announcement-text";
    textEl.textContent = data.text;
    content.appendChild(textEl);

    const metaEl = document.createElement("div");
    metaEl.className = "announcement-meta";
    const createdAt = data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : null;
    metaEl.textContent = `投稿者：${data.author || "不明"}${createdAt ? "　" + formatDateTime(createdAt) : ""}`;
    content.appendChild(metaEl);

    li.appendChild(content);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-secondary";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "announcements", d.id));
      await loadAnnouncements();
    });
    li.appendChild(deleteBtn);

    announcementList.appendChild(li);
  });
}

announcementForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  announcementError.textContent = "";
  announcementMessage.textContent = "";

  const text = announcementInput.value.trim();
  if (!text) {
    announcementError.textContent = "お知らせ内容を入力してください。";
    return;
  }

  try {
    await addDoc(collection(db, "announcements"), { text, author: adminName, createdAt: serverTimestamp() });
    announcementInput.value = "";
    announcementMessage.textContent = "お知らせを送信しました。";
    await loadAnnouncements();
  } catch (err) {
    announcementError.textContent = "送信に失敗しました。時間をおいて再度お試しください。";
  }
});
