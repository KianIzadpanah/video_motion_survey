# Video Motion Survey

A static user-study website (GitHub Pages) that stores responses in Firebase Firestore (free tier).

- **Participants:** `https://kianizadpanah.github.io/video_motion_survey/`
- **Your dashboard:** `https://kianizadpanah.github.io/video_motion_survey/admin.html`

Flow: one welcome page → Experiment A clips → B clips → C clips → optional comment → submit. There are no pages between experiments; the header of each clip shows which experiment it belongs to. Clip order is shuffled **within** each experiment.

### Questions
Every clip, in every experiment, asks the same three questions, each answered *Left / Right / About the same / Cannot judge*:

| id | question | hint shown |
|---|---|---|
| `match` | Which motion better matches the description? | Judge what the person does, not how smooth it looks. |
| `naturalness` | Which motion looks more like a real person moving? | Think of the overall impression: weight, balance and timing. |
| `artifacts` | Which motion has fewer visible errors? | Look for sliding feet, floating, shaking, impossible poses or sudden jumps. |

**Compound prompts only** (several actions in one sentence) add an **action-coverage checklist**: *"Does the person perform each part of the description?"* with one row per action plus a last row for how the actions relate ("The actions happen in the described order." / "…at the same time."). Each row is answered separately for the left and the right animation with *Yes / Partly / No / Cannot judge*. The rows come from [checklists.json](checklists.json); 14 of the 26 actions currently have one. Single-action prompts have no checklist.

### Each action is shown only once per participant
Some actions exist in several experiments (e.g. the volleyball spike is in A, B and C). Each participant sees every **action** in exactly **one** of those experiments. With the current 38 clips, that is 26 clips per person. "Same action" means the same prompt sentence, not the same ID, because IDs were reused (A141 is bowling in A/B but golf in C).

Which experiment a shared action goes to is set by a **rotation** number (0–5 at the moment), drawn at random per participant ([assets/plan.js](assets/plan.js)). Over one full cycle of rotations, every shared action is shown equally often in each of its experiments. Each participant's own clips are also spread across A, B and C rather than piling up in one.

Everything is saved with the response:

| field | where | meaning |
|---|---|---|
| `exp` | each trial | the experiment the clip was **shown in** (A/B/C) |
| `actionKey` | each trial | the action (prompt sentence as a slug) |
| `actionExps` | each trial | all experiments that contain this action, e.g. `ABC` |
| `sharedAction` | each trial | `true` if the action exists in more than one experiment |
| `trialId`, `src` | each trial | the exact video file shown |
| `assignment.rotation` | response | the participant's rotation |
| `assignment.byAction` | response | shared action → experiment it was shown in |
| `assignment.hidden` | response | the clips this participant did **not** see |

The dashboard has a **Shared actions** table showing, for every shared action, how many participants saw it in A, B and C. Use it to check that the arms stay balanced.

```
index.html          participant site
admin.html          results dashboard (Google sign-in, CSV/JSON export, delete)
config.js           ← edit: Firebase keys, wording, questions, checklist wording
checklists.json     ← edit: action rows for each compound prompt
firestore.rules     ← paste into Firebase (security rules)
prepare_videos.py   ← run after adding videos: trims + converts to browser-safe format
build_manifest.py   ← then run this: rebuilds the clip list
manifest.json       generated list of clips (do not edit by hand)
prompts.json        full prompt text per ID (filenames truncate long prompts)
exp A/ exp B/ exp C/  videos
assets/             code and styles
```

---

## 1. Set up Firebase (about 10 minutes, free, no credit card)

### 1a. Create the project
1. Go to <https://console.firebase.google.com> and click **Create a project**.
2. Name it, e.g. `video-motion-survey`. Turn **Google Analytics off** (not needed). Click **Create project**.

### 1b. Register the website and copy its config
1. On the project home page, click the **Web** icon (`</>`), or *Add app → Web*.
2. Nickname: `survey`. Leave *Firebase Hosting* unticked. Click **Register app**.
3. You'll see `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`.
   Copy those six values into `FIREBASE_CONFIG` at the top of **`config.js`**.
   (You can find them again later: ⚙ *Project settings → General → Your apps*.)

