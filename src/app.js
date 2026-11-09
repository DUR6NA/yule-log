import { createHearth } from './fire.js';
import { liquidGlass } from './glass.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const numberFormat = new Intl.NumberFormat();
const tauri = window.__TAURI__;
const invoke = tauri ? (cmd, args) => tauri.core.invoke(cmd, args) : null;
const PRESETS = ['15', '30', '60', '120', 'never'];
const MAX_MINUTES = 7 * 24 * 60; // the longest custom auto-off

let hearth = null;
try {
  hearth = createHearth($('hearth'), { reducedMotion });
} catch (err) {
  console.error('The fire simulation could not start:', err);
}
if (!hearth) document.body.classList.add('no-webgl');

// ?fire=0.8 previews the hearth at a fixed level, with no model involved.
const previewFire = new URLSearchParams(location.search).get('fire');
if (!invoke) document.body.classList.add('preview');

const app = {
  state: null,
  rate: 0,
  gpu: null,
  burnTokens: 0,
  clockOffset: 0,
  pending: false,
  autoOff: loadAutoOff(), // minutes, or null for never
};

for (const el of document.querySelectorAll('.glass')) {
  const panel = el.classList.contains('panel');
  liquidGlass(el, panel ? { bezel: 16, depth: 14, blur: 22 } : { bezel: 14, depth: 16, blur: 10 });
}

// ---------------------------------------------------------------------------
// The thermometer: GPU temperature in °F and °C, heat output in BTU/h below.

