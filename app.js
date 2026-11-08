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
  plans: [
    {
      id: uid(), name: 'Morgens', emoji: '🌅', mode: 'ziel', target: '08:30', wake: '07:00', sleep: 8, fall: 20, buffer: 10,
      steps: [
        { id: uid(), title: 'Ankommen', choice: 0, options: [{ label: 'Ankommen', min: 10 }] },
        { id: uid(), title: 'Duschen', choice: 0, options: [{ label: 'Mit Haaren', min: 35 }, { label: 'Ohne Haare', min: 15 }, { label: 'Gar nicht', min: 0 }] },
        { id: uid(), title: 'Anziehen', choice: 0, options: [{ label: 'Anziehen', min: 10 }] },
        { id: uid(), title: 'Frühstück', choice: 0, options: [{ label: 'Frühstück', min: 20 }] },
        { id: uid(), title: 'Tasche, Schuhe, Jacke', choice: 0, options: [{ label: 'Tasche, Schuhe, Jacke', min: 10 }] },
      ],
    },
    {
      id: uid(), name: 'Abends', emoji: '🌙', mode: 'schlaf', target: '22:00', wake: '07:00', sleep: 8, fall: 20, buffer: 5,
      steps: [
        { id: uid(), title: 'Duschen', choice: 1, options: [{ label: 'Mit Haaren', min: 35 }, { label: 'Ohne Haare', min: 15 }, { label: 'Gar nicht', min: 0 }] },
        { id: uid(), title: 'Zähne putzen', choice: 0, options: [{ label: 'Zähne putzen', min: 5 }] },
        { id: uid(), title: 'Morgen kurz anschauen', choice: 0, options: [{ label: 'Morgen kurz anschauen', min: 5 }] },
        { id: uid(), title: 'Lesen oder Ruhe', choice: 0, options: [{ label: 'Lesen oder Ruhe', min: 20 }] },
      ],
    },
  ],
  run: null,
  days: {},
  prefs: { theme: 'warm', size: 100, motion: 'on', sound: 'off' },
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
    return `${runBanner()}<p class="muted">${h(date)}</p>${hero}<h2>Mein Tag</h2>${rows}
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
  zeit() {
    const cards = S.plans.map((p) => {
      const c = calc(p);
      const endLabel = p.mode === 'schlaf' ? 'Licht aus' : 'Fertig';
      return `<button class="card" style="width:100%;text-align:left" data-act="plan" data-id="${p.id}">
        <div class="big" style="margin-bottom:6px">${h(p.emoji)} ${h(p.name)}</div>
        <div><span class="muted">Anfangen:</span> <b>${fmt(c.start)}</b></div>
        <div><span class="muted">${endLabel}:</span> <b>${fmt(c.end)}</b></div></button>`;
    }).join('');
    return `${runBanner()}<p class="muted">Antippen, um Zeiten und Varianten zu wählen.</p>${cards}
      <button class="btn alt" data-act="planNew">+ Neuer Ablauf</button>`;
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

const titles = { heute: 'Heute', zeit: 'Zeit', energie: 'Energie', ruhe: 'Ruhe', sagen: 'Sagen' };
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
    <label for="p-sound">Sanfter Ton, wenn die Zeit eines Schritts um ist</label><select id="p-sound" data-pref="sound">${opt('off', 'Aus', p.sound)}${opt('on', 'An', p.sound)}</select>
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

/* ---------- Zeit: Abläufe und Timer ---------- */
const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
const fmt = (m) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; };
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} Std${m % 60 ? ` ${m % 60} Min` : ''}` : `${m} Min`);
const clock = (ts) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const planById = (id) => S.plans.find((p) => p.id === id);
const stepMin = (s) => s.options[Math.min(s.choice || 0, s.options.length - 1)].min;

