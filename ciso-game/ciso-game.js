// =====================================================================
// GAME DATA — loaded from scenes.json
// =====================================================================
let ALL_SCENES, RANDOM_EVENTS, CHAIN_EFFECTS, POLICY_CATALOG, TECH_CATALOG,
    INTRO_SCENE, FINAL_SCENE, HIRE_CATALOG;

async function loadData() {
  const [scenes, people, policies, tools] = await Promise.all([
    fetch('./scenes.json').then(r => r.json()),
    fetch('./res/people.json').then(r => r.json()),
    fetch('./res/policies.json').then(r => r.json()),
    fetch('./res/tools.json').then(r => r.json()),
  ]);
  ALL_SCENES    = scenes.scenes;
  RANDOM_EVENTS = scenes.randomEvents;
  CHAIN_EFFECTS = scenes.chainEffects;
  INTRO_SCENE   = scenes.introScene;
  FINAL_SCENE   = scenes.finalScene;
  POLICY_CATALOG = policies;
  TECH_CATALOG   = tools;
  HIRE_CATALOG   = people;
}

// =====================================================================
// SOUND ENGINE (Web Audio API — no external files needed)
// =====================================================================
let soundEnabled = true;
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq, type, duration, vol=0.15, delay=0) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    const t = ctx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t); osc.stop(t + duration);
  } catch(e) {}
}

function sfxBeep()   { playTone(880,'square',.08,.12); playTone(1100,'square',.08,.1,.09); }
function sfxAlert()  { [0,.1,.2].forEach(d=>playTone(440,'sawtooth',.12,.18,d)); }
function sfxSuccess(){ playTone(523,'sine',.2,.12); playTone(659,'sine',.2,.1,.15); playTone(784,'sine',.3,.1,.3); }
function sfxFail()   { playTone(220,'sawtooth',.3,.2); playTone(150,'sawtooth',.4,.15,.25); }
function sfxClick()  { playTone(660,'square',.05,.08); }
function sfxType()   { playTone(400+Math.random()*200,'square',.03,.04); }
function sfxTimer()  { playTone(880,'square',.05,.2); }

// Ambient hum
let ambientNode = null;
function startAmbient() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudio();
    ambientNode = ctx.createOscillator();
    const gain = ctx.createGain();
    ambientNode.connect(gain); gain.connect(ctx.destination);
    ambientNode.type = 'sine'; ambientNode.frequency.value = 60;
    gain.gain.value = 0.02;
    ambientNode.start();
  } catch(e) {}
}
function stopAmbient() { try { ambientNode && ambientNode.stop(); ambientNode = null; } catch(e){} }

function toggleSound() {
  soundEnabled = !soundEnabled;
  document.getElementById('sound-btn').textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) startAmbient(); else stopAmbient();
}

// =====================================================================
// RANDOM EVENTS (fire between scenes)
// =====================================================================
// =====================================================================
// CHAINED CONSEQUENCES
// =====================================================================
// =====================================================================
// POLICY CATALOG (on-demand purchase)
// =====================================================================
// =====================================================================
// TECHNOLOGY CATALOG (on-demand purchase, expires by license)
// =====================================================================
// =====================================================================
// GAME STATE
// =====================================================================
const TEAM_ROSTER = [
  {id:'ana',   name:'Ana Vega',    role:'Analista SOC',     avatar:'👩‍💻', status:'ok', tech:75, mgmt:35, techLoad:0, mgmtLoad:0, level:'mid', dept:'soc'},
  {id:'carlos',name:'Carlos Ríos', role:'Pen Tester',       avatar:'🧑‍💻', status:'ok', tech:85, mgmt:20, techLoad:0, mgmtLoad:0, level:'mid', dept:'red'},
  {id:'maria', name:'Maria Torres',role:'Resp. Incidentes', avatar:'👩‍🔬', status:'ok', tech:65, mgmt:70, techLoad:0, mgmtLoad:0, level:'mid', dept:'gov'},
  {id:'luis',  name:'Luis Pena',   role:'Arq. Cloud',       avatar:'👨‍🔧', status:'ok', tech:80, mgmt:55, techLoad:0, mgmtLoad:0, level:'mid', dept:'cloud'},
];

// Capacidad total de un miembro (tech + mgmt)
function memberCapacity(m) {
  return (m.tech || 0) + (m.mgmt || 0);
}
// Carga efectiva como % del total (para compat display)
function memberLoadPct(m) {
  const cap = memberCapacity(m);
  if (cap === 0) return 0;
  return Math.round(((m.techLoad||0) + (m.mgmtLoad||0)) / cap * 100);
}

const DIFF_CONFIG = {
  junior: {budget:700000, threatMult:0.7, startRep:75, label:'JUNIOR'},
  senior: {budget:500000, threatMult:1.0, startRep:70, label:'SENIOR'},
  crisis: {budget:200000, threatMult:1.4, startRep:40, label:'EN CRISIS'},
};

let G = {};
let playQueue = [];
let queueIdx = 0;
let currentDiff = 'senior';
let timerInterval = null;
let timerSeconds = 0;
let lastChoiceId = '';
let lastChoiceLog = '';
const SCENES_PER_RUN = 7;

// Stakeholder approval (0-5 each)
function initStakeholders() {
  return { ceo: 4, cfo: 3, reg: 4, team: 5 };
}

