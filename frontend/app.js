// ══════════════════════════════════════════════════════════
// SyndicPro v2.1 — app.js
// ══════════════════════════════════════════════════════════
const API = '/api';

let state = { token: localStorage.getItem('sp_token'), user: null, currentPage: '' };
const loaded = new Set();

// ── API ───────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, { headers, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401) { doLogout(); return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}
const GET  = p    => api(p);
const POST = (p,b) => api(p, { method:'POST', body:b });
const PUT  = (p,b) => api(p, { method:'PUT',  body:b });
const DEL  = p    => api(p, { method:'DELETE' });

// ── TOAST ─────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type='success') {
  const t=document.getElementById('toast'), i=document.getElementById('toast-icon'), m=document.getElementById('toast-msg');
  t.className='toast show'+(type==='error'?' error':type==='warn'?' warn':'');
  i.className=type==='error'?'fa-solid fa-circle-exclamation':type==='warn'?'fa-solid fa-triangle-exclamation':'fa-solid fa-circle-check';
  m.textContent=msg; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3800);
}
function showError(msg){showToast(msg,'error');}

// ── UTILS ─────────────────────────────────────────────────
function statusPill(s){const m={paye:['green','✓ Payé'],en_attente:['gray','En attente'],retard:['orange','⏱ Retard'],impaye:['red','✗ Impayé'],ouvert:['orange','Ouvert'],en_cours:['yellow','En cours'],resolu:['green','✓ Résolu'],ferme:['gray','Fermé'],planifie:['blue','Planifié'],termine:['green','Terminé'],success:['green','OK'],failed:['red','Échec']};const[c,l]=m[s]||['gray',s];return`<span class="pill pill-${c}">${l}</span>`;}
function fmtDate(d){if(!d)return'—';return new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});}
function fmtDateTime(d){if(!d)return'—';return new Date(d).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function ini(u){return((u.prenom||'?')[0]+(u.nom||'?')[0]).toUpperCase();}

// ── AUTH ──────────────────────────────────────────────────
function fillLogin(e,p){document.getElementById('login-email').value=e;document.getElementById('login-password').value=p;}
async function doLogin() {
  const email=document.getElementById('login-email').value.trim();
  const pwd=document.getElementById('login-password').value;
  const btn=document.getElementById('login-submit');
  const err=document.getElementById('login-error');
  err.style.display='none';
  if(!email||!pwd){document.getElementById('login-error-msg').textContent='Remplissez tous les champs.';err.style.display='flex';return;}
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Connexion…';
  try {
    const data=await POST('/auth/login',{email,password:pwd});
    if(!data)return;
    state.token=data.token; state.user=data.user;
    localStorage.setItem('sp_token',data.token);
    initApp();
  } catch(e){
    document.getElementById('login-error-msg').textContent=e.error||'Identifiants incorrects.';
    err.style.display='flex';
  } finally { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> Se connecter'; }
}
document.getElementById('login-password').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});

function doLogout(){
  localStorage.removeItem('sp_token'); state.token=null; state.user=null; loaded.clear();
  document.getElementById('app').style.display='none';
  document.getElementById('login-screen').style.display='flex';
}

// ── INIT ──────────────────────────────────────────────────
async function initApp(){
  if(!state.token)return;
  try{state.user=await GET('/auth/me'); if(!state.user)return;}catch{doLogout();return;}
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').style.display='block';
  const u=state.user;
  const initials=((u.prenom||'?')[0]+(u.nom||'?')[0]).toUpperCase();
  document.getElementById('user-av').textContent=initials;
  document.getElementById('user-name-top').textContent=`${u.prenom} ${u.nom}`;

  // ── Isolation stricte par rôle ─────────────────────────
  document.getElementById('nav-resident').style.display='none';
  document.getElementById('nav-gestionnaire').style.display='none';
  document.getElementById('nav-admin').style.display='none';

  if(u.role==='admin'){
    document.getElementById('user-av').style.background='var(--violet)';
    document.getElementById('user-role-top').textContent='Administrateur';
    document.getElementById('nav-admin').style.display='';
    showPage('a-dashboard');
  } else if(u.role==='gestionnaire'){
    document.getElementById('user-av').style.background='var(--accent)';
    document.getElementById('user-role-top').textContent='Gestionnaire · Syndic';
    document.getElementById('nav-gestionnaire').style.display='';
    showPage('g-dashboard');
  } else {
    document.getElementById('user-av').style.background='var(--info)';
    document.getElementById('user-role-top').textContent=`Copropriétaire · Lot ${u.lot||'—'}`;
    document.getElementById('nav-resident').style.display='';
    showPage('r-dashboard');
  }
}

// ── NAVIGATION ────────────────────────────────────────────
function showPage(id){
  // Vérification de sécurité : rôle vs page
  const role=state.user?.role||'resident';
  if(id.startsWith('a-')&&role!=='admin')return;
  if(id.startsWith('g-')&&role!=='gestionnaire')return;
  if(id.startsWith('r-')&&role==='admin')return;

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el=document.getElementById('page-'+id); if(el)el.classList.add('active');
  state.currentPage=id;
  document.querySelectorAll('.nav-item').forEach(item=>{
    const oc=item.getAttribute('onclick')||'';
    item.classList.toggle('active',oc.includes("'"+id+"'"));
  });
  if(window.innerWidth<=768)closeSidebar();
  loadPage(id);
}

async function loadPage(id){
  if(loaded.has(id))return; loaded.add(id);
  try{
    switch(id){
      case 'r-dashboard':    await loadRDashboard(); break;
      case 'r-finances':     await loadRFinances(); break;
      case 'r-incidents':    await loadRIncidents(); break;
      case 'r-documents':    await loadRDocuments(); break;
      case 'r-messagerie':   await loadRMessagerie(); break;
      case 'r-ag':           await loadRAG(); break;
      case 'r-profil':       renderRProfil(); break;
      case 'g-dashboard':    await loadGDashboard(); break;
      case 'g-comptabilite': await loadGCompta(); break;
      case 'g-impayes':      await loadGImpayes(); break;
      case 'g-travaux':      await loadGTravaux(); break;
      case 'g-ag':           await loadGAG(); break;
      case 'g-residents':    await loadGResidents(); break;
      case 'g-documents':    await loadGDocuments(); break;
      case 'g-notifications':await loadGNotifications(); break;
      case 'g-agenda':       await loadGAgenda(); break;
      case 'g-settings':     await loadGSettings(); break;
      case 'a-dashboard':    await loadADashboard(); break;
      case 'a-users':        await loadAUsers(); break;
      case 'a-roles':        await loadARoles(); break;
      case 'a-types-charges':await loadATypes('charges'); break;
      case 'a-types-depenses':await loadATypes('depenses'); break;
      case 'a-types-reclamations':await loadATypes('reclamations'); break;
      case 'a-residences':   await loadAResidences(); break;
      case 'a-notifications-log':await loadANotifLog(); break;
      case 'a-agenda':       await loadGAgenda(true); break;
    }
  }catch(e){
    console.error('Page load error',id,e);
    setPageContent(id,`<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Erreur : ${e.message||e.error||'inconnue'}</p><button class="btn btn-ghost btn-sm" onclick="loaded.delete('${id}');loadPage('${id}')"><i class="fa-solid fa-rotate-right"></i> Réessayer</button></div>`);
  }
}

function setPageContent(id,html){const el=document.getElementById('page-'+id);if(el)el.innerHTML=html;}

// ══════════════════════ RÉSIDENT ═══════════════════════════