const thermometer = (() => {
  const svg = $('thermo');
  const NS = 'http://www.w3.org/2000/svg';
  const X = 28; // the tube's centre line
  const BULB_Y = 131;
  const TOP_Y = 27; // 200°F
  const BOTTOM_Y = 117; // -20°F
  const MIN_F = -20;
  const MAX_F = 200;
  const yForF = (f) => BOTTOM_Y - ((f - MIN_F) / (MAX_F - MIN_F)) * (BOTTOM_Y - TOP_Y);
  const yForC = (c) => yForF((c * 9) / 5 + 32);

  function el(tag, attrs, parent = svg) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.append(node);
    return node;
  }

  const defs = el('defs', {});
  const liquid = el('linearGradient', { id: 'thermo-liquid', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  el('stop', { offset: 0, 'stop-color': '#ff7a66' }, liquid);
  el('stop', { offset: 0.45, 'stop-color': '#f0281e' }, liquid);
  el('stop', { offset: 1, 'stop-color': '#9e0d0a' }, liquid);
  const bulb = el('radialGradient', { id: 'thermo-bulb', cx: 0.38, cy: 0.34, r: 0.7 }, defs);
  el('stop', { offset: 0, 'stop-color': '#ff9a88' }, bulb);
  el('stop', { offset: 0.45, 'stop-color': '#ee2a1f' }, bulb);
  el('stop', { offset: 1, 'stop-color': '#8a0b08' }, bulb);
  const screw = el('radialGradient', { id: 'thermo-screw', cx: 0.4, cy: 0.35, r: 0.7 }, defs);
  el('stop', { offset: 0, 'stop-color': '#f4f1ec' }, screw);
  el('stop', { offset: 1, 'stop-color': '#8d8780' }, screw);
  const bore = el('clipPath', { id: 'thermo-bore' }, defs);
  el('rect', { x: X - 2, y: TOP_Y - 7, width: 4, height: BULB_Y - TOP_Y + 7, rx: 2 }, bore);
  el('circle', { cx: X, cy: BULB_Y, r: 6.3 }, bore);

  // The screw it hangs from
  el('circle', { cx: X, cy: 6.5, r: 2.7, fill: 'url(#thermo-screw)' });
  el('path', { d: `M${X - 1.6} 5.4 L${X + 1.6} 7.6`, stroke: '#5d5852', 'stroke-width': 0.7 });

  el('text', { x: 15.5, y: 17, 'text-anchor': 'end', class: 'scale-unit' }).textContent = '°F';
  el('text', { x: 40.5, y: 17, 'text-anchor': 'start', class: 'scale-unit' }).textContent = '°C';

  for (let f = MIN_F; f <= MAX_F; f += 10) {
    const major = f % 40 === 0;
    const y = yForF(f);
    el('line', { x1: major ? 17.5 : 20, y1: y, x2: 23.5, y2: y, class: major ? 'tick major' : 'tick' });
    if (major) el('text', { x: 15.5, y: y + 2.6, 'text-anchor': 'end', class: 'scale' }).textContent = f;
  }
  for (let c = -25; c <= 90; c += 5) {
    const major = c % 20 === 0;
    const y = yForC(c);
    el('line', { x1: 32.5, y1: y, x2: major ? 38.5 : 36, y2: y, class: major ? 'tick major' : 'tick' });
    if (major) el('text', { x: 40.5, y: y + 2.6, 'text-anchor': 'start', class: 'scale' }).textContent = c;
  }

  // Glass tube and bulb, then the liquid inside them
  el('rect', { x: X - 3.6, y: TOP_Y - 9, width: 7.2, height: BULB_Y - TOP_Y + 9, rx: 3.6, fill: 'rgb(255 255 255 / .08)', stroke: 'rgb(255 255 255 / .4)', 'stroke-width': 0.7 });
  el('circle', { cx: X, cy: BULB_Y, r: 8.3, fill: 'rgb(255 255 255 / .08)', stroke: 'rgb(255 255 255 / .4)', 'stroke-width': 0.7 });
  const fluid = el('g', { 'clip-path': 'url(#thermo-bore)', class: 'liquid' });
  const column = el('rect', { x: X - 2, y: 0, width: 4, height: 160, fill: 'url(#thermo-liquid)', class: 'column' }, fluid);
  el('circle', { cx: X, cy: BULB_Y, r: 6.3, fill: 'url(#thermo-bulb)' }, fluid);
  // Highlights on the glass
  el('line', { x1: X - 1.9, y1: TOP_Y - 6, x2: X - 1.9, y2: BULB_Y - 9, stroke: 'rgb(255 255 255 / .55)', 'stroke-width': 0.8, 'stroke-linecap': 'round' });
  el('ellipse', { cx: X - 2.6, cy: BULB_Y - 2.8, rx: 2, ry: 1.3, fill: 'rgb(255 255 255 / .7)', transform: `rotate(-30 ${X - 2.6} ${BULB_Y - 2.8})` });

  const btu = $('btu');
  const figure = $('thermometer');
  let level = BOTTOM_Y + 2;
  column.style.transform = `translateY(${level}px)`;

  return {
    update(gpu) {
      if (!gpu || gpu.watts == null) {
        btu.textContent = '–';
        figure.title = 'No GPU reading (needs an NVIDIA card)';
        return;
      }
      const tempF = gpu.tempC == null ? null : (gpu.tempC * 9) / 5 + 32;
      const heat = Math.round(gpu.watts * 3.412);
      btu.textContent = numberFormat.format(heat);
      if (tempF != null) {
        const next = yForF(Math.min(Math.max(tempF, MIN_F - 5), MAX_F + 4));
        if (Math.abs(next - level) > 0.05) {
          level = next;
          column.style.transform = `translateY(${level}px)`;
        }
      }
      figure.title = [
        `${numberFormat.format(heat)} BTU/h from ${Math.round(gpu.watts)} W of GPU`,
        tempF == null ? null : `GPU at ${Math.round(tempF)}°F (${Math.round(gpu.tempC)}°C)`,
        gpu.util == null ? null : `${Math.round(gpu.util)}% busy`,
      ]
        .filter(Boolean)
        .join('\n');
    },
  };
})();

// ---------------------------------------------------------------------------
// Auto-off timer

function loadAutoOff() {
  const saved = localStorage.getItem('yule-auto-off');
  if (saved === 'never') return null;
  const minutes = Number(saved);
  return minutes >= 1 && minutes <= MAX_MINUTES ? minutes : 15;
}

function saveAutoOff(minutes) {
  localStorage.setItem('yule-auto-off', minutes == null ? 'never' : String(minutes));
}

/** "45", "45m", "1h30", "1h 30m", "1:30", "1.5 hours", "2d" → minutes; "never" → null; else NaN. */
function parseDuration(text) {
  const t = text.trim().toLowerCase();
  if (/^(never|forever|∞|no|off)$/.test(t)) return null;
  const clock = t.match(/^(\d+):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const units = { d: 1440, h: 60, m: 1 };
  let total = 0;
  let last = null;
  const rest = t.replace(/(\d+(?:\.\d+)?)\s*([a-z]*)/g, (_, n, unit) => {
    // "1h30": a bare number after hours means minutes
    const key = unit ? unit[0] : last === 'h' ? 'm' : last === 'd' ? 'h' : 'm';
    if (!(key in units) || (unit && !/^(d|days?|h|hrs?|hours?|m|mins?|minutes?)$/.test(unit))) return '!';
    total += Number(n) * units[key];
    last = key;
    return '';
  });
  if (last == null || rest.replace(/[\s,]|and/g, '')) return Number.NaN;
  return Math.round(total);
}

function formatDuration(minutes) {
  if (minutes == null) return 'Never';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m';
}

function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function renderTimerPanel() {
  const value = app.autoOff == null ? 'never' : String(app.autoOff);
  const preset = PRESETS.includes(value);
  for (const input of document.querySelectorAll('input[name="auto-off"]')) input.checked = input.value === value;
  const custom = $('custom-time');
  if (document.activeElement !== custom) custom.value = preset ? '' : formatDuration(app.autoOff);
  $('custom-form').classList.toggle('active', !preset);
  $('custom-form').classList.remove('invalid');
  renderTimerNote();
}

function renderTimerNote(message) {
  const note = $('timer-note');
  note.classList.toggle('bad', Boolean(message));
  if (message) note.textContent = message;
  else if (app.autoOff == null) note.textContent = 'Burns until you put it out. Mind the electric bill.';
  else if (app.state?.running) note.textContent = `Goes out ${formatDuration(app.autoOff)} from now. The last carol gets to finish.`;
  else note.textContent = `Goes out on its own after ${formatDuration(app.autoOff)}. The last carol gets to finish.`;
}

async function setAutoOff(minutes) {
  app.autoOff = minutes;
  saveAutoOff(minutes);
  renderTimerPanel();
  renderChip();
  // While burning, a new choice restarts the countdown from now.
  if (app.state?.running) await call('light', { minutes });
}

for (const input of document.querySelectorAll('input[name="auto-off"]')) {
  input.addEventListener('change', () => setAutoOff(input.value === 'never' ? null : Number(input.value)));
}

$('custom-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const minutes = parseDuration($('custom-time').value);
  if (Number.isNaN(minutes) || (minutes != null && (minutes < 1 || minutes > MAX_MINUTES))) {
    $('custom-form').classList.add('invalid');
    renderTimerNote('Try something like 45m, 1h 30m or 2d, up to 7 days. Or pick Never.');
    return;
  }
  $('custom-time').blur();
  setAutoOff(minutes);
});

$('custom-time').addEventListener('input', () => $('custom-form').classList.remove('invalid'));

function renderChip() {
  const s = app.state;
  const label = $('timer-label');
  if (s?.running && s.endsAt) {
    const left = s.endsAt - (Date.now() + app.clockOffset);
    label.textContent = left > 0 ? formatCountdown(left) : 'Last carol';
  } else {
    label.textContent = formatDuration(s?.running ? null : app.autoOff);
  }
}
setInterval(renderChip, 250);

// ---------------------------------------------------------------------------
// Status

const REASONS = {
  timer: 'Burned down',
  doused: 'Put out',
  error: 'Went out',
  shutdown: 'Went out',
};

const shortModel = (id) => (id ? id.split('/').pop() : 'the model');

function fireLevel() {
  if (previewFire !== null) return Number(previewFire) || 0;
  const s = app.state;
  if (!s?.running) return 0;
  if (s.phase === 'kindling') return s.burnTokens === 0 ? 0.22 : 0.5;
  if (s.phase === 'resting') return 0.55;
  return 0.55 + 0.45 * Math.min(1, app.rate / 45);
}

function statusLines() {
  if (!invoke) return ['Preview', 'Open the Yule Log app to light the fire'];
  const s = app.state;
  if (!s) return ['Starting…', ''];
  const tokens = `${numberFormat.format(app.burnTokens)} tokens`;
  if (s.running) {
    const n = s.carols + 1;
    const rate = `${tokens} · ${Math.round(app.rate)} tok/s`;
    if (s.phase === 'kindling' && s.burnTokens === 0) {
      return ['Kindling…', s.loadingModel ? `${s.server} is loading ${shortModel(s.model)}` : `Asking ${shortModel(s.model)} for a carol`];
    }
    if (s.phase === 'kindling') return [`Starting carol ${n}`, rate];
    if (s.phase === 'resting') return [`Carol ${s.carols} is done`, rate];
    return [`Writing carol ${n}`, rate];
  }
  if (s.configured === false) return ['No firewood yet', 'Pick a model server in Settings'];
  if (s.error && !s.lastBurn?.tokens) return ['Couldn’t light the fire', `${shortModel(s.model)} on ${s.server}`];
  if (s.lastBurn) {
    const b = s.lastBurn;
    return [REASONS[b.reason] ?? 'The fire is out', `${numberFormat.format(b.tokens)} tokens · ${b.carols} ${b.carols === 1 ? 'carol' : 'carols'}`];
  }
  return ['The fire is out', `${shortModel(s.model)} on ${s.server}`];
}

let dismissedError = null;

function render() {
  const s = app.state;
  const running = Boolean(s?.running);
  document.body.classList.toggle('is-running', running);
  document.body.dataset.phase = s?.phase ?? 'out';
  if (s?.error) document.body.dataset.error = '';
  else delete document.body.dataset.error;

  const [status, detail] = statusLines();
  $('status').textContent = status;
  $('detail').textContent = detail;
  $('detail').title = detail;

  const toggle = $('toggle');
  $('toggle-label').textContent = running ? 'Put out' : 'Light';
  toggle.disabled = app.pending || !invoke;

  const notice = $('notice');
  const showError = s?.error && !running && s.error !== dismissedError;
  notice.hidden = !showError;
  if (showError) $('notice-text').textContent = s.error;

  renderChip();
  hearth?.setFire(fireLevel());
}

// Tokens arrive up to ~60 a second; redraw at most once a frame.
let renderQueued = false;
function renderSoon() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

$('notice-close').addEventListener('click', () => {
  dismissedError = app.state?.error ?? null;
  render();
});

// ---------------------------------------------------------------------------
// Talking to the app

function setState(state) {
  if (!state || typeof state !== 'object') return;
  const wasRunning = app.state?.running;
  app.state = state;
  app.clockOffset = state.now - Date.now();
  app.burnTokens = state.running ? state.burnTokens : (state.lastBurn?.tokens ?? 0);
  if (!state.running) app.rate = 0;
  if (state.running && !wasRunning) dismissedError = null;
  render();
}

async function call(cmd, args) {
  if (!invoke) return null;
  app.pending = true;
  render();
  try {
    const result = await invoke(cmd, args);
    if (result && 'running' in result) setState(result);
    return result;
  } catch (err) {
    app.state = { ...(app.state ?? {}), error: String(err) };
    return null;
  } finally {
    app.pending = false;
    render();
  }
}

$('toggle').addEventListener('click', () => {
  if (app.state?.running) call('douse');
  // Nothing to burn until a server is picked, so go straight to Settings.
  else if (app.state?.configured === false) $('settings-panel').showPopover();
  else call('light', { minutes: app.autoOff });
});

if (invoke) {
  const { listen } = tauri.event;
  await listen('state', (e) => setState(e.payload));
  await listen('tick', (e) => {
    const t = e.payload;
    app.rate = t.rate;
    app.gpu = t.gpu;
    if (app.state?.running) app.burnTokens = Math.max(app.burnTokens, t.burnTokens);
    app.clockOffset = t.now - Date.now();
    thermometer.update(t.gpu);
    render();
  });
  await listen('token', (e) => {
    const n = Number(e.payload) || 1;
    app.burnTokens += n;
    for (let i = 0; i < Math.min(n, 3); i++) hearth?.feed();
    renderSoon();
  });
  setState(await invoke('get_state'));
} else {
  render();
}
thermometer.update(null);
renderTimerPanel();

// ---------------------------------------------------------------------------
// Settings: which model server to burn

const settingsForm = $('settings-panel');
let modelCheck = 0;

function settingsFromForm() {
  return { baseUrl: $('base-url').value, model: $('model').value, apiKey: $('api-key').value };
}

function settingsNote(text, tone = '') {
  const note = $('settings-note');
  note.textContent = text;
  note.className = `panel-note server-check ${tone}`;
}

async function checkServer() {
  const ticket = ++modelCheck;
  if (!$('base-url').value.trim()) {
    $('model-list').replaceChildren();
    settingsNote('Pick a server above, or type its address.');
    return;
  }
  settingsNote('Checking the server…');
  try {
    const models = await invoke('list_models', { settings: settingsFromForm() });
    if (ticket !== modelCheck) return;
    const chat = models.filter((m) => !/embed/i.test(m));
    $('model-list').replaceChildren(...chat.map((m) => Object.assign(document.createElement('option'), { value: m })));
    if (!$('model').value.trim() && chat.length) $('model').value = chat[0];
    const model = $('model').value.trim();
    if (!chat.length) settingsNote('Connected. The server didn’t list any models, so type one in.', 'good');
    else if (model && !models.includes(model)) settingsNote(`Connected, but it doesn’t list ${model}. It has ${chat.length} ${chat.length === 1 ? 'model' : 'models'}.`, 'bad');
    else settingsNote(`Connected · ${chat.length} ${chat.length === 1 ? 'model' : 'models'} available`, 'good');
  } catch (err) {
    if (ticket === modelCheck) settingsNote(String(err), 'bad');
  }
}

let checkTimer = 0;
function checkSoon() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(checkServer, 500);
}