> The `apiKey` is not a password. Every Firebase website exposes it, and access is controlled by the rules in step 1d. GitHub or Google may still email you a "secret detected" alert after you push it; that's expected for Firebase web keys. Optionally, in Google Cloud Console → *APIs & Services → Credentials*, you can restrict the key to the referrers `kianizadpanah.github.io/*` and `localhost/*`.

### 1c. Create the database
1. Left menu: **Build → Firestore Database** (in some console versions: *Databases & Storage → Firestore*). Click **Create database**.
2. If asked for an edition, choose **Standard**. Keep the default database ID.
3. **Location:** pick one close to your participants (e.g. `eur3` Europe or `nam5` US). This can't be changed later.
4. Choose **Start in production mode** → **Create**.

### 1d. Paste the security rules
1. In Firestore, open the **Rules** tab.
2. Delete what's there and paste the full contents of **`firestore.rules`**.
3. Replace `YOUR_EMAIL@gmail.com` with the Google account you'll use for the dashboard.
   You can list several: `['you@gmail.com', 'coauthor@gmail.com']`.
4. Click **Publish**.

What the rules allow: anyone can **submit one** response, and nobody can read, edit or delete responses except the emails you listed.

### 1e. Turn on Google sign-in (for the dashboard only)
1. Left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Google** → **Enable** → choose a support email → **Save**.
3. **Settings** tab → **Authorized domains** → **Add domain** → `kianizadpanah.github.io`.
   (`localhost` is already allowed, so the dashboard also works locally.)

---

## 2. Test locally (optional but recommended)

From this folder:

```bash
python -m http.server 8000
```

- Study: <http://localhost:8000/?test=1>
- Dashboard: <http://localhost:8000/admin.html>. Use `?demo=1` to preview it with made-up data.

Opening `index.html` by double-clicking won't work, because browsers block loading `manifest.json` from `file://`.

Until `config.js` has real Firebase values, the site runs in **preview mode**: everything works, but on submit the answers are downloaded as a JSON file instead of saved.

---

## 3. Publish on GitHub Pages

1. On GitHub, create a **public** repository named **`video_motion_survey`**. Pages on private repos needs a paid plan.
2. Upload this folder. From a terminal in this folder:
   ```bash
   git init
   git add .
   git commit -m "User study site"
   git branch -M main
   git remote add origin https://github.com/kianizadpanah/video_motion_survey.git
   git push -u origin main
   ```
   Or use GitHub's **Add file → Upload files** and drag in the whole folder contents.
   **Don't use Git LFS** for the videos; GitHub Pages can't serve LFS files.
3. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then **Branch: `main` / `(root)`** → **Save**.
4. After 1–2 minutes the site is live at `https://kianizadpanah.github.io/video_motion_survey/`.

The design mock-ups (`exp_A.png`, …) are excluded by `.gitignore`, so they won't become public.

### Do a live test before sharing
1. Open `…/video_motion_survey/?test=1` and complete the study.
2. Open `…/video_motion_survey/admin.html`, sign in, and you should see 1 response tagged **test**.
3. Delete it with the **Delete** button (or keep "Exclude test runs" ticked).

Then send participants the plain link, **without** `?test=1`.

---

## 4. Managing responses

**Dashboard (`admin.html`)**:
- headline numbers;
- per-experiment / per-question bars showing how often the **video model** vs the **motion model** was preferred (plus "same" and "cannot judge");
- a table view and a participant list with comments;
- an **Action coverage** section: Yes/Partly/No bars per experiment for video vs motion models (actions and order/timing separately), and a per-method table with the **score** (Yes = 1, Partly = ½, No = 0, averaged, "Cannot judge" left out), i.e. the share of requested actions each method performs;
- **Download CSV**: one row per participant × clip × question;
- **Checklist CSV**: one row per participant × compound clip × checklist row × side (columns `itemId` `a1`, `a2`, … or `rel`, `itemKind` action/relation, `itemText`, `side`, `method`, `methodType`, `answer`, `score`);
- **Download JSON**: the raw documents.

Main CSV columns:

