const PLATES = {
  1: { name: "並皿", time: 5, price: 100, image: "./assets/sushi-nami-pixel.webp", color: "#86a967", emoji: "🥒" },
  2: { name: "上皿", time: 15, price: 300, image: "./assets/sushi-jo-pixel.webp", color: "#4f78b5", emoji: "🍣" },
  3: { name: "特上皿", time: 25, price: 500, image: "./assets/sushi-tokujo-pixel.webp", color: "#e2b94d", emoji: "✨" }
};

const STORAGE_KEY = "sushigoto-state";
const SCHEMA_VERSION = 2;
const LEGACY_DEMO_TITLES = new Set([
  "企画書の構成案を作成",
  "重要メールに返信する",
  "週次ミーティングの準備",
  "経費精算を提出する",
  "新機能の画面設計を詰める",
  "カレンダー：明日の会議資料を確認",
  "Tasks：請求書をダウンロード",
  "ブラウザ動作確認タスク"
]);

function completionTimestamp(item) {
  if (item.completedAt && !Number.isNaN(Date.parse(item.completedAt))) return item.completedAt;
  if (Number.isFinite(Number(item.id)) && Number(item.id) > 1_000_000_000_000) {
    return new Date(Number(item.id)).toISOString();
  }
  return null;
}

function migrateState(raw) {
  if (!raw || typeof raw !== "object") {
    return { schemaVersion: SCHEMA_VERSION, tasks: [], completed: [], activeId: null, phase: "prep" };
  }
  const removeLegacyDemo = !raw.schemaVersion || raw.schemaVersion < SCHEMA_VERSION;
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.filter(task =>
    task && typeof task.title === "string" && (!removeLegacyDemo || !LEGACY_DEMO_TITLES.has(task.title))
  ) : [];
  const completed = Array.isArray(raw.completed) ? raw.completed
    .filter(item => item && typeof item.title === "string" && (!removeLegacyDemo || !LEGACY_DEMO_TITLES.has(item.title)))
    .map(item => ({ ...item, completedAt: completionTimestamp(item) }))
    .filter(item => item.completedAt) : [];
  const activeId = tasks.some(task => task.id === raw.activeId) ? raw.activeId : tasks[0]?.id || null;
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    completed,
    activeId,
    phase: ["prep", "action", "result"].includes(raw.phase) ? raw.phase : "prep"
  };
}

let stored;
try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}
const state = migrateState(stored);
let secondsLeft = 0;
let maxSeconds = 0;
let timerId = null;
let selectedAssetId = null;
let currentView = "prep";
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

const $ = (selector) => document.querySelector(selector);
const yen = (n) => `¥${Math.round(n).toLocaleString("ja-JP")}`;
const activeTask = () => state.tasks.find(t => t.id === state.activeId) || state.tasks[0];
const plateOf = (task) => PLATES[task.plate];
const localDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const completedForDate = key => state.completed.filter(item => localDateKey(item.completedAt) === key);
const todayCompleted = () => completedForDate(localDateKey());
const earnedTotalFor = items => items.reduce((sum, item) => sum + Number(item.earnedPrice || 0), 0);

