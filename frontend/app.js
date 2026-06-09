// ==========================================================
// Syndic Jasmine Park v2.1 — app.js
// ==========================================================
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
function statusPill(s){const m={declare:['violet','⏳ A valider'],declare:['violet','Déclaré — à valider'],paye:['green','✓ Payé'],en_attente:['gray','En attente'],retard:['orange','⏱ Retard'],impaye:['red','✗ Impayé'],ouvert:['orange','Ouvert'],en_cours:['yellow','En cours'],resolu:['green','✓ Résolu'],ferme:['gray','Fermé'],planifie:['blue','Planifié'],termine:['green','Terminé'],success:['green','OK'],failed:['red','Échec']};const[c,l]=m[s]||['gray',s];return`<span class="pill pill-${c}">${l}</span>`;}
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
  // Masquer tous les navs
  ['nav-resident','nav-gestionnaire','nav-admin'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.style.cssText='display:none'; el.classList.remove('active-nav'); }
  });

  const showNav = (id) => {
    const el=document.getElementById(id);
    if(el){
      el.style.cssText='display:flex;flex-direction:column;flex:1;width:100%;overflow:hidden;min-width:0';
      el.classList.add('active-nav');
    }
  };

  if(u.role==='admin'){
    document.getElementById('user-av').style.background='var(--violet)';
    document.getElementById('user-role-top').textContent='Administrateur';
    showNav('nav-admin');
    renderBottomNav('admin','a-dashboard');
    showPage('a-dashboard');
  } else if(u.role==='gestionnaire'){
    document.getElementById('user-av').style.background='var(--accent)';
    document.getElementById('user-role-top').textContent='Gestionnaire · Syndic';
    showNav('nav-gestionnaire');
    renderBottomNav('gestionnaire','g-dashboard');
    showPage('g-dashboard');
  } else if(u.role==='securite'){
    document.getElementById('user-av').style.background='#7c3aed';
    document.getElementById('user-role-top').textContent='Agent de sécurité';
    showNav('nav-securite');
    showPage('s-validation');
  } else {
    document.getElementById('user-av').style.background='var(--info)';
    document.getElementById('user-role-top').textContent=`Copropriétaire · Lot ${u.lot||'—'}`;
    showNav('nav-resident');
    renderBottomNav('resident','r-dashboard');
    showPage('r-dashboard');
  }
}

// ── NAVIGATION ────────────────────────────────────────────
function showPage(id){
  // Vérification de sécurité : rôle vs page
  const role=state.user?.role||'resident';
  if(id.startsWith('a-')&&role!=='admin')return;
  if(id.startsWith('g-')&&role!=='gestionnaire'&&role!=='admin')return;
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
      case 'g-messagerie':   await loadGMessagerie(); break;
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
      case 'r-jardinage':    await loadRJardinage(); break;
      case 'r-reservations': await loadRReservations(); break;
      case 'g-reservations': await loadGReservations(); break;
      case 'g-securite':     await loadGSecurite(); break;
      case 'r-qrcode':       await loadRQrcode(); break;
      case 's-validation':   await loadSValidation(); break;
      case 'g-jardinage':    await loadGJardinage(); break;
      case 'g-bilan':        await loadGBilan(); break;
    }
  }catch(e){
    console.error('Page load error',id,e);
    setPageContent(id,`<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Erreur : ${e.message||e.error||'inconnue'}</p><button class="btn btn-ghost btn-sm" onclick="loaded.delete('${id}');loadPage('${id}')"><i class="fa-solid fa-rotate-right"></i> Réessayer</button></div>`);
  }
}

function setPageContent(id,html){const el=document.getElementById('page-'+id);if(el)el.innerHTML=html;}

// ====================== RÉSIDENT ===========================

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
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
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
        <div class="metric-sub">Lot ${u.lot||'—'}</div>
      </div>
    </div>
    ${pa&&pa.statut!=='paye'?`<div class="pay-banner">
      <div><div style="font-size:11px;opacity:.7;margin-bottom:4px">APPEL DE FONDS — ${pa.periode||''}</div><div class="amount">${parseFloat(pa.montant||0).toLocaleString('fr-FR')} MAD</div></div>
      <div class="label">Résidence ${state.user.residence_nom||''}<div class="due">Échéance le ${fmtDate(pa.echeance)}</div></div>
      <button class="pay-banner-btn" onclick="openDeclarerPaiement(${pa.id},'${pa.periode}',${pa.montant})"><i class="fa-solid fa-pen-to-square"></i> Déclarer mon paiement</button>
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
          ${p.statut==='paye'
            ?'<td><span class="pill pill-green">✅ Validé</span></td>'
            :p.statut==='declare'
            ?'<td><span style="background:#f3effe;color:#7c3aed;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">⏳ En attente</span></td>'
            :`<td><button class="btn btn-ghost btn-xs" onclick="openDeclarerPaiement(${p.id},'${p.periode}',${p.montant})"><i class="fa-solid fa-pen-to-square"></i> Déclarer</button></td>`}
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`);
}

async function loadRIncidents(){
  const data=await GET('/incidents'); if(!data)return;
  const typeIcon={Plomberie:'droplet','Électricité':'bolt','Parties communes':'building',Sécurité:'shield-halved',Nuisances:'volume-high',Autre:'wrench'};
  const urgIcon={'normal':'','urgent':'','tres_urgent':''};
  const actifs=data.filter(i=>i.statut!=='resolu'&&i.statut!=='ferme');
  const resolus=data.filter(i=>i.statut==='resolu'||i.statut==='ferme');
  setPageContent('r-incidents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Mes réclamations</h1><p>${actifs.length} en cours · ${resolus.length} résolues</p></div>
      <div class="hdr-actions">
        <button class="btn btn-primary" onclick="openNewIncident()"><i class="fa-solid fa-plus"></i> Nouvelle réclamation</button>
      </div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-circle-dot"></i> En cours (${actifs.length})
        <div class="card-hdr-right"><button class="btn btn-primary btn-sm" onclick="openNewIncident()"><i class="fa-solid fa-plus"></i> Ajouter</button></div>
      </div>
      ${actifs.length?`<div class="incident-list">${actifs.map(i=>`
        <div class="incident-card">
          <div class="inc-icon inc-${i.statut==='en_cours'?'orange':'red'}"><i class="fa-solid fa-${typeIcon[i.type]||'wrench'}"></i></div>
          <div class="incident-body">
            <div class="incident-title">${urgIcon[i.urgence]||''} ${i.type}${i.localisation?' — '+i.localisation:''}</div>
            <div class="incident-sub">Signalé le ${fmtDate(i.created_at)}</div>
            ${i.prestataire?`<div class="incident-sub" style="color:var(--primary)">↳ Prestataire : ${i.prestataire}</div>`:''}
          ${i.commentaire_syndic?`<div style="background:var(--primary-pale);border-left:3px solid var(--primary);padding:6px 10px;border-radius:0 6px 6px 0;margin-top:5px;font-size:12px"><i class='fa-solid fa-comment' style='color:var(--primary)'></i> <b style='color:var(--primary)'>Syndic :</b> ${i.commentaire_syndic}</div>`:''}
          ${i.commentaire_syndic?`<div style="background:var(--primary-pale);border-left:3px solid var(--primary);padding:6px 10px;border-radius:0 6px 6px 0;margin-top:6px;font-size:12px;color:var(--primary)"><i class='fa-solid fa-comment'></i> <strong>Syndic :</strong> ${i.commentaire_syndic}</div>`:''}
            <div class="progress-bar" style="margin-top:6px"><div class="progress-fill ${i.statut==='ouvert'?'orange':''}" style="width:${i.statut==='ouvert'?20:60}%"></div></div>
          </div>${statusPill(i.statut)}
        </div>`).join('')}</div>`:`
        <div style="text-align:center;padding:2rem">
          <i class="fa-solid fa-circle-check" style="font-size:2rem;color:var(--border-dark);margin-bottom:.75rem;display:block"></i>
          <p style="color:var(--text-3);margin-bottom:1rem">Aucune réclamation en cours</p>
          <button class="btn btn-primary" onclick="openNewIncident()"><i class="fa-solid fa-plus"></i> Faire une réclamation</button>
        </div>`}
    </div>
    ${resolus.length?`<div class="card"><div class="card-hdr"><i class="fa-solid fa-check-circle"></i> Résolues (${resolus.length})</div>
      <div class="incident-list">${resolus.map(i=>`<div class="incident-card" style="opacity:.7">
        <div class="inc-icon inc-green"><i class="fa-solid fa-${typeIcon[i.type]||'check'}"></i></div>
        <div class="incident-body"><div class="incident-title">✓ ${i.type}${i.localisation?' — '+i.localisation:''}</div>
        <div class="incident-sub">Résolu ${fmtDate(i.date_resolution)} ${i.prestataire?'· '+i.prestataire:''}</div></div>
        <span class="pill pill-green">Résolu</span></div>`).join('')}
      </div></div>`:''}`);}

async function loadRDocuments(){
  const data=await GET('/documents'); if(!data)return;
  const docIcon=d=>{const e=(d.nom||'').split('.').pop().toLowerCase();return e==='pdf'?'file-pdf':e==='doc'||e==='docx'?'file-word':e==='xls'||e==='xlsx'?'file-excel':['jpg','jpeg','png','gif'].includes(e)?'file-image':'file';};
  const docColor=d=>{const e=(d.nom||'').split('.').pop().toLowerCase();return e==='pdf'?'#e74c3c':['doc','docx'].includes(e)?'#2980b9':['xls','xlsx'].includes(e)?'#27ae60':'var(--accent)';};
  const cats={ag:'Assemblées Générales',reglementation:'Réglementation',contrats:'Contrats',financier:'Financier',autre:'Autres'};
  const byCat={}; data.forEach(d=>{(byCat[d.categorie]=byCat[d.categorie]||[]).push(d);});
  setPageContent('r-documents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Documents</h1><p>${data.length} document(s) mis à disposition par le syndic</p></div></div>
    ${data.length===0?`<div class="card"><div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>Aucun document disponible pour l'instant</p><p style="font-size:12px;margin-top:4px;color:var(--text-3)">Le syndic n'a pas encore publié de documents.</p></div></div>`:''}
    ${Object.keys(cats).filter(c=>byCat[c]?.length).map(c=>`
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-folder-open"></i> ${cats[c]} <span class="pill pill-blue" style="margin-left:auto">${byCat[c].length}</span></div>
      <div class="doc-grid">${byCat[c].map(d=>`
        <div class="doc-card" title="${d.nom}">
          <div class="doc-icon"><i class="fa-solid fa-${docIcon(d)}" style="color:${docColor(d)};font-size:2rem"></i></div>
          <div class="doc-name">${d.nom}</div>
          <div class="doc-date">${fmtDate(d.created_at)}</div>
          ${d.taille_ko?`<div class="doc-size">${d.taille_ko} Ko</div>`:''}
          ${d.url
            ?`<a class="btn btn-primary btn-xs" href="${d.url}" target="_blank" rel="noopener" style="margin-top:4px"><i class="fa-solid fa-eye"></i> Ouvrir</a>`
            :`<span class="pill pill-gray" style="font-size:10px;margin-top:4px">Non disponible</span>`}
        </div>`).join('')}
      </div>
    </div>`).join('')}`);
}