| column | meaning |
|---|---|
| `participantId` | random anonymous ID |
| `exp`, `position` | experiment (A/B/C) the clip was shown in, and its position in that participant's shuffled order |
| `rotation`, `actionKey`, `actionExps`, `sharedAction` | which arm of the one-experiment-per-action assignment this rating belongs to (see top of this file) |
| `trialId`, `src` | the exact video file |
| `promptId`, `prompt`, `seed`, `k` | which clip |
| `left`, `right`, `leftType`, `rightType` | methods shown on each side (`video` / `motion`) |
| `questionId` | `match`, `naturalness`, `artifacts` (v2 responses used `realism`, `smoothness`, `sequence`) |
| `answer` | `left` / `right` / `same` / `cannot` |
| `chosenMethod`, `chosenType` | the answer translated to the method / category |
| `trialTimeMs`, `watchedSec`, `fullyWatched`, `usedSlowMo` | engagement checks |
| `isTest`, `experience`, `durationSec`, `urlParams`, `feedback` | participant-level info |

You can also browse the raw documents in Firebase console → Firestore → **Data**.

**Free-tier limits (Spark plan):** 1 GiB storage, 20,000 writes/day, 50,000 reads/day. Each participant is **1 write** (~20 KB). Each dashboard load reads every response once, so even hundreds of participants are far below the limits.

---

## 5. Changing the study

- **Wording, questions, titles, consent text:** edit `config.js`.
  If you change things after launching, also bump `studyVersion` (currently `"v3"`) so responses can be told apart. The dashboard's **Study version** menu shows the current version by default; choose another version or "All versions" to see older responses.
- **Adding or replacing videos:** put them in `exp A` / `exp B` / `exp C` using the usual naming, e.g.
  `A344_a_person_..._s1234__left-LTX_GVHMR__right-Kimodo.mp4` or `A140_..._H3_s43_LEFT-Kimodo__RIGHT_video_H3.mp4`. Then run
  ```bash
  python prepare_videos.py   # trims (see TRIMS in the file) + converts 10-bit videos to browser-safe 8-bit
  python build_manifest.py   # rebuilds the clip list
  ```
  and commit/push. `prepare_videos.py` keeps untouched originals in `_originals/` (not uploaded). To trim a clip, add it to `TRIMS` and run it again; it always cuts from the original.
  `build_manifest.py` prints every clip with its length and flags prompts it can't verify. If a filename's prompt is cut off (50+ characters), add the full sentence to `prompts.json`.
- **Checklist rows:** edit `checklists.json` (key = the full prompt sentence as shown on the site, `relation` = `order` or `simultaneous`, `actions` = the rows, each written to follow "Does the person …"). Remove an entry to drop the checklist for that prompt. Then run `python build_manifest.py`; it prints which clips got a checklist and warns about entries that match no clip.
- **New method names:** add them to `METHOD_TYPES` in `build_manifest.py` so they're labelled `video` or `motion`.
- **Reference keyframes (optional):** put an image with the same name as a video next to it (`<video name>.png`). It then appears as a "Reference keyframes" strip above that clip.
- **Recruiting platforms:** any URL parameters are saved with the response (e.g. Prolific's `?PROLIFIC_PID=...`). Put a completion link in `completionUrl` to show it at the end.

**Handy URL options (your own testing only):**
- `?test=1`: marks the response as a test.
- `?reset=1`: clears saved progress in your browser.
- `?test=1&jump=5`: jumps straight to clip 6 (counting from 0).
- `?rotation=3`: forces rotation 3 instead of a random one. It's recorded as `assignment.forced = true`. You could also hand out a fixed link per rotation if you want exactly balanced groups.

---

## Notes

- Each clip must be watched almost fully once (90%) before **Next** unlocks. Set `requireFullView: false` in `config.js` to disable this.
- Progress is saved in the participant's browser, so a reload resumes where they left off. A participant who already submitted sees the thank-you page again rather than a second survey.
- Blinding: participants never see method names. Right-click and download are disabled on the videos. However, the method names are in the video **filenames** (and `manifest.json`), which a technically curious participant could find in the page source. If you need strict blinding, rename the files to neutral IDs before publishing.