function dailyHistory() {
  const grouped = new Map();
  state.completed.forEach(item => {
    const key = localDateKey(item.completedAt);
    const current = grouped.get(key) || { date: key, earned: 0, count: 0, penalties: 0 };
    current.earned += Number(item.earnedPrice || 0);
    current.penalties += Number(item.penaltyPrice || 0);
    current.count += 1;
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}

function switchTab(id) {
  if (currentView === "action" && id !== "action") pauseTimer();
  if (id === "action" && !activeTask()) {
    id = todayCompleted().length ? "result" : "prep";
    toast(todayCompleted().length ? "本日のタスクは完食済みです。精算へ進みます" : "まずは仕込みでお皿を用意しましょう");
  }
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  currentView = id;
  document.body.dataset.phase = id;
  if (["prep", "action", "result"].includes(id)) {
    state.phase = id;
    save();
  }
  if (id === "result") renderResult();
  if (id === "journal") renderJournal();
  if (id === "action") startTimer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetTimer() {
  clearInterval(timerId); timerId = null;
  const task = activeTask();
  maxSeconds = task ? plateOf(task).time * 60 : 0;
  secondsLeft = maxSeconds;
  renderTimer();
  $("#startTimer").textContent = "▶ スタート";
}

function startTimer() {
  if (!activeTask() || timerId) return;
  timerId = setInterval(() => { secondsLeft -= 1; renderTimer(); }, 1000);
  $("#startTimer").textContent = "Ⅱ 一時停止";
}

function pauseTimer() {
  if (!timerId) return;
  clearInterval(timerId);
  timerId = null;
  $("#startTimer").textContent = "▶ 再開する";
}

function renderTimer() {
  const overtime = secondsLeft < 0;
  const abs = Math.abs(secondsLeft);
  const mins = Math.floor(abs / 60).toString().padStart(2, "0");
  const secs = (abs % 60).toString().padStart(2, "0");
  $("#timer").textContent = `${overtime ? "−" : ""}${mins}:${secs}`;
  $("#timer").style.color = overtime ? "var(--salmon)" : "";
  $("#freshness").classList.toggle("overtime", overtime);
  $("#freshness").innerHTML = overtime ? "<span></span> 鮮度低下中" : "<span></span> 鮮度良好";
  $("#progressBar").style.width = `${overtime ? 100 : Math.max(0, secondsLeft / maxSeconds * 100)}%`;
  $("#progressBar").style.background = overtime ? "var(--salmon)" : "";
}

function toggleTimer() {
  if (!activeTask()) return;
  if (timerId) pauseTimer();
  else startTimer();
}

function setActive(id) {
  state.activeId = id; save(); resetTimer(); renderAll();
  if (currentView === "action") startTimer();
  toast("手元のお皿を入れ替えました");
}

function renderAction() {
  const task = activeTask();
  $("#focusCounter").classList.toggle("hidden", !task);
  $("#emptyFocus").classList.toggle("hidden", !!task);
  if (!task) { $("#beltTrack").innerHTML = ""; return; }
  const plate = plateOf(task);
  $("#focusImage").src = plate.image;
  $("#focusImage").alt = `${plate.name}の寿司`;
  $("#focusPrice").textContent = yen(plate.price);
  $("#focusTier").textContent = plate.name;
  $("#focusMinutes").textContent = `${plate.time}分勝負`;
  $("#focusTitle").textContent = task.title;
  const counts = { memo: 0, link: 0, doc: 0 };
  task.items.forEach(i => counts[i.type]++);
  $("#assetSummary").textContent = `📝 メモ ${counts.memo}　🔗 リンク ${counts.link}　📄 資料 ${counts.doc}`;
  const waiting = state.tasks.filter(t => t.id !== task.id);
  const beltTasks = waiting.length ? [...waiting, ...waiting] : [];
  $("#beltTrack").innerHTML = beltTasks.map(t => {
    const p = plateOf(t);
    return `<button class="belt-item" data-task-id="${t.id}" style="--plate-color:${p.color}"><img src="${p.image}" alt=""><span><b>${escapeHtml(t.title)}</b><small>${p.name} · ${p.time}分</small></span></button>`;
  }).join("");
  $("#beltTrack").style.animationPlayState = waiting.length < 2 ? "paused" : "";
  document.querySelectorAll(".belt-item").forEach(b => b.addEventListener("click", () => setActive(Number(b.dataset.taskId))));
}

function renderTasks() {
  $("#taskList").innerHTML = state.tasks.length ? state.tasks.map(t => {
    const p = plateOf(t);
    return `<div class="task-row ${t.id === state.activeId ? "active-task" : ""}">
      <img src="${p.image}" alt=""><div><b>${escapeHtml(t.title)}</b><small>${p.name} · ${p.time}分 · ${yen(p.price)}　/　アセット ${t.items.length}件</small></div>
      <div class="row-actions"><button data-focus="${t.id}" title="手元へ">◎</button><button data-delete="${t.id}" title="削除">×</button></div>
    </div>`;
  }).join("") : `<div class="receipt-empty">ネタケースは空です。<br>新しいお仕事を仕込みましょう。</div>`;
  $("#beginAction").disabled = state.tasks.length === 0;
  document.querySelectorAll("[data-focus]").forEach(b => b.onclick = () => { setActive(Number(b.dataset.focus)); switchTab("action"); });
  document.querySelectorAll("[data-delete]").forEach(b => b.onclick = () => deleteTask(Number(b.dataset.delete)));
}

function deleteTask(id) {
  const target = state.tasks.find(t => t.id === id);
  if (!target || !confirm(`「${target.title}」をネタケースから外しますか？`)) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (state.activeId === id) state.activeId = state.tasks[0]?.id || null;
  save(); resetTimer(); renderAll(); toast("ネタケースから外しました");
  if (currentView === "action") {
    if (activeTask()) startTimer();
    else switchTab(todayCompleted().length ? "result" : "prep");
  }
}

function completeTask() {
  const task = activeTask();
  if (!task) return;
  clearInterval(timerId); timerId = null;
  const p = plateOf(task);
  const overtimeMinutes = Math.ceil(Math.abs(Math.min(0, secondsLeft)) / 60);
  const penalty = secondsLeft >= 0 ? 0 : Math.min(p.price * .7, overtimeMinutes * (p.price * .1));
  const earned = Math.max(p.price * .3, p.price - penalty);
  state.completed.push({
    id: Date.now(),
    title: task.title,
    plate: task.plate,
    price: p.price,
    earnedPrice: earned,
    penaltyPrice: penalty,
    completedAt: new Date().toISOString()
  });
  state.tasks = state.tasks.filter(t => t.id !== task.id);
  state.activeId = state.tasks[0]?.id || null;
  save(); resetTimer(); renderAll();
  if (activeTask()) {
    startTimer();
    toast(`${p.emoji} 完食！ 次のお皿を自動で開始しました`);
  } else {
    switchTab("result");
    toast(`${p.emoji} 全皿完食！ 精算フェーズへ移動しました`);
  }
}

function renderResult() {
  const completed = todayCompleted();
  $("#receiptItems").innerHTML = completed.length ? completed.map(t =>
    `<div class="receipt-item"><span>${PLATES[t.plate].emoji} ${escapeHtml(t.title)}</span><b>${yen(t.earnedPrice)}</b><small>${PLATES[t.plate].name}　定価 ${yen(t.price)}${t.penaltyPrice ? ` / 鮮度低下 −${yen(t.penaltyPrice)}` : ""}</small></div>`
  ).join("") : `<div class="receipt-empty">まだ完食したお皿はありません。<br>最初の一皿をいただきましょう。</div>`;
  const subtotal = completed.reduce((s, t) => s + Number(t.price || 0), 0);
  const penalties = completed.reduce((s, t) => s + Number(t.penaltyPrice || 0), 0);
  const earned = earnedTotalFor(completed);
  $("#subtotal").textContent = yen(subtotal);
  $("#penaltyTotal").textContent = `−${yen(penalties)}`;
  $("#earnedTotal").textContent = yen(earned);
  $("#headerEarnings").textContent = yen(earned);
  $("#completedCount").textContent = completed.length;
  const fresh = completed.filter(t => !t.penaltyPrice).length;
  $("#freshRate").textContent = completed.length ? `${Math.round(fresh / completed.length * 100)}%` : "—";
  $("#masterComment").textContent = earned >= 1500 ? "見事な大漁だ。今日の集中は、立派な職人仕事だったぞ。" :
    earned >= 700 ? "いい包丁さばきだ。焦らず、この調子で一皿ずつ積み上げな。" :
    earned > 0 ? "いい一皿だった。小さな完食が、明日の腕をつくるんだ。" : "まずは一皿。いい仕事は、いい仕込みからだ。";
}

function renderJournal() {
  const now = new Date();
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $("#calendarMonth").textContent = `${year}年 ${month + 1}月`;
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const history = dailyHistory();
  const historyByDate = new Map(history.map(day => [day.date, day]));
  let html = "<div></div>".repeat(offset);
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const key = localDateKey(date);
    const isToday = key === localDateKey(now);
    const score = historyByDate.get(key)?.earned || 0;
    const icon = score >= 1000 ? "🐟" : score >= 500 ? "✨" : score >= 300 ? "🍣" : score > 0 ? "🥒" : "";
    html += `<div class="day ${score ? "active-day" : ""} ${isToday ? "today" : ""}"><span>${d}</span><i>${icon}</i>${score ? `<span class="day-earn">${yen(score)}</span>` : ""}</div>`;
  }
  $("#calendar").innerHTML = html;

  const ranking = [...history].sort((a, b) => b.earned - a.earned || b.date.localeCompare(a.date));
  const topDays = ranking.slice(0, 5);
  $("#rankingList").innerHTML = topDays.length ? topDays.map(day => {
    const label = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" })
      .format(new Date(`${day.date}T00:00:00+09:00`));
    return `<li><div><b>${label}</b><small>完食 ${day.count}皿${day.penalties ? ` · 鮮度低下 ${yen(day.penalties)}` : ""}</small></div><strong>${yen(day.earned)}</strong></li>`;
  }).join("") : `<li class="ranking-empty"><div><b>まだ営業履歴がありません</b><small>最初の一皿を完食すると番付に載ります</small></div><strong>—</strong></li>`;

  const todayKey = localDateKey();
  const todayEarned = historyByDate.get(todayKey)?.earned || 0;
  const currentRank = ranking.findIndex(day => day.date === todayKey);
  $("#rankingSummary").textContent = history.length ? `実データ ${history.length}営業日から集計` : "営業履歴はまだありません";
  $("#currentRank").textContent = currentRank >= 0 ? currentRank + 1 : "—";
  $("#rankTitle").textContent = `称号：${todayEarned >= 1500 ? "大漁の親方" : todayEarned >= 700 ? "一人前の板前" : todayEarned > 0 ? "期待の板前" : "見習い"}`;
  $("#rankEarnings").textContent = yen(todayEarned);
}

function openExplorer() {
  const task = activeTask(); if (!task) return;
  selectedAssetId = task.items[0]?.id || null;
  $("#drawerTaskTitle").textContent = task.title;
  $("#explorer").classList.add("open"); $("#drawerBackdrop").classList.add("open");
  $("#explorer").setAttribute("aria-hidden", "false");
  renderAssets();
}
function closeExplorer() {
  $("#explorer").classList.remove("open"); $("#drawerBackdrop").classList.remove("open");
  $("#explorer").setAttribute("aria-hidden", "true");
}
function renderAssets() {
  const task = activeTask(); if (!task) return;
  const labels = { memo: ["📝","memo"], link: ["🔗","link"], doc: ["📄","file"] };
  $("#assetList").innerHTML = task.items.map(i => `<button class="asset-item ${i.id === selectedAssetId ? "active" : ""}" data-asset="${i.id}"><i>${labels[i.type][0]}</i><span><b>${escapeHtml(i.title)}</b><small>${labels[i.type][1]}</small></span></button>`).join("");
  document.querySelectorAll("[data-asset]").forEach(b => b.onclick = () => { selectedAssetId = b.dataset.asset; renderAssets(); });
  renderEditor(task.items.find(i => i.id === selectedAssetId));
}
function renderEditor(item) {
  if (!item) { $("#assetEditor").innerHTML = `<div class="receipt-empty">左の一覧からアセットを選択してください。</div>`; return; }
  if (item.type === "memo") $("#assetEditor").innerHTML = `<p class="eyebrow">WORKING MEMO</p><label>タイトル</label><input class="editor-input editor-title" data-field="title" value="${escapeAttr(item.title)}"><label>本文</label><textarea class="editor-textarea" data-field="content">${escapeHtml(item.content || "")}</textarea>`;
  if (item.type === "link") $("#assetEditor").innerHTML = `<p class="eyebrow">REFERENCE LINK</p><label>タイトル</label><input class="editor-input editor-title" data-field="title" value="${escapeAttr(item.title)}"><label>URL</label><input class="editor-input" data-field="url" value="${escapeAttr(item.url || "")}"><a class="open-link" href="${escapeAttr(item.url || "#")}" target="_blank" rel="noreferrer">↗ 新しいタブで開く</a>`;
  if (item.type === "doc") $("#assetEditor").innerHTML = `<p class="eyebrow">DOCUMENT PREVIEW · ${escapeHtml(item.size || "")}</p><h3>${escapeHtml(item.title)}</h3><div class="doc-preview">${escapeHtml(item.content || "")}</div>`;
  document.querySelectorAll("[data-field]").forEach(el => el.addEventListener("input", () => {
    item[el.dataset.field] = el.value; save();
    if (el.dataset.field === "title") {
      $("#drawerTaskTitle").textContent = activeTask().title;
      document.querySelector(`[data-asset="${item.id}"] b`).textContent = el.value;
    }
  }));
}
function addAsset() {
  const task = activeTask(); if (!task) return;
  const item = { id: `i-${Date.now()}`, type: "memo", title: "新しい作業メモ", content: "" };
  task.items.push(item); selectedAssetId = item.id; save(); renderAssets(); toast("新しいメモを追加しました");
}

function normalizeImportedTask(raw, index) {
  if (!raw || typeof raw.title !== "string" || !raw.title.trim()) return null;
  const plate = Number(raw.plate);
  if (!PLATES[plate]) return null;
  const items = Array.isArray(raw.items) ? raw.items
    .filter(item => item && ["memo", "link", "doc"].includes(item.type))
    .map((item, itemIndex) => ({
      id: `import-${Date.now()}-${index}-${itemIndex}`,
      type: item.type,
      title: String(item.title || "名称未設定"),
      ...(item.type === "link" ? { url: String(item.url || "") } : {}),
      ...(item.type !== "link" ? { content: String(item.content || "") } : {}),
      ...(item.type === "doc" ? { size: String(item.size || "") } : {})
    })) : [];
  return {
    id: Date.now() + index,
    title: raw.title.trim(),
    plate,
    items: items.length ? items : [{
      id: `import-${Date.now()}-${index}-memo`,
      type: "memo",
      title: "作業メモ",
      content: ""
    }]
  };
}

function renderAll() { renderAction(); renderTasks(); renderResult(); }
function escapeHtml(v="") { return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c])); }
function escapeAttr(v="") { return escapeHtml(v); }

