// Despacho · app de Sergio Vela. Datos en Supabase (proyecto asistente-vela), solo visibles con su sesión.
(function () {
  'use strict';
  const CONFIG = {
    url: 'https://ykflueekyeqprolrblap.supabase.co',
    key: 'sb_publishable_6EfiKCg6WZHftOYPKt24zA_wCpRDjBZ',
    // Ordenar al instante vía n8n (OpenAI). Vacío: lo ordena la tarea de cada hora.
    ordenarUrl: '',
  };
  const $ = (s, r) => (r || document).querySelector(s);
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
  function renderFirma() {
    const list = firmaList();
    $('#firmaN').textContent = list.length ? 'por urgencia' : '';
    $('#firma').innerHTML = list.length ? list.map((it, i) => {
      const n = daysUntil(it.fecha_limite); const urg = it.prioridad === 'urgente' || (n !== null && n <= 0);
      const pr = pendingRequest(it);
      return '<article class="firma' + (urg ? ' urg' : '') + '" data-id="' + esc(it.id) + '">' +
        '<div class="fhead"><span class="fnum">' + (i + 1) + '</span><h3>' + esc(it.titulo) + '</h3>' +
        (it.detalle ? '<p class="why">' + esc(it.detalle) + '</p>' : '') + '<div class="chips">' + chipsFor(it) + '</div></div>' +
        (it.novedad ? '<p class="nov"><b>Novedad</b>' + esc(it.novedad) + '</p>' : '') +
        (it.recomendacion ? '<p class="reco"><b>Recomiendo</b>' + esc(it.recomendacion) + '</p>' : '') +
        (pr ? '<p class="pend">' + (pr.tipo === 'reenvio' ? 'Reenvío a ' + esc(pr.para_nombre || pr.para || 'info@') + ' pedido a las ' : 'Borrador pedido a las ') + hhmm(pr.at) + ': estará en tus borradores de Gmail en unos segundos.</p>' : '') +
        '<div class="acts">' + (pr ? '' : '<button class="btn go" data-action="mail">Pedir borrador</button>' + (it.enlace ? '<button class="btn" data-action="fwd">Pasar al equipo</button>' : '')) +
        '<button class="btn" data-action="done">Hecho</button><button class="btn ghost" data-action="later">Mañana</button>' +
        (it.enlace ? '<a class="btn ghost" href="' + esc(it.enlace) + '" target="_blank" rel="noopener">Abrir hilo</a>' : '') +
        '<button class="btn ghost" data-action="edit">Editar</button></div></article>';
    }).join('') : '<p class="empty-s">Nada urgente que firmar. Lo demás está en «Tus tareas».</p>';
    const fallos = state.solicitudes.filter((s) => s.estado === 'error');
    if (fallos.length) $('#firma').innerHTML = fallos.map((s) => { const it = state.items.find((x) => x.id === s.asunto_id); return '<p class="pend">No pude preparar el ' + (s.tipo === 'reenvio' ? 'reenvío' : 'borrador') + (it ? ' de «' + esc(it.titulo) + '»' : s.enlace ? ' del correo de «Equipo»' : '') + ': ' + esc(s.resultado || 'error') + '</p>'; }).join('') + $('#firma').innerHTML;
  }
  // Agenda: copia del calendario que mantienen las tareas automáticas.
  const isTorneo = (e) => !!e.torneo;
  function eventsOn(day) { return state.events.filter((e) => e.dia <= day && day <= (e.dia_fin || e.dia)); }
  function torneoName(e) { const s = String(e.titulo || '').trim(); const m = s.match(/^(PO|PR|PB|AB|A|B|F|P)\s+(.+)$/); return m ? { codigo: m[1], nombre: m[2] } : { codigo: null, nombre: s }; }
  function timeRange(e) {
    if (e.todo_el_dia) { const a = e.dia, b = e.dia_fin || e.dia; return a === b ? 'todo el día' : parseYmd(a).getDate() + '–' + parseYmd(b).getDate() + ' ' + MES3[parseYmd(b).getMonth()]; }
    return hhmm(e.inicio) + (e.fin ? '–' + hhmm(e.fin) : '');
  }
  function clashes(evs) {
    const timed = evs.filter((e) => !e.todo_el_dia && e.inicio && e.fin && e.mi_respuesta !== 'declined'); const set = new Set();
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
  function renderAgenda() {
    const el = $('#agenda');
    const last = state.events.reduce((m, e) => (e.actualizado_at > m ? e.actualizado_at : m), '');
    $('#agendaSub').textContent = last ? 'actualizada ' + hhmm(last) : '';
    const days = agendaDays();
    if (!days.length) { el.innerHTML = '<p class="empty-s">' + (state.loaded ? 'Sin reuniones ni torneos en los próximos días.' : 'Cargando la agenda…') + '</p>'; return; }
    el.innerHTML = days.map(({ d, ds, evs }) => {
      evs.sort((a, b) => (a.todo_el_dia ? '0' : '1' + a.inicio).localeCompare(b.todo_el_dia ? '0' : '1' + b.inicio));
      const cl = clashes(evs);
      const reuniones = evs.filter((e) => !e.todo_el_dia && !isTorneo(e)).length, torneos = evs.filter(isTorneo).length;
      const sinResp = evs.filter((e) => e.mi_respuesta === 'needsAction').length;
      const alerts = [];
      if (cl.size) alerts.push('se pisan ' + cl.size + ' reuniones');
      if (reuniones >= 3 || (reuniones >= 2 && torneos)) alerts.push('día cargado');
      if (sinResp) alerts.push(sinResp === 1 ? '1 convocatoria sin responder' : sinResp + ' convocatorias sin responder');
      const title = (ds === ymd(today()) ? 'Hoy · ' : ds === ymd(addDays(today(), 1)) ? 'Mañana · ' : '') + DIAS[d.getDay()].replace(/^./, (c) => c.toUpperCase()) + ' ' + d.getDate();
      return '<div class="day"><div class="dayh"><h3>' + esc(title) + '</h3>' + (alerts.length ? '<span class="alert">' + esc(alerts.join(' · ')) + '</span>' : '') + '</div>' +
        evs.map((e) => {
          const tor = isTorneo(e); const tn = tor ? torneoName(e) : null;
          const name = tor ? (tn.codigo ? tn.codigo + ' · ' : '') + tn.nombre : (e.titulo || '(sin título)');
          const link = e.enlace ? '<a href="' + esc(e.enlace) + '" target="_blank" rel="noopener">' + esc(name) + '</a>' : esc(name);
          const lines = [];
          if (cl.has(e.id)) lines.push('<p class="p warn"><b>Choque</b>Se pisa con otra reunión de este día.</p>');
          if (e.mi_respuesta === 'needsAction') lines.push('<p class="p warn"><b>Sin responder</b>No has contestado a la convocatoria.</p>');
          const pr = state.prep[e.id]; if (pr && pr.texto) lines.push('<p class="p"><b>Prepara</b>' + esc(pr.texto) + '</p>');
          const hb = tor ? [] : hablarFor(e); if (hb.length) lines.push('<p class="p"><b>Saca</b>' + esc(hb.map((h) => h.titulo).join(' · ')) + '</p>');
          return '<div class="ev' + (tor ? ' tor' : '') + '"><span class="t' + (cl.has(e.id) ? ' clash' : '') + '">' + esc(timeRange(e)) + '</span><span class="s">' + link + '</span>' + lines.join('') + '</div>';
        }).join('') + '</div>';
    }).join('');
  }
  function renderDelegado() {
    const list = cng().filter((it) => open(it) && (it.tipo === 'seguimiento' || it.tipo === 'pedido')).sort((a, b) => urgency(a) - urgency(b));
    $('#delN').textContent = list.length || '';
    $('#delegado').innerHTML = list.length ? list.map((it) => {
      const who = it.tipo === 'pedido' ? (it.proveedor || 'Proveedor') + (it.persona ? ' · ' + it.persona : '') : (it.persona || 'Sin asignar');
      const st = it.tipo === 'pedido' ? (PED[it.pedido_estado] || 'pedido') + (it.pedido_estado_at ? ' · ' + ago(it.pedido_estado_at) : '') : it.fecha_limite ? 'para ' + relDate(it.fecha_limite) : 'desde ' + ago(it.created_at);
      const pr = pendingRequest(it);
      return '<div class="del" data-id="' + esc(it.id) + '"><button class="tick" data-action="done" aria-label="Marcar como resuelto"></button>' +
        '<div><span class="who">' + esc(who) + '</span><p class="what">' + esc(it.titulo) + '</p>' +
        (it.novedad ? '<p class="note">' + esc(it.novedad) + '</p>' : it.detalle ? '<p class="note">' + esc(it.detalle) + '</p>' : '') +
        (pr ? '<p class="pend">Recordatorio pedido: estará en tus borradores en menos de una hora.</p>' : '') + '</div>' +
        '<span class="state' + (it.pedido_estado === 'entregado' ? ' done' : '') + '">' + esc(st) + '</span>' +
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
    // Libreta V2 (18/10/2026 · Sr. Vela): sin párrafos dictados y sin lo ya hecho. Solo lo soltado en los últimos 7 días que sigue abierto
    // (las ideas van en «Ideas por tema»), más las notas que aún se están ordenando para que conste que han llegado.
    const desde = ymd(addDays(today(), -7)); const vistos = new Set(); const filas = []; const ordenando = [];
    state.libreta.forEach((l) => {
      if (l.estado !== 'ordenada') { ordenando.push(l); return; }
      if (!l.at || localDay(l.at) < desde) return;
      (Array.isArray(l.salidas) ? l.salidas : []).forEach((o) => {
        if (!o || !o.item_id || vistos.has(o.item_id) || o.tipo === 'idea') return;
        const it = state.items.find((x) => x.id === o.item_id);
        if (!it || !open(it) || it.tipo === 'idea') return;
        vistos.add(it.id); filas.push({ it, o, at: l.at });
      });
    });
    const cuando = (at) => localDay(at) === ymd(today()) ? 'hoy' : fmtShort(localDay(at));
    const htmlOrd = ordenando.map((l) => { const t = String(l.texto || '').replace(/\s+/g, ' ').trim(); return '<li><span class="kind">Ordenando</span><span class="muted">' + esc(t.length > 70 ? t.slice(0, 70) + '…' : t) + '</span></li>'; }).join('');
    const htmlFil = filas.map(({ it, o, at }) => '<li data-id="' + esc(it.id) + '"><button class="tick" data-action="done" aria-label="Marcar como hecha"></button><span class="t" data-action="edit"><span class="kind">' + esc(KIND[it.tipo] || it.tipo || 'Tarea') + '</span> ' + esc(o.sumado ? (o.relacionado || it.titulo) : it.titulo) +
      (it.persona ? ' · ' + esc(it.persona) : '') + (o.sumado ? ' <span class="link">· añadido</span>' : '') + '</span><span class="r">' + esc(it.fecha_limite ? relDate(it.fecha_limite) : cuando(at)) + '</span></li>').join('');
    $('#libreta').innerHTML = (htmlOrd ? '<ul class="outs">' + htmlOrd + '</ul>' : '') + (htmlFil ? '<ul class="fl">' + htmlFil + '</ul>' :
      (htmlOrd ? '' : '<p class="empty-s">Nada pendiente de lo que has soltado esta semana.</p>'));
    const ideas = cng().filter((it) => open(it) && it.tipo === 'idea'); const by = {};
    ideas.forEach((it) => { const t = it.tema || 'Sin tema'; (by[t] = by[t] || []).push(it); });
    const keys = Object.keys(by).sort();
    $('#temas').innerHTML = keys.length ? '<h3 class="label" style="margin-top:8px">Ideas por tema</h3><div class="temas">' + keys.map((k) =>
      '<div class="tema"><h4>' + esc(k) + ' <span class="muted" style="font-weight:400">· ' + by[k].length + '</span></h4><ul>' + by[k].map((it) => '<li data-id="' + esc(it.id) + '"><span data-action="edit" style="cursor:pointer">' + esc(it.titulo) + '</span></li>').join('') + '</ul></div>').join('') + '</div>' : '';
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
    $('#nTareas').textContent = tareas.length || '';
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
    el.innerHTML = (pend.length
      ? '<div class="eqsum">' + sum + '</div><ul class="eqlist">' + rows + '</ul>'
      : '<div class="eqok">✓ El equipo está al día: ningún cliente esperando respuesta.</div>') +
      resHtml + '<p class="eqmeta">Comprobado en Gmail ' + esc(cuando) + '. Se actualiza cada 3 horas.</p>';
  }
  // Tarjeta de juego (V2 22/10/2026): las cuatro cifras del día; cada casilla lleva a su sección.
  function renderScore() {
    const hoy = ymd(today()), fin = ymd(addDays(today(), 14)); const now = new Date();
    const firma = firmaList().length;
    const reun = state.events.filter((e) => e.dia === hoy && !e.todo_el_dia && !isTorneo(e) && (!e.fin || new Date(e.fin) > now)).length;
    const r = state.revision; const eq = r && Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo.length : null;
    const tor = new Set(state.events.filter((e) => isTorneo(e) && (e.dia_fin || e.dia) >= hoy && e.dia <= fin).map((e) => e.dia + e.titulo)).size;
    const cell = (href, n, txt, hot) => '<a href="' + href + '"' + (hot ? ' class="hot"' : '') + '><b>' + (n === null ? '–' : n) + '</b><span>' + txt + '</span></a>';
    $('#score').innerHTML = cell('#h-firma', firma, 'a tu firma', firma > 0) + cell('#h-agenda', reun, reun === 1 ? 'reunión hoy' : 'reuniones hoy') +
      cell('#h-eq', eq, 'equipo pendiente', eq !== null && eq > 5) + cell('#h-radar', tor, tor === 1 ? 'torneo en 14 d' : 'torneos en 14 d');
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
  // P79/P80 (27/10/2026): cabecera verde = reservas por unidad (hoy y próximos 7 días) y, debajo, un único total:
  // reservas de hoy + dinero de ayer (devengado, cifra de cabecera del Informe Diario). Sin desglose económico.
  // P80 (27/10/2026): desde las 19:00 se muestran las reservas de MAÑANA (D4 V1.1.0 → unidades.manana).
  // Comparativa con el mismo día de la semana pasada a la misma hora (Supabase · reservas_historico), salvo Escuela.
  function renderReservas() {
    const el = $('#bizres'); const v = state.vivo; const d = v && v.datos; const u = d && d.unidades;
    if (!u || !u.hoy || d.fecha !== ymd(today())) { el.hidden = true; return null; }
    const noche = new Date().getHours() >= 19 && u.manana && typeof u.manana === 'object';
    const blq = noche ? u.manana : u.hoy; const cuando = noche ? 'mañana' : 'hoy';
    const cmp = d.comparativa && d.comparativa[noche ? 'manana' : 'hoy'];
    const ETQ = { 'Escuela': ['Escuela', 'clases', 'alumnos'], 'Gourmet Experience': ['Gourmet', 'bahías', 'personas'], 'Fitting': ['Fitting', 'sesiones', null] };
    const d7 = u.d7 || {};
    const num = (x) => x && typeof x.reservas === 'number' ? x.reservas : (u.completo ? 0 : null);
    const areas = Array.from(new Set(Object.keys(blq).concat(Object.keys(d7))))
      .sort((a, b) => ((num(blq[b]) || 0) - (num(blq[a]) || 0)) || ((num(d7[b]) || 0) - (num(d7[a]) || 0)));
    const ref = cmp && cmp.fecha_ref ? fmtShort(cmp.fecha_ref) : '';
    const flecha = (a, n) => {
      if (a === 'Escuela' || n === null || !cmp || !cmp.unidades || !cmp.unidades[a]) return '';
      const sp = cmp.unidades[a].semana_pasada; if (typeof sp !== 'number') return '';
      const dl = n - sp; const c = dl > 0 ? 'up' : dl < 0 ? 'dn' : 'eq';
      return '<span class="cmp ' + c + '">' + (dl > 0 ? '▲ +' + dl : dl < 0 ? '▼ ' + dl : '= ') + ' vs ' + esc(ref) + ' (' + sp + ')</span>';
    };
    const celda = (a) => { const x = blq[a]; const n = num(x); const e = ETQ[a] || [a, 'reservas', null]; const s7 = num(d7[a]);
      return '<div><b>' + (n === null ? '—' : esc(String(n))) + '</b><span>' + esc(e[0] + ' · ' + e[1]) + '</span>'
        + '<span>' + esc((e[2] && x && x.personas > 0 ? x.personas + ' ' + e[2] + ' · ' : '') + '7 d: ' + (s7 === null ? '—' : s7)) + '</span>' + flecha(a, n) + '</div>'; };
    const golf = areas.some((a) => /golf|campo|green/i.test(a) && !/gourmet/i.test(a)) ? '' : '<div><b>—</b><span>Golf</span><span>hasta el 02/11</span></div>';
    el.hidden = false;
    el.innerHTML = '<p class="bizcap">Reservas ' + cuando + ' por unidad · GolfManager ' + esc(hhmm(d.generado)) + (u.completo ? '' : ' · lectura incompleta') + '</p><div class="biz">' + areas.map(celda).join('') + golf + '</div>';
    if (!u.completo) return { n: null, cuando };
    return { n: areas.reduce((t, a) => t + (num(blq[a]) || 0), 0), cuando };
  }
  function renderTotal(res) {
    const el = $('#biztot'); const s = state.sync; const n = s && s.datos && s.datos.negocio;
    const din = n && localDay(s.at) === ymd(today()) ? eur(n.devengado_ayer) : null;
    const totRes = res ? res.n : null;
    if (totRes == null && !din) { el.hidden = true; return; }
    const cells = [];
    cells.push('<div><b>' + (totRes == null ? '—' : esc(String(totRes))) + '</b><span>reservas ' + (res ? res.cuando : 'hoy') + ' · total</span></div>');
    cells.push('<div><b>' + esc(din || '—') + '</b><span>devengado ayer · total' + (n && n.fecha_datos ? ' · ' + esc(fmtShort(n.fecha_datos)) : '') + '</span>'
      + (n && n.unidades_sin_datos ? '<span>sin Golf ni resto hasta el 02/11</span>' : '') + '</div>');
    el.hidden = false;
    el.innerHTML = '<div class="biz tot">' + cells.join('') + '</div>';
  }
  function renderBiz() { renderTotal(renderReservas()); }
  // P81 (28/10/2026): quién trabaja en Caddy Master, Gestión de Juego y Fitting (turnos de GolfManager vía D4).
  // Desde las 19:00, los de mañana, igual que las reservas. Ausencias sin motivo. Sin dato = «no disponible», nunca vacío inventado.
  function renderTurnos() {
    const el = $('#turnos'); const v = state.vivo; const d = v && v.datos; const u = d && d.unidades; const t = u && u.turnos;
    const noche = new Date().getHours() >= 19;
    $('#h-turnos').textContent = noche ? 'Trabajan mañana' : 'Trabajan hoy';
    if (!d || d.fecha !== ymd(today()) || !t || t.version !== 'P81') {
      $('#turnosSub').textContent = ''; el.innerHTML = '<p class="empty-s">' + (state.loaded ? 'Turnos no disponibles ahora mismo.' : 'Cargando turnos…') + '</p>'; return;
    }
    const blq = t[noche ? 'manana' : 'hoy'] || {};
    $('#turnosSub').textContent = 'GolfManager ' + hhmm(d.generado) + (t.ausencias ? '' : ' · sin datos de ausencias');
    const ahora = new Date(); const hm = pad(ahora.getHours()) + ':' + pad(ahora.getMinutes());
    const DEPS = ['Caddy Master', 'Gestión de Juego', 'Fitting'];
    el.innerHTML = DEPS.map((dep) => {
      const gente = Array.isArray(blq[dep]) ? blq[dep] : [];
      const activos = gente.filter((p) => !p.ausente).length;
      const filas = gente.map((p) => {
        const dentro = !noche && !p.ausente && p.desde && p.hasta && p.desde <= hm && hm < p.hasta;
        return '<li class="' + (p.ausente ? 'aus' : dentro ? 'now' : '') + '"><span class="h">' + esc((p.desde || '–') + '–' + (p.hasta || '–')) + '</span><span class="n">' + esc(p.nombre) +
          (p.rol ? ' <span class="muted">· ' + esc(p.rol) + '</span>' : '') + '</span><span class="k">' + (p.ausente ? 'ausente' : dentro ? 'ahora' : '') + '</span></li>';
      }).join('');
      return '<div class="tdep"><div class="tdh"><h3>' + esc(dep) + '</h3><span class="' + (activos ? 'label' : 'alert') + '">' + (activos ? activos + (activos === 1 ? ' persona' : ' personas') : 'nadie con turno') + '</span></div>' +
        (filas ? '<ul>' + filas + '</ul>' : '') + '</div>';
    }).join('');
  }
  // P82 (28/10/2026): «Operación de hoy» — campo, torneo del día, golf, clientes y tiempo. Todo copiado de su fuente
  // (Informe Diario vía sync, GolfManager vía D4, Calendar vía agenda). Lo que no hay se dice; nunca 0 inventado.
  const SEMCLS = { verde: 'ok', 'ámbar': 'warn', ambar: 'warn', rojo: 'bad' };
  function cardOp(titulo, cuerpo, pie, cls) { return '<div class="op' + (cls ? ' ' + cls : '') + '"><h3>' + titulo + '</h3>' + cuerpo + (pie ? '<p class="opf">' + pie + '</p>' : '') + '</div>'; }
  function renderOperacion() {
    const el = $('#operacion'); const s = state.sync; const hoyS = s && localDay(s.at) === ymd(today()) ? s.datos || {} : null;
    const noche = new Date().getHours() >= 19; const dia = noche ? ymd(addDays(today(), 1)) : ymd(today());
    $('#h-op').textContent = noche ? 'Operación de mañana' : 'Operación de hoy';
    $('#opSub').textContent = hoyS && hoyS.informe_hora ? 'informe de las ' + hoyS.informe_hora : '';
    const cards = [];
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
  function renderSemana() {
    const w = state.semana; const box = $('#semanaFold');
    if (!w) { box.hidden = true; return; }
    box.hidden = false;
    $('#semanaLine').textContent = 'Tu semana' + (w.desde && w.hasta ? ' (' + fmtShort(w.desde) + ' a ' + fmtShort(w.hasta) + ')' : '');
    const li = (t, r) => '<li class="plain"><span>' + t + '</span><span class="r">' + esc(r || '') + '</span></li>';
    const lista = (arr) => (Array.isArray(arr) ? arr : []).map((x) => esc(typeof x === 'string' ? x : (x.titulo || x.nombre || '') + (x.persona ? ' (' + x.persona + ')' : '') + (x.dia ? ' · ' + x.dia : ''))).join('<br>');
    const c = w.cerradas; const cn = typeof c === 'object' && c ? c.total ?? c.n : c; const auto = typeof c === 'object' && c ? c.solos ?? c.auto : null;
    let html = '';
    if (w.frase) html += '<li class="plain"><span><b>' + esc(w.frase) + '</b></span><span></span></li>';
    if (cn != null) html += li('Cerradas', cn + (auto ? ' (' + auto + ' solas)' : ''));
    if (w.entraron != null) html += li('Entraron', String(typeof w.entraron === 'object' ? w.entraron.total ?? '' : w.entraron));
    if (Array.isArray(w.parados) && w.parados.length) html += li('Parados más de 7 días<br><span class="muted">' + lista(w.parados) + '</span>', String(w.parados.length));
    if (Array.isArray(w.delegado_vencido) && w.delegado_vencido.length) html += li('Delegado vencido<br><span class="muted">' + lista(w.delegado_vencido) + '</span>', String(w.delegado_vencido.length));
    if (Array.isArray(w.torneos_proxima) && w.torneos_proxima.length) html += li('Torneos de la semana que viene<br><span class="muted">' + lista(w.torneos_proxima) + '</span>', String(w.torneos_proxima.length));
    $('#semana').innerHTML = html || '<li class="plain"><span class="muted">Sin datos de la semana.</span><span></span></li>';
  }
  function renderAll() { header(); renderScore(); renderFresh(); renderBiz(); renderOperacion(); renderTurnos(); renderSemana(); renderParte(); renderFirma(); renderAgenda(); renderDelegado(); renderEquipo(); renderRadar(); renderLibreta(); renderFolds(); renderHecho(); }

  // ---------- datos ----------
  function showBanner(msg, err) { const b = $('#banner'); b.textContent = msg; b.className = 'banner' + (err ? ' err' : ''); b.hidden = !msg; }
  async function loadTable(t) {
    const hoy = ymd(addDays(today(), -1));
    let q;
    if (t === 'asuntos') q = sb.from('asuntos').select('*');
    else if (t === 'agenda') q = sb.from('agenda').select('*').gte('dia_fin', hoy).order('dia');
    else if (t === 'prep') q = sb.from('prep').select('*').gte('fecha', hoy);
    else if (t === 'briefings') q = sb.from('briefings').select('*').order('at', { ascending: false }).limit(1);
    else if (t === 'revisiones') q = sb.from('revisiones').select('*').order('at', { ascending: false }).limit(1);
    else if (t === 'libreta') q = sb.from('libreta').select('*').order('at', { ascending: false }).limit(20);
    else if (t === 'sync') q = sb.from('sync').select('*').order('id', { ascending: false }).limit(1);
    else if (t === 'cierres') q = sb.from('cierres').select('*').gte('fecha', ymd(addDays(today(), -7))).order('fecha', { ascending: false }).limit(7);
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
    else if (t === 'cierres') { const s = data.find((c) => c.datos && c.datos.semana); state.semana = s ? { fecha: s.fecha, ...s.datos.semana } : null; }
  }
  const TABLES = ['asuntos', 'agenda', 'prep', 'briefings', 'revisiones', 'libreta', 'solicitudes', 'sync', 'cierres', 'negocio_vivo'];
  async function loadAll() { await Promise.all(TABLES.map(loadTable)); state.loaded = true; renderAll(); }
  let channel = null, reloadTimer = {};
  function subscribe() {
    if (channel) return;
    channel = sb.channel('despacho');
    TABLES.forEach((t) => channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
      clearTimeout(reloadTimer[t]); reloadTimer[t] = setTimeout(async () => { await loadTable(t); renderAll(); }, 250);
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
    sStatus(CONFIG.ordenarUrl ? 'Guardado. Ordenando…' : 'Guardado. Lo ordeno en menos de una hora.');
    const n = await ordenarAhora(entry);
    if (CONFIG.ordenarUrl) sStatus(n ? (n === 1 ? 'Ordenado: 1 elemento.' : 'Ordenado: ' + n + ' elementos.') : 'Guardado. No he podido ordenarlo ahora; lo hago en menos de una hora.');
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
      ? 'Reenvía el hilo completo con tu nota. Queda en tus borradores de Gmail: lo envías tú con un toque.'
      : 'Reenvía el correo original completo con tu nota. Queda en tus borradores de Gmail: lo envías tú con un toque. El asunto pasa a «Delegado y en espera».';
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
