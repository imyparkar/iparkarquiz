let user = null, quizId = null, dirty = false, mode = new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login';
// Email confirmation may return a fragment; never retain its tokens in browser history.
if (location.hash) history.replaceState(null,'',location.pathname + location.search);
let sessionRows = [];
const blankQuestion = () => ({q:'',options:['','','',''],answer:-1,source:''});
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error',error); $('notice').classList.toggle('hidden',!message); }
function screen(id) { ['loading','account','dashboard','editor'].forEach(key => $(key).classList.toggle('hidden',key !== id)); }
async function api(path, options = {}, retry = true) {
  const r = await fetch('/api/custom' + path, { ...options, headers:{'content-type':'application/json',...options.headers} });
  if (r.status === 401 && retry && !path.startsWith('/auth/')) {
    const refresh = await fetch('/api/custom/auth/refresh',{method:'POST'});
    if (refresh.ok) return api(path,options,false);
  }
  const data = await r.json();
  if (!r.ok) { if (r.status === 401 && !path.startsWith('/auth/')) { user = null; $('logout').classList.add('hidden'); screen('account'); renderAuth(); } throw new Error(data.error || 'Please try again.'); }
  return data;
}
function renderAuth() {
  const signup = mode === 'signup';
  $('authHeading').textContent = signup ? 'Create your free account' : 'Sign in';
  $('authLead').textContent = signup ? 'Save your quizzes and present them whenever you need.' : 'Welcome back. Your saved quizzes are waiting.';
  $('nameField').classList.toggle('hidden',!signup); $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('authSubmit').textContent = signup ? 'Create account' : 'Sign in';
  $('authSwitch').innerHTML = signup ? 'Already have an account? <button class="btn ghost small" type="button" id="switchMode">Sign in</button>' : 'New here? <button class="btn ghost small" type="button" id="switchMode">Create a free account</button>';
  $('switchMode').onclick = () => {mode = signup ? 'login' : 'signup';renderAuth();};
}
$('authForm').onsubmit = async e => {
  e.preventDefault(); $('authSubmit').disabled = true; notice('');
  try {
    const data = await api('/auth/'+mode,{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value,name:$('name').value})});
    $('password').value = '';
    if (data.confirmationRequired) { mode='login';renderAuth();notice(data.message); }
    else { user=data.user;await dashboard(); }
  } catch(e) {notice(e.message,true);} finally {$('authSubmit').disabled=false;}
};
$('forgot').onclick = () => $('recovery').classList.toggle('hidden');
$('requestCode').onclick = async () => {
  $('requestCode').disabled=true;
  try { const data=await api('/auth/recover',{method:'POST',body:JSON.stringify({email:$('email').value})});notice(data.message); }
  catch(e){notice(e.message,true);}finally{$('requestCode').disabled=false;}
};
$('resetForm').onsubmit=async e=>{
  e.preventDefault();$('resetSubmit').disabled=true;
  try {const data=await api('/auth/reset',{method:'POST',body:JSON.stringify({email:$('email').value,code:$('recoveryCode').value,password:$('newPassword').value})});user=data.user;$('newPassword').value='';$('recoveryCode').value='';await dashboard();}
  catch(e){notice(e.message,true);}finally{$('resetSubmit').disabled=false;}
};
$('logout').onclick = async () => {
  if (!mayLeave()) return;
  try { await api('/auth/logout',{method:'POST'}); user=null;dirty=false;sessionStorage.removeItem('ipq_launch');$('logout').classList.add('hidden');screen('account');renderAuth();notice('You have signed out.'); }
  catch(e) {notice(e.message,true);}
};
async function dashboard() {
  screen('loading');notice('');$('logout').classList.remove('hidden');
  try {
    const [quizzes,sessions] = await Promise.all([api('/quizzes'),api('/sessions')]);
    $('greeting').textContent = user.name ? `Welcome, ${user.name}` : user.email;
    $('quizList').innerHTML = quizzes.quizzes.length ? quizzes.quizzes.map(q => `<article class="card"><h2>${esc(q.title)}</h2><p>${esc(q.description)}</p><p class="muted">${q.question_count} question${q.question_count === 1 ? "" : "s"} · ${q.seconds_per_question}s per question</p><p class="muted">Updated ${esc(new Date(q.updated_at).toLocaleDateString())}</p><div class="controls"><button class="btn small" data-present="${q.id}">Present Live</button><button class="btn ghost small" data-edit="${q.id}">Edit</button><button class="btn ghost small" data-duplicate="${q.id}">Duplicate</button><button class="btn ghost small" data-delete="${q.id}">Delete</button></div></article>`).join('') : '<div class="empty-state"><h2>Your first quiz starts here</h2><p>Click Create Quiz to add your own questions and answer keys.</p></div>';
    sessionRows = sessions.sessions;
    $('sessions').innerHTML = sessionRows.length ? sessionRows.map((s,i) => `<article class="session"><div><strong>${esc(s.quiz_title)}</strong><p class="muted">Room ${esc(s.room_code)} · ${esc(new Date(s.created_at).toLocaleString())}${s.results ? ` · Round ${s.round} complete · ${s.results.players.length} participant${s.results.players.length === 1 ? "" : "s"}` : ' · Results pending'}</p></div>${s.results ? `<button class="btn ghost small" data-results="${i}">Download results</button>` : ''}<button class="btn ghost small" data-resume="${s.id}">Open session</button></article>`).join('') : '<p class="muted">Your live sessions will appear here.</p>';
    screen('dashboard');
  } catch(e) {if(user)screen('dashboard');notice(e.message,true);}
}
function launch(room) { sessionStorage.setItem('ipq_launch',JSON.stringify({code:room.code,key:room.hostKey}));dirty=false;location.href='/present?custom=1'; }
async function present(id) { launch(await api(`/quizzes/${id}/present`,{method:'POST'})); }
$('quizList').onclick = async e => {
  const button=e.target.closest('button');if(!button)return;button.disabled=true;
  try {
    if(button.dataset.edit) await openQuiz(button.dataset.edit);
    if(button.dataset.present) await present(button.dataset.present);
    if(button.dataset.duplicate) {const {quiz}=await api('/quizzes/'+button.dataset.duplicate);delete quiz.id;quiz.title=(quiz.title.slice(0,110)+' (copy)');await api('/quizzes',{method:'POST',body:JSON.stringify(quiz)});await dashboard();}
    if(button.dataset.delete && confirm('Delete this saved quiz? Previous session results will be kept.')) {await api('/quizzes/'+button.dataset.delete,{method:'DELETE'});await dashboard();}
  } catch(e){notice(e.message,true);}finally{button.disabled=false;}
};
$('sessions').onclick = async e => {
  const b=e.target.closest('button');if(!b)return;b.disabled=true;
  try {if(b.dataset.resume)launch(await api(`/sessions/${b.dataset.resume}/resume`,{method:'POST'}));if(b.dataset.results)downloadResults(sessionRows[Number(b.dataset.results)]);}
  catch(e){notice(e.message,true);}finally{b.disabled=false;}
};
function downloadResults(s) {
  const rows=[['Rank','Name','Score','Correct','Questions','Room','Round'],...s.results.players.map(p=>[p.rank,p.name,p.score,p.correct,s.results.total,s.room_code,s.round])];
  const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/^[=+@\-\t\r]/,'\'$&').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`iParkar-Learning-${s.room_code}-round-${s.round}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
let questionSerial=0;
function addQuestion(q=blankQuestion()) {
  const fieldset=document.createElement('fieldset');fieldset.className='question-card';const serial=++questionSerial;
  fieldset.innerHTML=`<legend></legend><div class="question-head"><button type="button" class="btn ghost small" data-up>Move up</button><button type="button" class="btn ghost small" data-down>Move down</button><button type="button" class="btn ghost small" data-remove>Remove</button></div><label>Question<textarea data-q required maxlength="2000" rows="2">${esc(q.q)}</textarea></label><p class="answer-key">Select the radio button beside the correct answer.</p>${q.options.map((o,i)=>`<div class="answer-row"><input type="radio" name="key-${serial}" value="${i}" aria-label="Option ${LETTERS[i]} is correct" ${i===q.answer?'checked':''} required><label><span class="muted">Option ${LETTERS[i]}</span><input data-option type="text" required maxlength="500" value="${esc(o)}"></label></div>`).join('')}<label>Answer explanation <span class="muted">(optional, shown after the question closes)</span><textarea data-source maxlength="2000" rows="2">${esc(q.source)}</textarea></label>`;
  $('questions').append(fieldset);renumber();
}
function renumber() { const cards=[...$('questions').children];cards.forEach((f,i)=>{f.querySelector('legend').textContent=`Question ${i+1}`;f.querySelector('[data-up]').disabled=i===0;f.querySelector('[data-down]').disabled=i===cards.length-1;f.querySelector('[data-remove]').disabled=cards.length===1;});$('addQuestion').disabled=cards.length>=100; }
function readQuiz() { return {title:$('quizTitle').value.trim(),description:$('description').value.trim(),secondsPerQuestion:Number($('seconds').value),questions:[...$('questions').children].map(f=>({q:f.querySelector('[data-q]').value.trim(),options:[...f.querySelectorAll('[data-option]')].map(i=>i.value.trim()),answer:Number(f.querySelector('input[type=radio]:checked')?.value),source:f.querySelector('[data-source]').value.trim()}))}; }
function editQuiz(q) {
  quizId=q.id||null;$('quizTitle').value=q.title||'';$('description').value=q.description||'';$('seconds').value=q.secondsPerQuestion||40;$('questions').replaceChildren();
  (q.questions||[blankQuestion()]).forEach(addQuestion);$('editorHeading').textContent=quizId?'Edit quiz':'Create a quiz';$('saveStatus').textContent=quizId?'Saved quiz':'Not saved yet';dirty=false;screen('editor');notice('');
}
async function openQuiz(id) { const {quiz}=await api('/quizzes/'+id);editQuiz(quiz); }
function mayLeave() {return !dirty || confirm('Leave without saving your changes?');}
$('newQuiz').onclick=()=>editQuiz({});$('back').onclick=()=>{if(mayLeave()){dirty=false;dashboard();}};
$('quizForm').oninput=()=>{dirty=true;$('saveStatus').textContent='Unsaved changes';};
$('addQuestion').onclick=()=>{addQuestion();dirty=true;$('questions').lastElementChild.querySelector('textarea').focus();};
$('questions').onclick=e=>{const b=e.target.closest('button'),f=b?.closest('fieldset');if(!f)return;if(b.hasAttribute('data-remove')){if(!confirm('Remove this question?'))return;f.remove();}if(b.hasAttribute('data-up')&&f.previousElementSibling)f.previousElementSibling.before(f);if(b.hasAttribute('data-down')&&f.nextElementSibling)f.nextElementSibling.after(f);dirty=true;renumber();};
async function saveQuiz() {
  if(!$('quizForm').reportValidity())return null;
  const data=await api('/quizzes'+(quizId?'/'+quizId:''),{method:quizId?'PUT':'POST',body:JSON.stringify(readQuiz())});quizId=data.id;dirty=false;$('saveStatus').textContent='Saved to your profile';$('editorHeading').textContent='Edit quiz';return quizId;
}
async function saveAction(presentNow) {
  const buttons=[$('save'),$('present')];buttons.forEach(b=>b.disabled=true);notice('');
  try{const id=await saveQuiz();if(id&&presentNow)await present(id);else if(id)notice('Quiz saved to your profile.');}catch(e){notice(e.message,true);}finally{buttons.forEach(b=>b.disabled=false);}
}
$('quizForm').onsubmit=e=>{e.preventDefault();saveAction(false);};$('present').onclick=()=>saveAction(true);
$('preview').onclick=()=>{if(!$('quizForm').reportValidity())return;const q=readQuiz();$('previewContent').innerHTML=`<h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><p>${q.questions.length} question${q.questions.length === 1 ? "" : "s"} · ${q.secondsPerQuestion} seconds per question</p>${q.questions.map((x,i)=>`<article class="preview-question"><h3>${i+1}. ${esc(x.q)}</h3><ol type="A">${x.options.map((o,j)=>`<li>${esc(o)}${j===x.answer?' <strong>✓ Correct answer</strong>':''}</li>`).join('')}</ol><p>${esc(x.source)}</p></article>`).join('')}`;$('previewDialog').showModal();};
$('closePreview').onclick=()=>$('previewDialog').close();window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{renderAuth();try{const config=await api('/config');if(!config.configured){screen('account');$('account').querySelectorAll('input,button').forEach(el=>el.disabled=true);notice('Creator accounts are being set up. Please check back soon.');return;}try{const me=await api('/me');user=me.user;await dashboard();}catch{screen('account');notice('');}}catch(e){screen('account');notice(e.message,true);}})();