document.querySelectorAll(".tab").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => switchTab(b.dataset.go));
$("#beginAction").onclick = () => switchTab("action");
$("#backToPrep").onclick = () => switchTab("prep");
$("#startTimer").onclick = toggleTimer;
$("#completeTask").onclick = completeTask;
$("#openExplorer").onclick = openExplorer;
$("#assetSummary").onclick = openExplorer;
$("#closeExplorer").onclick = closeExplorer;
$("#drawerBackdrop").onclick = closeExplorer;
$("#addAsset").onclick = addAsset;
document.addEventListener("keydown", e => { if (e.key === "Escape") closeExplorer(); });
$("#taskForm").onsubmit = e => {
  e.preventDefault();
  const title = $("#taskTitle").value.trim();
  const plate = Number(new FormData(e.currentTarget).get("plate"));
  if (!title) return;
  const hadActiveTask = !!activeTask();
  const task = { id: Date.now(), title, plate, items: [{ id: `i-${Date.now()}`, type: "memo", title: "初期作業メモ", content: "ここに作業の段取りを書きましょう。" }] };
  state.tasks.push(task); state.activeId ||= task.id; save();
  e.currentTarget.reset(); e.currentTarget.querySelector('[value="2"]').checked = true;
  if (!hadActiveTask) resetTimer();
  renderAll(); toast("新しいお皿をレーンに流しました");
};
$("#importTasks").onclick = () => {
  $("#importFile").value = "";
  $("#importFile").click();
};
$("#importFile").onchange = async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const source = Array.isArray(payload) ? payload : payload.tasks;
    if (!Array.isArray(source)) throw new Error("tasks配列がありません");
    const imported = source.map(normalizeImportedTask).filter(Boolean);
    if (!imported.length) throw new Error("有効なタスクがありません");
    const hadActiveTask = !!activeTask();
    state.tasks.push(...imported);
    state.activeId ||= imported[0].id;
    save();
    if (!hadActiveTask) resetTimer();
    renderAll();
    toast(`${imported.length}件の実データを取り込みました`);
  } catch (error) {
    toast(`取込できませんでした：${error.message}`);
  }
};
$("#previousMonth").onclick = () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderJournal();
};
$("#nextMonth").onclick = () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderJournal();
};

const today = new Intl.DateTimeFormat("ja-JP", { year:"numeric", month:"long", day:"numeric", weekday:"short" }).format(new Date());
$("#dateStamp").textContent = today;
$("#receiptDate").textContent = today;
resetTimer();
renderAll();
switchTab(state.phase);
