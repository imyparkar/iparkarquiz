// Shared iParkar sign-in page for the Live HSE Quiz and Custom Quiz.
// Accounts are the same Supabase accounts used by the iParkar LMS.
const params = new URLSearchParams(location.search);
// Email confirmation links may carry tokens in the fragment; never keep them in history.
if (location.hash) history.replaceState(null, "", location.pathname + location.search);

function safeNext(v) {
  v = String(v || "");
  return /^\/(?![\/\\])/.test(v) && !v.startsWith("/login") && !v.startsWith("/auth/") ? v : "/";
}
const next = safeNext(params.get("next"));
const forCustom = next.startsWith("/custom") || next.startsWith("/present");
let mode = params.get("mode") === "signup" ? "signup" : "login";

const COPY = {
  login: {
    title: "Welcome back",
    lead: forCustom ? "Sign in to open your saved quizzes." : "Sign in to present the Live HSE Quiz.",
    submit: "Sign in",
  },
  signup: {
    title: "Create your free account",
    lead: forCustom ? "Save your own quizzes and present them live." : "Run live HSE quizzes for your team in minutes.",
    submit: "Create account",
  },
  reset: { title: "Reset your password", lead: "We'll email you a recovery code." },
};

$("introEyebrow").textContent = forCustom ? "Custom Quiz" : "Live HSE Quiz";
$("googleBtn").href = "/auth/google?next=" + encodeURIComponent(next);

function notice(msg, error = false) {
  $("notice").textContent = msg || "";
  $("notice").classList.toggle("error", !!error);
  $("notice").classList.toggle("hidden", !msg);
}

