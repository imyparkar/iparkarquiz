// Creator accounts use Supabase Auth. Application data stays in Cloudflare D1.
const reply = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const cookieName = 'ipq_access', refreshName = 'ipq_refresh';
function cookies(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(s => s.trim().split(/=(.*)/s)).filter(p => p[0]));
}
function authHeaders(env) { return { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' }; }
function sessionReply(data, session, request) {
  const res = reply(data);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const suffix = `; HttpOnly; SameSite=Lax; Path=/${secure}`;
  res.headers.append('set-cookie', `${cookieName}=${session?.access_token || ''}; Max-Age=${session ? Math.min(session.expires_in || 3600, 86400) : 0}${suffix}`);
  res.headers.append('set-cookie', `${refreshName}=${session?.refresh_token || ''}; Max-Age=${session ? 2592000 : 0}${suffix}`);
  return res;
}
async function body(request) {
  if (!request.body) throw new SyntaxError('Missing body');
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 180000) { await reader.cancel(); throw new Error('Request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function validateQuiz(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Enter valid quiz details.");
  const title = String(raw.title || '').trim();
  const description = String(raw.description || '').trim();
  if (!title || title.length > 120) throw new Error('Enter a title of 1–120 characters.');
  if (description.length > 2000) throw new Error('Description must be 2,000 characters or fewer.');
  const seconds = Number(raw.secondsPerQuestion ?? 40);
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 180) throw new Error('Choose 10–180 seconds per question.');
  if (!Array.isArray(raw.questions) || !raw.questions.length || raw.questions.length > 100) throw new Error('Add between 1 and 100 questions.');
  const questions = raw.questions.map((q, i) => {
    const text = String(q.q || '').trim(), source = String(q.source || '').trim();
    if (!text || text.length > 2000) throw new Error(`Question ${i + 1}: enter 1–2,000 characters.`);
    if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 500)) throw new Error(`Question ${i + 1}: enter four options, each up to 500 characters.`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) throw new Error(`Question ${i + 1}: choose the correct answer.`);
    if (source.length > 2000) throw new Error(`Question ${i + 1}: explanation is too long.`);
    return { id: `custom-${i + 1}`, q: text, options: q.options.map(o => o.trim()), answer: q.answer, source, ref: '', topic: '', difficulty: '' };
  });
  return { title, description, questions, secondsPerQuestion: seconds };
}
async function currentUser(request, env) {
  const token = cookies(request)[cookieName];
  if (!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { ...authHeaders(env), Authorization: `Bearer ${token}` } });
  return r.ok ? await r.json() : null;
}
async function profile(env, user, signIn = false) {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO profiles (id,email,display_name,created_at,last_sign_in_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, last_sign_in_at=COALESCE(excluded.last_sign_in_at,profiles.last_sign_in_at)').bind(user.id, user.email || '', String(user.user_metadata?.display_name || '').slice(0, 80), now, signIn ? now : null).run();
  if (signIn) await env.DB.prepare('INSERT INTO sign_in_events (id,user_id,occurred_at) VALUES (?,?,?)').bind(crypto.randomUUID(), user.id, now).run();
}
export async function customApi(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/api/custom/config') return reply({ configured: !!(env.DB && env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) });
  if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return reply({ error: 'Creator accounts are being set up. Please try again later.' }, 503);
  if (method !== 'GET' && request.headers.get('origin') !== url.origin) return reply({ error: 'Request origin is not allowed.' }, 403);
  try {
    if (path.startsWith('/api/custom/auth/')) {
      const action = path.split('/').pop();
      if (method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
      if (action === 'logout') {
        const token = cookies(request)[cookieName];
        try { if (token) await fetch(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`, { method: 'POST', headers: { ...authHeaders(env), Authorization: `Bearer ${token}` } }); } catch { /* Local sign-out must still clear cookies if the auth provider is unavailable. */ }
        return sessionReply({ ok: true }, null, request);
      }
      if (action === 'recover') {
        const { email } = await body(request);
        if (typeof email !== 'string' || !email.trim() || email.length > 254) return reply({ error: 'Enter your email address.' },400);
        await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, { method:'POST',headers:authHeaders(env),body:JSON.stringify({email:email.trim()}) });
        return reply({ message:'If this email has an account, a recovery code has been sent. Check your inbox.' });
      }
      if (action === 'reset') {
        const { email, code, password } = await body(request);
        if (typeof email !== 'string' || email.length > 254 || !/^\d{6,10}$/.test(code || '') || typeof password !== 'string' || password.length < 8 || password.length > 128) return reply({ error:'Enter your email, recovery code and a password of 8–128 characters.' },400);
        const verified = await fetch(`${env.SUPABASE_URL}/auth/v1/verify`, { method:'POST',headers:authHeaders(env),body:JSON.stringify({email,token:code,type:'recovery'}) });
        if (!verified.ok) return reply({ error:'The recovery code is invalid or expired. Request a new code.' },400);
        const session = await verified.json();
        const updated = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { method:'PUT',headers:{...authHeaders(env),Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({password}) });
        if (!updated.ok) return reply({ error:'Could not update your password. Request a new recovery code.' },400);
        await profile(env,session.user,true);
        return sessionReply({user:{id:session.user.id,email:session.user.email}},session,request);
      }
      let payload, endpoint;
      if (action === 'refresh') {
        payload = { refresh_token: cookies(request)[refreshName] || '' };
        endpoint = '/token?grant_type=refresh_token';
      } else if (action === 'login' || action === 'signup') {
        const input = await body(request);
        const email = String(input.email || '').trim(), password = String(input.password || '');
        if (!email || email.length > 254 || password.length < 8 || password.length > 128) return reply({ error: 'Enter your email and a password of 8–128 characters.' }, 400);
        payload = { email, password };
        endpoint = action === 'login' ? '/token?grant_type=password' : '/signup';
        if (action === 'signup') payload.data = { display_name: String(input.name || '').trim().slice(0, 80) };
      } else return reply({ error: 'Not found.' }, 404);
      const r = await fetch(`${env.SUPABASE_URL}/auth/v1${endpoint}`, { method: 'POST', headers: authHeaders(env), body: JSON.stringify(payload) });
      const data = await r.json();
      if (!r.ok) return reply({ error: action === 'login' ? 'Could not sign in. Check your details and confirm your email.' : action === 'refresh' ? 'Please sign in again.' : 'Could not create your account. Please try again later.' }, action === 'refresh' ? 401 : 400);
      if (data.access_token && data.user) {
        await profile(env, data.user, action !== 'refresh');
        return sessionReply({ user: { id: data.user.id, email: data.user.email } }, data, request);
      }
      return reply({ confirmationRequired: true, message: 'Check your email to confirm your account, then sign in.' });
    }
    const user = await currentUser(request, env);
    if (!user) return reply({ error: 'Please sign in to continue.' }, 401);
    await profile(env, user);
    if (path === '/api/custom/me' && method === 'GET') {
      const p = await env.DB.prepare('SELECT display_name,last_sign_in_at FROM profiles WHERE id=?').bind(user.id).first();
      return reply({ user: { id: user.id, email: user.email, name: p.display_name, lastSignInAt: p.last_sign_in_at } });
    }
    if (path === '/api/custom/quizzes') {
      if (method === 'GET') {
        const rows = await env.DB.prepare('SELECT id,title,description,seconds_per_question,created_at,updated_at,json_array_length(questions_json) AS question_count FROM quizzes WHERE owner_id=? ORDER BY updated_at DESC').bind(user.id).all();
        return reply({ quizzes: rows.results });
      }
      if (method === 'POST') {
        const q = validateQuiz(await body(request)), id = crypto.randomUUID(), now = Date.now();
        await env.DB.prepare('INSERT INTO quizzes (id,owner_id,title,description,questions_json,seconds_per_question,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,user.id,q.title,q.description,JSON.stringify(q.questions),q.secondsPerQuestion,now,now).run();
        return reply({ id }, 201);
      }
    }
    const match = path.match(/^\/api\/custom\/quizzes\/([\w-]+)(\/present)?$/);
    if (match) {
      const q = await env.DB.prepare('SELECT * FROM quizzes WHERE id=? AND owner_id=?').bind(match[1], user.id).first();
      if (!q) return reply({ error: 'Quiz not found.' }, 404);
      if (match[2] && method === 'POST') {
        const sessionId = crypto.randomUUID();
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = crypto.randomUUID().replace(/-/g,'').slice(0,6).toUpperCase();
          const stub = env.QUIZ_ROOM.get(env.QUIZ_ROOM.idFromName(code));
          const res = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, custom: { sessionId, ownerId: user.id, quizId: q.id, title: q.title, questions: JSON.parse(q.questions_json), secondsPerQuestion: q.seconds_per_question } }) });
          if (!res.ok) continue;
          const room = await res.json();
          await env.DB.prepare('INSERT INTO quiz_sessions (id,owner_id,quiz_id,quiz_title,room_code,created_at) VALUES (?,?,?,?,?,?)').bind(sessionId,user.id,q.id,q.title,code,Date.now()).run();
          return reply({ ...room, sessionId }, 201);
        }
        return reply({ error: 'Could not create a room. Please retry.' }, 503);
      }
      if (!match[2] && method === 'GET') return reply({ quiz: { id:q.id,title:q.title,description:q.description,questions:JSON.parse(q.questions_json),secondsPerQuestion:q.seconds_per_question } });
      if (!match[2] && method === 'PUT') {
        const edit = validateQuiz(await body(request));
        await env.DB.prepare('UPDATE quizzes SET title=?,description=?,questions_json=?,seconds_per_question=?,updated_at=? WHERE id=? AND owner_id=?').bind(edit.title,edit.description,JSON.stringify(edit.questions),edit.secondsPerQuestion,Date.now(),q.id,user.id).run();
        return reply({ id:q.id });
      }
      if (!match[2] && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM quizzes WHERE id=? AND owner_id=?').bind(q.id,user.id).run();
        return reply({ ok:true });
      }
    }
    if (path === '/api/custom/sessions' && method === 'GET') {
      const rows = await env.DB.prepare('SELECT s.*,r.round,r.finished_at,r.results_json FROM quiz_sessions s LEFT JOIN quiz_results r ON r.session_id=s.id WHERE s.owner_id=? ORDER BY s.created_at DESC,r.round DESC LIMIT 100').bind(user.id).all();
      return reply({ sessions: rows.results.map(r => ({ ...r, results: r.results_json ? JSON.parse(r.results_json) : null, results_json: undefined })) });
    }
    const resume = path.match(/^\/api\/custom\/sessions\/([\w-]+)\/resume$/);
    if (resume && method === 'POST') {
      const s = await env.DB.prepare('SELECT room_code FROM quiz_sessions WHERE id=? AND owner_id=?').bind(resume[1],user.id).first();
      if (!s) return reply({ error:'Session not found.' },404);
      return env.QUIZ_ROOM.get(env.QUIZ_ROOM.idFromName(s.room_code)).fetch('https://room/host-key', { method:'POST',body:JSON.stringify({ ownerId:user.id }) });
    }
    return reply({ error:'Not found.' },404);
  } catch (error) {
    if (error instanceof SyntaxError) return reply({ error: 'Enter valid quiz details.' },400);
    if (/^(Enter|Choose|Add|Description|Question |Request is)/.test(error.message)) return reply({ error:error.message },400);
    console.error('Custom quiz request failed', error.name);
    return reply({ error:'Could not complete this request. Please try again.' },500);
  }
}
