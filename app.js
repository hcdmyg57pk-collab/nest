'use strict';
const KEY = 'nest.v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const defaults = () => ({
  items: [
    { id: uid(), time: '08:00', emoji: '☕️', title: 'Aufstehen & Frühstück', steps: ['Etwas trinken', 'Frühstücken', 'Medikamente, falls nötig'] },
    { id: uid(), time: '09:00', emoji: '🧺', title: 'Fertig machen', steps: ['Zähne putzen', 'Anziehen', 'Tasche packen'] },
    { id: uid(), time: '13:00', emoji: '🍲', title: 'Mittagessen', steps: [] },
    { id: uid(), time: '15:00', emoji: '🛋️', title: 'Pause ohne Reize', steps: ['Handy leise stellen', '20 Minuten ausruhen'] },
    { id: uid(), time: '21:30', emoji: '🌙', title: 'Abendroutine', steps: ['Zähne putzen', 'Morgen kurz anschauen', 'Licht dimmen'] },
  ],
  care: ['Gegessen', 'Getrunken', 'Pause gemacht', 'Draußen gewesen', 'Etwas Schönes'],
  helps: ['Kopfhörer aufsetzen', 'Licht ausmachen', 'Schwere Decke', 'Raum verlassen'],
  cards: [
    { id: uid(), text: 'Ich kann gerade nicht sprechen.' },
    { id: uid(), text: 'Ich brauche eine Pause.' },
    { id: uid(), text: 'Bitte gib mir einen Moment.' },
    { id: uid(), text: 'Es ist mir gerade zu viel.' },
    { id: uid(), text: 'Bitte schreib mir, statt anzurufen.' },
    { id: uid(), text: 'Bitte sprich ruhig und in klaren Sätzen.' },
    { id: uid(), text: 'Telefon: Termin\n\nGuten Tag, mein Name ist …\nIch möchte gern einen Termin vereinbaren.\nGrund: …\nAm besten passt mir …\nKönnen Sie mir den Termin bitte noch einmal nennen?\nVielen Dank, auf Wiederhören.' },
  ],
  days: {},
  prefs: { theme: 'warm', size: 100, motion: 'on' },
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.items) return { ...defaults(), ...raw, prefs: { ...defaults().prefs, ...raw.prefs } };
  } catch (e) { /* Start mit Beispieldaten */ }
  return defaults();
}
let S = load();
let tab = 'heute';
let breathTimer = null;
let audio = null;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* Speicher nicht verfügbar */ }
}
function day(k = dateKey()) {
  S.days[k] ||= { done: {}, skip: {}, steps: {}, care: {}, energy: null, reize: null };
  return S.days[k];
}
function applyPrefs() {
  const r = document.documentElement;
  r.dataset.theme = S.prefs.theme;
  r.dataset.motion = S.prefs.motion;
  r.style.fontSize = S.prefs.size + '%';
  const color = { warm: '#FFF6EA', ruhig: '#F1F3EC', nacht: '#1F1A17' }[S.prefs.theme];
  document.querySelector('meta[name=theme-color]').content = color;
}

const main = document.getElementById('main');
const sheet = document.getElementById('sheet');
function openSheet(html, full = false) {
  sheet.className = full ? 'full' : '';
  sheet.innerHTML = html;
  if (!sheet.open) sheet.showModal();
}
function closeSheet() { if (sheet.open) sheet.close(); }