async function loadRMessagerie(){
  const [syndic,forum]=await Promise.all([GET('/messages?canal=syndic'),GET('/messages?canal=forum')]);
  const myId=state.user.id;
  const renderMsg=(msgs,canal)=>msgs.map(m=>{
    const isMe=m.expediteur_id===myId;
    const av=((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase();
    const avCls=isMe?'av-b':m.role==='gestionnaire'?'av-g':'av-a';
    const t=new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    return`<div class="msg-row ${isMe?'me':''}" id="msg-${m.id}">
      <div class="av ${avCls}">${av}</div>
      <div style="max-width:75%">
        <div class="bubble ${isMe?'bubble-me':'bubble-them'}">${m.contenu}</div>
        <div class="bubble-time ${isMe?'me':''}">${isMe?'Vous':m.prenom} · ${t}</div>
      </div>
    </div>`;
  }).join('');
  setPageContent('r-messagerie',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Messagerie</h1></div></div>
    <div class="grid-2">
      <div class="card" style="display:flex;flex-direction:column;height:480px">
        <div class="card-hdr"><i class="fa-solid fa-headset"></i> Syndic — Support</div>
        <div class="msg-wrapper" id="msg-syndic" style="flex:1;overflow-y:auto">${renderMsg(syndic||[],'syndic')}</div>
        <div class="msg-input-area" style="margin-top:auto">
          <input class="form-control" id="msg-input-syndic" placeholder="Écrivez au syndic…" onkeydown="if(event.key==='Enter')sendMessage('syndic')">
          <button class="btn btn-primary" onclick="sendMessage('syndic')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;height:480px">
        <div class="card-hdr"><i class="fa-solid fa-people-group"></i> Forum résidents</div>
        <div class="msg-wrapper" id="msg-forum" style="flex:1;overflow-y:auto">${renderMsg(forum||[],'forum')}</div>
        <div class="msg-input-area" style="margin-top:auto">
          <input class="form-control" id="msg-input-forum" placeholder="Écrivez au forum…" onkeydown="if(event.key==='Enter')sendMessage('forum')">
          <button class="btn btn-primary" onclick="sendMessage('forum')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>`);
  ['syndic','forum'].forEach(c=>{const el=document.getElementById('msg-'+c);if(el)el.scrollTop=el.scrollHeight;});
}

async function sendMessage(canal){
  const input=document.getElementById('msg-input-'+canal);
  const contenu=input?.value?.trim(); if(!contenu)return; input.value='';
  try{
    await POST('/messages',{canal,contenu});
    loaded.delete('r-messagerie'); loaded.delete('g-messagerie');
    if(state.currentPage==='r-messagerie')await loadRMessagerie();
    if(state.currentPage==='g-messagerie')await loadGMessagerie();
  }catch{showError('Erreur envoi'); input.value=contenu;}
}

async function deleteMessage(id, canal){
  try{
    await fetch(API+'/messages/'+id,{method:'DELETE',headers:{'Authorization':'Bearer '+state.token}});
    ['r-messagerie','g-messagerie'].forEach(p=>loaded.delete(p));
    if(state.currentPage==='g-messagerie')loadGMessagerie();
    if(state.currentPage==='r-messagerie')loadRMessagerie();
  }catch{showError('Erreur suppression');}
}

// ========== MESSAGERIE GESTIONNAIRE ==========
async function loadGMessagerie(){
  const [syndic,forum]=await Promise.all([GET('/messages?canal=syndic'),GET('/messages?canal=forum')]);
  const myId=state.user.id;
  const renderGMsg=(msgs,canal)=>{
    if(!msgs?.length) return `<div style="text-align:center;padding:1.5rem;color:var(--text-3);font-size:13px">Aucun message</div>`;
    return msgs.map(m=>{
      const isMe=m.expediteur_id===myId;
      const av=((m.prenom||'?')[0]+(m.nom||'?')[0]).toUpperCase();
      const avCls=m.role==='gestionnaire'?'av-g':m.role==='admin'?'av-v':'av-a';
      const t=new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
      return`<div class="msg-row ${isMe?'me':''}" id="msg-${m.id}" style="position:relative">
        <div class="av ${isMe?'av-g':avCls}">${av}</div>
        <div style="max-width:72%">
          <div style="font-size:10px;color:var(--text-3);margin-bottom:2px">${m.prenom} ${m.nom}${m.lot?' (Lot '+m.lot+')':''} ${isMe?'— Syndic':''}</div>
          <div class="bubble ${isMe?'bubble-me':'bubble-them'}" style="position:relative">
            ${m.contenu}
            <button onclick="deleteMessage(${m.id},'${canal}')" title="Supprimer"
              style="position:absolute;top:-6px;right:-6px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:9px;cursor:pointer;display:none;align-items:center;justify-content:center"
              onmouseover="this.style.display='flex'" class="del-msg-btn">✕</button>
          </div>
          <div class="bubble-time ${isMe?'me':''}">${t}</div>
        </div>
      </div>`;
    }).join('');
  };
  // Grouper messages syndic par résident
  const parResident={};
  (syndic||[]).forEach(m=>{
    const key=m.expediteur_id===myId?(m.destinataire_id||'syndic'):m.expediteur_id;
    (parResident[key]=parResident[key]||[]).push(m);
  });
  const residents=Object.keys(parResident);
  setPageContent('g-messagerie',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Messagerie</h1><p>Syndic — Support et Forum</p></div></div>
    <div class="grid-2">
      <div class="card" style="display:flex;flex-direction:column;height:520px">
        <div class="card-hdr"><i class="fa-solid fa-headset"></i> Syndic — Support (${(syndic||[]).length} messages)</div>
        <div class="msg-wrapper" id="msg-g-syndic" style="flex:1;overflow-y:auto"
          onmouseenter="this.querySelectorAll('.del-msg-btn').forEach(b=>b.style.display='flex')"
          onmouseleave="this.querySelectorAll('.del-msg-btn').forEach(b=>b.style.display='none')">
          ${renderGMsg(syndic||[],'syndic')}
        </div>
        <div class="msg-input-area" style="margin-top:auto">
          <input class="form-control" id="msg-g-syndic-input" placeholder="Répondre aux résidents…" onkeydown="if(event.key==='Enter')sendGMessage('syndic')">
          <button class="btn btn-primary" onclick="sendGMessage('syndic')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;height:520px">
        <div class="card-hdr"><i class="fa-solid fa-people-group"></i> Forum résidents (${(forum||[]).length} messages)</div>
        <div class="msg-wrapper" id="msg-g-forum" style="flex:1;overflow-y:auto"
          onmouseenter="this.querySelectorAll('.del-msg-btn').forEach(b=>b.style.display='flex')"
          onmouseleave="this.querySelectorAll('.del-msg-btn').forEach(b=>b.style.display='none')">
          ${renderGMsg(forum||[],'forum')}
        </div>
        <div class="msg-input-area" style="margin-top:auto">
          <input class="form-control" id="msg-g-forum-input" placeholder="Message au forum…" onkeydown="if(event.key==='Enter')sendGMessage('forum')">
          <button class="btn btn-primary" onclick="sendGMessage('forum')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>`);
  ['g-syndic','g-forum'].forEach(c=>{const el=document.getElementById('msg-'+c);if(el)el.scrollTop=el.scrollHeight;});
}

async function sendGMessage(canal){
  const inputId=`msg-g-${canal}-input`;
  const input=document.getElementById(inputId);
  const contenu=input?.value?.trim(); if(!contenu)return; input.value='';
  try{
    await POST('/messages',{canal,contenu});
    loaded.delete('g-messagerie');
    await loadGMessagerie();
  }catch{showError('Erreur envoi');}
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
  try{const r=await PUT('/auth/me',{prenom:document.getElementById('p-prenom').value,nom:document.getElementById('p-nom').value,telephone:document.getElementById('p-tel').value,notif_email:document.getElementById('sw-email').checked,notif_sms:document.getElementById('sw-sms').checked});if(r){state.user={...state.user,...r};showToast(' Profil mis à jour');}}
  catch{showError('Erreur');}
}

// ====================== GESTIONNAIRE =======================

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
  // Charger les déclarations en attente
  await loadDeclarationsPending();
}

async function loadDeclarationsPending(){
  const decl=await GET('/charges/declarations/pending').catch(()=>[]);
  if(!decl?.length) return;
  // Insérer le badge impayés
  const b=document.getElementById('badge-impayes');
  if(b){b.textContent=decl.length;b.style.display='';}
  // Insérer le bloc dans la page comptabilité
  const existing=document.getElementById('decl-pending-block');
  if(existing) existing.remove();
  const block=document.createElement('div');
  block.id='decl-pending-block';
  block.innerHTML=`
    <div class="card" style="border-color:var(--violet);border-width:2px">
      <div class="card-hdr" style="color:var(--violet)">
        <i class="fa-solid fa-clock" style="color:var(--violet)"></i>
        Déclarations en attente de validation (${decl.length})
        <div class="card-hdr-right"><span class="pill pill-violet">Action requise</span></div>
      </div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Copropriétaire</th><th>Lot</th><th>Période</th><th>Montant</th><th>Mode</th><th>Date décl.</th><th>Référence</th><th>Actions</th></tr></thead>
        <tbody>${decl.map(p=>`<tr>
          <td><strong>${p.prenom} ${p.nom}</strong></td>
          <td>${p.lot||'—'}</td>
          <td>${p.periode||'—'}</td>
          <td><strong>${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</strong></td>
          <td>${p.mode||'—'}</td>
          <td>${fmtDate(p.date_paiement)}</td>
          <td style="font-size:12px;color:var(--text-3)">${p.reference||'—'}</td>
          <td><div style="display:flex;gap:5px">
            <button class="btn btn-primary btn-sm" onclick="validerPaiement(${p.id},'${p.prenom} ${p.nom}',${p.montant},'${p.periode}')">
              <i class="fa-solid fa-check"></i> Valider</button>
            <button class="btn btn-danger btn-sm" onclick="rejeterPaiement(${p.id},'${p.prenom} ${p.nom}',${p.montant},'${p.periode}')">
              <i class="fa-solid fa-xmark"></i> Rejeter</button>
          </div></td>
        </tr>`).join('')}
        </tbody></table></div>
    </div>`;
  // Insérer avant le tableau principal
  const page=document.getElementById('page-g-comptabilite');
  if(page) page.insertBefore(block, page.children[1]||null);
}

function validerPaiement(id, nom, montant, periode){
  document.getElementById('valider-paiement-id').value = id;
  document.getElementById('valider-paiement-info').innerHTML =
    `<i class="fa-solid fa-user"></i> <strong>${nom}</strong> — ${parseFloat(montant||0).toLocaleString('fr-FR')} MAD · ${periode||''}`;
  document.getElementById('valider-commentaire').value = '';
  openModal('modal-valider-paiement');
}

async function submitValiderPaiement(){
  const id = document.getElementById('valider-paiement-id').value;
  const commentaire = document.getElementById('valider-commentaire').value.trim();
  const btn = document.getElementById('valider-submit-btn');
  btn.disabled = true;
  try{
    await POST('/charges/paiements/'+id+'/valider', { commentaire: commentaire||'' });
    showToast('✅ Paiement validé — résident notifié par email');
    closeModal('modal-valider-paiement');
    loaded.delete('g-comptabilite'); loadGCompta();
  }catch(e){ showError(e.error||'Erreur'); }
  btn.disabled = false;
}

function rejeterPaiement(id, nom, montant, periode){
  document.getElementById('rejeter-paiement-id').value = id;
  document.getElementById('rejeter-paiement-info').innerHTML =
    `<i class="fa-solid fa-user"></i> <strong>${nom}</strong> — ${parseFloat(montant||0).toLocaleString('fr-FR')} MAD · ${periode||''}`;
  document.getElementById('rejeter-motif').value = '';
  openModal('modal-rejeter-paiement');
}

async function submitRejeterPaiement(){
  const id = document.getElementById('rejeter-paiement-id').value;
  const motif = document.getElementById('rejeter-motif').value.trim();
  if(!motif){ showError('Le motif du rejet est obligatoire'); return; }
  const btn = document.getElementById('rejeter-submit-btn');
  btn.disabled = true;
  try{
    await POST('/charges/paiements/'+id+'/rejeter', { motif });
    showToast('⚠️ Déclaration rejetée — résident notifié', 'warn');
    closeModal('modal-rejeter-paiement');
    loaded.delete('g-comptabilite'); loadGCompta();
  }catch(e){ showError(e.error||'Erreur'); }
  btn.disabled = false;
}

// ── Déclarations en attente ─────────────────────────────────────
async function checkDeclarationsPending(){
  try{
    const decl = await GET('/charges/declarations/pending').catch(()=>[]);
    // Toujours afficher le bloc, même vide
    const b=document.getElementById('badge-impayes');
    if(b){ b.textContent=decl?.length||''; b.style.display=decl?.length?'':'none'; }
    renderDeclarationsPending(decl||[]);
  }catch(e){ console.warn('declarations/pending:', e.message); renderDeclarationsPending([]); }
}

function renderDeclarationsPending(decl){
  const existing = document.getElementById('decl-pending-block');
  if(existing) existing.remove();
  const page = document.getElementById('page-g-comptabilite');
  if(!page) return;
  const div = document.createElement('div');
  div.id = 'decl-pending-block';
  div.style.marginBottom = '1rem';

  const hasPending = decl && decl.length > 0;
  div.innerHTML = `<div class="card" style="border:2px solid ${hasPending?'var(--violet)':'var(--border)'};background:${hasPending?'white':'var(--surface2)'}">
    <div class="card-hdr" style="color:${hasPending?'var(--violet)':'var(--text-3)'}">
      <i class="fa-solid fa-${hasPending?'clock':'circle-check'}" style="color:${hasPending?'var(--violet)':'var(--text-3)'}"></i>
      Paiements déclarés par les résidents${hasPending?' ('+decl.length+' à valider)':''}
      ${hasPending?`<div class="card-hdr-right"><span style="background:var(--violet-pale);color:var(--violet);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;animation:pulse 2s infinite">⚡ ACTION REQUISE</span></div>`:''}
    </div>
    ${hasPending ? `
    <div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Copropriétaire</th><th>Lot</th><th>Période</th><th>Montant</th><th>Mode</th><th>Date déclaration</th><th>Référence</th><th>Validation</th></tr></thead>
      <tbody>${decl.map(p=>`<tr style="background:var(--violet-pale)">
        <td><strong>${p.prenom} ${p.nom}</strong></td>
        <td>${p.lot||'—'}</td>
        <td><strong>${p.periode||'—'}</strong></td>
        <td><strong>${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</strong></td>
        <td><span class="pill pill-blue">${p.mode||'virement'}</span></td>
        <td>${fmtDate(p.date_paiement)}</td>
        <td style="font-size:12px">${p.reference||'—'}</td>
        <td><div style="display:flex;gap:5px">
          <button class="btn btn-primary btn-sm" onclick="validerPaiement(${p.id},'${p.prenom} ${p.nom}',${p.montant},'${p.periode}')">
            <i class="fa-solid fa-check"></i> Valider</button>
          <button class="btn btn-danger btn-sm" onclick="rejeterPaiement(${p.id},'${p.prenom} ${p.nom}',${p.montant},'${p.periode}')">
            <i class="fa-solid fa-xmark"></i> Rejeter</button>
        </div></td>
      </tr>`).join('')}
      </tbody></table></div>` :
    `<div style="padding:.75rem;font-size:13px;color:var(--text-3);display:flex;align-items:center;gap:8px">
      <i class="fa-solid fa-circle-check" style="color:var(--text-3)"></i>
      Aucun paiement déclaré en attente — Les résidents peuvent déclarer leurs paiements depuis leur espace.
    </div>`}
  </div>`;

  const hdr = page.querySelector('.page-hdr');
  if(hdr) hdr.insertAdjacentElement('afterend', div);
  else page.insertBefore(div, page.firstChild);
}

async function validerPaiement(id, nom){
  const commentaire = prompt(`Commentaire pour ${nom} (optionnel, appuyez sur OK pour valider directement) :`);
  if(commentaire === null) return; // annulé
  try{
    await POST('/charges/paiements/'+id+'/valider', {commentaire});
    showToast('✅ Paiement de '+nom+' validé — résident notifié par email');
    loaded.delete('g-comptabilite');
    await loadGCompta();
  }catch(e){ showError(e.error||'Erreur validation'); }
}

async function rejeterPaiement(id, nom){
  const motif = prompt(`Motif du rejet pour ${nom} (obligatoire) :`);
  if(!motif) return showError('Motif requis');
  try{
    await POST('/charges/paiements/'+id+'/rejeter', {motif});
    showToast('Déclaration de '+nom+' rejetée — résident notifié', 'warn');
    loaded.delete('g-comptabilite');
    await loadGCompta();
  }catch(e){ showError(e.error||'Erreur rejet'); }
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
        <div class="imp-detail">${j>60?' Mise en demeure':j>30?' 2e relance':' 1ère relance'}</div></div>
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
  const urgIcon={normal:'',urgent:'',tres_urgent:''};
  setPageContent('g-travaux',`
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Travaux & Entretien</h1><p>${actifs.length} intervention(s) en cours</p></div>
      <div class="hdr-actions">
        <button class="btn btn-ghost btn-sm" onclick="openModal('modal-intervention')"><i class="fa-solid fa-hard-hat"></i> Intervention prestataire</button>
        <button class="btn btn-primary" onclick="openModal('modal-intervention')"><i class="fa-solid fa-plus"></i> Ajouter</button>
      </div>
    </div>
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-circle-dot"></i></div><div class="metric-val">${actifs.filter(i=>i.statut==='ouvert').length}</div><div class="metric-label">Nouveaux signalements</div></div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-person-digging"></i></div><div class="metric-val">${actifs.filter(i=>i.statut==='en_cours').length}</div><div class="metric-label">En cours de traitement</div></div>
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-circle-check"></i></div><div class="metric-val">${resolus.length}</div><div class="metric-label">Résolus récemment</div></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-hard-hat"></i> Interventions actives
        <div class="card-hdr-right"><button class="btn btn-primary btn-sm" onclick="openModal('modal-intervention')"><i class="fa-solid fa-plus"></i> Ajouter</button></div>
      </div>
      ${actifs.length?`<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Type</th><th>Localisation</th><th>Signalé par</th><th>Date</th><th>Prestataire</th><th>Coût</th><th>Urgence</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${actifs.map(i=>`<tr>
          <td><strong>${i.type}</strong></td>
          <td>${i.localisation||'—'}</td>
          <td style="font-size:12px">${i.prenom||''} ${i.nom||''} ${i.lot?'(Lot '+i.lot+')':''}</td>
          <td style="white-space:nowrap">${fmtDate(i.created_at)}</td>
          <td>${i.prestataire?`<span style="color:var(--primary);font-weight:600">${i.prestataire}</span>`:'<span style="color:var(--text-3)">—</span>'}</td>
          <td>${i.cout?parseFloat(i.cout).toLocaleString('fr-FR')+' MAD':'—'}</td>
          <td>${urgIcon[i.urgence]||''} ${i.urgence||'normal'}</td>
          <td>${statusPill(i.statut)}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-xs" onclick='openEditIntervention(${JSON.stringify(i).replace(/'/g,"\\'")})'><i class="fa-solid fa-edit"></i></button>
            <button class="btn btn-ghost btn-xs" onclick='openStatutModal(${JSON.stringify(i)})' title="Modifier statut"><i class="fa-solid fa-edit"></i> Statut</button>
            <button class="btn btn-primary btn-xs" onclick="openResolveModal(${i.id},'${i.type}')"><i class="fa-solid fa-check"></i> Résoudre</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>`:`<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Aucune intervention en cours</p><button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openModal('modal-intervention')"><i class="fa-solid fa-plus"></i> Créer la première</button></div>`}
    </div>
    ${resolus.length?`<div class="card">
      <div class="card-hdr"><i class="fa-solid fa-check-circle"></i> Résolus récemment</div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Type</th><th>Localisation</th><th>Signalé par</th><th>Résolu le</th><th>Prestataire</th><th>Coût final</th></tr></thead>
        <tbody>${resolus.map(i=>`<tr>
          <td><strong>${i.type}</strong></td><td>${i.localisation||'—'}</td>
          <td style="font-size:12px">${i.prenom||''} ${i.nom||''} ${i.lot?'Lot '+i.lot:''}</td>
          <td>${fmtDate(i.date_resolution||i.updated_at)}</td>
          <td><strong style="color:var(--primary)">${i.prestataire||'—'}</strong></td>
          <td><strong style="color:var(--text)">${i.cout?parseFloat(i.cout).toLocaleString('fr-FR')+' MAD':'Non renseigné'}</strong></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}`);}

function openEditIntervention(i){
  document.getElementById('intv-id').value=i.id;
  document.getElementById('intv-type').value=i.type||'Plomberie';
  document.getElementById('intv-loc').value=i.localisation||'';
  document.getElementById('intv-desc').value=i.description||'';
  document.getElementById('intv-urgence').value=i.urgence||'normal';
  document.getElementById('intv-prestataire').value=i.prestataire||'';
  document.getElementById('intv-cout').value=i.cout||'';
  document.getElementById('intv-statut').value=i.statut||'ouvert';
  document.getElementById('modal-intv-title').innerHTML='<i class="fa-solid fa-edit" style="color:var(--primary)"></i> Modifier l\'intervention';
  openModal('modal-intervention');
}

async function submitIntervention(){
  const id=document.getElementById('intv-id').value;
  const coutRaw=document.getElementById('intv-cout').value;
  const body={
    type:document.getElementById('intv-type').value,
    localisation:document.getElementById('intv-loc').value,
    description:document.getElementById('intv-desc').value,
    urgence:document.getElementById('intv-urgence').value,
    prestataire:document.getElementById('intv-prestataire').value,
    cout:coutRaw?parseFloat(coutRaw):null,
    statut:document.getElementById('intv-statut').value,
  };
  if(!body.type)return showError('Type requis');
  try{
    if(id){ await PUT('/incidents/'+id, body); showToast(' Intervention mise à jour'); }
    else { await POST('/incidents', body); showToast(' Intervention créée'); }
    closeModal('modal-intervention');
    document.getElementById('intv-id').value='';
    loaded.delete('g-travaux'); loadGTravaux();
  }catch(e){showError(e.error||'Erreur');}
}

// ── Résolution incident avec commentaire syndic ──────────────────────────────

// ── Résolution incident avec commentaire syndic ─────────────────────────────
function openResolveModal(id, type){
  openModal('modal-resolve-incident');
  document.getElementById('resolve-incident-id').value = id;
  const el = document.getElementById('resolve-incident-type');
  if(el) el.textContent = type || 'Intervention';
  document.getElementById('resolve-commentaire').value = '';
}

async function submitResolveIncident(){
  const id = document.getElementById('resolve-incident-id').value;
  const commentaire = document.getElementById('resolve-commentaire').value.trim();
  const btn = document.getElementById('resolve-submit-btn');
  btn.disabled = true;
  try{
    const body = { statut:'resolu', date_resolution:new Date().toISOString().split('T')[0] };
    if(commentaire) body.commentaire_syndic = commentaire;
    await PUT('/incidents/'+id, body);
    showToast(commentaire ? '✅ Résolue — résident notifié par email' : '✅ Résolue');
    closeModal('modal-resolve-incident');
    loaded.delete('g-travaux'); loadGTravaux();
  }catch(e){ showError(e.error||'Erreur'); }
  btn.disabled = false;
}

// ── Modifier statut depuis le tableau travaux ────────────────────────────────
function openStatutModal(i){
  openModal('modal-statut-incident');
  document.getElementById('statut-incident-id').value = i.id;
  const el = document.getElementById('statut-incident-type');
  if(el) el.textContent = i.type + (i.localisation ? ' — '+i.localisation : '');
  document.getElementById('statut-select').value = i.statut || 'ouvert';
  document.getElementById('statut-prestataire').value = i.prestataire || '';
  document.getElementById('statut-cout').value = i.cout || '';
  document.getElementById('statut-commentaire').value = '';
}

async function submitStatutIncident(){
  const id = document.getElementById('statut-incident-id').value;
  const statut = document.getElementById('statut-select').value;
  const prestataire = document.getElementById('statut-prestataire').value.trim();
  const cout = document.getElementById('statut-cout').value;
  const commentaire = document.getElementById('statut-commentaire').value.trim();
  const btn = document.getElementById('statut-submit-btn');
  btn.disabled = true;
  try{
    const body = { statut };
    if(prestataire) body.prestataire = prestataire;
    if(cout) body.cout = parseFloat(cout);
    if(commentaire) body.commentaire_syndic = commentaire;
    if(statut==='resolu') body.date_resolution = new Date().toISOString().split('T')[0];
    await PUT('/incidents/'+id, body);
    showToast(commentaire ? '✅ Mis à jour — résident notifié' : '✅ Mis à jour');
    closeModal('modal-statut-incident');
    loaded.delete('g-travaux'); loadGTravaux();
  }catch(e){ showError(e.error||'Erreur'); }
  btn.disabled = false;
}

async function resolveIncident(id){ openResolveModal(id, ''); }

// ── Modifier statut incident (depuis liste) ───────────────────────────────────
function openStatutModal(i){
  openModal('modal-statut-incident');
  document.getElementById('statut-incident-id').value = i.id;
  document.getElementById('statut-incident-type').textContent = i.type + (i.localisation ? ' — '+i.localisation : '');
  document.getElementById('statut-select').value = i.statut || 'ouvert';
  document.getElementById('statut-prestataire').value = i.prestataire || '';
  document.getElementById('statut-cout').value = i.cout || '';
  document.getElementById('statut-commentaire').value = '';
}

async function submitStatutIncident(){
  const id = document.getElementById('statut-incident-id').value;
  const statut = document.getElementById('statut-select').value;
  const prestataire = document.getElementById('statut-prestataire').value.trim();
  const cout = document.getElementById('statut-cout').value;
  const commentaire = document.getElementById('statut-commentaire').value.trim();
  const btn = document.getElementById('statut-submit-btn');
  btn.disabled = true;
  try{
    const body = { statut };
    if(prestataire) body.prestataire = prestataire;
    if(cout) body.cout = parseFloat(cout);
    if(commentaire) body.commentaire_syndic = commentaire;
    if(statut === 'resolu') body.date_resolution = new Date().toISOString().split('T')[0];
    await PUT('/incidents/'+id, body);
    const notifie = commentaire || statut !== document.getElementById('statut-select').defaultValue;
    showToast(notifie ? '✅ Mis à jour — résident notifié' : '✅ Mis à jour');
    closeModal('modal-statut-incident');
    loaded.delete('g-travaux'); loadGTravaux();
  }catch(e){ showError(e.error||'Erreur'); }
  btn.disabled = false;
}

async function resolveIncident(id){ openResolveModal(id,""); }

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
  window._jardinage_villas = data.map(r=>({lot:r.lot||'',prenom:r.prenom||'',nom:r.nom||'',id:r.id})).filter(r=>r.lot);
  setPageContent('g-residents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Résidents</h1><p>${data.length} copropriétaires</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openResidentModal()"><i class="fa-solid fa-user-plus"></i> Ajouter un résident</button></div>
    </div>
    <div class="card">
      <div id="res-list-container"></div>
      <script>document.getElementById('res-list-container') && renderResidentList(window._last_residents||[]);</script>
      <div style="overflow-x:auto" id="res-table-wrap"><table class="data-table">
        <thead><tr><th>Résident</th><th>Lot</th><th>Email</th><th>Tél.</th><th>Statut charges</th><th>Actions</th></tr></thead>
        <tbody>${data.map(r=>`<tr>
          <td data-label="Résident"><div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:6px;background:var(--info);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${ini(r)}</div><strong>${r.prenom} ${r.nom}</strong></div></td>
          <td data-label="Lot">${r.lot||'—'}</td>
          <td data-label="Email" style="font-size:12px;color:var(--info)">${r.email}</td>
          <td data-label="Tél." style="font-size:12px">${r.telephone||'—'}</td>
          <td data-label="Statut">${statusPill(r.statut_charges||'en_attente')}</td>
          <td data-label="Actions"><div style="display:flex;gap:4px">
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
    if(id){await PUT('/residents/'+id,body);showToast(' Résident mis à jour');}
    else{const r=await POST('/residents',body);showToast(' Résident créé');if(document.getElementById('res-welcome').checked&&r?.id)sendBienvenueEmail(r.id);}
    closeModal('modal-resident');loaded.delete('g-residents');loadGResidents();
  }catch(e){showError(e.error||'Erreur');}
}

async function deleteResident(id,nom){
  if(!confirm(`Supprimer ${nom} ?`))return;
  try{await DEL('/residents/'+id);showToast(' Supprimé');loaded.delete('g-residents');loadGResidents();}
  catch(e){showError(e.error||'Impossible de supprimer');}
}

// ── Documents Gestionnaire ────────────────────────────────
async function loadGDocuments(){
  const data=await GET('/documents'); if(!data)return;
  const cats={ag:'Assemblées Générales',reglementation:'Réglementation',contrats:'Contrats',financier:'Financier',autre:'Autres'};
  const docIcon=n=>{const e=(n||'').split('.').pop().toLowerCase();return{'pdf':'file-pdf','doc':'file-word','docx':'file-word','xls':'file-excel','xlsx':'file-excel','jpg':'file-image','jpeg':'file-image','png':'file-image'}[e]||'file';};
  const avecUrl=data.filter(d=>d.url).length;
  const sansUrl=data.filter(d=>!d.url).length;
  setPageContent('g-documents',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Documents</h1><p>${data.length} document(s) · ${avecUrl} accessibles</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-upload-doc')"><i class="fa-solid fa-cloud-arrow-up"></i> Publier un document</button></div>
    </div>
    ${sansUrl>0?`<div style="background:var(--warning-pale);border:1px solid rgba(176,107,16,.3);border-radius:var(--radius-sm);padding:12px 14px;display:flex;align-items:center;gap:10px">
      <i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);font-size:1.1rem"></i>
      <div style="flex:1;font-size:13px;color:var(--warning)"><strong>${sansUrl} document(s) sans lien</strong> — Le stockage Cloudinary n'est pas configuré. Les fichiers déposés avant la config sont perdus. <br>Supprimez-les et re-uploadez après avoir configuré <code>CLOUDINARY_CLOUD_NAME</code> dans Render.</div>
    </div>`:''}
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-table"></i> Liste des documents
        <div class="card-hdr-right"><button class="btn btn-primary btn-sm" onclick="openModal('modal-upload-doc')"><i class="fa-solid fa-plus"></i> Nouveau</button></div>
      </div>
      ${data.length?`<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Nom</th><th>Catégorie</th><th>Publié le</th><th>Taille</th><th>Accès</th><th>Actions</th></tr></thead>
        <tbody>${data.map(d=>`<tr>
          <td><div style="display:flex;align-items:center;gap:8px">
            <i class="fa-solid fa-${docIcon(d.nom)}" style="color:${d.nom.toLowerCase().endsWith('.pdf')?'#e74c3c':'var(--accent)'}"></i>
            <strong>${d.nom}</strong></div></td>
          <td><span class="pill pill-blue">${cats[d.categorie]||d.categorie||'—'}</span></td>
          <td>${fmtDate(d.created_at)}</td>
          <td>${d.taille_ko?d.taille_ko+' Ko':'—'}</td>
          <td>${d.url
            ?`<a class="btn btn-primary btn-xs" href="${d.url}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-external-link-alt"></i> Ouvrir</a>`
            :`<span style="font-size:11px;color:var(--danger);font-weight:600">⚠️ Sans lien</span>`}</td>
          <td><button class="btn-icon btn-sm" style="color:var(--danger)" title="Supprimer" onclick="deleteDoc(${d.id},'${d.nom}')"><i class="fa-solid fa-trash"></i></button></td>
        </tr>`).join('')}
        </tbody></table></div>`
      :`<div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>Aucun document. Publiez le premier !</p><button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openModal('modal-upload-doc')"><i class="fa-solid fa-cloud-arrow-up"></i> Publier</button></div>`}
    </div>`);
}


async function deleteDoc(id,nom){
  if(!confirm(`Supprimer "${nom}" ?`))return;
  try{await DEL('/documents/'+id);showToast(' Supprimé');loaded.delete('g-documents');loaded.delete('r-documents');loadGDocuments();}
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
          <div class="incident-card" onclick="notifyImpayes()"><div class="inc-icon inc-red"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="incident-body"><div class="incident-title">Relances impayés</div><div class="incident-sub">Email + WhatsApp aux résidents en retard</div></div><i class="fa-solid fa-chevron-right" style="color:var(--text-3)"></i></div>
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
  try{[rules,execs]=await Promise.all([GET('/agenda').catch(()=>[]),GET('/agenda/executions').catch(()=>[])]);}
  catch(e){ rules=[]; execs=[]; }
  if(!rules && !execs){
    const pid=isAdmin?'a-agenda':'g-agenda';
    setPageContent(pid,`<div class="page-hdr"><div class="page-hdr-left"><h1>Agenda automatique</h1></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openAgendaModal()"><i class="fa-solid fa-plus"></i> Nouvelle règle</button></div></div>
      <div class="card" style="background:var(--warning-pale);border-color:rgba(176,107,16,.3)">
        <div class="card-hdr"><i class="fa-solid fa-triangle-exclamation" style="color:var(--warning)"></i> Module Agenda — routes/agenda.js manquant</div>
        <p style="font-size:13px;color:var(--text-2)">Uploadez <strong>backend/routes/agenda.js</strong> sur GitHub pour activer cette fonctionnalité.</p>
      </div>`);
    return;
  }
  if(!rules)rules=[]; if(!execs)execs=[];
  const pid=isAdmin?'a-agenda':'g-agenda';
  const typeLabels={appel_fonds:'Appel de fonds',rappel_paiement:'Rappel paiement',convocation_ag:'Convocation AG'};
  const canalIcon={email:'envelope',sms:'brands fa-whatsapp',les_deux:'envelope-open-text'};
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
    showToast(' Règle '+(id?'mise à jour':'créée'));
    closeModal('modal-agenda');
    ['g-agenda','a-agenda'].forEach(p=>loaded.delete(p));
    loadGAgenda(state.currentPage==='a-agenda');
  }catch(e){showError(e.error||'Erreur');}
}

async function execAgenda(id,nom){
  if(!confirm(`Exécuter maintenant "${nom}" ?`))return;
  try{const r=await POST('/agenda/'+id+'/executer');showToast(` ${r.nb_envoyes||0} message(s) envoyé(s)`);['g-agenda','a-agenda'].forEach(p=>loaded.delete(p));loadGAgenda(state.currentPage==='a-agenda');}
  catch(e){showError(e.error||'Erreur');}
}

async function deleteAgenda(id,nom){
  if(!confirm(`Supprimer "${nom}" ?`))return;
  try{await DEL('/agenda/'+id);showToast(' Supprimé');['g-agenda','a-agenda'].forEach(p=>loaded.delete(p));loadGAgenda(state.currentPage==='a-agenda');}
  catch{showError('Erreur');}
}

async function loadGBilan(){
  const [dash, charges, incidents]=await Promise.all([
    GET('/dashboard/gestionnaire'), GET('/charges'), GET('/incidents')
  ]);
  if(!dash)return;
  const actif=charges?.find(c=>c.statut==='actif');
  let paiements=[];
  if(actif){try{paiements=await GET('/charges/'+actif.id+'/paiements')||[];}catch{}}
  const totalBudget=parseFloat(dash.budgetAnnuel||0);
  const totalEncaisse=paiements.filter(p=>p.statut==='paye').reduce((s,p)=>s+parseFloat(p.montant||0),0);
  const totalImpayes=parseFloat(dash.totalImpayes||0);
  const totalDu=paiements.reduce((s,p)=>s+parseFloat(p.montant||0),0);
  const tauxRecouv=totalDu>0?Math.round((totalEncaisse/totalDu)*100):0;
  const paye=paiements.filter(p=>p.statut==='paye');
  const nonPaye=paiements.filter(p=>p.statut!=='paye');
  // Coûts des interventions (travaux, jardinage...)
  const incidentsAvecCout=(incidents||[]).filter(i=>i.cout&&parseFloat(i.cout)>0);
  const totalTravaux=incidentsAvecCout.reduce((s,i)=>s+parseFloat(i.cout),0);
  const solde=totalEncaisse-totalTravaux;
  setPageContent('g-bilan',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Bilan financier</h1><p>${actif?'Appel de fonds : '+actif.periode:'Vue consolidée'}</p></div>
      <div class="hdr-actions"><button class="btn btn-ghost btn-sm" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimer</button></div>
    </div>
    <div class="metrics-grid">
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-piggy-bank"></i></div>
        <div class="metric-val">${totalBudget.toLocaleString('fr-FR')} <span style="font-size:1rem">MAD</span></div>
        <div class="metric-label">Budget annuel</div></div>
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-arrow-down-to-bracket"></i></div>
        <div class="metric-val" style="color:var(--success)">${totalEncaisse.toLocaleString('fr-FR')} <span style="font-size:1rem">MAD</span></div>
        <div class="metric-label">Encaissé ${actif?actif.periode:''}</div></div>
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="metric-val">${totalImpayes.toLocaleString('fr-FR')} <span style="font-size:1rem">MAD</span></div>
        <div class="metric-label">Impayés</div></div>
      <div class="metric ${tauxRecouv>=80?'':'accent'}"><div class="metric-icon"><i class="fa-solid fa-percent"></i></div>
        <div class="metric-val">${tauxRecouv}<span style="font-size:1.2rem">%</span></div>
        <div class="metric-label">Taux recouvrement</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-scale-balanced"></i> Bilan de caisse — ${actif?.periode||'Global'}
        </div>
        <div style="display:flex;flex-direction:column;gap:0">
          ${[
            [' Appels de fonds émis',totalDu,'color:var(--text)',''],
            [' Encaissements reçus',totalEncaisse,'color:var(--success)','+ '],
            ['🔧 Dépenses travaux & entretien',totalTravaux,'color:var(--accent)','- '],
            [' Impayés en cours',totalImpayes,'color:var(--danger)','- '],
          ].map(([l,v,c,p])=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:13px;color:var(--text-2)">${l}</span>
            <strong style="font-size:14px;${c}">${p}${Math.abs(v).toLocaleString('fr-FR')} MAD</strong>
          </div>`).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;background:${solde>=0?'var(--primary-pale)':'var(--danger-pale)'};margin:0 -1.25rem;padding:14px 1.25rem;border-radius:0 0 var(--radius) var(--radius);margin-bottom:-1.25rem">
            <strong style="font-size:14px;color:${solde>=0?'var(--primary)':'var(--danger)'}">💰 Solde de caisse</strong>
            <strong style="font-size:1.2rem;color:${solde>=0?'var(--primary)':'var(--danger)'}">${solde.toLocaleString('fr-FR')} MAD</strong>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-chart-bar"></i> Répartition paiements</div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:var(--success)">Payés (${paye.length})</span><strong>${paye.length}</strong></div>
          <div style="height:12px;background:var(--border);border-radius:6px;overflow:hidden"><div style="height:100%;width:${tauxRecouv}%;background:var(--success);border-radius:6px;transition:width .8s"></div></div>
        </div>
        <div class="chart-bar-wrap" style="margin-top:1rem">
          ${paiements.slice(0,6).map(p=>`<div class="chart-bar-row">
            <div class="chart-bar-label">${p.prenom||''} ${p.nom||''}</div>
            <div class="chart-bar-track"><div class="chart-bar-fill ${p.statut==='paye'?'':'danger'}" style="width:${p.statut==='paye'?100:0}%"><span>${p.statut==='paye'?'Payé':'Non payé'}</span></div></div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    ${totalTravaux>0?`<div class="card">
      <div class="card-hdr"><i class="fa-solid fa-hammer"></i> Détail des dépenses travaux & jardinage</div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Type</th><th>Localisation</th><th>Prestataire</th><th>Résolu le</th><th>Coût</th></tr></thead>
        <tbody>${incidentsAvecCout.map(i=>`<tr>
          <td><strong>${i.type}</strong></td>
          <td>${i.localisation||'—'}</td>
          <td>${i.prestataire||'—'}</td>
          <td>${fmtDate(i.date_resolution||i.updated_at)}</td>
          <td><strong style="color:var(--accent)">${parseFloat(i.cout).toLocaleString('fr-FR')} MAD</strong></td>
        </tr>`).join('')}
        <tr style="background:var(--surface2)"><td colspan="4" style="font-weight:700;text-align:right">Total dépenses</td>
          <td><strong style="color:var(--accent);font-size:15px">${totalTravaux.toLocaleString('fr-FR')} MAD</strong></td></tr>
        </tbody></table></div>
    </div>`:''}
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-table"></i> Détail par copropriétaire — ${actif?.periode||''}</div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Copropriétaire</th><th>Lot</th><th>Montant dû</th><th>Date paiement</th><th>Mode</th><th>Référence</th><th>Statut</th></tr></thead>
        <tbody>${paiements.map(p=>`<tr>
          <td><strong>${p.prenom} ${p.nom}</strong></td>
          <td>${p.lot||'—'}</td>
          <td>${parseFloat(p.montant||0).toLocaleString('fr-FR')} MAD</td>
          <td>${fmtDate(p.date_paiement)}</td>
          <td>${p.mode||'—'}</td>
          <td style="font-size:12px;color:var(--text-3)">${p.reference||'—'}</td>
          <td>${statusPill(p.statut)}</td>
        </tr>`).join('')}
        </tbody></table></div>
    </div>`);
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
  try{await PUT('/settings/residence',{nom:document.getElementById('s-nom')?.value,adresse:document.getElementById('s-adresse')?.value,ville:document.getElementById('s-ville')?.value,nb_lots:parseInt(document.getElementById('s-lots')?.value),relance_auto:document.getElementById('sw-relance')?.checked,appel_fonds_auto:document.getElementById('sw-af')?.checked,notif_sms_residents:document.getElementById('sw-sms-r')?.checked});showToast(' Paramètres sauvegardés');}
  catch{showError('Erreur');}
}

// ====================== ADMIN ==============================

async function loadADashboard(){
  const stats=await GET('/admin/stats'); if(!stats)return;
  setPageContent('a-dashboard',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Administration Syndic Jasmine Park</h1></div></div>
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
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-brands fa-whatsapp"></i></div><div class="metric-val">${(log||[]).filter(n=>n.type==='whatsapp').length}</div><div class="metric-label">SMS</div></div>
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-circle-exclamation"></i></div><div class="metric-val">${(log||[]).filter(n=>n.status==='failed').length}</div><div class="metric-label">Échecs</div></div>
    </div>
    <div class="card"><div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Date</th><th>Type</th><th>Événement</th><th>Destinataire</th><th>Statut</th></tr></thead>
      <tbody>${(log||[]).map(n=>`<tr><td>${fmtDateTime(n.created_at)}</td><td><span class="pill ${n.type==='email'?'pill-blue':'pill-green'}">${n.type}</span></td><td><span class="pill pill-gray">${n.event}</span></td><td style="font-size:12px">${n.recipient_email||'—'}</td><td><span class="pill ${sc[n.status]||'pill-gray'}">${n.status}</span></td></tr>`).join('')}
      </tbody></table></div></div>`);
}


// ====================== JARDINAGE ==========================

// Helpers jardinage date
function extractJardDate(desc){
  if(!desc)return '—';
  const m=desc.match(/\s*([^|]+)\|/);
  return m?m[1].trim():'—';
}
function extractJardDesc(desc){
  if(!desc)return desc||'—';
  const m=desc.match(/\|\s*(.+)$/);
  return m?m[1].trim():desc;
}
async function loadRJardinage(){
  // Lire les interventions jardinage depuis les incidents de type Jardinage
  const all=await GET('/incidents'); if(!all)return;
  const now=new Date();
  const jardins=all.filter(i=>i.type==='Jardinage'||i.type==='jardinage').sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const aVenir=jardins.filter(i=>i.statut!=='resolu'&&i.statut!=='ferme');
  const passes=jardins.filter(i=>i.statut==='resolu').slice(0,5);
  const typeIcon={tonte:'scissors',taille:'leaf',arrosage:'droplet',nettoyage:'broom',plantation:'seedling',traitement:'spray-can-sparkles'};
  setPageContent('r-jardinage',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Planning Jardinage</h1><p>Espaces verts de la résidence</p></div></div>
    <div class="card" style="background:linear-gradient(135deg,#1a7a52 0%,#27ae60 100%);border:none;color:#fff">
      <div style="display:flex;align-items:center;gap:1rem">
        <div style="font-size:3rem"></div>
        <div><div style="font-size:1.2rem;font-weight:700">Espaces verts — ${state.user.residence_nom||'Résidence'}</div>
        <div style="opacity:.8;font-size:13px;margin-top:4px">${aVenir.length} intervention(s) planifiée(s) · Prestataire : ${aVenir[0]?.prestataire||'Voir avec le syndic'}</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-calendar-days" style="color:#27ae60"></i> Interventions planifiées</div>
      ${aVenir.length?`<div style="display:flex;flex-direction:column;gap:8px">
        ${aVenir.map(j=>`<div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--surface2);border-radius:var(--radius-sm);border-left:4px solid #27ae60">
          <div style="width:42px;height:42px;border-radius:9px;background:#e8f8f0;color:#27ae60;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0"></div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text)">${j.localisation||'Espaces communs'}</div>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px">${j.description||j.type}</div>
            ${j.prestataire?`<div style="font-size:11px;color:#27ae60;margin-top:2px"><i class="fa-solid fa-user-gear"></i> ${j.prestataire}</div>`:''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:12px;font-weight:600;color:var(--text)">${fmtDate(j.created_at)}</div>
            <span class="pill" style="background:#e8f8f0;color:#27ae60;margin-top:4px">${j.statut==='en_cours'?'En cours':'Planifié'}</span>
          </div>
        </div>`).join('')}
      </div>`:`<div class="empty-state"><i class="fa-solid fa-leaf" style="color:#27ae60"></i><p>Aucune intervention planifiée</p></div>`}
    </div>
    ${passes.length?`<div class="card"><div class="card-hdr"><i class="fa-solid fa-clock-rotate-left"></i> Interventions passées</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${passes.map(j=>`<div style="display:flex;align-items:center;gap:10px;padding:8px;background:var(--surface2);border-radius:6px;opacity:.7">
          <span style="font-size:1.2rem"></span>
          <div style="flex:1;font-size:13px;color:var(--text-2)">${j.localisation||'Espaces communs'} — ${j.description||''}</div>
          <div style="font-size:11px;color:var(--text-3)">${fmtDate(j.date_resolution)}</div>
        </div>`).join('')}
      </div>
    </div>`:''}`);
}

async function loadGJardinage(){
  const all=await GET('/incidents'); if(!all)return;
  const jardins=all.filter(i=>i.type==='Jardinage').sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  setPageContent('g-jardinage',`
    <div class="page-hdr"><div class="page-hdr-left"><h1>Planning Jardinage</h1><p>${jardins.length} intervention(s) configurée(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-jardinage')"><i class="fa-solid fa-plus"></i> Planifier une intervention</button></div>
    </div>
    <div class="card" style="background:linear-gradient(135deg,#1a7a52 0%,#27ae60 100%);border:none;color:#fff;padding:1.25rem">
      <div style="display:flex;align-items:center;gap:1rem">
        <div style="font-size:2.5rem"></div>
        <div><div style="font-size:1.1rem;font-weight:700">Gestion espaces verts</div>
        <div style="opacity:.8;font-size:13px">Planifiez les interventions par villa/lot et par date</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-calendar-days" style="color:#27ae60"></i> Interventions planifiées
        <div class="card-hdr-right"><button class="btn btn-primary btn-sm" onclick="openModal('modal-jardinage')"><i class="fa-solid fa-plus"></i> Ajouter</button></div>
      </div>
      ${jardins.length?`<div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Villa / Lot</th><th>Date planifiée</th><th>Type</th><th>Date saisie</th><th>Description</th><th>Prestataire</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${jardins.map(j=>`<tr>
          <td><strong>${j.localisation||'Commun'}</strong></td>
          <td>${fmtDate(j.created_at)}</td>
          <td><span style="background:#e8f8f0;color:#27ae60;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600"> Jardinage</span></td>
          <td style="font-weight:600;color:var(--text)">${extractJardDate(j.description)}</td>
          <td style="color:var(--text-2);font-size:12px">${extractJardDesc(j.description)}</td>
          <td>${j.prestataire||'—'}</td>
          <td>${statusPill(j.statut)}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn-icon btn-sm" onclick='openEditIntervention(${JSON.stringify(j).replace(/`/g,"'")})'><i class="fa-solid fa-edit"></i></button>
            ${j.statut!=='resolu'?`<button class="btn btn-primary btn-xs" onclick="resolveIncident(${j.id})"><i class="fa-solid fa-check"></i></button>`:''}
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>`:`<div class="empty-state"><i class="fa-solid fa-leaf" style="color:#27ae60"></i><p>Aucune intervention planifiée</p><button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="openModal('modal-jardinage')"><i class="fa-solid fa-plus"></i> Planifier la première</button></div>`}
    </div>`);
}

async function openJardinageModal(villaPreset){
  // Charger les résidents depuis l'API si pas encore fait
  if(!window._jardinage_villas || window._jardinage_villas.length === 0) {
    try {
      const residents = await GET('/residents');
      if(residents && residents.length > 0) {
        window._jardinage_villas = residents.map(r => ({
          lot: r.lot||'', prenom: r.prenom||'', nom: r.nom||'', id: r.id
        })).filter(r => r.lot);
      }
    } catch(e) { console.warn('Jardinage: cannot load residents', e); }
  }
  const villas = window._jardinage_villas || [];
  const sel = document.getElementById('jard-villa-select');
  if(sel){
    const opts = ['<option value="">-- Choisir --</option>'];
    villas.forEach(v => {
      const lbl = v.lot + (v.prenom ? ' — ' + v.prenom + ' ' + v.nom : '');
      opts.push('<option value="' + v.lot + '">' + lbl + '</option>');
    });
    opts.push('<optgroup label="Espaces partagés">');
    ['Parc central','Espaces communs','Entrée principale','Parking','Piscine'].forEach(z=>{
      opts.push('<option value="'+z+'">'+z+'</option>');
    });
    opts.push('</optgroup>');
    sel.innerHTML = opts.join('');
    if(villaPreset) sel.value = villaPreset;
  }
  document.getElementById('jard-date').value = new Date().toISOString().split('T')[0];
  const h = document.getElementById('jard-heure');
  if(h) h.value = '09:00';
  ['jard-desc','jard-prestataire'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const n = document.getElementById('jard-notifier'); if(n) n.checked = true;
  openModal('modal-jardinage');
}

async function submitJardinage(){
  const sel = document.getElementById('jard-villa-select');
  const villa = (sel?.value || document.getElementById('jard-villa')?.value || '').trim();
  const date = document.getElementById('jard-date').value;
  const heure = document.getElementById('jard-heure')?.value || '';
  const desc=document.getElementById('jard-desc').value.trim();
  const prest=document.getElementById('jard-prestataire').value.trim();
  if(!villa)return showError('Villa/Lot requis');
  if(!date)return showError('Date requise');
  // Formater la description avec la date pour affichage
  const dateLabel=new Date(date).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  const heureLabel=heure?' à '+heure:'';
  const body={
    type:'Jardinage',
    localisation:villa,
    description:` ${dateLabel} | ${desc||'Intervention jardinage'}`,
    prestataire:prest,
    urgence:'normal',
    statut:'ouvert',
  };
  try{
    await POST('/incidents',body);
    showToast(' Intervention jardinage planifiée pour le '+dateLabel);
    closeModal('modal-jardinage');
    ['jard-villa','jard-date','jard-desc','jard-prestataire'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    loaded.delete('g-jardinage');loaded.delete('r-jardinage');
    loadGJardinage();
  }catch(e){showError(e.error||'Erreur');}
}

// ── Admin Actions ─────────────────────────────────────────
function openUserModal(user, defaultRole='resident'){
  document.getElementById('modal-user-title').innerHTML=`<i class="fa-solid fa-user-${user?'edit':'plus'}" style="color:var(--primary)"></i> ${user?'Modifier':'Nouvel'} utilisateur`;
  document.getElementById('au-id').value=user?.id||'';
  document.getElementById('au-prenom').value=user?.prenom||'';
  document.getElementById('au-nom').value=user?.nom||'';
  document.getElementById('au-email').value=user?.email||'';
  document.getElementById('au-password').value='';
  document.getElementById('au-role').value=user?.role||defaultRole;
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
    showToast(' Utilisateur '+(id?'mis à jour':'créé'));
    closeModal('modal-admin-user');['a-users','a-roles'].forEach(p=>loaded.delete(p));loadAUsers();
  }catch(e){showError(e.error||'Erreur');}
}

async function deleteUser(id,nom){
  if(!confirm(`Supprimer ${nom} ?`))return;
  try{await DEL('/admin/users/'+id);showToast(' Supprimé');['a-users','a-roles'].forEach(p=>loaded.delete(p));loadAUsers();}
  catch(e){showError(e.error||'Impossible de supprimer un admin');}
}

async function changeRole(id){
  const v=document.getElementById('rs-'+id)?.value; if(!v)return;
  try{await PUT('/admin/users/'+id+'/role',{role:v});showToast(' Rôle mis à jour');['a-users','a-roles'].forEach(p=>loaded.delete(p));loadARoles();}
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
    showToast(' '+(id?'Mis à jour':'Créé'));closeModal('modal-type');loaded.delete('a-types-'+kind);loadATypes(kind);
  }catch(e){showError(e.error||'Erreur');}
}

async function deleteType(kind,id,nom){
  if(!confirm(`Supprimer "${nom}" ?`))return;
  try{await DEL('/admin/types-'+kind+'/'+id);showToast(' Supprimé');loaded.delete('a-types-'+kind);loadATypes(kind);}
  catch{showError('Erreur');}
}

// ── Notifications ─────────────────────────────────────────
async function sendNotification(endpoint,body={}){
  try{const r=await POST('/notifications/'+endpoint,body);
    if(r?.sent!==undefined)showToast(`📧 ${r.sent} email(s)${r.smsSent?' · '+r.smsSent+' WhatsApp':''} envoyé(s)`);
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
function openDeclarerPaiement(id,periode,montant){
  document.getElementById('decl-paiement-id').value=id||'';
  document.getElementById('decl-periode').textContent=periode||'';
  document.getElementById('decl-montant').textContent=parseFloat(montant||0).toLocaleString('fr-FR')+' MAD';
  document.getElementById('decl-lot').textContent='Lot '+( state.user.lot||'—');
  document.getElementById('decl-type').value='virement';
  document.getElementById('decl-date').value=new Date().toISOString().split('T')[0];
  document.getElementById('decl-ref').value='';
  openModal('modal-declarer-paiement');
}
async function submitDeclarerPaiement(){
  const pId=document.getElementById('decl-paiement-id').value;
  const mode=document.getElementById('decl-type').value;
  const date=document.getElementById('decl-date').value;
  const ref=document.getElementById('decl-ref').value.trim();
  if(!date)return showError('Date de règlement requise');
  const btn=document.getElementById('decl-submit');btn.disabled=true;
  try{
    if(pId)await POST('/charges/paiements/'+pId+'/payer',{mode,date_paiement:date,reference:ref});
    showToast(' Paiement déclaré — en attente de confirmation du syndic');
    closeModal('modal-declarer-paiement');
    ['r-finances','r-dashboard'].forEach(p=>loaded.delete(p));
    if(state.currentPage==='r-finances')loadRFinances();
    if(state.currentPage==='r-dashboard')loadRDashboard();
  }catch{showError('Erreur déclaration');}
  btn.disabled=false;
}

function updateIncPriority(){}
function openNewIncident(){
  // Reset le formulaire
  ['inc-type','inc-loc','inc-desc','inc-urgence'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&el.tagName==='INPUT')el.value='';
    if(el&&el.tagName==='TEXTAREA')el.value='';
  });
  const urgEl=document.getElementById('inc-urgence');
  if(urgEl)urgEl.value='normal';
  openModal('modal-incident');
}

async function submitIncident(){
  const body={
    type:document.getElementById('inc-type')?.value||'Autre',
    localisation:document.getElementById('inc-loc')?.value||'',
    description:(document.getElementById('inc-desc')?.value||'').trim(),
    urgence:document.getElementById('inc-urgence')?.value||'normal'
  };
  if(!body.type)return showError('Type de réclamation requis');
  if(!body.description)return showError('Description requise');
  try{await POST('/incidents',body);showToast(' Réclamation envoyée !');closeModal('modal-incident');
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
    showToast(' Appel de fonds émis');closeModal('modal-appel-fonds');
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
    showToast(' AG convoquée');closeModal('modal-ag-create');
    if(notifier&&ag?.id)sendNotification('convocation-ag/'+ag.id).catch(()=>{});
    ['g-ag','r-ag'].forEach(p=>loaded.delete(p));
    if(state.currentPage==='g-ag')loadGAG();
  }catch{showError('Erreur');}
}

// ── Upload document ───────────────────────────────────────
function updateZoneLabel(){
  const f=document.getElementById('udoc-fichier')?.files[0];
  const l=document.getElementById('upload-zone-label');
  if(l)l.textContent=f?` ${f.name} (${Math.round(f.size/1024)} Ko)`:'Cliquer ou glisser-déposer';
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
    showToast(' Document publié'+(notifier?' · Résidents notifiés':''));closeModal('modal-upload-doc');
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
function openModal(id){
  const el=document.getElementById(id);
  if(el) el.classList.add('show');
}

function closeModal(id){
  const el=document.getElementById(id);
  if(el) el.classList.remove('show');
}

document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('show');}));
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-overlay.show').forEach(m=>m.classList.remove('show'));});

// ── Boot ──────────────────────────────────────────────────
initApp();



/* ══ Mobile navigation ══ */
const BOTTOM_NAV = {
  resident:[
    {page:'r-dashboard',  icon:'fa-house',        label:'Accueil'},
    {page:'r-finances',   icon:'fa-wallet',       label:'Paiements'},
    {page:'r-incidents',  icon:'fa-wrench',       label:'Réclamations'},
    {page:'r-messagerie', icon:'fa-comment-dots', label:'Messages'},
    {page:'__more',       icon:'fa-grip',         label:'Plus'},
  ],
  gestionnaire:[
    {page:'g-dashboard',    icon:'fa-gauge-high', label:'Tableau'},
    {page:'g-comptabilite', icon:'fa-coins',      label:'Compta'},
    {page:'g-travaux',      icon:'fa-hard-hat',   label:'Travaux'},
    {page:'g-residents',    icon:'fa-people-roof',label:'Résidents'},
    {page:'__more',         icon:'fa-grip',       label:'Plus'},
  ],
  admin:[
    {page:'a-dashboard',    icon:'fa-gauge-high', label:'Dashboard'},
    {page:'a-users',        icon:'fa-users',      label:'Utilisateurs'},
    {page:'g-comptabilite', icon:'fa-coins',      label:'Compta'},
    {page:'g-residents',    icon:'fa-people-roof',label:'Résidents'},
    {page:'__more',         icon:'fa-grip',       label:'Plus'},
  ],
};
const MORE_MENUS = {
  resident:[
    {page:'r-documents', icon:'fa-folder',             label:'Documents'},
    {page:'r-ag',        icon:'fa-users-between-lines',label:'Assemblées'},
    {page:'r-jardinage', icon:'fa-leaf',               label:'Jardinage'},
    {page:'r-profil',    icon:'fa-user-circle',        label:'Mon profil'},
    {action:'logout',    icon:'fa-right-from-bracket', label:'Déconnexion',danger:true},
  ],
  gestionnaire:[
    {page:'g-messagerie',   icon:'fa-comments',            label:'Messagerie'},
    {page:'g-documents',    icon:'fa-folder-open',         label:'Documents'},
    {page:'g-jardinage',    icon:'fa-leaf',                label:'Jardinage'},
    {page:'g-notifications',icon:'fa-bell',                label:'Notifications'},
    {page:'g-agenda',       icon:'fa-calendar-check',      label:'Agenda auto'},
    {page:'g-bilan',        icon:'fa-chart-line',          label:'Bilan financier'},
    {page:'g-impayes',      icon:'fa-triangle-exclamation',label:'Impayés'},
    {page:'g-ag',           icon:'fa-users-between-lines', label:'Tenue des AG'},
    {page:'g-settings',     icon:'fa-gear',                label:'Paramètres'},
    {action:'logout',       icon:'fa-right-from-bracket',  label:'Déconnexion',danger:true},
  ],
  admin:[
    {page:'a-roles',        icon:'fa-shield-halved',       label:'Rôles & Accès'},
    {page:'a-residences',   icon:'fa-building',            label:'Résidences'},
    {page:'g-documents',    icon:'fa-folder-open',         label:'Documents'},
    {page:'g-notifications',icon:'fa-bell',                label:'Notifications'},
    {page:'g-settings',     icon:'fa-gear',                label:'Paramètres'},
    {action:'logout',       icon:'fa-right-from-bracket',  label:'Déconnexion',danger:true},
  ],
};

let _bnRole='';
function renderBottomNav(role,currentPage){
  const nav=document.getElementById('bottom-nav');
  if(!nav)return;
  _bnRole=role;
  nav.innerHTML=(BOTTOM_NAV[role]||[]).map(item=>{
    const isMore=item.page==='__more';
    const active=!isMore&&item.page===currentPage;
    const click=isMore?'openMoreMenu('+JSON.stringify(role)+')':'showPage('+JSON.stringify(item.page)+')';
    return '<button class="bn-item'+(active?' active':'')+'" onclick="'+click+'" aria-label="'+item.label+'">'
      +'<i class="fa-solid '+item.icon+'"></i><span>'+item.label+'</span></button>';
  }).join('');
}
function updateBnActive(page){
  document.querySelectorAll('#bottom-nav .bn-item').forEach(b=>{
    const m=b.getAttribute('onclick')||'';
    const p=m.match(/"([^"]+)"/);
    b.classList.toggle('active',p&&p[1]===page);
  });
}
function openMoreMenu(role){
  const items=MORE_MENUS[role]||[];
  const ov=document.createElement('div');
  ov.id='_mob_more';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:800;display:flex;flex-direction:column;justify-content:flex-end';
  const sh=document.createElement('div');
  sh.style.cssText='background:var(--surface);border-radius:20px 20px 0 0;padding:1rem 1rem calc(1rem + env(safe-area-inset-bottom,0px));max-height:85vh;overflow-y:auto';
  const grid = document.createElement('div');
  grid.innerHTML = '<div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto .75rem"></div>'
    + '<div style="font-size:.7rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:.75rem">Toutes les fonctionnalités</div>'
    + '<div id="_more_grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem"></div>';
  sh.appendChild(grid);
  const gridEl = grid.querySelector('#_more_grid');
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:.4rem;padding:.75rem .25rem;border-radius:12px;border:none;cursor:pointer;background:'+(item.danger?'#fee2e2':'#fff')+';min-height:76px;-webkit-tap-highlight-color:transparent';
    btn.innerHTML = '<div style="width:38px;height:38px;border-radius:10px;background:'+(item.danger?'#fecaca':'#e6f4ef')+';display:flex;align-items:center;justify-content:center"><i class="fa-solid '+item.icon+'" style="font-size:1rem;color:'+(item.danger?'#dc2626':'var(--primary)')+'"></i></div>'
      + '<span style="font-size:10px;font-weight:500;text-align:center;color:'+(item.danger?'#dc2626':'var(--text)')+'">'+item.label+'</span>';
    btn.addEventListener('click', () => handleMoreItem(item.page||'', item.action||''));
    gridEl.appendChild(btn);
  });
  ov.appendChild(sh);
  ov.addEventListener('click',e=>{if(e.target===ov)closeMoreMenu();});
  let sy=0;
  sh.addEventListener('touchstart',e=>{sy=e.touches[0].clientY;},{passive:true});
  sh.addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-sy>80)closeMoreMenu();},{passive:true});
  document.getElementById('_mob_more')?.remove();
  document.body.appendChild(ov);
  document.body.style.overflow='hidden';
}


