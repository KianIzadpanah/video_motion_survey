// ─────────────────────────────────────────────────────────────────────────────
//  Study configuration — the only file you normally need to edit.
// ─────────────────────────────────────────────────────────────────────────────

// 1) Paste the config object from Firebase here
//    (Firebase console → Project settings → Your apps → SDK setup and configuration → Config).
//    These values are NOT secret; access is controlled by firestore.rules.
//    While apiKey still starts with "PASTE", the site runs in preview mode and
//    responses are downloaded as a JSON file instead of saved.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAZrU5LMPyYztN2xv6BFN85JoeJ-kDV_9A",
  authDomain: "video-motion-survey.firebaseapp.com",
  projectId: "video-motion-survey",
  storageBucket: "video-motion-survey.firebasestorage.app",
  messagingSenderId: "611959649007",
  appId: "1:611959649007:web:54291c87bc9037e377a11a",
  measurementId: "G-X8M7S0KX6H"
};

// 2) Study settings and wording.
export const STUDY = {
  // Bump this (e.g. "v2") if you change the clips or questions after launching,
  // so new responses can be told apart from old ones.
  studyVersion: "v1",

  // Firestore collection that responses are written to.
  collection: "responses",

  title: "Which motion looks more human?",
  eyebrow: "Research study",

  // Participants must watch (almost) the whole clip once before "Next" unlocks.
  requireFullView: true,

  // Optional: shown on the error screen so people can email you a backup file.
  contactEmail: "",

  // Optional: redirect link shown at the very end (e.g. a Prolific completion URL).
  completionUrl: "",

  consentText:
    "I agree to take part in this study. I understand that my answers are anonymous and will be used for research purposes only.",

  // Optional background question on the welcome page.
  experienceQuestion: {
    text: "How familiar are you with 3D animation, video games, or motion capture?",
    options: ["Not at all", "A little", "Quite familiar", "Expert"],
  },

  // Answer options for every question.
  options: [
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
    { value: "same", label: "About the same" },
    { value: "cannot", label: "Cannot judge" },
  ],

  // Experiments are shown in THIS order; clips are shuffled within each one.
  // `key` must match a key in build_manifest.py (A, B, C).
  experiments: [
    {
      key: "A",
      title: "Experiment A — Range",
      subtitle: "Prompt-only motion generation",
      intro:
        "Each pair was created from the text description alone. Check whether the motion does what the sentence says, looks physically real, and moves smoothly.",
      questions: [
        { id: "match", text: "Which motion better matches the description?" },
        {
          id: "realism",
          text: "Which motion looks more like a real person moving?",
          hint: "Look for floating, shaking, stiff body parts, or impossible poses.",
        },
        { id: "smoothness", text: "Which motion is smoother and less like a robot?" },
      ],
    },
    {
      key: "B",
      title: "Experiment B — Video-to-Motion",
      subtitle: "Sparse keyframe-guided motion reconstruction",
      intro:
        "Same task, new clips. This time, also pay attention to whether the movements happen in a sensible order and whether the body parts work together.",
      questions: [
        { id: "match", text: "Which motion better matches the description?" },
        {
          id: "realism",
          text: "Which motion looks more like a real person moving?",
          hint: "Look for floating, shaking, stiff body parts, or impossible poses.",
        },
        { id: "sequence", text: "Which animation better preserves the intended sequence and coordination of movements?" },
      ],
    },
    {
      key: "C",
      title: "Experiment C — Motion-to-Video",
      subtitle: "Video generation conditioned on sparse motion keyframes",
      intro:
        "Last part! As before, compare the two animations and check that the order of the movements and the coordination between body parts make sense.",
      questions: [
        { id: "match", text: "Which motion better matches the description?" },
        {
          id: "realism",
          text: "Which motion looks more like a real person moving?",
          hint: "Look for floating, shaking, stiff body parts, or impossible poses.",
        },
        { id: "sequence", text: "Which animation better preserves the intended sequence and coordination of movements?" },
      ],
    },
  ],
};
