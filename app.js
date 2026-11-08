// Despacho · app de Sergio Vela. Datos en Supabase (proyecto asistente-vela), solo visibles con su sesión.
// V3 (08/11/2026 · Sr. Vela, P109): cabecera corta + barra de saltos; tres bloques (Ahora · Hoy · Seguimiento); «Hoy» en una sola
// tarjeta (línea del día, baldosas, turnos como franja horaria); negocio plegado; «A tu firma» con dos botones; Libreta como notas.
(function () {
  'use strict';
  const CONFIG = {
    url: 'https://ykflueekyeqprolrblap.supabase.co',
    key: 'sb_publishable_6EfiKCg6WZHftOYPKt24zA_wCpRDjBZ',
    // Ordenar al instante vía n8n (OpenAI). Vacío: lo ordena la tarea de cada hora.
    ordenarUrl: '',
  };
  const $ = (s, r) => (r || document).querySelector(s);
  // V3.1 · los desplegables con id recuerdan cómo los dejaste (solo en este navegador).
  document.querySelectorAll('details[id]').forEach((d) => {
    try { const v = localStorage.getItem('dp.open.' + d.id); if (v === '1') d.open = true; else if (v === '0') d.open = false; } catch (e) {}
    d.addEventListener('toggle', () => { try { localStorage.setItem('dp.open.' + d.id, d.open ? '1' : '0'); } catch (e) {} });
  });
  const sb = window.supabase.createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const state = { items: [], view: 'cng', events: [], prep: {}, briefing: null, revision: null, libreta: [], solicitudes: [], sync: null, semana: null, editing: null, busy: false, mailItem: null, loaded: false };
  const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const DIAS3 = ['dom','lun','mar','mié','jue','vie','sáb'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const PRIO = { urgente: 0, alta: 1, normal: 2, baja: 3 };
  const CODIGOS = { P: 'propio', F: 'federativo', PO: 'pool', PR: 'privado', PB: 'privado benéfico', A: 'abierto', AB: 'abierto benéfico', B: 'benéfico' };
  const PED = { pedido: 'pedido', confirmado: 'confirmado', enviado: 'en camino', entregado: 'entregado', incidencia: 'incidencia' };
  const KIND = { tarea: 'Para hacer', seguimiento: 'Encargo', hablar: 'Hablar con', idea: 'Idea', vencimiento: 'Vencimiento', pedido: 'Pedido' };

  // ---------- fechas ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function parseYmd(s) { if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function daysUntil(s) { const d = parseYmd(s); return d ? Math.round((d - today()) / 86400000) : null; }
  function localDay(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : ymd(d); }
  function hhmm(iso) { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtShort(s) { const d = parseYmd(s); return d ? DIAS3[d.getDay()] + ' ' + d.getDate() : ''; }
  function relDate(s) { const n = daysUntil(s); if (n === null) return ''; if (n === 0) return 'hoy'; if (n === 1) return 'mañana'; if (n === -1) return 'ayer'; if (n < 0) return 'hace ' + (-n) + ' d'; return fmtShort(s); }
  function ago(iso) { const d = localDay(iso); if (!d) return ''; const n = -daysUntil(d); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' d'; }
  function addRecurrence(s, rec) {
    const d = parseYmd(s) || today();
    if (rec === 'semanal') d.setDate(d.getDate() + 7); else if (rec === 'mensual') d.setMonth(d.getMonth() + 1);
    else if (rec === 'trimestral') d.setMonth(d.getMonth() + 3); else if (rec === 'anual') d.setFullYear(d.getFullYear() + 1); else return null;
    return ymd(d);
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ---------- acceso ----------
  function lgStatus(m, err) { const s = $('#lgStatus'); s.textContent = m || ''; s.classList.toggle('err', !!err); }
  $('#lgIn').addEventListener('click', async () => {
    const email = $('#lgEmail').value.trim(), password = $('#lgPass').value;
    if (!email || !password) { lgStatus('Escribe tu correo y tu contraseña.', true); return; }
    lgStatus('Entrando…');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) lgStatus(/confirm/i.test(error.message) ? 'Antes tienes que confirmar el correo que te enviamos al crear el acceso.' : 'No se pudo entrar: revisa el correo y la contraseña.', true);
  });
  $('#lgUp').addEventListener('click', async () => {
    const email = $('#lgEmail').value.trim(), password = $('#lgPass').value;
    if (!email || password.length < 8) { lgStatus('La contraseña necesita al menos 8 caracteres.', true); return; }
    lgStatus('Creando acceso…');
    const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } });
    if (error) { lgStatus('No se pudo crear el acceso (' + error.message + ').', true); return; }
    lgStatus(data.session ? 'Acceso creado.' : 'Te hemos enviado un correo. Ábrelo, confirma y vuelve aquí a entrar.');
  });
  $('#btnSalir').addEventListener('click', async () => { await sb.auth.signOut(); });

  // ---------- cabecera y pestañas ----------
  function header() {
    const t = new Date();
    $('#dateLine').textContent = DIAS[t.getDay()].replace(/^./, (c) => c.toUpperCase()) + ', ' + t.getDate() + ' de ' + MESES[t.getMonth()];
    const h = t.getHours();
    $('#greet').innerHTML = (h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches') + ', Sergio';
  }
  try { const v = localStorage.getItem('dp.view'); if (v === 'personal' || v === 'cng') state.view = v; } catch (e) {}
  function applyView() {
    $('#tabCng').setAttribute('aria-selected', String(state.view === 'cng'));
    $('#tabPer').setAttribute('aria-selected', String(state.view === 'personal'));
    $('#cng').hidden = state.view !== 'cng'; $('#per').hidden = state.view !== 'personal';
  }
  $('#tabCng').addEventListener('click', () => { state.view = 'cng'; try { localStorage.setItem('dp.view', 'cng'); } catch (e) {} applyView(); });
  $('#tabPer').addEventListener('click', () => { state.view = 'personal'; try { localStorage.setItem('dp.view', 'personal'); } catch (e) {} applyView(); });
  applyView();

  // ---------- clasificación ----------
  const open = (it) => it.estado !== 'hecho' && it.estado !== 'cancelado';
  const cng = () => state.items.filter((it) => (it.ambito || 'cng') === 'cng');
  const per = () => state.items.filter((it) => it.ambito === 'personal');
  function blocker(it) { if (!it || !it.bloqueado_por) return null; const b = state.items.find((x) => x.id === it.bloqueado_por); return b && open(b) ? b : null; }
  function snoozed(it) { return it.pospuesto_hasta && daysUntil(it.pospuesto_hasta) > 0; }
  function urgency(it) {
    const n = daysUntil(it.fecha_limite);
    let s = (PRIO[it.prioridad] ?? 2) * 10;
    if (n !== null) s += n <= 0 ? -25 : n <= 3 ? -12 : n <= 7 ? -4 : 0;
    if (it.novedad) s -= 2;
    if (it.recomendacion) s -= 6;
    if (it.origen === 'informe' || it.origen === 'gmail') s -= 3;
    return s;
  }
  function firmaList() {
    return cng().filter((it) => open(it) && (it.tipo === 'tarea' || !it.tipo) && !blocker(it) && !snoozed(it))
      .filter((it) => it.prioridad === 'urgente' || it.prioridad === 'alta' || (daysUntil(it.fecha_limite) !== null && daysUntil(it.fecha_limite) <= 1))
      .sort((a, b) => urgency(a) - urgency(b)).slice(0, 3);
  }
  // P88 (31/10/2026 · Sr. Vela): encargos con el plazo vencido (2 días laborables por defecto) suben a «A tu firma». Solo aviso:
  // nunca se prepara un recordatorio sin que Sergio pulse «Recordar».
  function vencidosEnc() {
    return cng().filter((it) => open(it) && it.tipo === 'seguimiento' && !snoozed(it) && daysUntil(it.fecha_limite) !== null && daysUntil(it.fecha_limite) <= 0)
      .sort((a, b) => String(a.fecha_limite).localeCompare(String(b.fecha_limite))).slice(0, 3);
  }
  function pendingRequest(it) { return state.solicitudes.find((s) => s.asunto_id === it.id && s.estado === 'pendiente'); }
  function chipsFor(it) {
    const c = []; const n = daysUntil(it.fecha_limite);
    if (n !== null) c.push('<span class="chip ' + (n <= 0 ? 'crit' : n <= 3 ? 'flag' : '') + '">' + (n < 0 ? 'vencido ' + relDate(it.fecha_limite) : 'plazo ' + relDate(it.fecha_limite)) + '</span>');
    if (it.prioridad === 'urgente' && !(n !== null && n <= 0)) c.push('<span class="chip crit">urgente</span>');
    if (it.persona) c.push('<span class="chip">' + esc(it.persona) + '</span>');
    if (it.origen === 'informe') c.push('<span class="chip">informe</span>');
    return c.join('');
  }

  // ---------- render ----------
  function renderParte() {
    const el = $('#parte'); const b = state.briefing;
    if (!b || !b.texto) return;
    const lines = String(b.texto).split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const at = b.at ? (localDay(b.at) === ymd(today()) ? 'hoy ' : DIAS[new Date(b.at).getDay()] + ' ') + hhmm(b.at) : '';
    // V2.2 (22/10/2026): el parte se escribe cada 3 h; lo que se ha cerrado después se enseña debajo para que no lo contradiga.
    const desde = b.at ? new Date(b.at).getTime() : 0;
    const cerrados = cng().filter((it) => it.estado === 'hecho' && it.hecho_at && new Date(it.hecho_at).getTime() > desde && it.tipo !== 'idea')
      .sort((x, y) => String(y.hecho_at).localeCompare(String(x.hecho_at)));
    const despues = cerrados.length ? '<div class="since"><b>Desde este parte ya está resuelto</b><ul>' + cerrados.slice(0, 4).map((it) =>
      '<li>' + esc(it.titulo) + ' <span class="muted">· ' + (it.extra && it.extra.auto_cierre ? 'se cerró solo' : 'lo cerraste tú') + ' a las ' + hhmm(it.hecho_at) + '</span></li>').join('') +
      (cerrados.length > 4 ? '<li class="muted">y ' + (cerrados.length - 4) + ' más en «Hecho»</li>' : '') + '</ul></div>' : '';
    const pal = (s) => new Set(norm(s).replace(/[^a-z0-9& ]/g, ' ').split(/\s+/).filter((w) => w.length >= 5));
    const cerradoEn = (l) => { const w = pal(l); return cerrados.some((it) => { let n = 0; pal(it.titulo).forEach((x) => { if (w.has(x)) n++; }); return n >= 2; }); };
    el.innerHTML = lines.map((l) => '<p' + (cerrados.length && cerradoEn(l) ? ' class="done"' : '') + '>' + esc(l) + '</p>').join('') + despues + (at ? '<span class="when">Parte de ' + esc(at) + (cerrados.length ? '; lo de arriba puede estar ya resuelto' : '') + '</span>' : '');
  }
  function encargoCard(it, i) {
    const n = daysUntil(it.fecha_limite); const pr = pendingRequest(it);
    const enc = it.extra && it.extra.encargo; const pasado = enc && enc.at ? localDay(enc.at) : localDay(it.created_at);
    const quien = it.persona || (enc && enc.nombre) || 'el equipo';
    const cuando = n === 0 ? 'vence hoy' : 'vencido ' + relDate(it.fecha_limite);
    return '<article class="firma urg enc" data-id="' + esc(it.id) + '">' +
      '<div class="fhead"><span class="fnum">' + (i + 1) + '</span><h3>' + esc(it.titulo) + '</h3>' +
      '<p class="why">Encargo a <b>' + esc(quien) + '</b>' + (pasado ? ' desde el ' + esc(fmtShort(pasado)) : '') + ': ' + esc(cuando) + ' y sin respuesta del equipo.</p>' +
      '<div class="chips"><span class="chip crit">encargo ' + esc(cuando) + '</span><span class="chip">' + esc(quien) + '</span></div></div>' +
      (it.novedad ? '<p class="nov"><b>Último</b>' + esc(it.novedad) + '</p>' : '') +
      (pr ? '<p class="pend">Recordatorio pedido a las ' + hhmm(pr.at) + ': estará en tus borradores de Gmail en unos segundos.</p>' : '') +
      '<div class="acts">' + (pr ? '<button class="btn go" data-action="done">Hecho</button>' : '<button class="btn go" data-action="nudge">Recordar</button><button class="btn" data-action="done">Hecho</button>') +
      '<button class="btn ghost" data-action="more">Más ▾</button></div>' +
      '<div class="more">' + (it.enlace ? '<a class="mini" href="' + esc(it.enlace) + '" target="_blank" rel="noopener">Abrir hilo</a>' : '') +
      '<button class="mini" data-action="later">Mañana</button><button class="mini" data-action="edit">Editar</button></div></article>';
  }
  function renderFirma() {
    const list = firmaList(); const venc = vencidosEnc();
    $('#firmaN').textContent = list.length || venc.length ? 'por urgencia' : '';
    const encHtml = venc.map((it, j) => encargoCard(it, list.length + j)).join('');
    $('#firma').innerHTML = (list.length ? list.map((it, i) => {
      const n = daysUntil(it.fecha_limite); const urg = it.prioridad === 'urgente' || (n !== null && n <= 0);
      const pr = pendingRequest(it);
      return '<article class="firma' + (urg ? ' urg' : '') + '" data-id="' + esc(it.id) + '">' +
        '<div class="fhead"><span class="fnum">' + (i + 1) + '</span><h3>' + esc(it.titulo) + '</h3>' +
        (it.detalle ? '<p class="why">' + esc(it.detalle) + '</p>' : '') + '<div class="chips">' + chipsFor(it) + '</div></div>' +
        (it.novedad ? '<p class="nov"><b>Novedad</b>' + esc(it.novedad) + '</p>' : '') +
        (it.recomendacion ? '<p class="reco"><b>Recomiendo</b>' + esc(it.recomendacion) + '</p>' : '') +
        (pr ? '<p class="pend">' + (pr.tipo === 'reenvio' ? 'Reenvío a ' + esc(pr.para_nombre || pr.para || 'info@') + ' pedido a las ' : 'Borrador pedido a las ') + hhmm(pr.at) + ': estará en tus borradores de Gmail en unos segundos.</p>' : '') +
        // V3: dos acciones a la vista (Hecho y Más); el resto se despliega. P108: nada se envía solo.
        '<div class="acts"><button class="btn go" data-action="done">Hecho</button><button class="btn ghost" data-action="more">Más ▾</button></div>' +
        '<div class="more">' + (pr ? '' : '<button class="mini" data-action="mail">Pedir borrador</button>' + (it.enlace ? '<button class="mini" data-action="fwd">Pasar al equipo</button>' : '')) +
        (it.enlace ? '<a class="mini" href="' + esc(it.enlace) + '" target="_blank" rel="noopener">Abrir hilo</a>' : '') +
        '<button class="mini" data-action="later">Mañana</button><button class="mini" data-action="edit">Editar</button></div></article>';
    }).join('') : '') + encHtml || '<p class="empty-s">Nada urgente que firmar. Lo demás está en «Tus tareas».</p>';
    const fallos = state.solicitudes.filter((s) => s.estado === 'error');
    if (fallos.length) $('#firma').innerHTML = fallos.map((s) => { const it = state.items.find((x) => x.id === s.asunto_id); return '<p class="pend">No pude preparar el ' + (s.tipo === 'reenvio' ? 'reenvío' : 'borrador') + (it ? ' de «' + esc(it.titulo) + '»' : s.enlace ? ' del correo de «Equipo»' : '') + ': ' + esc(s.resultado || 'error') + '</p>'; }).join('') + $('#firma').innerHTML;
  }
  // Agenda: copia del calendario que mantienen las tareas automáticas.
  const isTorneo = (e) => !!e.torneo;
  // P108 (08/11/2026 · Sr. Vela): un recordatorio dictado («recuérdame X a las 12») se pone en el calendario como evento corto «⏰ X»;
  // en la app no cuenta como reunión y se enseña como aviso.
  const isRecordatorio = (e) => /^\u23f0/.test(String(e.titulo || ''));
  function eventsOn(day) { return state.events.filter((e) => e.dia <= day && day <= (e.dia_fin || e.dia)); }
  function torneoName(e) { const s = String(e.titulo || '').trim(); const m = s.match(/^(PO|PR|PB|AB|A|B|F|P)\s+(.+)$/); return m ? { codigo: m[1], nombre: m[2] } : { codigo: null, nombre: s }; }
  function timeRange(e) {
    if (e.todo_el_dia) { const a = e.dia, b = e.dia_fin || e.dia; return a === b ? 'todo el día' : parseYmd(a).getDate() + '–' + parseYmd(b).getDate() + ' ' + MES3[parseYmd(b).getMonth()]; }
    return hhmm(e.inicio) + (e.fin ? '–' + hhmm(e.fin) : '');
  }
  function clashes(evs) {
    // V3: los choques se miran solo entre reuniones; un torneo o un recordatorio ⏰ no «se pisa» con nada.
    const timed = evs.filter((e) => !e.todo_el_dia && e.inicio && e.fin && e.mi_respuesta !== 'declined' && !isTorneo(e) && !isRecordatorio(e)); const set = new Set();
    for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j];
      if (new Date(a.inicio) < new Date(b.fin) && new Date(b.inicio) < new Date(a.fin)) { set.add(a.id); set.add(b.id); }
    }
    return set;
  }
  function hablarFor(e) {
    const att = (e.asistentes || []).map((a) => norm((a.nombre || '') + ' ' + String(a.email || '').split('@')[0].replace(/[._]/g, ' ')));
    if (!att.length) return [];
    return cng().filter((it) => open(it) && it.tipo === 'hablar' && it.persona).filter((it) => { const first = norm(it.persona).split(/\s+/)[0]; return first.length > 2 && att.some((a) => a.split(/\s+/).includes(first)); });
  }
  function agendaDays() {
    const days = []; const now = new Date();
    for (let i = 0; i < 10 && days.length < 3; i++) {
      const d = addDays(today(), i), ds = ymd(d);
      let evs = eventsOn(ds);
      if (i === 0) evs = evs.filter((e) => e.todo_el_dia || !e.fin || new Date(e.fin) > now);
      if (evs.length) days.push({ d, ds, evs });
    }
    return days;
  }
  // V3 · «Hoy» en una tarjeta: línea del día (todos los eventos de hoy, también los pasados, tachados), baldosas y turnos.
  // Los días siguientes van debajo, compactos. Recordatorios «⏰» (P108) se enseñan como aviso, no como reunión.
  function evKind(e) { return isTorneo(e) ? { cls: 'tor', txt: 'torneo' } : isRecordatorio(e) ? { cls: 'rec', txt: '⏰ aviso' } : e.todo_el_dia ? { cls: 'dia', txt: 'todo el día' } : { cls: '', txt: 'reunión' }; }
  function evName(e) {
    if (isTorneo(e)) { const tn = torneoName(e); return (tn.codigo ? tn.codigo + ' · ' : '') + tn.nombre; }
    if (isRecordatorio(e)) return String(e.titulo).replace(/^⏰\s*/, '');
    return e.titulo || '(sin título)';
  }
  function renderAgenda() {
    const now = new Date(); const hoy = ymd(today());
    const evs = eventsOn(hoy).slice().sort((a, b) => (a.todo_el_dia ? '0' : '1' + a.inicio).localeCompare(b.todo_el_dia ? '0' : '1' + b.inicio));
    const cl = clashes(evs);
    const reun = evs.filter((e) => !e.todo_el_dia && !isTorneo(e) && !isRecordatorio(e));
    const tor = evs.filter(isTorneo);
    const sub = [];
    reun.slice(0, 2).forEach((e) => sub.push(hhmm(e.inicio) + ' ' + String(e.titulo || '').slice(0, 28)));
    if (reun.length > 2) sub.push('+' + (reun.length - 2));
    if (tor.length) { const tc = torneoName(tor[0]); sub.push('torneo' + (tc.codigo ? ' ' + tc.codigo : '')); }
    const hs = $('#hoySub'); if (hs) hs.textContent = sub.join(' · ');
    const tl = $('#tl');
    if (tl) {
      tl.innerHTML = evs.length ? evs.map((e) => {
        const k = evKind(e); const fin = e.fin ? new Date(e.fin) : null; const ini = e.inicio ? new Date(e.inicio) : null;
        const past = !e.todo_el_dia && fin && fin <= now; const cur = !e.todo_el_dia && ini && fin && ini <= now && now < fin;
        const att = (e.asistentes || []).filter((a) => a.email !== 'sergio.vela@cngolf.es').map((a) => (a.nombre || String(a.email || '').split('@')[0]).split(' ')[0]).filter(Boolean);
        const name = evName(e);
        const link = e.enlace ? '<a href="' + esc(e.enlace) + '" target="_blank" rel="noopener">' + esc(name) + '</a>' : esc(name);
        const lines = [];
        if (cl.has(e.id)) lines.push('<p class="p warn"><b>Choque</b>se pisa con otra reunión</p>');
        if (e.mi_respuesta === 'needsAction') lines.push('<p class="p warn"><b>Sin responder</b>no has contestado a la convocatoria</p>');
        const pr = state.prep[e.id]; if (pr && pr.texto) lines.push('<p class="p"><b>Prepara</b>' + esc(pr.texto) + '</p>');
        const hb = isTorneo(e) || isRecordatorio(e) ? [] : hablarFor(e); if (hb.length) lines.push('<p class="p"><b>Saca</b>' + esc(hb.map((h) => h.titulo).join(' · ')) + '</p>');
        return '<div class="ev' + (past ? ' past' : cur ? ' now' : '') + '"><span class="t">' + esc(e.todo_el_dia ? 'día' : hhmm(e.inicio)) + '</span><span class="s">' + link +
          (att.length && !isTorneo(e) && !isRecordatorio(e) ? '<small>con ' + esc(att.slice(0, 4).join(', ')) + (att.length > 4 ? ' y ' + (att.length - 4) + ' más' : '') + '</small>' : '') + '</span>' +
          '<span class="k ' + k.cls + '">' + k.txt + '</span>' + lines.join('') + '</div>';
      }).join('') : '<div class="ev"><span class="t">—</span><span class="s muted">' + (state.loaded ? 'Sin reuniones ni torneos hoy.' : 'Cargando la agenda…') + '</span><span></span></div>';
    }
    // Próximos días (hasta 3 con eventos, sin hoy)
    const el = $('#agenda'); if (!el) return;
    const days = []; for (let i = 1; i < 10 && days.length < 3; i++) { const d = addDays(today(), i), ds = ymd(d); const ev = eventsOn(ds); if (ev.length) days.push({ d, ds, evs: ev }); }
    const dp = $('#dProx'); if (dp) dp.hidden = !days.length;
    const ps = $('#proxS'); if (ps && days.length) { const f = days[0]; const fe = f.evs.slice().sort((a, b) => (a.todo_el_dia ? '0' : '1' + a.inicio).localeCompare(b.todo_el_dia ? '0' : '1' + b.inicio))[0];
      ps.textContent = (f.ds === ymd(addDays(today(), 1)) ? 'mañana' : fmtShort(f.ds)) + ' · ' + (fe.todo_el_dia ? '' : hhmm(fe.inicio) + ' ') + evName(fe) + (f.evs.length > 1 ? ' · +' + (f.evs.length - 1) : '') + (days.length > 1 ? ' · ' + (days.length - 1) + (days.length === 2 ? ' día más' : ' días más') : ''); }
    el.innerHTML = days.length ? '<div class="day"><div class="dayh"><h3>Próximos días</h3></div>' + days.map(({ d, ds, evs: dv }) => {
      dv.sort((a, b) => (a.todo_el_dia ? '0' : '1' + a.inicio).localeCompare(b.todo_el_dia ? '0' : '1' + b.inicio));
      const title = (ds === ymd(addDays(today(), 1)) ? 'Mañana · ' : '') + DIAS[d.getDay()].replace(/^./, (c) => c.toUpperCase()) + ' ' + d.getDate();
      return '<div class="nd"><h4>' + esc(title) + '</h4>' + dv.map((e) => { const k = evKind(e); const pr = state.prep[e.id];
        return '<div class="ev"><span class="t">' + esc(timeRange(e)) + '</span><span class="s">' + esc(evName(e)) + (pr && pr.texto ? '<small>' + esc(pr.texto) + '</small>' : '') + '</span><span class="k ' + k.cls + '">' + k.txt + '</span></div>'; }).join('') + '</div>';
    }).join('') + '</div>' : '';
  }
  function renderDelegado() {
    const list = cng().filter((it) => open(it) && (it.tipo === 'seguimiento' || it.tipo === 'pedido')).sort((a, b) => urgency(a) - urgency(b));
    $('#delN').textContent = list.length || '';
    $('#delegado').innerHTML = list.length ? list.map((it) => {
      const who = it.tipo === 'pedido' ? (it.proveedor || 'Proveedor') + (it.persona ? ' · ' + it.persona : '') : (it.persona || 'Sin asignar');
      // P88: el plazo del encargo se lee como plazo («vence hoy», «vencido hace 2 d»), no como «para hace 2 d».
      const nd = daysUntil(it.fecha_limite);
      const st = it.tipo === 'pedido' ? (PED[it.pedido_estado] || 'pedido') + (it.pedido_estado_at ? ' · ' + ago(it.pedido_estado_at) : '')
        : nd === null ? 'desde ' + ago(it.created_at) : nd < 0 ? 'vencido ' + relDate(it.fecha_limite) : nd === 0 ? 'vence hoy' : 'plazo ' + relDate(it.fecha_limite);
      const pr = pendingRequest(it);
      return '<div class="del" data-id="' + esc(it.id) + '"><button class="tick" data-action="done" aria-label="Marcar como resuelto"></button>' +
        '<div><span class="who">' + esc(who) + '</span><p class="what">' + esc(it.titulo) + '</p>' +
        (it.novedad ? '<p class="note">' + esc(it.novedad) + '</p>' : it.detalle ? '<p class="note">' + esc(it.detalle) + '</p>' : '') +
        (pr ? '<p class="pend">Recordatorio pedido: estará en tus borradores en menos de una hora.</p>' : '') + '</div>' +
        '<span class="state' + (it.pedido_estado === 'entregado' ? ' done' : it.tipo !== 'pedido' && nd !== null && nd <= 0 ? ' late' : '') + '">' + esc(st) + '</span>' +
        '<div class="acts">' + (it.tipo !== 'pedido' && !pr ? '<button class="mini" data-action="nudge">Recordar</button>' : '') +
          (it.tracking ? '<a class="mini" href="' + esc(it.tracking) + '" target="_blank" rel="noopener">Seguimiento</a>' : '') +
          (it.enlace ? '<a class="mini" href="' + esc(it.enlace) + '" target="_blank" rel="noopener">Correo</a>' : '') +
          '<button class="mini" data-action="edit">Editar</button></div></div>';
    }).join('') : '<p class="empty-s">No esperas nada de nadie. Si sueltas «encargar a…», aparecerá aquí.</p>';
  }
  function renderRadar() {
    const rows = []; const hoy = ymd(today()), fin = ymd(addDays(today(), 14)); const seen = {};
    state.events.filter(isTorneo).forEach((e) => {
      const a = e.dia, b = e.dia_fin || e.dia; if (b < hoy || a > fin) return;
      const key = a + e.titulo; if (seen[key]) return; seen[key] = 1;
      const tn = torneoName(e);
      rows.push({ d: a, label: a === b ? fmtShort(a) : parseYmd(a).getDate() + '–' + parseYmd(b).getDate() + ' ' + MES3[parseYmd(b).getMonth()], n: (tn.codigo ? tn.codigo + ' · ' : '') + tn.nombre, k: CODIGOS[tn.codigo] || 'torneo', cls: 'tor' });
    });
    cng().filter((it) => open(it) && it.fecha_limite && it.fecha_limite <= fin && it.tipo !== 'idea').forEach((it) => {
      rows.push({ d: it.fecha_limite, label: daysUntil(it.fecha_limite) < 0 ? 'vencido' : relDate(it.fecha_limite), n: it.titulo, k: it.tipo === 'vencimiento' ? 'vencimiento' : 'tuyo', cls: 'mine' + (daysUntil(it.fecha_limite) < 0 ? ' lim' : '') });
    });
    rows.sort((a, b) => a.d.localeCompare(b.d));
    $('#radar').innerHTML = rows.length ? rows.map((r) => '<li class="' + r.cls + '"><span class="d">' + esc(r.label) + '</span><span class="n">' + esc(r.n) + '</span><span class="k">' + esc(r.k) + '</span></li>').join('')
      : '<li><span class="d">—</span><span class="n muted">Nada en los próximos 14 días.</span></li>';
  }
  function renderLibreta() {
    // Libreta V3 (08/11/2026 · Sr. Vela): la Libreta es el cajón de los pensamientos sueltos, no una segunda lista de tareas.
    // Lo que se convierte en tarea, encargo o «hablar con» vive solo en su sitio (A tu firma, Tus tareas, Hablar, Delegado).
    // Aquí quedan: las notas que aún se están ordenando (para que conste que llegaron), las reuniones y recordatorios
    // recién puestos en el calendario (hasta que pasen) y las ideas por tema.
    // Antes (V2, 18/10): listaba también las tareas de los últimos 7 días, repetidas con las otras secciones.
    const vistos = new Set(); const ordenando = []; const reuniones = []; const recordatorios = [];
    state.libreta.forEach((l) => {
      if (l.estado !== 'ordenada') { ordenando.push(l); return; }
      (Array.isArray(l.salidas) ? l.salidas : []).forEach((o) => {
        // P83: reuniones dictadas que ya están en el calendario (hasta que pasen)
        if (o && o.tipo === 'reunion' && o.evento_id) { if (o.fecha_limite >= ymd(today()) && !vistos.has('ev:' + o.evento_id)) { vistos.add('ev:' + o.evento_id); reuniones.push(o); } return; }
        // P108: recordatorios con hora puestos en el calendario (hasta que pasen)
        if (o && o.tipo === 'recordatorio' && o.evento_id) { if (o.fecha_limite >= ymd(today()) && !vistos.has('ev:' + o.evento_id)) { vistos.add('ev:' + o.evento_id); recordatorios.push(o); } return; }
      });
    });
    const htmlOrd = ordenando.map((l) => { const t = String(l.texto || '').replace(/\s+/g, ' ').trim(); return '<li><span class="kind">Ordenando</span><span class="muted">' + esc(t.length > 70 ? t.slice(0, 70) + '…' : t) + '</span></li>'; }).join('');
    reuniones.sort((x, y) => (x.fecha_limite + x.hora).localeCompare(y.fecha_limite + y.hora));
    const htmlReu = reuniones.map((o) => '<li class="plain"><span><span class="kind">Reunión</span> ' + esc(o.titulo) +
      (o.ya_estaba ? ' <span class="link">· ya estaba en tu calendario</span>' : ' <span class="link">· puesta en tu calendario</span>') +
      (Array.isArray(o.invitados) && o.invitados.length ? '<br><span class="muted">Invitación enviada a: ' + esc(o.invitados.map((e) => e.split('@')[0].split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ')) + '</span>' : '') +
      (Array.isArray(o.sin_invitar) && o.sin_invitar.length ? '<br><span class="pend">Sin invitar: ' + esc(o.sin_invitar.join(' · ')) + '</span>' : '') +
      (Array.isArray(o.choca) && o.choca.length ? '<br><span class="pend">Coincide con: ' + esc(o.choca.join(' · ')) + '</span>' : '') + '</span>' +
      '<span class="r">' + esc(relDate(o.fecha_limite) + ' · ' + (o.hora || '')) + (o.enlace ? ' <a class="mini" href="' + esc(o.enlace) + '" target="_blank" rel="noopener">Calendar</a>' : '') + '</span></li>').join('');
    recordatorios.sort((x, y) => (x.fecha_limite + (x.hora || '')).localeCompare(y.fecha_limite + (y.hora || '')));
    const htmlRec = recordatorios.map((o) => '<li class="plain"><span><span class="kind">Recordatorio</span> ' + esc(o.titulo) +
      ' <span class="link">· aviso en tu calendario</span><br><span class="muted">La tarea sigue en tu lista hasta que la marques hecha.</span></span>' +
      '<span class="r">' + esc(relDate(o.fecha_limite) + ' · ' + (o.hora || '')) + (o.enlace ? ' <a class="mini" href="' + esc(o.enlace) + '" target="_blank" rel="noopener">Calendar</a>' : '') + '</span></li>').join('');
    $('#libreta').innerHTML = (htmlOrd ? '<ul class="outs">' + htmlOrd + '</ul>' : '') + (htmlReu || htmlRec ? '<ul class="fl">' + htmlReu + htmlRec + '</ul>' : '');
    const ideas = cng().filter((it) => open(it) && it.tipo === 'idea');
    // V3 · ideas como notas: tema arriba, texto, fecha y «→ tarea» (la convierte en tarea sin pasar por Editar).
    ideas.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    $('#temas').innerHTML = ideas.length ? '<div class="notes">' + ideas.map((it) =>
      '<div class="nt" data-id="' + esc(it.id) + '"><span class="tema">' + esc(it.tema || 'Sin tema') + '</span><p data-action="edit">' + esc(it.titulo) + '</p>' +
      '<div class="foot"><small>' + esc(it.created_at ? (localDay(it.created_at) === ymd(today()) ? 'hoy' : fmtShort(localDay(it.created_at))) : '') + '</small><button class="mini" data-action="totask">→ tarea</button></div></div>').join('') + '</div>'
      : (htmlOrd || htmlReu || htmlRec ? '' : '<p class="empty-s">Sin ideas apuntadas. Lo que sueltes sin pedirme una tarea se guarda aquí.</p>');
  }
  // Hecho V1 (18/10/2026 · Sr. Vela): pestaña al final con lo ya hecho de los últimos 14 días, agrupado por día, con opción de reabrir.
  function hechoHtml(lista) {
    const desde = ymd(addDays(today(), -14)); const hoy = ymd(today()); const ayer = ymd(addDays(today(), -1));
    const hechos = lista.filter((it) => it.estado === 'hecho' && (it.hecho_at || it.updated_at) && localDay(it.hecho_at || it.updated_at) >= desde)
      .sort((a, b) => String(b.hecho_at || b.updated_at).localeCompare(String(a.hecho_at || a.updated_at)));
    let dia = ''; let html = '';
    hechos.forEach((it) => {
      const at = it.hecho_at || it.updated_at; const d = localDay(at);
      if (d !== dia) { dia = d; html += '<li class="plain dia"><span class="label">' + esc(d === hoy ? 'Hoy' : d === ayer ? 'Ayer' : fmtShort(d)) + '</span><span></span></li>'; }
      html += '<li class="plain" data-id="' + esc(it.id) + '"><span>✓ ' + esc(it.titulo) + (it.extra && it.extra.auto_cierre ? ' <span class="auto">se cerró solo: ' + esc(it.extra.auto_cierre.motivo || '') + '</span>' : '') + (it.persona ? ' <span class="muted">· ' + esc(it.persona) + '</span>' : '') + '</span><span class="r">' + hhmm(at) + ' <button class="mini" data-action="reopen">reabrir</button></span></li>';
    });
    return { n: hechos.length, html: html || '<li class="plain"><span class="muted">Nada hecho en las dos últimas semanas.</span><span></span></li>' };
  }
  function renderHecho() {
    const c = hechoHtml(cng()); $('#nHecho').textContent = c.n || ''; $('#hecho').innerHTML = c.html;
    const p = hechoHtml(per()); $('#nPerHecho').textContent = p.n || ''; $('#perHecho').innerHTML = p.html;
  }
  function rowLi(it, right) {
    const b = blocker(it);
    return '<li class="' + (b ? 'blk' : '') + '" data-id="' + esc(it.id) + '"><button class="tick" data-action="done" aria-label="Marcar como hecha"></button><span class="t" data-action="edit">' + esc(it.titulo) + (b ? ' · antes: ' + esc(b.titulo) : '') + '</span><span class="r">' + esc(right != null ? right : b ? 'bloqueada' : it.fecha_limite ? relDate(it.fecha_limite) : '') + '</span></li>';
  }
  function renderFolds() {
    const firmaIds = new Set(firmaList().map((x) => x.id));
    const tareas = cng().filter((it) => open(it) && (it.tipo === 'tarea' || !it.tipo || it.tipo === 'vencimiento') && !firmaIds.has(it.id)).sort((a, b) => (blocker(a) ? 1 : 0) - (blocker(b) ? 1 : 0) || urgency(a) - urgency(b));
    // V3.1: «Tus tareas» va en el bloque Hoy, plegable, con resumen (cuántas, vencidas y para hoy).
    const venc = tareas.filter((it) => daysUntil(it.fecha_limite) !== null && daysUntil(it.fecha_limite) < 0).length;
    const paraHoy = tareas.filter((it) => daysUntil(it.fecha_limite) === 0).length;
    const ts = $('#tareasS'); if (ts) ts.textContent = tareas.length ? [tareas.length + (tareas.length === 1 ? ' pendiente' : ' pendientes'), venc ? venc + (venc === 1 ? ' vencida' : ' vencidas') : '', paraHoy ? paraHoy + ' para hoy' : ''].filter(Boolean).join(' · ') + ' · además de las de «A tu firma»' : 'nada más apuntado';
    $('#tareas').innerHTML = tareas.length ? tareas.map((it) => rowLi(it)).join('') : '<li class="plain"><span class="muted">Nada más apuntado.</span><span></span></li>';
    const hablar = cng().filter((it) => open(it) && it.tipo === 'hablar').sort((a, b) => norm(a.persona).localeCompare(norm(b.persona)));
    $('#nHablar').textContent = hablar.length || '';
    $('#hablar').innerHTML = hablar.length ? hablar.map((it) => rowLi(it, it.persona || '')).join('') : '<li class="plain"><span class="muted">Nada pendiente de hablar con nadie.</span><span></span></li>';
    const r = state.revision;
    const hoy = ymd(today());
    const mios = cng().filter((it) => it.estado === 'hecho' && localDay(it.hecho_at) === hoy).sort((a, b) => String(a.hecho_at).localeCompare(String(b.hecho_at)));
    const rv = r && localDay(r.at) === hoy ? r : null;
    const resEq = rv && Array.isArray(rv.resueltos_equipo) && rv.resueltos_equipo.length ? rv.resueltos_equipo : null;
    const eqTxt = resEq ? 'equipo ' + resEq.length + (typeof rv.hilos_informe === 'number' ? ' de ' + rv.hilos_informe : '') : rv ? 'equipo: ver detalle' : 'equipo no disponible';
    $('#cierreLine').textContent = 'Hoy: ' + (mios.length === 1 ? '1 cerrada por ti' : mios.length + ' cerradas por ti') + ' · ' + eqTxt;
    $('#cierre').innerHTML = (mios.map((it) => '<li class="plain"><span>✓ ' + esc(it.titulo) + '</span><span class="r">' + hhmm(it.hecho_at) + '</span></li>').join('') +
      (resEq ? resEq.map((x) => '<li class="plain"><span>Equipo · ' + esc(x.asunto || '') + (x.como ? ' · ' + esc(x.como) : '') + '</span><span class="r">' + esc(x.quien || '') + '</span></li>').join('') : rv && rv.resumen ? '<li class="plain"><span>Equipo · ' + esc(rv.resumen) + '</span><span></span></li>' : '')) ||
      '<li class="plain"><span class="muted">Nada cerrado todavía hoy.</span><span></span></li>';
    const pp = per().filter((it) => open(it) && it.tipo !== 'idea').sort((a, b) => urgency(a) - urgency(b));
    $('#nPer').textContent = pp.length || ''; $('#perList').innerHTML = pp.length ? pp.map((it) => rowLi(it)).join('') : '<li class="plain"><span class="muted">Nada pendiente.</span><span></span></li>';
    const pi = per().filter((it) => open(it) && it.tipo === 'idea');
    $('#nPerIdeas').textContent = pi.length || ''; $('#perIdeas').innerHTML = pi.length ? pi.map((it) => rowLi(it, it.tema || '')).join('') : '<li class="plain"><span class="muted">Sin ideas personales apuntadas.</span><span></span></li>';
    const pc = per().filter((it) => it.estado === 'hecho' && localDay(it.hecho_at) === hoy);
    $('#perCierre').textContent = 'Hoy: ' + (pc.length === 1 ? '1 cerrada' : pc.length + ' cerradas');
    $('#perCerradas').innerHTML = pc.length ? pc.map((it) => '<li class="plain"><span>✓ ' + esc(it.titulo) + '</span><span class="r">' + hhmm(it.hecho_at) + '</span></li>').join('') : '<li class="plain"><span class="muted">Nada cerrado todavía hoy.</span><span></span></li>';
  }
  // Equipo · buzón V2 (22/10/2026 · Sr. Vela): sección visible, ordenada por antigüedad, con estado y bandeja; resueltos plegados.
  function eqEstado(p) {
    const s = norm(p.estado || '');
    if (s.includes('pregunta')) return { cls: 'q', txt: 'espera 2.ª respuesta' };
    if (s.includes('parado')) return { cls: 'x', txt: 'parado' };
    return { cls: '', txt: 'sin respuesta' };
  }
  // P72 · reenvío pedido desde «Equipo» (sin asunto): se reconoce por el enlace del hilo.
  function eqPedido(enlace) { return state.solicitudes.find((s) => s.tipo === 'reenvio' && s.estado === 'pendiente' && !s.asunto_id && s.enlace === enlace); }
  function eqAsunto(p) { return String(p.asunto || '').replace(/\s*\((parado|sección)[^)]*\)\s*$/i, '').trim(); }
  function renderEquipo() {
    const r = state.revision; const el = $('#equipo');
    if (!r) { $('#nEquipo').textContent = ''; el.innerHTML = '<p class="empty-s">Aún sin datos: el informe y las revisiones lo rellenan.</p>'; return; }
    const pend = (Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo : []).slice()
      .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
    const res = Array.isArray(r.resueltos_equipo) ? r.resueltos_equipo : [];
    const cuando = r.at ? (localDay(r.at) === ymd(today()) ? 'hoy ' : fmtShort(localDay(r.at)) + ' ') + hhmm(r.at) : '';
    $('#nEquipo').textContent = (pend.length ? pend.length + (pend.length === 1 ? ' pendiente' : ' pendientes') : 'al día') + (cuando ? ', revisado ' + cuando : '');
    const porB = {}; pend.forEach((p) => { const k = p.bandeja || 'Sin bandeja'; porB[k] = (porB[k] || 0) + 1; });
    const sum = Object.keys(porB).sort((a, b) => porB[b] - porB[a]).map((k) => '<span class="chip' + (k === 'Extranjeros' ? ' flag' : '') + '">' + esc(k) + ' ' + porB[k] + '</span>').join('');
    state.eqPend = pend;
    const rows = pend.map((p, i) => {
      const d = typeof p.dias === 'number' ? p.dias : null; const st = eqEstado(p);
      const pr = p.enlace ? eqPedido(p.enlace) : null;
      const pasar = !p.enlace ? '' : pr ? '<span class="eqfwd-ok">Reenvío a ' + esc(pr.para_nombre || pr.para || '') + ' pedido</span>'
        : '<button class="mini" data-eqfwd="' + i + '">Pasar</button>';
      const age = d === null ? '—' : d === 0 ? 'hoy' : d + '<small>d</small>';
      const link = p.enlace ? '<a href="' + esc(p.enlace) + '" target="_blank" rel="noopener">' + esc(eqAsunto(p)) + '</a>' : esc(eqAsunto(p));
      const extra = /pasada|cerrar/i.test(p.estado || '') ? '<span>fecha pasada: responder o cerrar</span>' : '';
      return '<li><span class="age' + (d >= 7 ? ' hot' : d >= 3 ? ' warm' : '') + '">' + age + '</span><span class="asu">' + link + '</span>' +
        (p.enlace ? '<span class="eqbtns"><a class="mini go" href="' + esc(p.enlace) + '" target="_blank" rel="noopener">Abrir</a>' + pasar + '</span>' : '<span></span>') +
        '<span class="sub"><span class="st ' + st.cls + '">' + esc(st.txt) + '</span><span>' + esc(p.bandeja || '') + '</span>' + extra + '</span></li>';
    }).join('');
    const resHtml = res.length ? '<details class="res"><summary>' + res.length + (res.length === 1 ? ' resuelto' : ' resueltos') + ' desde el informe</summary><ul>' +
      res.map((x) => '<li><span class="t">' + (x.enlace ? '<a href="' + esc(x.enlace) + '" target="_blank" rel="noopener" style="color:inherit">' + esc(x.asunto || '') + '</a>' : esc(x.asunto || '')) + '</span><span class="r">' + esc(x.quien || '') + '</span></li>').join('') + '</ul></details>' : '';
    // V3: al día = una línea; los resueltos en texto corrido (quién y qué), sin desplegable.
    const resTxt = res.length ? '<p class="res"><b>' + res.length + (res.length === 1 ? ' resuelto' : ' resueltos') + '</b> desde el informe · ' + esc(res.slice(0, 4).map((x) => (x.quien && x.quien !== '—' ? String(x.quien).split(' ')[0] + ' (' + String(x.asunto || '').slice(0, 40) + ')' : String(x.asunto || '').slice(0, 40))).join(' · ')) + (res.length > 4 ? ' · y ' + (res.length - 4) + ' más' : '') + '</p>' : '';
    el.innerHTML = (pend.length
      ? '<div class="eqsum">' + sum + '</div><ul class="eqlist">' + rows + '</ul>' + resHtml
      : '<div class="eqok">✓ El equipo está al día <small>ningún cliente esperando respuesta</small></div>' + resTxt) +
      '<p class="eqmeta">Comprobado en Gmail ' + esc(cuando) + '. Se actualiza cada 30 minutos.</p>';
  }
  // Tarjeta de juego (V2 22/10/2026): las cuatro cifras del día; cada casilla lleva a su sección.
  function renderScore() {
    const hoy = ymd(today()), fin = ymd(addDays(today(), 14)); const now = new Date();
    const firma = firmaList().length + vencidosEnc().length;
    const reun = state.events.filter((e) => e.dia === hoy && !e.todo_el_dia && !isTorneo(e) && !isRecordatorio(e) && (!e.fin || new Date(e.fin) > now)).length;
    const r = state.revision; const eq = r && Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo.length : null;
    const tor = new Set(state.events.filter((e) => isTorneo(e) && (e.dia_fin || e.dia) >= hoy && e.dia <= fin).map((e) => e.dia + e.titulo)).size;
    const cell = (href, n, txt, hot) => '<a href="' + href + '"' + (hot ? ' class="hot"' : '') + '><b>' + (n === null ? '–' : n) + '</b><span>' + txt + '</span></a>';
    $('#score').innerHTML = cell('#h-firma', firma, 'a tu firma', firma > 0) + cell('#h-hoy', reun, reun === 1 ? 'reunión hoy' : 'reuniones hoy') +
      cell('#h-eq', eq, 'equipo pendiente', eq !== null && eq > 5) + cell('#h-radar', tor, tor === 1 ? 'torneo en 14 d' : 'torneos en 14 d');
    // V3 · barra de saltos: el número solo cuando hay algo
    const jump = (id, n, crit) => { const j = $(id); if (!j) return; j.hidden = !n; j.textContent = n || ''; j.classList.toggle('crit', !!crit); };
    jump('#jFirma', firma, firma > 0);
    jump('#jDel', cng().filter((it) => open(it) && (it.tipo === 'seguimiento' || it.tipo === 'pedido')).length, false);
    jump('#jEq', eq, eq !== null && eq > 5);
    jump('#jLib', cng().filter((it) => open(it) && it.tipo === 'idea').length, false);
  }
  // V2.1 (22/10/2026): frescura de los datos del equipo, cifras de negocio y cierre de semana.
  const eur = (n) => typeof n === 'number' && isFinite(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €' : null;
  function renderFresh() {
    const el = $('#fresh'); const r = state.revision; const h = new Date().getHours();
    if (!r || !r.at) { el.textContent = state.loaded ? 'Sin revisión del equipo todavía hoy.' : ''; el.className = 'fresh'; return; }
    const mins = (Date.now() - new Date(r.at).getTime()) / 60000; const hoy = localDay(r.at) === ymd(today());
    const viejo = h >= 8 && h < 23 && mins > 210;
    el.className = 'fresh' + (viejo ? ' late' : '');
    el.textContent = viejo ? 'Ojo: los datos del equipo son de ' + (hoy ? 'las ' : fmtShort(localDay(r.at)) + ', ') + hhmm(r.at) + '. La última comprobación no ha llegado.'
      : 'Equipo comprobado ' + (hoy ? 'a las ' + hhmm(r.at) : 'el ' + fmtShort(localDay(r.at))) + '.';
  }
  // P87 (31/10/2026): cabecera verde = ocupación del día por unidad (por FECHA DE USO: quién está ese día en el centro,
  // da igual cuándo se pagó; Gourmet solo abre jue-vie-sáb) → total de reservas → total facturado HOY (ventas registradas
  // hoy en GolfManager, sean para hoy o para otro día). Orden fijo: Escuela clases · Alumnos · Gourmet personas · Fitting · Golf.
  // Desde las 19:00 la ocupación es la de MAÑANA (P80); lo facturado es siempre de hoy. Sin dato = «—», nunca 0 inventado.
  // Comparativa con la semana pasada (P80) solo en Gourmet (bahías), Fitting y Golf; nunca en Escuela.
  function renderReservas() {
    const el = $('#bizres'); const v = state.vivo; const d = v && v.datos; const u = d && d.unidades;
    if (!u || !u.hoy || d.fecha !== ymd(today())) { el.hidden = true; return null; }
    const noche = new Date().getHours() >= 19 && u.manana && typeof u.manana === 'object';
    const blq = noche ? u.manana : u.hoy; const cuando = noche ? 'mañana' : 'hoy';
    const cmp = d.comparativa && d.comparativa[noche ? 'manana' : 'hoy'];
    const d7 = u.d7 || {};
    const val = (x, c) => x && typeof x[c] === 'number' ? x[c] : (u.completo ? 0 : null);
    const ref = cmp && cmp.fecha_ref ? fmtShort(cmp.fecha_ref) : '';
    const flecha = (a, n, que) => {
      if (n === null || !cmp || !cmp.unidades || !cmp.unidades[a]) return '';
      const sp = cmp.unidades[a].semana_pasada; if (typeof sp !== 'number') return '';
      const dl = n - sp; const c = dl > 0 ? 'up' : dl < 0 ? 'dn' : 'eq';
      return '<span class="cmp ' + c + '">' + (dl > 0 ? '▲ +' + dl : dl < 0 ? '▼ ' + dl : '= ') + (que ? ' ' + que : '') + ' vs ' + esc(ref) + ' (' + sp + ')</span>';
    };
    const fN = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const cel = (n, et, sub, extra) => '<div><b>' + (n === null ? '—' : esc(fN(n))) + '</b><span class="et">' + esc(et) + '</span>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + (extra || '') + '</div>';
    const s7 = (a, c) => { const x = val(d7[a], c); return '7 d · ' + (x === null ? '—' : fN(x)); };
    const E = 'Escuela', G = 'Gourmet Experience', F = 'Fitting';
    const golfKey = Object.keys(blq).concat(Object.keys(d7)).find((a) => /golf|campo|green/i.test(a) && !/gourmet/i.test(a));
    const gB = val(blq[G], 'reservas');
    const fijas = [E, G, F, golfKey];
    const otras = Object.keys(blq).filter((a) => !fijas.includes(a));
    const totN = u.completo ? Object.keys(blq).reduce((t, a) => t + (val(blq[a], 'reservas') || 0), 0) : null;
    // Rejilla 3 × 2: la sexta casilla es el total de reservas (antes iba aparte).
    const cells = [
      cel(val(blq[E], 'reservas'), 'clases', s7(E, 'reservas')),
      cel(val(blq[E], 'personas'), 'alumnos', s7(E, 'personas')),
      cel(val(blq[G], 'personas'), 'en Gourmet', (gB === null ? '—' : gB) + (gB === 1 ? ' bahía' : ' bahías'), flecha(G, gB)),
      cel(val(blq[F], 'reservas'), 'fitting', s7(F, 'reservas'), flecha(F, val(blq[F], 'reservas'))),
      golfKey ? cel(val(blq[golfKey], 'reservas'), 'golf', s7(golfKey, 'reservas'), flecha(golfKey, val(blq[golfKey], 'reservas')))
        : '<div><b>—</b><span class="et">golf</span><span>hasta el 02/11</span></div>'
    ];
    // Unidades nuevas que aparezcan en GolfManager no se pierden: van detrás, con su nº de reservas.
    otras.forEach((a) => cells.push(cel(val(blq[a], 'reservas'), a, s7(a, 'reservas'))));
    cells.push('<div class="sum"><b>' + (totN === null ? '—' : esc(fN(totN))) + '</b><span class="et">reservas · total</span></div>');
    el.hidden = false;
    el.innerHTML = '<p class="bizcap">Ocupación ' + cuando + ' · GolfManager ' + esc(hhmm(d.generado)) + (u.completo ? '' : ' · <b>lectura incompleta</b>') + '</p><div class="biz occ">' + cells.join('') + '</div>';
    if (!u.completo) return { n: null, cuando };
    return { n: Object.keys(blq).reduce((t, a) => t + (val(blq[a], 'reservas') || 0), 0), cuando };
  }
  // Total de reservas del día mostrado + total facturado HOY (ventas_hoy de D4, P86: con IVA, sin borradores ni recargas).
  // Lo facturado no tiene por qué cuadrar con la ocupación: incluye lo cobrado hoy para otros días (p. ej. Gourmet).
  function renderTotal(res) {
    const el = $('#biztot'); const vd = state.vivo && state.vivo.datos;
    const vh = vd && vd.fecha === ymd(today()) && vd.unidades ? vd.unidades.ventas_hoy : null;
    const fac = vh && vh.version === 'P86' && vh.fecha === ymd(today()) ? eur(vh.total) : null;
    el.hidden = false;
    el.innerHTML = '<div class="fact"><span class="et">Facturado hoy</span><b>' + esc(fac || '—') + '</b><span>' + (fac ? 'con IVA · ' + esc(hhmm(vd.generado)) + (vh.completo === false ? ' · incompleto' : '') : 'no disponible') + '</span></div>';
  }
  function renderBiz() {
    const res = renderReservas(); renderTotal(res);
    // V3 · el negocio sale del encabezado y va plegado: una línea resumen y el detalle al tocar.
    const neg = $('#neg'); if (!neg) return;
    const vd = state.vivo && state.vivo.datos; const vh = vd && vd.fecha === ymd(today()) && vd.unidades ? vd.unidades.ventas_hoy : null;
    const fac = vh && vh.version === 'P86' && vh.fecha === ymd(today()) ? eur(vh.total) : null;
    const hay = (res && res.n !== null) || fac;
    neg.hidden = !hay && !res;
    if (neg.hidden) return;
    const partes = [];
    if (res && res.n !== null) partes.push(res.n + ' reservas ' + res.cuando); else if (res) partes.push('ocupación ' + res.cuando + ' (lectura incompleta)');
    if (fac) partes.push('facturado ' + fac);
    $('#negT').textContent = partes.length ? partes.join(' · ') : 'Negocio de hoy';
    $('#negS').textContent = 'GolfManager' + (vd && vd.generado ? ' ' + hhmm(vd.generado) : '') + ' · ocupación por unidad y ventas del día';
  }
  // P81 (28/10/2026): quién trabaja en Caddy Master, Gestión de Juego y Fitting (turnos de GolfManager vía D4).
  // V3 (08/11/2026 · Sr. Vela): como franja horaria, una barra por persona agrupada por departamento, con la hora actual marcada;
  // quien está dentro de su turno, en verde fuerte. Desde las 19:00, los de mañana. Ausentes al pie, sin motivo. Sin dato = «no disponible».
  function renderTurnos() {
    const el = $('#turnos'); const v = state.vivo; const d = v && v.datos; const u = d && d.unidades; const t = u && u.turnos;
    const noche = new Date().getHours() >= 19;
    const tT = $('#turnosT'), tS = $('#turnosS');
    if (tT) tT.textContent = noche ? 'Trabajan mañana' : 'Trabajan hoy';
    if (!d || d.fecha !== ymd(today()) || !t || t.version !== 'P81') {
      if (tS) tS.textContent = state.loaded ? 'turnos no disponibles ahora mismo' : 'cargando…';
      el.innerHTML = ''; return;
    }
    const blq = t[noche ? 'manana' : 'hoy'] || {};
    const DEPS = ['Caddy Master', 'Gestión de Juego', 'Fitting'];
    const toMin = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    let lo = 7 * 60, hi = 21 * 60; const todos = []; const aus = [];
    DEPS.forEach((dep) => (Array.isArray(blq[dep]) ? blq[dep] : []).forEach((p) => { if (p.ausente) { aus.push(p.nombre); return; } const a = toMin(p.desde), b = toMin(p.hasta); if (a !== null && b !== null) { lo = Math.min(lo, Math.floor(a / 60) * 60); hi = Math.max(hi, Math.ceil(b / 60) * 60); } todos.push(p); }));
    const span = Math.max(60, hi - lo); const pct = (m) => Math.max(0, Math.min(100, (m - lo) / span * 100));
    const ahora = new Date(); const nowMin = ahora.getHours() * 60 + ahora.getMinutes();
    const nowPct = !noche && nowMin >= lo && nowMin <= hi ? pct(nowMin) : null;
    const nowStyle = nowPct === null ? '' : ' style="--now:' + nowPct.toFixed(1) + '%"';
    const ticks = []; for (let h = Math.ceil(lo / 60) + 1; h < hi / 60; h += 2) ticks.push('<i style="left:' + pct(h * 60).toFixed(1) + '%">' + h + '</i>');
    const first = (n) => String(n || '').trim().split(/\s+/).slice(0, 1).join(' ');
    const names = {}; todos.forEach((p) => { const f = first(p.nombre); names[f] = (names[f] || 0) + 1; });
    const label = (p) => { const parts = String(p.nombre || '').trim().split(/\s+/); const f = parts[0] || ''; return names[f] > 1 && parts[1] ? f + ' ' + parts[1].charAt(0) + '.' : f; };
    const dentroN = nowPct === null ? null : todos.filter((p) => { const a = toMin(p.desde), b = toMin(p.hasta); return a !== null && b !== null && a <= nowMin && nowMin < b; }).length;
    if (tS) tS.textContent = [todos.length + (todos.length === 1 ? ' persona' : ' personas'), dentroN === null ? null : dentroN + ' ahora dentro', aus.length ? aus.length + (aus.length === 1 ? ' ausencia' : ' ausencias') : null, 'GolfManager ' + hhmm(d.generado)].filter(Boolean).join(' · ');
    let html = '<div class="ticks"' + nowStyle + '><span></span><span class="track">' + ticks.join('') + (nowPct === null ? '' : '<b></b>') + '</span></div>';
    DEPS.forEach((dep) => {
      const gente = (Array.isArray(blq[dep]) ? blq[dep] : []).filter((p) => !p.ausente);
      html += '<div class="grp">' + esc(dep) + (gente.length ? '' : ' <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· nadie con turno</span>') + '</div>';
      gente.sort((a, b) => (toMin(a.desde) || 0) - (toMin(b.desde) || 0)).forEach((p) => {
        const a = toMin(p.desde), b = toMin(p.hasta);
        const dentro = nowPct !== null && a !== null && b !== null && a <= nowMin && nowMin < b;
        const rol = p.rol ? String(p.rol).toLowerCase().replace(/\s+/g, ' ').trim() : '';
        const bar = a !== null && b !== null && b > a ? '<span class="bar" style="left:' + pct(a).toFixed(1) + '%;width:' + (pct(b) - pct(a)).toFixed(1) + '%"><small>' + esc(p.desde + '–' + p.hasta) + (rol && b - a >= 420 ? ' · ' + esc(rol) : '') + '</small></span>' : '<span class="bar nodata"><small>sin horario</small></span>';
        html += '<div class="row' + (dentro ? ' now' : '') + '"' + nowStyle + '><span class="n" title="' + esc(p.nombre + (rol ? ' · ' + rol : '')) + '">' + esc(label(p)) + '</span><span class="track">' + bar + '</span></div>';
      });
    });
    html += '<div class="aus">' + (aus.length ? 'Ausentes: ' + esc(aus.map(first).join(' · ')) + '. ' : '') + 'Cuadrante de GolfManager, no fichaje real.</div>';
    el.innerHTML = html;
  }
  // V3 · Baldosas de «Hoy»: semáforo del campo, jugadores, ocupación y reclamaciones (Informe Diario vía sync). Sin dato = «—».
  function renderTiles() {
    const el = $('#tiles'); if (!el) return;
    const s = state.sync; const hoyS = s && localDay(s.at) === ymd(today()) ? s.datos || {} : null;
    const c = hoyS && hoyS.campo; const n = (hoyS && hoyS.negocio) || {}; const cl = hoyS && hoyS.clientes;
    const sem = c && c.semaforo ? String(c.semaforo) : null; const semCls = sem ? (SEMCLS[sem.toLowerCase()] || '') : '';
    const tile = (val, txt, cls) => '<div><b class="' + (cls || '') + '">' + val + '</b><span>' + esc(txt) + '</span></div>';
    const rec = cl ? cl.reclamaciones_sin_respuesta : null;
    el.innerHTML = tile(sem ? '<span class="dot ' + semCls + '"></span>' + esc(sem.charAt(0) + sem.slice(1).toLowerCase()) : '—', 'campo' + (c && typeof c.puntos === 'number' ? ' · ' + c.puntos + '/100' : '') + (c && c.tendencia ? ' · ' + c.tendencia : ''), semCls) +
      tile(n.jugadores_hoy != null ? esc(String(n.jugadores_hoy)) : '—', 'jugadores hoy') +
      tile(n.ocupacion_hoy != null ? esc(n.ocupacion_hoy + ' %') : '—', 'ocupación del campo') +
      tile(rec == null ? '—' : esc(String(rec)), rec === 1 ? 'reclamación sin respuesta' : 'reclamaciones sin respuesta', rec > 0 ? 'bad' : rec === 0 ? 'ok' : '');
  }
  // P82 (28/10/2026): «Operación de hoy» — campo, torneo del día, golf, clientes y tiempo. Todo copiado de su fuente
  // (Informe Diario vía sync, GolfManager vía D4, Calendar vía agenda). Lo que no hay se dice; nunca 0 inventado.
  const SEMCLS = { verde: 'ok', 'ámbar': 'warn', ambar: 'warn', rojo: 'bad' };
  function cardOp(titulo, cuerpo, pie, cls) { return '<div class="op' + (cls ? ' ' + cls : '') + '"><h3>' + titulo + '</h3>' + cuerpo + (pie ? '<p class="opf">' + pie + '</p>' : '') + '</div>'; }
  function renderOperacion() {
    const el = $('#operacion'); const s = state.sync; const hoyS = s && localDay(s.at) === ymd(today()) ? s.datos || {} : null;
    const noche = new Date().getHours() >= 19; const dia = noche ? ymd(addDays(today(), 1)) : ymd(today());
    $('#opSub').textContent = (noche ? 'de mañana · ' : '') + (hoyS && hoyS.informe_hora ? 'informe de las ' + hoyS.informe_hora : 'sin informe de hoy');
    const cards = [];
    // V17 (31/10/2026): el total facturado sale solo en la cabecera; aquí queda el reparto y la tabla.
    // P86 (29/10/2026): Hoy en el centro — ventas registradas de hoy (total) y lo ya dado hoy por unidad (GolfManager vía D4).
    // Siempre del día de hoy, también por la noche (es el cierre del día). Sin capacidad conocida no se da %, solo dadas de reservadas.
    const vd = state.vivo && state.vivo.datos; const vu = vd && vd.fecha === ymd(today()) ? vd.unidades : null;
    if (vu) {
      const vh = vu.ventas_hoy; const hh = vu.hoy_hechas || {}; const hb = vu.hoy || {};
      // Tabla: total del día, lo ya dado (empezado a la hora de la lectura) y lo que queda.
      const FIL = [['Escuela', 'reservas', 'Clases'], ['Escuela', 'personas', 'Alumnos'], ['Fitting', 'reservas', 'Sesiones de fitting'], ['Gourmet Experience', 'reservas', 'Bahías de Gourmet'], ['Gourmet Experience', 'personas', 'Personas en Gourmet']];
      const filas = FIL.filter(([k, c]) => hb[k] && hb[k][c] > 0).map(([k, c, et]) => { const t = hb[k][c]; const h = (hh[k] && hh[k][c]) || 0;
        return '<tr><th>' + et + '</th><td>' + t + '</td><td>' + h + '</td><td>' + Math.max(0, t - h) + '</td></tr>'; }).join('');
      const din = vh && vh.version === 'P86' ? (typeof vh.anticipada === 'number' && vh.anticipada > 0 && typeof vh.total === 'number' ? '<p>De lo facturado hoy: <b>' + esc(eur(vh.anticipada)) + '</b> para otros días (reservas futuras, p. ej. Gourmet) · <b>' + esc(eur(vh.total - vh.anticipada)) + '</b> para hoy</p>' : '') + '<p class="muted">Con IVA · sin borradores ni recargas' + (vh.completo === false ? ' · lectura incompleta' : '') + '</p>'
        : '<p class="muted">Ventas de hoy: no disponibles en esta lectura.</p>';
      const cuerpo = din + (filas ? '<table class="tdia"><thead><tr><th></th><th>Hoy</th><th>Ya dadas</th><th>Quedan</th></tr></thead><tbody>' + filas + '</tbody></table>'
        : '<p class="muted">Hoy no hay clases ni sesiones reservadas.</p>');
      cards.push(cardOp('Hoy en el centro · ' + esc(hhmm(vd.generado)), cuerpo, 'Ventas registradas en GolfManager (no es contabilidad). Golf desde el 02/11.'));
    }
    // Campo (parte del día: siempre el de hoy; por la noche se avisa de que es el de hoy)
    const c = hoyS && hoyS.campo;
    if (c && (c.semaforo || c.resumen)) {
      const sem = String(c.semaforo || '').toLowerCase();
      const cab = '<p class="sem ' + (SEMCLS[sem] || '') + '"><b>' + esc(c.semaforo || '—') + '</b>' + (typeof c.puntos === 'number' ? ' · ' + c.puntos + '/100' : '') + (c.tendencia ? ' · ' + esc(c.tendencia) : '') + '</p>';
      const det = [c.resumen, c.instalaciones, c.buggies ? 'Buggies: ' + c.buggies : null, c.observaciones].filter(Boolean).map((x) => '<p>' + esc(x) + '</p>').join('');
      cards.push(cardOp('Campo' + (noche ? ' · parte de hoy' : ''), cab + det, c.enlace ? '<a href="' + esc(c.enlace) + '" target="_blank" rel="noopener">Abrir el parte</a>' : '', SEMCLS[sem] || ''));
    } else cards.push(cardOp('Campo', '<p class="muted">' + (state.loaded ? 'Pendiente del Informe Diario (llega hacia las 09:00).' : 'Cargando…') + '</p>'));
    // Torneo del día: calendario + informe + GolfManager
    const tors = state.events.filter((e) => isTorneo(e) && e.dia <= dia && dia <= (e.dia_fin || e.dia));
    const v = state.vivo && state.vivo.datos; const tg = v && v.fecha === ymd(today()) && v.unidades && v.unidades.torneos_gm;
    const gm = tg && Array.isArray(tg[noche ? 'manana' : 'hoy']) ? tg[noche ? 'manana' : 'hoy'] : [];
    const inf = !noche && hoyS && Array.isArray(hoyS.torneo_hoy) ? hoyS.torneo_hoy : [];
    const key = (x) => norm(x).replace(/^(po|pr|pb|ab|a|b|f|p) · /, '').replace(/[^a-z0-9]/g, '');
    const igual = (x, y) => { const a = key(x), b = key(y); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
    const nombres = [];
    tors.map((e) => { const t = torneoName(e); return (t.codigo ? t.codigo + ' · ' : '') + t.nombre; }).concat(gm.map((g) => g.nombre))
      .forEach((x) => { if (!nombres.some((y) => igual(x, y))) nombres.push(x); });
    if (nombres.length) {
      cards.push(cardOp(noche ? 'Torneo de mañana' : 'Torneo de hoy', nombres.map((n) => {
        const g = gm.find((x) => igual(x.nombre, n));
        const i = inf.find((x) => igual(x.nombre || '', n));
        const datos = [];
        if (g && g.salida) datos.push('salida ' + g.salida);
        if (g && typeof g.inscritos === 'number') datos.push(g.inscritos + (typeof g.plazas === 'number' ? ' de ' + g.plazas : '') + ' inscritos' + (g.espera ? ' · ' + g.espera + ' en espera' : ''));
        if (i && i.bandera) datos.push('bandera ' + i.bandera);
        if (i && typeof i.asuntos === 'number' && i.asuntos > 0) datos.push(i.asuntos + (i.asuntos === 1 ? ' asunto abierto' : ' asuntos abiertos'));
        return '<p><b>' + esc(n) + '</b>' + (datos.length ? '<br><span class="muted">' + esc(datos.join(' · ')) + '</span>' : '') + '</p>';
      }).join(''), !gm.length ? 'Inscritos y salidas desde GolfManager cuando los torneos se gestionen allí.' : ''));
    }
    // Golf: green fees, ocupación, internacionales (desde el 02/11)
    const n = hoyS && hoyS.negocio || {};
    const kp = [['Green fees ayer', n.green_fees_ayer != null ? String(n.green_fees_ayer) : null], ['Ocupación hoy', n.ocupacion_hoy != null ? n.ocupacion_hoy + ' %' : null],
      ['Jugadores hoy', n.jugadores_hoy != null ? String(n.jugadores_hoy) : null], ['Internacionales', n.cuota_internacional != null ? n.cuota_internacional + ' %' : null]];
    const algunGolf = kp.some((x) => x[1] != null);
    cards.push(cardOp('Golf', '<div class="kpis">' + kp.map(([k, x]) => '<div><b>' + esc(x == null ? '—' : x) + '</b><span>' + esc(k) + '</span></div>').join('') + '</div>',
      algunGolf ? '' : 'Sin datos hasta el paso a GolfManager (02/11).'));
    // Clientes: reclamaciones, dinero de clientes pendiente, devoluciones (sin nombres)
    const cl = hoyS && hoyS.clientes;
    if (cl) {
      const rec = cl.reclamaciones_sin_respuesta;
      cards.push(cardOp('Clientes', '<p class="sem ' + (rec > 0 ? 'bad' : rec === 0 ? 'ok' : '') + '"><b>' + (rec == null ? '—' : rec) + '</b> ' + (rec === 1 ? 'reclamación sin respuesta' : 'reclamaciones sin respuesta') + '</p>' +
        (cl.dinero_pendiente != null ? '<p><b>' + esc(cl.dinero_pendiente) + '</b> con dinero de cliente pendiente' + (cl.dinero_tipos ? '<br><span class="muted">' + esc(cl.dinero_tipos) + '</span>' : '') + '</p>' : '') +
        (cl.devoluciones_7d ? '<p class="muted">Devoluciones 7 días: ' + esc(cl.devoluciones_7d) + '</p>' : ''), '', rec > 0 ? 'bad' : ''));
    } else cards.push(cardOp('Clientes', '<p class="muted">' + (state.loaded ? 'Pendiente del Informe Diario.' : 'Cargando…') + '</p>'));
    el.innerHTML = cards.join('');
    renderTiempo(dia);
  }
  // Tiempo: solo informativo (decisión de Sr. Vela: no penaliza ni decide). Open-Meteo, coordenadas aproximadas del CNG.
  let tiempoCache = null;
  async function renderTiempo(dia) {
    const el = $('#opTiempo'); const pinta = () => { const t = tiempoCache && tiempoCache.dias && tiempoCache.dias[dia]; el.textContent = t ? (dia === ymd(today()) ? 'Hoy' : 'Mañana') + ': ' + t : ''; };
    if (tiempoCache && Date.now() - tiempoCache.at < 3 * 3600e3) { pinta(); return; }
    try {
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=40.51&longitude=-3.70&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=Europe%2FMadrid&forecast_days=2');
      if (!r.ok) return; const j = await r.json(); const d = j.daily || {}; const dias = {};
      (d.time || []).forEach((t, i) => { dias[t] = Math.round(d.temperature_2m_min[i]) + '–' + Math.round(d.temperature_2m_max[i]) + ' °C · lluvia ' + d.precipitation_probability_max[i] + ' % · viento ' + Math.round(d.wind_speed_10m_max[i]) + ' km/h'; });
      tiempoCache = { at: Date.now(), dias }; pinta();
    } catch (e) { /* informativo: si falla, no se muestra */ }
  }
  // P88 (31/10/2026 · Sr. Vela): cierre semanal calculado en el momento desde los datos (función semana_resumen de Supabase, sin IA).
  // Lunes: semana anterior completa; resto de días: semana en curso. Comparativa con el mismo tramo de la semana anterior.
  // Desplegado de viernes a lunes; plegado el resto. Sin dato = «no disponible», nunca 0 inventado.
  let semanaAbierta = false;
  function renderSemana() {
    const w = state.semana; const box = $('#semanaFold');
    if (!w || w.version !== 'P88') { box.hidden = true; return; }
    box.hidden = false;
    const dow = new Date().getDay();
    if (!semanaAbierta) { semanaAbierta = true; box.open = dow === 5 || dow === 6 || dow === 0 || dow === 1; }
    $('#semanaLine').textContent = (w.cerrada ? 'Semana pasada' : 'Tu semana') + ' · ' + fmtShort(w.desde) + ' a ' + fmtShort(w.hasta);
    const N = (x) => typeof x === 'number' ? x : null;
    const ref = w.cerrada ? 'semana anterior' : 'mismo tramo de la semana anterior';
    const cmp = (a, b, bueno) => {
      if (N(a) === null || N(b) === null) return '';
      const d = a - b; const c = bueno && d > 0 ? ' up' : bueno && d < 0 ? ' dn' : '';
      return '<span class="cmp' + c + '">' + (d > 0 ? '▲ +' + d : d < 0 ? '▼ ' + d : '= igual') + ' vs ' + ref + ' (' + b + ')</span>';
    };
    const num = (x) => N(x) === null ? 'no disponible' : String(x);
    const fila = (t, sub, r, extra) => '<li class="plain"><span>' + t + (sub ? '<span class="sub">' + sub + '</span>' : '') + '</span><span class="r"><b>' + esc(r) + '</b>' + (extra || '') + '</span></li>';
    const lista = (arr, f) => (Array.isArray(arr) ? arr : []).map(f).join('<br>');
    const dd = (x) => x ? fmtShort(x) : '';
    const an = w.anterior || {}; const eq = w.equipo || {};
    let html = '';
    html += fila('Cerradas por ti', N(w.cerradas_solas) ? w.cerradas_solas + (w.cerradas_solas === 1 ? ' se cerró sola' : ' se cerraron solas') : '', num(w.cerradas), cmp(w.cerradas, an.cerradas, true));
    html += fila('Entraron nuevas', '', num(w.entraron), cmp(w.entraron, an.entraron, false));
    html += fila('El equipo resolvió', N(eq.resueltos) === null ? 'sin revisiones del buzón esta semana' : 'hilos del buzón · ' + eq.dias_con_dato + (eq.dias_con_dato === 1 ? ' día con dato' : ' días con dato') + (N(eq.pendientes_ahora) !== null ? ' · ' + eq.pendientes_ahora + (eq.pendientes_ahora === 1 ? ' pendiente ahora' : ' pendientes ahora') : ''), num(eq.resueltos), cmp(eq.resueltos, an.equipo_resueltos, true));
    if (N(w.cerradas_personal)) html += fila('Personales cerradas', '', String(w.cerradas_personal));
    if (Array.isArray(w.parados) && w.parados.length) html += fila('Parados más de 7 días', lista(w.parados, (x) => esc(x.titulo) + (x.persona ? ' · ' + esc(x.persona) : '') + ' · ' + x.dias + ' d'), String(w.parados.length));
    if (Array.isArray(w.delegado_vencido) && w.delegado_vencido.length) html += fila('Encargos vencidos', lista(w.delegado_vencido, (x) => esc(x.titulo) + (x.persona ? ' · ' + esc(x.persona) : '') + ' · ' + esc(dd(x.fecha))), String(w.delegado_vencido.length));
    const p = w.proxima || {};
    html += '<li class="plain dia"><span class="label">Semana que viene · ' + esc(dd(p.desde)) + ' a ' + esc(dd(p.hasta)) + '</span><span></span></li>';
    const pl = p.plazos || [], en = p.encargos || [], to = p.torneos || [];
    if (pl.length) html += fila('Tus plazos', lista(pl, (x) => esc(dd(x.fecha)) + ' · ' + esc(x.titulo)), String(pl.length));
    if (en.length) html += fila('Encargos que vencen', lista(en, (x) => esc(dd(x.fecha)) + ' · ' + esc(x.titulo) + (x.persona ? ' · ' + esc(x.persona) : '')), String(en.length));
    if (to.length) html += fila('Torneos', lista(to, (x) => { const t = torneoName({ titulo: x.titulo }); return esc(x.dia_fin && x.dia_fin !== x.dia ? dd(x.dia) + '–' + parseYmd(x.dia_fin).getDate() : dd(x.dia)) + ' · ' + esc((t.codigo ? t.codigo + ' · ' : '') + t.nombre); }), String(to.length));
    if (!pl.length && !en.length && !to.length) html += '<li class="plain"><span class="muted">Nada con fecha: ni plazos tuyos, ni encargos, ni torneos.</span><span></span></li>';
    html += '<li class="plain"><span class="muted" style="font-size:12px">Calculado ' + esc(hhmm(w.calculado)) + ' con tus asuntos, el buzón y el calendario.</span><span></span></li>';
    $('#semana').innerHTML = html;
  }
  function renderAll() { header(); renderScore(); renderFresh(); renderBiz(); renderOperacion(); renderTiles(); renderTurnos(); renderSemana(); renderParte(); renderFirma(); renderAgenda(); renderDelegado(); renderEquipo(); renderRadar(); renderLibreta(); renderFolds(); renderHecho(); }

  // ---------- datos ----------
  function showBanner(msg, err) { const b = $('#banner'); b.textContent = msg; b.className = 'banner' + (err ? ' err' : ''); b.hidden = !msg; }
  async function loadTable(t) {
    // P88: el cierre semanal se calcula en Supabase (semana_resumen) cada vez que se carga; ya no se lee de `cierres`.
    if (t === 'semana') { const { data, error } = await sb.rpc('semana_resumen'); if (!error) state.semana = data || null; return; }
    const hoy = ymd(addDays(today(), -1));
    let q;
    if (t === 'asuntos') q = sb.from('asuntos').select('*');
    else if (t === 'agenda') q = sb.from('agenda').select('*').gte('dia_fin', hoy).order('dia');
    else if (t === 'prep') q = sb.from('prep').select('*').gte('fecha', hoy);
    else if (t === 'briefings') q = sb.from('briefings').select('*').order('at', { ascending: false }).limit(1);
    else if (t === 'revisiones') q = sb.from('revisiones').select('*').order('at', { ascending: false }).limit(1);
    else if (t === 'libreta') q = sb.from('libreta').select('*').order('at', { ascending: false }).limit(20);
    else if (t === 'sync') q = sb.from('sync').select('*').order('id', { ascending: false }).limit(1);
    else if (t === 'negocio_vivo') q = sb.from('negocio_vivo').select('*').eq('id', 'reservas').limit(1);
    else if (t === 'solicitudes') q = sb.from('solicitudes').select('*').or('estado.eq.pendiente,and(estado.eq.error,hecha_at.gt.' + new Date(Date.now() - 864e5).toISOString() + ')');
    else return;
    const { data, error } = await q;
    if (error) { showBanner('No se pudieron cargar tus datos (' + error.message + '). Comprueba la conexión.', true); return; }
    if (t === 'asuntos') state.items = data;
    else if (t === 'agenda') state.events = data;
    else if (t === 'prep') { const m = {}; data.forEach((p) => { m[p.id] = p; }); state.prep = m; }
    else if (t === 'briefings') state.briefing = data[0] || null;
    else if (t === 'revisiones') state.revision = data[0] || null;
    else if (t === 'libreta') state.libreta = data;
    else if (t === 'solicitudes') state.solicitudes = data;
    else if (t === 'sync') state.sync = data[0] || null;
    else if (t === 'negocio_vivo') state.vivo = data[0] || null;
  }
  const TABLES = ['asuntos', 'agenda', 'prep', 'briefings', 'revisiones', 'libreta', 'solicitudes', 'sync', 'negocio_vivo'];
  const SEMANA_DE = ['asuntos', 'agenda', 'revisiones'];
  async function loadAll() { await Promise.all(TABLES.concat('semana').map(loadTable)); state.loaded = true; renderAll(); }
  let channel = null, reloadTimer = {};
  function subscribe() {
    if (channel) return;
    channel = sb.channel('despacho');
    TABLES.forEach((t) => channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
      clearTimeout(reloadTimer[t]); reloadTimer[t] = setTimeout(async () => { await loadTable(t); if (SEMANA_DE.includes(t)) await loadTable('semana'); renderAll(); }, 250);
    }));
    channel.subscribe();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#appView') && !$('#appView').hidden) loadAll(); });

  async function patch(it, data) {
    const { error } = await sb.from('asuntos').update(data).eq('id', it.id);
    if (error) showBanner('No se pudo guardar el cambio (' + error.message + ').', true);
    else { Object.assign(it, data); renderAll(); }
  }
  function newItem(p) {
    return { titulo: p.titulo, tipo: p.tipo || 'tarea', ambito: p.ambito || 'cng', prioridad: p.prioridad || 'normal', estado: 'pendiente',
      fecha_limite: p.fecha_limite || null, persona: p.persona || null, recurrencia: p.recurrencia || null, detalle: p.detalle || null, tema: p.tema || null,
      relacionado_con: p.relacionado_con || null, libreta_id: p.libreta_id || null, origen: p.origen || 'app' };
  }
  async function markDone(it) {
    await patch(it, { estado: 'hecho', hecho_at: new Date().toISOString() });
    if (it.tipo === 'vencimiento' && it.recurrencia && it.fecha_limite) {
      const next = addRecurrence(it.fecha_limite, it.recurrencia);
      if (next) await sb.from('asuntos').insert(newItem({ titulo: it.titulo, tipo: 'vencimiento', ambito: it.ambito, prioridad: it.prioridad, fecha_limite: next, recurrencia: it.recurrencia, detalle: it.detalle, origen: 'recurrencia' }));
    }
  }

  // ---------- acciones ----------
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]'); if (!btn) return;
    const host = btn.closest('[data-id]'); if (!host) return;
    const it = state.items.find((x) => x.id === host.dataset.id); if (!it) return;
    const a = btn.dataset.action;
    if (a === 'more') { host.classList.toggle('open'); btn.textContent = host.classList.contains('open') ? 'Menos ▴' : 'Más ▾'; return; }
    if (a === 'totask') { patch(it, { tipo: 'tarea', prioridad: it.prioridad || 'normal', tema: null }); return; }
    if (a === 'done') markDone(it);
    else if (a === 'reopen') patch(it, { estado: 'pendiente', hecho_at: null });
    else if (a === 'edit') openEditor(it);
    else if (a === 'mail') openMail(it, 'borrador');
    else if (a === 'fwd') openFwd(it);
    else if (a === 'nudge') openMail(it, 'recordatorio');
    else if (a === 'later') patch(it, { pospuesto_hasta: ymd(addDays(today(), 1)) });
  });

  // ---------- soltar ----------
  try { const d = localStorage.getItem('dp.suelta'); if (d) $('#suelta').value = d; } catch (e) {}
  $('#suelta').addEventListener('input', () => { try { localStorage.setItem('dp.suelta', $('#suelta').value); } catch (e) {} });
  function sStatus(m, err) { const s = $('#soltarStatus'); s.textContent = m || ''; s.classList.toggle('err', !!err); }
  const TIPOS = ['tarea', 'seguimiento', 'hablar', 'idea', 'vencimiento'];
  function cleanOut(o) {
    return { tipo: TIPOS.includes(o.tipo) ? o.tipo : 'tarea', titulo: String(o.titulo || '').trim().slice(0, 160), ambito: o.ambito === 'personal' ? 'personal' : 'cng',
      prioridad: ['urgente', 'alta', 'normal', 'baja'].includes(o.prioridad) ? o.prioridad : 'normal', fecha_limite: parseYmd(o.fecha_limite) ? String(o.fecha_limite).slice(0, 10) : null,
      persona: o.persona ? String(o.persona).trim().slice(0, 80) : null, tema: o.tema ? String(o.tema).trim().slice(0, 60) : null,
      detalle: o.detalle ? String(o.detalle).trim().slice(0, 300) : null, relacionado_id: o.relacionado_id ? String(o.relacionado_id) : null,
      recurrencia: ['semanal', 'mensual', 'trimestral', 'anual'].includes(o.recurrencia) ? o.recurrencia : null };
  }
  // Ordenar al instante con n8n si está configurado; si no, queda para la tarea de cada hora.
  async function ordenarAhora(entry) {
    if (!CONFIG.ordenarUrl) return false;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return false;
    const abiertos = state.items.filter(open).slice(0, 80).map((it) => ({ id: it.id, titulo: it.titulo, tipo: it.tipo, persona: it.persona || null, ambito: it.ambito }));
    const temas = Array.from(new Set(state.items.filter((it) => it.tipo === 'idea' && it.tema).map((it) => it.tema)));
    const reuniones = state.events.filter((e) => !e.todo_el_dia).slice(0, 30).map((e) => e.dia + ' ' + e.titulo);
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(CONFIG.ordenarUrl, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ texto: entry.texto, hoy: ymd(today()), abiertos, temas, reuniones }) });
      if (!r.ok) return false;
      const out = await r.json();
      const outs = (out && Array.isArray(out.salidas) ? out.salidas : []).map(cleanOut).filter((o) => o.titulo);
      if (!outs.length) return false;
      const salidas = [];
      for (const o of outs) {
        const rel = o.relacionado_id ? state.items.find((x) => x.id === o.relacionado_id) : null;
        if (rel && open(rel) && o.tipo !== 'idea' && o.tipo !== 'hablar') {
          const now = new Date(); const upd = { novedad: pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' · de tu Libreta: ' + o.titulo };
          if (o.fecha_limite && !rel.fecha_limite) upd.fecha_limite = o.fecha_limite;
          await sb.from('asuntos').update(upd).eq('id', rel.id);
          salidas.push({ item_id: rel.id, tipo: rel.tipo || 'tarea', titulo: o.titulo, ambito: rel.ambito || 'cng', persona: o.persona, fecha_limite: o.fecha_limite, tema: null, relacionado: rel.titulo, sumado: true });
          continue;
        }
        const doc = newItem({ titulo: o.titulo, tipo: o.tipo, ambito: o.ambito, prioridad: o.prioridad, fecha_limite: o.fecha_limite, persona: o.persona, tema: o.tipo === 'idea' ? (o.tema || 'Sin tema') : null,
          detalle: o.detalle, recurrencia: o.recurrencia, relacionado_con: rel ? rel.id : null, libreta_id: entry.id, origen: 'libreta' });
        const { data: ins, error } = await sb.from('asuntos').insert(doc).select('id').single();
        if (error) throw error;
        salidas.push({ item_id: ins.id, tipo: o.tipo, titulo: o.titulo, ambito: o.ambito, persona: o.persona, fecha_limite: o.fecha_limite, tema: doc.tema, relacionado: rel ? rel.titulo : null, sumado: false });
      }
      await sb.from('libreta').update({ estado: 'ordenada', salidas, ordenada_at: new Date().toISOString() }).eq('id', entry.id);
      return salidas.length;
    } catch (e) { return false; } finally { clearTimeout(to); }
  }
  $('#btnSoltar').addEventListener('click', async () => {
    const texto = $('#suelta').value.trim(); if (!texto || state.busy) return;
    stopMic();
    state.busy = true; $('#btnSoltar').disabled = true; sStatus('Guardando…');
    const { data: entry, error } = await sb.from('libreta').insert({ texto, estado: 'sin_ordenar', origen: 'app' }).select('*').single();
    if (error) { sStatus('No se pudo guardar (' + error.message + '). El texto sigue en la caja.', true); state.busy = false; $('#btnSoltar').disabled = false; return; }
    $('#suelta').value = ''; try { localStorage.removeItem('dp.suelta'); } catch (e) {}
    sStatus(CONFIG.ordenarUrl ? 'Guardado. Ordenando…' : 'Guardado. Lo ordeno en unos minutos.');
    const n = await ordenarAhora(entry);
    if (CONFIG.ordenarUrl) sStatus(n ? (n === 1 ? 'Ordenado: 1 elemento.' : 'Ordenado: ' + n + ' elementos.') : 'Guardado. No he podido ordenarlo ahora; lo hago en unos minutos.');
    state.busy = false; $('#btnSoltar').disabled = false;
    await loadTable('libreta'); await loadTable('asuntos'); renderAll();
  });

  // ---------- dictado (si Safari lo permite; si no, el micrófono del teclado) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recBase = '';
  if (SR) $('#btnMic').hidden = false;
  function stopMic() { if (rec) { try { rec.stop(); } catch (e) {} } }
  $('#btnMic').addEventListener('click', () => {
    if (rec) { stopMic(); return; }
    try { rec = new SR(); } catch (e) { $('#btnMic').hidden = true; return; }
    rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = true;
    recBase = $('#suelta').value ? $('#suelta').value.replace(/\s*$/, ' ') : '';
    rec.onresult = (e) => { let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; $('#suelta').value = recBase + t; };
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { sStatus('El dictado no está permitido aquí: usa el micrófono del teclado.', true); $('#btnMic').hidden = true; } };
    rec.onend = () => { rec = null; $('#btnMic').setAttribute('aria-pressed', 'false'); try { localStorage.setItem('dp.suelta', $('#suelta').value); } catch (e) {} };
    $('#btnMic').setAttribute('aria-pressed', 'true');
    try { rec.start(); } catch (e) { rec = null; $('#btnMic').setAttribute('aria-pressed', 'false'); }
  });

  // ---------- editor ----------
  function openEditor(it) {
    state.editing = it;
    $('#edTitulo').value = it.titulo || ''; $('#edTipo').value = KIND[it.tipo] ? it.tipo : 'tarea'; $('#edAmbito').value = it.ambito || 'cng';
    $('#edPrio').value = it.prioridad || 'normal'; $('#edFecha').value = it.fecha_limite || ''; $('#edPersona').value = it.persona || ''; $('#edPara').value = it.para || '';
    $('#edTema').value = it.tema || ''; $('#edRec').value = it.recurrencia || ''; $('#edDetalle').value = it.detalle || ''; $('#edStatus').textContent = '';
    $('#edDelete').textContent = 'Eliminar'; $('#edDelete').dataset.armed = '';
    $('#edFwd').hidden = !it.enlace || !open(it) || !!pendingRequest(it);
    $('#overlay').hidden = false;
  }
  function closeEditor() { $('#overlay').hidden = true; state.editing = null; }
  $('#edCancel').addEventListener('click', closeEditor);
  $('#overlay').addEventListener('click', (e) => { if (e.target === $('#overlay')) closeEditor(); });
  $('#edSave').addEventListener('click', async () => {
    if (!state.editing) return;
    const titulo = $('#edTitulo').value.trim(); if (!titulo) { $('#edStatus').textContent = 'El título no puede estar vacío.'; return; }
    const data = { titulo, tipo: $('#edTipo').value, ambito: $('#edAmbito').value, prioridad: $('#edPrio').value, fecha_limite: $('#edFecha').value || null,
      persona: $('#edPersona').value.trim() || null, para: $('#edPara').value.trim() || null, tema: $('#edTema').value.trim() || null,
      recurrencia: $('#edRec').value || null, detalle: $('#edDetalle').value.trim() || null };
    $('#edSave').disabled = true;
    const { error } = await sb.from('asuntos').update(data).eq('id', state.editing.id);
    $('#edSave').disabled = false;
    if (error) $('#edStatus').textContent = 'No se pudo guardar (' + error.message + ').';
    else { Object.assign(state.editing, data); closeEditor(); renderAll(); }
  });
  $('#edDelete').addEventListener('click', async () => {
    const b = $('#edDelete');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = '¿Seguro? Eliminar'; return; }
    if (!state.editing) return;
    const { error } = await sb.from('asuntos').delete().eq('id', state.editing.id);
    if (error) $('#edStatus').textContent = 'No se pudo eliminar (' + error.message + ').';
    else { state.items = state.items.filter((x) => x.id !== state.editing.id); closeEditor(); renderAll(); }
  });

  // ---------- pedir borrador ----------
  function openMail(it, tipo) {
    state.mailItem = { it, tipo };
    $('#mTitle').textContent = (tipo === 'recordatorio' ? 'Pedir recordatorio · ' : 'Pedir borrador · ') + (it.titulo || '');
    $('#mInstr').value = ''; $('#mStatus').textContent = ''; $('#mPedir').disabled = false;
    $('#mailOverlay').hidden = false;
  }
  function closeMail() { $('#mailOverlay').hidden = true; state.mailItem = null; }
  $('#mCancel').addEventListener('click', closeMail);
  $('#mailOverlay').addEventListener('click', (e) => { if (e.target === $('#mailOverlay')) closeMail(); });
  $('#mPedir').addEventListener('click', async () => {
    if (!state.mailItem) return;
    $('#mPedir').disabled = true;
    const { it, tipo } = state.mailItem;
    const { error } = await sb.from('solicitudes').insert({ tipo, asunto_id: it.id, instrucciones: $('#mInstr').value.trim() || null });
    if (error) { $('#mStatus').textContent = 'No se pudo pedir (' + error.message + ').'; $('#mPedir').disabled = false; return; }
    closeMail(); await loadTable('solicitudes'); renderAll();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key !== 'Escape') return; if (!$('#fwdOverlay').hidden) closeFwd(); else if (!$('#mailOverlay').hidden) closeMail(); else if (!$('#overlay').hidden) closeEditor(); });

  // ---------- pasar al equipo (V1 · 18/10/2026) ----------
  // Prepara en Gmail un borrador de reenvío del correo original con tu nota; nunca se envía solo. Por defecto a info@cngolf.es.
  function openFwd(it) {
    state.fwdItem = it;
    $('#fTitle').textContent = 'Pasar al equipo · ' + (it.titulo || '');
    $('#fAyuda').textContent = it.equipo
      ? 'Reenvía el hilo completo con tu nota. Queda en tus borradores de Gmail: lo envías tú con un toque. Lo vigilo como encargo durante 2 días laborables: si el equipo responde se cierra solo; si no, te aviso en «A tu firma».'
      : 'Reenvía el correo original completo con tu nota. Queda en tus borradores de Gmail: lo envías tú con un toque. Pasa a «Delegado y en espera» con plazo de 2 días laborables: si el equipo responde se cierra solo; si no, te aviso en «A tu firma».';
    $('#fPara').value = 'info@cngolf.es'; $('#fOtroWrap').hidden = true; $('#fOtro').value = '';
    $('#fNota').value = ''; $('#fStatus').textContent = ''; $('#fPedir').disabled = false;
    if (!$('#overlay').hidden) closeEditor();
    $('#fwdOverlay').hidden = false;
  }
  function closeFwd() { $('#fwdOverlay').hidden = true; state.fwdItem = null; }
  $('#edFwd').addEventListener('click', () => { if (state.editing) openFwd(state.editing); });
  $('#fPara').addEventListener('change', () => { $('#fOtroWrap').hidden = $('#fPara').value !== 'otro'; });
  $('#fCancel').addEventListener('click', closeFwd);
  $('#fwdOverlay').addEventListener('click', (e) => { if (e.target === $('#fwdOverlay')) closeFwd(); });
  $('#equipo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-eqfwd]'); if (!b) return;
    const p = (state.eqPend || [])[Number(b.dataset.eqfwd)]; if (!p || !p.enlace) return;
    openFwd({ equipo: true, titulo: eqAsunto(p), enlace: p.enlace });
  });
  $('#fPedir').addEventListener('click', async () => {
    const it = state.fwdItem; if (!it) return;
    const sel = $('#fPara'); const otro = sel.value === 'otro';
    const para = (otro ? $('#fOtro').value : sel.value).trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(para)) { $('#fStatus').textContent = 'Escribe un correo válido.'; return; }
    const nombre = otro ? para : sel.options[sel.selectedIndex].dataset.nombre || para;
    $('#fPedir').disabled = true;
    const { error } = await sb.from('solicitudes').insert({ tipo: 'reenvio', asunto_id: it.equipo ? null : it.id, enlace: it.equipo ? it.enlace : null, para, para_nombre: nombre, instrucciones: $('#fNota').value.trim() || null });
    if (error) { $('#fStatus').textContent = 'No se pudo pedir (' + error.message + ').'; $('#fPedir').disabled = false; return; }
    closeFwd(); await loadTable('solicitudes'); renderAll();
  });

  // ---------- arranque ----------
  async function showFor(session) {
    const ok = session && session.user && session.user.email === 'sergio.vela@cngolf.es';
    $('#loginView').hidden = !!ok; $('#appView').hidden = !ok;
    if (session && !ok) lgStatus('Este acceso es solo para Sergio Vela.', true);
    if (ok) { header(); renderAll(); await loadAll(); subscribe(); }
  }
  sb.auth.onAuthStateChange((_ev, session) => { showFor(session); });
  sb.auth.getSession().then(({ data }) => showFor(data.session));
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
})();
