# Activate custom quizzes

This release extends the existing Cloudflare Worker. It does not require moving the HSE question bank or live rooms. Deploy the quiz app before the matching main-site cards. The Supabase project and D1 resource do not exist yet; provision them before merging/deploying this branch.

## 1. Create Supabase authentication

1. Create a Supabase project in the owner's account. Enable the Email provider, email/password signup and email confirmation.
2. Under Authentication → URL Configuration, set Site URL to `https://quiz.iparkar.com/custom.html`. Add this same address to allowed Redirect URLs. Email confirmation returns users here, where they sign in after confirmation.
3. Configure a production SMTP sender with an address you control. Supabase's built-in sender is intended for initial testing and limits eligible recipients/delivery. Test with an external email address before launch.
4. Under Authentication → Email Templates → Reset Password, include the recovery code in the email: `Your iParkar Learning recovery code is {{ .Token }}`. The app's Forgot password form accepts this code and a new password. Keep the email confirmation template's confirmation link enabled.
5. Copy Project URL and the **publishable key**. The app never needs a service-role/secret key. Set Worker variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in Cloudflare → Workers & Pages → iparkar-live-quiz → Settings → Variables and Secrets. They can alternatively be Wrangler secrets. Use the same Supabase project for both values.
6. Keep Supabase's authentication rate limits enabled. Review authentication activity in Supabase's Auth logs. This release implements email/password accounts; Google sign-in is not included.

## 2. Create Cloudflare D1

In the Cloudflare dashboard create a D1 database called `iparkar-quizzes`. Copy its ID into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_DATABASE_ID`. The binding must be named `DB`.

From this repository (Node 22 or later):

```sh
pnpm install
pnpm exec wrangler d1 migrations apply iparkar-quizzes --remote
pnpm test
pnpm exec wrangler deploy
```

The migration creates profiles, saved quizzes, live session history, round results and successful sign-in timestamps. Passwords stay with Supabase Auth. The latest sign-in is in `profiles.last_sign_in_at`; successful app sign-ins have individual entries in `sign_in_events`. Failed authentication attempts belong in Supabase's Auth logs. Configure retention and backups for your needs.

Local development uses `wrangler d1 migrations apply iparkar-quizzes --local` and `.dev.vars` with the two Supabase values. Never commit `.dev.vars`. Automated tests use fake authentication and an in-memory SQLite database and require no live credentials.

## 3. Keep Cloudflare Access separate from public creator accounts

The deployed host currently redirects to `iparkar.cloudflareaccess.com`. Those historical sign-ins are in Cloudflare Zero Trust → Insights → Logs → Access authentication logs. They are separate from the new creator account system.

Do not leave a whole-host Access gate over the custom quiz feature: it would stop public users before they reach registration. Keep existing Access protection for the HSE presenter root and `/api/rooms` if desired. Have the owner explicitly configure public access exceptions for the new creator and participant routes and their assets:

- `/custom` and `/custom.html` (including query strings)
- `/present` (the custom presenter route)
- `/api/custom/*`
- `/play`, `/play.html`, `/j/*`, and `/ws/*`
- Required assets: `/style.css`, `/custom.css`, `/common.js`, `/custom.js`, `/host.js`, `/play.js`, `/qrcode.js`, `/brand/*`, `/favicon.svg` and icon paths

The app protects creator data using verified Supabase sessions and ownership checks. Presenter WebSockets require the room secret key. Participants can join by name. Access policies are managed outside this repository; this change does not modify them automatically. Verify the intended public paths in a signed-out/private browser before launch.

## 4. Deploy the website cards

After the quiz app is deployed and authentication is verified, merge/deploy the matching `iparkar-site` change. `/live-quiz/` offers:

- **Live HSE Quiz** → existing presenter at `https://quiz.iparkar.com/`
- **Custom Quiz / Create Quiz** → `https://quiz.iparkar.com/custom.html?mode=signup`
- **Custom Quiz / Sign in** → `https://quiz.iparkar.com/custom.html?mode=login`

## 5. Launch checks

Use two real test accounts to verify email confirmation, login, logout, password recovery, account isolation, quiz saving and reopening from another browser. Create a custom quiz, pick a non-default timer, present it, join from a phone, answer, reveal and check the saved results and CSV. Verify a quiz edit does not alter an existing room, and deleting a saved quiz preserves prior results. Repeat an HSE quiz and verify its existing topic/difficulty flow.

The automated suite covers server validation, CSRF origin checks, cookies, successful sign-in records, creator isolation, CRUD, fixed session questions, answer secrecy, result storage and the existing HSE settings. Local browser QA uses disposable local authentication; live email delivery and Supabase configuration still need the checks above.

## Operating notes

- Users can create accounts without paying. Cloudflare, Supabase and email hosting usage remains subject to your selected plans.
- Four options and one correct answer per question; 1–100 questions; 10–180 seconds per question. A complete question and answer key is required before saving. Work in progress stays in the editor until saved; there is an unsaved-changes warning.
- Custom quiz question order is preserved. Present Live copies the quiz into the room, so later edits are independent. Each replay creates a separate saved results round.
- Failed result writes retry through the room alarm, and replay waits until results are saved.
- Quizzes are private to their owner. Results contain participant names entered by participants. An administrator handles deletion/retention requests across D1 and Supabase. The existing main-site privacy policy should accurately describe these services and retention before public launch.
- The library currently shows the latest 100 session/round records. No public quiz sharing, bulk question imports, image uploads or account deletion UI is included in this release.