function closeMoreMenu(){
  document.getElementById('_mob_more')?.remove();
  document.body.style.overflow='';
}
function handleMoreItem(page,action){
  closeMoreMenu();
  if(action==='logout'){doLogout();return;}
  if(page)showPage(page);
}

/* Hamburger sidebar */
(function(){
  const btn=document.getElementById('hamburger-btn');
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebar-overlay');
  if(!btn||!sb)return;
  let _open=false,_lastT=0;
  function open(){
    _open=true;
    sb.classList.add('open');
    if(ov){ov.style.display='block';ov.style.opacity='1';}
    document.body.style.overflow='hidden';
    btn.innerHTML='<i class="fa-solid fa-xmark"></i>';
  }
  function close(){
    _open=false;
    sb.classList.remove('open');
    if(ov){ov.style.display='';}
    document.body.style.overflow='';
    btn.innerHTML='<i class="fa-solid fa-bars"></i>';
  }
  function toggle(e){
    e.preventDefault();e.stopPropagation();
    const now=Date.now();if(now-_lastT<400)return;_lastT=now;
    _open?close():open();
  }
  btn.addEventListener('touchstart',toggle,{passive:false});
  btn.addEventListener('click',e=>{if(Date.now()-_lastT>400)toggle(e);});
  if(ov)ov.addEventListener('click',close);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  window.closeSidebar=close;window.openSidebar=open;
})();


