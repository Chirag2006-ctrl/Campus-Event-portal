const $=s=>document.querySelector(s);let accessKey='';
async function refresh(){
  $('#admin-error').textContent='';
  try{
    const response=await fetch('/api/admin/registrations',{headers:{Authorization:'Bearer '+accessKey},signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to load registrations.');
    $('#admin-login').classList.add('hidden');$('#records').classList.remove('hidden');$('#token').value='';
    $('#total').textContent=data.registrations.length+' saved registration'+(data.registrations.length===1?'':'s');$('#rows').replaceChildren();
    for(const record of data.registrations){const tr=document.createElement('tr');for(const value of [record.name,record.email,record.event,new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(record.created_at))]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('#rows').append(tr);}
    if(!data.registrations.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='No registrations yet.';tr.append(td);$('#rows').append(tr);}
  }catch(error){$('#admin-error').textContent=error.message;}
}
$('#admin-login').addEventListener('submit',async e=>{e.preventDefault();accessKey=$('#token').value.trim();await refresh();});
$('#refresh').addEventListener('click',refresh);
$('#logout').addEventListener('click',()=>{accessKey='';$('#rows').replaceChildren();$('#records').classList.add('hidden');$('#admin-login').classList.remove('hidden');$('#token').focus();});
