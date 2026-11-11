# Video Motion Survey

A static user-study website (GitHub Pages) that stores responses in Firebase Firestore (free tier).

- **Participants:** `https://kianizadpanah.github.io/video_motion_survey/`
- **Your dashboard:** `https://kianizadpanah.github.io/video_motion_survey/admin.html`

Flow: welcome page → Experiment A → B → C (clip order shuffled within each experiment) → optional comment → submit.

```
index.html          participant site
admin.html          results dashboard (Google sign-in, CSV/JSON export, delete)
config.js           ← edit: Firebase keys, wording, questions
firestore.rules     ← paste into Firebase (security rules)
build_manifest.py   ← run after adding/removing videos
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
- **Download CSV**: one row per participant × clip × question;
- **Download JSON**: the raw documents.

Main CSV columns:

| column | meaning |
|---|---|
| `participantId` | random anonymous ID |
| `exp`, `position` | experiment (A/B/C) and the clip's position in that participant's shuffled order |
| `promptId`, `prompt`, `seed`, `k` | which clip |
| `left`, `right`, `leftType`, `rightType` | methods shown on each side (`video` / `motion`) |
| `questionId` | `match`, `realism`, `smoothness` (A) or `sequence` (B, C) |
| `answer` | `left` / `right` / `same` / `cannot` |
| `chosenMethod`, `chosenType` | the answer translated to the method / category |
| `trialTimeMs`, `watchedSec`, `fullyWatched`, `usedSlowMo` | engagement checks |
| `isTest`, `experience`, `durationSec`, `urlParams`, `feedback` | participant-level info |

You can also browse the raw documents in Firebase console → Firestore → **Data**.

**Free-tier limits (Spark plan):** 1 GiB storage, 20,000 writes/day, 50,000 reads/day. Each participant is **1 write** (~20 KB). Each dashboard load reads every response once, so even hundreds of participants are far below the limits.

---

## 5. Changing the study

- **Wording, questions, titles, consent text:** edit `config.js`.
  If you change things after launching, also bump `studyVersion` (e.g. `"v2"`) so responses can be told apart.
- **Adding or replacing videos:** put them in `exp A` / `exp B` / `exp C` using the usual naming, e.g.
  `A344_a_person_..._s1234__left-LTX_GVHMR__right-Kimodo.mp4`. Then run
  ```bash
  python build_manifest.py
  ```
  and commit/push. The script prints every clip and flags prompt IDs missing from `prompts.json`; add the full sentence there, since filenames cut prompts at 50 characters.
- **New method names:** add them to `METHOD_TYPES` in `build_manifest.py` so they're labelled `video` or `motion`.
- **Reference keyframes (optional):** put an image with the same name as a video next to it (`<video name>.png`). It then appears as a "Reference keyframes" strip above that clip.
- **Recruiting platforms:** any URL parameters are saved with the response (e.g. Prolific's `?PROLIFIC_PID=...`). Put a completion link in `completionUrl` to show it at the end.

**Handy URL options (your own testing only):**
- `?test=1`: marks the response as a test.
- `?reset=1`: clears saved progress in your browser.
- `?test=1&jump=5`: jumps straight to step 5.

---

## Notes

- Each clip must be watched almost fully once (90%) before **Next** unlocks. Set `requireFullView: false` in `config.js` to disable this.
- Progress is saved in the participant's browser, so a reload resumes where they left off. A participant who already submitted sees the thank-you page again rather than a second survey.
- Blinding: participants never see method names. Right-click and download are disabled on the videos. However, the method names are in the video **filenames** (and `manifest.json`), which a technically curious participant could find in the page source. If you need strict blinding, rename the files to neutral IDs before publishing.