function setDiff(d) {
  currentDiff = d;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('d-'+d).classList.add('active');
  sfxClick();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

function buildQueue() {
  // INFINITE MODE: return ALL scenes shuffled. When exhausted, refill.
  return shuffle(ALL_SCENES);
}

// Refill the queue when running low
function refillQueue() {
  const refresh = shuffle(ALL_SCENES);
  playQueue = playQueue.concat(refresh);
  updateProgressBarInfinite();
}

function returnToStartScreen() {
  document.getElementById('endscreen').style.display = 'none';
  hideGameUIBeforeStart();
  document.getElementById('start-screen').style.display = 'block';
  stopAmbient();
  sfxClick();
}

function startGame() {
  // Hide start screen
  const ss = document.getElementById('start-screen');
  if (ss) ss.style.display = 'none';
  sfxClick();
  
  const cfg = DIFF_CONFIG[currentDiff];
  G = {
    budget: cfg.budget, maxBudget: cfg.budget,
    reputation: cfg.startRep, threatBase: currentDiff==='crisis'?65:currentDiff==='senior'?45:25, threat: 0,
    day: 1, year: 1, cycle: 1,
    incidentsHandled: 0, incidentsFailed: 0, decisionsCount: 0,
    team: TEAM_ROSTER.map(m => ({...m})),
    tools: [], policies: [], techStack: [],
    tasks: [], totalMonths: 0,
    stakeholders: initStakeholders(),
    threatMult: cfg.threatMult,
    chainEffects: [],
    lastSceneId: '',
    lastSceneLog: '',
    difficulty: currentDiff,
    mttr: [], mttd: [],
    randEventsCount: 0,
    repCutFired: [],
    complianceWarnedYear: 0,
  };

  playQueue = [INTRO_SCENE, ...buildQueue()];
  queueIdx = 0;

  document.getElementById('seed-display').textContent = '';

  document.getElementById('endscreen').style.display = 'none';
  document.getElementById('main').style.display = 'grid';
  document.getElementById('stats-bar').style.display = 'grid';
  document.getElementById('stakeholders').style.display = 'grid';
  document.getElementById('progress-bar').style.display = 'flex';
  document.getElementById('event-alert').style.display = 'none';
  document.getElementById('rand-event').style.display = 'none';

  buildProgressBar();
  updateStats(); renderTeam(); renderThreats(); renderSidebar(); renderMetrics();
  startAmbient();
  playScene();
}

function buildProgressBar() {
  updateProgressBarInfinite();
}

function updateProgressBarInfinite() {
  const bar = document.getElementById('progress-bar');
  bar.innerHTML = '';
  // Show "infinity" indicator with current year/cycle
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;font-size:11px;';
  wrapper.innerHTML = `
    <span style="color:var(--cyan);font-family:'Orbitron',monospace;letter-spacing:2px;">AÑO ${G.year||1}</span>
    <span style="color:var(--muted);">·</span>
    <span style="color:var(--purple);font-family:'Orbitron',monospace;">MES ${((G.totalMonths||0)%12)+1}</span>
    <span style="color:var(--muted);">·</span>
    <span style="color:var(--green);font-family:'Orbitron',monospace;">DECISIONES: ${G.decisionsCount||0}</span>
    <span style="color:var(--muted);">·</span>
    <span style="color:var(--yellow);font-family:'Orbitron',monospace;">CICLO ${G.cycle||1}</span>
    <span style="color:var(--muted);margin-left:auto;letter-spacing:2px;">MODO INFINITO ∞</span>
    <button onclick="retireCISO()" style="background:transparent;border:1px solid var(--border);color:var(--muted);font-family:'Share Tech Mono',monospace;font-size:9px;padding:3px 8px;border-radius:2px;cursor:pointer;letter-spacing:1px;" onmouseover="this.style.borderColor='var(--orange)';this.style.color='var(--orange)';" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--muted)';">⚑ RETIRARSE</button>
  `;
  bar.appendChild(wrapper);
}

function retireCISO() {
  if (confirm('¿Retirarte como CISO? Tu legado será evaluado con los datos actuales.')) {
    sfxClick();
    showEnding();
  }
}

function updateProgress() {
  // Year ticks every 6 decisions; cycle ticks every full pass through ALL_SCENES
  const prevYear  = G.year  || 1;
  const prevCycle = G.cycle || 1;
  G.year  = Math.floor(G.decisionsCount / 6) + 1;
  G.cycle = Math.floor(G.decisionsCount / ALL_SCENES.length) + 1;
  if (G.year > prevYear) G.pendingAnnualBudget = G.year;
  // Cycle completion: +5% to threat multiplier (entorno más hostil)
  if (G.cycle > prevCycle) {
    G.threatMult = Math.min(3.0, Math.round((G.threatMult + 0.05) * 100) / 100);
    setTimeout(() => addLog(
      `🔄 CICLO ${G.cycle} COMPLETADO — El entorno cibernético escala. Multiplicador de exposición: ×${G.threatMult.toFixed(2)}`, 'warning'), 200);
  }
  updateProgressBarInfinite();
  // Mid-year compliance warning (at decision 3 of each year)
  if (G.decisionsCount % 6 === 3 && G.complianceWarnedYear !== G.year) {
    const required = G.year === 1 ? 1 : G.year === 2 ? 3 : 5;
    if (activePolicies().length < required) {
      G.complianceWarnedYear = G.year;
      setTimeout(() => addLog(
        `⚠ AVISO REGULATORIO — Año ${G.year}: tienes ${activePolicies().length}/${required} políticas requeridas. ` +
        `Implementa más antes del cierre del año o enfrentarás multas.`, 'warning'), 200);
    }
  }
}

function checkComplianceAudit(year) {
  const required = year === 1 ? 1 : year === 2 ? 3 : 5;
  const have = activePolicies().length;
  if (have < required) {
    const fineMap = {1: 20000, 2: 40000};
    const fine    = fineMap[year] || 60000;
    const repHit  = year === 1 ? 5 : year === 2 ? 8 : 10;
    G.budget     = Math.max(0, G.budget - fine);
    G.reputation = Math.max(0, G.reputation - repHit);
    G.stakeholders.reg = Math.max(0, G.stakeholders.reg - 1);
    updateStats();
    sfxFail();
    addLog(
      `🏛 MULTA REGULATORIA AÑO ${year} — Solo tienes ${have}/${required} políticas requeridas. ` +
      `Multa: −${fmtNum(fine)} | Reputación −${repHit} | Regulador pierde confianza.`, 'danger');
  } else {
    addLog(
      `🏛 AUDITORÍA AÑO ${year} SUPERADA — ${have}/${required} políticas en regla. El regulador está conforme.`, 'success');
    G.stakeholders.reg = Math.min(5, G.stakeholders.reg + 1);
  }
}

function grantAnnualBudget(year) {
  // Compliance audit first
  checkComplianceAudit(year);
  checkTechAudit(year);

  // Warn about expired policies and tech
  const expPol  = G.policies.filter(p => !activePolicies().find(a=>a.id===p.id));
  const expTech = G.techStack.filter(t => !activeTechStack().find(a=>a.id===t.id));
  if (expPol.length  > 0) setTimeout(() => addLog(`⚠ POLÍTICAS VENCIDAS — ${expPol.map(p=>p.name).join(', ')}. Renúeva para mantener cobertura.`, 'warning'), 400);
  if (expTech.length > 0) setTimeout(() => addLog(`⚠ TECNOLOGÍAS VENCIDAS — ${expTech.map(t=>t.name).join(', ')}. Renueva las licencias.`, 'warning'), 500);

  // Passive threat creep & pressure escalation notification
  const threatCreep = (year - 1) * 3;
  if (threatCreep > 0) {
    G.threatBase = Math.min(150, G.threatBase + threatCreep);
    const yp = yearPressure();
    const pressurePct = Math.round((yp - 1) * 100);
    setTimeout(() => addLog(
      `⚡ ESCALADA AÑO ${year} — Exposición ambiental +${threatCreep} pts. ` +
      `Presión económica: +${pressurePct}% en costos y daños de decisiones este año.`, 'warning'), 300);
  }

  // Efficiency bonus: leftover budget converts to reputation (each $50K = +1 rep, cap +5)
  const leftover = Math.max(0, G.budget);
  const effBonus = Math.min(5, Math.floor(leftover / 50000));

  // Part B: scale budget by reputation
  let repMult = 1.0;
  let repNote = '';
  if      (G.reputation < 20) { repMult = 0.40; repNote = `Reputación crítica (${G.reputation}) → solo 40% aprobado por el board.`; }
  else if (G.reputation < 40) { repMult = 0.60; repNote = `Reputación baja (${G.reputation}) → solo 60% aprobado por el board.`; }
  else if (G.reputation < 60) { repMult = 0.80; repNote = `Reputación moderada (${G.reputation}) → 80% aprobado por el board.`; }

  G.budget = Math.round(G.maxBudget * repMult);
  // Reset threshold cuts so they can fire again in new year
  G.repCutFired = [];

  // Salary deductions for hired team members (beyond base roster)
  const hiredMembers = G.team.filter(m => m.salary && m.salary > 0);
  const totalSalaries = hiredMembers.reduce((sum, m) => sum + m.salary, 0);
  if (totalSalaries > 0) {
    G.budget = Math.max(0, G.budget - totalSalaries);
    addLog(`👥 NÓMINA — ${hiredMembers.map(m=>m.name).join(', ')}: −${fmtNum(totalSalaries)}/año descontados del presupuesto.`, 'warning');
  }

  if (effBonus > 0) G.reputation = Math.min(100, G.reputation + effBonus);

  updateStats();
  sfxSuccess();

  const effMsg = effBonus > 0
    ? ` El CFO reconoció tu eficiencia: +${effBonus} reputación por ${fmtNum(leftover)} no gastados.`
    : '';
  const penaltyMsg = repNote ? ` ⚠ ${repNote}` : '';
  addLog(`💰 PRESUPUESTO AÑO ${year} RENOVADO — Asignado: ${fmtNum(G.budget)}.${penaltyMsg}${effMsg}`, repMult < 1 ? 'warning' : 'success');

  // Show toast
  const box = document.getElementById('rand-event');
  document.getElementById('re-icon').textContent = '💰';
  const borderCol = repMult < 1 ? 'var(--orange)' : 'var(--yellow)';
  const bgCol     = repMult < 1 ? 'rgba(255,150,0,.08)' : 'rgba(255,215,0,.08)';
  document.getElementById('re-text').innerHTML =
    `<strong style="color:${borderCol}">PRESUPUESTO AÑO ${year} RENOVADO</strong> — Asignado: ${fmtNum(G.budget)}` +
    (repNote ? `<br><span style="color:var(--orange)">⚠ ${repNote}</span>` : '') +
    (effMsg  ? `<br><span style="color:var(--green)">${effMsg}</span>` : '');
  const btnsDiv = document.getElementById('re-btns');
  if (btnsDiv) btnsDiv.innerHTML = '';
  box.style.borderColor = borderCol;
  box.style.background  = bgCol;
  box.style.display = 'flex';
  setTimeout(() => {
    box.style.display = 'none';
    box.style.borderColor = '';
    box.style.background  = '';
  }, 4500);
}

// =====================================================================
// RANDOM EVENT between scenes
// =====================================================================
function showEventScenario(ev, callback, mitigation) {
  const box = document.getElementById('rand-event');
  box.style.display = 'none';
  document.getElementById('scene-icon').textContent = ev.icon;
  document.getElementById('scene-title').textContent = 'EVENTO INESPERADO';
  document.getElementById('scene-day').textContent = 'INTERRUPCIÓN';

  const tb = document.getElementById('turn-badge'); tb.style.display = 'none';
  document.getElementById('event-alert').style.display = 'none';
  clearLog();
  typewriteLog(ev.text, 'scene', () => {
    if (mitigation) addLog('🛡 POSTURA ACTIVA — ' + mitigation, 'success');
    addLog('──────────────────────────────────────', 'system');
    const div = document.getElementById('choices-area');
    div.innerHTML = '';
    ev.choices.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      let inner = c.text;
      if (c.cost) inner += '<span class="cost-tag ' + (c.cost.startsWith('$') || c.cost.startsWith('~') ? 'cost-money' : 'cost-risk') + '">' + c.cost + '</span>';
      if (mitigation) inner += '<span style="font-size:8px;color:var(--green2);margin-left:6px;">🛡−70%</span>';
      btn.innerHTML = inner;
      btn.onclick = () => {
        sfxClick();
        document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
        const raw = mitigation ? mitigateFx(c.fx) : c.fx;
        const sfx = scaledFx(raw);
        applyFx(sfx);
        addLog('◆ ' + c.text, 'system');
        addLog(c.result, c.log || 'result');
        const deltas = [];
        if (sfx.budget     !== undefined) deltas.push('Presupuesto ' + (sfx.budget>=0?'+':'') + fmtNum(sfx.budget) + ' → ' + fmtBudget());
        if (sfx.reputation !== undefined) deltas.push('Reputación ' + (sfx.reputation>=0?'+':'') + sfx.reputation + ' → ' + G.reputation);
        if (sfx.threat     !== undefined) deltas.push('Exposición ' + (sfx.threat>=0?'+':'') + sfx.threat + ' → ' + G.threat);
        if (deltas.length) addLog('[ ' + deltas.join(' | ') + ' ]', 'system');
        if (c.log === 'success') { sfxSuccess(); flashBody('green'); }
        else if (c.log === 'danger') { sfxFail(); flashBody('red'); }
        updateStats(); renderTeam(); renderSidebar(); renderMetrics();

        setTimeout(() => {
          div.innerHTML = '';
          const contBtn = document.createElement('button');
          contBtn.className = 'choice-btn';
          contBtn.style.borderColor = 'var(--green2)'; contBtn.style.color = 'var(--green)';
          contBtn.innerHTML = 'Continuar &rarr; <span style="color:var(--muted);font-size:9px">Siguiente escenario</span>';
          contBtn.onclick = () => {
            sfxClick(); contBtn.disabled = true;
            contBtn.innerHTML = '<span style="color:var(--cyan);font-size:11px;letter-spacing:2px;">CARGANDO ESCENARIO...</span>';
            setTimeout(() => callback(), 700);
          };
          div.appendChild(contBtn);
        }, 900);
      };
      div.appendChild(btn);
    });
  });
}

function maybeFireRandomEvent(callback) {
  if (queueIdx === 0 || Math.random() > 0.45) { callback(); return; }

  // Eventos positivos gateados (hasPolicy/hasTech): sólo aparecen si tienes el prerequisito
  function isEligible(ev) {
    const c = ev.condition;
    if (!c) return true;
    const activePol  = new Set((activePolicies()  || []).map(p => p.id));
    const activeTech = new Set((activeTechStack() || []).map(t => t.id));
    if (c.hasPolicy && !activePol.has(c.hasPolicy))  return false;
    if (c.hasTech   && !activeTech.has(c.hasTech))   return false;
    return true;
  }

  // Detecta si la postura actual MITIGA el impacto del evento (Modelo B)
  function checkMitigation(ev) {
    const c = ev.condition;
    if (!c) return null;
    const activePol  = new Set((activePolicies()  || []).map(p => p.id));
    const activeTech = new Set((activeTechStack() || []).map(t => t.id));
    if (c.missingPolicy && activePol.has(c.missingPolicy)) {
      const cat = POLICY_CATALOG.find(p => p.id === c.missingPolicy);
      return `${cat ? cat.name : c.missingPolicy} activa — impacto reducido al 30%`;
    }
    if (c.missingTech && activeTech.has(c.missingTech)) {
      const cat = TECH_CATALOG.find(t => t.id === c.missingTech);
      return `${cat ? cat.name : c.missingTech} activo — impacto reducido al 30%`;
    }
    if (c.threatAbove !== undefined && G.threat <= c.threatAbove) {
      return `Exposición controlada (${G.threat}/100) — impacto reducido al 30%`;
    }
    return null;
  }

  const eligible = RANDOM_EVENTS.filter(isEligible);
  const pool     = eligible.length > 0 ? eligible : RANDOM_EVENTS;
  const ev = pool[Math.floor(Math.random() * pool.length)];
  const mitigation = checkMitigation(ev);

  G.randEventsCount++;
  const box = document.getElementById('rand-event');
  if (mitigation) {
    box.style.borderColor = 'var(--green2)';
    box.style.background  = 'rgba(0,200,100,.04)';
  } else {
    box.style.borderColor = '';
    box.style.background  = '';
  }
  document.getElementById('re-icon').textContent = ev.icon;
  const mitBanner = mitigation
    ? `<div style="font-size:9px;color:var(--green2);margin-bottom:4px;">🛡 ${mitigation}</div>`
    : '';
  document.getElementById('re-text').innerHTML = mitBanner + '<strong>EVENTO ALEATORIO:</strong> ' + ev.text;

  const btnsDiv = document.getElementById('re-btns');
  btnsDiv.innerHTML = '';

  // Botón "Atender ahora"
  const btnAttend = document.createElement('button');
  btnAttend.className = 'choice-btn';
  btnAttend.style.cssText = 'font-size:10px;padding:5px 12px;border-color:var(--purple);color:var(--purple);';
  btnAttend.textContent = '⚡ Atender ahora';
  btnAttend.onclick = () => {
    sfxClick();
    if (ev.choices && ev.choices.length > 0) {
      showEventScenario(ev, callback, mitigation);
    } else {
      const raw = mitigation ? mitigateFx(ev.fx) : ev.fx;
      const sfx = scaledFx(raw);
      applyFx(sfx);
      const deltas = [];
      if (sfx.budget     !== undefined) deltas.push('Presupuesto ' + (sfx.budget>=0?'+':'') + fmtNum(sfx.budget) + ' → ' + fmtBudget());
      if (sfx.reputation !== undefined) deltas.push('Reputación ' + (sfx.reputation>=0?'+':'') + sfx.reputation + ' → ' + G.reputation);
      if (sfx.threat     !== undefined) deltas.push('Exposición ' + (sfx.threat>=0?'+':'') + sfx.threat + ' → ' + G.threat);
      addLog(ev.icon + ' EVENTO ATENDIDO: ' + ev.text, ev.log || 'warning');
      if (deltas.length) addLog('[ ' + deltas.join(' | ') + ' ]', 'system');
      updateStats(); renderMetrics();
      box.style.display = 'none';
      callback();
    }
  };

  // Botón "Ignorar"
  const btnIgnore = document.createElement('button');
  btnIgnore.className = 'choice-btn';
  btnIgnore.style.cssText = 'font-size:10px;padding:5px 12px;border-color:var(--muted);color:var(--muted);';
  btnIgnore.textContent = '↷ Ignorar (reputación −5)';
  btnIgnore.onclick = () => {
    sfxClick();
    const ignFx = scaledFx({reputation: -5});
    applyFx(ignFx);
    addLog(ev.icon + ` EVENTO IGNORADO — Reputación ${ignFx.reputation} → ${G.reputation}. Continúas sin atenderlo.`, 'warning');
    updateStats(); renderMetrics();
    box.style.display = 'none';
    callback();
  };

  btnsDiv.appendChild(btnAttend);
  btnsDiv.appendChild(btnIgnore);
  box.style.display = 'flex';
  sfxBeep();
}

