import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
await build({entryPoints:['src/worker.js'],bundle:true,platform:'node',format:'esm',outfile:'.wrangler/test-worker.mjs',logLevel:'silent'});
const { default:worker,QuizRoom } = await import('../.wrangler/test-worker.mjs');
const { validateQuiz, customApi } = await import('../src/custom.js');
const quiz = {title:'Team Quiz',description:'A test',secondsPerQuestion:20,questions:[{q:'Choose the safe option',options:['A','B','C','D'],answer:2,source:'Explanation'}]};
function database() {
  const db=new DatabaseSync(':memory:');db.exec(readFileSync('migrations/0001_custom_quizzes.sql','utf8'));
  return {raw:db,prepare(sql){let values=[];const statement=db.prepare(sql);return {bind(...v){values=v;return this;},async run(){return statement.run(...values);},async first(){return statement.get(...values)||null;},async all(){return {results:statement.all(...values)};}};}};
}
function context(){return {storage:{data:new Map(),async get(k){return this.data.get(k);},async put(k,v){this.data.set(k,structuredClone(v));},async setAlarm(t){this.alarm=t;},async deleteAlarm(){this.alarm=null;}},blockConcurrencyWhile(fn){this.ready=fn();},getWebSockets(){return [];}};}
function environment(){const rooms=new Map();const DB=database();const env={DB,SUPABASE_URL:'https://auth.test',SUPABASE_PUBLISHABLE_KEY:'test-public-key',QUIZ_ROOM:{idFromName:c=>c,get(c){if(!rooms.has(c)){const ctx=context();const room=new QuizRoom(ctx,env);rooms.set(c,{room,fetch:async (...args)=>{await ctx.ready;return room.fetch(new Request(...args));}});}return rooms.get(c);}}};return {...env,rooms};}
const realFetch=globalThis.fetch;
let authCalls=[];
globalThis.fetch=async(url,options={})=>{
  if(String(url).startsWith('https://auth.test')){
    authCalls.push({url:String(url),options});
    const token=new Headers(options.headers).get('Authorization');
    if(String(url).endsWith('/user')) return new Response(JSON.stringify(token==='Bearer alice'?{id:'alice',email:'alice@example.com'}:token==='Bearer bob'?{id:'bob',email:'bob@example.com'}:{error:'Invalid token'}),{status:['Bearer alice','Bearer bob'].includes(token)?200:401});
    if(String(url).includes('grant_type=password'))return new Response(JSON.stringify({access_token:'alice',refresh_token:'refresh-alice',expires_in:3600,user:{id:'alice',email:'alice@example.com'}}));
    if(new URL(url).pathname.endsWith('/signup'))return new Response(JSON.stringify({id:'new-account'}));
    return new Response(JSON.stringify({error:'invalid'}),{status:400});
  }
  return realFetch(url,options);
};
function request(path,method='GET',data,token='alice',origin='https://quiz.test'){
  return new Request('https://quiz.test/api/custom'+path,{method,headers:{cookie:token?`ipq_access=${token}`:'',origin,'content-type':'application/json'},body:data?JSON.stringify(data):undefined});
}
test('quiz validation rejects missing answer keys, invalid lengths and timer',()=>{
  assert.equal(validateQuiz(quiz).questions[0].answer,2);
  for(const edit of [{title:''},{questions:[]},{secondsPerQuestion:1},{questions:[{...quiz.questions[0],answer:9}]},{questions:[{...quiz.questions[0],options:['','','','']}]}]) assert.throws(()=>validateQuiz({...quiz,...edit}));
});
test('authentication requires origin and sets HttpOnly, Secure cookies; successful sign-ins recorded',async()=>{
  const env=environment();
  assert.equal((await customApi(request('/auth/login','POST',{email:'alice@example.com',password:'password123'},null,'https://evil.test'),env)).status,403);
  const r=await customApi(request('/auth/login','POST',{email:'alice@example.com',password:'password123'},null),env);
  assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);assert.match(r.headers.get('set-cookie'),/Secure/);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM sign_in_events').get().n,1);
});
test('anonymous requests rejected; quiz CRUD, owner isolation and results survive quiz deletion',async()=>{
  const env=environment();
  assert.equal((await customApi(request('/quizzes','GET',null,null),env)).status,401);
  const created=await customApi(request('/quizzes','POST',quiz),env);assert.equal(created.status,201);const {id}=await created.json();
  for(const [path,method] of [[`/quizzes/${id}`,'GET'],[`/quizzes/${id}`,'PUT'],[`/quizzes/${id}`,'DELETE'],[`/quizzes/${id}/present`,'POST']])assert.equal((await customApi(request(path,method,method==='PUT'?quiz:null,'bob'),env)).status,404);
  assert.equal((await (await customApi(request('/quizzes','GET',null,'bob'),env)).json()).quizzes.length,0);
  const update=await customApi(request(`/quizzes/${id}`,'PUT',{...quiz,title:'Updated quiz'}),env);assert.equal(update.status,200);
  const room=await (await customApi(request(`/quizzes/${id}/present`,'POST'),env)).json();assert.ok(room.hostKey);const state=env.rooms.get(room.code).room;
  assert.equal(state.s.custom.title,'Updated quiz');assert.equal(state.summary().numQuestions,1);
  await customApi(request(`/quizzes/${id}`,'PUT',{...quiz,questions:[{...quiz.questions[0],q:'New question'}]}),env);
  assert.equal(state.s.custom.questions[0].q,quiz.questions[0].q);
  assert.equal((await customApi(request(`/sessions/${room.sessionId}/resume`,'POST',null,'bob'),env)).status,404);
  state.s.players.test={name:'Player',score:0,correct:0,timeMs:0,answers:{}};
  const ws={send() {}};await state.handleHost(ws,{t:'start'});
  assert.equal(state.s.questions.length,1);assert.equal(state.s.qDeadline-state.s.qStart,20000);
  assert.equal(state.playerView('test').question.answer,undefined);
  assert.equal(state.playerView('test').question.source,undefined);
  await state.closeQuestion();assert.equal(state.playerView('test').question.answer,2);
  await state.finish();
  let sessions=await (await customApi(request('/sessions'),env)).json();assert.equal(sessions.sessions[0].results.total,1);
  assert.equal((await (await customApi(request('/sessions','GET',null,'bob'),env)).json()).sessions.length,0);
  await customApi(request(`/quizzes/${id}`,'DELETE'),env);
  sessions=await (await customApi(request('/sessions'),env)).json();assert.equal(sessions.sessions[0].quiz_id,null);assert.equal(sessions.sessions[0].results.total,1);
});
test('HSE engine still draws 20 questions, hides keys until reveal, keeps 40-second timer',async()=>{
  const env=environment();const r=await worker.fetch(new Request('https://quiz.test/api/rooms',{method:'POST',body:'{}'}),env);assert.equal(r.status,200);
  const room=await r.json();const state=env.rooms.get(room.code).room;state.s.players.test={name:'Player',score:0,correct:0,timeMs:0,answers:{}};
  await state.handleHost({send(){}},{t:'start'});assert.equal(state.s.questions.length,20);assert.equal(state.s.qDeadline-state.s.qStart,40000);assert.equal(state.playerView('test').question.answer,undefined);
});
test('missing setup returns clear unavailable response without affecting HSE routes',async()=>{
  assert.equal((await customApi(request('/quizzes'),{})).status,503);
  assert.deepEqual(await (await customApi(request('/config'),{})).json(),{configured:false,turnstileSiteKey:''});
});
test('failed result writes retry and prevent replay until the saved round is archived',async()=>{
  const env=environment();const id=(await (await customApi(request('/quizzes','POST',quiz),env)).json()).id;
  const room=await (await customApi(request(`/quizzes/${id}/present`,'POST'),env)).json();const state=env.rooms.get(room.code).room;
  state.s.players.test={name:'Player',score:1000,correct:1,timeMs:0,answers:{}};
  await state.handleHost({send(){}},{t:'start'});
  const prepare=env.DB.prepare;
  env.DB.prepare=(sql)=>{if(sql.startsWith('INSERT INTO quiz_results'))throw new Error('Temporary database outage');return prepare(sql);};
  await state.finish();assert.equal(state.s.archivePending,true);assert.ok(state.ctx.storage.alarm);
  let message;await state.handleHost({send(raw){message=JSON.parse(raw);}},{t:'restart'});assert.equal(state.s.phase,'final');assert.match(message.message,/still saving/);
  env.DB.prepare=prepare;await state.alarm();assert.equal(state.s.archivePending,false);assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM quiz_results').get().n,1);
  await state.handleHost({send(){}},{t:'restart'});assert.equal(state.s.phase,'lobby');
});
test('sign-up requests email confirmation, recovery hides account existence, logout clears both cookies',async()=>{
  const env=environment();
  const signup=await customApi(request('/auth/signup','POST',{email:'new@example.test',password:'password123'},null),env);assert.equal((await signup.json()).confirmationRequired,true);assert.equal(signup.headers.get('set-cookie'),null);
  const recover=await customApi(request('/auth/recover','POST',{email:'unknown@example.test'},null),env);assert.equal(recover.status,200);assert.match((await recover.json()).message,/If this email/);
  const invalid=await customApi(request('/auth/reset','POST',{email:'a@example.test',code:'invalid',password:'password123'},null),env);assert.equal(invalid.status,400);
  const logout=await customApi(request('/auth/logout','POST'),env);assert.equal(logout.status,200);assert.equal((logout.headers.get('set-cookie').match(/Max-Age=0/g)||[]).length,2);
});

test('quiz sign-up and recovery emails return to the quiz; CAPTCHA token is forwarded when present',async()=>{
  const env={...environment(),TURNSTILE_SITE_KEY:'site-key'};authCalls=[];
  assert.equal((await (await customApi(request('/config'),env)).json()).turnstileSiteKey,'site-key');
  await customApi(request('/auth/signup','POST',{email:'new@example.test',password:'password123',captchaToken:'tok-1'},null),env);
  await customApi(request('/auth/recover','POST',{email:'new@example.test',captchaToken:'tok-2'},null),env);
  await customApi(request('/auth/login','POST',{email:'alice@example.com',password:'password123'},null),env);
  const [signup,recover,login]=authCalls;
  for(const call of [signup,recover]) assert.equal(new URL(call.url).searchParams.get('redirect_to'),'https://quiz.test/custom.html?mode=login');
  assert.equal(JSON.parse(signup.options.body).gotrue_meta_security.captcha_token,'tok-1');
  assert.equal(JSON.parse(recover.options.body).gotrue_meta_security.captcha_token,'tok-2');
  assert.equal(JSON.parse(login.options.body).gotrue_meta_security,undefined);
});
