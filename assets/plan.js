// Decides which clips one participant sees.
//
// Rule: every ACTION (identified by its prompt sentence, not its ID - IDs were
// reused for different sentences) is shown to a participant in only ONE
// experiment. Actions that exist in a single experiment are always shown.
// Actions that exist in several experiments (e.g. volleyball in A, B and C)
// are assigned to exactly one of them per participant.
//
// Assignment is a balanced rotation: shared actions are sorted by key and the
// j-th one goes to experiment L[(rotation + j) % L.length], where L is the list
// of experiments that contain it. Over one full cycle of rotations every
// action is shown equally often in each of its experiments, and within a
// participant the shared actions are spread across experiments instead of
// piling up in one. The rotation is drawn at random per participant (or forced
// with ?rotation=N) and saved with the response.

export const PLAN_SCHEME = "one-experiment-per-action/rotation-v1";

export function slugify(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function actionKeyOf(trial) {
  return trial.actionKey || slugify(trial.prompt);
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);

/** Groups every clip in the manifest by action, for the given experiment keys (in study order). */
export function actionGroups(manifest, expKeys) {
  const groups = new Map();
  for (const exp of expKeys) {
    for (const t of manifest.experiments?.[exp]?.trials || []) {
      const key = actionKeyOf(t);
      if (!groups.has(key)) groups.set(key, { key, prompt: t.prompt, exps: [], trials: [] });
      const g = groups.get(key);
      if (!g.exps.includes(exp)) g.exps.push(exp);
      g.trials.push({ exp, trial: t });
    }
  }
  for (const g of groups.values()) g.exps.sort((a, b) => expKeys.indexOf(a) - expKeys.indexOf(b));
  const shared = [...groups.values()].filter((g) => g.exps.length > 1).sort((a, b) => a.key.localeCompare(b.key));
  const cycle = shared.reduce((c, g) => lcm(c, g.exps.length), 1);
  return { groups, shared, cycle };
}

/**
 * Builds one participant's plan.
 * Returns { scheme, rotation, cycle, byAction, actionExps, selected: {A: [trial...]}, hidden: [trialId...] }
 */
export function makePlan(manifest, expKeys, rotation) {
  const { groups, shared, cycle } = actionGroups(manifest, expKeys);
  const r = ((Number(rotation) % cycle) + cycle) % cycle;

  const byAction = {};
  shared.forEach((g, j) => { byAction[g.key] = g.exps[(r + j) % g.exps.length]; });

  const actionExps = {};
  for (const g of groups.values()) actionExps[g.key] = g.exps.join("");

  const selected = Object.fromEntries(expKeys.map((k) => [k, []]));
  const hidden = [];
  for (const g of groups.values()) {
    const chosen = byAction[g.key] || g.exps[0];
    for (const { exp, trial } of g.trials) {
      if (exp === chosen) selected[exp].push(trial);
      else hidden.push(trial.id);
    }
  }
  // keep manifest order inside each experiment (the app shuffles afterwards)
  for (const k of expKeys) {
    const order = (manifest.experiments?.[k]?.trials || []).map((t) => t.id);
    selected[k].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return { scheme: PLAN_SCHEME, rotation: r, cycle, byAction, actionExps, selected, hidden };
}