// =====================================================================
// SCENE ENGINE
// =====================================================================
function playScene() {
  maybeFireRandomEvent(() => {
    // INFINITE MODE: refill queue when running low
    if (queueIdx >= playQueue.length - 2) {
      refillQueue();
    }
    if (queueIdx >= playQueue.length) { showEnding(); return; }
    const scene = playQueue[queueIdx];
    G.day = G.decisionsCount * 14 + 1;

    document.getElementById('scene-icon').textContent = scene.icon;
    document.getElementById('scene-title').textContent = scene.title;
    document.getElementById('scene-day').textContent = 'DÍA ' + G.day;

    const tb = document.getElementById('turn-badge');
    if (scene.turnLabel) { tb.textContent = scene.turnLabel; tb.style.display='inline'; }
    else tb.style.display='none';

    const ea = document.getElementById('event-alert');
    if (scene.isEvent) {
      ea.style.display = 'flex';
      document.getElementById('alert-text').textContent =
        'INCIDENTE ACTIVO — ' + scene.title.replace(/^[^—]+—\s*/,'');
      sfxAlert();
      flashBody('red');
    } else {
      ea.style.display = 'none';
      sfxBeep();
    }

    clearLog();

    // Show chained consequence if applicable
    const chainKey = G.lastSceneId + '_' + G.lastSceneLog;
    if (CHAIN_EFFECTS[chainKey]) {
      addLog('⛓ CONSECUENCIA ANTERIOR: ' + CHAIN_EFFECTS[chainKey], 'chained');
    }

    typewriteLog(scene.text, 'scene', () => {
      addLog('──────────────────────────────────────', 'system');
      // Presupuesto anual pendiente
      if (G.pendingAnnualBudget) {
        grantAnnualBudget(G.pendingAnnualBudget);
        G.pendingAnnualBudget = null;
      }
      // Contexto de postura defensiva para escenas relevantes
      injectSceneContext(scene.id);
      // Timer solo en incidentes críticos (isEvent)
      if (scene.isEvent) startTimer(30, scene);
      else stopTimer();
      renderChoices(scene.choices, scene.isEvent);
    });

    updateProgress();
  });
}

// =====================================================================
// TYPEWRITER
// =====================================================================
function typewriteLog(text, type, callback) {
  const div = document.getElementById('log-area');
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  div.appendChild(entry);
  div.scrollTop = div.scrollHeight;

  // Strip HTML tags for typewriter, then reveal full
  let i = 0;
  const plain = text.replace(/<[^>]+>/g, '');
  const interval = setInterval(() => {
    if (i < plain.length) {
      if (i % 3 === 0) sfxType();
      i += Math.floor(Math.random()*3)+1;
      i = Math.min(i, plain.length);
      entry.textContent = plain.slice(0, i);
      div.scrollTop = div.scrollHeight;
    } else {
      clearInterval(interval);
      entry.innerHTML = text; // restore rich text
      div.scrollTop = div.scrollHeight;
      if (callback) callback();
    }
  }, 18);
}

// =====================================================================
// COUNTDOWN TIMER
// =====================================================================
function startTimer(seconds, scene) {
  timerSeconds = seconds;
  const bar = document.getElementById('timer-bar');
  const fill = document.getElementById('timer-fill');
  const disp = document.getElementById('timer-display');
  bar.style.display = 'block';
  disp.textContent = seconds + 's';
  fill.style.width = '100%';
  fill.style.background = 'var(--orange)';

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSeconds--;
    fill.style.width = (timerSeconds / seconds * 100) + '%';
    disp.textContent = timerSeconds + 's';
    if (timerSeconds <= 5) {
      fill.style.background = 'var(--red)';
      sfxTimer();
    }
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      // Auto-choose worst option
      timeoutChoice(scene);
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  document.getElementById('timer-bar').style.display = 'none';
  document.getElementById('timer-display').textContent = '';
}

function timeoutChoice(scene) {
  // Pick last (usually worst) choice
  const lastChoice = scene.choices[scene.choices.length - 1];
  addLog('⏱ TIEMPO AGOTADO — Decisión automática tomada por inacción.', 'danger');
  sfxFail();
  makeChoiceCore({...lastChoice, result:'TIEMPO AGOTADO: ' + lastChoice.result, fx:{...lastChoice.fx, reputation:-5}});
}

// =====================================================================
// TASK MANAGEMENT SYSTEM — Capacidad de equipo por meses
// =====================================================================
function startTask(itemName, icon, slotDefs, months, isRenewal, itemId) {
  if (!G.tasks) G.tasks = [];
  if (isRenewal) {
    months = Math.max(1, Math.round(months * 0.4));
    slotDefs = [slotDefs[0]].filter(Boolean);
  }

  // Especialistas para este item
  const expertIdxs = itemId ? G.team.reduce((acc, m, i) => {
    if (m.status !== 'down' && (m.expertise || []).includes(itemId)) acc.push(i);
    return acc;
  }, []) : [];

  // Función de score dual: qué tan bien cubre un miembro el slot (tech+mgmt)
  function scoreFor(m, i, slot) {
    if (m.status === 'down') return -Infinity;
    if (!slot) return -Infinity;
    const freeTech = Math.max(0, (m.tech || 0) - (m.techLoad || 0));
    const freeMgmt = Math.max(0, (m.mgmt || 0) - (m.mgmtLoad || 0));
    const needTech  = slot.tech || 0;
    const needMgmt  = slot.mgmt || 0;
    // Cobertura mínima de ambas dimensiones (bottleneck)
    const coverT = needTech > 0 ? freeTech / needTech : 1;
    const coverM = needMgmt > 0 ? freeMgmt / needMgmt : 1;
    let score = Math.min(coverT, coverM);
    if (expertIdxs.includes(i)) score += 0.3; // experto: mejor score
    return score;
  }

  const assigned = [];
  for (const slot of (slotDefs || [])) {
    let best = -1, bestScore = -Infinity;
    G.team.forEach((m, i) => {
      if (assigned.some(a => a.memberIdx === i)) return; // ya asignado
      const s = scoreFor(m, i, slot);
      if (s > bestScore) { best = i; bestScore = s; }
    });
    if (best >= 0) {
      const m      = G.team[best];
      const needT  = slot.tech || 0;
      const needM  = slot.mgmt || 0;
      const freeT  = Math.max(0, (m.tech || 0) - (m.techLoad || 0));
      const freeM  = Math.max(0, (m.mgmt || 0) - (m.mgmtLoad || 0));
      const overflow = (needT > freeT) || (needM > freeM);
      m.techLoad = (m.techLoad || 0) + needT;
      m.mgmtLoad = (m.mgmtLoad || 0) + needM;
      assigned.push({memberIdx: best, tech: needT, mgmt: needM,
        expert: expertIdxs.includes(best), overflow});
    }
  }

  const hasExpert  = assigned.some(a => a.expert);
  const hasOverflow = assigned.some(a => a.overflow) || assigned.length < (slotDefs||[]).length;
  let actualMonths = hasOverflow
    ? Math.ceil(months * 1.5)
    : months;
  if (hasExpert) actualMonths = Math.max(1, Math.ceil(actualMonths * 0.7));

  G.tasks.push({name: itemName, icon: icon || '📋', slots: assigned,
    monthsLeft: actualMonths, totalMonths: actualMonths});
  G.threat = computeExposure();

  if (assigned.length === 0) {
    addLog(`⚠ SIN RECURSOS — "${itemName}" en cola. ${actualMonths} mes${actualMonths>1?'es':''}  sin asignación.`, 'warning');
  } else {
    const detail = assigned.map(x => {
      const nm = G.team[x.memberIdx].name.split(' ')[0];
      return `${nm} T${x.tech}/M${x.mgmt}${x.expert?' ⚡':''}${x.overflow?' ⚠':''}`;
    }).join(', ');
    const note = hasExpert
      ? ` ⚡ especialista → ${actualMonths}m`
      : hasOverflow ? ` ⚠ overtime → ${actualMonths}m` : ` → ${actualMonths}m`;
    addLog(`📋 EN PROGRESO — "${itemName}" → ${detail}${note}.`, 'system');
  }
  updateStats(); renderTeam(); renderTasks();
}

function tickTasks() {
  if (!G.tasks || G.tasks.length === 0) return;
  const completed = [];
  G.tasks = G.tasks.filter(task => {
    task.monthsLeft--;
    if (task.monthsLeft <= 0) { completed.push(task); return false; }
    return true;
  });
  completed.forEach(task => {
    task.slots.forEach(({memberIdx, tech, mgmt}) => {
      const m = G.team[memberIdx];
      if (m) {
        m.techLoad = Math.max(0, (m.techLoad || 0) - (tech || 0));
        m.mgmtLoad = Math.max(0, (m.mgmtLoad || 0) - (mgmt || 0));
      }
    });
    const names = task.slots.map(s => G.team[s.memberIdx]?.name?.split(' ')[0]).filter(Boolean).join(', ');
    setTimeout(() => {
      addLog(`✅ IMPLEMENTADO — "${task.name}" completado.${names ? ' ' + names + ' disponibles.' : ''}`, 'success');
      sfxSuccess();
    }, 50);
  });
  if (completed.length > 0) {
    G.threat = computeExposure();
    updateStats(); renderTeam(); renderTasks();
  }
}

