(()=>{
'use strict';
let clients=[], appointments=[], currentUser=null;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notice=(message,type='ok')=>{
  const n=$('notice');
  if(!message){n.innerHTML='';return;}
  n.innerHTML=`<div class="alert ${type}">${esc(message)}</div>`;
};
const crDate=()=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const plusDay=date=>new Date(Date.parse(date+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const formatTime=iso=>new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(iso));
const req=async(path,options={})=>{
  const res=await fetch(path,{...options,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
  const body=await res.json().catch(()=>({}));
  if(!res.ok) throw Error(body.error||('Error HTTP '+res.status));
  return body;
};
function reminderPill(status){
  const safe=esc(status||'—');
  const cls=status==='sent'?'sent':status==='pending'?'pending':'';
  return `<span class="pill ${cls}">WhatsApp: ${safe}</span>`;
}
function statusPill(status){
  const cls=status==='confirmed'?'confirmed':'';
  return `<span class="pill ${cls}">${esc(status||'—')}</span>`;
}
async function loadClients(){
  clients=await req('/api/clients');
  $('countClients').textContent=clients.length;
  $('clientSelect').innerHTML='<option value="">Seleccionar cliente</option>'+clients.map(c=>`<option value="${Number(c.id)}">${esc(c.name)} · ${esc(c.phone)}</option>`).join('');
  $('clientsList').innerHTML=clients.length
    ? `<table><thead><tr><th>Nombre</th><th>Teléfono</th><th>WhatsApp</th></tr></thead><tbody>${clients.map(c=>`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone)}</td><td>${c.whatsapp_opt_in?'Sí':'No'}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">No hay clientes todavía.</div>';
}
async function loadAppointments(){
  const date=$('day').value;
  appointments=await req('/api/appointments?from='+encodeURIComponent(date+'T00:00:00-06:00')+'&to='+encodeURIComponent(plusDay(date)+'T00:00:00-06:00'));
  $('countToday').textContent=appointments.length;
  $('countConfirmed').textContent=appointments.filter(a=>a.status==='confirmed').length;
  $('appointments').innerHTML=appointments.length
    ? appointments.map(a=>`<article class="appointment"><div class="appointmentTop"><div><strong>${esc(formatTime(a.starts_at))} – ${esc(formatTime(a.ends_at))}</strong><div class="muted" style="margin-top:4px">${esc(a.client_name)} · ${esc(a.service)}</div></div><div class="meta">${statusPill(a.status)} ${reminderPill(a.reminder_status)}</div></div><div class="muted">${esc(a.notes||'Sin notas adicionales.')}</div><div class="actions">${a.status==='confirmed'?`<button class="btn btn-soft" data-cancel="${Number(a.id)}">Cancelar</button><button class="btn btn-primary" data-complete="${Number(a.id)}">Completar</button>`:''}</div></article>`).join('')
    : '<div class="empty">No hay citas para esta fecha.</div>';
}
async function reload(){ await Promise.all([loadClients(), loadAppointments()]); }
function show(tab){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  for(const t of ['agenda','nueva','clientes','usuarios']) $(t).hidden=t!==tab;
}
$('authForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('authForm').querySelector('button');
  
  btn.disabled=true; btn.textContent='Ingresando...';
  notice('Comprobando acceso…','info');
  try{
    const result=await req('/api/auth/login',{method:'POST',body:JSON.stringify({username:$('username').value.trim(),password:$('password').value})});
    currentUser=result.user;
    $('usersTab').classList.toggle('hidden',currentUser.role!=='admin');
    await reload();
    $('login').hidden=true;
    $('workspace').hidden=false;
    $('logout').classList.remove('hidden');
    $('password').value='';
    notice('Acceso autorizado. El panel ya está listo.','ok');
  }catch(err){
    notice('No se pudo ingresar: '+err.message,'err');
  }finally{
    btn.disabled=false; btn.textContent='Entrar al panel';
  }
});
$('logout').onclick=async()=>{
  await req('/api/auth/logout',{method:'POST'}).catch(()=>{}); clients=[]; appointments=[]; currentUser=null; $('usersTab').classList.add('hidden');show('agenda');
  $('login').hidden=false; $('workspace').hidden=true; $('logout').classList.add('hidden');
  notice('Sesión cerrada.','info');
};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=async()=>{show(b.dataset.tab);if(b.dataset.tab==='usuarios'){try{await loadUsers()}catch(e){notice(e.message,'err')}}});
$('reload').onclick=()=>loadAppointments().then(()=>notice('Agenda actualizada.','ok')).catch(e=>notice(e.message,'err'));
$('day').onchange=()=>loadAppointments().catch(e=>notice(e.message,'err'));
$('clientForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('clientForm').querySelector('button');
  btn.disabled=true; btn.textContent='Guardando...';
  try{
    await req('/api/clients',{method:'POST',body:JSON.stringify({name:$('clientName').value,phone:$('clientPhone').value.trim(),whatsapp_opt_in:$('clientOpt').checked})});
    $('clientForm').reset();
    await loadClients();
    notice('Cliente registrado correctamente.','ok');
  }catch(err){
    notice(err.message,'err');
  }finally{btn.disabled=false; btn.textContent='Registrar cliente';}
});
$('appointmentForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('appointmentForm').querySelector('button');
  btn.disabled=true; btn.textContent='Guardando...';
  try{
    const start=$('apptDate').value+'T'+$('apptTime').value+':00-06:00';
    const end=new Date(Date.parse(start)+Number($('duration').value)*60000).toISOString();
    await req('/api/appointments',{method:'POST',body:JSON.stringify({client_id:Number($('clientSelect').value),service:$('service').value,starts_at:start,ends_at:end,notes:$('apptNotes').value})});
    $('day').value=$('apptDate').value;
    await loadAppointments();
    show('agenda');
    notice('Cita guardada correctamente.','ok');
    $('appointmentForm').reset();
    $('apptDate').value=crDate();
    $('apptTime').value='09:00';
  }catch(err){
    notice(err.message,'err');
  }finally{btn.disabled=false; btn.textContent='Guardar cita';}
});
$('appointments').addEventListener('click',async e=>{
  const button=e.target.closest('button[data-cancel],button[data-complete]');
  if(!button) return;
  const isCancel=button.hasAttribute('data-cancel');
  const id=button.dataset.cancel || button.dataset.complete;
  if(!confirm(isCancel?'¿Cancelar esta cita?':'¿Marcar esta cita como completada?')) return;
  try{
    await req('/api/appointments/'+id+'/status',{method:'PATCH',body:JSON.stringify({status:isCancel?'cancelled':'completed'})});
    await loadAppointments();
    notice('Cita actualizada.','ok');
  }catch(err){
    notice(err.message,'err');
  }
});