/* ---------- Ansichten ---------- */
const views = {
  heute() {
    const d = day();
    const items = [...S.items].sort((a, b) => a.time.localeCompare(b.time));
    const open = items.filter((i) => !d.done[i.id] && !d.skip[i.id]);
    const [now, next] = open;
    const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const hero = now
      ? `<button class="card hero" style="width:100%;text-align:left" data-act="item" data-id="${now.id}">
           <div class="label">Jetzt</div><div class="big">${h(now.emoji)} ${h(now.title)}</div>
           ${next ? `<div class="muted">Danach: ${h(next.emoji)} ${h(next.title)}</div>` : '<div class="muted">Danach ist nichts mehr geplant.</div>'}
         </button>`
      : `<div class="card hero"><div class="big">Fertig für heute 🌿</div><p>Mehr muss heute nicht passieren.</p></div>`;
    const rows = items.map((i) => {
      const cls = d.done[i.id] ? 'done' : d.skip[i.id] ? 'skip' : '';
      const mark = d.done[i.id] ? '✓' : d.skip[i.id] ? 'heute nicht' : '';
      return `<button class="row ${cls}" data-act="item" data-id="${i.id}">
        <span class="emoji">${h(i.emoji)}</span>
        <span class="grow"><b>${h(i.title)}</b><br><span class="muted">${h(i.time)}</span></span>
        <span class="muted">${mark}</span></button>`;
    }).join('');
    return `<p class="muted">${h(date)}</p>${hero}<h2>Mein Tag</h2>${rows}
      <button class="btn alt" data-act="itemForm">+ Eintrag hinzufügen</button>`;
  },
  energie() {
    const d = day();
    const scale = (field, val) => `<div class="scale">${[1, 2, 3, 4, 5].map((n) =>
      `<button data-act="rate" data-field="${field}" data-n="${n}" aria-pressed="${val === n}">${n}</button>`).join('')}</div>`;
    const bars = [...Array(7)].map((_, i) => {
      const x = new Date(); x.setDate(x.getDate() - (6 - i));
      const e = S.days[dateKey(x)]?.energy;
      return `<div class="day"><div class="bar ${e ? '' : 'none'}" style="height:${e ? e * 15 : 4}px"></div>${x.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2)}</div>`;
    }).join('');
    const chips = S.care.map((c, i) => `<button class="chip" data-act="care" data-c="${h(c)}" aria-pressed="${!!d.care[c]}">${h(c)}</button>`).join('');
    return `<div class="card"><h2 style="margin-top:0">Wie viel Energie ist da?</h2>${scale('energy', d.energy)}
        <div class="ends"><span>kaum</span><span>viel</span></div></div>
      <div class="card"><h2 style="margin-top:0">Wie voll ist der Kopf von Reizen?</h2>${scale('reize', d.reize)}
        <div class="ends"><span>ruhig</span><span>zu viel</span></div></div>
      ${tip(d)}
      <h2>Heute schon</h2><div class="chips">${chips}</div>
      <h2>Energie der letzten 7 Tage</h2><div class="card"><div class="week">${bars}</div></div>`;
  },
  ruhe() {
    const on = !!audio;
    const helps = S.helps.map((x) => `<div class="row" style="min-height:48px">${h(x)}</div>`).join('');
    return `<div class="grid">
        <button class="tile" data-act="breathe"><span>🌬️</span>Atmen</button>
        <button class="tile ${on ? 'on' : ''}" data-act="noise"><span>🌊</span>${on ? 'Rauschen aus' : 'Rauschen an'}</button>
        <button class="tile" data-act="ground" data-i="0"><span>🌱</span>5-4-3-2-1</button>
        <button class="tile" data-act="dark"><span>🌑</span>Dunkler Bildschirm</button>
      </div>
      ${on ? `<label for="vol">Lautstärke</label><input id="vol" type="range" min="0" max="100" value="${Math.round(audio.gain.gain.value * 100)}">` : ''}
      <p class="muted" style="margin-top:10px">Rauschen braucht ein iPhone, das nicht auf lautlos steht.</p>
      <h2>Was mir hilft</h2>${helps}
      <button class="btn alt" data-act="helpsForm">Liste ändern</button>`;
  },
  sagen() {
    const cards = S.cards.map((c) => `<button class="row" data-act="card" data-id="${c.id}"><span class="grow">${h(c.text.split('\n')[0])}</span></button>`).join('');
    return `<p class="muted">Antippen, dann wird der Text groß angezeigt.</p>${cards}
      <button class="btn alt" data-act="cardForm">+ Neue Karte</button>`;
  },
};