function renderTasks() {
  const card = document.getElementById('tasks-card');
  const list = document.getElementById('tasks-list');
  if (!list) return;
  if (!G.tasks || G.tasks.length === 0) {
    if (card) card.style.display = 'none';
    return;
  }
  if (card) card.style.display = 'block';
  list.innerHTML = G.tasks.map(task => {
    const pct = Math.round((1 - task.monthsLeft / task.totalMonths) * 100);
    const assignees = task.slots
      .map(s => G.team[s.memberIdx]
        ? `${G.team[s.memberIdx].name.split(' ')[0]} T${s.tech||0}/M${s.mgmt||0}${s.expert?' ⚡':''}${s.overflow?' ⚠':''}` : null)
      .filter(Boolean).join(' · ');
    return `
      <div class="task-item">
        <div class="task-hdr">
          <span class="task-nm">${task.icon} ${task.name}</span>
          <span class="task-mo">${task.monthsLeft}m</span>
        </div>
        <div class="task-bar-bg"><div class="task-bar-fill" style="width:${pct}%"></div></div>
        <div class="task-asn">${assignees || '<span style="color:var(--orange)">⚠ sin asignar</span>'}</div>
      </div>`;
  }).join('');
}

// =====================================================================
// SCENE CONTEXT INJECTOR — Muestra postura defensiva relevante por escena
// =====================================================================
function injectSceneContext(sceneId) {
  const pol  = activePolicies();
  const tech = activeTechStack();
  const has  = id => tech.some(t => t.id === id);
  const hasPol = id => pol.some(p => p.id === id);

  const ctx = {
    compliance_audit: () => {
      const n = pol.length;
      const needed = G.year <= 1 ? 2 : G.year <= 2 ? 4 : 6;
      const icon = n >= needed ? '✅' : '⚠';
      addLog(`${icon} POSTURA ACTUAL: ${n} política(s) activa(s) — la auditoría esperaría ≥${needed} para este año.`, n >= needed ? 'success' : 'warning');
    },
    pentest_results: () => {
      const tools = [has('siem')&&'SIEM', has('edr')&&'EDR', has('vuln_scan')&&'Vuln Scanner'].filter(Boolean);
      if (tools.length) addLog(`✅ POSTURA ACTUAL: Herramientas activas — ${tools.join(', ')}. Podrás remediar con mayor velocidad.`, 'success');
      else addLog('⚠ POSTURA ACTUAL: Sin SIEM, EDR ni Vuln Scanner. La remediación será más lenta y costosa.', 'warning');
    },
    phishing_mass: () => {
      if (hasPol('mfa')) addLog('✅ POSTURA ACTUAL: Política MFA activa — forzar MFA al 100% será inmediato.', 'success');
      else addLog('⚠ POSTURA ACTUAL: Sin política MFA — implementarla ahora tomará más tiempo y presupuesto.', 'warning');
      if (hasPol('phishing')) addLog('✅ Tienes programa de concienciación anti-phishing activo.', 'success');
    },
    gdpr_breach: () => {
      const guards = [hasPol('encrypt')&&'Cifrado', hasPol('dlp')&&'DLP'].filter(Boolean);
      if (guards.length) addLog(`✅ POSTURA ACTUAL: ${guards.join(' + ')} activos — los datos comprometidos podrían estar protegidos.`, 'success');
      else addLog('⚠ POSTURA ACTUAL: Sin cifrado ni DLP — asume que los datos del breach están en claro.', 'warning');
    },
    siem_upgrade: () => {
      if (has('siem')) addLog('✅ POSTURA ACTUAL: SIEM instalado. Puedes tunar las reglas existentes (opción 2 disponible).', 'success');
      else addLog('⚠ POSTURA ACTUAL: Sin SIEM instalado. La opción de "tunar reglas" no aplica aún.', 'warning');
    },
    board_presentation: () => {
      const score = pol.length * 10 + tech.length * 12;
      const grade = score >= 80 ? '💪 Sólida' : score >= 40 ? '📊 Moderada' : '🔴 Débil';
      addLog(`${grade}: ${pol.length} políticas + ${tech.length} tecnologías activas. Esto respaldará tus argumentos.`, score >= 40 ? 'success' : 'warning');
    },
    ransomware_hit: () => {
      if (has('backup_dr')) addLog('✅ POSTURA ACTUAL: Tienes Backup & DR activo — la recuperación sin pagar es viable.', 'success');
      else addLog('🔴 POSTURA ACTUAL: Sin Backup & DR. Si no pagas, perderás datos permanentemente.', 'warning');
    },
  };

  if (ctx[sceneId]) ctx[sceneId]();
}

// =====================================================================
// CHOICE RENDERING & HANDLING
// =====================================================================
function renderChoices(choices, timed) {
  const div = document.getElementById('choices-area');
  div.innerHTML = '';
  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn' + (timed ? ' timed' : '');
    let inner = c.text;
    if (c.cost) inner += '<span class="cost-tag ' +
      (c.cost.startsWith('$')||c.cost.startsWith('~') ? 'cost-money' : 'cost-risk') +
      '">' + c.cost + '</span>';
    btn.innerHTML = inner;
    btn.onclick = () => { sfxClick(); stopTimer(); makeChoice(c); };
    div.appendChild(btn);
  });
}

function makeChoice(choice) {
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true);
  makeChoiceCore(choice);
}

// Presión creciente por año: 1.0× año1 → +15% por año, cap 1.75×
function yearPressure() {
  return Math.min(1.75, 1.0 + (G.year - 1) * 0.15);
}

// Escala los efectos negativos (costos, daños) y amenazas positivas por yearPressure
// Los beneficios (presupuesto+, reputación+) NO se escalan → las victorias mantienen su valor
// Exposición = presión externa (threatBase) - defensas activas
function computeExposure() {
  if (!G || G.threatBase === undefined) return 0;
  const polDef  = (typeof activePolicies  === 'function' ? activePolicies()  : []).length * 4;
  const techDef = (typeof activeTechStack === 'function' ? activeTechStack() : []).length * 5;
  const teamDef = (G.team || []).reduce((sum, m) => {
    if (m.status === 'down') return sum;
    const freeTech = Math.max(0, (m.tech || 0) - (m.techLoad || 0));
    const freeMgmt = Math.max(0, (m.mgmt || 0) - (m.mgmtLoad || 0));
    return sum + (freeTech + freeMgmt) / 55; // ~2 pts por miembro mid-level libre
  }, 0);
  const budRatio = G.maxBudget > 0 ? G.budget / G.maxBudget : 0;
  const budDef  = budRatio > 0.6 ? 8 : budRatio > 0.3 ? 4 : 0;
  return Math.min(100, Math.max(0, G.threatBase - polDef - techDef - teamDef - budDef));
}

function scaledFx(fx) {
  const p = yearPressure();
  const out = Object.assign({}, fx);
  if (out.budget     !== undefined && out.budget < 0)     out.budget     = Math.round(out.budget * p);
  if (out.reputation !== undefined && out.reputation < 0) out.reputation = Math.round(out.reputation * p);
  if (out.threat     !== undefined && out.threat > 0)     out.threat     = Math.round(out.threat * p);
  return out;
}

// Reduce efectos negativos al 30% cuando el jugador tiene cobertura (Modelo B)
function mitigateFx(fx) {
  if (!fx) return fx;
  const out = {};
  for (const [k, v] of Object.entries(fx)) {
    out[k] = (typeof v === 'number' && v < 0) ? Math.round(v * 0.3) : v;
  }
  return out;
}

function makeChoiceCore(choice) {
  G.decisionsCount++;
  G.lastSceneId = playQueue[queueIdx] ? playQueue[queueIdx].id : '';
  G.lastSceneLog = choice.log || 'result';

  const fx = scaledFx(choice.fx || {});
  // Apply difficulty multiplier to threat changes (on top of year pressure)
  if (fx.threat !== undefined) {
    fx.threat = Math.round(fx.threat * (fx.threat > 0 ? G.threatMult : 1));
  }

  const prevExposure = G.threat;
  applyFx(fx);

  // Team effects
  if (choice.removeTeam) {
    const m = G.team.find(t=>t.id===choice.removeTeam);
    if (m) m.status = 'down';
    G.incidentsFailed++;
  }
  if (choice.teamBusy) {
    const ids = Array.isArray(choice.teamBusy) ? choice.teamBusy : [choice.teamBusy];
    const slots = ids.map(id => {
      const idx = G.team.findIndex(t => t.id === id);
      if (idx >= 0 && G.team[idx].status !== 'down') {
        const m = G.team[idx];
        // Respuesta operativa: consume 50 tech + 30 mgmt
        m.techLoad = (m.techLoad || 0) + 50;
        m.mgmtLoad = (m.mgmtLoad || 0) + 30;
        return {memberIdx: idx, tech: 50, mgmt: 30};
      }
      return null;
    }).filter(Boolean);
    if (slots.length > 0) {
      if (!G.tasks) G.tasks = [];
      G.tasks.push({name:'Respuesta operativa', icon:'🔥', slots, monthsLeft:1, totalMonths:1});
      G.threat = computeExposure();
    }
  }
  if (choice.needsTeam) {
    const ids = Array.isArray(choice.needsTeam) ? choice.needsTeam : [choice.needsTeam];
    ids.forEach(id => {
      const m = G.team.find(t=>t.id===id);
      if (m && m.status==='down') {
        addLog('⚠ Miembro no disponible — penalización aplicada','warning');
        G.threatBase = Math.min(150, G.threatBase + 8); G.threat = computeExposure();
      }
    });
  }
  // Defenses compromised by attack
  if (choice.removeTech) {
    const ids = Array.isArray(choice.removeTech) ? choice.removeTech : [choice.removeTech];
    ids.forEach(id => {
      const idx = G.techStack.findIndex(t => t.id === id);
      if (idx >= 0) {
        const name = G.techStack[idx].name;
        G.techStack.splice(idx, 1);
        G.threat = computeExposure();
        addLog(`💥 TECNOLOGÍA COMPROMETIDA — "${name}" quedó fuera de servicio. Tu exposición aumentó.`, 'danger');
      }
    });
  }
  if (choice.removePolicy) {
    const ids = Array.isArray(choice.removePolicy) ? choice.removePolicy : [choice.removePolicy];
    ids.forEach(id => {
      const idx = G.policies.findIndex(p => p.id === id);
      if (idx >= 0) {
        const name = G.policies[idx].name;
        G.policies.splice(idx, 1);
        G.threat = computeExposure();
        addLog(`💥 POLÍTICA INVALIDADA — "${name}" dejó de ser efectiva. Tu exposición aumentó.`, 'danger');
      }
    });
  }

  if (choice.addTool && !G.tools.includes(choice.addTool)) G.tools.push(choice.addTool);
  if (choice.addPolicy && !G.policies.find(p=>p.name===choice.addPolicy))
    G.policies.push({id: choice.addPolicy.toLowerCase().replace(/[^a-z0-9]/g,'_'), name: choice.addPolicy, year: G.year});
  if (choice.requiresTech) {
    const ids = Array.isArray(choice.requiresTech) ? choice.requiresTech : [choice.requiresTech];
    const activeIds = new Set(activeTechStack().map(t=>t.id));
    const missing = ids.filter(id => !activeIds.has(id));
    if (missing.length > 0) {
      const names = missing.map(id => TECH_CATALOG.find(t=>t.id===id)?.name || id);
      applyFx({threat:+12, reputation:-6});
      addLog(`⚠ TECNOLOGÍA AUSENTE — Sin ${names.join(', ')}. Penalización: Exposición +12 | Rep −6`, 'danger');
      updateStats();
    }
  }
  if (choice.addTeam && !G.team.find(t=>t.id===choice.addTeam.id)) G.team.push({...choice.addTeam,status:'ok'});

  // Stakeholder effects
  updateStakeholders(choice);

  // Track metrics
  if (choice.log === 'success') { G.incidentsHandled++; sfxSuccess(); flashBody('green'); }
  else if (choice.log === 'danger') { G.incidentsFailed++; sfxFail(); flashBody('red'); }

  const resultText = typeof choice.result === 'function' ? choice.result(G) : choice.result;
  addLog('◆ ' + choice.text, 'system');
  addLog(resultText, choice.log || 'result');

  const deltas = [];
  if (fx.budget     !== undefined) deltas.push('Presupuesto ' + (fx.budget>=0?'+':'') + fmtNum(fx.budget) + ' → ' + fmtBudget());
  if (fx.reputation !== undefined) deltas.push('Reputación ' + (fx.reputation>=0?'+':'') + fx.reputation + ' → ' + G.reputation);
  if (fx.threat !== undefined) { const d = G.threat - prevExposure; if (d !== 0) deltas.push('Exposición ' + (d>=0?'+':'') + d + ' → ' + G.threat); }
  if (deltas.length) addLog('[ ' + deltas.join(' | ') + ' ]', 'system');

  // Tick meses (1 mes = 2 decisiones)
  const prevMonths = G.totalMonths || 0;
  G.totalMonths = Math.floor(G.decisionsCount / 2);
  if (G.totalMonths > prevMonths) tickTasks();

  updateStats(); renderTeam(); renderThreats(); renderSidebar(); renderMetrics();

  // Show AI analysis button

  if (G.budget <= 0)     { setTimeout(()=>showGameOver('bancarrota'),1400); return; }
  if (G.reputation <= 0) { setTimeout(()=>showGameOver('despedido'),1400);  return; }
  if (G.threat >= 100)   { setTimeout(()=>showGameOver('brecha'),1400);     return; }
  if (choice.isEnding)   { setTimeout(()=>showEnding(),1600); return; }

  queueIdx++;
  setTimeout(() => {

    const div = document.getElementById('choices-area');
    div.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.style.borderColor = 'var(--green2)'; btn.style.color = 'var(--green)';
    btn.innerHTML = 'Continuar &rarr; <span style="color:var(--muted);font-size:9px">Siguiente escenario</span>';
    btn.onclick = () => {
      sfxClick();
      btn.disabled = true;
      btn.innerHTML = '';
      btn.style.cssText += 'border-color:var(--cyan);cursor:default;display:flex;align-items:center;gap:10px;';
      if (!document.getElementById('ldot-style')) {
        const s = document.createElement('style');
        s.id = 'ldot-style';
        s.textContent = '@keyframes ldot{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.3)}}';
        document.head.appendChild(s);
      }
      btn.innerHTML = `
        <span style="display:flex;gap:5px;align-items:center;">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--cyan);display:inline-block;animation:ldot .7s ease-in-out 0s infinite;"></span>
          <span style="width:6px;height:6px;border-radius:50%;background:var(--cyan);display:inline-block;animation:ldot .7s ease-in-out .18s infinite;"></span>
          <span style="width:6px;height:6px;border-radius:50%;background:var(--cyan);display:inline-block;animation:ldot .7s ease-in-out .36s infinite;"></span>
        </span>
        <span style="color:var(--cyan);font-size:11px;letter-spacing:2px;">CARGANDO ESCENARIO...</span>
      `;
      setTimeout(() => playScene(), 700);
    };
    div.appendChild(btn);
  }, 900);
}

