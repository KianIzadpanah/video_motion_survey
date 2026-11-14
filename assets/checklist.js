// Action-coverage checklist (compound prompts only). Shared by the study page and the dashboard.
import { STUDY } from "../config.js";

export const SIDES = ["left", "right"];

// Yes = 1, Partly = 0.5, No = 0. "Cannot judge" is left out of the score.
export const CL_SCORE = { yes: 1, partly: 0.5, no: 0 };

// Rows for one clip: one per action (ids a1, a2, …), then the relation row (id "rel").
export function checklistItems(cl) {
  if (!cl?.actions?.length) return [];
  return [
    ...cl.actions.map((text, i) => ({ id: `a${i + 1}`, kind: "action", text })),
    { id: "rel", kind: "relation", text: cl.relationText || STUDY.checklist.relation[cl.relation] || "" },
  ];
}

// Mean score over the given rows, ignoring unanswered and "Cannot judge". null if nothing to score.
export function checklistScore(items, answers) {
  const xs = items.map((it) => CL_SCORE[answers?.[it.id]]).filter((v) => v != null);
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : null;
}
