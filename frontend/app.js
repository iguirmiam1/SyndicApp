// ── CONFIG ──────────────────────────────────────────────────────────────────
const API = window.location.hostname === 'localhost' || window.location.port === '3000'
  ? '/api'
  : (window.location.origin.includes('3000') ? '/api' : 'http://localhost:4000/api');

// ── STATE ────────────────────────────────────────────────────────────────────
let state = {
  token: localStorage.getItem('sp_token'),
  user: null,
  currentRole: 'resident',
  currentPage: '',
  dashboardData: null,
  charges: [],
  incidents: [],
  documents: [],
  messages: { syndic: [], forum: [] },
  agList: [],
  residents: [],
  settings: {},
};

// ── API HELPERS ──────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API + path, { headers, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401) { doLogout(); return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}
const GET = path => api(path);
const POST = (path, body) => api(path, { method: 'POST', body });
const PUT = (path, body) => api(path, { method: 'PUT', body });
const DEL = path => api(path, { method: 'DELETE' });

// ── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const tm = document.getElementById('toast-msg');
  t.className = 'toast show' + (type === 'error' ? ' error' : '');
  t.querySelector('i').className = type === 'error' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
  tm.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
function showError(msg) { showToast(msg, 'error'); }

// ── AUTH ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-password').value;
  const btn = document.getElementById('login-submit');
  const err = document.getElementById('login-error');
  err.style.display = 'none';
  if (!email || !pwd) { err.textContent = 'Veuillez remplir tous les champs.'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Connexion...';
  try {
    const data = await POST('/auth/login', { email, password: pwd });
    if (!data) return;
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('sp_token', data.token);
    initApp();
  } catch (e) {
    err.textContent = e.error || 'Identifiants incorrects.';
    err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Se connecter';
  }
}

function doLogout() {
  localStorage.removeItem('sp_token');
  state.token = null; state.user = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ── INIT ─────────────────────────────────────────────────────────────────────
async function initApp() {
  if (!state.token) return;
  try {
    state.user = await GET('/auth/me');
    if (!state.user) return;
  } catch { doLogout(); return; }

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const av = document.getElementById('user-av');
  const initials = (state.user.prenom[0] + state.user.nom[0]).toUpperCase();
  av.textContent = initials;
  document.getElementById('user-name-top').textContent = `${state.user.prenom} ${state.user.nom}`;
  document.getElementById('user-role-top').textContent = state.user.role === 'gestionnaire'
    ? `Gestionnaire · ${state.user.residence_nom}` : `Copropriétaire · Lot ${state.user.lot}`;

  if (state.user.role === 'gestionnaire') {
    document.getElementById('role-switcher').style.display = 'flex';
    av.style.background = 'var(--accent)';
  }

  state.currentRole = state.user.role === 'gestionnaire' ? 'gestionnaire' : 'resident';
  setRole(state.currentRole, true);
}

// ── ROLE SWITCH ───────────────────────────────────────────────────────────────
function setRole(role, init = false) {
  state.currentRole = role;
  ['resident','gestionnaire'].forEach(r => {
    document.getElementById('btn-' + r)?.classList.toggle('active', r === role);
    document.getElementById('nav-' + r).style.display = r === role ? '' : 'none';
  });
  const av = document.getElementById('user-av');
  if (role === 'gestionnaire') {
    av.style.background = 'var(--accent)';
    document.getElementById('user-role-top').textContent = `Gestionnaire · ${state.user.residence_nom}`;
  } else {
    av.style.background = 'var(--info)';
    document.getElementById('user-role-top').textContent = `Copropriétaire · Lot ${state.user.lot}`;
  }
  showPage(role === 'resident' ? 'r-dashboard' : 'g-dashboard');
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + id);
  if (el) el.classList.add('active');
  state.currentPage = id;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('onclick')?.includes("'" + id + "'")) item.classList.add('active');
  });
  if (window.innerWidth <= 768) closeSidebar();
  loadPage(id);
}

// ── PAGE LOADER ───────────────────────────────────────────────────────────────
const loaded = new Set();
async function loadPage(id) {
  if (loaded.has(id)) return;
  loaded.add(id);
  try {
    switch(id) {
      case 'r-dashboard':   await loadRDashboard(); break;
      case 'r-finances':    await loadRFinances(); break;
      case 'r-incidents':   await loadRIncidents(); break;
      case 'r-documents':   await loadRDocuments(); break;
      case 'r-messagerie':  await loadRMessagerie(); break;
      case 'r-ag':          await loadRAG(); break;
      case 'r-profil':      renderRProfil(); break;
      case 'g-dashboard':   await loadGDashboard(); break;
      case 'g-comptabilite': await loadGCompta(); break;
      case 'g-impayes':     await loadGImpayes(); break;
      case 'g-travaux':     await loadGTravaux(); break;
      case 'g-ag':          await loadGAG(); break;
      case 'g-residents':   await loadGResidents(); break;
      case 'g-settings':    await loadGSettings(); break;
    }
  } catch(e) { console.error('Page load error', id, e); }
}

function setPageContent(id, html) {
  const el = document.getElementById('page-' + id);
  if (el) el.innerHTML = html;
}