function calc(p) {
  const total = p.steps.reduce((a, s) => a + stepMin(s), 0) + p.buffer;
  const end = p.mode === 'schlaf' ? toMin(p.wake) - p.sleep * 60 - p.fall : toMin(p.target);
  return { total, end, start: end - total };
}
function nearestTs(endMin) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let t = d.getTime() + (((endMin % 1440) + 1440) % 1440) * 60000;
  const now = Date.now();
  if (t < now - 6 * 3600000) t += 86400000; else if (t > now + 18 * 3600000) t -= 86400000;
  return t;
}
function planCalcHtml(p) {
  const c = calc(p);
  let cur = c.start;
  const rows = p.steps.filter((s) => stepMin(s) > 0).map((s) => {
    const o = s.options[Math.min(s.choice || 0, s.options.length - 1)];
    const name = s.options.length > 1 ? `${s.title}: ${o.label}` : s.title;
    const row = `<div class="line"><b>${fmt(cur)}</b><span>${h(name)}</span><span class="muted">${o.min} Min</span></div>`;
    cur += o.min;
    return row;
  }).join('');
  const buffer = p.buffer ? `<div class="line"><b>${fmt(cur)}</b><span>Puffer</span><span class="muted">${p.buffer} Min</span></div>` : '';
  let extra = '';
  if (p.mode === 'schlaf') {
    const n = new Date();
    const lightsOut = n.getHours() * 60 + n.getMinutes() + c.total;
    const sleepMin = (((toMin(p.wake) - lightsOut - p.fall) % 1440) + 1440) % 1440;
    if (sleepMin <= 12 * 60) extra = `<p class="muted">Wenn du jetzt anfängst: Licht aus um ${fmt(lightsOut)}, das wären etwa ${dur(sleepMin)} Schlaf.</p>`;
  }
  return `<div class="card hero"><div class="label">Anfangen um</div><div class="big">${fmt(c.start)}</div>
      <div class="muted">Dauert insgesamt ${dur(c.total)}</div></div>
    ${rows}${buffer}<div class="line"><b>${fmt(c.end)}</b><span><b>${p.mode === 'schlaf' ? 'Licht aus' : 'Fertig'}</b></span><span></span></div>${extra}`;
}
function planSheet(id) {
  const p = planById(id);
  if (!p) return closeSheet();
  const select = (field, list, unit) => `<select id="pf-${field}" data-planf="${field}" data-id="${id}">${list.map((v) => `<option value="${v}" ${p[field] === v ? 'selected' : ''}>${String(v).replace('.', ',')} ${unit}</option>`).join('')}</select>`;
  const goal = p.mode === 'schlaf'
    ? `<label for="pf-wake">Aufstehen um</label><input id="pf-wake" type="time" data-planf="wake" data-id="${id}" value="${h(p.wake)}">
       <label for="pf-sleep">Gewünschter Schlaf</label>${select('sleep', [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10], 'Stunden')}
       <label for="pf-fall">Zeit zum Einschlafen</label>${select('fall', [0, 10, 15, 20, 30, 45, 60], 'Min')}`
    : `<label for="pf-target">Fertig sein um</label><input id="pf-target" type="time" data-planf="target" data-id="${id}" value="${h(p.target)}">`;
  const variants = p.steps.filter((s) => s.options.length > 1).map((s) => `<label>${h(s.title)}</label><div class="chips">${s.options.map((o, n) =>
    `<button class="chip" data-act="opt" data-id="${id}" data-s="${s.id}" data-o="${n}" aria-pressed="${(s.choice || 0) === n}">${h(o.label)} · ${o.min} Min</button>`).join('')}</div>`).join('');
  openSheet(`<h2>${h(p.emoji)} ${h(p.name)}</h2>${goal}${variants}
    <label for="pf-buffer">Puffer</label>${select('buffer', [0, 5, 10, 15, 20, 30], 'Min')}
    <div id="planCalc" style="margin-top:16px">${planCalcHtml(p)}</div>
    <button class="btn" data-act="runStart" data-id="${id}">Jetzt starten</button>
    <button class="btn alt" data-act="planEdit" data-id="${id}">Ablauf ändern</button>
    <button class="btn quiet" data-act="close">Schließen</button>`);
}
function planEdit(id) {
  const p = planById(id);
  if (!p) return closeSheet();
  const rows = p.steps.map((s, i) => `<div class="row" style="padding-right:6px">
      <button class="grow" style="text-align:left;min-height:44px" data-act="stepForm" data-id="${id}" data-s="${s.id}"><b>${h(s.title)}</b><br><span class="muted">${s.options.map((o) => `${o.min} Min`).join(' / ')}</span></button>
      <button class="mini" aria-label="Nach oben" data-act="stepMove" data-id="${id}" data-i="${i}" data-d="-1">↑</button>
      <button class="mini" aria-label="Nach unten" data-act="stepMove" data-id="${id}" data-i="${i}" data-d="1">↓</button></div>`).join('');
  openSheet(`<h2>Ablauf ändern</h2>
    <label for="pf-name">Name</label><input id="pf-name" type="text" data-planf="name" data-id="${id}" value="${h(p.name)}">
    <label for="pf-emoji">Bild (Emoji)</label><input id="pf-emoji" type="text" data-planf="emoji" data-id="${id}" value="${h(p.emoji)}">
    <label for="pf-mode">Berechnen nach</label><select id="pf-mode" data-planf="mode" data-id="${id}">
      <option value="ziel" ${p.mode === 'ziel' ? 'selected' : ''}>Uhrzeit, zu der ich fertig sein will</option>
      <option value="schlaf" ${p.mode === 'schlaf' ? 'selected' : ''}>Aufstehzeit und Schlafdauer</option></select>
    <h2 style="margin-top:22px;font-size:1.15rem">Schritte</h2>${rows}
    <button class="btn alt" data-act="stepForm" data-id="${id}">+ Schritt hinzufügen</button>
    <button class="btn" data-act="plan" data-id="${id}">Fertig</button>
    <button class="btn quiet" data-act="planDelete" data-id="${id}">Ablauf löschen</button>`);
}
function stepForm(id, sid) {
  const s = planById(id).steps.find((x) => x.id === sid);
  const o = s?.options || [];
  const slot = (n) => `<div class="opt"><input id="s-l${n}" type="text" aria-label="Variante ${n + 1}" placeholder="${n ? 'Weitere Variante' : 'Variante, z. B. mit Haaren'}" value="${h(o[n]?.label)}"><input id="s-m${n}" type="number" inputmode="numeric" min="0" max="600" aria-label="Minuten" placeholder="Min" value="${o[n]?.min ?? ''}"></div>`;
  openSheet(`<h2>${s ? 'Schritt ändern' : 'Neuer Schritt'}</h2>
    <label for="s-title">Name</label><input id="s-title" type="text" value="${h(s?.title)}">
    <label>Minuten</label><p class="muted">Ohne Varianten reicht die erste Zeile mit den Minuten.</p>
    ${slot(0)}${slot(1)}${slot(2)}
    <button class="btn" data-act="stepSave" data-id="${id}" data-s="${sid || ''}">Speichern</button>
    ${s ? `<button class="btn quiet" data-act="stepDelete" data-id="${id}" data-s="${sid}">Löschen</button>` : ''}
    <button class="btn quiet" data-act="planEdit" data-id="${id}">Abbrechen</button>`);
}

