import { STUDY } from "../config.js";
import { firebaseConfigured, getFirestoreKit, getAuthKit } from "./firebase.js";
import { makePlan, actionGroups, actionKeyOf } from "./plan.js";

const root = document.getElementById("admin");
const tip = document.getElementById("tip");
const params = new URLSearchParams(location.search);
const DEMO = params.has("demo");

const CATS = [
  { key: "video", label: "Video model", color: "var(--c-video)" },
  { key: "motion", label: "Motion model", color: "var(--c-motion)" },
  { key: "same", label: "About the same", color: "var(--c-same)" },
  { key: "cannot", label: "Cannot judge", color: "var(--c-cannot)" },
];

let docs = [];
let user = null;
let excludeTests = true;
let versionFilter = STUDY.studyVersion; // or "all"
let manifestCache = null;

async function getManifest() {
  if (!manifestCache) {
    try { manifestCache = await (await fetch("manifest.json", { cache: "no-cache" })).json(); } catch { manifestCache = { experiments: {} }; }
  }
  return manifestCache;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const logo = `<div class="logo"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></div>`;

function toDate(v) {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return null;
}
const fmtDate = (d) => (d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "–");
const fmtMin = (sec) => (Number.isFinite(sec) ? `${(sec / 60).toFixed(1)} min` : "–");
const median = (xs) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/* ───────────────────────── Shell ───────────────────────── */
function shell(body, whoHtml = "") {
  root.innerHTML = `
    <header class="head">
      ${logo}
      <div class="head-divider"></div>
      <div class="head-text"><h1>Responses dashboard</h1><p class="sub">${esc(STUDY.title)} · ${esc(STUDY.studyVersion)}${DEMO ? " · demo data" : ""}</p></div>
      <div class="who">${whoHtml}</div>
    </header>
    <div id="body">${body}</div>`;
}

function signedInWho() {
  if (DEMO) return `<span class="chip">Demo mode</span>`;
  return `<span class="chip ghost">${esc(user?.email || "")}</span><button class="btn ghost small" id="signout">Sign out</button>`;
}

/* ───────────────────────── Boot ───────────────────────── */
async function boot() {
  if (DEMO) {
    docs = await demoDocs();
    return renderData();
  }
  if (!firebaseConfigured) {
    shell(`<div class="msg"><p><strong>Firebase isn't configured yet.</strong> Paste your Firebase config into <code>config.js</code> (see README.md).</p>
      <p>Want to see what this page looks like? Open <a href="?demo=1">admin.html?demo=1</a> for a preview with made-up data.</p></div>`);
    return;
  }
  shell(`<div class="loading-card"><div class="spinner"></div></div>`);
  try {
    const { auth, au } = await getAuthKit();
    au.onAuthStateChanged(auth, (u) => {
      user = u;
      if (u) load();
      else renderSignIn();
    });
  } catch (err) {
    console.error(err);
    shell(`<div class="msg err"><p><strong>Couldn't load Firebase.</strong> ${esc(err.message)}</p></div>`);
  }
}

function renderSignIn(errorText = "") {
  shell(`<div class="signin">
    <h2>Sign in to see responses</h2>
    <p>Only the Google account(s) listed in your Firestore rules can read the data. Participants can submit answers but never read them.</p>
    <button class="btn primary lg" id="signin">
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
      Sign in with Google</button>
    ${errorText ? `<p class="status-line err">${esc(errorText)}</p>` : ""}
  </div>`);
  document.getElementById("signin").addEventListener("click", async () => {
    try {
      const { auth, au } = await getAuthKit();
      await au.signInWithPopup(auth, new au.GoogleAuthProvider());
    } catch (err) {
      console.error(err);
      const hint = err.code === "auth/unauthorized-domain"
        ? "This domain isn't authorized. Add it in Firebase → Authentication → Settings → Authorized domains."
        : err.code === "auth/operation-not-allowed"
          ? "Google sign-in isn't enabled. Turn it on in Firebase → Authentication → Sign-in method."
          : err.code === "auth/popup-blocked" ? "Your browser blocked the sign-in popup. Allow popups for this site and try again."
            : `${err.code || ""} ${err.message || ""}`;
      renderSignIn(hint);
    }
  });
}

async function load() {
  shell(`<div class="loading-card"><div class="spinner"></div></div>`, signedInWho());
  bindSignOut();
  try {
    const { db, fs } = await getFirestoreKit();
    const snap = await fs.getDocs(fs.collection(db, STUDY.collection));
    docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (toDate(b.submittedAt)?.getTime() || 0) - (toDate(a.submittedAt)?.getTime() || 0));
    renderData();
  } catch (err) {
    console.error(err);
    const denied = err.code === "permission-denied";
    shell(`<div class="msg err">
      <p><strong>${denied ? "This account isn't allowed to read responses." : "Couldn't load responses."}</strong></p>
      <p>${denied
        ? `You're signed in as <strong>${esc(user?.email)}</strong>. Add this exact email to <code>isAdmin()</code> in your Firestore rules (Firebase console → Firestore Database → Rules) and press Publish.`
        : esc(`${err.code || ""} ${err.message || ""}`)}</p></div>`, signedInWho());
    bindSignOut();
  }
}

function bindSignOut() {
  document.getElementById("signout")?.addEventListener("click", async () => {
    const { auth, au } = await getAuthKit();
    await au.signOut(auth);
  });
}

/* ───────────────────────── Aggregation ───────────────────────── */
function included() {
  return docs.filter((d) => !(excludeTests && d.isTest) && (versionFilter === "all" || d.studyVersion === versionFilter));
}

// For every action that exists in several experiments: how often it was rated in each one.
function coverage(list, manifest) {
  const keys = STUDY.experiments.map((e) => e.key);
  const { shared } = actionGroups(manifest, keys);
  const rows = new Map(shared.map((g) => [g.key, { prompt: g.prompt, exps: g.exps.join(""), counts: {} }]));
  const rotations = {};
  for (const d of list) {
    const r = d.assignment?.rotation;
    rotations[r ?? "none"] = (rotations[r ?? "none"] || 0) + 1;
    for (const t of d.trials || []) {
      const key = t.actionKey || actionKeyOf(t);
      if (!rows.has(key)) {
        if (!(t.actionExps && t.actionExps.length > 1)) continue;
        rows.set(key, { prompt: t.prompt, exps: t.actionExps, counts: {} });
      }
      const row = rows.get(key);
      row.counts[t.exp] = (row.counts[t.exp] || 0) + 1;
    }
  }
  return { rows: [...rows.values()].sort((a, b) => a.prompt.localeCompare(b.prompt)), rotations };
}

function aggregate(list) {
  // exp -> qid -> {video, motion, same, cannot, other, n}
  const out = {};
  const pairs = {};
  for (const d of list) {
    for (const t of d.trials || []) {
      const e = (out[t.exp] ||= {});
      (pairs[t.exp] ||= new Set()).add([`${t.left} (${t.leftType})`, `${t.right} (${t.rightType})`].sort().join(" vs "));
      for (const [qid, val] of Object.entries(t.chosenType || {})) {
        if (val == null) continue;
        const c = (e[qid] ||= { video: 0, motion: 0, same: 0, cannot: 0, other: 0, n: 0 });
        if (val in c && val !== "n") c[val]++;
        else c.other++;
        c.n++;
      }
    }
  }
  return { out, pairs };
}

/* ───────────────────────── Data view ───────────────────────── */
async function renderData() {
  const list = included();
  const manifest = await getManifest();
  const cov = coverage(list, manifest);
  const versions = [...new Set(docs.map((d) => d.studyVersion).filter(Boolean))].sort();
  if (!versions.includes(STUDY.studyVersion)) versions.push(STUDY.studyVersion);
  const tests = docs.filter((d) => d.isTest && (versionFilter === "all" || d.studyVersion === versionFilter)).length;
  const durations = list.map((d) => d.durationSec);
  const latest = list.length ? toDate(list[0].submittedAt) : null;
  const { out, pairs } = aggregate(list);

  const expBlocks = STUDY.experiments.map((exp) => {
    const qs = exp.questions.map((q, i) => {
      const c = out[exp.key]?.[q.id] || { video: 0, motion: 0, same: 0, cannot: 0, other: 0, n: 0 };
      const segs = CATS.filter((k) => c[k.key] > 0).map((k) =>
        `<div class="seg" style="flex:${c[k.key]};background:${k.color}" data-tip="<b>${esc(k.label)}</b><br>${c[k.key]} of ${c.n} answers (${pct(c[k.key], c.n)}%)"></div>`).join("");
      return `<div class="qrow">
        <div class="qrow-top"><span class="qrow-text">Q${i + 1}. ${esc(q.text)}</span><span class="qrow-n">n = ${c.n}</span></div>
        <div class="qrow-bar">
          <div class="bar ${c.n ? "" : "empty"}" role="img" aria-label="${esc(`Q${i + 1}: video ${pct(c.video, c.n)}%, motion ${pct(c.motion, c.n)}%, same ${pct(c.same, c.n)}%, cannot judge ${pct(c.cannot, c.n)}%`)}">${segs}</div>
          <span class="qrow-sum">Video <b>${pct(c.video, c.n)}%</b> · Motion <b>${pct(c.motion, c.n)}%</b></span>
        </div>
      </div>`;
    }).join("");
    const pairText = pairs[exp.key] ? [...pairs[exp.key]].join(" · ") : "no answers yet";
    return `<div class="exp-block"><h3>${esc(exp.title)}</h3><p class="pairs">${esc(pairText)}</p>${qs}</div>`;
  }).join("");

  const tableRows = STUDY.experiments.flatMap((exp) => exp.questions.map((q, i) => {
    const c = out[exp.key]?.[q.id] || { video: 0, motion: 0, same: 0, cannot: 0, n: 0 };
    const cell = (k) => `<td class="num">${c[k]} <span style="color:var(--muted)">(${pct(c[k], c.n)}%)</span></td>`;
    return `<tr><td>${esc(exp.key)}</td><td>Q${i + 1}. ${esc(q.text)}</td><td class="num">${c.n}</td>${cell("video")}${cell("motion")}${cell("same")}${cell("cannot")}</tr>`;
  })).join("");

  const covRows = cov.rows.map((r) => `<tr>
      <td>${esc(r.prompt)}</td><td>${esc(r.exps)}</td>
      ${STUDY.experiments.map((e) => `<td class="num">${r.exps.includes(e.key) ? (r.counts[e.key] || 0) : `<span style="color:var(--muted)">–</span>`}</td>`).join("")}
    </tr>`).join("");
  const rotText = Object.entries(cov.rotations).sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
    .map(([r, n]) => `${r === "none" ? "no rotation (older version)" : `rotation ${esc(r)}`}: ${n}`).join(" · ") || "no responses yet";

  const people = list.map((d) => `<tr>
      <td>${esc(fmtDate(toDate(d.submittedAt)))}</td>
      <td class="mono">${esc(String(d.participantId || d.id).slice(0, 8))}</td>
      <td class="num">${d.assignment ? esc(d.assignment.rotation) : "–"}</td>
      <td class="num">${esc(fmtMin(d.durationSec))}</td>
      <td>${esc(d.profile?.experience || "–")}</td>
      <td class="num">${(d.trials || []).length}</td>
      <td>${d.isTest ? `<span class="tag">test</span>` : ""}</td>
      <td class="cm">${esc(d.feedback || "")}</td>
      <td>${DEMO ? "" : `<button class="btn danger small" data-del="${esc(d.id)}">Delete</button>`}</td>
    </tr>`).join("");

  shell(`
    <div class="toolbar">
      <label class="toggle"><input type="checkbox" id="excl" ${excludeTests ? "checked" : ""}> Exclude test runs (${tests})</label>
      <label class="toggle">Study version
        <select id="ver" class="select">
          ${versions.map((v) => `<option value="${esc(v)}" ${versionFilter === v ? "selected" : ""}>${esc(v)}${v === STUDY.studyVersion ? " (current)" : ""}</option>`).join("")}
          <option value="all" ${versionFilter === "all" ? "selected" : ""}>All versions</option>
        </select></label>
      <span class="spacer"></span>
      ${DEMO ? "" : `<button class="btn ghost small" id="refresh">Refresh</button>`}
      <button class="btn ghost small" id="csv">Download CSV</button>
      <button class="btn primary small" id="json">Download JSON</button>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="k-label">Responses</div><div class="k-value">${list.length}</div><div class="k-sub">${excludeTests ? "excluding" : "including"} test runs</div></div>
      <div class="kpi"><div class="k-label">Median completion time</div><div class="k-value">${Number.isFinite(median(durations)) ? (median(durations) / 60).toFixed(1) : "–"}</div><div class="k-sub">minutes</div></div>
      <div class="kpi"><div class="k-label">Latest submission</div><div class="k-value" style="font-size:20px;padding-top:8px">${esc(fmtDate(latest))}</div></div>
      <div class="kpi"><div class="k-label">Answers recorded</div><div class="k-value">${list.reduce((n, d) => n + (d.trials || []).length, 0)}</div><div class="k-sub">clip comparisons</div></div>
    </div>

    <h2 class="section-title">Which system did people prefer?</h2>
    <div class="legend">${CATS.map((k) => `<span><i style="background:${k.color}"></i>${esc(k.label)}</span>`).join("")}</div>
    ${expBlocks}

    <h2 class="section-title">Table view</h2>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Exp</th><th>Question</th><th class="num">Answers</th>
        ${CATS.map((k) => `<th class="num"><span class="swatch" style="background:${k.color}"></span>${esc(k.label)}</th>`).join("")}</tr></thead>
      <tbody>${tableRows}</tbody></table></div>

    <h2 class="section-title">Shared actions: where each was shown</h2>
    <p style="color:var(--ink-2);font-size:14.5px;margin:-4px 0 12px">Each participant sees every action in only one experiment.
      Counts are how many participants saw the action in that experiment (– = the action doesn't exist there).
      Participants per rotation: ${rotText}.</p>
    ${cov.rows.length ? `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Action</th><th>In</th>${STUDY.experiments.map((e) => `<th class="num">Shown in ${esc(e.key)}</th>`).join("")}</tr></thead>
      <tbody>${covRows}</tbody></table></div>` : `<p style="color:var(--muted)">No actions are shared between experiments.</p>`}

    <h2 class="section-title">Participants</h2>
    ${people ? `<div class="tbl-wrap tall"><table class="tbl">
      <thead><tr><th>Submitted</th><th>ID</th><th class="num">Rotation</th><th class="num">Time</th><th>Experience</th><th class="num">Clips</th><th></th><th>Comment</th><th></th></tr></thead>
      <tbody>${people}</tbody></table></div>` : `<p style="color:var(--muted)">No responses yet.</p>`}
  `, signedInWho());

  bindSignOut();
  document.getElementById("excl").addEventListener("change", (e) => { excludeTests = e.target.checked; renderData(); });
  document.getElementById("ver").addEventListener("change", (e) => { versionFilter = e.target.value; renderData(); });
  document.getElementById("refresh")?.addEventListener("click", load);
  document.getElementById("csv").addEventListener("click", () => download(toCsv(included()), `responses_${stamp()}.csv`, "text/csv"));
  document.getElementById("json").addEventListener("click", () => download(JSON.stringify(included().map(serializable), null, 2), `responses_${stamp()}.json`, "application/json"));
  root.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => removeDoc(b.dataset.del)));
  bindTips();
}

async function removeDoc(id) {
  if (!confirm(`Delete response ${id.slice(0, 8)}…? This cannot be undone.`)) return;
  try {
    const { db, fs } = await getFirestoreKit();
    await fs.deleteDoc(fs.doc(db, STUDY.collection, id));
    docs = docs.filter((d) => d.id !== id);
    renderData();
  } catch (err) {
    alert(`Couldn't delete: ${err.code || err.message}`);
  }
}

/* ───────────────────────── Tooltips ───────────────────────── */
function bindTips() {
  root.querySelectorAll("[data-tip]").forEach((el) => {
    el.addEventListener("mouseenter", () => { tip.innerHTML = el.dataset.tip; tip.hidden = false; });
    el.addEventListener("mousemove", (e) => {
      const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
      tip.style.left = `${x}px`;
      tip.style.top = `${e.clientY + 16}px`;
    });
    el.addEventListener("mouseleave", () => { tip.hidden = true; });
  });
}

/* ───────────────────────── Export ───────────────────────── */
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

function serializable(d) {
  const sub = toDate(d.submittedAt);
  return { ...d, submittedAt: sub ? sub.toISOString() : null };
}

function toCsv(list) {
  const cols = [
    "participantId", "studyVersion", "isTest", "submittedAt", "startedAt", "durationSec", "experience",
    "rotation", "exp", "actionKey", "actionExps", "sharedAction",
    "position", "globalIndex", "trialId", "src", "promptId", "prompt", "seed", "k",
    "left", "right", "leftType", "rightType",
    "questionId", "question", "answer", "chosenMethod", "chosenType",
    "trialTimeMs", "watchedSec", "fullyWatched", "usedSlowMo", "urlParams", "feedback",
  ];
  const cell = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const qText = {};
  for (const e of STUDY.experiments) for (const q of e.questions) qText[`${e.key}:${q.id}`] = q.text;
  const rows = [cols.join(",")];
  for (const d of list) {
    const sub = toDate(d.submittedAt);
    for (const t of d.trials || []) {
      for (const [qid, ans] of Object.entries(t.answers || {})) {
        const r = {
          participantId: d.participantId || d.id, studyVersion: d.studyVersion, isTest: !!d.isTest,
          submittedAt: sub ? sub.toISOString() : "", startedAt: d.startedAt, durationSec: d.durationSec,
          experience: d.profile?.experience,
          rotation: d.assignment?.rotation,
          exp: t.exp, actionKey: t.actionKey || actionKeyOf(t), actionExps: t.actionExps || t.exp,
          sharedAction: !!(t.actionExps && t.actionExps.length > 1),
          position: t.position, globalIndex: t.globalIndex, trialId: t.trialId, src: t.src, promptId: t.promptId,
          prompt: t.prompt, seed: t.seed, k: t.k, left: t.left, right: t.right, leftType: t.leftType, rightType: t.rightType,
          questionId: qid,
          question: d.questions?.[t.exp]?.find((q) => q.id === qid)?.text || qText[`${t.exp}:${qid}`] || "",
          answer: ans, chosenMethod: t.chosen?.[qid], chosenType: t.chosenType?.[qid],
          trialTimeMs: t.timeMs, watchedSec: t.watchedSec, fullyWatched: t.fullyWatched, usedSlowMo: t.usedSlowMo,
          urlParams: d.urlParams && Object.keys(d.urlParams).length ? d.urlParams : "",
          feedback: d.feedback,
        };
        rows.push(cols.map((c) => cell(r[c])).join(","));
      }
    }
  }
  return "﻿" + rows.join("\r\n");
}

function download(text, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ───────────────────────── Demo data ───────────────────────── */
async function demoDocs() {
  const manifest = await getManifest();
  const keys = STUDY.experiments.map((e) => e.key);
  const { cycle } = makePlan(manifest, keys, 0);
  const pick = (w) => { let r = Math.random(), acc = 0; for (const [k, p] of w) { acc += p; if (r < acc) return k; } return w[w.length - 1][0]; };
  const out = [];
  for (let p = 0; p < 24; p++) {
    const plan = makePlan(manifest, keys, p % cycle);
    const trials = [];
    let g = 0;
    for (const exp of STUDY.experiments) {
      const list = plan.selected[exp.key] || [];
      list.forEach((t, i) => {
        const answers = {}, chosen = {}, chosenType = {};
        exp.questions.forEach((q, qi) => {
          const prefVideo = 0.45 + 0.1 * qi + (exp.key === "A" ? 0.05 : 0);
          const typ = pick([["video", prefVideo], ["motion", 0.85 - prefVideo], ["same", 0.1], ["cannot", 0.05]]);
          const side = typ === "video" ? (t.leftType === "video" ? "left" : "right") : typ === "motion" ? (t.leftType === "motion" ? "left" : "right") : typ;
          answers[q.id] = side;
          chosen[q.id] = side === "left" ? t.left : side === "right" ? t.right : side;
          chosenType[q.id] = typ;
        });
        const actionKey = actionKeyOf(t);
        trials.push({ exp: exp.key, actionKey, actionExps: plan.actionExps[actionKey], sharedAction: plan.actionExps[actionKey].length > 1,
          position: i + 1, globalIndex: ++g, trialId: t.id, src: t.src, promptId: t.promptId, prompt: t.prompt,
          seed: t.seed, k: t.k, left: t.left, right: t.right, leftType: t.leftType, rightType: t.rightType,
          answers, chosen, chosenType, timeMs: 20000 + Math.round(Math.random() * 30000), watchedSec: 12, fullyWatched: true, usedSlowMo: Math.random() < 0.3 });
      });
    }
    const dur = 600 + Math.round(Math.random() * 600);
    out.push({
      id: `demo${String(p).padStart(4, "0")}-0000-0000`, participantId: `demo${String(p).padStart(4, "0")}-0000-0000`,
      studyVersion: STUDY.studyVersion, isTest: p < 2, durationSec: dur,
      submittedAt: new Date(Date.now() - p * 3.6e6).toISOString(), startedAt: new Date(Date.now() - p * 3.6e6 - dur * 1000).toISOString(),
      profile: { experience: STUDY.experienceQuestion.options[p % 4] },
      assignment: { scheme: plan.scheme, rotation: plan.rotation, cycle: plan.cycle, forced: false,
        byAction: plan.byAction, actionExps: plan.actionExps, hidden: plan.hidden },
      feedback: p === 3 ? "Some clips were hard to judge on a small screen." : "",
      trials,
    });
  }
  return out;
}

boot();