function statusPill(s) {
  const m = {
    paye:       ['green','<i class="fa-solid fa-check"></i> Payé'],
    en_attente: ['gray','En attente'],
    retard:     ['orange','<i class="fa-solid fa-clock"></i> Retard'],
    impaye:     ['red','<i class="fa-solid fa-ban"></i> Impayé'],
    ouvert:     ['orange','Ouvert'],
    en_cours:   ['yellow','En cours'],
    resolu:     ['green','Résolu'],
    ferme:      ['gray','Fermé'],
  };
  const [c,l] = m[s] || ['gray', s];
  return `<span class="pill pill-${c}">${l}</span>`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtMAD(n) { return parseFloat(n || 0).toLocaleString('fr-FR') + ' MAD'; }
function initials(u) { return ((u.prenom||'?')[0]+(u.nom||'?')[0]).toUpperCase(); }

// ═══════════ RESIDENT PAGES ═══════════════════════════════════════════════════

async function loadRDashboard() {
  const data = await GET('/dashboard/resident');
  if (!data) return;
  state.dashboardData = data;
  const u = data.user;
  const pa = data.prochainAppel;

  const openInc = data.incidentsRecents.filter(i => i.statut !== 'resolu' && i.statut !== 'ferme').length;
  const badge = document.getElementById('badge-incidents');
  if (badge) { badge.textContent = openInc || ''; badge.style.display = openInc ? '' : 'none'; }

  setPageContent('r-dashboard', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Bonjour, ${u.prenom} ${u.nom} 👋</h1><p>${data.prochaineAG ? state.user.residence_nom + ' · Appartement ' + u.lot : 'Résidence · Appartement ' + u.lot}</p></div>
      <div class="hdr-actions"><button class="btn btn-primary btn-sm" onclick="openModal('modal-incident')"><i class="fa-solid fa-plus"></i> Signaler</button></div>
    </div>
    <div class="metrics-grid">
      <div class="metric ${pa && pa.statut !== 'paye' ? 'danger' : ''}">
        <div class="metric-icon"><i class="fa-solid fa-file-invoice"></i></div>
        <div class="metric-val">${pa ? fmtMAD(pa.montant) : '—'}</div>
        <div class="metric-label">Charges dues</div>
        <div class="metric-sub">${pa ? 'Échéance ' + fmtDate(pa.echeance) : 'Tout est à jour'}</div>
      </div>
      <div class="metric">
        <div class="metric-icon"><i class="fa-solid fa-check-double"></i></div>
        <div class="metric-val">${fmtMAD(data.totalPaye)}</div>
        <div class="metric-label">Payé ce trimestre</div>
        <div class="metric-sub">${data.historiquePaiements.filter(p=>p.statut==='paye').length} versements</div>
      </div>
      <div class="metric accent">
        <div class="metric-icon"><i class="fa-solid fa-wrench"></i></div>
        <div class="metric-val">${data.incidentsOuverts}</div>
        <div class="metric-label">Incidents ouverts</div>
        <div class="metric-sub">Résidence Les Orangers</div>
      </div>
      <div class="metric info">
        <div class="metric-icon"><i class="fa-solid fa-file-pdf"></i></div>
        <div class="metric-val">${data.nbDocuments}</div>
        <div class="metric-label">Documents disponibles</div>
        <div class="metric-sub">PV, règlements, contrats</div>
      </div>
    </div>
    ${pa && pa.statut !== 'paye' ? `
    <div class="pay-banner">
      <div><div style="font-size:12px;opacity:.7;margin-bottom:4px">PROCHAIN APPEL DE FONDS</div><div class="amount">${fmtMAD(pa.montant)}</div></div>
      <div class="label">${pa.periode}<div class="due">Échéance le ${fmtDate(pa.echeance)} · Paiement sécurisé</div></div>
      <button class="pay-banner-btn" onclick="openPayModal()"><i class="fa-solid fa-credit-card"></i> Payer maintenant</button>
    </div>` : `<div class="card" style="background:var(--primary-pale);border-color:#b3dccb"><div style="display:flex;align-items:center;gap:12px;color:var(--primary)"><i class="fa-solid fa-circle-check fa-2x"></i><div><strong>Charges à jour !</strong><div style="font-size:13px;opacity:.8">Aucun paiement en attente pour le moment.</div></div></div></div>`}
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-clock-rotate-left"></i> Activité récente</div>
        <div class="timeline">
          ${data.historiquePaiements.slice(0,5).map(p => `
          <div class="tl-item">
            <div class="tl-dot ${p.statut==='paye'?'':'orange'}"></div>
            <div class="tl-body">
              <div class="tl-date">${fmtDate(p.date_paiement || p.echeance)}</div>
              <div class="tl-text"><strong>${p.statut==='paye'?'Paiement confirmé':'Charges en attente'}</strong> — ${p.periode}</div>
            </div>
          </div>`).join('')}
          ${data.incidentsRecents.slice(0,2).map(i => `
          <div class="tl-item">
            <div class="tl-dot ${i.statut==='resolu'?'':'orange'}"></div>
            <div class="tl-body">
              <div class="tl-date">${fmtDate(i.created_at)}</div>
              <div class="tl-text"><strong>Incident ${i.statut==='resolu'?'résolu':'signalé'}</strong> — ${i.type} · ${i.localisation||''}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-bell"></i> Alertes</div>
        <div class="incident-list">
          ${pa && pa.statut !== 'paye' ? `<div class="incident-card" onclick="showPage('r-finances')"><div class="inc-icon inc-red"><i class="fa-solid fa-file-invoice"></i></div><div class="incident-body"><div class="incident-title">Paiement en attente</div><div class="incident-sub">${fmtMAD(pa.montant)} · ${fmtDate(pa.echeance)}</div></div><span class="pill pill-red">Urgent</span></div>` : ''}
          ${data.prochaineAG ? `<div class="incident-card" onclick="showPage('r-ag')"><div class="inc-icon inc-blue"><i class="fa-solid fa-users"></i></div><div class="incident-body"><div class="incident-title">Prochaine AG</div><div class="incident-sub">${fmtDate(data.prochaineAG.date_ag)} · ${data.prochaineAG.lieu||''}</div></div><span class="pill pill-blue">Voter</span></div>` : ''}
          ${data.incidentsOuverts > 0 ? `<div class="incident-card" onclick="showPage('r-incidents')"><div class="inc-icon inc-orange"><i class="fa-solid fa-wrench"></i></div><div class="incident-body"><div class="incident-title">${data.incidentsOuverts} incident(s) en cours</div><div class="incident-sub">Cliquer pour voir le suivi</div></div></div>` : ''}
          ${!pa && !data.prochaineAG && data.incidentsOuverts === 0 ? `<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Tout est en ordre !</p></div>` : ''}
        </div>
      </div>
    </div>`);
}

async function loadRFinances() {
  const charges = await GET('/charges/resident/moi');
  if (!charges) return;
  const enAttente = charges.filter(c => c.statut !== 'paye');

  setPageContent('r-finances', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Finances & Paiements</h1><p>Suivi de vos charges et historique</p></div>
    </div>
    ${enAttente.length ? enAttente.map(p => `
    <div class="pay-banner">
      <div><div style="font-size:12px;opacity:.7;margin-bottom:4px">À RÉGLER — ${p.periode}</div><div class="amount">${fmtMAD(p.montant)}</div></div>
      <div class="label">${p.description||p.periode}<div class="due">Échéance ${fmtDate(p.echeance)}</div></div>
      <button class="pay-banner-btn" onclick="openPayModalWithId(${p.id}, '${p.periode}', ${p.montant})"><i class="fa-solid fa-credit-card"></i> Payer maintenant</button>
    </div>`).join('') : `<div class="card" style="background:var(--primary-pale);border-color:#b3dccb"><div style="display:flex;align-items:center;gap:12px;color:var(--primary)"><i class="fa-solid fa-circle-check fa-2x"></i><div><strong>Toutes les charges sont à jour !</strong></div></div></div>`}
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-receipt"></i> Historique des paiements</div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Période</th><th>Échéance</th><th>Montant</th><th>Mode</th><th>Statut</th></tr></thead>
        <tbody>${charges.map(p => `
          <tr>
            <td><strong>${p.periode}</strong></td>
            <td>${fmtDate(p.echeance)}</td>
            <td><strong>${fmtMAD(p.montant)}</strong></td>
            <td>${p.mode ? p.mode.charAt(0).toUpperCase()+p.mode.slice(1) : '—'}</td>
            <td>${statusPill(p.statut)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`);
}

async function loadRIncidents() {
  const data = await GET('/incidents');
  if (!data) return;
  const ouverts = data.filter(i => i.statut !== 'resolu' && i.statut !== 'ferme');
  const resolus = data.filter(i => i.statut === 'resolu' || i.statut === 'ferme');
  const typeIcon = { Plomberie:'droplet', Ascenseur:'elevator', Électricité:'bolt', 'Parties communes':'building', Sécurité:'shield-halved', Autre:'triangle-exclamation' };

  setPageContent('r-incidents', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Signalement d'incidents</h1><p>Déclarations et suivi des interventions</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-incident')"><i class="fa-solid fa-plus"></i> Nouveau signalement</button></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-circle-dot"></i> En cours (${ouverts.length})</div>
      ${ouverts.length ? `<div class="incident-list">${ouverts.map(i => `
        <div class="incident-card">
          <div class="inc-icon inc-${i.statut==='en_cours'?'orange':'red'}"><i class="fa-solid fa-${typeIcon[i.type]||'wrench'}"></i></div>
          <div class="incident-body">
            <div class="incident-title">${i.type} — ${i.localisation||''}</div>
            <div class="incident-sub">Signalé ${fmtDate(i.created_at)} · Réf. ${i.reference||''}</div>
            ${i.prestataire ? `<div class="incident-sub" style="color:var(--primary)">Prestataire : ${i.prestataire}</div>` : ''}
            <div class="progress-bar"><div class="progress-fill ${i.statut==='ouvert'?'orange':''}" style="width:${i.statut==='ouvert'?20:60}%"></div></div>
          </div>
          ${statusPill(i.statut)}
        </div>`).join('')}</div>` : `<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Aucun incident en cours</p></div>`}
    </div>
    ${resolus.length ? `<div class="card">
      <div class="card-hdr"><i class="fa-solid fa-check-circle"></i> Résolus</div>
      <div class="incident-list">${resolus.map(i => `
        <div class="incident-card" style="opacity:.6">
          <div class="inc-icon inc-green"><i class="fa-solid fa-${typeIcon[i.type]||'check'}"></i></div>
          <div class="incident-body">
            <div class="incident-title">${i.type} — ${i.localisation||''}</div>
            <div class="incident-sub">Résolu ${fmtDate(i.date_resolution)} · ${i.prestataire||''}</div>
          </div>
          <span class="pill pill-green">Résolu</span>
        </div>`).join('')}
      </div>
    </div>` : ''}`);
}

async function loadRDocuments() {
  const data = await GET('/documents');
  if (!data) return;
  const cats = { ag:'Assemblées Générales', reglementation:'Réglementation', contrats:'Contrats', financier:'Financier', autre:'Autres' };
  const byCat = {};
  data.forEach(d => { (byCat[d.categorie] = byCat[d.categorie] || []).push(d); });

  setPageContent('r-documents', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Documents & Archives</h1><p>${data.length} document(s) disponibles</p></div>
    </div>
    ${Object.keys(cats).filter(c => byCat[c]?.length).map(c => `
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-folder-open"></i> ${cats[c]}</div>
      <div class="doc-grid">${byCat[c].map(d => `
        <div class="doc-card" title="${d.nom}">
          <div class="doc-icon"><i class="fa-solid fa-file-pdf"></i></div>
          <div class="doc-name">${d.nom}</div>
          <div class="doc-date">${fmtDate(d.created_at)}</div>
        </div>`).join('')}
      </div>
    </div>`).join('')}
    ${data.length === 0 ? `<div class="card"><div class="empty-state"><i class="fa-solid fa-folder-open"></i><p>Aucun document disponible</p></div></div>` : ''}`);
}

async function loadRMessagerie() {
  const [syndic, forum] = await Promise.all([GET('/messages?canal=syndic'), GET('/messages?canal=forum')]);
  state.messages.syndic = syndic || [];
  state.messages.forum = forum || [];
  renderMessagerie();
}

function renderMessagerie() {
  const myId = state.user.id;
  const renderThread = (msgs, canal) => msgs.map(m => {
    const isMe = m.expediteur_id === myId;
    const av = isMe ? 'av-b' : (m.role === 'gestionnaire' ? 'av-g' : 'av-a');
    const ini = (m.prenom[0]+m.nom[0]).toUpperCase();
    const t = new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    return `<div class="msg-row ${isMe?'me':''}">
      <div class="av ${av}">${ini}</div>
      <div><div class="bubble ${isMe?'bubble-me':'bubble-them'}">${m.contenu}</div>
      <div class="bubble-time ${isMe?'me':''}">${isMe?'Vous':m.prenom} · ${t}</div></div>
    </div>`;
  }).join('');

  setPageContent('r-messagerie', `
    <div class="page-hdr"><div class="page-hdr-left"><h1>Messagerie</h1><p>Communication avec le syndic et les voisins</p></div></div>
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-headset"></i> Syndic — Support</div>
        <div class="msg-wrapper" id="msg-thread-syndic">${renderThread(state.messages.syndic,'syndic')}</div>
        <div class="msg-input-area">
          <input class="form-control" id="msg-input-syndic" placeholder="Message au syndic..." style="flex:1" onkeydown="if(event.key==='Enter')sendMessage('syndic')">
          <button class="btn btn-primary" onclick="sendMessage('syndic')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-people-group"></i> Forum résidents</div>
        <div class="msg-wrapper" id="msg-thread-forum">${renderThread(state.messages.forum,'forum')}</div>
        <div class="msg-input-area">
          <input class="form-control" id="msg-input-forum" placeholder="Message au forum..." style="flex:1" onkeydown="if(event.key==='Enter')sendMessage('forum')">
          <button class="btn btn-primary" onclick="sendMessage('forum')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>`);

  ['syndic','forum'].forEach(c => {
    const el = document.getElementById('msg-thread-' + c);
    if (el) el.scrollTop = el.scrollHeight;
  });
}

async function sendMessage(canal) {
  const input = document.getElementById('msg-input-' + canal);
  const contenu = input?.value?.trim();
  if (!contenu) return;
  input.value = '';
  try {
    const msg = await POST('/messages', { canal, contenu });
    state.messages[canal].push(msg);
    loaded.delete('r-messagerie');
    loadRMessagerie();
  } catch(e) { showError('Erreur lors de l\'envoi'); }
}

async function loadRAG() {
  const ags = await GET('/ag');
  if (!ags) return;
  state.agList = ags;
  const ag = ags.find(a => a.statut === 'planifie' || a.statut === 'en_cours') || ags[0];

  if (!ag) {
    setPageContent('r-ag', `<div class="page-hdr"><div class="page-hdr-left"><h1>Assemblées Générales</h1></div></div><div class="card"><div class="empty-state"><i class="fa-solid fa-users"></i><p>Aucune AG programmée</p></div></div>`);
    return;
  }

  const votes = await GET('/ag/' + ag.id + '/votes');
  const resolutions = ag.ordre_du_jour || [];
  const totaux = {};
  (votes?.totaux || []).forEach(v => { totaux[v.resolution_num] = v; });
  const monVote = {};
  (votes?.monVote || []).forEach(v => { monVote[v.resolution_num] = v.choix; });

  setPageContent('r-ag', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Assemblée Générale</h1><p>Vote en ligne · ${fmtDate(ag.date_ag)}</p></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-circle-info"></i> Informations</div>
      <div style="display:flex;gap:2rem;flex-wrap:wrap;font-size:13px;color:var(--text-2)">
        <div><i class="fa-solid fa-calendar" style="color:var(--primary);margin-right:6px"></i><strong>${fmtDate(ag.date_ag)}</strong> à ${new Date(ag.date_ag).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
        ${ag.lieu ? `<div><i class="fa-solid fa-location-dot" style="color:var(--primary);margin-right:6px"></i>${ag.lieu}</div>` : ''}
        <div><i class="fa-solid fa-circle-check" style="color:var(--primary);margin-right:6px"></i>Type : <strong>${ag.type}</strong></div>
      </div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-vote-yea"></i> Résolutions</div>
      <div id="votes-container">${resolutions.map(r => {
        const t = totaux[r.num] || { pour: r.pour||0, contre: r.contre||0, abstention: r.abstention||0 };
        const mv = monVote[r.num];
        return `<div class="vote-item">
          <div><div class="vote-q">${r.num}. ${r.titre}</div>
          <div class="vote-sub">Pour: ${t.pour} · Contre: ${t.contre} · Abstention: ${t.abstention}</div></div>
          ${mv ? `<span class="pill pill-green">Vote enregistré : ${mv} ✓</span>` :
          `<div class="vote-actions">
            <button class="btn btn-sm v-yes" onclick="castVote(${ag.id},${r.num},'pour',this)">✓ Pour</button>
            <button class="btn btn-sm v-no" onclick="castVote(${ag.id},${r.num},'contre',this)">✗ Contre</button>
            <button class="btn btn-sm v-abs" onclick="castVote(${ag.id},${r.num},'abstention',this)">— Abstention</button>
          </div>`}
        </div>`;
      }).join('')}</div>
    </div>`);
}

async function castVote(agId, resNum, choix, btn) {
  btn.disabled = true;
  try {
    await POST('/ag/' + agId + '/votes', { resolution_num: resNum, choix });
    showToast('🗳️ Vote "' + choix + '" enregistré');
    const row = btn.closest('.vote-item');
    const actions = row.querySelector('.vote-actions');
    actions.outerHTML = `<span class="pill pill-green">Vote : ${choix} ✓</span>`;
  } catch(e) { showError('Erreur vote'); btn.disabled = false; }
}

function renderRProfil() {
  const u = state.user;
  setPageContent('r-profil', `
    <div class="page-hdr"><div class="page-hdr-left"><h1>Mon profil</h1><p>Informations personnelles et préférences</p></div></div>
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-user"></i> Informations personnelles</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:1.25rem">
          <div style="width:60px;height:60px;border-radius:14px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700">${initials(u)}</div>
          <div><div style="font-size:16px;font-weight:600">${u.prenom} ${u.nom}</div><div style="font-size:12px;color:var(--text-3)">Copropriétaire · Lot ${u.lot}</div></div>
        </div>
        <div class="form-row"><div class="form-group"><label class="form-label">Prénom</label><input class="form-control" id="p-prenom" value="${u.prenom}"></div><div class="form-group"><label class="form-label">Nom</label><input class="form-control" id="p-nom" value="${u.nom}"></div></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-control" value="${u.email}" disabled style="opacity:.6"></div>
        <div class="form-group" style="margin-bottom:1rem"><label class="form-label">Téléphone</label><input class="form-control" id="p-tel" value="${u.telephone||''}"></div>
        <button class="btn btn-primary btn-sm" onclick="saveProfile()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-bell"></i> Notifications</div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-email" ${u.notif_email?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Rappels par email</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-sms" ${u.notif_sms?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Notifications SMS</span></div>
        </div>
        <div style="margin-top:1.5rem">
          <div style="font-size:13px;font-weight:600;margin-bottom:.75rem">Informations du lot</div>
          <div style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--text-2)">
            <div>Lot : <strong style="color:var(--text)">${u.lot}</strong></div>
            <div>Tantièmes : <strong style="color:var(--text)">${u.tantiemes}/1000</strong></div>
            <div>Résidence : <strong style="color:var(--text)">${u.residence_nom}</strong></div>
          </div>
        </div>
      </div>
    </div>`);
}

async function saveProfile() {
  try {
    const res = await PUT('/auth/me', {
      prenom: document.getElementById('p-prenom').value,
      nom: document.getElementById('p-nom').value,
      telephone: document.getElementById('p-tel').value,
      notif_email: document.getElementById('sw-email').checked,
      notif_sms: document.getElementById('sw-sms').checked,
    });
    if (res) { state.user = {...state.user, ...res}; showToast('✅ Profil mis à jour'); }
  } catch(e) { showError('Erreur sauvegarde'); }
}

// ═══════════ GESTIONNAIRE PAGES ══════════════════════════════════════════════

async function loadGDashboard() {
  const data = await GET('/dashboard/gestionnaire');
  if (!data) return;
  const badge = document.getElementById('badge-impayes');
  if (badge) { badge.textContent = data.nbImpayes || ''; badge.style.display = data.nbImpayes ? '' : 'none'; }

  const pct = (n, max) => Math.min(100, Math.round((n/max)*100));

  setPageContent('g-dashboard', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Vue d'ensemble</h1><p>${state.user.residence_nom} · ${data.totalResidents} lots</p></div>
      <div class="hdr-actions">
        <button class="btn btn-ghost btn-sm"><i class="fa-solid fa-download"></i> Rapport</button>
        <button class="btn btn-primary btn-sm" onclick="openModal('modal-appel-fonds')"><i class="fa-solid fa-plus"></i> Appel de fonds</button>
      </div>
    </div>
    <div class="metrics-grid">
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-percent"></i></div>
        <div class="metric-val">${data.tauxRecouvrement}<span style="font-size:1.2rem">%</span></div>
        <div class="metric-label">Taux de recouvrement</div><div class="metric-sub">${data.aJour} / ${data.totalResidents} à jour</div>
      </div>
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="metric-val">${fmtMAD(data.totalImpayes)}</div>
        <div class="metric-label">Impayés en cours</div><div class="metric-sub">${data.nbImpayes} dossiers actifs</div>
      </div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-piggy-bank"></i></div>
        <div class="metric-val">${fmtMAD(data.budgetAnnuel)}</div>
        <div class="metric-label">Budget annuel</div><div class="metric-sub">Exercice en cours</div>
      </div>
      <div class="metric info"><div class="metric-icon"><i class="fa-solid fa-hammer"></i></div>
        <div class="metric-val">${data.incidentsActifs}</div>
        <div class="metric-label">Interventions actives</div><div class="metric-sub">Incidents ouverts + en cours</div>
      </div>
    </div>
    <div class="grid-3">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-chart-bar"></i> Recouvrement en cours
          <div class="card-hdr-right"><span class="pill pill-green">${data.paiStats.paye?.cnt||0} payés</span><span class="pill pill-red" style="margin-left:4px">${data.nbImpayes} retards</span></div>
        </div>
        <div style="height:6px;background:var(--border);border-radius:4px;margin-bottom:1rem;overflow:hidden">
          <div style="height:100%;width:${data.tauxRecouvrement}%;background:var(--primary);border-radius:4px;transition:width .8s ease"></div>
        </div>
        <div class="chart-bar-wrap">
          ${data.impayesDetail.slice(0,5).map(i => `
          <div class="chart-bar-row">
            <div class="chart-bar-label">${i.prenom} ${i.nom} (${i.lot})</div>
            <div class="chart-bar-track"><div class="chart-bar-fill accent" style="width:${Math.min(100,Math.round((+i.jours_retard||0)/90*100))}%"><span>${i.jours_retard||0}j</span></div></div>
          </div>`).join('')}
        </div>
        ${data.impayesDetail.length === 0 ? '<div class="empty-state" style="padding:1rem"><i class="fa-solid fa-circle-check"></i><p>Aucun impayé !</p></div>' : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:1.25rem">
        <div class="card">
          <div class="card-hdr"><i class="fa-solid fa-users"></i> Résidents</div>
          <div style="font-size:2rem;font-weight:700;color:var(--primary)">${data.aJour} <span style="font-size:1rem;font-weight:400;color:var(--text-2)">/ ${data.totalResidents}</span></div>
          <div style="height:5px;background:var(--border);border-radius:4px;margin-top:10px;overflow:hidden"><div style="height:100%;width:${data.tauxRecouvrement}%;background:var(--primary);border-radius:4px"></div></div>
          <div style="font-size:11px;color:var(--text-3);margin-top:6px">À jour ce trimestre</div>
        </div>
        <div class="card">
          <div class="card-hdr"><i class="fa-solid fa-chart-pie"></i> Incidents</div>
          <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
            ${Object.entries(data.incStats).map(([k,v]) => `<div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">${k}</span><strong>${v}</strong></div>`).join('')}
          </div>
        </div>
      </div>
    </div>`);
}

async function loadGCompta() {
  const charges = await GET('/charges');
  if (!charges) return;
  const actif = charges.find(c => c.statut === 'actif') || charges[0];

  setPageContent('g-comptabilite', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Comptabilité</h1><p>Appels de fonds et paiements</p></div>
      <div class="hdr-actions">
        <button class="btn btn-primary" onclick="openModal('modal-appel-fonds')"><i class="fa-solid fa-plus"></i> Nouvel appel de fonds</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:0">
      <div class="card-hdr"><i class="fa-solid fa-table"></i> Appels de fonds
        <div class="card-hdr-right">
          ${charges.map(c => `<span class="pill pill-${c.statut==='actif'?'green':'gray'}" style="margin-left:4px">${c.periode}</span>`).join('')}
        </div>
      </div>
      <div style="overflow-x:auto" id="compta-table-wrap">
        <div class="loading-state"><i class="fa-solid fa-circle-notch"></i></div>
      </div>
    </div>`);

  if (actif) {
    const paiements = await GET('/charges/' + actif.id + '/paiements');
    if (!paiements) return;
    const wrap = document.getElementById('compta-table-wrap');
    if (wrap) wrap.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Copropriétaire</th><th>Lot</th><th>Montant</th><th>Paiement</th><th>Mode</th><th>Statut</th><th>Actions</th></tr></thead>
        <tbody>${paiements.map(p => `<tr>
          <td><strong>${p.prenom} ${p.nom}</strong></td>
          <td>${p.lot}</td>
          <td><strong>${fmtMAD(p.montant)}</strong></td>
          <td>${p.date_paiement ? fmtDate(p.date_paiement) : '—'}</td>
          <td>${p.mode ? p.mode.charAt(0).toUpperCase()+p.mode.slice(1) : '—'}</td>
          <td>${statusPill(p.statut)}</td>
          <td>${p.statut !== 'paye' ? `<button class="btn btn-danger btn-sm" onclick="relancerPaiement(${p.id},'${p.prenom} ${p.nom}')"><i class="fa-solid fa-envelope"></i> Relancer</button>` : ''}</td>
        </tr>`).join('')}
        </tbody>
      </table>`;
  }
}

async function relancerPaiement(id, nom) {
  showToast(`📩 Relance envoyée à ${nom}`);
}

async function loadGImpayes() {
  const data = await GET('/dashboard/gestionnaire');
  if (!data) return;
  const { impayesDetail } = data;

  setPageContent('g-impayes', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Gestion des impayés</h1><p>${impayesDetail.length} dossier(s) actifs</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="showToast('📩 Relance groupée envoyée')"><i class="fa-solid fa-paper-plane"></i> Relance groupée</button></div>
    </div>
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div><div class="metric-val">${fmtMAD(data.totalImpayes)}</div><div class="metric-label">Total impayés</div></div>
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-users"></i></div><div class="metric-val">${data.nbImpayes}</div><div class="metric-label">Dossiers actifs</div></div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-envelope"></i></div><div class="metric-val">${data.nbImpayes * 2}</div><div class="metric-label">Relances ce mois</div></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-list"></i> Dossiers par ancienneté</div>
      ${impayesDetail.length ? `<div>${impayesDetail.map(i => {
        const jours = i.jours_retard || 0;
        const type = jours > 60 ? 'contentieux' : jours > 30 ? 'mise_en_demeure' : 'relance';
        return `<div class="impaye-item">
          <div class="imp-av">${(i.prenom[0]+i.nom[0]).toUpperCase()}</div>
          <div style="flex:1"><div class="imp-name">${i.prenom} ${i.nom} — Lot ${i.lot}</div>
          <div class="imp-detail">${jours > 60 ? 'Mise en demeure' : jours > 30 ? '2e relance' : '1ère relance'}</div></div>
          <div style="text-align:right"><div class="imp-amount">${fmtMAD(i.montant)}</div><div style="font-size:11px;color:${jours>60?'var(--danger)':'var(--text-3)'};font-weight:${jours>60?600:400}">${jours} jours de retard</div></div>
          <button class="btn ${jours>60?'btn-sm':'btn-danger btn-sm'}" ${jours>60?`style="background:var(--danger);color:#fff;border:none;border-radius:6px;padding:5px 11px;font-size:12px;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:4px"`:''}
            onclick="showToast('📩 ${jours>60?'Dossier transmis au contentieux':'Relance envoyée à'} ${i.prenom} ${i.nom}')">
            <i class="fa-solid fa-${jours>60?'gavel':'envelope'}"></i> ${jours>60?'Contentieux':'Relancer'}
          </button>
        </div>`;}).join('')}</div>`
      : `<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Aucun impayé en cours !</p></div>`}
    </div>`);
}

async function loadGTravaux() {
  const data = await GET('/incidents');
  if (!data) return;
  const actifs = data.filter(i => i.statut === 'ouvert' || i.statut === 'en_cours');
  const resolus = data.filter(i => i.statut === 'resolu').slice(0,3);
  const typeIcon = { Plomberie:'droplet', Ascenseur:'elevator', Électricité:'bolt', 'Parties communes':'building', Sécurité:'shield-halved', Autre:'wrench' };

  setPageContent('g-travaux', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Travaux & Entretien</h1><p>Carnet d'entretien · ${actifs.length} intervention(s) active(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-incident')"><i class="fa-solid fa-plus"></i> Nouvelle intervention</button></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-hard-hat"></i> Interventions actives</div>
      ${actifs.length ? `<div class="incident-list">${actifs.map(i => `
        <div class="incident-card">
          <div class="inc-icon inc-${i.statut==='ouvert'?'red':'orange'}"><i class="fa-solid fa-${typeIcon[i.type]||'wrench'}"></i></div>
          <div class="incident-body">
            <div class="incident-title">${i.type} — ${i.localisation||''}</div>
            <div class="incident-sub">Signalé le ${fmtDate(i.created_at)} · ${i.prenom||''} ${i.nom||''} ${i.lot?'(Lot '+i.lot+')':''}</div>
            ${i.prestataire ? `<div style="font-size:12px;color:var(--primary);margin-top:2px">Prestataire : ${i.prestataire} · ${i.cout?fmtMAD(i.cout):''}</div>` : ''}
            <div class="progress-bar"><div class="progress-fill ${i.statut==='ouvert'?'orange':''}" style="width:${i.statut==='ouvert'?20:60}%"></div></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            ${statusPill(i.statut)}
            <button class="btn btn-ghost btn-sm" onclick="resolveIncident(${i.id})"><i class="fa-solid fa-check"></i> Résoudre</button>
          </div>
        </div>`).join('')}</div>`
      : `<div class="empty-state"><i class="fa-solid fa-circle-check"></i><p>Aucune intervention en cours</p></div>`}
    </div>
    ${resolus.length ? `<div class="card"><div class="card-hdr"><i class="fa-solid fa-check-circle"></i> Récemment résolus</div>
      <div class="incident-list">${resolus.map(i => `
        <div class="incident-card" style="opacity:.65">
          <div class="inc-icon inc-green"><i class="fa-solid fa-${typeIcon[i.type]||'check'}"></i></div>
          <div class="incident-body">
            <div class="incident-title">${i.type} — ${i.localisation||''}</div>
            <div class="incident-sub">Résolu ${fmtDate(i.date_resolution)} · ${i.prestataire||'—'}</div>
          </div>
          <span class="pill pill-green">Résolu</span>
        </div>`).join('')}
      </div></div>` : ''}`);
}

async function resolveIncident(id) {
  try {
    await PUT('/incidents/' + id, { statut: 'resolu', date_resolution: new Date().toISOString().split('T')[0] });
    showToast('✅ Incident marqué comme résolu');
    loaded.delete('g-travaux');
    loaded.delete('r-incidents');
    loadPage('g-travaux');
  } catch(e) { showError('Erreur'); }
}

async function loadGAG() {
  const ags = await GET('/ag');
  if (!ags) return;
  const ag = ags[0];

  setPageContent('g-ag', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Tenue des Assemblées Générales</h1><p>${ags.length} AG(s) enregistrée(s)</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-ag-create')"><i class="fa-solid fa-plus"></i> Convoquer une AG</button></div>
    </div>
    ${ag ? await renderGAGDetail(ag) : `<div class="card"><div class="empty-state"><i class="fa-solid fa-users"></i><p>Aucune AG programmée. Créez la première !</p></div></div>`}`);
}

async function renderGAGDetail(ag) {
  const [presences, votes] = await Promise.all([GET('/ag/' + ag.id + '/presences'), GET('/ag/' + ag.id + '/votes')]);
  const resolutions = ag.ordre_du_jour || [];
  const totaux = {};
  (votes?.totaux || []).forEach(v => { totaux[v.resolution_num] = v; });
  const nbPresents = (presences||[]).filter(p=>p.mode==='present').length;
  const nbCorr = (presences||[]).filter(p=>p.mode==='correspondance').length;
  const nbAbsent = (presences||[]).filter(p=>p.mode==='absent').length;

  return `
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-envelope"></i></div><div class="metric-val">${(presences||[]).length}</div><div class="metric-label">Convoqués</div></div>
      <div class="metric"><div class="metric-icon"><i class="fa-solid fa-user-check"></i></div><div class="metric-val">${nbPresents}</div><div class="metric-label">Présents</div></div>
      <div class="metric accent"><div class="metric-icon"><i class="fa-solid fa-mail-bulk"></i></div><div class="metric-val">${nbCorr}</div><div class="metric-label">Correspondance</div></div>
      <div class="metric danger"><div class="metric-icon"><i class="fa-solid fa-user-xmark"></i></div><div class="metric-val">${nbAbsent}</div><div class="metric-label">Sans réponse</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-user-check"></i> Feuille de présence — ${fmtDate(ag.date_ag)}</div>
        <div class="presence-grid">${(presences||[]).map(p => `
          <div class="pres-dot pres-${p.mode==='present'?'yes':p.mode==='correspondance'?'mail':'no'}"
               title="${p.prenom} ${p.nom} · ${p.mode}"
               onclick="togglePresence(${ag.id},${p.resident_id},'${p.mode}',this)">
            ${(p.prenom[0]+p.nom[0]).toUpperCase()}
          </div>`).join('')}
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-3);display:flex;gap:12px;flex-wrap:wrap">
          <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:#e6f4ef;border:1px solid #b3dccb;display:inline-block"></span>Présent</span>
          <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:#fdf0e8;display:inline-block;border:1px solid rgba(224,112,58,.2)"></span>Correspondance</span>
          <span style="display:inline-flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:3px;background:var(--surface2);display:inline-block;border:1px solid var(--border)"></span>Absent</span>
        </div>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-vote-yea"></i> Résolutions
          <div class="card-hdr-right"><button class="btn btn-accent btn-sm" onclick="showToast('🗳️ Vote live activé !')"><i class="fa-solid fa-play"></i> Vote live</button></div>
        </div>
        <div>${resolutions.map(r => {
          const t = totaux[r.num] || { pour: r.pour||0, contre: r.contre||0, abstention: r.abstention||0 };
          return `<div class="vote-item">
            <div><div class="vote-q">${r.num}. ${r.titre}</div>
            <div class="vote-sub">Pour: ${t.pour} · Contre: ${t.contre} · Abstention: ${t.abstention}</div></div>
            <span class="pill ${(+t.pour > +t.contre) ? 'pill-green' : 'pill-orange'}">En cours</span>
          </div>`;}).join('')}
        </div>
      </div>
    </div>`;
}

async function togglePresence(agId, residentId, currentMode, el) {
  const modes = ['absent','present','correspondance'];
  const next = modes[(modes.indexOf(currentMode)+1) % modes.length];
  try {
    await PUT('/ag/' + agId + '/presences/' + residentId, { mode: next });
    el.className = 'pres-dot pres-' + (next==='present'?'yes':next==='correspondance'?'mail':'no');
    el.setAttribute('onclick', `togglePresence(${agId},${residentId},'${next}',this)`);
    el.title = el.title.split(' · ')[0] + ' · ' + next;
  } catch(e) { showError('Erreur mise à jour présence'); }
}

async function loadGResidents() {
  const data = await GET('/residents');
  if (!data) return;
  state.residents = data;

  setPageContent('g-residents', `
    <div class="page-hdr">
      <div class="page-hdr-left"><h1>Résidents & Copropriétaires</h1><p>${data.length} résidents enregistrés</p></div>
      <div class="hdr-actions"><button class="btn btn-primary" onclick="openModal('modal-resident')"><i class="fa-solid fa-user-plus"></i> Nouveau résident</button></div>
    </div>
    <div class="card">
      <div class="card-hdr"><i class="fa-solid fa-people-group"></i> Liste des copropriétaires</div>
      <div style="overflow-x:auto"><table class="data-table">
        <thead><tr><th>Résident</th><th>Lot</th><th>Tantièmes</th><th>Email</th><th>Tél.</th><th>Charges</th></tr></thead>
        <tbody>${data.map(r => `
          <tr>
            <td><div style="display:flex;align-items:center;gap:8px">
              <div style="width:30px;height:30px;border-radius:7px;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0">${initials(r)}</div>
              <strong>${r.prenom} ${r.nom}</strong>
            </div></td>
            <td>${r.lot||'—'}</td>
            <td>${r.tantiemes}/1000</td>
            <td style="color:var(--info)">${r.email}</td>
            <td>${r.telephone||'—'}</td>
            <td>${statusPill(r.statut_charges||'en_attente')}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`);
}

async function loadGSettings() {
  const data = await GET('/settings/residence');
  if (!data) return;
  state.settings = data;

  setPageContent('g-settings', `
    <div class="page-hdr"><div class="page-hdr-left"><h1>Paramètres</h1><p>Configuration de la résidence et automatisations</p></div></div>
    <div class="grid-2">
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-building"></i> Informations de la résidence</div>
        <div class="form-group"><label class="form-label">Nom</label><input class="form-control" id="s-nom" value="${data.nom||''}"></div>
        <div class="form-group"><label class="form-label">Adresse</label><input class="form-control" id="s-adresse" value="${data.adresse||''}"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Ville</label><input class="form-control" id="s-ville" value="${data.ville||''}"></div>
          <div class="form-group"><label class="form-label">Nb de lots</label><input class="form-control" id="s-lots" type="number" value="${data.nb_lots||''}"></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveSettings()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
      </div>
      <div class="card">
        <div class="card-hdr"><i class="fa-solid fa-sliders"></i> Automatisations</div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-relance" ${data.relance_auto?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Relances automatiques (J+${data.relance_delai_jours||15})</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-af-auto" ${data.appel_fonds_auto?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Émission auto des appels de fonds</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-sms-res" ${data.notif_sms_residents?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">SMS aux résidents</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-rapport" ${data.rapport_hebdo?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Rapport hebdomadaire automatique</span></div>
          <div class="switch-wrap"><label class="switch"><input type="checkbox" id="sw-pv" ${data.archivage_auto_pv?'checked':''}><span class="slider-sw"></span></label><span class="switch-label">Archivage automatique des PV</span></div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="saveSettings()"><i class="fa-solid fa-floppy-disk"></i> Enregistrer</button>
      </div>
    </div>`);
}

async function saveSettings() {
  try {
    const body = {
      nom: document.getElementById('s-nom')?.value,
      adresse: document.getElementById('s-adresse')?.value,
      ville: document.getElementById('s-ville')?.value,
      nb_lots: parseInt(document.getElementById('s-lots')?.value),
      relance_auto: document.getElementById('sw-relance')?.checked,
      appel_fonds_auto: document.getElementById('sw-af-auto')?.checked,
      notif_sms_residents: document.getElementById('sw-sms-res')?.checked,
      rapport_hebdo: document.getElementById('sw-rapport')?.checked,
      archivage_auto_pv: document.getElementById('sw-pv')?.checked,
    };
    await PUT('/settings/residence', body);
    showToast('✅ Paramètres sauvegardés');
  } catch(e) { showError('Erreur sauvegarde'); }
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); }));

function openPayModal() {
  const data = state.dashboardData;
  const pa = data?.prochainAppel;
  if (!pa) return;
  document.getElementById('modal-paiement-info').innerHTML = `<strong>${pa.periode}</strong> — ${fmtMAD(pa.montant)} · Lot ${state.user.lot}`;
  document.getElementById('pay-paiement-id').value = '';
  openModal('modal-paiement');
}

function openPayModalWithId(id, periode, montant) {
  document.getElementById('modal-paiement-info').innerHTML = `<strong>${periode}</strong> — ${fmtMAD(montant)} · Lot ${state.user.lot}`;
  document.getElementById('pay-paiement-id').value = id;
  openModal('modal-paiement');
}

async function submitPaiement() {
  const btn = document.getElementById('pay-submit-btn');
  const pId = document.getElementById('pay-paiement-id').value;
  const mode = document.getElementById('pay-mode').value;
  btn.disabled = true;
  try {
    if (pId) {
      await POST('/charges/paiements/' + pId + '/payer', { mode });
      showToast('✅ Paiement confirmé avec succès !');
      loaded.delete('r-finances');
      loaded.delete('r-dashboard');
    } else {
      showToast('✅ Paiement traité avec succès !');
    }
    closeModal('modal-paiement');
    if (state.currentPage === 'r-finances') loadRFinances();
    if (state.currentPage === 'r-dashboard') loadRDashboard();
  } catch(e) { showError('Erreur paiement'); }
  btn.disabled = false;
}

async function submitIncident() {
  const type = document.getElementById('inc-type').value;
  const localisation = document.getElementById('inc-loc').value;
  const description = document.getElementById('inc-desc').value.trim();
  const urgence = document.getElementById('inc-urgence').value;
  if (!description) return showError('Description requise');
  try {
    await POST('/incidents', { type, localisation, description, urgence });
    showToast('✅ Incident signalé ! Le syndic a été notifié.');
    closeModal('modal-incident');
    loaded.delete('r-incidents');
    loaded.delete('g-travaux');
    ['inc-loc','inc-desc'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    if (state.currentPage === 'r-incidents') { loaded.delete('r-incidents'); loadRIncidents(); }
    if (state.currentPage === 'g-travaux') { loaded.delete('g-travaux'); loadGTravaux(); }
  } catch(e) { showError('Erreur signalement'); }
}

async function submitAppelFonds() {
  const periode = document.getElementById('af-periode').value;
  const montant_base = document.getElementById('af-montant').value;
  const echeance = document.getElementById('af-echeance').value;
  const description = document.getElementById('af-desc').value;
  if (!periode || !montant_base || !echeance) return showError('Champs requis manquants');
  try {
    await POST('/charges', { periode, montant_base, echeance, description });
    showToast('✅ Appel de fonds émis et notifié aux résidents');
    closeModal('modal-appel-fonds');
    loaded.delete('g-comptabilite');
    loaded.delete('g-dashboard');
    if (state.currentPage === 'g-comptabilite') loadGCompta();
    if (state.currentPage === 'g-dashboard') loadGDashboard();
  } catch(e) { showError(e.error || 'Erreur création'); }
}

async function submitResident() {
  const body = {
    prenom: document.getElementById('res-prenom').value,
    nom: document.getElementById('res-nom').value,
    email: document.getElementById('res-email').value,
    telephone: document.getElementById('res-tel').value,
    lot: document.getElementById('res-lot').value,
    tantiemes: parseInt(document.getElementById('res-tantiemes').value) || 0,
  };
  if (!body.prenom || !body.nom || !body.email) return showError('Champs requis manquants');
  try {
    await POST('/residents', body);
    showToast('✅ Résident créé (mot de passe par défaut : resident123)');
    closeModal('modal-resident');
    loaded.delete('g-residents');
    if (state.currentPage === 'g-residents') loadGResidents();
  } catch(e) { showError(e.error || 'Erreur création résident'); }
}

async function submitAG() {
  const date = document.getElementById('ag-date').value;
  const heure = document.getElementById('ag-heure').value;
  const lieu = document.getElementById('ag-lieu').value;
  const type = document.getElementById('ag-type').value;
  if (!date || !lieu) return showError('Date et lieu requis');
  try {
    await POST('/ag', { date_ag: date + 'T' + heure + ':00', lieu, type });
    showToast('✅ AG convoquée et notifications envoyées');
    closeModal('modal-ag-create');
    loaded.delete('g-ag');
    loaded.delete('r-ag');
    if (state.currentPage === 'g-ag') loadGAG();
  } catch(e) { showError('Erreur création AG'); }
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
document.getElementById('hamburger-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('show');
});
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

// ── FAB ───────────────────────────────────────────────────────────────────────
function fabAction() {
  if (state.currentRole === 'resident') openModal('modal-incident');
  else openModal('modal-appel-fonds');
}

// ── KEYBOARD ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  }
});

// ── BOOT ─────────────────────────────────────────────────────────────────────
initApp();