function applyFx(fx) {
  if (fx.budget     !== undefined) G.budget     = Math.max(0, G.budget + fx.budget);
  if (fx.reputation !== undefined) G.reputation = Math.min(100, Math.max(0, G.reputation + fx.reputation));
  if (fx.threat     !== undefined) G.threatBase = Math.min(150, Math.max(0, G.threatBase + fx.threat));
  G.threat = computeExposure();
  checkReputationCut();
}

function checkReputationCut() {
  const cuts = [
    { threshold: 30, pct: 0.15, label: '15%' },
    { threshold: 15, pct: 0.25, label: '25%' },
  ];
  cuts.forEach(({ threshold, pct, label }) => {
    if (G.reputation <= threshold && !G.repCutFired.includes(threshold)) {
      G.repCutFired.push(threshold);
      const cut = Math.round(G.budget * pct);
      G.budget = Math.max(0, G.budget - cut);
      // Update CFO trust
      G.stakeholders.cfo = Math.max(0, G.stakeholders.cfo - 1);
      sfxFail();
      addLog(`✂️ RECORTE PRESUPUESTARIO — Reputación en ${G.reputation}. El CFO recorta ${label} del presupuesto. −${fmtNum(cut)} operativos.`, 'danger');
      updateStats();
      // Show toast with red border
      const box = document.getElementById('rand-event');
      document.getElementById('re-icon').textContent = '✂️';
      document.getElementById('re-text').innerHTML =
        `<strong style="color:var(--red)">RECORTE PRESUPUESTARIO</strong> — Tu reputación cayó a ${G.reputation}. El CFO recortó −${label} del presupuesto operativo. Disponible: ${fmtNum(G.budget)}.`;
      const btnsDiv = document.getElementById('re-btns');
      if (btnsDiv) btnsDiv.innerHTML = '';
      box.style.borderColor = 'var(--red)';
      box.style.background = 'rgba(255,50,50,.08)';
      box.style.display = 'flex';
      setTimeout(() => {
        box.style.display = 'none';
        box.style.borderColor = '';
        box.style.background = '';
      }, 4500);
    }
  });
}

function updateStakeholders(choice) {
  const sh = G.stakeholders;
  const log = choice.log || 'result';
  const text = choice.text.toLowerCase();
  // CEO cares about reputation and business continuity
  if (log==='success') sh.ceo = Math.min(5, sh.ceo+1);
  if (log==='danger')  sh.ceo = Math.max(0, sh.ceo-1);
  // CFO cares about budget
  const fx = choice.fx || {};
  if (fx.budget < -50000) sh.cfo = Math.max(0, sh.cfo-1);
  if (fx.budget > 30000)  sh.cfo = Math.min(5, sh.cfo+1);
  // Regulator cares about compliance
  if (text.includes('regulador')||text.includes('legal')||text.includes('notificar'))
    sh.reg = Math.min(5, sh.reg+1);
  if (log==='danger' && (text.includes('ignorar')||text.includes('esperar')))
    sh.reg = Math.max(0, sh.reg-1);
  // Team cares about support
  if (choice.addTeam || (choice.addPolicy&&choice.addPolicy.includes('Balance')))
    sh.team = Math.min(5, sh.team+1);
  if (choice.removeTeam) sh.team = Math.max(0, sh.team-2);
}


// =====================================================================
// UI RENDERS
// =====================================================================
function clearLog() { document.getElementById('log-area').innerHTML = ''; }

function addLog(text, type) {
  const div = document.getElementById('log-area');
  const e = document.createElement('div');
  e.className = 'log-entry ' + (type||'scene');
  e.innerHTML = text;
  div.appendChild(e);
  div.scrollTop = div.scrollHeight;
}

function fmtBudget() {
  const b = G.budget||0;
  if (Math.abs(b)>=1000000) return '$'+(b/1000000).toFixed(2)+'M';
  if (Math.abs(b)>=1000)    return '$'+Math.floor(b/1000)+'K';
  return '$'+b;
}
function fmtNum(n) {
  if (Math.abs(n)>=1000) return '$'+Math.floor(n/1000)+'K';
  return String(n);
}

function updateStats() {
  G.threat = computeExposure();
  document.getElementById('sv-budget').textContent = fmtBudget();
  document.getElementById('sv-rep').textContent    = G.reputation;
  const active = G.team.filter(m=>m.status!=='down').length;
  document.getElementById('sv-team').textContent   = active+'/'+G.team.length;

  const tl = ['MUY BAJO','BAJO','MODERADO','ALTO','CRÍTICO'];
  const ti = Math.min(4, Math.floor(G.threat/21));
  const el = document.getElementById('sv-threat');
  el.textContent = tl[ti];
  el.style.color = G.threat>75?'var(--critical)':G.threat>50?'var(--red)':G.threat>30?'var(--orange)':'var(--green)';

  document.getElementById('sb-budget').style.width = Math.min(100,G.budget/G.maxBudget*100)+'%';
  document.getElementById('sb-rep').style.width    = G.reputation+'%';
  document.getElementById('sb-team').style.width   = (active/G.team.length*100)+'%';
  const sb = document.getElementById('sb-threat');
  sb.style.width = G.threat+'%';
  sb.style.background = G.threat>75?'var(--critical)':G.threat>50?'var(--red)':G.threat>30?'var(--orange)':'var(--green)';

  // Stakeholders
  ['ceo','cfo','reg','team'].forEach(k => {
    const el = document.getElementById('sh-'+k);
    el.innerHTML = '';
    for (let i=0;i<5;i++) {
      const d = document.createElement('div');
      const v = G.stakeholders[k];
      d.className = 'sh-dot' + (i<v ? (v>=4?' filled':v>=2?' warn':' crit') : '');
      el.appendChild(d);
    }
  });
}

// =====================================================================
// POLICY SHOP
// =====================================================================

// Policies/tech with no catalog entry (narrative addPolicy) get expiresAfter:99 (never expire)
function activePolicies() {
  return G.policies.filter(p => {
    const cat = POLICY_CATALOG.find(c => c.id === p.id);
    return G.year <= p.year + (cat ? cat.expiresAfter : 99);
  });
}
function activeTechStack() {
  return G.techStack.filter(t => {
    const cat = TECH_CATALOG.find(c => c.id === t.id);
    return G.year <= t.year + (cat ? cat.expiresAfter : 99);
  });
}

function _catalogShopRows(catalog, ownedArr, buyFn, nameColor) {
  const ownedMap = new Map(ownedArr.map(p => [p.id, p]));
  const activeFn = catalog === POLICY_CATALOG ? activePolicies : activeTechStack;
  const activeIds = new Set(activeFn().map(p => p.id));
  return catalog.map(p => {
    const ownedRec = ownedMap.get(p.id);
    const isOwned  = !!ownedRec;
    const isActive = activeIds.has(p.id);
    const isExpired = isOwned && !isActive;
    const expiresYear = ownedRec ? ownedRec.year + p.expiresAfter : null;
    const expiringSoon = isActive && expiresYear !== null && (expiresYear - G.year) <= 1;
    if (isActive && !expiringSoon) return null;
    const renewMult = catalog === POLICY_CATALOG ? 0.7 : 0.5;
    const cost = isExpired ? Math.round(p.cost * renewMult) : p.cost;
    const canAfford = G.budget >= cost;
    const fxText = Object.entries(p.fx).map(([k,v]) => {
      const lbl = k==='threat'?'Amenaza':k==='reputation'?'Reputaci\u00f3n':'Presupuesto';
      return lbl + ' ' + (v>0?'+':'') + v;
    }).join(' | ');
    const reqNote = p.reqYear > 0
      ? `<span style="font-size:9px;color:var(--orange);"> \u2022 Req a\u00f1o ${p.reqYear}+</span>` : '';
    let statusBadge = '', btnLabel = `\u2212${fmtNum(cost)}`,
        nc = canAfford ? `var(--${nameColor})` : 'var(--muted)',
        bc = canAfford ? 'var(--border)' : '#1a1a1a';
    if (isExpired) {
      statusBadge = `<span style="font-size:9px;color:var(--red);margin-left:5px;">\u25cf EXPIRADA</span>`;
      btnLabel = `RENOVAR \u2212${fmtNum(cost)}`;
      nc = canAfford ? 'var(--orange)' : 'var(--muted)'; bc = canAfford ? 'var(--orange)' : '#1a1a1a';
    } else if (expiringSoon) {
      statusBadge = `<span style="font-size:9px;color:var(--yellow);margin-left:5px;">\u26a0 EXPIRA A\u00d1O ${expiresYear}</span>`;
      btnLabel = `RENOVAR \u2212${fmtNum(cost)}`;
      nc = 'var(--yellow)'; bc = 'var(--yellow)';
    }
    return `<div class="ps-item${canAfford?'':' unaffordable'}" style="border-color:${bc};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="min-width:0;">
          <div class="ps-name" style="color:${nc}">${p.name}${statusBadge}${reqNote}</div>
          <div class="ps-desc">${p.desc}</div>
          <div class="ps-fx">${fxText}</div>
        </div>
        <button class="ps-buy" onclick="${buyFn}('${p.id}')" ${canAfford?'':'disabled'}
          style="border-color:${canAfford?bc:'var(--border)'};color:${canAfford?nc:'var(--muted)'};cursor:${canAfford?'pointer':'not-allowed'};">
          ${btnLabel}
        </button>
      </div>
    </div>`;
  }).filter(Boolean);
}

