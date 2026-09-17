const $=s=>document.querySelector(s);
let activeFilter='All', events=[], selected=null, opener=null, busy=false;
const modal=$('#modal');
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
function filterEvents(){
  const list=events.filter(e=>(activeFilter==='All'||e.category===activeFilter)&&e.title.toLowerCase().includes($('#search').value.trim().toLowerCase()));
  $('.cards').replaceChildren();
  for(const event of list){
    const article=el('article','card'), art=el('div',`art ${event.art}`), body=el('div','card-body');
    art.append(el('span','code-mark',event.symbol));
    body.append(el('div','category',event.category.toUpperCase()),el('h2','',event.title),el('p','desc',event.description));
    const meta=el('div','event-meta');
    const date=new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(new Date(event.starts_at));
    meta.append(el('span','',date+' IST'),el('span','',event.venue));
    const button=el('button','register','Register for event →');
    const closed=Date.parse(event.starts_at)<=Date.now();
    if(closed || !event.remaining){button.disabled=true;button.textContent=closed?'Registration closed':'Event full';}
    button.addEventListener('click',()=>openRegistration(event,button));
    body.append(meta,el('p','status',`${event.remaining} of ${event.capacity} places available`),button);
    article.append(art,body);$('.cards').append(article);
  }
  $('#empty').textContent='No events match your search.';$('#empty').classList.toggle('visible',!list.length);
}
async function loadEvents(){
  try{
    const response=await fetch('/api/events');if(!response.ok)throw new Error();
    const data=await response.json();events=data.events;$('#event-count').textContent=String(events.length).padStart(2,'0');
    $('#connection').textContent='Connected to server · Registrations saved in '+data.storage;filterEvents();
  }catch{
    $('#connection').textContent='Cannot connect to the server. Refresh the page to try again.';
    if(!events.length){$('#empty').textContent='Events are unavailable. Please try again later.';$('#empty').classList.add('visible');}
  }
}
function openRegistration(event,button){
  selected=event;opener=button;$('#selected-event').textContent=event.title;$('#registration').reset();$('#error').textContent='';
  $('#form-panel').classList.remove('hidden');$('#success-panel').classList.add('hidden');modal.classList.add('open');
  document.querySelector('main').inert=true;document.querySelector('header').inert=true;$('#name').focus();
}
function closeModal(){if(busy)return;modal.classList.remove('open');document.querySelector('main').inert=false;document.querySelector('header').inert=false;(opener?.isConnected?opener:$('#search')).focus();}
$('.close').addEventListener('click',closeModal);$('#done').addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{
  if(!modal.classList.contains('open'))return;
  if(e.key==='Escape')closeModal();
  if(e.key==='Tab') {const items=[...modal.querySelectorAll('button,input')].filter(n=>!n.disabled&&n.getClientRects().length),first=items[0],last=items.at(-1); if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
document.querySelectorAll('.tab').forEach(tab=>{tab.setAttribute('aria-pressed',String(tab.classList.contains('active')));tab.addEventListener('click',()=>{activeFilter=tab.dataset.filter;document.querySelectorAll('.tab').forEach(t=>{t.classList.toggle('active',t===tab);t.setAttribute('aria-pressed',String(t===tab));});filterEvents();});});
$('#search').addEventListener('input',filterEvents);
$('#registration').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  const name=$('#name').value.trim(),email=$('#email').value.trim(),error=$('#error'),button=$('#registration .confirm');
  if(name.length<2||name.length>80){error.textContent='Enter a name between 2 and 80 characters.';return;}
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){error.textContent='Please enter a valid email address.';return;}
  busy=true;button.disabled=true;button.textContent='Saving registration…';error.textContent='';
  try{
    const response=await fetch('/api/registrations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,eventId:selected.id}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error || 'Registration failed.');
    $('#saved-event').textContent=data.registration.event;$('#saved-name').textContent=data.registration.name;$('#saved-email').textContent=data.registration.email;$('#receipt').textContent='Registration ID: '+data.registration.id;
    $('#form-panel').classList.add('hidden');$('#success-panel').classList.remove('hidden');$('#done').focus();await loadEvents();
  }catch(err){error.textContent=err.name==='TimeoutError'?'Request timed out. Check with the administrator before retrying.':err instanceof TypeError?'Unable to contact the server. Please try again.':err.message;}
  finally{busy=false;button.disabled=false;button.textContent='Confirm registration';}
});
loadEvents();
