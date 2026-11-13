import { STUDY } from "../config.js";
import { firebaseConfigured, getFirestoreKit } from "./firebase.js";
import { makePlan, actionKeyOf } from "./plan.js";

/* ───────────────────────── Setup ───────────────────────── */
const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const STORE_KEY = `video-motion-survey:${STUDY.studyVersion}`;
const isTestLink = params.has("test");

const store = {
  get() { try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* private mode: keep going */ } },
  clear() { try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ } },
};
if (params.has("reset")) store.clear();
const jumpTo = params.get("jump");
// Drop one-shot params from the address bar so a page reload doesn't repeat them.
if (params.has("reset") || params.has("jump")) {
  const clean = new URLSearchParams(params);
  clean.delete("reset");
  clean.delete("jump");
  const qs = clean.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
}

const svg = (body, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const I = {
  clapper: svg(`<rect x="3" y="8" width="18" height="13" rx="3"/><path d="M3 12h18M7.5 8l2-4.5M12.5 8l2-4.5M17.5 8l2-4.5M3.6 6.2 19.5 3"/><path d="M10.5 14.5v4l3.4-2z" fill="currentColor"/>`, 30),
  chat: svg(`<path d="M21 12a8 8 0 0 1-8 8H6l-3 2v-6.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8z"/><path d="M8 10h8M8 14h5"/>`, 22),
  play: svg(`<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>`, 18),
  pause: svg(`<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>`, 18),
  restart: svg(`<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>`, 18),
  check: svg(`<path d="M20 6 9 17l-5-5"/>`, 18),
  bigCheck: svg(`<path d="M20 6 9 17l-5-5"/>`, 38),
  flag: svg(`<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>`, 34),
  alert: svg(`<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/>`, 34),
  right: svg(`<path d="M5 12h14M13 6l6 6-6 6"/>`, 18),
  left: svg(`<path d="M19 12H5M11 6l-6 6 6 6"/>`, 18),
  clock: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`, 16),
  film: svg(`<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>`, 16),
  layers: svg(`<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>`, 16),
  shield: svg(`<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>`, 16),
  text: svg(`<path d="M4 6h16M4 12h11M4 18h7"/>`, 22),
  person: svg(`<circle cx="12" cy="4.5" r="2"/><path d="M12 7v7M7 10l5-1.5 5 1.5M12 14l-3.5 7M12 14l3.5 7"/>`, 22),
  wave: svg(`<path d="M2 12c2.5-5 5-5 7.5 0s5 5 7.5 0 3.5-4 5-3"/>`, 22),
  eye: svg(`<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`, 15),
  download: svg(`<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>`, 18),
  info: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>`, 18),
  tick: svg(`<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>`, 18),
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const quote = (p) => `“${esc(String(p).trim())}”`;

function randInt(n) {
  const u = new Uint32Array(1);
  crypto.getRandomValues(u);
  return u[0] % n;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Shuffle, trying to avoid the same prompt appearing twice in a row.
function orderTrials(trials) {
  let best = shuffle(trials);
  for (let t = 0; t < 300; t++) {
    const o = t === 0 ? best : shuffle(trials);
    if (!o.some((x, i) => i > 0 && o[i - 1].promptId === x.promptId)) return o;
    best = o;
  }
  return best;
}
function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function collectParams() {
  const out = {};
  let n = 0;
  for (const [k, v] of params) {
    if (["reset", "jump"].includes(k) || n >= 12) continue;
    out[k.slice(0, 60)] = v.slice(0, 200);
    n++;
  }
  return out;
}

/* ───────────────────────── State ───────────────────────── */
let manifest;
let trialById = new Map();
let exps = [];
let state = null;
let steps = [];
let totalTrials = 0;
let cleanup = () => {};

function save() { if (state) store.set(state); }

// Which clips this participant sees: each action in only one experiment (see plan.js).
function newPlan() {
  const keys = exps.map((e) => e.key);
  const { cycle } = makePlan(manifest, keys, 0);
  const forced = params.get("rotation");
  const isForced = forced != null && /^\d+$/.test(forced);
  const rotation = isForced ? Number(forced) % cycle : randInt(cycle);
  return { ...makePlan(manifest, keys, rotation), forced: isForced };
}
const planSize = (plan) => Object.values(plan.selected).reduce((n, list) => n + list.length, 0);
const planParts = (plan) => exps.filter((e) => plan.selected[e.key]?.length).length;

function newState(plan) {
  const order = {};
  // experiments stay in config order (A, B, C); clips are shuffled within each one
  for (const e of exps) order[e.key] = orderTrials(plan.selected[e.key] || []).map((t) => t.id);
  return {
    studyVersion: STUDY.studyVersion,
    participantId: uid(),
    isTest: isTestLink,
    urlParams: collectParams(),
    startedAt: new Date().toISOString(),
    assignment: {
      scheme: plan.scheme,
      rotation: plan.rotation,
      cycle: plan.cycle,
      forced: plan.forced,
      byAction: plan.byAction, // shared action -> experiment it was shown in
      actionExps: plan.actionExps, // action -> experiments that contain it, e.g. "ABC"
      hidden: plan.hidden, // clips NOT shown to this participant
    },
    order,
    step: 0,
    answers: {},
    meta: {},
    profile: { experience: null },
    feedback: "",
    submitAttempts: 0,
    submitted: false,
  };
}

let totalParts = 0;
function buildSteps() {
  const s = [];
  let g = 0;
  let part = 0;
  for (const exp of exps) {
    const ids = (state.order[exp.key] || []).filter((id) => trialById.has(id));
    if (!ids.length) continue;
    const ei = part++;
    ids.forEach((id, i) => s.push({ type: "trial", exp, ei, trial: trialById.get(id), pos: i + 1, n: ids.length, g: ++g }));
  }
  s.push({ type: "finish" });
  totalTrials = g;
  totalParts = part;
  return s;
}

/* ───────────────────────── Boot ───────────────────────── */
async function boot() {
  try {
    const res = await fetch("manifest.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<section class="card narrow"><div class="finish"><div class="big-icon err">${I.alert}</div>
      <h1>Couldn't load the study</h1><p class="lead">Please check your internet connection and reload the page.</p></div></section>`;
    return;
  }
  exps = STUDY.experiments.filter((e) => manifest.experiments?.[e.key]?.trials?.length);
  for (const e of exps) for (const t of manifest.experiments[e.key].trials) trialById.set(t.id, t);

  const saved = store.get();
  const valid = saved && saved.studyVersion === STUDY.studyVersion && saved.order && saved.participantId && saved.assignment;

  if (isTestLink && jumpTo != null) {
    state = valid && !saved.submitted ? saved : newState(newPlan());
    steps = buildSteps();
    state.step = Math.max(0, Math.min(steps.length - 1, parseInt(jumpTo, 10) || 0));
    save();
    return render();
  }
  if (valid && saved.submitted) {
    state = saved;
    steps = buildSteps();
    return renderDone();
  }
  renderIntro(valid ? saved : null);
}

/* ───────────────────────── Render helpers ───────────────────────── */
function banners() {
  let h = "";
  if (!firebaseConfigured) {
    h += `<div class="banner warn">${I.info}<span><strong>Preview mode.</strong> Firebase isn't set up in <code>config.js</code> yet, so answers will be downloaded as a file instead of saved.</span></div>`;
  }
  if (isTestLink || state?.isTest) {
    h += `<div class="banner info">${I.info}<span><strong>Test run.</strong> This response will be marked <code>isTest</code> so you can exclude or delete it on the dashboard.</span></div>`;
  }
  return h;
}

function mount(html) {
  cleanup();
  cleanup = () => {};
  app.innerHTML = banners() + html;
  window.scrollTo(0, 0);
}

function render() {
  if (!state) return renderIntro(null);
  if (state.submitted) return renderDone();
  const st = steps[state.step];
  if (!st) { state.step = 0; return render(); }
  if (st.type === "trial") return renderTrial(st);
  return renderFinish();
}

function go(delta) {
  state.step = Math.max(0, Math.min(steps.length - 1, state.step + delta));
  save();
  render();
}

function optionsHtml(name, value, opts, dataAttr = "") {
  return opts.map((o) => {
    const v = typeof o === "string" ? o : o.value;
    const label = typeof o === "string" ? o : o.label;
    return `<label class="opt"><input type="radio" name="${esc(name)}" value="${esc(v)}" ${dataAttr} ${value === v ? "checked" : ""}><span>${esc(label)}</span></label>`;
  }).join("");
}

/* ───────────────────────── Intro ───────────────────────── */
function renderIntro(pending) {
  // The plan is drawn now so the page can state the exact number of clips; it is used when "Start" is pressed.
  const plan = newPlan();
  const nClips = planSize(plan);
  const nParts = planParts(plan);
  const minutes = Math.max(5, Math.ceil((nClips * 35) / 60 / 5) * 5);
  const answered = pending ? Object.values(pending.answers || {}).filter((a) => Object.keys(a).length).length : 0;
  const pendingTotal = pending ? Object.values(pending.order || {}).reduce((n, ids) => n + ids.length, 0) : 0;
  const resume = pending && (pending.step > 0 || answered > 0)
    ? `<div class="resume">${I.info}<p><strong>Welcome back!</strong> You have started this study before (${answered} of ${pendingTotal} clips answered). You can pick up where you left off.</p>
         <button class="btn ghost small" id="restart">Start over</button>
         <button class="btn primary small" id="resume">Continue ${I.right}</button></div>`
    : "";
  const exp = STUDY.experienceQuestion;

  mount(`<section class="card">
    ${resume}
    <div class="hero">
      <div class="logo">${I.clapper}</div>
      <p class="eyebrow">${esc(STUDY.eyebrow)}</p>
      <h1>${esc(STUDY.title)}</h1>
      <p class="lead">Thank you for taking part! You'll watch short clips of 3D figures performing everyday actions, like walking, punching, or juggling.
        Each clip shows <strong>two versions of the same action side by side</strong>, and you tell us which one looks better.</p>
      <div class="facts">
        <span class="chip">${I.clock} About ${minutes} minutes</span>
        <span class="chip">${I.film} ${nClips} comparisons</span>
        <span class="chip">${I.layers} ${nParts} short part${nParts > 1 ? "s" : ""}</span>
        <span class="chip">${I.shield} Anonymous</span>
      </div>
    </div>

    <h2 class="section-title">How it works</h2>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><h3>Read the description</h3>
        <p>A short sentence tells you what the person is supposed to be doing.</p></div>
      <div class="step"><div class="step-num">2</div><h3>Watch both animations</h3>
        <p>The clip loops automatically. Watch it all the way through at least once; slow motion helps you spot small glitches.</p></div>
      <div class="step"><div class="step-num">3</div><h3>Pick Left or Right</h3>
        <p>Answer three quick questions per clip. Choose “About the same” only when you really can't see a difference.</p></div>
    </div>

    <h2 class="section-title">What to look for</h2>
    <div class="lookfor">
      <div class="look"><div class="look-icon">${I.text}</div><div><h3>Matches the description</h3>
        <p>Does the person really do what the sentence says, every part of it?</p></div></div>
      <div class="look"><div class="look-icon">${I.person}</div><div><h3>Looks like a real person</h3>
        <p>Watch for floating, sliding feet, shaking or jitter, stiff body parts, and impossible poses.</p></div></div>
      <div class="look"><div class="look-icon">${I.wave}</div><div><h3>Smooth and coordinated</h3>
        <p>Does it flow naturally, in a sensible order, with body parts working together, or does it look robotic?</p></div></div>
    </div>

    <h2 class="section-title">Good to know</h2>
    <ul class="tips">
      <li>${I.check}<span>There are no right or wrong answers. We want your honest first impression.</span></li>
      <li>${I.check}<span>The two systems swap sides between clips, so neither side is always the same one.</span></li>
      <li>${I.check}<span>Please use a laptop or desktop computer with a reasonably large window.</span></li>
      <li>${I.check}<span>Your progress is saved in this browser, so reloading the page won't lose your answers.</span></li>
    </ul>

    <div class="form-block">
      <p class="label">${esc(exp.text)} <small>(optional)</small></p>
      <div class="options" role="radiogroup" aria-label="${esc(exp.text)}">${optionsHtml("experience", null, exp.options)}</div>
      <label class="consent"><input type="checkbox" id="consent"><span>${esc(STUDY.consentText)}</span></label>
    </div>
    <div class="start-row">
      <p class="note">You can stop at any time by closing this tab.</p>
      <button class="btn primary lg" id="start" disabled>Start the study ${I.right}</button>
    </div>
  </section>`);

  const consent = document.getElementById("consent");
  const start = document.getElementById("start");
  consent.addEventListener("change", () => { start.disabled = !consent.checked; });
  start.addEventListener("click", () => {
    if (!consent.checked) return;
    state = newState(plan);
    state.profile.experience = app.querySelector('input[name="experience"]:checked')?.value ?? null;
    state.consentAt = new Date().toISOString();
    steps = buildSteps();
    save();
    render();
  });
  document.getElementById("resume")?.addEventListener("click", () => {
    state = pending;
    steps = buildSteps();
    render();
  });
  document.getElementById("restart")?.addEventListener("click", () => {
    if (!confirm("Start over? Your previous answers in this browser will be discarded.")) return;
    store.clear();
    renderIntro(null);
  });
}

/* ───────────────────────── Trial ───────────────────────── */
function renderTrial(st) {
  const { exp, ei, trial, pos, n, g } = st;
  const ans = (state.answers[trial.id] ||= {});
  const meta = (state.meta[trial.id] ||= { timeMs: 0, watchedSec: 0, fullyWatched: false, usedSlowMo: false, visits: 0 });
  meta.visits++;
  const isLast = state.step === steps.length - 2;
  const t0 = performance.now();

  mount(`<section class="card">
    <header class="head">
      <div class="logo">${I.clapper}</div>
      <div class="head-divider"></div>
      <div class="head-text"><h1>${esc(exp.title)}</h1><p class="sub">${esc(exp.subtitle)}</p></div>
      <span class="chip">Part ${ei + 1} of ${totalParts} · Clip ${pos}/${n}</span>
    </header>

    <div class="prompt"><span class="prompt-label">${I.chat} Text Prompt</span><p class="prompt-text">${quote(trial.prompt)}</p></div>

    ${trial.keyframes ? `<div class="keyframes"><span class="kf-label">Reference<br>Keyframes</span><img src="${encodePath(trial.keyframes)}" alt="Reference keyframes"></div>` : ""}

    <div class="viewer">
      <div class="viewer-labels"><span>Left Animation</span><span>Right Animation</span></div>
      <div class="video-frame">
        <video muted loop playsinline autoplay preload="auto" disablepictureinpicture disableremoteplayback></video>
        <div class="video-overlay" id="overlay"><div class="stack"><div class="spinner"></div><span>Loading clip…</span></div></div>
      </div>
      <div class="controls">
        <button class="icon-btn" id="playpause" aria-label="Pause">${I.pause}</button>
        <button class="icon-btn" id="replay" aria-label="Restart from the beginning" title="Restart">${I.restart}</button>
        <div class="scrub" id="scrub" role="slider" aria-label="Playback position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
          <div class="scrub-track"><div class="scrub-fill" id="fill"></div></div>
        </div>
        <button class="speed-btn" id="speed" aria-pressed="false" title="Play at half speed">Slow-mo 0.5×</button>
        <span class="watch-state" id="watch">${I.eye} Watch the full clip</span>
      </div>
    </div>

    <ol class="questions">
      ${exp.questions.map((q, i) => `
        <li class="q ${ans[q.id] ? "answered" : ""}" data-qid="${esc(q.id)}">
          <span class="q-num">${i + 1}</span>
          <div class="q-body">
            <p class="q-text" id="qt-${esc(q.id)}">${esc(q.text)}</p>
            ${q.hint ? `<p class="q-hint">${esc(q.hint)}</p>` : ""}
            <div class="options" role="radiogroup" aria-labelledby="qt-${esc(q.id)}">${optionsHtml(`q-${q.id}`, ans[q.id], STUDY.options, `data-q="${esc(q.id)}"`)}</div>
          </div>
        </li>`).join("")}
    </ol>

    <footer class="foot">
      <div class="progress">
        <span class="progress-label">Clip ${g} of ${totalTrials}</span>
        <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${totalTrials}" aria-valuenow="${g}"><i style="width:${(g / totalTrials) * 100}%"></i></div>
      </div>
      <div class="nav">
        <button class="btn ghost" id="back" ${state.step === 0 ? "disabled" : ""}>${I.left} Back</button>
        <button class="btn primary" id="next" aria-disabled="true">${isLast ? `Finish ${I.check}` : `Next ${I.right}`}</button>
      </div>
      <p class="foot-hint" id="hint"></p>
    </footer>
  </section>`);

  const video = app.querySelector("video");
  const overlay = document.getElementById("overlay");
  const fill = document.getElementById("fill");
  const scrub = document.getElementById("scrub");
  const ppBtn = document.getElementById("playpause");
  const speedBtn = document.getElementById("speed");
  const watch = document.getElementById("watch");
  const nextBtn = document.getElementById("next");
  const hint = document.getElementById("hint");

  // ---- video ----
  let raf = 0;
  let lastT = 0;
  let scrubbing = false;
  let loadingTimer = 0;
  const setOverlay = (html) => {
    if (html) { overlay.innerHTML = `<div class="stack">${html}</div>`; overlay.hidden = false; }
    else overlay.hidden = true;
  };
  const showLoading = () => {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => setOverlay(`<div class="spinner"></div><span>Loading clip…</span>`), 250);
  };
  const tryPlay = () => video.play().catch(() => {
    setOverlay(`<button class="btn primary" id="tapplay">${I.play} Play clip</button>`);
    document.getElementById("tapplay")?.addEventListener("click", () => { setOverlay(null); video.play(); });
  });

  video.src = encodePath(trial.src);
  video.addEventListener("contextmenu", (e) => e.preventDefault());
  video.addEventListener("loadeddata", () => { clearTimeout(loadingTimer); setOverlay(null); });
  video.addEventListener("canplay", () => { clearTimeout(loadingTimer); if (!overlay.querySelector("#tapplay")) setOverlay(null); });
  video.addEventListener("waiting", showLoading);
  video.addEventListener("playing", () => { clearTimeout(loadingTimer); setOverlay(null); });
  video.addEventListener("error", () => {
    clearTimeout(loadingTimer);
    setOverlay(`<span>This clip couldn't be loaded.</span><button class="btn ghost small" id="retryvid">${I.restart} Try again</button>`);
    document.getElementById("retryvid")?.addEventListener("click", () => {
      setOverlay(`<div class="spinner"></div><span>Loading clip…</span>`);
      video.src = `${encodePath(trial.src)}?r=${Date.now()}`;
      video.load();
      tryPlay();
    });
  });
  video.addEventListener("play", () => { ppBtn.innerHTML = I.pause; ppBtn.setAttribute("aria-label", "Pause"); });
  video.addEventListener("pause", () => { ppBtn.innerHTML = I.play; ppBtn.setAttribute("aria-label", "Play"); });
  video.addEventListener("click", () => (video.paused ? video.play() : video.pause()));

  video.addEventListener("timeupdate", () => {
    const t = video.currentTime;
    const d = video.duration;
    if (!scrubbing && !video.seeking) {
      const dt = t - lastT;
      if (dt > 0 && dt < 1) meta.watchedSec += dt;
    }
    lastT = t;
    if (!meta.fullyWatched && Number.isFinite(d) && d > 0 && meta.watchedSec >= d * 0.9) {
      meta.fullyWatched = true;
      save();
      updateNav();
    }
  });

  const tick = () => {
    const d = video.duration;
    if (Number.isFinite(d) && d > 0) {
      const pct = (video.currentTime / d) * 100;
      fill.style.width = `${pct}%`;
      scrub.setAttribute("aria-valuenow", String(Math.round(pct)));
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const seekTo = (clientX) => {
    const r = scrub.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    if (Number.isFinite(video.duration)) { video.currentTime = f * video.duration; lastT = video.currentTime; }
  };
  scrub.addEventListener("pointerdown", (e) => { scrubbing = true; scrub.setPointerCapture(e.pointerId); seekTo(e.clientX); });
  scrub.addEventListener("pointermove", (e) => { if (scrubbing) seekTo(e.clientX); });
  const endScrub = () => { scrubbing = false; lastT = video.currentTime; };
  scrub.addEventListener("pointerup", endScrub);
  scrub.addEventListener("pointercancel", endScrub);
  scrub.addEventListener("keydown", (e) => {
    if (!Number.isFinite(video.duration)) return;
    if (e.key === "ArrowRight") { video.currentTime = Math.min(video.duration, video.currentTime + 0.5); lastT = video.currentTime; e.preventDefault(); }
    if (e.key === "ArrowLeft") { video.currentTime = Math.max(0, video.currentTime - 0.5); lastT = video.currentTime; e.preventDefault(); }
  });

  ppBtn.addEventListener("click", () => (video.paused ? video.play() : video.pause()));
  document.getElementById("replay").addEventListener("click", () => { video.currentTime = 0; lastT = 0; video.play(); });
  speedBtn.addEventListener("click", () => {
    const slow = video.playbackRate === 1;
    video.playbackRate = slow ? 0.5 : 1;
    speedBtn.setAttribute("aria-pressed", String(slow));
    if (slow) meta.usedSlowMo = true;
  });

  showLoading();
  tryPlay();
  preloadNext();

  // ---- questions ----
  app.querySelectorAll("input[data-q]").forEach((inp) => {
    inp.addEventListener("change", () => {
      ans[inp.dataset.q] = inp.value;
      const li = inp.closest(".q");
      li.classList.add("answered");
      li.classList.remove("missing");
      save();
      updateNav();
    });
  });

  function missingQs() { return exp.questions.filter((q) => !ans[q.id]); }
  function updateNav() {
    const missing = missingQs().length;
    const needWatch = STUDY.requireFullView && !meta.fullyWatched;
    nextBtn.setAttribute("aria-disabled", String(missing > 0 || needWatch));
    watch.classList.toggle("done", meta.fullyWatched);
    watch.innerHTML = meta.fullyWatched ? `${I.check} Watched` : `${I.eye} Watch the full clip`;
    if (missing) hint.textContent = `Answer ${missing === exp.questions.length ? "all " : ""}${missing} ${missing === exp.questions.length ? "" : "more "}question${missing > 1 ? "s" : ""} to continue.`;
    else if (needWatch) hint.textContent = "Please watch the whole clip at least once to continue.";
    else hint.textContent = "";
  }
  updateNav();

  const leave = () => {
    meta.timeMs += Math.round(performance.now() - t0);
    meta.watchedSec = Math.round(meta.watchedSec * 10) / 10;
  };
  nextBtn.addEventListener("click", () => {
    if (nextBtn.getAttribute("aria-disabled") === "true") {
      const miss = missingQs();
      miss.forEach((q) => app.querySelector(`.q[data-qid="${CSS.escape(q.id)}"]`)?.classList.add("missing"));
      if (miss.length) app.querySelector(`.q[data-qid="${CSS.escape(miss[0].id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      else video.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    leave();
    if (isLast && !state.finishedAt) state.finishedAt = new Date().toISOString();
    go(1);
  });
  document.getElementById("back").addEventListener("click", () => { leave(); go(-1); });

  cleanup = () => {
    cancelAnimationFrame(raf);
    clearTimeout(loadingTimer);
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
}

function preloadNext() {
  const next = steps.slice(state.step + 1).find((s) => s.type === "trial");
  let el = document.getElementById("preload");
  if (!next) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("video");
    el.id = "preload";
    el.muted = true;
    el.preload = "auto";
    el.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  const src = encodePath(next.trial.src);
  if (el.getAttribute("src") !== src) el.setAttribute("src", src);
}

/* ───────────────────────── Finish & submit ───────────────────────── */
function buildPayload() {
  const trials = steps.filter((s) => s.type === "trial").map((s) => {
    const t = s.trial;
    const a = state.answers[t.id] || {};
    const m = state.meta[t.id] || {};
    const answers = {};
    const chosen = {};
    const chosenType = {};
    for (const q of s.exp.questions) {
      const v = a[q.id] ?? null;
      answers[q.id] = v;
      chosen[q.id] = v === "left" ? t.left : v === "right" ? t.right : v;
      chosenType[q.id] = v === "left" ? t.leftType : v === "right" ? t.rightType : v;
    }
    const actionKey = actionKeyOf(t);
    const actionExps = state.assignment?.actionExps?.[actionKey] || s.exp.key;
    return {
      // `exp` is the experiment this clip was shown in. For actions that exist in
      // several experiments, `actionExps` lists them all (e.g. "ABC") and
      // `sharedAction` is true: this participant saw the action ONLY in `exp`.
      exp: s.exp.key, position: s.pos, globalIndex: s.g,
      actionKey, actionExps, sharedAction: actionExps.length > 1,
      trialId: t.id, src: t.src, promptId: t.promptId, prompt: t.prompt, seed: t.seed, k: t.k,
      left: t.left, right: t.right, leftType: t.leftType, rightType: t.rightType,
      answers, chosen, chosenType,
      timeMs: m.timeMs || 0, watchedSec: Math.round((m.watchedSec || 0) * 10) / 10,
      fullyWatched: !!m.fullyWatched, usedSlowMo: !!m.usedSlowMo, visits: m.visits || 0,
    };
  });
  const finishedAt = state.finishedAt || new Date().toISOString();
  return {
    participantId: state.participantId,
    studyVersion: state.studyVersion,
    isTest: !!state.isTest,
    startedAt: state.startedAt,
    consentAt: state.consentAt || null,
    finishedAt,
    durationSec: Math.round((Date.parse(finishedAt) - Date.parse(state.startedAt)) / 1000),
    urlParams: state.urlParams || {},
    profile: state.profile || {},
    feedback: (state.feedback || "").slice(0, 4000),
    client: {
      userAgent: navigator.userAgent.slice(0, 300),
      language: navigator.language || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      screen: `${screen.width}x${screen.height}`,
      viewport: `${innerWidth}x${innerHeight}`,
      dpr: window.devicePixelRatio || 1,
    },
    assignment: state.assignment || null,
    questions: Object.fromEntries(exps.map((e) => [e.key, e.questions.map((q) => ({ id: q.id, text: q.text }))])),
    order: Object.fromEntries(exps.map((e) => [e.key, state.order[e.key] || []])),
    manifestGenerated: manifest.generated || null,
    trials,
  };
}

function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function renderFinish() {
  mount(`<section class="card narrow"><div class="finish">
    <div class="big-icon">${I.flag}</div>
    <h1>Almost done!</h1>
    <p class="lead">You've compared all ${totalTrials} pairs. Thank you! Press the button below to send your answers.</p>
    <div class="feedback">
      <label for="fb">Anything you'd like to tell us? <small>(optional)</small></label>
      <textarea id="fb" maxlength="4000" placeholder="Things you noticed, found confusing, or any other comments…">${esc(state.feedback)}</textarea>
    </div>
    <div class="center-row">
      <button class="btn ghost" id="back">${I.left} Back</button>
      <button class="btn primary lg" id="submit">Submit my responses ${I.check}</button>
    </div>
    <p class="status-line" id="status" role="status"></p>
    <div class="center-row" id="backup" hidden>
      <button class="btn ghost small" id="dl">${I.download} Download a backup of my answers</button>
    </div>
  </div></section>`);

  const fb = document.getElementById("fb");
  const btn = document.getElementById("submit");
  const status = document.getElementById("status");
  const backup = document.getElementById("backup");
  fb.addEventListener("input", () => { state.feedback = fb.value; save(); });
  document.getElementById("back").addEventListener("click", () => go(-1));
  document.getElementById("dl").addEventListener("click", () => downloadJson(buildPayload(), `responses-${state.participantId}.json`));

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    status.className = "status-line";
    status.textContent = "Sending your responses…";
    state.feedback = fb.value.trim();
    state.submitAttempts = (state.submitAttempts || 0) + 1;
    save();
    const payload = buildPayload();

    if (!firebaseConfigured) {
      downloadJson(payload, `responses-${state.participantId}.json`);
      state.submitted = true;
      state.submittedVia = "download";
      save();
      return renderDone();
    }

    let slowTimer = 0;
    try {
      slowTimer = setTimeout(() => {
        status.textContent = "Still sending… please keep this tab open and check your internet connection.";
        backup.hidden = false;
      }, 12000);
      const { db, fs } = await getFirestoreKit();
      await fs.setDoc(fs.doc(db, STUDY.collection, state.participantId), { ...payload, submittedAt: fs.serverTimestamp() });
      clearTimeout(slowTimer);
      state.submitted = true;
      state.submittedVia = "firebase";
      save();
      renderDone();
    } catch (err) {
      clearTimeout(slowTimer);
      console.error(err);
      // A repeat attempt that is refused usually means the first attempt already went through.
      if (err?.code === "permission-denied" && state.submitAttempts > 1) {
        state.submitted = true;
        state.submittedVia = "firebase (already saved)";
        save();
        return renderDone();
      }
      btn.disabled = false;
      btn.innerHTML = `Try again ${I.restart}`;
      status.className = "status-line err";
      status.textContent = `We couldn't save your responses (${err?.code || err?.message || "network error"}). Please try again${STUDY.contactEmail ? `, or download a backup and email it to ${STUDY.contactEmail}` : ", or download a backup file"}.`;
      backup.hidden = false;
    }
  });
}

function renderDone() {
  const preview = state?.submittedVia === "download";
  mount(`<section class="card narrow"><div class="finish">
    <div class="big-icon ok">${I.bigCheck}</div>
    <h1>Thank you!</h1>
    <p class="lead">${preview
      ? "Preview mode: Firebase isn't configured yet, so your answers were downloaded as a JSON file."
      : "Your responses have been recorded. We really appreciate your help. You can now close this tab."}</p>
    ${STUDY.completionUrl ? `<div class="center-row"><a class="btn primary lg" href="${esc(STUDY.completionUrl)}">Return to complete ${I.right}</a></div>` : ""}
    ${state?.isTest || isTestLink ? `<div class="center-row"><a class="btn ghost small" href="?reset=1&test=1">Start another test run</a></div>` : ""}
  </div></section>`);
  document.getElementById("preload")?.remove();
}

boot();