function showPolicyCatalog() {
  if (document.getElementById('main').style.display === 'none') return;
  document.getElementById('ps-budget').textContent = fmtBudget();
  const rows = _catalogShopRows(POLICY_CATALOG, G.policies, 'buyPolicy', 'green');
  const listDiv = document.getElementById('policy-catalog-list');
  listDiv.innerHTML = rows.length
    ? rows.join('')
    : '<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px;">\u2713 Todas las pol\u00edticas est\u00e1n activas y vigentes.</div>';
  document.getElementById('policy-shop-backdrop').style.display = 'block';
  document.getElementById('policy-shop').style.display = 'block';
}

function closePolicyCatalog() {
  document.getElementById('policy-shop').style.display = 'none';
  document.getElementById('policy-shop-backdrop').style.display = 'none';
}

function buyPolicy(id) {
  const p = POLICY_CATALOG.find(x => x.id === id);
  if (!p) return;
  const existing = G.policies.findIndex(x => x.id === id);
  const cost = existing >= 0 ? Math.round(p.cost * 0.7) : p.cost;
  if (G.budget < cost) return;
  sfxSuccess();
  const { threat: _pt, ...polRestFx } = p.fx || {};
  applyFx({budget: -cost, ...polRestFx});
  const rec = {id: p.id, name: p.name, year: G.year};
  if (existing >= 0) G.policies[existing] = rec; else G.policies.push(rec);
  const action = existing >= 0 ? 'RENOVADA' : 'IMPLEMENTADA';
  addLog(`\ud83d\udee1 POL\u00cdTICA ${action} \u2014 "${p.name}". Costo: \u2212${fmtNum(cost)}. Vigente hasta a\u00f1o ${G.year + p.expiresAfter}.`, 'success');
  if (p.taskLoad) startTask(p.name, '\ud83d\udee1', p.taskLoad.slots, p.taskLoad.months, existing >= 0, p.id);
  updateStats(); renderTeam(); renderSidebar(); renderMetrics();
  showPolicyCatalog();
}

// =====================================================================
// TECH SHOP
// =====================================================================
function showTechCatalog() {
  if (document.getElementById('main').style.display === 'none') return;
  document.getElementById('ts-budget').textContent = fmtBudget();
  const rows = _catalogShopRows(TECH_CATALOG, G.techStack, 'buyTech', 'cyan');
  const listDiv = document.getElementById('tech-catalog-list');
  listDiv.innerHTML = rows.length
    ? rows.join('')
    : '<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px;">\u2713 Todo el stack tecnol\u00f3gico est\u00e1 activo y vigente.</div>';
  document.getElementById('tech-shop-backdrop').style.display = 'block';
  document.getElementById('tech-shop').style.display = 'block';
}

function closeTechCatalog() {
  document.getElementById('tech-shop').style.display = 'none';
  document.getElementById('tech-shop-backdrop').style.display = 'none';
}

// =====================================================================
// HIRE CATALOG — Contratar especialistas
// =====================================================================

// Calcula costo pro-rateado del año actual (meses restantes × salario/12)
function hireProrated(salary) {
  const monthsElapsed = (G.totalMonths || 0) % 12;
  const remaining     = Math.max(1, 12 - monthsElapsed);
  return Math.round(salary * remaining / 12);
}

let _currentHireDept = ''; // rastrea el filtro de dept activo en el catálogo

function showHireCatalog(filterDept) {
  if (document.getElementById('main').style.display === 'none') return;
  if (filterDept !== undefined) _currentHireDept = filterDept || '';
  const fd = _currentHireDept;

  const DEPT_LABELS = {soc:'SOC',red:'Ofensiva',vuln:'Vuln Mgmt',gov:'GRC',cloud:'Cloud',iam:'IAM'};
  const DEPT_COLORS = {soc:'#00e5ff',red:'#ff4455',vuln:'#ff8c00',gov:'#c77dff',cloud:'#56aaff',iam:'#00ff88'};

  const annualPayroll = G.team.reduce((s, m) => s + (m.salary || 0), 0);
  document.getElementById('hs-budget').textContent  = fmtBudget();
  document.getElementById('hs-payroll').textContent = fmtNum(annualPayroll);

  // Tabs de filtro por departamento
  const deptIds = ['','soc','red','vuln','gov','cloud','iam'];
  const tabs = deptIds.map(d => {
    const active = fd === d;
    const label  = d ? (DEPT_LABELS[d] || d) : 'Todos';
    const color  = d ? DEPT_COLORS[d] : 'var(--text)';
    const activeStyle = active ? `border-color:${color};color:${color};background:rgba(255,255,255,.06);` : '';
    return `<button class="dept-filter-tab" style="${activeStyle}" onclick="showHireCatalog(${d ? "'" + d + "'" : "''"})">${label}</button>`;
  }).join('');
  document.getElementById('hs-filter-tabs').innerHTML = tabs;

  const candidates = fd ? (HIRE_CATALOG || []).filter(r => r.dept === fd) : (HIRE_CATALOG || []);
  const rows = candidates.map(r => {
    const hiredCount = G.team.filter(m => m._catalogId === r.id).length;
    const upfront    = hireProrated(r.salary);
    const canAfford  = G.budget >= upfront;
    const expTags = r.expertise.map(id => {
      const p = POLICY_CATALOG.find(x=>x.id===id);
      const t = TECH_CATALOG.find(x=>x.id===id);
      return (p||t)?.name || id;
    }).join(', ');
    const lvlColor = r.level==='senior' ? 'var(--yellow)' : r.level==='junior' ? 'var(--muted)' : 'var(--green2)';
    const lvlLabel = r.level==='senior' ? '★ Senior' : r.level==='junior' ? '◦ Junior' : '● Mid';
    const deptColor = DEPT_COLORS[r.dept] || 'var(--muted)';
    const deptBadge = r.dept
      ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:rgba(255,255,255,.07);color:${deptColor};margin-left:4px;">${DEPT_LABELS[r.dept]||r.dept}</span>`
      : '';
    const capBar = (label, val, color) =>
      `<div style="display:flex;align-items:center;gap:3px;">
        <span style="font-size:8px;color:${color};width:12px">${label}</span>
        <div style="width:80px;height:3px;background:rgba(255,255,255,.07);border-radius:2px;">
          <div style="width:${val}%;height:100%;background:${color};border-radius:2px;"></div>
        </div>
        <span style="font-size:8px;color:var(--muted)">${val}</span>
      </div>`;
    const hiredBadge = hiredCount > 0
      ? `<span style="font-size:8px;color:var(--green2);margin-left:6px;">✓ ${hiredCount} activo${hiredCount>1?'s':''}</span>`
      : '';
    const costLabel = `<span style="font-size:9px;color:${canAfford?'var(--green)':'var(--red)'}">
      Ahora: ${fmtNum(upfront)} (${12-((G.totalMonths||0)%12)} meses)
    </span>`;
    return `
      <div class="hs-item${!canAfford?' unaffordable':''}">
        <div class="hs-avatar">${r.avatar}</div>
        <div class="hs-body">
          <div class="hs-name">${r.name}${deptBadge} <span style="font-size:9px;color:${lvlColor}">${lvlLabel}</span>${hiredBadge}</div>
          <div class="hs-role">${r.role}</div>
          <div style="display:flex;gap:8px;margin:3px 0;">
            ${capBar('T', r.tech||0, 'var(--cyan)')}
            ${capBar('M', r.mgmt||0, 'var(--purple)')}
          </div>
          <div class="hs-bio">${r.bio}</div>
          <div class="hs-exp">⚡ Especialidad: ${expTags}</div>
          <div class="hs-footer">
            <div>
              <span class="hs-salary">${fmtNum(r.salary)}<span style="font-size:9px;color:var(--muted)">/año</span></span>
              ${costLabel}
            </div>
            <button class="hs-btn" onclick="hireMember('${r.id}')" ${!canAfford ? 'disabled' : ''}>
              ${canAfford ? '⊕ CONTRATAR' : '✗ SIN FONDOS'}
            </button>
          </div>
        </div>
      </div>`;
  });
  document.getElementById('hire-catalog-list').innerHTML = rows.join('') ||
    '<div style="color:var(--muted);font-size:11px;text-align:center;padding:20px;">No hay candidatos en este departamento.</div>';
  document.getElementById('hire-shop-backdrop').style.display = 'block';
  document.getElementById('hire-shop').style.display = 'block';
}

function closeHireCatalog() {
  document.getElementById('hire-shop').style.display = 'none';
  document.getElementById('hire-shop-backdrop').style.display = 'none';
}

function hireMember(id) {
  const r = (HIRE_CATALOG || []).find(x => x.id === id);
  if (!r) return;

  const upfront = hireProrated(r.salary);
  if (G.budget < upfront) {
    sfxAlert();
    addLog(`✗ FONDOS INSUFICIENTES — Contratar a ${r.name} requiere ${fmtNum(upfront)} (${12-((G.totalMonths||0)%12)} meses restantes). Disponible: ${fmtNum(G.budget)}.`, 'warning');
    return;
  }

  // Permitir contratar la misma especialidad varias veces; añadir sufijo al nombre
  const sameRole = G.team.filter(m => m._catalogId === id).length;
  const suffixes = ['', ' II', ' III', ' IV', ' V'];
  const suffix   = sameRole < suffixes.length ? suffixes[sameRole] : ` (${sameRole + 1})`;
  const uid      = id + '_' + sameRole;

  sfxSuccess();
  G.budget -= upfront;
  G.team.push({...r, id: uid, _catalogId: id, name: r.name + suffix, status: 'ok', techLoad: 0, mgmtLoad: 0});
  const payroll = G.team.reduce((s, m) => s + (m.salary || 0), 0);
  addLog(`👤 CONTRATADO — ${r.name}${suffix} (${r.role}) [T:${r.tech} M:${r.mgmt}]. Costo inmediato: −${fmtNum(upfront)}. Nómina anual: ${fmtNum(payroll)}/año.`, 'success');
  updateStats(); renderTeam(); renderSidebar();
  showHireCatalog(_currentHireDept); // refrescar manteniendo filtro activo
}