function tip(d) {
  if (d.reize >= 4) return `<div class="card hero"><b>Viele Reize heute.</b><p>Was kannst du gerade weglassen?</p><button class="btn" data-act="tab" data-tab="ruhe">Zu Ruhe</button></div>`;
  if (d.energy && d.energy <= 2) return `<div class="card hero"><b>Wenig Energie heute.</b><p>Du kannst Einträge bei „Heute“ für heute auslassen.</p></div>`;
  return '';
}

const titles = { heute: 'Heute', energie: 'Energie', ruhe: 'Ruhe', sagen: 'Sagen' };
function render() {
  document.getElementById('title').textContent = titles[tab];
  main.innerHTML = views[tab]();
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

/* ---------- Dialoge ---------- */
function itemSheet(id) {
  const i = S.items.find((x) => x.id === id);
  if (!i) return closeSheet();
  const d = day();
  const done = d.steps[id] || {};
  const steps = i.steps.map((s, n) => `<button class="step" data-act="step" data-id="${id}" data-n="${n}" aria-pressed="${!!done[n]}"><span class="box">${done[n] ? '✓' : ''}</span>${h(s)}</button>`).join('');
  openSheet(`<h2>${h(i.emoji)} ${h(i.title)}</h2><p class="muted">${h(i.time)} Uhr</p>${steps}
    <button class="btn" data-act="mark" data-kind="done" data-id="${id}">${d.done[id] ? 'Doch nicht erledigt' : 'Erledigt'}</button>
    <button class="btn alt" data-act="mark" data-kind="skip" data-id="${id}">${d.skip[id] ? 'Heute doch machen' : 'Heute auslassen'}</button>
    <button class="btn quiet" data-act="itemForm" data-id="${id}">Ändern</button>
    <button class="btn quiet" data-act="close">Schließen</button>`);
}
function itemForm(id) {
  const i = S.items.find((x) => x.id === id) || { time: '12:00', emoji: '⭐️', title: '', steps: [] };
  openSheet(`<h2>${id ? 'Eintrag ändern' : 'Neuer Eintrag'}</h2>
    <label for="f-title">Name</label><input id="f-title" type="text" value="${h(i.title)}">
    <label for="f-time">Uhrzeit</label><input id="f-time" type="time" value="${h(i.time)}">
    <label for="f-emoji">Bild (Emoji)</label><input id="f-emoji" type="text" value="${h(i.emoji)}">
    <label for="f-steps">Schritte (einer pro Zeile)</label><textarea id="f-steps">${h(i.steps.join('\n'))}</textarea>
    <button class="btn" data-act="itemSave" data-id="${id || ''}">Speichern</button>
    ${id ? `<button class="btn quiet" data-act="itemDelete" data-id="${id}">Löschen</button>` : ''}
    <button class="btn quiet" data-act="close">Abbrechen</button>`);
}
const groundSteps = [
  ['5', 'Dinge, die du siehst'], ['4', 'Dinge, die du fühlst'], ['3', 'Dinge, die du hörst'],
  ['2', 'Dinge, die du riechst'], ['1', 'Sache, die du schmeckst'],
];
function stopBreath() { clearTimeout(breathTimer); breathTimer = null; }
function runBreath(inhale) {
  const orb = document.getElementById('orb');
  const text = document.getElementById('breathText');
  if (!orb || !sheet.open) return;
  orb.classList.toggle('grow', inhale);
  orb.style.transitionDuration = inhale ? '4s' : '6s';
  text.textContent = inhale ? 'Einatmen' : 'Ausatmen';
  breathTimer = setTimeout(() => runBreath(!inhale), inhale ? 4000 : 6000);
}
function toggleNoise() {
  if (audio) { audio.ctx.close(); audio = null; return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer; source.loop = true;
  const gain = ctx.createGain(); gain.gain.value = 0.4;
  source.connect(gain).connect(ctx.destination);
  source.start();
  audio = { ctx, gain };
}
function settings() {
  const p = S.prefs;
  const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
  openSheet(`<h2>Einstellungen</h2>
    <label for="p-theme">Farben</label><select id="p-theme" data-pref="theme">${opt('warm', 'Warm', p.theme)}${opt('ruhig', 'Ruhig (Salbei)', p.theme)}${opt('nacht', 'Nacht', p.theme)}</select>
    <label for="p-size">Textgröße</label><select id="p-size" data-pref="size">${opt(90, 'Klein', p.size)}${opt(100, 'Normal', p.size)}${opt(115, 'Groß', p.size)}${opt(130, 'Sehr groß', p.size)}</select>
    <label for="p-motion">Bewegung</label><select id="p-motion" data-pref="motion">${opt('on', 'An', p.motion)}${opt('off', 'Aus', p.motion)}</select>
    <label for="p-care">„Heute schon“-Liste (eins pro Zeile)</label><textarea id="p-care">${h(S.care.join('\n'))}</textarea>
    <button class="btn" data-act="careSave">Liste speichern</button>
    <h2 style="margin-top:24px">Sicherung</h2>
    <p class="muted">Alle Daten bleiben nur auf diesem iPhone. Eine Sicherung schützt sie, falls die App gelöscht wird.</p>
    <button class="btn alt" data-act="export">Sicherung erstellen</button>
    <button class="btn alt" data-act="import">Sicherung laden</button>
    <button class="btn quiet" data-act="close">Schließen</button>`);
}
async function exportData() {
  const name = `nest-sicherung-${dateKey()}.json`;
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); } catch (e) { /* abgebrochen */ }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Aktionen ---------- */
const val = (id) => document.getElementById(id).value;
const actions = {
  tab({ tab: t }) { tab = t; closeSheet(); render(); scrollTo(0, 0); },
  settings,
  close: closeSheet,
  item({ id }) { itemSheet(id); },
  itemForm({ id }) { itemForm(id); },
  itemSave({ id }) {
    const data = { title: val('f-title').trim(), time: val('f-time') || '12:00', emoji: val('f-emoji').trim() || '⭐️', steps: lines(val('f-steps')) };
    if (!data.title) return document.getElementById('f-title').focus();
    if (id) Object.assign(S.items.find((x) => x.id === id), data);
    else S.items.push({ id: uid(), ...data });
    save(); closeSheet(); render();
  },
  itemDelete({ id }) {
    if (!confirm('Diesen Eintrag löschen?')) return;
    S.items = S.items.filter((x) => x.id !== id);
    save(); closeSheet(); render();
  },
  step({ id, n }) {
    const d = day(); d.steps[id] ||= {}; d.steps[id][n] = !d.steps[id][n];
    save(); itemSheet(id);
  },
  mark({ kind, id }) {
    const d = day(); const other = kind === 'done' ? 'skip' : 'done';
    d[kind][id] = !d[kind][id]; if (d[kind][id]) d[other][id] = false;
    save(); closeSheet(); render();
  },
  rate({ field, n }) {
    const d = day(); d[field] = d[field] === +n ? null : +n;
    save(); render();
  },
  care({ c }) { const d = day(); d.care[c] = !d.care[c]; save(); render(); },
  careSave() { S.care = lines(val('p-care')); save(); closeSheet(); render(); },
  breathe() {
    const reduced = S.prefs.motion === 'off';
    openSheet(`<div class="fill"><div><div id="orb" class="orb"></div><div id="breathText" class="say">Einatmen</div></div></div>
      <button class="btn alt" data-act="close">Fertig</button>`, true);
    if (reduced) document.getElementById('orb').style.display = 'none';
    stopBreath();
    requestAnimationFrame(() => runBreath(true));
  },
  noise() { toggleNoise(); render(); },
  ground({ i }) {
    const n = +i; const [num, text] = groundSteps[n];
    const last = n === groundSteps.length - 1;
    openSheet(`<div class="fill"><div><div class="say">${num}</div><div class="big">${text}</div><p class="muted">Lass dir Zeit.</p></div></div>
      ${last ? '<button class="btn" data-act="close">Fertig</button>' : `<button class="btn" data-act="ground" data-i="${n + 1}">Weiter</button><button class="btn quiet" data-act="close">Schließen</button>`}`, true);
  },
  dark() {
    openSheet('<button data-act="close" aria-label="Schließen" style="flex:1;width:100%;color:#555">Antippen zum Schließen</button>', true);
    sheet.style.background = '#000'; sheet.style.padding = '0';
  },
  helpsForm() {
    openSheet(`<h2>Was mir hilft</h2><label for="f-helps">Eins pro Zeile</label><textarea id="f-helps">${h(S.helps.join('\n'))}</textarea>
      <button class="btn" data-act="helpsSave">Speichern</button><button class="btn quiet" data-act="close">Abbrechen</button>`);
  },
  helpsSave() { S.helps = lines(val('f-helps')); save(); closeSheet(); render(); },
  card({ id }) {
    const c = S.cards.find((x) => x.id === id);
    const long = c.text.length > 90;
    openSheet(`<div class="fill"><div class="say ${long ? 'long' : ''}">${h(c.text)}</div></div>
      <button class="btn alt" data-act="close">Schließen</button><button class="btn quiet" data-act="cardForm" data-id="${id}">Ändern</button>`, true);
  },
  cardForm({ id }) {
    const c = S.cards.find((x) => x.id === id);
    openSheet(`<h2>${c ? 'Karte ändern' : 'Neue Karte'}</h2><label for="f-card">Text</label><textarea id="f-card">${h(c?.text)}</textarea>
      <button class="btn" data-act="cardSave" data-id="${id || ''}">Speichern</button>
      ${c ? `<button class="btn quiet" data-act="cardDelete" data-id="${id}">Löschen</button>` : ''}
      <button class="btn quiet" data-act="close">Abbrechen</button>`);
  },
  cardSave({ id }) {
    const text = val('f-card').trim();
    if (!text) return document.getElementById('f-card').focus();
    if (id) S.cards.find((x) => x.id === id).text = text;
    else S.cards.push({ id: uid(), text });
    save(); closeSheet(); render();
  },
  cardDelete({ id }) {
    if (!confirm('Diese Karte löschen?')) return;
    S.cards = S.cards.filter((x) => x.id !== id);
    save(); closeSheet(); render();
  },
  export: exportData,
  import() { document.getElementById('importFile').click(); },
};

document.addEventListener('click', (e) => {
  if (e.target === sheet) return closeSheet();
  const el = e.target.closest('[data-act]');
  if (el) actions[el.dataset.act](el.dataset);
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'vol' && audio) audio.gain.gain.value = e.target.value / 100;
});
document.addEventListener('change', (e) => {
  const pref = e.target.dataset?.pref;
  if (pref) { S.prefs[pref] = pref === 'size' ? +e.target.value : e.target.value; save(); applyPrefs(); }
});
document.getElementById('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || !Array.isArray(data.cards)) throw new Error('format');
    if (!confirm('Aktuelle Daten durch diese Sicherung ersetzen?')) return;
    S = { ...defaults(), ...data, prefs: { ...defaults().prefs, ...data.prefs } };
    save(); applyPrefs(); closeSheet(); render();
  } catch (err) { alert('Diese Datei konnte nicht gelesen werden.'); }
});
sheet.addEventListener('close', () => {
  stopBreath();
  sheet.style.background = ''; sheet.style.padding = '';
});

applyPrefs();
save();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