async function loadUsers(){
  const users=await req('/api/auth/users');
  $('usersList').innerHTML='<table><thead><tr><th>Cuenta</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>'+
    users.map(u=>`<tr><td>${esc(u.username)}</td><td>${u.role==='admin'?'Administrador':'Personal'}</td><td>${u.active?'Activo':'Inactivo'}</td><td><div class="actions"><button class="btn btn-soft" data-pwd="${Number(u.id)}">Clave</button>${currentUser&&Number(currentUser.id)===Number(u.id)?'':`<button class="btn btn-soft" data-toggle="${Number(u.id)}" data-active="${u.active?'1':'0'}">${u.active?'Desactivar':'Activar'}</button><button class="btn btn-soft" data-role="${Number(u.id)}" data-currentrole="${esc(u.role)}">${u.role==='admin'?'Hacer personal':'Hacer admin'}</button>`}</div></td></tr>`).join('')+'</tbody></table>';
}
$('userForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const button=$('userForm').querySelector('button');button.disabled=true;
 try{await req('/api/auth/users',{method:'POST',body:JSON.stringify({username:$('newUsername').value.trim().toLowerCase(),password:$('newPassword').value,role:$('newRole').value})});$('userForm').reset();await loadUsers();notice('Usuario creado correctamente.','ok');}
 catch(err){notice(err.message,'err');}finally{button.disabled=false;}
});
$('usersList').addEventListener('click',async e=>{
 const btn=e.target.closest('button[data-pwd],button[data-toggle],button[data-role]');if(!btn)return;
 const id=btn.dataset.pwd||btn.dataset.toggle||btn.dataset.role;
 let changes;
 if(btn.dataset.pwd){const password=prompt('Escribe nueva contraseña de al menos 12 caracteres. Evita realizar esta operación en lugares públicos.');if(password===null)return;if(password.length<12||password.length>128){notice('La contraseña debe contener entre 12 y 128 caracteres.','err');return;}changes={password};}
 else if(btn.dataset.toggle){const active=btn.dataset.active!=='1';if(!confirm(active?'¿Activar esta cuenta?':'¿Desactivar esta cuenta y cerrar sus sesiones?'))return;changes={active};}
 else {const role=btn.dataset.currentrole==='admin'?'staff':'admin';if(!confirm(`¿Cambiar la cuenta a ${role}?`))return;changes={role};}
 btn.disabled=true;
 try{await req(`/api/auth/users/${Number(id)}`,{method:'PATCH',body:JSON.stringify(changes)});await loadUsers();notice('Usuario actualizado.','ok');}
 catch(err){notice(err.message,'err');}finally{btn.disabled=false;}
});
$('day').value=crDate();
$('apptDate').value=crDate();
$('apptTime').value='09:00';
})();