function buyTech(id) {
  const p = TECH_CATALOG.find(x => x.id === id);
  if (!p) return;
  const existing = G.techStack.findIndex(x => x.id === id);
  const cost = existing >= 0 ? Math.round(p.cost * 0.5) : p.cost;
  if (G.budget < cost) return;
  sfxSuccess();
  const { threat: _tt, ...techRestFx } = p.fx || {};
  applyFx({budget: -cost, ...techRestFx});
  const rec = {id: p.id, name: p.name, year: G.year};
  if (existing >= 0) G.techStack[existing] = rec; else G.techStack.push(rec);
  const action = existing >= 0 ? 'RENOVADA' : 'IMPLEMENTADA';
  addLog(`\ud83d\udcbb TECNOLOG\u00cdA ${action} \u2014 "${p.name}". Costo: \u2212${fmtNum(cost)}. Licencia hasta a\u00f1o ${G.year + p.expiresAfter}.`, 'success');
  if (p.taskLoad) startTask(p.name, '\ud83d\udcbb', p.taskLoad.slots, p.taskLoad.months, existing >= 0, p.id);
  updateStats(); renderTeam(); renderSidebar(); renderMetrics();
  showTechCatalog();
}

function checkTechAudit(year) {
  if (year < 2) return;
  const activeIds = new Set(activeTechStack().map(t => t.id));
  const req2 = ['siem','edr','ngfw','backup_dr'];
  const req3 = ['siem','edr','waf','vuln_scan'];
  const required = year >= 3 ? req3 : req2;
  const missing = required.filter(id => !activeIds.has(id));
  if (missing.length > 0) {
    const names = missing.map(id => TECH_CATALOG.find(t=>t.id===id)?.name || id);
    const fine  = year >= 3 ? 50000 : 30000;
    const repHit = year >= 3 ? 10 : 7;
    G.budget     = Math.max(0, G.budget - fine);
    G.reputation = Math.max(0, G.reputation - repHit);
    G.stakeholders.reg = Math.max(0, G.stakeholders.reg - 1);
    updateStats(); sfxFail();
    addLog(`\ud83c\udfe6 AUDITOR\u00cdA TECNOL\u00d3GICA A\u00d1O ${year} \u2014 Faltan: ${names.join(', ')}. Multa: \u2212${fmtNum(fine)} | Rep \u2212${repHit}`, 'danger');
  } else {
    if (year >= 2) G.stakeholders.reg = Math.min(5, G.stakeholders.reg + 1);
    addLog(`\ud83c\udfe6 AUDITOR\u00cdA TECNOL\u00d3GICA A\u00d1O ${year} \u2014 Stack en regla. El regulador valora positivamente.`, 'success');
  }
}

const DEPT_ORDER = ['soc','red','vuln','gov','cloud','iam'];
const DEPT_META  = {
  soc:  {name:'SOC & Detección',            color:'#00e5ff'},
  red:  {name:'Ofensiva / Red Team',         color:'#ff4455'},
  vuln: {name:'Gestión de Vulnerabilidades', color:'#ff8c00'},
  gov:  {name:'Gobierno / GRC',              color:'#c77dff'},
  cloud:{name:'Cloud & Infra',               color:'#56aaff'},
  iam:  {name:'Identidad & Accesos',         color:'#00ff88'},
};

// compact=true → sidebar (etiquetas cortas),  compact=false → modal (etiquetas completas)
function memberCard(m, compact = true) {
  const isDown  = m.status === 'down';
  const tech    = m.tech || 0;
  const mgmt    = m.mgmt || 0;
  const tLoad   = Math.min(tech, m.techLoad || 0);
  const mLoad   = Math.min(mgmt, m.mgmtLoad || 0);
  const tPct    = tech > 0 ? Math.round(tLoad / tech * 100) : 0;
  const mPct    = mgmt > 0 ? Math.round(mLoad / mgmt * 100) : 0;
  const maxUtil = Math.max(tPct, mPct);
  const sc = isDown ? 'status-down' : maxUtil >= 80 ? 'status-busy' : maxUtil >= 40 ? 'status-partial' : 'status-ok';
  const st = isDown ? '✕BAJA' : maxUtil >= 80 ? `⊗${maxUtil}%` : maxUtil > 0 ? `◑${maxUtil}%` : '●OK';
  const levelBadge = m.level
    ? `<span style="font-size:8px;color:var(--muted);margin-left:3px">${m.level==='senior'?'⭐':m.level==='junior'?'○':''}</span>`
    : '';
  const lblTEC   = compact ? 'TEC' : 'Técnico';
  const lblMGT   = compact ? 'MGT' : 'Gestión';
  const lblSize  = compact ? '7px' : '9px';
  const lblWidth = compact ? '26px' : '46px';
  const barRow = (label, pct, used, max, color) =>
    `<div style="display:flex;align-items:center;gap:3px;margin-bottom:1px;">
      <span style="font-size:${lblSize};color:${color};width:${lblWidth};font-weight:bold">${label}</span>
      <div style="flex:1;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;">
        <div style="width:${pct}%;height:100%;background:${pct>=80?'var(--orange)':pct>=40?'var(--yellow)':color};border-radius:2px;transition:width .4s;"></div>
      </div>
      <span style="font-size:8px;color:var(--muted);width:28px;text-align:right">${used}/${max}</span>
    </div>`;
  const bars = !isDown && (tech > 0 || mgmt > 0)
    ? `<div style="margin-top:3px;">
        ${barRow(lblTEC, tPct, tLoad, tech, 'var(--cyan)')}
        ${barRow(lblMGT, mPct, mLoad, mgmt, 'var(--purple)')}
      </div>`
    : '';
  return `
    <div class="team-member">
      <div class="member-avatar" style="background:${isDown?'#200':'#0a1a10'}">${m.avatar}</div>
      <div class="member-info">
        <div class="member-name">${m.name}${levelBadge}</div>
        <div class="member-role">${m.role}</div>
        ${bars}
      </div>
      <div class="member-status ${sc}">${st}</div>
    </div>`;
}

function renderTeam() {
  const core   = G.team.filter(m => !m._catalogId);
  const hired  = G.team.filter(m => !!m._catalogId);
  let html = core.length
    ? core.map(m => memberCard(m, true)).join('')
    : '<div style="font-size:10px;color:var(--muted)">Sin miembros core</div>';
  html += `<button onclick="showTeamModal()" style="width:100%;margin-top:6px;padding:4px 0;background:transparent;border:1px solid rgba(0,229,255,.25);color:var(--cyan);font-size:9px;cursor:pointer;border-radius:2px;font-family:inherit;letter-spacing:1px;">👥 VER EQUIPO COMPLETO${hired.length ? ` (+${hired.length})` : ''}</button>`;
  document.getElementById('team-list').innerHTML = html;
}

function showTeamModal() {
  let html = '';
  for (const deptId of DEPT_ORDER) {
    const d       = DEPT_META[deptId];
    const members = G.team.filter(m => (m.dept || '') === deptId);
    const n       = members.length;
    html += `<div style="border-left:3px solid ${d.color};padding:6px 10px;margin-bottom:8px;background:rgba(255,255,255,.02);border-radius:0 3px 3px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="color:${d.color};font-size:10px;font-weight:bold;letter-spacing:1px;">${d.name}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:9px;color:var(--muted)">${n} miembro${n!==1?'s':''}</span>
          <button onclick="closeTeamModal();showHireCatalog('${deptId}')"
            style="font-size:9px;padding:2px 8px;border:1px solid ${d.color};color:${d.color};background:transparent;cursor:pointer;border-radius:2px;font-family:inherit;">
            ＋ Contratar
          </button>
        </div>
      </div>
      ${n ? members.map(m => memberCard(m, false)).join('') : '<div style="font-size:9px;color:var(--muted);padding:4px 0;">Sin miembros — contratar para cubrir este departamento</div>'}
    </div>`;
  }
  document.getElementById('team-modal-body').innerHTML = html;
  document.getElementById('team-modal-backdrop').style.display = 'block';
  document.getElementById('team-modal').style.display       = 'block';
}

function closeTeamModal() {
  document.getElementById('team-modal-backdrop').style.display = 'none';
  document.getElementById('team-modal').style.display          = 'none';
}

function renderSidebar() {
  // Technologies (catalog) — se muestran primero con etiqueta 💻
  const activeT = new Set(activeTechStack().map(t=>t.id));
  const techEl  = document.getElementById('tech-list');
  if (!G.techStack.length) {
    techEl.innerHTML = '<div style="font-size:10px;color:var(--muted)">Sin tecnologías instaladas</div>';
  } else {
    techEl.innerHTML = G.techStack.map(t => {
      const exp = !activeT.has(t.id);
      const cat = TECH_CATALOG.find(c=>c.id===t.id);
      const yr  = cat ? t.year + cat.expiresAfter : null;
      const soon = !exp && yr !== null && (yr - G.year) <= 1;
      const col  = exp ? 'var(--red)' : soon ? 'var(--yellow)' : 'var(--cyan)';
      const badge = exp ? ' ✕' : soon ? ` ⚠${yr}` : '';
      return `<div class="tech-item" style="color:${col}">${t.name}${badge}</div>`;
    }).join('');
  }
  // Herramientas narrativas (adquiridas por escenas) — debajo de las tecnologías del catálogo
  const tl = document.getElementById('tools-list');
  if (G.tools && G.tools.length > 0) {
    const sep = G.techStack.length
      ? '<div style="border-top:1px solid rgba(255,255,255,.06);margin:4px 0;"></div>'
      : '';
    tl.innerHTML = sep + G.tools.map(t =>
      `<div class="tech-item" style="color:var(--green2);font-size:10px">🔧 ${t}</div>`
    ).join('');
  } else {
    tl.innerHTML = '';
  }
  // Policies
  const activeP = new Set(activePolicies().map(p=>p.id));
  const pl = document.getElementById('policies-list');
  if (!G.policies.length) {
    pl.innerHTML = '<div style="font-size:10px;color:var(--muted)">Sin políticas</div>';
  } else {
    pl.innerHTML = G.policies.map(p => {
      const exp  = !activeP.has(p.id);
      const cat  = POLICY_CATALOG.find(c=>c.id===p.id);
      const yr   = cat ? p.year + cat.expiresAfter : null;
      const soon = !exp && yr !== null && (yr - G.year) <= 1;
      const col  = exp ? 'var(--red)' : soon ? 'var(--yellow)' : 'var(--purple)';
      const badge = exp ? ' ✕' : soon ? ` ⚠${yr}` : '';
      return `<div class="policy-item" style="color:${col}">${p.name}${badge}</div>`;
    }).join('');
  }
  renderTasks();
}

function renderThreats() {
  let name, lvl, lbl;
  if      (G.threat > 75) { name = 'APT Activo';         lvl = 'tl-crit'; lbl = 'CRÍTICO';  }
  else if (G.threat > 50) { name = 'Exposición Alta';        lvl = 'tl-high'; lbl = 'ALTO';     }
  else if (G.threat > 30) { name = 'Exposición Moderada';    lvl = 'tl-med';  lbl = 'MODERADO'; }
  else if (G.threat > 10) { name = 'Perímetro Estable';   lvl = 'tl-low';  lbl = 'BAJO';     }
  else                    { name = 'Exposición Mínima'; lvl = 'tl-low';  lbl = 'MUY BAJO'; }
  document.getElementById('threat-list').innerHTML =
    `<div class="threat-item"><span style="color:var(--text);font-size:10px">${name}</span>
     <span class="threat-level ${lvl}">${lbl}</span></div>
     <div style="font-size:9px;color:var(--muted);margin-top:4px;">Nivel: ${G.threat}/100</div>`;
}