settingsForm.addEventListener('beforetoggle', async (e) => {
  if (e.newState !== 'open' || !invoke) return;
  const s = await invoke('get_settings');
  $('base-url').value = s.baseUrl;
  $('model').value = s.model;
  $('api-key').value = s.apiKey;
  settingsNote('');
  checkServer();
});

$('base-url').addEventListener('input', checkSoon);
$('api-key').addEventListener('input', checkSoon);
$('model').addEventListener('change', checkServer);

for (const button of document.querySelectorAll('.servers button')) {
  button.addEventListener('click', () => {
    $('base-url').value = button.dataset.url;
    $('model').value = '';
    checkServer();
  });
}

$('settings-cancel').addEventListener('click', () => settingsForm.hidePopover());

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const save = $('settings-save');
  save.disabled = true;
  try {
    const saved = await invoke('save_settings', { settings: settingsFromForm() });
    $('base-url').value = saved.baseUrl;
    settingsNote(app.state?.running ? 'Saved. The next carol uses it.' : 'Saved.', 'good');
    setTimeout(() => settingsForm.hidePopover(), 700);
  } catch (err) {
    settingsNote(String(err), 'bad');
  } finally {
    save.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Panels open just above the dock, centred on their button

for (const panel of document.querySelectorAll('.panel')) {
  const opener = document.querySelector(`[popovertarget="${panel.id}"]`);
  panel.addEventListener('beforetoggle', (e) => {
    opener.setAttribute('aria-expanded', String(e.newState === 'open'));
    if (e.newState !== 'open') return;
    if (panel.id === 'timer-panel') renderTimerPanel();
    requestAnimationFrame(() => placePanel(panel, opener));
  });
}

function placePanel(panel, opener) {
  const button = opener.getBoundingClientRect();
  const dock = $('dock').getBoundingClientRect();
  const width = panel.offsetWidth;
  const left = Math.min(Math.max(button.left + button.width / 2 - width / 2, 12), innerWidth - width - 12);
  panel.style.left = `${left}px`;
  panel.style.bottom = `${innerHeight - dock.top + 10}px`;
  panel.style.transformOrigin = `${button.left + button.width / 2 - left}px 100%`;
}

// ---------------------------------------------------------------------------
// Full screen, and the controls get out of the way while the fire burns

async function setFullscreen(value) {
  if (!invoke) return;
  const full = await invoke('set_fullscreen', { fullscreen: value });
  document.body.classList.toggle('fullscreen', full);
  $('fullscreen').setAttribute('aria-label', full ? 'Exit full screen' : 'Full screen');
}

$('fullscreen').addEventListener('click', () => setFullscreen(null));
$('hearth').addEventListener('dblclick', () => setFullscreen(null));

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F' || e.key === 'F11') {
    e.preventDefault();
    setFullscreen(null);
  } else if (e.key === 'Escape' && document.body.classList.contains('fullscreen') && !document.querySelector(':popover-open')) {
    setFullscreen(false);
  }
});

let idleTimer = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const busy = document.querySelector(':popover-open') || $('dock').matches(':focus-within, :hover') || !app.state?.running;
    if (busy) wake();
    else document.body.classList.add('idle');
  }, 4000);
}
for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel']) addEventListener(type, wake, { passive: true });
wake();

// ---------------------------------------------------------------------------
// Layout and the glow the fire throws on the glass

function frameHearth() {
  hearth?.frame(0.5, null);
}
new ResizeObserver(frameHearth).observe(document.body);
frameHearth();

if (hearth) {
  const root = document.documentElement.style;
  setInterval(() => root.setProperty('--heat', hearth.levels.fire.toFixed(3)), 100);
}