async function loadRDashboard(){
  const data=await GET('/dashboard/resident'); if(!data)return;
  const u=data.user, pa=data.prochainAppel;
  const openInc=data.incidentsRecents?.filter(i=>i.statut!=='resolu'&&i.statut!=='ferme').length||0;
  const b=document.getElementById('badge-incidents');
  if(b){b.textContent=openInc||'';b.style.display=openInc?'':'none';}
  setPageContent('r-dashboard',`
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Bonjour, ${u.prenom} ${u.nom} 👋</h1><p>${state.user.residence_nom||'Résidence'} · Appartement ${u.lot||'—'}</p></div>
      <div class="hdr-actions"><button class="btn btn-primary btn-sm" onclick="openModal('modal-incident')"><i class="fa-solid fa-plus"></i> Signaler</button></div>
    </div>
    <div class="metrics-grid">
      <div class="metric ${pa&&pa.statut!=='paye'?'danger':''}">
        <div class="metric-icon"><i class="fa-solid fa-file-invoice"></i></div>
        <div class="metric-val">${pa?parseFloat(pa.montant||0).toLocaleString('fr-FR'):0} <span style="font-size:1rem;font-weight:400">MAD</span></div>
        <div class="metric-label">Charges dues</div>
        <div class="metric-sub">${pa?'Échéance '+fmtDate(pa.echeance):'Tout est à jour ✓'}</div>
      </div>
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-check-double"></i></div>
        <div class="metric-val">${parseFloat(data.totalPaye||0).toLocaleString('fr-FR')} <span style="font-size:1rem;font-weight:400">MAD</span></div>
        <div class="metric-label">Payé ce trimestre</div>
      </div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-wrench"></i></div>
        <div class="metric-val">${openInc}</div><div class="metric-label">Réclamations actives</div>
      </div>
      <div class="metric info"><div class="metric-icon"><i class="fa-solid fa-building"></i></div>
        <div class="metric-val">${u.tantiemes||0}<span style="font-size:1rem">/1000</span></div>
        <div class="metric-label">Tantièmes</div><div class="metric-sub">Lot ${u.lot||'—'}</div>
      </div>
    </div>
    ${pa&&pa.statut!=='paye'?`<div class="pay-banner">
      <div><div style="font-size:11px;opacity:.7;margin-bottom:4px">APPEL DE FONDS</div><div class="amount">${parseFloat(pa.montant||0).toLocaleString('fr-FR')} MAD</div></div>
      <div class="label">${pa.periode||''}<div class="due">Échéance le ${fmtDate(pa.echeance)}</div></div>
      <button class="pay-banner-btn" onclick="openPayModalWithId(${pa.id},'${pa.periode}',${pa.montant})"><i class="fa-solid fa-credit-card"></i> Payer maintenant</button>
    </div>`:''}
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-clock-rotate-left"></i> Activité récente</div>
        <div class="timeline">
          ${(data.historiquePaiements||[]).slice(0,4).map(p=>`<div class="tl-item"><div class="tl-dot ${p.statut==='paye'?'':'orange'}"></div><div class="tl-body"><div class="tl-date">${fmtDate(p.date_paiement||p.echeance)}</div><div class="tl-text"><strong>${p.statut==='paye'?'Paiement confirmé':'Charges en attente'}</strong> — ${p.periode||''}</div></div></div>`).join('')}
          ${(data.incidentsRecents||[]).slice(0,2).map(i=>`<div class="tl-item"><div class="tl-dot orange"></div><div class="tl-body"><div class="tl-date">${fmtDate(i.created_at)}</div><div class="tl-text"><strong>Réclamation ${i.statut==='resolu'?'résolue':'signalée'}</strong> — ${i.type||''}</div></div></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-bell"></i> Alertes</div>
        <div class="incident-list">
          ${pa&&pa.statut!=='paye'?`<div class="incident-card" onclick="showPage('r-finances')"><div class="inc-icon inc-red"><i class="fa-solid fa-file-invoice"></i></div><div class="incident-body"><div class="incident-title">Paiement en attente — ${pa.periode||''}</div><div class="incident-sub">${parseFloat(pa.montant||0).toLocaleString('fr-FR')} MAD · ${fmtDate(pa.echeance)}</div></div><span class="pill pill-red">Urgent</span></div>`:''}
          ${data.prochaineAG?`<div class="incident-card" onclick="showPage('r-ag')"><div class="inc-icon inc-blue"><i class="fa-solid fa-users"></i></div><div class="incident-body"><div class="incident-title">AG le ${fmtDate(data.prochaineAG.date_ag)}</div><div class="incident-sub">${data.prochaineAG.lieu||''}</div></div><span class="pill pill-blue">Voter</span></div>`:''}
          ${!pa&&!data.prochaineAG&&!openInc?`<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Tout est en ordre !</p></div>`:''}
        </div>
      </div>
    </div>`);
}

async function loadRFinances(){
  const charges=await GET('/charges/resident/moi'); if(!charges)return;
  const en=charges.filter(c=>c.statut!=='paye');
  setPageContent('r-finances',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Finances & Paiements</h1><p>Suivi de vos charges</p></div></div>
    ${en.map(p=>`<div class="pay-banner">
      <div><div style="font-size:11px;opacity:.7;margin-bottom:4px">À RÉGLER — ${p.periode||''}</div><div class="amount">${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</div></div>
      <div class="label">${p.description||p.periode||''}<div class="due">Échéance ${fmtDate(p.echeance)}</div></div>
      <button class="pay-banner-btn" onclick="openPayModalWithId(${p.id},'${p.periode}',${p.montant})"><i class="fa-solid fa-credit-card"></i> Payer</button>
    </div>`).join('')}
    ${!en.length?`<div class="card" style="background:var(--primary-pale);border-color:#b3dccb"><div style="display:flex;align-items:center;gap:12px;color:var(--primary);padding:.5rem"><i class="fa-solid fa-circle-check fa-2x"></i><strong>Toutes les charges sont à jour !</strong></div></div>`:''}
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-receipt"></i> Historique complet</div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Période</th><th>Échéance</th><th>Montant</th><th>Paiement</th><th>Mode</th><th>Statut</th></tr></thead>
        <tbody>${charges.map(p=>`<tr><td><strong>${p.periode||''}</strong></td><td>${fmtDate(p.echeance)}</td><td><strong>${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</strong></td><td>${fmtDate(p.date_paiement)}</td><td>${p.mode||'—'}</td><td>${statusPill(p.statut)}</td>
          ${p.statut!=='paye'?`<td><button class="btn btn-primary btn-xs" onclick="openPayModalWithId(${p.id},'${p.periode}',${p.montant})"><i class="fa-solid fa-credit-card"></i> Payer</button></td>`:'<td></td>'}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`);
}

async function loadRIncidents(){
  const data=await GET('/incidents'); if(!data)return;
  const typeIcon={Plomberie:'droplet',Ascenseur:'elevator',Électricité:'bolt','Parties communes':'building',Sécurité:'shield-halved',Nuisances:'volume-high',Autre:'wrench'};
  const actifs=data.filter(i=>i.statut!=='resolu'&&i.statut!=='ferme');
  const resolus=data.filter(i=>i.statut==='resolu'||i.statut==='ferme');
  setPageContent('r-incidents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Mes réclamations</h1><p>${actifs.length} en cours · ${resolus.length} résolues</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-incident')"><i class="fa-solid fa-plus"></i> Signaler</button></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-circle-dot"></i> En cours (${actifs.length})</div>
      ${actifs.length?`<div class="incident-list">${actifs.map(i=>`
        <div class="incident-card">
          <div class="inc-icon inc-${i.statut==='en_cours'?'orange':'red'}"><i class="fa-solid fa-${typeIcon[i.type]||'wrench'}"></i></div>
          <div class="incident-body"><div class="incident-title">${i.type} — ${i.localisation||''}</div>
          <div class="incident-sub">Signalé le ${fmtDate(i.created_at)}</div>
          ${i.prestataire?`<div class="incident-sub" style="color:var(--primary)">↳ Prestataire : ${i.prestataire}</div>`:''}
          <div class="progress-bar"><div class="progress-fill ${i.statut==='ouvert'?'orange':''}" style="width:${i.statut==='ouvert'?20:60}%"></div></div>
          </div>${statusPill(i.statut)}
        </div>`).join('')}</div>`:`<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Aucune réclamation en cours</p></div>`}
    </div>
    ${resolus.length?`<div class="card"><div class="card-hdr"><i class="fa-solid fa-check-circle"></i> Résolues</div>
      <div class="incident-list">${resolus.map(i=>`<div class="incident-card" style="opacity:.65">
        <div class="inc-icon inc-green"><i class="fa-solid fa-${typeIcon[i.type]||'check'}"></i></div>
        <div class="incident-body"><div class="incident-title">${i.type} — ${i.localisation||''}</div>
        <div class="incident-sub">Résolu ${fmtDate(i.date_resolution)} · ${i.prestataire||'Syndic'}</div></div>
        <span class="pill pill-green">✓ Résolu</span></div>`).join('')}
      </div></div>`:''}`);}

async function loadRDocuments(){
  const data=await GET('/documents'); if(!data)return;
  const docIcon=d=>{const e=(d.nom||'').split('.').pop().toLowerCase();return e==='pdf'?'file-pdf':e==='doc'||e==='docx'?'file-word':e==='xls'||e==='xlsx'?'file-excel':e.match(/jpe?g|png|gif/)?'file-image':'file';}
  const cats={ag:'Assemblées Générales',reglementation:'Réglementation',contrats:'Contrats',financier:'Financier',autre:'Autres'};
  const byCat={}; data.forEach(d=>{(byCat[d.categorie]=byCat[d.categorie]||[]).push(d);});
  setPageContent('r-documents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Documents</h1><p>${data.length} document(s) disponibles</p></div></div>
    ${data.length===0?`<div class="card"><div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>Aucun document disponible pour l'instant</p></div></div>`:''}
    ${Object.keys(cats).filter(c=>byCat[c]?.length).map(c=>`
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-folder-open"></i> ${cats[c]} <span class="pill pill-gray" style="margin-left:auto">${byCat[c].length}</span></div>
      <div class="doc-grid">${byCat[c].map(d=>`
        <div class="doc-card" title="${d.nom}" ${d.url?`onclick="window.open('${d.url}','_blank')"`:''}>
          <div class="doc-icon"><i class="fa-solid fa-${docIcon(d)}" style="color:var(--accent)"></i></div>
          <div class="doc-name">${d.nom}</div>
          <div class="doc-date">${fmtDate(d.created_at)}</div>
          ${d.taille_ko?`<div class="doc-size">${d.taille_ko} Ko</div>`:''}
          ${d.url?`<a class="doc-dl btn btn-primary btn-xs" href="${d.url}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-download"></i> Télécharger</a>`:
          `<span class="pill pill-gray" style="font-size:10px">Pas de fichier</span>`}
        </div>`).join('')}
      </div>
    </div>`).join('')}`);
}

async function loadRMessagerie(){
  const [syndic,forum]=await Promise.all([GET('/messages?canal=syndic'),GET('/messages?canal=forum')]);
  const myId=state.user.id;
  const renderThread=msgs=>msgs.map(m=>{
    const isMe=m.expediteur_id===myId;
    const av=((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase();
    const avCls=isMe?'av-b':m.role==='gestionnaire'?'av-g':'av-a';
    const t=new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    return`<div class="msg-row ${isMe?'me':''}"><div class="av ${avCls}">${av}</div><div><div class="bubble ${isMe?'bubble-me':'bubble-them'}">${m.contenu}</div><div class="bubble-time ${isMe?'me':''}">${isMe?'Vous':m.prenom} · ${t}</div></div></div>`;
  }).join('');
  setPageContent('r-messagerie',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Messagerie</h1></div></div>
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-headset"></i> Syndic — Support</div>
        <div class="msg-wrapper" id="msg-syndic">${renderThread(syndic||[])}</div>
        <div class="msg-input-area"><input class="form-control" id="msg-input-syndic" placeholder="Message au syndic…" onkeydown="if(event.key==='Enter')sendMessage('syndic')"><button class="btn btn-primary" onclick="sendMessage('syndic')"><i class="fa-solid fa-paper-plane"></i></button></div>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-people-group"></i> Forum résidents</div>
        <div class="msg-wrapper" id="msg-forum">${renderThread(forum||[])}</div>
        <div class="msg-input-area"><input class="form-control" id="msg-input-forum" placeholder="Message au forum…" onkeydown="if(event.key==='Enter')sendMessage('forum')"><button class="btn btn-primary" onclick="sendMessage('forum')"><i class="fa-solid fa-paper-plane"></i></button></div>
      </div>
    </div>`);
  ['syndic','forum'].forEach(c=>{const el=document.getElementById('msg-'+c);if(el)el.scrollTop=el.scrollHeight;});
}

async function sendMessage(canal){
  const input=document.getElementById('msg-input-'+canal);
  const contenu=input?.value?.trim(); if(!contenu)return; input.value='';
  try{await POST('/messages',{canal,contenu}); loaded.delete('r-messagerie'); await loadRMessagerie();}catch{showError('Erreur envoi');}
}

async function loadRAG(){
  const ags=await GET('/ag'); if(!ags)return;
  const ag=ags.find(a=>a.statut==='planifie')||ags[0];
  if(!ag){setPageContent('r-ag',`<div class="page-hdr"><div class="page-hdr-left"><h1>Assemblées Générales</h1></div></div><div class="card"><div class="empty-state"><i class="fa-solid fa-users"></i><p>Aucune AG programmée</p></div></div>`);return;}
  const votes=await GET('/ag/'+ag.id+'/votes');
  const resolutions=ag.ordre_du_jour||[];
  const totaux={}; (votes?.totaux||[]).forEach(v=>{totaux[v.resolution_num]=v;});
  const monVote={}; (votes?.monVote||[]).forEach(v=>{monVote[v.resolution_num]=v.choix;});
  setPageContent('r-ag',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Assemblée Générale</h1><p>${fmtDate(ag.date_ag)}</p></div></div>
    <div class="card"><div class="card-hdr"><i class="fa-solid fa-circle-info"></i> Informations</div>
      <div style="display:flex;gap:2rem;flex-wrap:wrap;font-size:13px;color:var(--text-2)">
        <div><i class="fa-solid fa-calendar" style="color:var(--primary)"></i> <strong>${fmtDate(ag.date_ag)}</strong> à ${new Date(ag.date_ag).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
        ${ag.lieu?`<div><i class="fa-solid fa-location-dot" style="color:var(--primary)"></i> ${ag.lieu}</div>`:''}
        <div>${statusPill(ag.statut)}</div>
      </div>
    </div>
    <div class="card"><div class="card-hdr"><i class="fa-solid fa-vote-yea"></i> Résolutions à voter</div>
      <div>${resolutions.length?resolutions.map(r=>{
        const t=totaux[r.num]||{pour:r.pour||0,contre:r.contre||0,abstention:r.abstention||0};
        const mv=monVote[r.num];
        return`<div class="vote-item"><div><div class="vote-q">${r.num}. ${r.titre}</div><div class="vote-sub">Pour: ${t.pour} · Contre: ${t.contre} · Abs: ${t.abstention}</div></div>
          ${mv?`<span class="pill pill-green">✓ ${mv}</span>`:
          `<div class="vote-actions"><button class="btn btn-sm v-yes" onclick="castVote(${ag.id},${r.num},'pour',this)">✓ Pour</button><button class="btn btn-sm v-no" onclick="castVote(${ag.id},${r.num},'contre',this)">✗ Contre</button><button class="btn btn-sm v-abs" onclick="castVote(${ag.id},${r.num},'abstention',this)">— Abs.</button></div>`}
        </div>`;}).join(''):`<div class="empty-state"><i class="fa-solid fa-vote-yea"></i><p>Ordre du jour à définir</p></div>`}
      </div>
    </div>`);
}

async function castVote(agId,resNum,choix,btn){
  btn.disabled=true;
  try{await POST('/ag/'+agId+'/votes',{resolution_num:resNum,choix});showToast(`🗳️ Vote "${choix}" enregistré`);btn.closest('.vote-actions').outerHTML=`<span class="pill pill-green">✓ ${choix}</span>`;}
  catch{showError('Erreur vote');btn.disabled=false;}
}

function renderRProfil(){
  const u=state.user;
  setPageContent('r-profil',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Mon profil</h1></div></div>
    <div class="grid-2">
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-user"></i> Informations</div>
        <div class="form-row"><div class="form-group"><label class="form-label">Prénom</label><input class="form-control" id="p-prenom" value="${u.prenom||''}"></div><div class="form-group"><label class="form-label">Nom</label><input class="form-control" id="p-nom" value="${u.nom||''}"></div></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-control" value="${u.email}" disabled style="opacity:.6"></div>
        <div class="form-group"><label class="form-label">Téléphone</label><input class="form-control" id="p-tel" value="${u.telephone||''}"></div>
        <button class="btn btn-primary btn-sm" onclick="saveProfile()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
      </div>
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-bell"></i> Notifications</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-email" ${u.notif_email?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Rappels par email</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-sms" ${u.notif_sms?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Notifications SMS</span></div>
        </div>
        <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid var(--border);font-size:13px;color:var(--text-2)">
          <div>Lot : <strong>${u.lot||'—'}</strong></div>
          <div style="margin-top:4px">Tantièmes : <strong>${u.tantiemes||0}/1000</strong></div>
          <div style="margin-top:4px">Résidence : <strong>${state.user.residence_nom||'—'}</strong></div>
        </div>
      </div>
    </div>`);
}

async function saveProfile(){
  try{const r=await PUT('/auth/me',{prenom:document.getElementById('p-prenom').value,nom:document.getElementById('p-nom').value,telephone:document.getElementById('p-tel').value,notif_email:document.getElementById('sw-email').checked,notif_sms:document.getElementById('sw-sms').checked});if(r){state.user={...state.user,...r};showToast('✅ Profil mis à jour');}}
  catch{showError('Erreur');}
}

// ══════════════════════ GESTIONNAIRE ═══════════════════════

async function loadGDashboard(){
  const data=await GET('/dashboard/gestionnaire'); if(!data)return;
  const b=document.getElementById('badge-impayes');
  if(b){b.textContent=data.nbImpayes||'';b.style.display=data.nbImpayes?'':'none';}
  setPageContent('g-dashboard',`
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Vue d'ensemble</h1><p>${state.user.residence_nom||'Résidence'}</p></div>
      <div class="hdr-actions">
        <button class="btn btn-ghost btn-sm" onclick="showPage('g-notifications')"><i class="fa-solid fa-paper-plane"></i> Notifier</button>
        <button class="btn btn-primary btn-sm" onclick="openModal('modal-appel-fonds')"><i class="fa-solid fa-plus"></i> Appel de fonds</button>
      </div>
    </div>
    <div class="metrics-grid">
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-percent"></i></div><div class="metric-val">${data.tauxRecouvrement||0}<span style="font-size:1.2rem">%</span></div><div class="metric-label">Taux recouvrement</div></div>
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="metric-val">${parseFloat(data.totalImpayes||0).toLocaleString('fr-FR')} <span style="font-size:1rem">MAD</span></div><div class="metric-label">Impayés · ${data.nbImpayes||0} dossiers</div></div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-piggy-bank"></i></div><div class="metric-val">${parseFloat(data.budgetAnnuel||0).toLocaleString('fr-FR')} <span style="font-size:1rem">MAD</span></div><div class="metric-label">Budget annuel</div></div>
      <div class="metric info"><div class="metric-icon"><i class="fa-solid fa-hammer"></i></div><div class="metric-val">${data.incidentsActifs||0}</div><div class="metric-label">Interventions actives</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-chart-bar"></i> Impayés par résident</div>
        <div class="chart-bar-wrap">
          ${(data.impayesDetail||[]).slice(0,5).map(i=>`<div class="chart-bar-row">
            <div class="chart-bar-label">${i.prenom} ${i.nom}</div>
            <div class="chart-bar-track"><div class="chart-bar-fill accent" style="width:${Math.min(100,Math.round((+i.jours_retard||0)/90*100))}%"><span>${i.jours_retard||0}j</span></div></div>
          </div>`).join('')}
          ${!data.impayesDetail?.length?`<div class="empty-state" style="padding:.5rem"><i class="fa-solid fa-circle-check"></i><p>Aucun impayé !</p></div>`:''}
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-bolt"></i> Actions rapides</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="openModal('modal-appel-fonds')"><i class="fa-solid fa-file-invoice-dollar"></i> Nouvel appel de fonds</button>
          <button class="btn btn-ghost btn-sm" onclick="openModal('modal-resident')"><i class="fa-solid fa-user-plus"></i> Ajouter un résident</button>
          <button class="btn btn-ghost btn-sm" onclick="openModal('modal-upload-doc')"><i class="fa-solid fa-cloud-arrow-up"></i> Publier un document</button>
          <button class="btn btn-ghost btn-sm" onclick="openModal('modal-ag-create')"><i class="fa-solid fa-users"></i> Convoquer une AG</button>
          <button class="btn btn-ghost btn-sm" onclick="showPage('g-notifications')"><i class="fa-solid fa-paper-plane"></i> Envoyer notifications</button>
        </div>
      </div>
    </div>`);
}

async function loadGCompta(){
  const charges=await GET('/charges'); if(!charges)return;
  const actif=charges.find(c=>c.statut==='actif')||charges[0];
  setPageContent('g-comptabilite',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Comptabilité</h1></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-appel-fonds')"><i class="fa-solid fa-plus"></i> Appel de fonds</button></div>
    </div>
    ${actif?`<div style="display:flex;align-items:center;gap:10px;background:var(--primary-pale);border:1px solid #b3dccb;border-radius:var(--radius-sm);padding:10px 14px;flex-wrap:wrap">
      <i class="fa-solid fa-paper-plane" style="color:var(--primary)"></i>
      <span style="flex:1;font-size:13px;color:var(--primary)">Notifier les résidents pour <strong>${actif.periode}</strong></span>
      <button class="btn btn-primary btn-sm" onclick="notifyAppelFonds(${actif.id},'${actif.periode}')"><i class="fa-solid fa-envelope"></i> Envoyer</button>
    </div>`:''}
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-table"></i> Paiements — ${actif?.periode||'—'}
        <div class="card-hdr-right">${charges.map(c=>`<button class="btn btn-ghost btn-xs" onclick="reloadComptaFor(${c.id})">${c.periode}</button>`).join('')}</div>
      </div>
      <div id="compta-table"><div class="loading-state"><i class="fa-solid fa-circle-notch"></i></div></div>
    </div>`);
  if(actif)await reloadComptaFor(actif.id);
}

async function reloadComptaFor(appelId){
  const paiements=await GET('/charges/'+appelId+'/paiements'); if(!paiements)return;
  const wrap=document.getElementById('compta-table');
  if(!wrap)return;
  wrap.innerHTML=`<div style="overflow-x:auto"><table class="data-table">
    <thead><tr><th>Copropriétaire</th><th>Lot</th><th>Montant</th><th>Date</th><th>Mode</th><th>Statut</th><th></th></tr></thead>
    <tbody>${paiements.map(p=>`<tr>
      <td><strong>${p.prenom} ${p.nom}</strong></td><td>${p.lot||'—'}</td>
      <td>${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</td>
      <td>${fmtDate(p.date_paiement)}</td><td>${p.mode||'—'}</td><td>${statusPill(p.statut)}</td>
      <td>${p.statut!=='paye'?`<button class="btn btn-ghost btn-xs" onclick="showToast('📩 Relance envoyée à ${p.prenom}')"><i class="fa-solid fa-envelope"></i></button>`:''}
    </td></tr>`).join('')}
    </tbody></table></div>`;
}

async function loadGImpayes(){
  const data=await GET('/dashboard/gestionnaire'); if(!data)return;
  const im=data.impayesDetail||[];
  setPageContent('g-impayes',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Impayés</h1><p>${im.length} dossier(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="notifyImpayes()"><i class="fa-solid fa-paper-plane"></i> Relance groupée</button></div>
    </div>
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div><div class="metric-val">${parseFloat(data.totalImpayes||0).toLocaleString('fr-FR')} MAD</div><div class="metric-label">Total impayés</div></div>
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-users"></i></div><div class="metric-val">${data.nbImpayes||0}</div><div class="metric-label">Dossiers actifs</div></div>
      <div class="metric violet"><div class="metric-icon"><i class="fa-solid fa-robot"></i></div><div class="metric-val">Auto</div><div class="metric-label">Relances planifiées</div><div class="metric-sub" onclick="showPage('g-agenda')" style="cursor:pointer;color:var(--violet);font-size:11px">Voir agenda →</div></div>
    </div>
    <div class="card"><div class="card-hdr"><i class="fa-solid fa-list"></i> Par ancienneté</div>
      ${im.length?`<div>${im.map(i=>{const j=i.jours_retard||0;return`<div class="impaye-item">
        <div class="imp-av">${ini(i)}</div>
        <div style="flex:1"><div class="imp-name">${i.prenom} ${i.nom} — Lot ${i.lot||'—'}</div>
        <div class="imp-detail">${j>60?'🔴 Mise en demeure':j>30?'🟠 2e relance':'🟡 1ère relance'}</div></div>
        <div style="text-align:right"><div class="imp-amount">${parseFloat(i.montant||0).toLocaleString('fr-FR')} MAD</div>
        <div style="font-size:11px;color:${j>30?'var(--danger)':'var(--text-3)'}">${j}j de retard</div></div>
        <button class="btn btn-ghost btn-xs" onclick="showToast('📩 Relance envoyée à ${i.prenom}')"><i class="fa-solid fa-envelope"></i></button>
      </div>`}).join('')}</div>`:`<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Aucun impayé !</p></div>`}
    </div>`);
}

async function loadGTravaux(){
  const data=await GET('/incidents'); if(!data)return;
  const actifs=data.filter(i=>i.statut==='ouvert'||i.statut==='en_cours');
  const resolus=data.filter(i=>i.statut==='resolu').slice(0,5);
  setPageContent('g-travaux',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Travaux & Entretien</h1><p>${actifs.length} active(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-incident')"><i class="fa-solid fa-plus"></i> Nouvelle intervention</button></div>
    </div>
    <div class="card"><div class="card-hdr"><i class="fa-solid fa-hard-hat"></i> Interventions en cours</div>
      ${actifs.length?`<div class="incident-list">${actifs.map(i=>`
        <div class="incident-card">
          <div class="inc-icon inc-${i.statut==='ouvert'?'red':'orange'}"><i class="fa-solid fa-wrench"></i></div>
          <div class="incident-body"><div class="incident-title">${i.type} — ${i.localisation||''}</div>
          <div class="incident-sub">${i.prenom||''} ${i.nom||''} ${i.lot?'(Lot '+i.lot+')':''} · ${fmtDate(i.created_at)}</div>
          ${i.prestataire?`<div class="incident-sub" style="color:var(--primary)">Prestataire : ${i.prestataire}</div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
            ${statusPill(i.statut)}
            <button class="btn btn-ghost btn-xs" onclick="resolveIncident(${i.id})"><i class="fa-solid fa-check"></i> Résoudre</button>
          </div>
        </div>`).join('')}</div>`:`<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Aucune intervention</p></div>`}
    </div>
    ${resolus.length?`<div class="card"><div class="card-hdr"><i class="fa-solid fa-check-circle"></i> Résolus récemment</div>
      <div class="incident-list">${resolus.map(i=>`<div class="incident-card" style="opacity:.65">
        <div class="inc-icon inc-green"><i class="fa-solid fa-check"></i></div>
        <div class="incident-body"><div class="incident-title">${i.type} — ${i.localisation||''}</div>
        <div class="incident-sub">Résolu ${fmtDate(i.date_resolution)}</div></div><span class="pill pill-green">✓</span></div>`).join('')}</div></div>`:''}`);}

async function resolveIncident(id){
  try{await PUT('/incidents/'+id,{statut:'resolu',date_resolution:new Date().toISOString().split('T')[0]});showToast('✅ Incident résolu');loaded.delete('g-travaux');loadGTravaux();}
  catch{showError('Erreur');}
}

async function loadGAG(){
  const ags=await GET('/ag'); if(!ags)return;
  const ag=ags[0];
  setPageContent('g-ag',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Tenue des AG</h1><p>${ags.length} AG(s)</p></div>
      <div class="hdr-actions">
        ${ag?`<button class="btn btn-ghost btn-sm" onclick="notifyAG(${ag.id},'${fmtDate(ag.date_ag)}')"><i class="fa-solid fa-envelope"></i> Envoyer convocations</button>`:''}
        <button class="btn btn-primary" onclick="openModal('modal-ag-create')"><i class="fa-solid fa-plus"></i> Convoquer</button>
      </div>
    </div>
    ${ag?await renderGAGDetail(ag):`<div class="card"><div class="empty-state"><i class="fa-solid fa-users"></i><p>Aucune AG. Créez la première !</p></div></div>`}`);
}

async function renderGAGDetail(ag){
  const [presences,votes]=await Promise.all([GET('/ag/'+ag.id+'/presences'),GET('/ag/'+ag.id+'/votes')]);
  const resolutions=ag.ordre_du_jour||[]; const totaux={};
  (votes?.totaux||[]).forEach(v=>{totaux[v.resolution_num]=v;});
  const nbP=(presences||[]).filter(p=>p.mode==='present').length;
  return`
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-envelope"></i></div><div class="metric-val">${(presences||[]).length}</div><div class="metric-label">Convoqués</div></div>
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-user-check"></i></div><div class="metric-val">${nbP}</div><div class="metric-label">Présents</div></div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-mail-bulk"></i></div><div class="metric-val">${(presences||[]).filter(p=>p.mode==='correspondance').length}</div><div class="metric-label">Correspondance</div></div>
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-user-xmark"></i></div><div class="metric-val">${(presences||[]).filter(p=>p.mode==='absent').length}</div><div class="metric-label">Absents</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-user-check"></i> Présences — ${fmtDate(ag.date_ag)}</div>
        <div class="presence-grid">${(presences||[]).map(p=>`<div class="pres-dot pres-${p.mode==='present'?'yes':p.mode==='correspondance'?'mail':'no'}" title="${p.prenom} ${p.nom}" onclick="togglePresence(${ag.id},${p.resident_id},'${p.mode}',this)">${ini(p)}</div>`).join('')}</div>
      </div>
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-vote-yea"></i> Résolutions</div>
        <div>${resolutions.map(r=>{const t=totaux[r.num]||{pour:0,contre:0,abstention:0};return`<div class="vote-item"><div><div class="vote-q">${r.num}. ${r.titre}</div><div class="vote-sub">Pour: ${t.pour} · Contre: ${t.contre} · Abs: ${t.abstention}</div></div><span class="pill ${+t.pour>+t.contre?'pill-green':'pill-orange'}">Live</span></div>`;}).join('')}
        ${!resolutions.length?`<div class="empty-state"><i class="fa-solid fa-vote-yea"></i><p>Pas encore de résolutions</p></div>`:''}
        </div>
      </div>
    </div>`;
}

async function togglePresence(agId,residentId,currentMode,el){
  const modes=['absent','present','correspondance'];
  const next=modes[(modes.indexOf(currentMode)+1)%modes.length];
  try{await PUT('/ag/'+agId+'/presences/'+residentId,{mode:next});
    el.className='pres-dot pres-'+(next==='present'?'yes':next==='correspondance'?'mail':'no');
    el.setAttribute('onclick',`togglePresence(${agId},${residentId},'${next}',this)`);
  }catch{showError('Erreur');}
}

async function loadGResidents(){
  const data=await GET('/residents'); if(!data)return;
  setPageContent('g-residents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Résidents</h1><p>${data.length} copropriétaires</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openResidentModal()"><i class="fa-solid fa-user-plus"></i> Ajouter un résident</button></div>
    </div>
    <div class="card">
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Résident</th><th>Lot</th><th>Tantièmes</th><th>Email</th><th>Tél.</th><th>Statut charges</th><th>Actions</th></tr></thead>
        <tbody>${data.map(r=>`<tr>
          <td><div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:6px;background:var(--info);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${ini(r)}</div><strong>${r.prenom} ${r.nom}</strong></div></td>
          <td>${r.lot||'—'}</td><td>${r.tantiemes||0}/1000</td>
          <td style="font-size:12px;color:var(--info)">${r.email}</td>
          <td style="font-size:12px">${r.telephone||'—'}</td>
          <td>${statusPill(r.statut_charges||'en_attente')}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn-icon btn-sm" title="Modifier" onclick='openResidentModal(${JSON.stringify(r)})'><i class="fa-solid fa-edit"></i></button>
            <button class="btn-icon btn-sm" title="Email bienvenue" onclick="sendBienvenueEmail(${r.id})" style="color:var(--primary)"><i class="fa-solid fa-envelope"></i></button>
            <button class="btn-icon btn-sm" title="Supprimer" style="color:var(--danger)" onclick="deleteResident(${r.id},'${r.prenom} ${r.nom}')"><i class="fa-solid fa-trash"></i></button>
          </div></td></tr>`).join('')}
        </tbody></table></div>
    </div>`);
}

function openResidentModal(r=null){
  const isEdit=!!r;
  document.getElementById('modal-res-title').innerHTML=`<i class="fa-solid fa-user-${isEdit?'edit':'plus'}" style="color:var(--primary)"></i> ${isEdit?'Modifier':'Nouveau'} résident`;
  document.getElementById('res-id').value=r?.id||'';
  ['prenom','nom','email','tel','lot','tantiemes'].forEach(f=>document.getElementById('res-'+f).value=r?.(f==='tel'?'telephone':f)||'');
  document.getElementById('res-welcome-wrap').style.display=isEdit?'none':'';
  openModal('modal-resident');
}

async function submitResident(){
  const id=document.getElementById('res-id').value;
  const body={prenom:document.getElementById('res-prenom').value,nom:document.getElementById('res-nom').value,email:document.getElementById('res-email').value,telephone:document.getElementById('res-tel').value,lot:document.getElementById('res-lot').value,tantiemes:parseInt(document.getElementById('res-tantiemes').value)||0};
  if(!body.prenom||!body.nom||!body.email)return showError('Champs requis manquants');
  try{
    if(id){await PUT('/residents/'+id,body);showToast('✅ Résident mis à jour');}
    else{const r=await POST('/residents',body);showToast('✅ Résident créé');if(document.getElementById('res-welcome').checked&&r?.id)sendBienvenueEmail(r.id);}
    closeModal('modal-resident');loaded.delete('g-residents');loadGResidents();
  }catch(e){showError(e.error||'Erreur');}
}

async function deleteResident(id,nom){
  if(!confirm(`Supprimer ${nom} ?`))return;
  try{await DEL('/residents/'+id);showToast('✅ Supprimé');loaded.delete('g-residents');loadGResidents();}
  catch(e){showError(e.error||'Impossible de supprimer');}
}

// ── Documents Gestionnaire ────────────────────────────────
async function loadGDocuments(){
  const data=await GET('/documents'); if(!data)return;
  const cats={ag:'Assemblées Générales',reglementation:'Réglementation',contrats:'Contrats',financier:'Financier',autre:'Autres'};
  setPageContent('g-documents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Documents</h1><p>${data.length} document(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-upload-doc')"><i class="fa-solid fa-cloud-arrow-up"></i> Publier un document</button></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-table"></i> Liste des documents</div>
      ${data.length?`<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Nom</th><th>Catégorie</th><th>Publié le</th><th>Taille</th><th>Actions</th></tr></thead>
        <tbody>${data.map(d=>`<tr>
          <td><div style="display:flex;align-items:center;gap:8px"><i class="fa-solid fa-file-pdf" style="color:var(--accent)"></i><strong>${d.nom}</strong></div></td>
          <td><span class="pill pill-blue">${cats[d.categorie]||d.categorie||'—'}</span></td>
          <td>${fmtDate(d.created_at)}</td>
          <td>${d.taille_ko?d.taille_ko+' Ko':'—'}</td>
          <td><div style="display:flex;gap:4px">
            ${d.url?`<a class="btn btn-ghost btn-xs" href="${d.url}" target="_blank"><i class="fa-solid fa-eye"></i> Voir</a>`:''}
            <button class="btn-icon btn-sm" style="color:var(--danger)" onclick="deleteDoc(${d.id},'${d.nom}')"><i class="fa-solid fa-trash"></i></button>
          </div></td></tr>`).join('')}
        </tbody></table></div>`:`<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>Aucun document. Publiez le premier !</p></div>`}
    </div>`);
}

async function deleteDoc(id,nom){
  if(!confirm(`Supprimer "${nom}" ?`))return;
  try{await DEL('/documents/'+id);showToast('✅ Supprimé');loaded.delete('g-documents');loaded.delete('r-documents');loadGDocuments();}
  catch(e){showError(e.error||'Erreur');}
}

// ── Notifications ─────────────────────────────────────────
async function loadGNotifications(){
  const log=await GET('/notifications/log').catch(()=>[]);
  const sc={sent:'pill-green',failed:'pill-red',pending:'pill-yellow'};
  setPageContent('g-notifications',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Notifications</h1><p>Envoi manuel et historique</p></div>
      <div class="hdr-actions">
        <button class="btn btn-ghost btn-sm" onclick="testEmail()"><i class="fa-solid fa-flask"></i> Tester email</button>
        <button class="btn btn-primary" onclick="openModal('modal-notif')"><i class="fa-solid fa-paper-plane"></i> Envoyer</button>
      </div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-paper-plane"></i> Envoi rapide</div>
        <div class="incident-list">
          <div class="incident-card" onclick="notifyImpayes()"><div class="inc-icon inc-red"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="incident-body"><div class="incident-title">Relances impayés</div><div class="incident-sub">Email + SMS aux résidents en retard</div></div><i class="fa-solid fa-chevron-right" style="color:var(--text-3)"></i></div>
          <div class="incident-card" onclick="openModal('modal-notif')"><div class="inc-icon inc-blue"><i class="fa-solid fa-file-invoice-dollar"></i></div><div class="incident-body"><div class="incident-title">Appel de fonds</div><div class="incident-sub">Notifier l'appel actif</div></div><i class="fa-solid fa-chevron-right" style="color:var(--text-3)"></i></div>
          <div class="incident-card" onclick="showPage('g-ag')"><div class="inc-icon inc-green"><i class="fa-solid fa-users"></i></div><div class="incident-body"><div class="incident-title">Convocations AG</div><div class="incident-sub">Depuis la page Tenue des AG</div></div><i class="fa-solid fa-chevron-right" style="color:var(--text-3)"></i></div>
          <div class="incident-card" onclick="showPage('g-agenda')"><div class="inc-icon inc-violet"><i class="fa-solid fa-calendar-check"></i></div><div class="incident-body"><div class="incident-title">Agenda automatique</div><div class="incident-sub">Configurer les envois récurrents</div></div><i class="fa-solid fa-chevron-right" style="color:var(--text-3)"></i></div>
        </div>
      </div>
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-clock-rotate-left"></i> Derniers envois</div>
        ${(log||[]).length?`<div style="overflow-x:auto"><table class="data-table">
          <thead><tr><th>Date</th><th>Type</th><th>Événement</th><th>Statut</th></tr></thead>
          <tbody>${(log||[]).slice(0,10).map(n=>`<tr>
            <td>${fmtDateTime(n.created_at)}</td>
            <td><span class="pill ${n.type==='email'?'pill-blue':'pill-green'}">${n.type}</span></td>
            <td><span class="pill pill-gray">${n.event}</span></td>
            <td><span class="pill ${sc[n.status]||'pill-gray'}">${n.status}</span></td></tr>`).join('')}
          </tbody></table></div>`:`<div class="empty-state"><i class="fa-solid fa-envelope"></i><p>Aucun envoi pour l'instant</p><p style="font-size:11px;margin-top:6px;color:var(--text-3)">Configurez SMTP_USER + SMTP_PASS dans Render</p></div>`}
      </div>
    </div>`);
}

// ── Agenda ────────────────────────────────────────────────
async function loadGAgenda(isAdmin=false){
  let rules=[], execs=[];
  try{[rules,execs]=await Promise.all([GET('/agenda'),GET('/agenda/executions')]);}
  catch(e){
    const pid=isAdmin?'a-agenda':'g-agenda';
    setPageContent(pid,`<div class="page-hdr"><div class="page-hdr-left"><h1>Agenda automatique</h1></div></div>
      <div class="card" style="background:var(--warning-pale);border-color:rgba(176,107,16,.3)">
        <div class="card-hdr"><i class="fa-solid fa-triangle-exclamation" style="color:var(--warning)"></i> Module Agenda non disponible</div>
        <p style="font-size:13px;color:var(--text-2)">Le fichier <code>backend/routes/agenda.js</code> n'est pas encore uploadé sur GitHub.<br>Uploadez-le pour activer cette fonctionnalité.</p>
        <div style="margin-top:10px"><code style="background:var(--surface2);padding:8px 12px;border-radius:6px;display:block;font-size:12px">GitHub → backend/routes/agenda.js → Add file</code></div>
      </div>`);
    return;
  }
  const pid=isAdmin?'a-agenda':'g-agenda';
  const typeLabels={appel_fonds:'Appel de fonds',rappel_paiement:'Rappel paiement',convocation_ag:'Convocation AG'};
  const canalIcon={email:'envelope',sms:'mobile-screen',les_deux:'envelope-open-text'};
  const decLabels={avant_echeance:'avant échéance',apres_echeance:'après échéance',avant_ag:'avant l\'AG'};
  setPageContent(pid,`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Agenda automatique</h1><p>${(rules||[]).length} règle(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openAgendaModal()"><i class="fa-solid fa-plus"></i> Nouvelle règle</button></div>
    </div>
    <div style="background:var(--violet-pale);border:1px solid rgba(124,58,237,.2);border-radius:var(--radius-sm);padding:12px 14px;display:flex;align-items:center;gap:10px">
      <i class="fa-solid fa-robot" style="color:var(--violet)"></i>
      <span style="font-size:13px;color:var(--violet)"><strong>Planificateur actif</strong> — Envois automatiques chaque jour à l'heure configurée.</span>
    </div>
    <div class="card"><div class="card-hdr"><i class="fa-solid fa-calendar-check"></i> Règles de notification</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${(rules||[]).map(r=>`
        <div class="agenda-rule ${r.actif?'':'inactive'}">
          <div class="agenda-icon" style="background:${r.actif?'var(--violet-pale)':'var(--surface2)'};color:${r.actif?'var(--violet)':'var(--text-3)'}"><i class="fa-solid fa-${canalIcon[r.canal]||'bell'}"></i></div>
          <div class="agenda-body">
            <div class="agenda-title">${r.nom}</div>
            <div class="agenda-meta">
              <span class="pill pill-gray">${typeLabels[r.type_event]||r.type_event}</span>
              <span style="margin-left:8px">J${r.jours_offset>=0?'+'+r.jours_offset:r.jours_offset} ${decLabels[r.declencheur]||r.declencheur}</span>
              · ${r.heure_envoi?.slice(0,5)||'09:00'} · <span style="color:var(--text-3)">${r.nb_executions||0} exec.</span>
            </div>
          </div>
          <div class="agenda-actions">
            <span class="pill ${r.actif?'pill-green':'pill-gray'}">${r.actif?'Actif':'Inactif'}</span>
            <button class="btn btn-ghost btn-xs" onclick="execAgenda(${r.id},'${r.nom}')"><i class="fa-solid fa-play"></i></button>
            <button class="btn-icon btn-sm" onclick='openAgendaModal(${JSON.stringify(r)})'><i class="fa-solid fa-edit"></i></button>
            <button class="btn-icon btn-sm" style="color:var(--danger)" onclick="deleteAgenda(${r.id},'${r.nom}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`).join('')}
        ${!(rules||[]).length?`<div class="empty-state"><i class="fa-solid fa-calendar-check"></i><p>Aucune règle. Créez la première !</p></div>`:''}
      </div>
    </div>
    ${(execs||[]).length?`<div class="card"><div class="card-hdr"><i class="fa-solid fa-clock-rotate-left"></i> Historique des exécutions</div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Date</th><th>Règle</th><th>Envoyés</th><th>Statut</th></tr></thead>
        <tbody>${(execs||[]).slice(0,10).map(e=>`<tr><td>${fmtDateTime(e.created_at)}</td><td>${e.agenda_nom||'—'}</td><td>${e.nb_envoyes||0}</td><td>${statusPill(e.statut)}</td></tr>`).join('')}</tbody>
      </table></div></div>`:''}`);
}

function openAgendaModal(r=null){
  document.getElementById('agenda-id').value=r?.id||'';
  document.getElementById('agenda-nom').value=r?.nom||'';
  document.getElementById('agenda-desc').value=r?.description||'';
  document.getElementById('agenda-type').value=r?.type_event||'appel_fonds';
  document.getElementById('agenda-canal').value=r?.canal||'email';
  document.getElementById('agenda-declencheur').value=r?.declencheur||'avant_echeance';
  document.getElementById('agenda-jours').value=r?.jours_offset||7;
  document.getElementById('agenda-heure').value=r?.heure_envoi?.slice(0,5)||'09:00';
  document.getElementById('agenda-actif').checked=r?.actif??true;
  document.getElementById('modal-agenda-title').innerHTML=`<i class="fa-solid fa-calendar-check" style="color:var(--primary)"></i> ${r?'Modifier':'Nouvelle'} règle`;
  openModal('modal-agenda');
}

async function submitAgenda(){
  const id=document.getElementById('agenda-id').value;
  const body={nom:document.getElementById('agenda-nom').value,description:document.getElementById('agenda-desc').value,type_event:document.getElementById('agenda-type').value,canal:document.getElementById('agenda-canal').value,declencheur:document.getElementById('agenda-declencheur').value,jours_offset:parseInt(document.getElementById('agenda-jours').value)||0,heure_envoi:document.getElementById('agenda-heure').value,actif:document.getElementById('agenda-actif').checked};
  if(!body.nom)return showError('Nom requis');
  try{
    if(id)await PUT('/agenda/'+id,body); else await POST('/agenda',body);
    showToast('✅ Règle '+(id?'mise à jour':'créée'));
    closeModal('modal-agenda');
    ['g-agenda','a-agenda'].forEach(p=>loaded.delete(p));
    loadGAgenda(state.currentPage==='a-agenda');
  }catch(e){showError(e.error||'Erreur');}
}

async function execAgenda(id,nom){
  if(!confirm(`Exécuter maintenant "${nom}" ?`))return;
  try{const r=await POST('/agenda/'+id+'/executer');showToast(`✅ ${r.nb_envoyes||0} message(s) envoyé(s)`);['g-agenda','a-agenda'].forEach(p=>loaded.delete(p));loadGAgenda(state.currentPage==='a-agenda');}
  catch(e){showError(e.error||'Erreur');}
}

async function deleteAgenda(id,nom){
  if(!confirm(`Supprimer "${nom}" ?`))return;
  try{await DEL('/agenda/'+id);showToast('✅ Supprimé');['g-agenda','a-agenda'].forEach(p=>loaded.delete(p));loadGAgenda(state.currentPage==='a-agenda');}
  catch{showError('Erreur');}
}

async function loadGSettings(){
  const data=await GET('/settings/residence'); if(!data)return;
  setPageContent('g-settings',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Paramètres</h1></div></div>
    <div class="grid-2">
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-building"></i> Résidence</div>
        <div class="form-group"><label class="form-label">Nom</label><input class="form-control" id="s-nom" value="${data.nom||''}"></div>
        <div class="form-group"><label class="form-label">Adresse</label><input class="form-control" id="s-adresse" value="${data.adresse||''}"></div>
        <div class="form-row"><div class="form-group"><label class="form-label">Ville</label><input class="form-control" id="s-ville" value="${data.ville||''}"></div><div class="form-group"><label class="form-label">Lots</label><input class="form-control" id="s-lots" type="number" value="${data.nb_lots||''}"></div></div>
        <button class="btn btn-primary btn-sm" onclick="saveSettings()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
      </div>
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-sliders"></i> Automatisations</div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-relance" ${data.relance_auto?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Relances automatiques</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-af" ${data.appel_fonds_auto?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Émission auto appels de fonds</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-sms-r" ${data.notif_sms_residents?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">SMS aux résidents</span></div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="saveSettings()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
      </div>
    </div>`);
}

async function saveSettings(){
  try{await PUT('/settings/residence',{nom:document.getElementById('s-nom')?.value,adresse:document.getElementById('s-adresse')?.value,ville:document.getElementById('s-ville')?.value,nb_lots:parseInt(document.getElementById('s-lots')?.value),relance_auto:document.getElementById('sw-relance')?.checked,appel_fonds_auto:document.getElementById('sw-af')?.checked,notif_sms_residents:document.getElementById('sw-sms-r')?.checked});showToast('✅ Paramètres sauvegardés');}
  catch{showError('Erreur');}
}

// ══════════════════════ ADMIN ══════════════════════════════

async function loadADashboard(){
  const stats=await GET('/admin/stats'); if(!stats)return;
  setPageContent('a-dashboard',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Administration SyndicPro</h1></div></div>
    <div class="metrics-grid">
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-users"></i></div><div class="metric-val">${stats.totalUsers}</div><div class="metric-label">Utilisateurs</div></div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-building"></i></div><div class="metric-val">${stats.totalResidences}</div><div class="metric-label">Résidences</div></div>
      <div class="metric info"><div class="metric-icon"><i class="fa-solid fa-file-invoice"></i></div><div class="metric-val">${stats.totalCharges}</div><div class="metric-label">Appels de fonds</div></div>
      <div class="metric violet"><div class="metric-icon"><i class="fa-solid fa-envelope"></i></div><div class="metric-val">${stats.notifsMois||0}</div><div class="metric-label">Notifs ce mois</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-users-cog"></i> Répartition</div>
        <div class="chart-bar-wrap">
          ${[['Résidents',stats.userStats.resident||0,''],['Gestionnaires',stats.userStats.gestionnaire||0,'accent'],['Admins',stats.userStats.admin||0,'violet']].map(([l,v,c])=>`<div class="chart-bar-row"><div class="chart-bar-label">${l}</div><div class="chart-bar-track"><div class="chart-bar-fill ${c}" style="width:${Math.min(100,Math.round((v/Math.max(stats.totalUsers,1))*100))}%"><span>${v}</span></div></div></div>`).join('')}
        </div>
      </div>
      <div class="card"><div class="card-hdr"><i class="fa-solid fa-bolt"></i> Accès rapides</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="showPage('a-users')"><i class="fa-solid fa-user-plus"></i> Gérer utilisateurs</button>
          <button class="btn btn-ghost btn-sm" onclick="showPage('a-types-reclamations')"><i class="fa-solid fa-tags"></i> Types réclamations</button>
          <button class="btn btn-ghost btn-sm" onclick="showPage('a-types-charges')"><i class="fa-solid fa-tags"></i> Types charges</button>
          <button class="btn btn-ghost btn-sm" onclick="showPage('a-agenda')"><i class="fa-solid fa-calendar-check"></i> Agenda global</button>
        </div>
      </div>
    </div>`);
}

async function loadAUsers(){
  const users=await GET('/admin/users'); if(!users)return;
  const rc={admin:'var(--violet)',gestionnaire:'var(--accent)',resident:'var(--info)'};
  const rl={admin:'Admin',gestionnaire:'Gestionnaire',resident:'Résident'};
  setPageContent('a-users',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Utilisateurs</h1><p>${users.length} comptes</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openUserModal()"><i class="fa-solid fa-user-plus"></i> Nouvel utilisateur</button></div>
    </div>
    <div class="card">
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Email</th><th>Lot</th><th>Résidence</th><th>Actions</th></tr></thead>
        <tbody>${users.map(u=>`<tr>
          <td><div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:6px;background:${rc[u.role]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${ini(u)}</div><strong>${u.prenom} ${u.nom}</strong></div></td>
          <td><span class="pill" style="background:${rc[u.role]}18;color:${rc[u.role]}">${rl[u.role]}</span></td>
          <td style="font-size:12px">${u.email}</td><td>${u.lot||'—'}</td><td>${u.residence_nom||'—'}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn-icon btn-sm" onclick='openUserModal(${JSON.stringify(u)})'><i class="fa-solid fa-edit"></i></button>
            ${u.role!=='admin'?`<button class="btn-icon btn-sm" style="color:var(--danger)" onclick="deleteUser(${u.id},'${u.prenom} ${u.nom}')"><i class="fa-solid fa-trash"></i></button>`:''}
          </div></td></tr>`).join('')}
        </tbody></table></div>
    </div>`);
}

async function loadARoles(){
  const users=await GET('/admin/users'); if(!users)return;
  const rc={admin:'var(--violet)',gestionnaire:'var(--accent)',resident:'var(--info)'};
  setPageContent('a-roles',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Rôles & Accès</h1></div></div>
    <div class="card"><div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Utilisateur</th><th>Email</th><th>Rôle actuel</th><th>Modifier le rôle</th></tr></thead>
      <tbody>${users.map(u=>`<tr>
        <td><strong>${u.prenom} ${u.nom}</strong></td><td style="font-size:12px">${u.email}</td>
        <td><span class="pill" style="background:${rc[u.role]}18;color:${rc[u.role]}">${u.role}</span></td>
        <td><div style="display:flex;gap:6px;align-items:center">
          <select class="form-control" id="rs-${u.id}" style="padding:4px 8px;font-size:12px;max-width:130px">
            <option value="resident" ${u.role==='resident'?'selected':''}>Résident</option>
            <option value="gestionnaire" ${u.role==='gestionnaire'?'selected':''}>Gestionnaire</option>
            <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
          </select>
          <button class="btn btn-primary btn-xs" onclick="changeRole(${u.id})"><i class="fa-solid fa-check"></i> Appliquer</button>
        </div></td></tr>`).join('')}
      </tbody></table></div>
    </div>`);
}

async function loadATypes(kind){
  const data=await GET('/admin/types-'+kind); if(!data)return;
  const titles={charges:'Types de charges',depenses:'Types de dépenses',reclamations:'Types de réclamations'};
  const prioCols={faible:'pill-gray',normale:'pill-blue',haute:'pill-orange',urgente:'pill-red'};
  setPageContent('a-types-'+kind,`
    <div class="page-hdr"><div class="page-hdr-left"><h1>${titles[kind]}</h1><p>${data.length} type(s) configuré(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openTypeModal('${kind}')"><i class="fa-solid fa-plus"></i> Ajouter un type</button></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-tags"></i> Catalogue
        <div class="card-hdr-right"><button class="btn btn-primary btn-sm" onclick="openTypeModal('${kind}')"><i class="fa-solid fa-plus"></i> Nouveau</button></div>
      </div>
      ${data.length?`<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Nom</th>${kind==='depenses'?'<th>Catégorie</th>':''}<th>Description</th>${kind==='reclamations'?'<th>Priorité</th><th>Délai</th>':''}<th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${data.map(t=>`<tr>
          <td><strong>${t.nom}</strong></td>
          ${kind==='depenses'?`<td><span class="pill pill-blue">${t.categorie||'—'}</span></td>`:''}
          <td style="color:var(--text-2);font-size:12px">${t.description||'—'}</td>
          ${kind==='reclamations'?`<td><span class="pill ${prioCols[t.priorite]||'pill-gray'}">${t.priorite}</span></td><td>${t.delai_traitement_jours||7}j</td>`:''}
          <td>${t.actif?`<span class="pill pill-green">Actif</span>`:`<span class="pill pill-gray">Inactif</span>`}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn-icon btn-sm" onclick='openTypeModal("${kind}",${JSON.stringify(t)})'><i class="fa-solid fa-edit"></i></button>
            <button class="btn-icon btn-sm" style="color:var(--danger)" onclick="deleteType('${kind}',${t.id},'${t.nom}')"><i class="fa-solid fa-trash"></i></button>
          </div></td></tr>`).join('')}
        </tbody></table></div>`:`<div class="empty-state"><i class="fa-solid fa-tags"></i><p>Aucun type configuré</p><button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openTypeModal('${kind}')"><i class="fa-solid fa-plus"></i> Créer le premier</button></div>`}
    </div>`);
}

async function loadAResidences(){
  const data=await GET('/admin/residences'); if(!data)return;
  setPageContent('a-residences',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Résidences</h1><p>${data.length} résidence(s)</p></div></div>
    <div class="card"><div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Nom</th><th>Adresse</th><th>Ville</th><th>Lots</th><th>Utilisateurs</th></tr></thead>
      <tbody>${data.map(r=>`<tr><td><strong>${r.nom}</strong></td><td>${r.adresse}</td><td>${r.ville}</td><td>${r.nb_lots}</td><td><span class="pill pill-blue">${r.nb_utilisateurs}</span></td></tr>`).join('')}</tbody>
    </table></div></div>`);
}

async function loadANotifLog(){
  const log=await GET('/notifications/log').catch(()=>[]);
  const sc={sent:'pill-green',failed:'pill-red',pending:'pill-yellow'};
  setPageContent('a-notifications-log',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Log Notifications</h1><p>${(log||[]).length} entrée(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-ghost btn-sm" onclick="testEmail()"><i class="fa-solid fa-flask"></i> Tester</button></div>
    </div>
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-envelope"></i></div><div class="metric-val">${(log||[]).filter(n=>n.type==='email').length}</div><div class="metric-label">Emails</div></div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-mobile-screen"></i></div><div class="metric-val">${(log||[]).filter(n=>n.type==='sms').length}</div><div class="metric-label">SMS</div></div>
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-circle-exclamation"></i></div><div class="metric-val">${(log||[]).filter(n=>n.status==='failed').length}</div><div class="metric-label">Échecs</div></div>
    </div>
    <div class="card"><div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Date</th><th>Type</th><th>Événement</th><th>Destinataire</th><th>Statut</th></tr></thead>
      <tbody>${(log||[]).map(n=>`<tr><td>${fmtDateTime(n.created_at)}</td><td><span class="pill ${n.type==='email'?'pill-blue':'pill-green'}">${n.type}</span></td><td><span class="pill pill-gray">${n.event}</span></td><td style="font-size:12px">${n.recipient_email||'—'}</td><td><span class="pill ${sc[n.status]||'pill-gray'}">${n.status}</span></td></tr>`).join('')}
      </tbody></table></div></div>`);
}

// ── Admin Actions ─────────────────────────────────────────
function openUserModal(user){
  document.getElementById('modal-user-title').innerHTML=`<i class="fa-solid fa-user-${user?'edit':'plus'}" style="color:var(--primary)"></i> ${user?'Modifier':'Nouvel'} utilisateur`;
  document.getElementById('au-id').value=user?.id||'';
  document.getElementById('au-prenom').value=user?.prenom||'';
  document.getElementById('au-nom').value=user?.nom||'';
  document.getElementById('au-email').value=user?.email||'';
  document.getElementById('au-password').value='';
  document.getElementById('au-role').value=user?.role||'resident';
  document.getElementById('au-lot').value=user?.lot||'';
  document.getElementById('au-tantiemes').value=user?.tantiemes||'';
  document.getElementById('au-tel').value=user?.telephone||'';
  openModal('modal-admin-user');
}

async function submitAdminUser(){
  const id=document.getElementById('au-id').value;
  const pwd=document.getElementById('au-password').value;
  const body={prenom:document.getElementById('au-prenom').value,nom:document.getElementById('au-nom').value,email:document.getElementById('au-email').value,role:document.getElementById('au-role').value,lot:document.getElementById('au-lot').value,tantiemes:parseInt(document.getElementById('au-tantiemes').value)||0,telephone:document.getElementById('au-tel').value};
  if(pwd)body.password=pwd;
  if(!body.prenom||!body.nom||!body.email)return showError('Champs requis manquants');
  try{
    if(id)await PUT('/admin/users/'+id,body); else await POST('/admin/users',body);
    showToast('✅ Utilisateur '+(id?'mis à jour':'créé'));
    closeModal('modal-admin-user');['a-users','a-roles'].forEach(p=>loaded.delete(p));loadAUsers();
  }catch(e){showError(e.error||'Erreur');}
}

async function deleteUser(id,nom){
  if(!confirm(`Supprimer ${nom} ?`))return;
  try{await DEL('/admin/users/'+id);showToast('✅ Supprimé');['a-users','a-roles'].forEach(p=>loaded.delete(p));loadAUsers();}
  catch(e){showError(e.error||'Impossible de supprimer un admin');}
}

async function changeRole(id){
  const v=document.getElementById('rs-'+id)?.value; if(!v)return;
  try{await PUT('/admin/users/'+id+'/role',{role:v});showToast('✅ Rôle mis à jour');['a-users','a-roles'].forEach(p=>loaded.delete(p));loadARoles();}
  catch{showError('Erreur');}
}

function openTypeModal(kind,item){
  document.getElementById('t-id').value=item?.id||'';
  document.getElementById('t-kind').value=kind;
  document.getElementById('t-nom').value=item?.nom||'';
  document.getElementById('t-desc').value=item?.description||'';
  document.getElementById('t-actif').checked=item?.actif??true;
  document.getElementById('modal-type-title').innerHTML=`<i class="fa-solid fa-tag" style="color:var(--primary)"></i> ${item?'Modifier':'Nouveau'} type`;
  document.getElementById('t-cat-wrap').style.display=kind==='depenses'?'':'none';
  document.getElementById('t-prio-wrap').style.display=kind==='reclamations'?'':'none';
  document.getElementById('t-delai-wrap').style.display=kind==='reclamations'?'':'none';
  if(kind==='depenses'&&item?.categorie)document.getElementById('t-cat').value=item.categorie;
  if(kind==='reclamations'){
    if(item?.priorite)document.getElementById('t-priorite').value=item.priorite;
    document.getElementById('t-delai').value=item?.delai_traitement_jours||7;
  }
  openModal('modal-type');
}

async function submitType(){
  const id=document.getElementById('t-id').value;
  const kind=document.getElementById('t-kind').value;
  const body={nom:document.getElementById('t-nom').value,description:document.getElementById('t-desc').value,actif:document.getElementById('t-actif').checked,categorie:document.getElementById('t-cat').value,priorite:document.getElementById('t-priorite').value,delai_traitement_jours:parseInt(document.getElementById('t-delai').value)||7};
  if(!body.nom)return showError('Nom requis');
  try{
    if(id)await PUT('/admin/types-'+kind+'/'+id,body); else await POST('/admin/types-'+kind,body);
    showToast('✅ '+(id?'Mis à jour':'Créé'));closeModal('modal-type');loaded.delete('a-types-'+kind);loadATypes(kind);
  }catch(e){showError(e.error||'Erreur');}
}

async function deleteType(kind,id,nom){
  if(!confirm(`Supprimer "${nom}" ?`))return;
  try{await DEL('/admin/types-'+kind+'/'+id);showToast('✅ Supprimé');loaded.delete('a-types-'+kind);loadATypes(kind);}
  catch{showError('Erreur');}
}

// ── Notifications ─────────────────────────────────────────
async function sendNotification(endpoint,body={}){
  try{const r=await POST('/notifications/'+endpoint,body);
    if(r?.sent!==undefined)showToast(`📧 ${r.sent} email(s)${r.smsSent?' · '+r.smsSent+' SMS':''} envoyé(s)`);
    else if(r?.success)showToast('📧 Notification envoyée !');
    else showToast('⚠️ Envoi échoué — vérifiez SMTP','warn');
    loaded.delete('g-notifications');loaded.delete('a-notifications-log');
    return r;
  }catch(e){showError(e.error||'Erreur envoi');}
}

async function testEmail(){
  const email=prompt('Email de test :'); if(!email)return;
  await sendNotification('test',{email});
}
async function notifyAppelFonds(id,periode){
  if(!confirm(`Envoyer les notifications pour l'appel "${periode}" ?`))return;
  await sendNotification('appel-fonds/'+id);
}
async function notifyAG(id,dateAG){
  if(!confirm(`Envoyer les convocations pour l'AG du ${dateAG} ?`))return;
  await sendNotification('convocation-ag/'+id);
}
async function notifyImpayes(){
  if(!confirm('Envoyer les rappels email+SMS aux résidents en impayé ?'))return;
  await sendNotification('rappel-impayes');
}
async function sendBienvenueEmail(userId){
  try{await POST('/notifications/bienvenue/'+userId,{});showToast('📧 Email bienvenue envoyé');}
  catch{showError('Email non configuré — ajoutez SMTP_USER dans Render');}
}

async function submitManualNotif(){
  const type=document.getElementById('notif-type-manual').value;
  const email=document.getElementById('notif-email-manual').value;
  closeModal('modal-notif');
  if(type==='test')await sendNotification('test',{email});
  else if(type==='rappel-impayes')await notifyImpayes();
  else if(type==='appel-fonds'){
    const charges=await GET('/charges');
    const actif=charges?.find(c=>c.statut==='actif');
    if(actif)await notifyAppelFonds(actif.id,actif.periode);
    else showError('Aucun appel de fonds actif trouvé');
  }
}

// ── Paiements ─────────────────────────────────────────────
function openPayModalWithId(id,periode,montant){
  document.getElementById('modal-paiement-info').innerHTML=`<strong>${periode}</strong> — ${parseFloat(montant).toLocaleString('fr-FR')} MAD · Lot ${state.user.lot||'—'}`;
  document.getElementById('pay-paiement-id').value=id; openModal('modal-paiement');
}
async function submitPaiement(){
  const btn=document.getElementById('pay-submit-btn');
  const pId=document.getElementById('pay-paiement-id').value;
  btn.disabled=true;
  try{
    if(pId)await POST('/charges/paiements/'+pId+'/payer',{mode:'carte'});
    showToast('✅ Paiement confirmé !');closeModal('modal-paiement');
    ['r-finances','r-dashboard'].forEach(p=>loaded.delete(p));
    if(state.currentPage==='r-finances')loadRFinances();
    if(state.currentPage==='r-dashboard')loadRDashboard();
  }catch{showError('Erreur paiement');}
  btn.disabled=false;
}

async function submitIncident(){
  const body={type:document.getElementById('inc-type').value,localisation:document.getElementById('inc-loc').value,description:document.getElementById('inc-desc').value.trim(),urgence:document.getElementById('inc-urgence').value};
  if(!body.description)return showError('Description requise');
  try{await POST('/incidents',body);showToast('✅ Réclamation envoyée !');closeModal('modal-incident');
    ['r-incidents','g-travaux'].forEach(p=>loaded.delete(p));
    if(state.currentPage==='r-incidents')loadRIncidents();
    if(state.currentPage==='g-travaux')loadGTravaux();
  }catch{showError('Erreur');}
}

async function submitAppelFonds(){
  const periode=document.getElementById('af-periode').value;
  const montant_base=document.getElementById('af-montant').value;
  const echeance=document.getElementById('af-echeance').value;
  const notifier=document.getElementById('af-notifier').checked;
  if(!periode||!montant_base||!echeance)return showError('Champs requis');
  try{const af=await POST('/charges',{periode,montant_base,echeance,description:document.getElementById('af-desc').value});
    showToast('✅ Appel de fonds émis');closeModal('modal-appel-fonds');
    if(notifier&&af?.id)sendNotification('appel-fonds/'+af.id).catch(()=>{});
    loaded.delete('g-comptabilite');
    if(state.currentPage==='g-comptabilite')loadGCompta();
  }catch(e){showError(e.error||'Erreur');}
}

async function submitAG(){
  const date=document.getElementById('ag-date').value;
  const heure=document.getElementById('ag-heure').value;
  const lieu=document.getElementById('ag-lieu').value;
  const notifier=document.getElementById('ag-notifier').checked;
  if(!date||!lieu)return showError('Date et lieu requis');
  try{const ag=await POST('/ag',{date_ag:date+'T'+heure+':00',lieu,type:document.getElementById('ag-type').value});
    showToast('✅ AG convoquée');closeModal('modal-ag-create');
    if(notifier&&ag?.id)sendNotification('convocation-ag/'+ag.id).catch(()=>{});
    ['g-ag','r-ag'].forEach(p=>loaded.delete(p));
    if(state.currentPage==='g-ag')loadGAG();
  }catch{showError('Erreur');}
}

// ── Upload document ───────────────────────────────────────
function updateZoneLabel(){
  const f=document.getElementById('udoc-fichier')?.files[0];
  const l=document.getElementById('upload-zone-label');
  if(l)l.textContent=f?`✅ ${f.name} (${Math.round(f.size/1024)} Ko)`:'Cliquer ou glisser-déposer';
}

async function submitUploadDoc(){
  const nom=document.getElementById('udoc-nom').value.trim();
  const categorie=document.getElementById('udoc-categorie').value;
  const notifier=document.getElementById('udoc-notifier').checked;
  const fichier=document.getElementById('udoc-fichier').files[0];
  if(!nom)return showError('Nom du document requis');
  const btn=document.getElementById('udoc-submit');btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Envoi…';
  try{
    const fd=new FormData();
    fd.append('nom',nom);fd.append('categorie',categorie);fd.append('notifier_residents',notifier.toString());
    if(fichier)fd.append('fichier',fichier);
    const headers={};if(state.token)headers['Authorization']='Bearer '+state.token;
    const res=await fetch(API+'/documents',{method:'POST',headers,body:fd});
    if(!res.ok){const e=await res.json();throw e;}
    showToast('✅ Document publié'+(notifier?' · Résidents notifiés':''));closeModal('modal-upload-doc');
    ['r-documents','g-documents'].forEach(p=>loaded.delete(p));
    if(state.currentPage==='g-documents')loadGDocuments();
    document.getElementById('udoc-nom').value='';document.getElementById('udoc-fichier').value='';updateZoneLabel();
  }catch(e){showError(e.error||'Erreur upload');}
  finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-cloud-arrow-up"></i> Publier';}
}

// ── Sidebar / Modals ──────────────────────────────────────
document.getElementById('hamburger-btn').addEventListener('click',()=>{
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
});
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-overlay').classList.remove('show');}
function openModal(id){document.getElementById(id)?.classList.add('show');}
function closeModal(id){document.getElementById(id)?.classList.remove('show');}
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('show');}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-overlay.show').forEach(m=>m.classList.remove('show'));});

// ── Boot ──────────────────────────────────────────────────
initApp();