/* Timer: rechnet über Uhrzeiten, läuft also auch nach dem Schließen der App richtig weiter */
let wakeLock = null;
let beepCtx = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch (e) { /* nicht verfügbar */ } }
function releaseAwake() { try { wakeLock?.release(); } catch (e) { /* egal */ } wakeLock = null; }
function primeBeep() {
  if (S.prefs.sound !== 'on') return;
  beepCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  beepCtx.resume();
}
function beep() {
  if (S.prefs.sound !== 'on' || !beepCtx) return;
  const osc = beepCtx.createOscillator(); const gain = beepCtx.createGain(); const t = beepCtx.currentTime;
  osc.frequency.value = 440;
  gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.15, t + 0.15); gain.gain.linearRampToValueAtTime(0, t + 0.9);
  osc.connect(gain).connect(beepCtx.destination); osc.start(t); osc.stop(t + 1);
}
function runBanner() {
  if (!S.run) return '';
  return `<button class="card hero" style="width:100%;text-align:left" data-act="runOpen"><div class="label">Läuft gerade</div><b>${h(S.run.steps[S.run.i].title)}</b> · zurück zum Timer</button>`;
}
function startStep(i) {
  const m = S.run.steps[i].min * 60000;
  S.run.i = i; S.run.stepLen = m; S.run.stepEnd = Date.now() + m; S.run.rang = false;
  save();
}
function runnerSheet() {
  const r = S.run;
  if (!r) return;
  const s = r.steps[r.i];
  const next = r.steps[r.i + 1];
  openSheet(`<div class="fill"><div style="width:100%">
      <div class="label">${h(r.emoji)} ${h(r.name)} · Schritt ${r.i + 1} von ${r.steps.length}</div>
      <div class="big" style="font-size:1.8rem;margin:10px 0 18px">${h(s.title)}</div>
      <div id="rTime" class="say"></div>
      <div class="track"><div id="rBar" class="fillbar"></div></div>
      <p id="rFore" class="muted"></p>
      <p class="muted">${next ? `Danach: ${h(next.title)}` : 'Das ist der letzte Schritt.'}</p>
    </div></div>
    <button class="btn" data-act="runNext">Fertig, weiter</button>
    <button class="btn alt" data-act="runMore">5 Minuten mehr</button>
    <button class="btn quiet" data-act="close">Timer ausblenden</button>
    <button class="btn quiet" data-act="runStop">Ablauf beenden</button>`, true);
  tick();
}
function tick() {
  const r = S.run;
  if (!r) return;
  const now = Date.now();
  const left = r.stepEnd - now;
  if (left <= 0 && !r.rang) { r.rang = true; save(); beep(); }
  const time = document.getElementById('rTime');
  if (!time) return;
  time.textContent = left > 60000 ? `noch ${Math.ceil(left / 60000)} Min`
    : left > 0 ? 'unter 1 Min' : 'Zeit ist um';
  document.getElementById('rBar').style.width = `${Math.max(0, Math.min(1, r.stepLen ? left / r.stepLen : 0)) * 100}%`;
  const later = r.steps.slice(r.i + 1).reduce((a, s) => a + s.min, 0);
  const finish = now + Math.max(0, left) + later * 60000;
  const late = Math.round((finish - r.target) / 60000);
  document.getElementById('rFore').textContent = late > 60
    ? `Fertig um etwa ${clock(finish)}.`
    : late <= 0 ? `Du bist gut in der Zeit. Fertig um etwa ${clock(finish)}.`
    : `Etwa ${dur(late)} später als geplant. Fertig um etwa ${clock(finish)}.`;
}
setInterval(tick, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.run) { tick(); keepAwake(); }
});

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
  plan({ id }) { planSheet(id); },
  planEdit({ id }) { planEdit(id); },
  planNew() {
    const p = { id: uid(), name: 'Neuer Ablauf', emoji: '⭐️', mode: 'ziel', target: '12:00', wake: '07:00', sleep: 8, fall: 20, buffer: 5, steps: [] };
    S.plans.push(p); save(); render(); planEdit(p.id);
  },
  planDelete({ id }) {
    if (!confirm('Diesen Ablauf löschen?')) return;
    S.plans = S.plans.filter((p) => p.id !== id);
    save(); closeSheet(); render();
  },
  opt({ id, s, o }) { planById(id).steps.find((x) => x.id === s).choice = +o; save(); planSheet(id); render(); },
  stepForm({ id, s }) { stepForm(id, s); },
  stepSave({ id, s }) {
    const title = val('s-title').trim();
    if (!title) return document.getElementById('s-title').focus();
    const options = [0, 1, 2].map((n) => ({ label: val(`s-l${n}`).trim(), raw: val(`s-m${n}`) }))
      .filter((o) => o.raw !== '')
      .map((o) => ({ label: o.label || title, min: Math.max(0, Math.min(600, Math.round(+o.raw) || 0)) }));
    if (!options.length) return document.getElementById('s-m0').focus();
    const p = planById(id);
    const old = p.steps.find((x) => x.id === s);
    if (old) { old.title = title; old.options = options; old.choice = Math.min(old.choice || 0, options.length - 1); }
    else p.steps.push({ id: uid(), title, choice: 0, options });
    save(); render(); planEdit(id);
  },
  stepDelete({ id, s }) {
    if (!confirm('Diesen Schritt löschen?')) return;
    const p = planById(id);
    p.steps = p.steps.filter((x) => x.id !== s);
    save(); render(); planEdit(id);
  },
  stepMove({ id, i, d }) {
    const p = planById(id); const a = +i; const b = a + +d;
    if (b < 0 || b >= p.steps.length) return;
    [p.steps[a], p.steps[b]] = [p.steps[b], p.steps[a]];
    save(); planEdit(id);
  },
  runStart({ id }) {
    const p = planById(id);
    const steps = p.steps.filter((s) => stepMin(s) > 0).map((s) => {
      const o = s.options[Math.min(s.choice || 0, s.options.length - 1)];
      return { title: s.options.length > 1 ? `${s.title}: ${o.label}` : s.title, min: o.min };
    });
    if (!steps.length) return alert('Dieser Ablauf hat noch keine Schritte.');
    S.run = { name: p.name, emoji: p.emoji, steps, target: nearestTs(calc(p).end), i: 0 };
    startStep(0); primeBeep(); keepAwake(); render(); runnerSheet();
  },
  runOpen() { primeBeep(); keepAwake(); runnerSheet(); },
  runNext() {
    primeBeep();
    if (S.run.i + 1 < S.run.steps.length) { startStep(S.run.i + 1); return runnerSheet(); }
    S.run = null; save(); releaseAwake(); render();
    openSheet('<div class="fill"><div class="say">Geschafft 🌿</div></div><button class="btn" data-act="close">Schließen</button>', true);
  },
  runMore() {
    const r = S.run; const now = Date.now();
    r.stepEnd = Math.max(r.stepEnd, now) + 300000;
    r.stepLen = r.stepEnd - now; r.rang = false;
    save(); tick();
  },
  runStop() {
    if (!confirm('Ablauf wirklich beenden?')) return;
    S.run = null; save(); releaseAwake(); closeSheet(); render();
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
  const field = e.target.dataset?.planf;
  if (field) {
    const id = e.target.dataset.id;
    const p = planById(id);
    const value = e.target.value;
    if (value === '' && (field === 'target' || field === 'wake')) return;
    p[field] = ['sleep', 'fall', 'buffer'].includes(field) ? +value : value;
    save(); render();
    if (field === 'mode') return;
    const box = document.getElementById('planCalc');
    if (box) box.innerHTML = planCalcHtml(p);
    return;
  }
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
if (S.run) runnerSheet();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