function renderMetrics() {
  const mttr = G.mttr.length ? Math.round(G.mttr.reduce((a,b)=>a+b,0)/G.mttr.length)+'h' : 'N/A';
  document.getElementById('metrics-list').innerHTML = `
    <div>📅 Día: <span style="color:var(--green)">${G.day}</span></div>
    <div>✅ Resueltos: <span style="color:var(--green)">${G.incidentsHandled}</span></div>
    <div>❌ Fallidos: <span style="color:var(--red)">${G.incidentsFailed}</span></div>
    <div>🔧 Herramientas: <span style="color:var(--cyan)">${G.tools.length}</span></div>
    <div>📜 Políticas activas: <span style="color:var(--yellow)">${activePolicies().length}/${G.policies.length}</span></div>
    <div>💻 Stack tecnológico: <span style="color:var(--cyan)">${activeTechStack().length}/${G.techStack.length}</span></div>
    <div>🎲 Eventos rnd: <span style="color:var(--purple)">${G.randEventsCount}</span></div>
    <div>🎯 Decisiones: <span style="color:var(--text)">${G.decisionsCount}</span></div>
    <div>👥 CEO: <span style="color:var(--cyan)">${'★'.repeat(G.stakeholders.ceo)}${'☆'.repeat(5-G.stakeholders.ceo)}</span></div>
    <div>💰 CFO: <span style="color:var(--yellow)">${'★'.repeat(G.stakeholders.cfo)}${'☆'.repeat(5-G.stakeholders.cfo)}</span></div>`;
}

function flashBody(color) {
  document.body.classList.remove('flash-red','flash-green');
  void document.body.offsetWidth;
  document.body.classList.add('flash-'+color);
  setTimeout(()=>document.body.classList.remove('flash-red','flash-green'),400);
}

// =====================================================================
// END STATES
// =====================================================================
function hideGame() {
  ['main','stats-bar','stakeholders','event-alert','progress-bar','rand-event'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  document.getElementById('endscreen').style.display = 'flex';
  stopAmbient();
}

function showGameOver(reason) {
  hideGame();
  sfxFail();
  const penalties = { bancarrota:0.60, despedido:0.50, brecha:0.40 };
  const sc = calcFinalScore(penalties[reason]);
  const { grade, color: gradeColor } = scoreGrade(sc.total);
  const reasons = {
    bancarrota:{title:'💸 SIN PRESUPUESTO',color:'var(--yellow)',
      desc:'El presupuesto fue agotado. El CFO congela todas las operaciones de seguridad.',
      narrative:`Tu mandato como CISO terminó en crisis financiera. Sin recursos para defender la empresa, los sistemas quedaron expuestos. El regulador abrió investigación formal. La empresa contrató un CISO de emergencia con un presupuesto de emergencia de $1.2M — tres veces lo que costaba prevenir esto.`},
    despedido:{title:'🚪 CONTRATO TERMINADO',color:'var(--red)',
      desc:'La reputación cayó a niveles inaceptables. El board prescinde de tus servicios.',
      narrative:`El board perdió la confianza en tu liderazgo. La acumulación de incidentes mal manejados, la relación deteriorada con el directorio, y el impacto en la marca llegaron a un punto de quiebre. Tu sucesor heredará una empresa con cicatrices visibles.`},
    brecha:{title:'💀 BRECHA CATASTRÓFICA',color:'var(--critical)',
      desc:'El nivel de amenaza alcanzó el punto crítico. Acceso total comprometido.',
      narrative:`Los atacantes obtuvieron acceso completo a los sistemas. Datos de 800,000 clientes exfiltrados. El regulador, los medios y los abogados de clientes llaman simultáneamente. La empresa enfrenta multas de hasta el 4% del revenue anual y demandas colectivas. Una brecha que costará entre $15M y $40M.`},
  };
  const r = reasons[reason];
  document.getElementById('end-title').textContent = r.title;
  document.getElementById('end-title').style.color = r.color;
  document.getElementById('end-desc').textContent = r.desc;
  document.getElementById('final-narrative').textContent = r.narrative;
  showFinalStats(gradeColor, sc, grade, true);
  showRunInfo();
}

// ----- SCORE ENGINE -----
function calcFinalScore(penaltyMult) {
  penaltyMult = (penaltyMult != null) ? penaltyMult : 1;
  const repPts    = Math.round(G.reputation * 1.5);
  const budgetPts = Math.round((G.budget / G.maxBudget) * 80);
  const threatPts = Math.round(Math.max(0, 100 - G.threat) * 0.6);
  const incPts    = Math.max(0, G.incidentsHandled * 10 - G.incidentsFailed * 12);
  const polPts    = activePolicies().length * 6;
  const techPts   = activeTechStack().length * 8;
  const shPts     = (G.stakeholders.ceo + G.stakeholders.cfo + G.stakeholders.reg + G.stakeholders.team) * 5;
  const base      = Math.max(0, repPts + budgetPts + threatPts + incPts + polPts + techPts + shPts);
  const yearMult  = parseFloat((1 + (G.year - 1) * 0.10).toFixed(2));
  const total     = Math.max(0, Math.round(base * yearMult * penaltyMult));
  return { total, repPts, budgetPts, threatPts, incPts, polPts, techPts, shPts, base, yearMult, penaltyMult };
}
function scoreGrade(total) {
  if (total >= 600) return { grade:'⭐ CISO LEGENDARIO',      color:'var(--yellow)' };
  if (total >= 430) return { grade:'✅ CISO ÉLITE',           color:'var(--green)'  };
  if (total >= 250) return { grade:'👍 BUEN CISO',            color:'var(--cyan)'   };
  if (total >= 120) return { grade:'⚠️ CISO EN DESARROLLO',  color:'var(--orange)' };
  return               { grade:'😰 AÑO DIFÍCIL',             color:'var(--red)'    };
}
// ----- END SCORE ENGINE -----

function showEnding() {
  hideGame();
  const sc = calcFinalScore(1);
  const { grade, color } = scoreGrade(sc.total);

  let narrative;
  if (sc.total >= 600) {
    narrative=`Resultados extraordinarios. El board aprueba un aumento del 30%, contrato de 4 años, y te nominan para el panel de CISOs del Foro Económico Mundial. Tu empresa es citada como referente de seguridad en la industria. Construiste una cultura de seguridad real, no solo compliance de papel.`;
  } else if (sc.total >= 430) {
    narrative=`Excelente año. El board renueva tu contrato con aumento del 20% y amplía tu presupuesto. Manejaste ${G.incidentsHandled} incidentes exitosamente y construiste una infraestructura de seguridad sólida. La empresa es notablemente más resiliente que hace 12 meses.`;
  } else if (sc.total >= 250) {
    narrative=`Año sólido con resultados mixtos. El board renueva tu contrato con los mismos términos. Tienes oportunidades claras de mejora en gestión de stakeholders y reducción del nivel de amenaza. El camino hacia CISO élite está abierto.`;
  } else if (sc.total >= 120) {
    narrative=`Sobreviviste el año, pero los resultados están por debajo de las expectativas. El board aprueba renovación de 6 meses condicional con KPIs claros. Necesitas demostrar mejora en gestión de riesgos y relación con el directorio.`;
  } else {
    narrative=`El año fue muy complicado. Varios incidentes mal manejados dejaron cicatrices en la empresa. El board aprueba renovación trimestral con revisión mensual. Estás en modo de recuperación.`;
  }

  if (sc.total >= 430) sfxSuccess();
  document.getElementById('end-title').textContent = grade;
  document.getElementById('end-title').style.color = color;
  document.getElementById('end-desc').textContent = `Dificultad: ${DIFF_CONFIG[G.difficulty].label} • Año ${G.year} • ${G.decisionsCount} decisiones`;
  document.getElementById('final-narrative').textContent = narrative;
  showFinalStats(color, sc, grade, false);
  showRunInfo();
}

function showFinalStats(color, sc, grade, isGameOver) {
  const penText = isGameOver ? ` ×${sc.penaltyMult.toFixed(1)} penalización` : '';
  document.getElementById('score-hero').innerHTML =
    `<div class="sh-num" style="color:${color}">${sc.total}</div>` +
    `<div class="sh-label">PUNTUACIÓN FINAL</div>` +
    `<div class="sh-grade" style="color:${color}">${grade}</div>`;
  document.getElementById('final-stats').innerHTML =
    `<div class="fs-item"><div class="fs-num" style="color:var(--green)">${G.year}</div><div class="fs-label">AÑO ALCANZADO</div></div>` +
    `<div class="fs-item"><div class="fs-num" style="color:var(--cyan)">${G.reputation}</div><div class="fs-label">REPUTACIÓN</div></div>` +
    `<div class="fs-item"><div class="fs-num" style="color:var(--yellow)">${fmtBudget()}</div><div class="fs-label">PRESUPUESTO</div></div>` +
    `<div class="fs-item"><div class="fs-num" style="color:${G.threat>60?'var(--red)':'var(--green)'}">${G.threat}</div><div class="fs-label">EXPOSICIÓN</div></div>` +
    `<div class="fs-item"><div class="fs-num" style="color:var(--green)">${G.incidentsHandled}</div><div class="fs-label">RESUELTOS</div></div>` +
    `<div class="fs-item"><div class="fs-num" style="color:var(--red)">${G.incidentsFailed}</div><div class="fs-label">FALLIDOS</div></div>`;

  const breakdown = [
    `Rep +${sc.repPts}`,
    `Budget +${sc.budgetPts}`,
    `Exposición +${sc.threatPts}`,
    `Inc +${sc.incPts}`,
    `Políticas +${sc.polPts}`,
    `Tech +${sc.techPts}`,
    `SH +${sc.shPts}`,
  ].join(' | ');
  document.getElementById('score-breakdown').innerHTML =
    `<span style="color:var(--muted)">${breakdown}</span><br>` +
    `<span style="color:var(--text)">= base ${sc.base} × ${sc.yearMult} (año ${G.year})${penText} = </span>` +
    `<span style="color:${color};font-weight:700;">${sc.total} pts — ${grade}</span>`;
}

function showRunInfo() {
  const names = playQueue.filter(s=>s.id!=='intro'&&s.id!=='endgame')
    .map(s=>s.title.replace(/^[^—]+—\s*/,'')).join(' → ');
  document.getElementById('end-run-info').textContent = 'Recorrido: ' + names;
}

// =====================================================================
// INTRO & FINAL SCENES
// =====================================================================
// =====================================================================
// BOOT — show start screen, wait for user
// =====================================================================
// Hide all game UI until user clicks INICIAR
function hideGameUIBeforeStart() {
  ['stats-bar','stakeholders','progress-bar','event-alert','rand-event','main','endscreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
hideGameUIBeforeStart();
loadData().catch(err => {
  console.error('Error al cargar scenes.json:', err);
  const ss = document.getElementById('start-screen');
  if (ss) ss.insertAdjacentHTML('beforeend',
    '<p style="color:var(--red);margin-top:12px;font-size:11px;">⚠ Error cargando datos. Recarga la página.</p>');
});