let googleOn = false;
function render() {
  const reset = mode === "reset";
  const c = COPY[mode];
  $("cardTitle").textContent = c.title;
  $("cardLead").textContent = c.lead;
  document.querySelector(".seg").classList.toggle("hidden", reset);
  $("tabLogin").setAttribute("aria-selected", String(mode === "login"));
  $("tabSignup").setAttribute("aria-selected", String(mode === "signup"));
  $("authForm").classList.toggle("hidden", reset);
  $("resetBox").classList.toggle("hidden", !reset);
  $("googleBox").classList.toggle("hidden", reset || !googleOn);
  $("legal").classList.toggle("hidden", reset);
  if (reset) return;
  $("nameField").classList.toggle("hidden", mode !== "signup");
  $("forgotBtn").classList.toggle("hidden", mode !== "login");
  $("password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("submitBtn").textContent = c.submit;
  document.title = (mode === "signup" ? "Create account" : "Sign in") + " – iParkar Learning";
}
function setMode(m) {
  mode = m; notice(""); render();
  const url = new URL(location.href);
  if (m === "signup") url.searchParams.set("mode", "signup"); else url.searchParams.delete("mode");
  url.searchParams.delete("error");
  history.replaceState(null, "", url);
}
document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
$("forgotBtn").onclick = () => { $("resetEmail").value = $("email").value; setMode("reset"); $("resetEmail").focus(); };
$("backBtn").onclick = () => { $("codeForm").classList.remove("hidden"); $("resetForm").classList.add("hidden"); setMode("login"); };
$("pwToggle").onclick = () => {
  const show = $("password").type === "password";
  $("password").type = show ? "text" : "password";
  $("pwToggle").textContent = show ? "Hide" : "Show";
  $("pwToggle").setAttribute("aria-pressed", String(show));
  $("pwToggle").setAttribute("aria-label", show ? "Hide password" : "Show password");
};

// After sign-up the user confirms by email and signs in later, often from the email link;
// remember where they were heading so they still land on the right page.
function rememberNext() { store("local", "ipq_after_confirm", JSON.stringify({ next, at: Date.now() })); }
function destination() {
  let d = next;
  try {
    const saved = JSON.parse(store("local", "ipq_after_confirm") || "null");
    if (saved && Date.now() - saved.at < 7 * 864e5 && next === "/custom.html") d = safeNext(saved.next);
  } catch {}
  store("local", "ipq_after_confirm", null);
  return d;
}
function go() { location.replace(destination()); }

async function api(path, data) {
  const r = await fetch("/api/custom" + path, {
    method: data ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  let body = {};
  try { body = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(body.error || "Something went wrong. Please try again."); e.status = r.status; throw e; }
  return body;
}

// Cloudflare Turnstile, only when the server provides a site key (Supabase CAPTCHA protection on).
let captchaId = null;
function loadCaptcha(siteKey) {
  if (!siteKey) return;
  window.onTurnstileLoad = () => { $("captcha").classList.remove("hidden"); captchaId = turnstile.render("#captcha", { sitekey: siteKey }); };
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
  s.async = true; document.head.append(s);
}
function captchaToken() {
  if (captchaId === null) return undefined;
  const t = turnstile.getResponse(captchaId);
  if (!t) throw new Error("Please complete the security check, then try again.");
  return t;
}
function resetCaptcha() { if (captchaId !== null) try { turnstile.reset(captchaId); } catch {} }

function invalid(input, msg) { input.setAttribute("aria-invalid", "true"); input.focus(); throw new Error(msg); }
document.addEventListener("input", (e) => e.target.removeAttribute?.("aria-invalid"));

$("authForm").onsubmit = async (e) => {
  e.preventDefault(); notice("");
  const btn = $("submitBtn"); btn.disabled = true;
  try {
    const email = $("email").value.trim(), password = $("password").value;
    if (mode === "signup" && $("name").value.trim().length < 2) invalid($("name"), "Please enter your name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) invalid($("email"), "Enter a valid email address.");
    if (password.length < 8) invalid($("password"), "Your password needs at least 8 characters.");
    btn.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
    const data = await api("/auth/" + mode, { email, password, name: $("name").value.trim(), captchaToken: captchaToken() });
    $("password").value = "";
    if (data.confirmationRequired) {
      rememberNext();
      setMode("login");
      notice(`Almost there — we've sent a confirmation link to ${email}. Open it, then sign in here.`);
      return;
    }
    go();
  } catch (err) {
    notice(err.message, true);
  } finally {
    btn.disabled = false; if (mode !== "reset") $("submitBtn").textContent = COPY[mode].submit; resetCaptcha();
  }
};

$("codeForm").onsubmit = async (e) => {
  e.preventDefault(); notice("");
  const btn = $("codeBtn"); btn.disabled = true;
  try {
    const email = $("resetEmail").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) invalid($("resetEmail"), "Enter a valid email address.");
    const data = await api("/auth/recover", { email, captchaToken: captchaToken() });
    notice(data.message);
    $("codeForm").classList.add("hidden"); $("resetForm").classList.remove("hidden"); $("recoveryCode").focus();
  } catch (err) { notice(err.message, true); }
  finally { btn.disabled = false; resetCaptcha(); }
};

$("resetForm").onsubmit = async (e) => {
  e.preventDefault(); notice("");
  const btn = $("resetBtn"); btn.disabled = true;
  try {
    const code = $("recoveryCode").value.trim(), password = $("newPassword").value;
    if (!/^\d{6,10}$/.test(code)) invalid($("recoveryCode"), "Enter the recovery code from your email.");
    if (password.length < 8) invalid($("newPassword"), "Your new password needs at least 8 characters.");
    await api("/auth/reset", { email: $("resetEmail").value.trim(), code, password });
    go();
  } catch (err) { notice(err.message, true); }
  finally { btn.disabled = false; }
};

const ERRORS = {
  google: "Google sign-in didn't complete. Please try again, or use your email and password.",
  setup: "Sign-in is being set up. Please check back soon.",
};

(async () => {
  render();
  if (ERRORS[params.get("error")]) notice(ERRORS[params.get("error")], true);
  try {
    const cfg = await api("/config");
    if (!cfg.configured) {
      notice(ERRORS.setup, true);
      document.querySelectorAll(".login-card input, .login-card button").forEach((el) => (el.disabled = true));
      return;
    }
    googleOn = !!cfg.google; render();
    loadCaptcha(cfg.turnstileSiteKey);
    // Already signed in? Go straight on.
    try { await api("/me"); return go(); }
    catch (err) {
      if (err.status === 401) {
        try { await fetch("/api/custom/auth/refresh", { method: "POST" }).then((r) => { if (r.ok) go(); }); } catch {}
      }
    }
  } catch (err) {
    notice(err.message, true);
  }
})();
