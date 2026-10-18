# iParkar Live HSE Quiz

A live, timed, multiplayer HSE quiz from **iParkar HSE Academy**. The presenter projects the quiz; participants scan a QR code, enter their name and answer on their own phone or laptop.

- Presenter picks the **topics** (any of 24 KOC HSSE procedures) and the **difficulty** (Easy, Medium or Default = mixed) before creating a session
- Up to 20 questions per quiz from a 500-question bank, spread evenly across the chosen topics, with option order shuffled every run
- 40 seconds per question; no answer = no points
- One question at a time, shown on the presenter screen and every participant's device
- Live leaderboard that updates as each answer arrives
- After each question closes, the procedure reference is shown on the presenter screen and on every phone
- Shareable join card: the **Share** button on the QR code copies the link, copies or downloads the QR card as an image, or shares by WhatsApp, email or the device's share sheet
- Winners podium (1st, 2nd, 3rd), full ranking and CSV download

It runs on **Cloudflare Workers + Durable Objects** (the free plan is enough). The Durable Object keeps each quiz room's state on the server, so all screens stay in sync and correct answers are never sent to phones before the reveal.

---

## Repository layout

```
public/                 Static files served by Cloudflare
  index.html            Presenter screen (setup, QR code + share, questions, leaderboard, podium)
  play.html             Participant screen (join with name, answer, see result and reference)
  host.js               Presenter logic (topic/difficulty picker, share menu, QR card image)
  play.js, common.js    Participant logic and shared helpers
  style.css             iParkar design system styles
  qrcode.js             QR code generator (MIT)
  brand/                iParkar iP monogram (primary, reversed, 1024px PNG)
  favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png
src/
  worker.js             Worker + QuizRoom Durable Object (rooms, filtering, timer, scoring)
  questions.json        The question bank used by the quiz
bank/
  QUESTION_BANK.md      Readable bank with keys and clause references
  question_bank.csv     Same bank for editing in Excel
scripts/
  csv-to-json.mjs       Rebuilds src/questions.json from the CSV
wrangler.jsonc          Cloudflare configuration (Worker name: iparkar-live-quiz)
package.json
```

## Put it on GitHub and deploy (no command line needed)

1. On GitHub, click **New repository**, name it `iparkar-live-quiz`, leave it empty (no README) and click **Create repository**.
2. On the new repository page, click **uploading an existing file**. Unzip `iparkar-live-quiz.zip` on your computer, open the unzipped folder, select **everything inside it** (the `public`, `src`, `bank` and `scripts` folders plus the loose files) and drag it all onto the page. GitHub keeps the folder structure. Click **Commit changes**.
3. In the Cloudflare dashboard go to **Workers & Pages** → **Create** → **Import a repository**, pick `iparkar-live-quiz`, keep the defaults (build command empty, deploy command `npx wrangler deploy`) and click **Deploy**.
4. When it finishes you get a URL like `https://iparkar-live-quiz.<your-subdomain>.workers.dev` — that is the presenter screen.
5. Optional: to serve it on your own domain, open the Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain** and enter e.g. `quiz.iparkar.com` (iparkar.com must be on the same Cloudflare account).

Every later commit to the repository redeploys automatically.

> The Worker name is `iparkar-live-quiz`, so this deploys as a **separate** app and does not touch any existing quiz Worker on the same Cloudflare account.

### Deploy from a computer instead (optional)

```
npm install
npx wrangler login
npx wrangler deploy
```

Run locally with `npx wrangler dev` and open http://localhost:8787.

## Running a quiz

1. Open the site on the projector PC. Under **Choose topics** tick the procedures, under **Difficulty level** pick Easy, Medium or Default, then click **Create quiz session**. Use **Full screen**.
2. Participants scan the QR code (or open `/play.html` and type the 6-character room code), enter their name and tap **Join quiz**. Use **Share** on the QR card to send the link or the QR image to people who are not in the room.
3. Click **Present**. Question 1 appears on all screens with a 40-second timer.
4. A question closes when the timer ends or when every connected participant has answered. The presenter screen shows the correct answer, how many chose each option and the procedure reference; phones show the result and the reference. Click **Next question** (or press Space / →).
5. After the last question the podium appears automatically.
6. **Play again with new questions** keeps the same participants, topics and level and draws a fresh set. **New session** goes back to the setup screen. **Download results (CSV)** saves the ranking.

If a phone drops its connection or the page is refreshed, it reconnects and keeps its score.

### Scoring
- Correct answer: 500–1000 points (faster = more; 1000 for an instant answer, 500 at the last second)
- Wrong answer or no answer: 0 points
- Ties are broken by number of correct answers, then by total answer time

Change the numbers at the top of `src/worker.js` (`SETTINGS`) for a different number of questions, time limit or points.

### How questions are picked
With 20 or more topics selected, a quiz draws one question from each of 20 different procedures. With fewer topics, questions are spread evenly across the selected topics (for example 5 topics → 4 questions each). If fewer than 20 questions match the topics and level, the quiz is shorter and the setup screen says so before you create the session.

## Editing the question bank

1. Open `bank/question_bank.csv` in Excel, edit or add rows (columns: ID, Procedure, Topic, Difficulty, Question, A, B, C, D, Key, Reference). Difficulty must be `Easy` or `Medium`. Save as CSV (UTF-8).
2. Run `node scripts/csv-to-json.mjs` to rebuild `src/questions.json`.
3. Commit to GitHub; Cloudflare redeploys.

## Branding

Styles follow the iParkar design system: `paper` canvas, white hairline cards, Inter with Source Serif 4 for leads, the midnight-and-marigold iP monogram, one action-blue button per screen, flat fills and no shadows on content. Brand colours are defined once at the top of `public/style.css`.