// ══════════════════════════════════════════════════════════════════
// RÉSERVATION TERRAINS — Padel & Football
// ══════════════════════════════════════════════════════════════════

// ── Créneaux horaires disponibles ───────────────────────────────
const CRENEAUX = ['07:00','08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];

const TERRAIN_ICON = { padel: '🏸', foot: '⚽' };
const STATUT_RESA = {
  confirmee: { label:'Confirmée', cls:'pill-green' },
  annulee:   { label:'Annulée',   cls:'pill-red' },
  validee:   { label:'Validée ✓', cls:'pill-teal' },
  expiree:   { label:'Expirée',   cls:'pill-gray' },
};

// ── QR Code (librairie qrcode.js via CDN) ───────────────────────
function loadQRLib() {
  return new Promise(resolve => {
    if (window.QRCode) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

async function generateQR(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  
  try {
    await loadQRLib();
    new QRCode(el, {
      text: text,
      width: 220, height: 220,
      colorDark: '#0a3d2e', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } catch(e) {
    // Fallback : afficher le token texte si QR échoue
    console.warn('QR generation failed, using text fallback:', e);
    const tokenShort = typeof data === 'object' && data.token
      ? data.token.slice(0,16).toUpperCase().match(/.{4}/g).join(' ')
      : text.slice(0,32);
    el.innerHTML = `
      <div style="background:#0a3d2e;color:#fff;padding:1.5rem;border-radius:12px;
                  font-family:monospace;font-size:1.1rem;letter-spacing:.15em;
                  text-align:center;word-break:break-all;max-width:220px">
        <div style="font-size:2rem;margin-bottom:.5rem">🎫</div>
        <div style="font-size:.7rem;opacity:.7;margin-bottom:.375rem">CODE D'ACCÈS</div>
        <div style="font-size:1rem;font-weight:700">${tokenShort}</div>
        <div style="font-size:.65rem;opacity:.6;margin-top:.5rem">Montrez ce code à la sécurité</div>
      </div>`;
  }
}

// ══════════════════════════════════════════════════════════════════
// PAGE RÉSIDENT — Réservation terrains
// ══════════════════════════════════════════════════════════════════
async function loadRReservations() {
  // Terrains statiques en fallback si API pas encore déployée
  const TERRAINS_DEFAUT = [
    { id:1, nom:'Padel 1',    type:'padel', capacite:4, description:'Terrain couvert – éclairage LED' },
    { id:2, nom:'Padel 2',    type:'padel', capacite:4, description:'Terrain couvert – éclairage LED' },
    { id:3, nom:'Padel 3',    type:'padel', capacite:4, description:'Terrain extérieur' },
    { id:4, nom:'Football 1', type:'foot',  capacite:14,description:'Terrain synthétique 5v5' },
    { id:5, nom:'Football 2', type:'foot',  capacite:14,description:'Terrain synthétique 5v5' },
  ];
  let terrains = await GET('/reservations/terrains').catch?.(()=>null);
  if (!terrains || terrains.length === 0) terrains = TERRAINS_DEFAUT;
  let mesResas = await GET('/reservations/mes').catch?.(()=>null) || [];

  const today = new Date().toISOString().split('T')[0];
  const padels = terrains.filter(t => t.type === 'padel');
  const foots  = terrains.filter(t => t.type === 'foot');

  const futuresResas = (mesResas||[]).filter(r =>
    r.date >= today && r.statut !== 'annulee'
  ).slice(0, 5);

  setPageContent('r-reservations', `
    <div class="page-hdr">
      <div class="page-hdr-left">
        <h1>🏸 Réservation Terrains</h1>
        <p>Padel & Football — Jasmine Park</p>
      </div>
    </div>

    <!-- Sélecteur de terrain et date -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-hdr"><h3>📅 Réserver un créneau</h3></div>
      <div class="modal-body" style="padding:1rem 0 0">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type de terrain</label>
            <select class="form-control" id="resa-type" onchange="loadResaDispo()">
              <option value="">-- Choisir --</option>
              <optgroup label="🏸 Padel (${padels.length} terrains)">
                ${padels.map(t => `<option value="${t.id}">${t.nom} — ${t.description||''}</option>`).join('')}
              </optgroup>
              <optgroup label="⚽ Football (${foots.length} terrains)">
                ${foots.map(t => `<option value="${t.id}">${t.nom} — ${t.description||''}</option>`).join('')}
              </optgroup>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Date</label>
            <input class="form-control" type="date" id="resa-date"
              value="${today}" min="${today}"
              onchange="loadResaDispo()">
          </div>
        </div>
        <div id="resa-creneaux" style="margin-top:.75rem"></div>
      </div>
    </div>

    <!-- Mes prochaines réservations -->
    <div class="card">
      <div class="card-hdr">
        <h3>🎫 Mes réservations à venir</h3>
      </div>
      <div id="mes-resas-list">
        ${futuresResas.length === 0
          ? '<div class="empty-state"><div class="empty-icon">📭</div><p>Aucune réservation à venir</p></div>'
          : futuresResas.map(r => renderResaCard(r)).join('')}
      </div>
    </div>
  `);
}

function renderResaCard(r) {
  const icon = TERRAIN_ICON[r.terrain_type] || '🏟️';
  const st   = STATUT_RESA[r.statut] || { label: r.statut, cls: 'pill-gray' };
  const dateStr = new Date(r.date).toLocaleDateString('fr-FR',
    { weekday:'short', day:'2-digit', month:'short' });
  return `
    <div style="display:flex;align-items:center;gap:.875rem;padding:.875rem 1rem;border-bottom:1px solid var(--border)">
      <div style="width:46px;height:46px;border-radius:12px;background:var(--primary-pale);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.9rem">${r.terrain_nom}</div>
        <div style="font-size:.8rem;color:var(--text-2)">${dateStr} · ${String(r.heure_debut).slice(0,5)} – ${String(r.heure_fin).slice(0,5)}</div>
        <div style="font-size:.78rem;color:var(--text-3);margin-top:1px">${r.nb_joueurs} joueur(s)</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.375rem">
        <span class="pill ${st.cls}">${st.label}</span>
        ${r.statut === 'confirmee'
          ? `<button class="btn btn-xs btn-ghost" onclick="showQRCode('${r.token_qr}',${JSON.stringify(r).replace(/'/g,"\\'")})" style="font-size:11px">📲 QR Code</button>`
          : ''}
        ${r.statut === 'confirmee'
          ? `<button class="btn btn-xs" style="color:var(--danger);font-size:11px" onclick="annulerResa(${r.id})">✕ Annuler</button>`
          : ''}
      </div>
    </div>`;
}

async function loadResaDispo() {
  const terrain_id = document.getElementById('resa-type')?.value;
  const date       = document.getElementById('resa-date')?.value;
  const container  = document.getElementById('resa-creneaux');
  if (!terrain_id || !date || !container) return;

  container.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-3)">Chargement...</div>';

  const dispos = await GET(`/reservations/disponibilites?terrain_id=${terrain_id}&date=${date}`);
  if (!dispos) return;

  // Construire les créneaux d'1h
  const reserved = dispos.map(d => d.heure_debut.slice(0,5));
  const now = new Date();
  const isToday = date === now.toISOString().split('T')[0];
  const currentHour = now.getHours();

  const slots = CRENEAUX.slice(0, -1).map(h => {
    const hNum = parseInt(h);
    const isPast = isToday && hNum <= currentHour;
    const isTaken = reserved.includes(h);
    return { h, hFin: CRENEAUX[CRENEAUX.indexOf(h)+1], isPast, isTaken };
  });

  container.innerHTML = `
    <div style="font-size:.8rem;font-weight:600;color:var(--text-3);text-transform:uppercase;margin-bottom:.5rem">
      Créneaux disponibles
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.375rem">
      ${slots.map(s => `
        <button onclick="${s.isTaken||s.isPast ? '' : `confirmerResa('${terrain_id}','${date}','${s.h}','${s.hFin}')`}"
          style="padding:.5rem .25rem;border-radius:8px;border:1.5px solid ${
            s.isTaken ? '#fee2e2' : s.isPast ? '#f0f0f0' : 'var(--primary)'};
          background:${s.isTaken ? '#fee2e2' : s.isPast ? '#f9f9f9' : 'var(--primary-pale)'};
          color:${s.isTaken ? '#dc2626' : s.isPast ? '#ccc' : 'var(--primary)'};
          font-size:.8rem;font-weight:600;cursor:${s.isTaken||s.isPast?'not-allowed':'pointer'};
          -webkit-tap-highlight-color:transparent">
          ${s.h.slice(0,5)}${s.isTaken ? '<br><span style="font-size:.65rem">Réservé</span>' : s.isPast ? '<br><span style="font-size:.65rem">Passé</span>' : '<br><span style="font-size:.65rem">Libre</span>'}
        </button>`).join('')}
    </div>
    <div style="display:flex;gap:1rem;margin-top:.625rem;font-size:.75rem">
      <span style="color:var(--primary)">● Disponible</span>
      <span style="color:#dc2626">● Réservé</span>
      <span style="color:#ccc">● Passé</span>
    </div>`;
}

function confirmerResa(terrain_id, date, hDebut, hFin) {
  const dateLabel = new Date(date).toLocaleDateString('fr-FR',
    { weekday:'long', day:'2-digit', month:'long' });
  document.getElementById('confirm-resa-info').innerHTML =
    `<strong>${hDebut} – ${hFin}</strong> le ${dateLabel}`;
  document.getElementById('confirm-resa-terrain').value  = terrain_id;
  document.getElementById('confirm-resa-date').value     = date;
  document.getElementById('confirm-resa-debut').value    = hDebut;
  document.getElementById('confirm-resa-fin').value      = hFin;
  document.getElementById('confirm-resa-joueurs').value  = '2';
  document.getElementById('confirm-resa-notes').value    = '';
  openModal('modal-confirmer-resa');
}

async function submitResa() {
  const body = {
    terrain_id: document.getElementById('confirm-resa-terrain').value,
    date:        document.getElementById('confirm-resa-date').value,
    heure_debut: document.getElementById('confirm-resa-debut').value,
    heure_fin:   document.getElementById('confirm-resa-fin').value,
    nb_joueurs:  document.getElementById('confirm-resa-joueurs').value,
    notes:       document.getElementById('confirm-resa-notes').value,
  };
  let result = await POST('/reservations', body).catch?.(()=>null);
  if (!result) {
    // Fallback: générer réservation locale avec QR
    const token = [...Array(32)].map(()=>Math.random().toString(36)[2]).join('');
    const terrains = document.getElementById('resa-type');
    const tOpt = terrains?.options[terrains.selectedIndex];
    result = {
      id: Date.now(), token_qr: token,
      terrain_id: body.terrain_id,
      terrain_nom: tOpt?.text?.split(' —')[0] || 'Terrain',
      terrain_type: tOpt?.text?.includes('adel') ? 'padel' : 'foot',
      date: body.date, heure_debut: body.heure_debut, heure_fin: body.heure_fin,
      nb_joueurs: body.nb_joueurs, notes: body.notes,
      prenom: state.user?.prenom||'', nom_resident: state.user?.nom||'',
      lot: state.user?.lot||'',
      qr_data: JSON.stringify({ token, terrain: tOpt?.text?.split(' —')[0]||'Terrain',
        date: new Date(body.date).toLocaleDateString('fr-FR'),
        heure: body.heure_debut+' – '+body.heure_fin,
        resident: (state.user?.prenom||'')+' '+(state.user?.nom||''),
        lot: state.user?.lot||'' })
    };
    showToast('⚠️ Réservation enregistrée localement (backend non connecté)');
  } else {
    showToast('✅ Réservation confirmée !');
  }
  closeModal('modal-confirmer-resa');
  await showQRCode(result.token_qr, result);
  loadRReservations();
}

async function showQRCode(token, resa) {
  // Remplir le modal QR
  const r = typeof resa === 'string' ? JSON.parse(resa) : resa;
  const dateLabel = r.dateLabel || new Date(r.date).toLocaleDateString('fr-FR',
    { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('qr-info').innerHTML = `
    <div style="text-align:center;margin-bottom:1rem">
      <div style="font-size:1.4rem">${TERRAIN_ICON[r.terrain_type]||'🏟️'}</div>
      <div style="font-weight:700;font-size:1rem;margin:.25rem 0">${r.terrain_nom}</div>
      <div style="font-size:.85rem;color:var(--text-2)">${dateLabel}</div>
      <div style="font-size:.85rem;color:var(--text-2)">${String(r.heure_debut||'').slice(0,5)} – ${String(r.heure_fin||'').slice(0,5)}</div>
      <div style="font-size:.8rem;color:var(--text-3);margin-top:.25rem">${r.prenom} ${r.nom_resident} · Lot ${r.lot}</div>
    </div>`;
  openModal('modal-qr-code');
  await generateQR('qr-canvas', r.qr_data || JSON.stringify({ token, ...r }));
  // Bouton partager natif (si disponible)
  const shareBtn = document.getElementById('qr-share-btn');
  if (shareBtn) {
    shareBtn.style.display = navigator.share ? 'flex' : 'none';
    shareBtn.onclick = () => shareQR(token, r);
  }
}

async function shareQR(token, r) {
  const text = `🏟️ Réservation Jasmine Park\n${TERRAIN_ICON[r.terrain_type]||''} ${r.terrain_nom}\n📅 ${new Date(r.date).toLocaleDateString('fr-FR')}\n⏰ ${String(r.heure_debut).slice(0,5)} – ${String(r.heure_fin).slice(0,5)}\n👤 ${r.prenom} ${r.nom_resident} (Lot ${r.lot})\n\n🔑 Code d'accès: ${token.slice(0,8).toUpperCase()}`;
  try {
    await navigator.share({ title: 'Réservation Jasmine Park', text });
  } catch(e) {
    // Copier dans le presse-papiers
    await navigator.clipboard?.writeText(text);
    showToast('Infos copiées dans le presse-papiers');
  }
}

async function annulerResa(id) {
  if (!confirm('Annuler cette réservation ?')) return;
  const r = await fetch(`/api/reservations/${id}/annuler`, {
    method:'PUT', headers:{'Authorization':'Bearer '+state.token}
  });
  if (r.ok) { showToast('Réservation annulée'); loadRReservations(); }
  else showError('Impossible d\'annuler');
}

// ══════════════════════════════════════════════════════════════════
// PAGE GESTIONNAIRE — Toutes les réservations
// ══════════════════════════════════════════════════════════════════
async function loadGReservations() {
  const today = new Date().toISOString().split('T')[0];
  const TERRAINS_DEFAUT = [
    { id:1, nom:'Padel 1',    type:'padel', capacite:4 },
    { id:2, nom:'Padel 2',    type:'padel', capacite:4 },
    { id:3, nom:'Padel 3',    type:'padel', capacite:4 },
    { id:4, nom:'Football 1', type:'foot',  capacite:14 },
    { id:5, nom:'Football 2', type:'foot',  capacite:14 },
  ];
  let resas = await GET(`/reservations?date=${today}`).catch?.(()=>null) || [];
  let terrains = await GET('/reservations/terrains').catch?.(()=>null) || TERRAINS_DEFAUT;

  const byTerrain = {};
  (terrains||[]).forEach(t => { byTerrain[t.id] = []; });
  (resas||[]).forEach(r => {
    if (byTerrain[r.terrain_id]) byTerrain[r.terrain_id].push(r);
  });

  setPageContent('g-reservations', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>🏟️ Réservations Terrains</h1><p>${(resas||[]).length} réservation(s) aujourd'hui</p></div>
      <div class="hdr-actions">
        <input type="date" class="form-control" id="gresa-date" value="${today}"
          style="width:160px" onchange="reloadGResas()">
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
      ${(terrains||[]).map(t => {
        const tResas = byTerrain[t.id] || [];
        return `
        <div class="card">
          <div class="card-hdr" style="background:${t.type==='padel'?'var(--primary-pale)':'#fef3c7'}">
            <h3 style="font-size:.95rem">${TERRAIN_ICON[t.type]} ${t.nom}</h3>
            <span class="pill ${tResas.length>0?'pill-green':'pill-gray'}" style="font-size:.75rem">
              ${tResas.length}/${(t.type==='padel'?12:12)} créneaux
            </span>
          </div>
          <div style="padding:.5rem 0">
            ${tResas.length === 0
              ? '<div style="text-align:center;padding:1rem;color:var(--text-3);font-size:.85rem">Aucune réservation</div>'
              : tResas.map(r => `
                <div style="display:flex;align-items:center;gap:.625rem;padding:.5rem 1rem;border-bottom:1px solid var(--border)">
                  <div style="flex:1">
                    <div style="font-weight:600;font-size:.85rem">${String(r.heure_debut).slice(0,5)} – ${String(r.heure_fin).slice(0,5)}</div>
                    <div style="font-size:.78rem;color:var(--text-2)">${r.prenom} ${r.nom_resident} · Lot ${r.lot}</div>
                  </div>
                  <span class="pill ${STATUT_RESA[r.statut]?.cls||'pill-gray'}" style="font-size:.7rem">${STATUT_RESA[r.statut]?.label||r.statut}</span>
                  ${r.statut==='confirmee'
                    ? `<button class="btn-icon" onclick="annulerResaG(${r.id})" title="Annuler"><i class="fa-solid fa-xmark" style="color:var(--danger)"></i></button>`
                    : ''}
                </div>`).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>
  `);
}

async function reloadGResas() {
  const date = document.getElementById('gresa-date')?.value;
  const resas = await GET(`/reservations${date?'?date='+date:''}`);
  if (resas) loadGReservations();
}

async function annulerResaG(id) {
  if (!confirm('Annuler cette réservation ?')) return;
  const r = await fetch(`/api/reservations/${id}/annuler`,
    { method:'PUT', headers:{'Authorization':'Bearer '+state.token} });
  if (r.ok) { showToast('Réservation annulée'); loadGReservations(); }
}

// ══════════════════════════════════════════════════════════════════
// PAGE SÉCURITÉ — Validation QR codes à l'entrée
// ══════════════════════════════════════════════════════════════════
async function loadGSecurite() {
  const todayResas = await GET('/reservations/today') || [];
  setPageContent('g-securite', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>🛡️ Sécurité — Entrée Terrains</h1>
        <p>${todayResas.length} réservation(s) aujourd'hui</p></div>
    </div>

    <!-- Scanner QR -->
    <div class="card" style="margin-bottom:1rem">
      <div class="card-hdr"><h3>📷 Valider un QR Code</h3></div>
      <div style="padding:1rem">
        <div style="display:flex;gap:.625rem">
          <input class="form-control" id="qr-token-input" placeholder="Collez ou saisissez le token QR…" style="flex:1">
          <button class="btn btn-primary" onclick="validerQRManuel()">
            <i class="fa-solid fa-check"></i> Valider
          </button>
        </div>
        <div id="qr-result" style="margin-top:.75rem"></div>
      </div>
    </div>

    <!-- Liste du jour -->
    <div class="card">
      <div class="card-hdr"><h3>📋 Réservations du jour</h3></div>
      <div>
        ${todayResas.length === 0
          ? '<div class="empty-state"><div class="empty-icon">🎾</div><p>Aucune réservation aujourd\'hui</p></div>'
          : todayResas.map(r => `
            <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-bottom:1px solid var(--border)">
              <div style="font-size:1.5rem">${TERRAIN_ICON[r.terrain_type]||'🏟️'}</div>
              <div style="flex:1">
                <div style="font-weight:600;font-size:.9rem">${r.terrain_nom}</div>
                <div style="font-size:.8rem;color:var(--text-2)">${String(r.heure_debut).slice(0,5)} – ${String(r.heure_fin).slice(0,5)} · ${r.prenom} ${r.nom_resident} (Lot ${r.lot})</div>
              </div>
              <span class="pill ${STATUT_RESA[r.statut]?.cls||'pill-gray'}">${STATUT_RESA[r.statut]?.label||r.statut}</span>
              ${r.statut==='confirmee'
                ? `<button class="btn btn-sm btn-primary" onclick="validerResaDirecte(${r.id},'${r.token_qr}')">✓ Valider</button>`
                : ''}
            </div>`).join('')}
      </div>
    </div>
  `);
}

async function validerQRManuel() {
  const token = document.getElementById('qr-token-input')?.value?.trim();
  if (!token) return showError('Entrez un token QR');
  await validerToken(token);
}

async function validerResaDirecte(id, token) {
  await validerToken(token);
}

async function validerToken(token) {
  const res = await fetch('/api/reservations/valider', {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.token},
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  const el = document.getElementById('qr-result');
  if (!el) return;
  if (res.ok && data.success) {
    const r = data.reservation;
    el.innerHTML = `
      <div style="background:#d1fae5;border:2px solid #10b981;border-radius:12px;padding:1rem;text-align:center">
        <div style="font-size:2rem">✅</div>
        <div style="font-weight:700;color:#065f46;font-size:1.1rem">ACCÈS AUTORISÉ</div>
        <div style="margin-top:.5rem;font-size:.9rem;color:#065f46">
          ${TERRAIN_ICON[r.terrain_type]||''} ${r.terrain_nom}<br>
          <strong>${r.prenom} ${r.nom_resident}</strong> · Lot ${r.lot}<br>
          ${String(r.heure_debut).slice(0,5)} – ${String(r.heure_fin).slice(0,5)}
        </div>
      </div>`;
    showToast('✅ Accès autorisé !');
    setTimeout(() => loadGSecurite(), 3000);
  } else {
    el.innerHTML = `
      <div style="background:#fee2e2;border:2px solid #dc2626;border-radius:12px;padding:1rem;text-align:center">
        <div style="font-size:2rem">❌</div>
        <div style="font-weight:700;color:#991b1b;font-size:1rem">ACCÈS REFUSÉ</div>
        <div style="font-size:.85rem;color:#991b1b;margin-top:.25rem">${data.error||'QR invalide'}</div>
      </div>`;
  }
}

const MOTIF_ICON = {
  visite:      { icon:'👤', label:'Visite personnelle',    color:'#7c3aed' },
  livraison:   { icon:'📦', label:'Livraison / Colis',     color:'#0d5c47' },
  maintenance: { icon:'🔧', label:'Prestataire',           color:'#e07b1a' },
  famille:     { icon:'👨‍👩‍👧', label:'Famille',              color:'#0891b2' },
  autre:       { icon:'🔹', label:'Autre',                 color:'#6b7280' },
};

const QR_STATUT = {
  actif:   { label:'Actif',   cls:'pill-green' },
  utilise: { label:'Utilisé', cls:'pill-teal'  },
  expire:  { label:'Expiré',  cls:'pill-gray'  },
  annule:  { label:'Annulé',  cls:'pill-red'   },
};

let _currentQRData = null;

// ── PAGE RÉSIDENT : Mes QR Codes ────────────────────────────────
async function loadRQrcode() {
  const mesQR = await GET('/qrcodes/mes').catch(()=>null) || [];
  const now = new Date();

  setPageContent('r-qrcode', `
    <div class="page-hdr">
      <div class="page-hdr-left">
        <h1>🔐 QR Code Visiteurs</h1>
        <p>Générez des codes d'accès pour vos visiteurs</p>
      </div>
      <div class="hdr-actions">
        <button class="btn btn-primary" onclick="openGenQR()" style="background:#7c3aed;border-color:#7c3aed">
          <i class="fa-solid fa-plus"></i> Nouveau QR Code
        </button>
      </div>
    </div>

    <!-- Explication rapide -->
    <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border-radius:14px;padding:1.25rem;margin-bottom:1rem;display:flex;gap:1rem;align-items:flex-start">
      <div style="font-size:2rem">🔐</div>
      <div>
        <div style="font-weight:700;margin-bottom:.25rem">Comment ça marche ?</div>
        <div style="font-size:.82rem;opacity:.9;line-height:1.5">
          1. Générez un QR Code pour votre visiteur<br>
          2. Partagez-le via WhatsApp ou SMS<br>
          3. La sécurité le scanne à l'entrée ✅
        </div>
      </div>
    </div>

    <!-- Mes QR codes -->
    <div class="card">
      <div class="card-hdr">
        <h3>🎫 Mes QR Codes générés</h3>
        <span class="pill ${mesQR.filter(q=>q.statut==='actif').length>0?'pill-green':'pill-gray'}"
          style="font-size:.75rem">${mesQR.filter(q=>q.statut==='actif').length} actif(s)</span>
      </div>
      <div id="qr-list-container">
        ${mesQR.length === 0
          ? `<div class="empty-state">
               <div class="empty-icon">🔐</div>
               <p>Aucun QR Code généré</p>
               <button class="btn btn-primary btn-sm" onclick="openGenQR()" style="background:#7c3aed;border-color:#7c3aed;margin-top:.5rem">
                 <i class="fa-solid fa-plus"></i> Créer mon premier QR Code
               </button>
             </div>`
          : mesQR.map(qr => {
              const m = MOTIF_ICON[qr.motif] || MOTIF_ICON.autre;
              const st = QR_STATUT[new Date(qr.valide_au) < now ? 'expire' : qr.statut] || QR_STATUT.actif;
              const duLabel = new Date(qr.valide_du).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
              const auLabel = new Date(qr.valide_au).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
              return `
              <div style="display:flex;align-items:center;gap:.875rem;padding:.875rem 1rem;border-bottom:1px solid var(--border)">
                <div style="width:44px;height:44px;border-radius:12px;background:#f3e8ff;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">${m.icon}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:.9rem">${qr.visiteur_nom || 'Visiteur'}</div>
                  <div style="font-size:.78rem;color:var(--text-2)">${m.label}</div>
                  <div style="font-size:.72rem;color:var(--text-3);margin-top:1px">${duLabel} → ${auLabel}</div>
                  <div style="font-size:.72rem;color:var(--text-3)">${qr.nb_usages}/${qr.max_usages===99?'∞':qr.max_usages} usage(s)</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.375rem;flex-shrink:0">
                  <span class="pill ${st.cls}" style="font-size:.7rem">${st.label}</span>
                  ${st.label === 'Actif'
                    ? `<button class="btn btn-xs" onclick="reafficherQR(${qr.id},'${qr.token}')"
                         style="font-size:11px;color:#7c3aed;border-color:#7c3aed">
                         <i class="fa-solid fa-qrcode"></i> Voir QR
                       </button>
                       <button class="btn btn-xs" onclick="partagerTokenQR('${qr.token}','${(qr.visiteur_nom||'Visiteur').replace(/'/g,"")}')"
                         style="font-size:11px">
                         <i class="fa-solid fa-share-nodes"></i>
                       </button>`
                    : ''}
                  ${qr.statut === 'actif'
                    ? `<button class="btn btn-xs" onclick="annulerQR(${qr.id})"
                         style="font-size:11px;color:var(--danger)">✕</button>`
                    : ''}
                </div>
              </div>`;
            }).join('')}
      </div>
    </div>
  `);
}

function openGenQR() {
  const now = new Date();
  const todayStr = now.toISOString().slice(0,16);
  const tomorrowStr = new Date(now.getTime() + 24*60*60*1000).toISOString().slice(0,16);
  document.getElementById('qrv-nom').value = '';
  document.getElementById('qrv-motif').value = 'visite';
  document.getElementById('qrv-debut').value = todayStr;
  document.getElementById('qrv-fin').value = tomorrowStr;
  document.getElementById('qrv-usages').value = '1';
  openModal('modal-gen-qr');
}

async function genererQRVisiteur() {
  const nom     = document.getElementById('qrv-nom').value.trim() || 'Visiteur';
  const motif   = document.getElementById('qrv-motif').value;
  const debut   = document.getElementById('qrv-debut').value;
  const fin     = document.getElementById('qrv-fin').value;
  const usages  = document.getElementById('qrv-usages').value;

  if (!debut || !fin) return showError('Dates de validité requises');
  if (new Date(fin) <= new Date(debut)) return showError('La date de fin doit être après la date de début');

  let result = await POST('/qrcodes', {
    visiteur_nom: nom, motif,
    valide_du: new Date(debut).toISOString(),
    valide_au: new Date(fin).toISOString(),
    max_usages: parseInt(usages)
  }).catch(() => null);

  // Fallback local si backend pas encore déployé
  if (!result) {
    const token = [...Array(24)].map(()=>Math.random().toString(36)[2]).join('');
    const u = state.user || {};
    result = {
      id: Date.now(), token,
      visiteur_nom: nom, motif,
      valide_du: debut, valide_au: fin,
      max_usages: parseInt(usages), nb_usages: 0,
      statut: 'actif',
      prenom: u.prenom||'', nom: u.nom||'', lot: u.lot||'',
      qr_data: JSON.stringify({
        token, type:'visiteur', residence:'Jasmine Park',
        resident: `${u.prenom||''} ${u.nom||''}`, lot: u.lot||'',
        visiteur: nom, motif: MOTIF_ICON[motif]?.label || motif,
        valide_du: new Date(debut).toLocaleString('fr-FR'),
        valide_au: new Date(fin).toLocaleString('fr-FR')
      })
    };
  }

  closeModal('modal-gen-qr');
  _currentQRData = result;
  afficherQRVisiteur(result);
  loadRQrcode();
}

function afficherQRVisiteur(result) {
  const m = MOTIF_ICON[result.motif] || MOTIF_ICON.autre;
  const debutLabel = new Date(result.valide_du).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const finLabel   = new Date(result.valide_au).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

  document.getElementById('qrv-info-display').innerHTML = `
    <div style="background:#f3e8ff;border-radius:12px;padding:1rem;margin-bottom:.5rem">
      <div style="font-size:1.5rem;margin-bottom:.25rem">${m.icon}</div>
      <div style="font-weight:700;font-size:1rem;color:#6d28d9">${result.visiteur_nom || 'Visiteur'}</div>
      <div style="font-size:.82rem;color:#7c3aed;margin-top:.25rem">${m.label}</div>
      <div style="font-size:.78rem;color:var(--text-2);margin-top:.375rem">
        📅 Du ${debutLabel}<br>au ${finLabel}
      </div>
      <div style="font-size:.78rem;color:var(--text-3);margin-top:.25rem">
        Résident : ${result.prenom} ${result.nom || result.nom_resident || ''} · Lot ${result.lot}
      </div>
    </div>`;

  openModal('modal-qr-visiteur');
  generateQR('qrv-canvas', result.qr_data || result.token);
}

async function reafficherQR(id, token) {
  const mesQR = await GET('/qrcodes/mes').catch(()=>null) || [];
  const qr = mesQR.find(q => q.id === id) || { id, token, visiteur_nom:'Visiteur', motif:'visite',
    valide_du: new Date().toISOString(), valide_au: new Date().toISOString(),
    prenom: state.user?.prenom||'', nom: state.user?.nom||'', lot: state.user?.lot||'',
    qr_data: JSON.stringify({ token, type:'visiteur', residence:'Jasmine Park' })
  };
  afficherQRVisiteur(qr);
}

async function partagerQRVisiteur() {
  if (!_currentQRData) return;
  await partagerTokenQR(_currentQRData.token, _currentQRData.visiteur_nom || 'Visiteur');
}

async function partagerTokenQR(token, nom) {
  const u = state.user || {};
  const text = `🔐 Code d'accès — Résidence Jasmine Park\n\n👤 Visiteur : ${nom}\n🏠 Résident : ${u.prenom||''} ${u.nom||''} (Lot ${u.lot||''})\n\n🔑 Code : ${token.slice(0,8).toUpperCase()}-${token.slice(8,16).toUpperCase()}\n\n📱 À présenter à la sécurité à l'entrée`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Code accès Jasmine Park', text });
    } else {
      await navigator.clipboard?.writeText(text);
      showToast('✅ Code copié dans le presse-papiers');
    }
  } catch(e) {
    showToast('Code : ' + token.slice(0,12).toUpperCase());
  }
}

async function annulerQR(id) {
  if (!confirm('Annuler ce QR Code ?')) return;
  const r = await fetch(`/api/qrcodes/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + state.token }
  });
  if (r.ok) { showToast('QR Code annulé'); loadRQrcode(); }
  else showError('Impossible d\'annuler');
}

// ══════════════════════════════════════════════════════════════════
// PAGE SÉCURITÉ — Validation QR Visiteurs
// ══════════════════════════════════════════════════════════════════
async function loadSValidation() {
  const todayQR = await GET('/qrcodes').catch(()=>null);
  setPageContent('s-validation', `
    <div class="page-hdr">
      <div class="page-hdr-left">
        <h1>🛡️ Contrôle Accès Visiteurs</h1>
        <p>Résidence Jasmine Park</p>
      </div>
    </div>

    <!-- Scanner -->
    <div class="card" style="margin-bottom:1rem;border:2px solid #7c3aed">
      <div class="card-hdr" style="background:#f3e8ff">
        <h3 style="color:#6d28d9">📷 Scanner / Saisir un QR Code</h3>
      </div>
      <div style="padding:1rem">
        <div style="display:flex;gap:.625rem">
          <input class="form-control" id="sec-token-input"
            placeholder="Code QR ou token du visiteur…"
            style="flex:1;font-family:monospace"
            onkeydown="if(event.key==='Enter')validerQRSecurite()">
          <button class="btn btn-primary" onclick="validerQRSecurite()"
            style="background:#7c3aed;border-color:#7c3aed;min-width:90px">
            <i class="fa-solid fa-check"></i> Valider
          </button>
        </div>
        <div id="sec-qr-result" style="margin-top:.875rem"></div>
      </div>
    </div>

    <!-- Accès rapide : QR du jour -->
    ${todayQR ? `
    <div class="card">
      <div class="card-hdr"><h3>📋 Visiteurs attendus aujourd'hui</h3></div>
      <div>
        ${todayQR.filter(q => {
          const n = new Date();
          return new Date(q.valide_au) >= n && new Date(q.valide_du) <= new Date(n.getTime()+24*60*60*1000) && q.statut==='actif';
        }).length === 0
          ? '<div class="empty-state" style="padding:1rem"><p>Aucun visiteur attendu aujourd\'hui</p></div>'
          : todayQR.filter(q => {
              const n = new Date();
              return new Date(q.valide_au) >= n && new Date(q.valide_du) <= new Date(n.getTime()+24*60*60*1000);
            }).map(q => {
              const m = MOTIF_ICON[q.motif] || MOTIF_ICON.autre;
              const st = QR_STATUT[q.statut] || QR_STATUT.actif;
              return `
              <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-bottom:1px solid var(--border)">
                <div style="font-size:1.4rem">${m.icon}</div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:.9rem">${q.visiteur_nom||'Visiteur'}</div>
                  <div style="font-size:.78rem;color:var(--text-2)">${q.prenom} ${q.nom} · Lot ${q.lot}</div>
                  <div style="font-size:.72rem;color:var(--text-3)">${m.label} · ${q.nb_usages}/${q.max_usages===99?'∞':q.max_usages} entrée(s)</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.375rem">
                  <span class="pill ${st.cls}" style="font-size:.7rem">${st.label}</span>
                  ${q.statut==='actif'
                    ? `<button class="btn btn-sm btn-primary" onclick="validerTokenDirectSec('${q.token}')"
                         style="font-size:11px;background:#7c3aed;border-color:#7c3aed">✓ Valider</button>`
                    : ''}
                </div>
              </div>`;
            }).join('')}
      </div>
    </div>` : ''}
  `);
}

async function validerQRSecurite() {
  const raw = (document.getElementById('sec-token-input')?.value || '').trim();
  if (!raw) return showError('Entrez un code QR');

  let token = raw;
  // Extraire token si JSON
  try {
    const parsed = JSON.parse(raw);
    if (parsed.token) token = parsed.token;
  } catch(e) {
    // C'est déjà un token simple
    token = raw.replace(/-/g,'').toLowerCase();
  }

  await validerTokenSecurite(token);
}

async function validerTokenDirectSec(token) {
  await validerTokenSecurite(token);
}

async function validerTokenSecurite(token) {
  const el = document.getElementById('sec-qr-result');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:.75rem;color:var(--text-3)">⏳ Vérification…</div>';

  const res = await fetch('/api/qrcodes/valider', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+state.token },
    body: JSON.stringify({ token })
  }).catch(() => null);

  if (!res) {
    el.innerHTML = resultBox(false, 'Erreur de connexion', null);
    return;
  }

  const data = await res.json();

  if (data.valid) {
    const q = data.qr;
    const m = MOTIF_ICON[q?.motif] || MOTIF_ICON.autre;
    el.innerHTML = resultBox(true, 'ACCÈS AUTORISÉ', `
      <div style="margin-top:.625rem;font-size:.9rem">
        ${m.icon} <strong>${q?.visiteur_nom || 'Visiteur'}</strong><br>
        🏠 ${q?.prenom} ${q?.nom} · Lot ${q?.lot}<br>
        📋 ${m.label}
      </div>`);
    // Son de confirmation (si disponible)
    try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA==').play().catch(()=>{}); } catch(e){}
    setTimeout(() => {
      el.innerHTML = '';
      document.getElementById('sec-token-input').value = '';
      loadSValidation();
    }, 4000);
  } else {
    el.innerHTML = resultBox(false, data.error || 'ACCÈS REFUSÉ', data.qr ? `
      <div style="margin-top:.5rem;font-size:.85rem">
        Visiteur : ${data.qr.visiteur_nom || '—'}<br>
        Résident : ${data.qr.prenom} ${data.qr.nom}
      </div>` : null);
  }
}

function resultBox(ok, title, detail='') {
  return `<div style="background:${ok?'#d1fae5':'#fee2e2'};border:2.5px solid ${ok?'#10b981':'#dc2626'};
    border-radius:14px;padding:1.25rem;text-align:center">
    <div style="font-size:2.5rem">${ok?'✅':'❌'}</div>
    <div style="font-weight:800;color:${ok?'#065f46':'#991b1b'};font-size:1.1rem;margin-top:.375rem">${title}</div>
    ${detail || ''}
  </div>`;
}
