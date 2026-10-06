"use strict";
// ================= утилиты =================
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const COLOR = { red: "🔴 красная", blue: "🔵 синяя" };

let S = { me: null, tab: "today", week: 0, day: null, group: null, groups: [] };

function toast(t, err) {
  const el = $("#toast"); el.textContent = t; el.className = "show" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => el.className = "", 2600);
}
function apiBase() { return (LS.get("api") || window.DEFAULT_API || "").replace(/\/+$/, ""); }
async function api(path, method = "GET", body) {
  const h = { "Content-Type": "application/json" };
  const t = LS.get("token"); if (t) h.Authorization = "Bearer " + t;
  let r;
  try { r = await fetch(apiBase() + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { throw new Error("Нет связи с сервером. Проверь интернет и адрес сервера."); }
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 401) { LS.del("token"); S.me = null; render(); throw new Error("Сессия истекла, войдите заново"); }
  if (!r.ok) throw new Error((j && (typeof j.detail === "string" ? j.detail : "Ошибка запроса")) || "Ошибка " + r.status);
  return j;
}
async function act(fn, ok) { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message, true); return null; } }

function modal(html, onMount) {
  const m = $("#modal"); m.hidden = false;
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.onclick = e => { if (e.target === m) closeModal(); };
  onMount && onMount(m);
}
function closeModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }
function ask(title, fields, submit) {
  modal(`<h2 style="margin-top:0">${esc(title)}</h2>` + fields.map(f => `
    <label class="l">${esc(f.label)}</label>
    ${f.type === "area" ? `<textarea id="f_${f.id}" placeholder="${esc(f.ph || "")}">${esc(f.value || "")}</textarea>`
      : f.type === "select" ? `<select id="f_${f.id}">${f.options.map(o => `<option value="${esc(o[0])}" ${o[0] == f.value ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`
      : `<input id="f_${f.id}" value="${esc(f.value || "")}" placeholder="${esc(f.ph || "")}">`}`).join("") +
    `<div class="row" style="margin-top:14px"><button class="btn sec sp" id="m_no">Отмена</button><button class="btn sp" id="m_ok">Сохранить</button></div>`,
    m => {
      $("#m_no").onclick = closeModal;
      $("#m_ok").onclick = async () => {
        const v = {}; fields.forEach(f => v[f.id] = $("#f_" + f.id).value);
        const b = $("#m_ok"); b.disabled = true;
        const r = await submit(v); b.disabled = false;
        if (r !== false) closeModal();
      };
    });
}
function confirmBox(text, yes) {
  modal(`<p>${esc(text)}</p><div class="row"><button class="btn sec sp" id="m_no">Нет</button><button class="btn red sp" id="m_ok">Да</button></div>`,
    () => { $("#m_no").onclick = closeModal; $("#m_ok").onclick = async () => { closeModal(); await yes(); }; });
}

// ================= вход =================
function loginView() {
  const step = S.loginStep || 1;
  $("#app").innerHTML = `<div class="center">
    <div class="logo">🎓</div><h1 style="text-align:center;margin:0">ТГТУ Расписание</h1>
    <div class="mut" style="text-align:center">То же, что и в Telegram-боте</div>
    ${step === 1 ? `
      <label class="l">Твой Telegram ID</label>
      <input id="tg" inputmode="numeric" placeholder="например 123456789" value="${esc(S.tgId || LS.get("tgid") || "")}">
      <div class="mut">Свой ID можно узнать у бота @userinfobot. Перед входом нажми /start у нашего бота — иначе код не придёт.</div>
      <button class="btn full" id="go">Получить код в Telegram</button>`
    : `
      <div class="mut">Код отправлен в Telegram. Введи его:</div>
      <input id="code" inputmode="numeric" maxlength="6" placeholder="••••••" style="font-size:28px;letter-spacing:8px;text-align:center" autofocus>
      <button class="btn full" id="go">Войти</button>
      <button class="btn sec full" id="back">Назад</button>`}
    <button class="btn sec sm" id="srv" style="align-self:center;margin-top:14px">⚙ Адрес сервера</button>
  </div>`;
  $("#srv").onclick = () => ask("Адрес сервера", [{ id: "u", label: "URL API", value: apiBase(), ph: "https://example.com" }], v => { LS.set("api", v.u.trim()); toast("Сохранено"); });
  if (step === 1) {
    $("#go").onclick = async () => {
      const id = parseInt($("#tg").value.trim(), 10);
      if (!id) return toast("Введи числовой ID", true);
      $("#go").disabled = true;
      const r = await act(() => api("/api/auth/request", "POST", { telegram_id: id }), "Код отправлен");
      $("#go").disabled = false;
      if (r) { S.tgId = id; LS.set("tgid", id); S.loginStep = 2; loginView(); }
    };
  } else {
    $("#back").onclick = () => { S.loginStep = 1; loginView(); };
    $("#go").onclick = async () => {
      const r = await act(() => api("/api/auth/verify", "POST", { telegram_id: S.tgId, code: $("#code").value }));
      if (r) { LS.set("token", r.token); S.loginStep = 1; boot(); }
    };
  }
}

// ================= регистрация =================
async function registerView() {
  $("#app").innerHTML = `<div class="center"><div class="logo">👋</div><h1 style="text-align:center;margin:0">Кто ты?</h1><div id="reg" class="mut" style="text-align:center">Загрузка…</div></div>`;
  const gs = await act(() => api("/api/groups")); if (!gs) return;
  $("#reg").outerHTML = `<div id="reg">
    <label class="l">Группа</label><select id="g">${gs.map(g => `<option>${esc(g)}</option>`).join("")}</select>
    <div id="studs"></div>
    <button class="btn sec full" id="guest" style="margin-top:10px">Войти как гость</button>
    <button class="btn sec sm" id="out" style="margin-top:14px">Выйти</button></div>`;
  const load = async () => {
    const list = await act(() => api("/api/students?group=" + encodeURIComponent($("#g").value))); if (!list) return;
    $("#studs").innerHTML = `<label class="l">Выбери себя</label>` + list.map(s => `<button class="btn sec full" style="margin:4px 0;text-align:left;${s.taken ? "opacity:.4" : ""}" data-id="${s.id}" ${s.taken ? "disabled" : ""}>${esc(s.name)}${s.taken ? " (занято)" : ""}</button>`).join("");
    document.querySelectorAll("#studs button").forEach(b => b.onclick = async () => {
      if (await act(() => api("/api/register", "POST", { student_id: +b.dataset.id }), "Готово!")) boot();
    });
  };
  $("#g").onchange = load; load();
  $("#guest").onclick = async () => { if (await act(() => api("/api/guest?group=" + encodeURIComponent($("#g").value), "POST"), "Добро пожаловать!")) boot(); };
  $("#out").onclick = logout;
}
function logout() { LS.del("token"); S.me = null; render(); }

// ================= каркас =================
function tabs() {
  const m = S.me, t = [["today", "📅", "Сегодня"], ["week", "🗓", "Неделя"], ["hw", "📚", "ДЗ"], ["more", "☰", "Ещё"]];
  if (m.is_headman || m.is_admin) t.splice(3, 0, ["manage", "🛠", "Староста"]);
  if (m.is_admin) t.splice(t.length - 1, 0, ["admin", "👑", "Админ"]);
  return t;
}
async function boot() {
  if (!LS.get("token")) { S.me = null; return loginView(); }
  const me = await act(() => api("/api/me")); if (!me) return;
  S.me = me; if (S.day === null) S.day = me.today_idx;
  if (!me.registered) return registerView();
  S.group = me.group;
  render();
}
function render() {
  if (!S.me) return loginView();
  const m = S.me;
  $("#app").innerHTML = `<header class="top"><div class="sp"><h1 id="ttl"></h1><div class="sub">${esc([m.group, m.is_admin && !m.name ? "админ" : m.name].filter(Boolean).join(" · "))} · неделя ${COLOR[m.week_color] || ""}</div></div></header>
  <main id="view"></main>
  <nav class="bar">${tabs().map(([k, i, l]) => `<button data-t="${k}" class="${S.tab === k ? "on" : ""}"><i>${i}</i>${l}</button>`).join("")}</nav>`;
  document.querySelectorAll("nav.bar button").forEach(b => b.onclick = () => { S.tab = b.dataset.t; render(); });
  if (!tabs().some(t => t[0] === S.tab)) S.tab = "today";
  const T = { today: viewToday, week: viewWeek, hw: viewHw, manage: viewManage, admin: viewAdmin, more: viewMore }[S.tab];
  $("#ttl").textContent = tabs().find(t => t[0] === S.tab)[2];
  T();
}
const view = () => $("#view");
const canEdit = () => S.me.is_headman || S.me.is_admin;
const gq = (sep = "?") => (S.me.is_admin && S.group ? `${sep}group=${encodeURIComponent(S.group)}` : "");

function groupPicker(then) {
  if (!S.me.is_admin) return "";
  return `<select id="gsel" style="margin:0 0 6px">${S.groups.map(g => `<option ${g === S.group ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>`;
}
async function ensureGroups() {
  if (S.me.is_admin && !S.groups.length) {
    S.groups = (await act(() => api("/api/groups"))) || [];
    if (!S.group && S.groups.length) S.group = S.groups[0];
  }
}
function bindGroupPicker() { const s = $("#gsel"); if (s) s.onchange = () => { S.group = s.value; render(); }; }

// ================= пары =================
function lessonCard(l, edit) {
  const typ = l.type === "red" ? "b-red" : l.type === "blue" ? "b-blue" : "b-white";
  const tname = l.type === "red" ? "красная" : l.type === "blue" ? "синяя" : "каждая";
  return `<div class="card lesson ${l.type} ${l.cancel ? "cancel" : ""}"><div class="row" style="align-items:flex-start">
    <div class="time">${esc(l.time)}</div>
    <div class="sp"><h3>${l.cancel ? "❌ " : ""}${esc(l.subject)}</h3>
      <div class="mut">${l.room ? "🚪 " + esc(l.room) : ""} ${l.teacher ? "· 👤 " + esc(l.teacher) : ""}</div>
      ${l.cancel ? `<div style="color:var(--red);margin-top:4px">Отменена: ${esc(l.cancel)}</div>` : ""}
      ${l.homework ? `<div style="margin-top:6px">📚 ${esc(l.homework)}</div>` : ""}
    </div><span class="badge ${typ}">${tname}</span></div>
    ${edit ? `<div class="tools" data-id="${l.id}">
      <button class="btn sm sec" data-a="edit">✏️ Изменить</button>
      <button class="btn sm sec" data-a="hw">📚 ДЗ</button>
      <button class="btn sm sec" data-a="cancel">${l.cancel ? "↩️ Вернуть" : "❌ Отменить"}</button>
      <button class="btn sm red" data-a="del">🗑</button></div>` : ""}
  </div>`;
}
function bindLessonTools(lessons, reload) {
  document.querySelectorAll(".tools[data-id]").forEach(el => {
    const id = +el.dataset.id, l = lessons.find(x => x.id === id);
    el.querySelectorAll("button").forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      if (a === "edit") lessonForm(l, reload);
      if (a === "hw") ask("Домашнее задание", [{ id: "t", label: "Текст (пусто — убрать)", type: "area", value: l.homework },
        { id: "n", label: "Уведомить группу?", type: "select", options: [["0", "Нет"], ["1", "Да, отправить в Telegram"]], value: "0" }],
        async v => { if (await act(() => api(`/api/lessons/${id}/homework`, "POST", { text: v.t, notify: v.n === "1" }), "ДЗ сохранено")) reload(); else return false; });
      if (a === "cancel") {
        if (l.cancel) { act(() => api(`/api/lessons/${id}/cancel`, "POST", { reason: "" }), "Пара возвращена").then(reload); return; }
        ask("Отмена пары", [{ id: "r", label: "Причина", ph: "или выбери шаблон ниже" },
          { id: "tpl", label: "Шаблон", type: "select", options: [["", "— свой текст —"], ...S.me.cancel_templates.map(t => [t, t])], value: "" }],
          async v => { const reason = (v.tpl || v.r).trim(); if (!reason) { toast("Укажи причину", true); return false; }
            if (await act(() => api(`/api/lessons/${id}/cancel`, "POST", { reason, notify: true }), "Пара отменена, группа уведомлена")) reload(); else return false; });
      }
      if (a === "del") confirmBox("Удалить пару «" + l.subject + "»?", async () => { if (await act(() => api("/api/lessons/" + id, "DELETE"), "Удалено")) reload(); });
    });
  });
}
function lessonForm(l, reload, day) {
  const isNew = !l; l = l || { day: day || DAYS[S.day], time: "08:30", subject: "", type: "white", room: "", teacher: "", homework: "" };
  ask(isNew ? "Новая пара" : "Изменить пару", [
    { id: "day", label: "День", type: "select", options: DAYS.map(d => [d, d]), value: l.day },
    { id: "time", label: "Время (08:30 или 08:30-10:05)", value: l.time },
    { id: "subject", label: "Предмет", value: l.subject },
    { id: "type", label: "Неделя", type: "select", options: [["white", "Каждая неделя"], ["red", "Только красная"], ["blue", "Только синяя"]], value: l.type },
    { id: "room", label: "Аудитория", value: l.room },
    { id: "teacher", label: "Преподаватель", value: l.teacher },
  ], async v => {
    const body = { day: v.day, time: v.time, subject: v.subject, type: v.type, room: v.room, teacher: v.teacher };
    const r = await act(() => isNew ? api("/api/lessons" + gq(), "POST", body) : api("/api/lessons/" + l.id, "PATCH", body), "Сохранено");
    if (r) reload(); else return false;
  });
}

async function viewToday() {
  await ensureGroups();
  view().innerHTML = groupPicker() + `<div class="empty">Загрузка…</div>`; bindGroupPicker();
  const d = await act(() => api("/api/today" + gq())); if (!d) return;
  const btns = await act(() => api("/api/buttons")) || [];
  const act_ = d.lessons.filter(l => l.type === "white" || l.type === d.color);
  view().innerHTML = groupPicker() + `<div class="status">${esc(d.status_text)}</div>
    <div class="mut" style="margin:0 4px">${esc(d.day)} · неделя ${COLOR[d.color]}</div>
    ${act_.length ? act_.map(l => lessonCard(l, canEdit())).join("") : `<div class="empty">🎉 Сегодня пар нет</div>`}
    ${canEdit() ? `<button class="btn sec full" id="addl">➕ Добавить пару</button>` : ""}
    ${btns.length ? `<h2>Ссылки</h2><div>${btns.map(b => `<a class="chip link" href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.label)}</a>`).join("")}</div>` : ""}`;
  bindGroupPicker(); bindLessonTools(act_, viewToday);
  const a = $("#addl"); if (a) a.onclick = () => lessonForm(null, viewToday, d.day);
}

async function viewWeek() {
  await ensureGroups();
  const load = async () => {
    const d = await act(() => api(`/api/schedule?day=${S.day}&week=${S.week}${gq("&")}`)); if (!d) return;
    const ls = d.lessons.filter(l => l.type === "white" || l.type === d.color);
    const hidden = d.lessons.length - ls.length;
    view().innerHTML = groupPicker() + `<div class="seg"><button data-w="0" class="${S.week === 0 ? "on" : ""}">Текущая</button><button data-w="1" class="${S.week === 1 ? "on" : ""}">Следующая</button></div>
      <div class="mut" style="margin:0 4px">неделя ${COLOR[d.color]}</div>
      <div class="pills">${SHORT.map((s, i) => `<button class="pill ${i === S.day ? "on" : ""} ${i === S.me.today_idx && S.week === 0 ? "today" : ""}" data-d="${i}">${s}</button>`).join("")}</div>
      ${ls.length ? ls.map(l => lessonCard(l, canEdit())).join("") : `<div class="empty">В этот день пар нет</div>`}
      ${hidden && canEdit() ? `<div class="mut" style="margin:6px 4px">Скрыто пар другой недели: ${hidden}</div>` : ""}
      ${canEdit() ? `<div class="row" style="margin-top:8px"><button class="btn sec sp" id="addl">➕ Добавить пару</button><button class="btn red sm" id="clr">Очистить день</button></div>` : ""}`;
    bindGroupPicker();
    document.querySelectorAll("[data-w]").forEach(b => b.onclick = () => { S.week = +b.dataset.w; load(); });
    document.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { S.day = +b.dataset.d; load(); });
    bindLessonTools(d.lessons, load);
    const a = $("#addl"); if (a) a.onclick = () => lessonForm(null, load, DAYS[S.day]);
    const c = $("#clr"); if (c) c.onclick = () => confirmBox(`Удалить ВСЕ пары: ${DAYS[S.day]}?`, async () => { if (await act(() => api(`/api/schedule/day?day=${encodeURIComponent(DAYS[S.day])}${gq("&")}`, "DELETE"), "День очищен")) load(); });
  };
  load();
}

async function viewHw() {
  await ensureGroups();
  const d = await act(() => api("/api/homework" + gq())); if (!d) return;
  view().innerHTML = groupPicker() + (d.length ? d.map(l => `<div class="card"><b>${esc(l.subject)}</b> <span class="mut">${esc(l.day)}, ${esc(l.time)}</span><div style="margin-top:6px">📚 ${esc(l.homework)}</div></div>`).join("") : `<div class="empty">Домашки нет 🎉</div>`);
  bindGroupPicker();
}

// ================= ещё =================
async function viewMore() {
  const m = S.me; await ensureGroups();
  const [news, abs] = await Promise.all([act(() => api("/api/news" + gq())), act(() => api("/api/absences"))]);
  view().innerHTML = `
    <div class="card"><b>${esc(m.name || "")}</b><div class="mut">${esc(m.group || "")} · ${m.is_admin ? "админ" : m.is_headman ? "староста" : m.guest ? "гость" : "студент"}</div></div>
    ${!m.guest ? `<h2>Пропуски</h2><div class="grid"><div class="stat"><b>${abs ? abs.unexcused : 0}</b><span class="mut">без уважительной</span></div><div class="stat"><b>${abs ? abs.excused : 0}</b><span class="mut">по уважительной</span></div></div>` : ""}
    <h2>Объявления</h2>${news && news.length ? news.map(n => `<div class="card">${n.global ? "📣 " : "📢 "}${esc(n.message)}<div class="mut" style="margin-top:4px">${esc(n.created_at)}</div></div>`).join("") : `<div class="empty">Пока ничего</div>`}
    <h2>Настройки</h2>
    <div class="card row"><div class="sp">🔔 Уведомления в Telegram<div class="mut">утро, перед парой, отмены, ДЗ</div></div><button class="btn sm ${m.notifications ? "ok" : "sec"}" id="nt">${m.notifications ? "Вкл" : "Выкл"}</button></div>
    ${m.registered && !m.is_admin ? `<button class="btn sec full" id="unlink" style="margin-bottom:8px">Сменить аккаунт / группу</button>` : ""}
    <button class="btn red full" id="out">Выйти из приложения</button>
    <p class="mut" style="text-align:center">Сервер: ${esc(apiBase())}</p>`;
  $("#nt").onclick = async () => { if (await act(() => api("/api/notifications", "POST", { enabled: !m.notifications }))) { S.me.notifications = !m.notifications; viewMore(); } };
  const u = $("#unlink"); if (u) u.onclick = () => confirmBox("Отвязать этот аккаунт от студента?", async () => { if (await act(() => api("/api/logout-account", "POST"))) boot(); });
  $("#out").onclick = logout;
}

// ================= староста =================
async function viewManage() {
  await ensureGroups();
  const sub = S.sub || "students";
  const shell = body => {
    view().innerHTML = groupPicker() + `<div class="seg">${[["students", "Студенты"], ["att", "Пропуски"], ["news", "Объявления"]].map(([k, l]) => `<button data-s="${k}" class="${sub === k ? "on" : ""}">${l}</button>`).join("")}</div>` + body;
    bindGroupPicker(); document.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { S.sub = b.dataset.s; viewManage(); });
  };
  if (sub === "students") {
    const d = await act(() => api("/api/manage/students" + gq())); if (!d) return;
    shell(`<button class="btn full" id="bulk">➕ Добавить списком</button>` + d.map(s => `<div class="card row" data-id="${s.id}"><div class="sp">${esc(s.name)}<div class="mut">${s.telegram_id ? "в боте" : "не привязан"}${s.is_headman ? " · староста" : ""}${s.is_banned ? " · бан" : ""}</div></div><button class="btn sm sec" data-a="r">✏️</button><button class="btn sm red" data-a="d">🗑</button></div>`).join(""));
    $("#bulk").onclick = () => ask("Список студентов", [{ id: "n", label: "ФИО — по одному в строке (нумерацию можно оставить)", type: "area", ph: "Иванов Иван Иванович\nПетров Пётр" }], async v => {
      const r = await act(() => api("/api/manage/students" + gq(), "POST", { names: v.n })); if (!r) return false;
      toast(`Добавлено: ${r.added}${r.skipped.length ? ", пропущено дублей: " + r.skipped.length : ""}`); viewManage();
    });
    document.querySelectorAll("[data-id]").forEach(c => { const id = +c.dataset.id, s = d.find(x => x.id === id);
      c.querySelector('[data-a="r"]').onclick = () => ask("Переименовать", [{ id: "n", label: "ФИО", value: s.name }], async v => { if (await act(() => api("/api/manage/students/" + id, "PATCH", { name: v.n }), "Готово")) viewManage(); else return false; });
      c.querySelector('[data-a="d"]').onclick = () => confirmBox("Удалить «" + s.name + "»?", async () => { if (await act(() => api("/api/manage/students/" + id, "DELETE"), "Удалено")) viewManage(); }); });
  } else if (sub === "att") {
    const d = await act(() => api("/api/manage/attendance" + gq())); if (!d) return;
    shell(d.map(s => `<div class="card" data-id="${s.id}"><div class="row"><div class="sp">${esc(s.name)}<div class="mut">Н: ${s.unexcused || 0} · Б/У: ${s.excused || 0}</div></div></div>
      <div class="tools"><button class="btn sm red" data-st="Н">Н</button><button class="btn sm sec" data-st="Б">Б</button><button class="btn sm sec" data-st="У">У</button><button class="btn sm sec" data-st="0">Сброс</button></div></div>`).join("") || `<div class="empty">Нет студентов</div>`);
    document.querySelectorAll("[data-id]").forEach(c => { const id = +c.dataset.id;
      c.querySelectorAll("[data-st]").forEach(b => b.onclick = async () => {
        const st = b.dataset.st;
        const r = st === "0" ? await act(() => api("/api/manage/attendance/" + id, "DELETE"), "Сброшено") : await act(() => api("/api/manage/attendance", "POST", { student_id: id, status: st }), "Отмечено");
        if (r) viewManage(); }); });
  } else {
    const d = await act(() => api("/api/news" + gq())); if (!d) return;
    shell(`<button class="btn full" id="nn">📢 Новое объявление группе</button>` + d.map(n => `<div class="card row"><div class="sp">${n.global ? "📣 " : ""}${esc(n.message)}<div class="mut">${esc(n.created_at)}</div></div><button class="btn sm red" data-n="${n.id}">🗑</button></div>`).join(""));
    $("#nn").onclick = () => ask("Объявление (уйдёт в Telegram всей группе)", [{ id: "m", label: "Текст", type: "area" }], async v => { if (await act(() => api("/api/manage/news" + gq(), "POST", { message: v.m }), "Отправлено")) viewManage(); else return false; });
    document.querySelectorAll("[data-n]").forEach(b => b.onclick = async () => { if (await act(() => api("/api/manage/news/" + b.dataset.n, "DELETE"), "Удалено")) viewManage(); });
  }
}

// ================= админ =================
async function viewAdmin() {
  const sub = S.asub || "stats";
  const shell = body => {
    view().innerHTML = `<div class="pills">${[["stats", "📊 Статистика"], ["users", "👥 Люди"], ["bc", "📣 Рассылка"], ["groups", "🏫 Группы"], ["btns", "🔗 Кнопки"]].map(([k, l]) => `<button class="pill ${sub === k ? "on" : ""}" data-s="${k}">${l}</button>`).join("")}</div>` + body;
    document.querySelectorAll("[data-s]").forEach(b => b.onclick = () => { S.asub = b.dataset.s; viewAdmin(); });
  };
  if (sub === "stats") {
    const s = await act(() => api("/api/admin/stats")); if (!s) return;
    const bar = (n, v) => v == null ? "" : `<div class="card"><div class="row"><span class="sp">${n}</span><b>${v}%</b></div><div class="bar-p"><i style="width:${v}%"></i></div></div>`;
    shell(`<div class="grid">${[["Пользователей", s.users], ["Студентов", s.students], ["Групп", s.groups], ["Пар", s.lessons], ["Старост", s.headmen], ["Забанено", s.banned]].map(([l, v]) => `<div class="stat"><b>${v}</b><span class="mut">${l}</span></div>`).join("")}</div>
      <h2>Сервер</h2>${bar("CPU", s.cpu)}${bar("RAM", s.ram)}${bar("Диск", s.disk)}<div class="mut">API работает: ${s.uptime_min} мин</div>`);
  } else if (sub === "users") {
    const draw = async q => {
      const d = await act(() => api("/api/admin/users?q=" + encodeURIComponent(q || ""))); if (!d) return;
      $("#ul").innerHTML = d.map(u => `<div class="card" data-id="${u.telegram_id}"><b>${esc(u.name)}</b> <span class="mut">${esc(u.group)}</span><div class="mut">ID ${u.telegram_id}${u.headman ? " · староста" : ""}${u.banned ? " · 🚫 бан" : ""}</div>
        <div class="tools"><button class="btn sm sec" data-a="h">${u.headman ? "Снять старосту" : "⭐ Староста"}</button><button class="btn sm ${u.banned ? "ok" : "red"}" data-a="b">${u.banned ? "Разбанить" : "Бан"}</button><button class="btn sm sec" data-a="d">Отвязать</button></div></div>`).join("") || `<div class="empty">Никого</div>`;
      document.querySelectorAll("#ul [data-id]").forEach(c => { const id = c.dataset.id, u = d.find(x => x.telegram_id == id);
        c.querySelector('[data-a="h"]').onclick = async () => { if (await act(() => api(`/api/admin/users/${id}/headman`, "POST", { value: !u.headman }), "Готово")) draw(q); };
        c.querySelector('[data-a="b"]').onclick = async () => { if (await act(() => api(`/api/admin/users/${id}/ban`, "POST", { value: !u.banned }), "Готово")) draw(q); };
        c.querySelector('[data-a="d"]').onclick = () => confirmBox("Отвязать пользователя?", async () => { if (await act(() => api("/api/admin/users/" + id, "DELETE"), "Отвязан")) draw(q); }); });
    };
    shell(`<input id="q" placeholder="Поиск: имя, ID, группа"><div id="ul"></div>`);
    let t; $("#q").oninput = e => { clearTimeout(t); t = setTimeout(() => draw(e.target.value), 300); }; draw("");
  } else if (sub === "bc") {
    await ensureGroups();
    shell(`<label class="l">Кому</label><select id="bg"><option value="">Всем</option>${S.groups.map(g => `<option>${esc(g)}</option>`).join("")}</select>
      <label class="l">Сообщение</label><textarea id="bm"></textarea><button class="btn full" id="bs">📣 Отправить</button>`);
    $("#bs").onclick = () => confirmBox("Отправить рассылку?", async () => { const r = await act(() => api("/api/admin/broadcast", "POST", { message: $("#bm").value, group: $("#bg").value || null })); if (r) { toast("Отправляется: " + r.recipients + " получ."); $("#bm").value = ""; } });
  } else if (sub === "groups") {
    const d = await act(() => api("/api/admin/groups")); if (!d) return;
    shell(`<div class="mut" style="margin:0 4px 6px">Новая группа появится, когда добавишь в неё студентов (вкладка «Староста» → выбери группу).</div>` + d.map(g => `<div class="card" data-g="${esc(g.name)}"><b>${esc(g.name)}</b><div class="mut">студентов ${g.students} · пар ${g.lessons}</div><div class="tools"><button class="btn sm sec" data-a="r">✏️ Переименовать</button><button class="btn sm red" data-a="d">🗑 Удалить</button></div></div>`).join("") +
      `<button class="btn full" id="ng">➕ Новая группа</button>`);
    $("#ng").onclick = () => ask("Новая группа", [{ id: "n", label: "Название" }, { id: "s", label: "Студенты (по одному в строке)", type: "area" }], async v => {
      if (!v.n.trim() || !v.s.trim()) { toast("Нужны название и хотя бы один студент", true); return false; }
      if (await act(() => api("/api/manage/students?group=" + encodeURIComponent(v.n.trim()), "POST", { names: v.s }), "Группа создана")) { S.groups = []; viewAdmin(); } else return false; });
    document.querySelectorAll("[data-g]").forEach(c => { const g = c.dataset.g;
      c.querySelector('[data-a="r"]').onclick = () => ask("Переименовать группу", [{ id: "n", label: "Новое название", value: g }], async v => { if (await act(() => api(`/api/admin/groups/${encodeURIComponent(g)}/rename`, "POST", { name: v.n }), "Переименовано")) { S.groups = []; S.group = null; viewAdmin(); } else return false; });
      c.querySelector('[data-a="d"]').onclick = () => confirmBox(`Удалить группу ${g} со всеми студентами, парами и привязками?`, async () => { if (await act(() => api("/api/admin/groups/" + encodeURIComponent(g), "DELETE"), "Удалено")) { S.groups = []; S.group = null; viewAdmin(); } }); });
  } else {
    const d = await act(() => api("/api/buttons")); if (!d) return;
    shell(d.map(b => `<div class="card row"><div class="sp"><b>${esc(b.label)}</b><div class="mut" style="word-break:break-all">${esc(b.url)}</div></div><button class="btn sm red" data-b="${b.id}">🗑</button></div>`).join("") + `<button class="btn full" id="nb">➕ Добавить кнопку</button>`);
    $("#nb").onclick = () => ask("Кнопка-ссылка", [{ id: "l", label: "Текст" }, { id: "u", label: "Ссылка (https://…)" }], async v => { if (await act(() => api("/api/admin/buttons", "POST", { label: v.l, url: v.u }), "Добавлено")) viewAdmin(); else return false; });
    document.querySelectorAll("[data-b]").forEach(b => b.onclick = async () => { if (await act(() => api("/api/admin/buttons/" + b.dataset.b, "DELETE"), "Удалено")) viewAdmin(); });
  }
}

boot();
