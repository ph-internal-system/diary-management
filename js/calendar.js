// カレンダー描画とユーティリティ（member.js / admin.js 共通）

// 担当の色分け用パレット。土日祝日の色（青=土曜、赤=日曜・祝日）と被る
// series-1（青）・series-6（赤）は除外している。
const SERIES_COLORS = [
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-7)",
  "var(--series-8)",
  "var(--series-9)",
  "var(--series-10)",
  "var(--series-11)",
];

// 担当名から固定の色を決める（同じ担当は常に同じ色になる）
export function colorForTantou(name) {
  if (!name) return SERIES_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return SERIES_COLORS[hash % SERIES_COLORS.length];
}

const LEAVE_LABELS = { am: "午前休", pm: "午後休", full: "終日休" };

export function leaveLabel(leaveType) {
  return LEAVE_LABELS[leaveType] || "";
}

// leaveType が休暇区分（午前休・午後休・終日休）を表すかどうか（"normal"・未設定はfalse）
export function isLeaveType(leaveType) {
  return leaveType === "am" || leaveType === "pm" || leaveType === "full";
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// 表示用に文字数を最大max文字に切り詰める（超えた分は"..."にする）
export function truncateText(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "..." : text;
}

// year, month(1-12) の月初・月末の日付文字列と末日を返す
export function monthRangeStrings(year, month) {
  const start = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  return { start, end, lastDay };
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 祝日名を返す（japanese-holidays-js が読み込まれていない場合は常にundefined）
function holidayName(dateObj) {
  return window.JapaneseHolidays ? window.JapaneseHolidays.isHoliday(dateObj) : undefined;
}

// entriesByDate: { "YYYY-MM-DD": entryData }
// onCellClick(dateStr, entryData) はエントリがある日をクリックしたときに呼ばれる
export function renderCalendar(container, year, month, entriesByDate, onCellClick) {
  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "calendar-grid";

  WEEKDAYS.forEach((w, i) => {
    const el = document.createElement("div");
    el.className = "weekday" + (i === 0 ? " weekday-sun" : i === 6 ? " weekday-sat" : "");
    el.textContent = w;
    grid.appendChild(el);
  });

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const { lastDay } = monthRangeStrings(year, month);

  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(day)}`;
    const entry = entriesByDate[dateStr];
    const dateObj = new Date(year, month - 1, day);
    const weekday = dateObj.getDay();
    const holiday = holidayName(dateObj);

    const hasReply = !!(entry && entry.reply && entry.reply.text);
    const cell = document.createElement("div");
    cell.className = "calendar-cell"
      + (entry ? " has-entry" : "")
      + (hasReply ? " has-reply" : "")
      + (holiday || weekday === 0 ? " date-sun" : weekday === 6 ? " date-sat" : "");
    if (holiday) cell.title = holiday;

    const dateNum = document.createElement("div");
    dateNum.className = "date-num";
    dateNum.textContent = String(day);
    cell.appendChild(dateNum);

    if (entry) {
      if (entry.leaveType === "full") {
        cell.classList.add("is-leave");

        const badge = document.createElement("span");
        badge.className = "tantou-badge leave-badge";
        badge.textContent = leaveLabel(entry.leaveType);
        cell.appendChild(badge);
      } else {
        cell.style.setProperty("--cell-accent", colorForTantou(entry.tantou));

        const badge = document.createElement("span");
        badge.className = "tantou-badge";
        badge.style.background = colorForTantou(entry.tantou);
        badge.textContent = truncateText(entry.tantou, 10);
        cell.appendChild(badge);

        const progress = document.createElement("div");
        progress.className = "progress-text";
        progress.textContent = `${entry.progress}%`;
        cell.appendChild(progress);

        if (isLeaveType(entry.leaveType)) {
          const halfLeave = document.createElement("span");
          halfLeave.className = "half-leave-mark";
          halfLeave.textContent = leaveLabel(entry.leaveType);
          cell.appendChild(halfLeave);
        }
      }

      cell.addEventListener("click", () => onCellClick(dateStr, entry));
    }

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}
