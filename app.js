// Despacho · app de Sergio Vela. Datos en Supabase (proyecto asistente-vela), solo visibles con su sesión.
// V3 (08/11/2026 · Sr. Vela, P109): cabecera corta + barra de saltos; tres bloques (Ahora · Hoy · Seguimiento); «Hoy» en una sola
// tarjeta (línea del día, baldosas, turnos como franja horaria); negocio plegado; «A tu firma» con dos botones; Libreta como notas.
// P110 (14/11/2026 · Sr. Vela): «jugadores hoy» (baldosa y tarjeta Golf) en vivo desde GolfManager vía D4, con su hora; el Informe
// Diario de la mañana queda como respaldo y la ocupación sigue siendo la del Informe, etiquetada con su hora.
// P111 (14/11/2026 · Sr. Vela): alquileres (buggies, carros eléctricos y manuales) como casilla propia en «Negocio de hoy», y en
// «Hoy en el centro» filas de jugadores de golf y de alquileres con hoy · ya dados · quedan (GolfManager vía D4 V1.6.0).
// V4 (14/11/2026 · Sr. Vela): azul y tarjetas limpias; cinco bloques (Ahora · Lo tuyo · El centro · Equipo · Seguimiento); las salidas
// reservadas en GolfManager a su nombre no son reuniones (una línea plegada, fuera de choques y cifras); el parte marca lo nuevo y dice
// «sin cambios» cuando repite; asunto vacío del buzón con respaldo; aplazar (mañana · lunes · semana · fecha) y «esperando a» en el editor;
// estado tranquilo cuando no hay nada suyo; Personal con vencimientos de 30 días.
// V6 (21/11/2026 · Sr. Vela): tablero de inicio, cuatro pestañas con barra inferior y micrófono, escudo, novedades, modo torneo,
// dato caducado, tendencia de 7 días, Clientes, incidencias dictadas, deshacer y último estado guardado. Lo nuevo va al final, en «V6».
// V4.1 (15/11/2026 · Sr. Vela): de medianoche a la primera lectura del día, «Hoy», «Trabajan hoy» y la ocupación usan el bloque
// «mañana» de la última lectura de GolfManager de ayer, etiquetado «de ayer HH:MM». Lo que no trae ese bloque (ventas de hoy,
// ya dadas) sale «no disponible», nunca 0. El Informe Diario (campo, clientes) sigue esperando a la sincronización de la mañana.
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
  const openPref = {};
  document.querySelectorAll('details[id]').forEach((d) => {
    try { const v = localStorage.getItem('dp6.open.' + d.id); if (v === '1') { d.open = true; openPref[d.id] = true; } else if (v === '0') { d.open = false; openPref[d.id] = true; } } catch (e) {}
    d.addEventListener('toggle', () => { if (d.dataset.auto) { delete d.dataset.auto; return; } try { localStorage.setItem('dp6.open.' + d.id, d.open ? '1' : '0'); } catch (e) {} });
  });
  // Abierto por defecto según el dato (p. ej. Equipo cuando hay clientes esperando), salvo que ya lo hayas dejado como quieres.
  function defaultOpen(id, val) { const d = document.getElementById(id); if (!d || openPref[id] || d.open === !!val) return; d.dataset.auto = '1'; d.open = !!val; }
  // La barra de saltos abre el desplegable al que lleva.
  document.addEventListener('click', (ev) => { const a = ev.target.closest('.jumps a'); if (!a) return; const t = document.querySelector(a.getAttribute('href')); const d = t && t.closest('details'); if (d && !d.open) d.open = true; });
  const sb = window.supabase.createClient(CONFIG.url, CONFIG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const state = { items: [], view: 'cng', events: [], prep: {}, briefing: null, briefingPrev: null, revision: null, libreta: [], solicitudes: [], sync: null, vivoRaw: null, semana: null, editing: null, busy: false, mailItem: null, loaded: false };
  const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const DIAS3 = ['dom','lun','mar','mié','jue','vie','sáb'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const PRIO = { urgente: 0, alta: 1, normal: 2, baja: 3 };
  const CODIGOS = { P: 'propio', F: 'federativo', PO: 'pool', PR: 'privado', PB: 'privado benéfico', A: 'abierto', AB: 'abierto benéfico', B: 'benéfico' };
  const PED = { pedido: 'pedido', confirmado: 'confirmado', enviado: 'en camino', entregado: 'entregado', incidencia: 'incidencia' };
  const KIND = { tarea: 'Para hacer', seguimiento: 'Encargo', hablar: 'Hablar con', idea: 'Idea', vencimiento: 'Vencimiento', pedido: 'Pedido' };
  const EMAIL = 'sergio.vela@cngolf.es';
  // V6 · incidencia del día: un asunto marcado en `extra`; vive solo en Centro › Incidencias.
  const isInc = (it) => !!(it && it.extra && it.extra.incidencia);

  // ---------- fechas ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function parseYmd(s) { if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function daysUntil(s) { const d = parseYmd(s); return d ? Math.round((d - today()) / 86400000) : null; }
  function localDay(iso) { if (!iso) return null; const d = new Date(iso); return isNaN(d) ? null : ymd(d); }
  function hhmm(iso) { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  // V4.1: lectura de GolfManager válida para hoy. Si es de ayer y trae el bloque «mañana», ese bloque pasa a ser el de hoy.
  function vivoDelDia(raw) {
    const d = raw && raw.datos; if (!d || d.fecha === ymd(today())) return raw;
    const u = d.unidades; if (d.fecha !== ymd(addDays(today(), -1)) || !u || !u.manana || typeof u.manana !== 'object') return raw;
    const mov = (x, extra) => x && typeof x === 'object' ? Object.assign({}, x, { hoy: x.manana, manana: null }, extra || {}) : x;
    const u2 = Object.assign({}, u, { hoy: u.manana, manana: null, ventas_hoy: null, hoy_hechas: null,
      turnos: mov(u.turnos), torneos_gm: mov(u.torneos_gm), alquileres: mov(u.alquileres, { hoy_hechas: null }) });
    const cmp = d.comparativa && d.comparativa.manana ? { hoy: d.comparativa.manana } : null;
    return Object.assign({}, raw, { datos: Object.assign({}, d, { fecha: ymd(today()), unidades: u2, comparativa: cmp, deAyer: true }) });
  }
  Object.defineProperty(state, 'vivo', { get() { return vivoDelDia(this.vivoRaw); }, set(v) { this.vivoRaw = v; } });
  const horaVivo = (d) => d && d.generado ? (d.deAyer ? 'de ayer ' : '') + hhmm(d.generado) : '';
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
  ($('#lgUp') || document.createElement('button')).addEventListener('click', async () => {
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
    $('#dateLine').textContent = DIAS3[t.getDay()] + ' ' + t.getDate() + ' ' + MES3[t.getMonth()] + ' · ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
    const h = t.getHours();
    $('#greet').innerHTML = (h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches') + ', Sergio';
  }
  try { const v = localStorage.getItem('dp.view'); if (v === 'personal' || v === 'cng') state.view = v; } catch (e) {}
  function applyView() {
    $('#tabCng').setAttribute('aria-selected', String(state.view === 'cng'));
    $('#tabPer').setAttribute('aria-selected', String(state.view === 'personal'));
    $('#cng').hidden = state.view !== 'cng'; $('#per').hidden = state.view !== 'personal';
    // V4: la barra de saltos y la frescura del equipo son de la vista CNG.
    const j = $('.jumps'); if (j) j.hidden = state.view !== 'cng'; const f = $('#fresh'); if (f) f.hidden = state.view !== 'cng'; applyTab();
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
    return cng().filter((it) => open(it) && (it.tipo === 'tarea' || !it.tipo) && !blocker(it) && !snoozed(it) && !isInc(it))
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
    // V4: frente al parte anterior, lo nuevo lleva un punto; si repite entero, se dice «sin cambios desde las HH:MM».
    const prev = state.briefingPrev && state.briefingPrev.texto ? new Set(String(state.briefingPrev.texto).split(/\n+/).map((s) => s.trim()).filter(Boolean)) : null;
    const nuevas = prev ? lines.filter((l) => !prev.has(l)) : lines;
    const sinCambios = prev && !nuevas.length && state.briefingPrev.at;
    const cls = (l) => [cerrados.length && cerradoEn(l) ? 'done' : '', prev && nuevas.length && nuevas.length < lines.length && !prev.has(l) ? 'new' : ''].filter(Boolean).join(' ');
    el.innerHTML = lines.map((l) => { const c = cls(l); return '<p' + (c ? ' class="' + c + '"' : '') + '>' + esc(l) + '</p>'; }).join('') + despues + calmHtml() +
      (at ? '<span class="when">Parte de ' + esc(at) + (sinCambios ? ' · sin cambios desde las ' + hhmm(state.briefingPrev.at) : nuevas.length && nuevas.length < lines.length ? ' · lo nuevo, con el número en azul' : '') + (cerrados.length ? '; lo de arriba puede estar ya resuelto' : '') + '</span>' : '');
  }
  // V4 · estado tranquilo: si no hay nada suyo (firma, tareas, encargos), una sola línea en vez de secciones vacías.
  function calmHtml() {
    if (!state.loaded) return '';
    const mios = cng().filter((it) => open(it) && it.tipo !== 'idea' && it.tipo !== 'hablar' && !snoozed(it));
    if (mios.length) return '';
    const r = state.revision; const eq = r && Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo.length : null;
    const man = ymd(addDays(today(), 1)); const evm = eventsOn(man).filter((e) => !isReserva(e) && !isRecordatorio(e));
    const tor = evm.filter(isTorneo); const reu = evm.filter(isReunion);
    const manana = tor.length ? 'torneo ' + torneoName(tor[0]).nombre : reu.length ? reu.length + (reu.length === 1 ? ' reunión' : ' reuniones') : 'sin agenda';
    return '<p class="calm">Nada tuyo pendiente' + (eq === null ? '' : ' · ' + eq + (eq === 1 ? ' cliente esperando al equipo' : ' clientes esperando al equipo')) + ' · mañana ' + esc(manana) + '</p>';
  }
  function encargoCard(it, i) {
    const n = daysUntil(it.fecha_limite); const pr = pendingRequest(it);
    const enc = it.extra && it.extra.encargo; const pasado = enc && enc.at ? localDay(enc.at) : localDay(it.created_at);
    const quien = it.persona || (enc && enc.nombre) || 'el equipo';
    const cuando = n === 0 ? 'vence hoy' : 'vencido ' + relDate(it.fecha_limite);
    return '<article class="firma urg enc' + (state.openMore && state.openMore.has(it.id) ? ' open' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="fhead"><span class="fnum">' + (i + 1) + '</span><h3>' + esc(it.titulo) + '</h3>' +
      '<p class="why">Encargo a <b>' + esc(quien) + '</b>' + (pasado ? ' desde el ' + esc(fmtShort(pasado)) : '') + ': ' + esc(cuando) + ' y sin respuesta del equipo.</p>' +
      '<div class="chips"><span class="chip crit">encargo ' + esc(cuando) + '</span><span class="chip">' + esc(quien) + '</span></div></div>' +
      (it.novedad ? '<p class="nov"><b>Último</b>' + esc(it.novedad) + '</p>' : '') +
      (pr ? '<p class="pend">Recordatorio pedido a las ' + hhmm(pr.at) + ': estará en tus borradores de Gmail en breve.</p>' : '') +
      '<div class="acts">' + (pr ? '<button class="btn go" data-action="done">Hecho</button>' : '<button class="btn go" data-action="nudge">Recordar</button><button class="btn" data-action="done">Hecho</button>') +
      '<button class="btn ghost" data-action="more">' + (state.openMore && state.openMore.has(it.id) ? 'Menos' : 'Más') + '</button></div>' +
      '<div class="more">' + (it.enlace ? '<a class="mini" href="' + esc(it.enlace) + '" target="_blank" rel="noopener">Abrir hilo</a>' : '') +
      '<button class="mini" data-action="later">Aplazar</button><button class="mini" data-action="edit">Editar</button></div></article>';
  }
  function renderFirma() {
    const list = firmaList(); const venc = vencidosEnc();
    $('#firmaN').textContent = list.length || venc.length ? 'por urgencia' : '';
    const encHtml = venc.map((it, j) => encargoCard(it, list.length + j)).join('');
    $('#firma').innerHTML = (list.length ? list.map((it, i) => {
      const n = daysUntil(it.fecha_limite); const urg = it.prioridad === 'urgente' || (n !== null && n <= 0);
      const pr = pendingRequest(it);
      return '<article class="firma' + (urg ? ' urg' : '') + (state.openMore && state.openMore.has(it.id) ? ' open' : '') + '" data-id="' + esc(it.id) + '">' +
        '<div class="fhead"><span class="fnum">' + (i + 1) + '</span><h3>' + esc(it.titulo) + '</h3>' +
        (it.detalle ? '<p class="why">' + esc(it.detalle) + '</p>' : '') + '<div class="chips">' + chipsFor(it) + '</div></div>' +
        (it.novedad ? '<p class="nov"><b>Novedad</b>' + esc(it.novedad) + '</p>' : '') +
        (it.recomendacion ? '<p class="reco"><b>Recomiendo</b>' + esc(it.recomendacion) + '</p>' : '') +
        (pr ? '<p class="pend">' + (pr.tipo === 'reenvio' ? 'Reenvío a ' + esc(pr.para_nombre || pr.para || 'info@') + ' pedido a las ' : 'Borrador pedido a las ') + hhmm(pr.at) + ': estará en tus borradores de Gmail en breve.</p>' : '') +
        // V3: dos acciones a la vista (Hecho y Más); el resto se despliega. P108: nada se envía solo.
        '<div class="acts"><button class="btn go" data-action="done">Hecho</button><button class="btn ghost" data-action="more">' + (state.openMore && state.openMore.has(it.id) ? 'Menos' : 'Más') + '</button></div>' +
        '<div class="more">' + (pr ? '' : '<button class="mini" data-action="mail">Pedir borrador</button>' + (it.enlace ? '<button class="mini" data-action="fwd">Pasar al equipo</button>' : '')) +
        (it.enlace ? '<a class="mini" href="' + esc(it.enlace) + '" target="_blank" rel="noopener">Abrir hilo</a>' : '') +
        '<button class="mini" data-action="later">Aplazar</button><button class="mini" data-action="edit">Editar</button></div></article>';
    }).join('') : '') + encHtml || '<p class="empty-s">Nada urgente que firmar. Lo demás está en «Tus tareas».</p>';
    const fallos = state.solicitudes.filter((s) => s.estado === 'error');
    if (fallos.length) $('#firma').innerHTML = fallos.map((s) => { const it = state.items.find((x) => x.id === s.asunto_id); return '<p class="pend">No pude preparar el ' + (s.tipo === 'reenvio' ? 'reenvío' : 'borrador') + (it ? ' de «' + esc(it.titulo) + '»' : s.enlace ? ' del correo de «Equipo»' : '') + ': ' + esc(s.resultado || 'error') + '</p>'; }).join('') + $('#firma').innerHTML;
  }
  // Agenda: copia del calendario que mantienen las tareas automáticas.
  const isTorneo = (e) => !!e.torneo;
  // P108 (08/11/2026 · Sr. Vela): un recordatorio dictado («recuérdame X a las 12») se pone en el calendario como evento corto «⏰ X»;
  // en la app no cuenta como reunión y se enseña como aviso.
  const isRecordatorio = (e) => /^\u23f0/.test(String(e.titulo || ''));
  // V4: salidas que Sergio reserva en GolfManager a su nombre (el calendario las recibe como «SERGIO VELA TORRES - GF … - Tee 1»):
  // no son reuniones. Van en una sola línea y no cuentan en choques, cifras ni «reuniones vistas».
  const isReserva = (e) => /^SERGIO VELA TORRES\s*-/i.test(String(e.titulo || '')) || /\s-\s*Tee\s*\d+\s*$/i.test(String(e.titulo || ''));
  const isReunion = (e) => !e.todo_el_dia && !isTorneo(e) && !isRecordatorio(e) && !isReserva(e);
  function eventsOn(day) { return state.events.filter((e) => e.dia <= day && day <= (e.dia_fin || e.dia)); }
  function torneoName(e) { const s = String(e.titulo || '').trim(); const m = s.match(/^(PO|PR|PB|AB|A|B|F|P)\s+(.+)$/); return m ? { codigo: m[1], nombre: nice(m[2]) } : { codigo: null, nombre: nice(s) }; }
  function timeRange(e) {
    if (e.todo_el_dia) { const a = e.dia, b = e.dia_fin || e.dia; return a === b ? 'todo el día' : parseYmd(a).getDate() + '–' + parseYmd(b).getDate() + ' ' + MES3[parseYmd(b).getMonth()]; }
    return hhmm(e.inicio) + (e.fin ? '–' + hhmm(e.fin) : '');
  }
  function clashes(evs) {
    // V3: los choques se miran solo entre reuniones; un torneo o un recordatorio ⏰ no «se pisa» con nada.
    const timed = evs.filter((e) => !e.todo_el_dia && e.inicio && e.fin && e.mi_respuesta !== 'declined' && !isTorneo(e) && !isRecordatorio(e) && !isReserva(e)); const set = new Set();
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
  function evKind(e) { return isTorneo(e) ? { cls: 'tor', txt: 'torneo' } : isRecordatorio(e) ? { cls: 'rec', txt: 'aviso' } : e.todo_el_dia ? { cls: 'dia', txt: 'todo el día' } : { cls: '', txt: 'reunión' }; }
  function evName(e) {
    if (isTorneo(e)) { const tn = torneoName(e); return (tn.codigo ? tn.codigo + ' · ' : '') + tn.nombre; }
    if (isRecordatorio(e)) return String(e.titulo).replace(/^⏰\s*/, '');
    return e.titulo || '(sin título)';
  }
  function renderAgenda() {
    const now = new Date(); const hoy = ymd(today());
    const todos = eventsOn(hoy).slice().sort((a, b) => (a.todo_el_dia ? '0' : '1' + a.inicio).localeCompare(b.todo_el_dia ? '0' : '1' + b.inicio));
    const reservas = todos.filter(isReserva); const evs = todos.filter((e) => !isReserva(e));
    const cl = clashes(evs);
    const reun = evs.filter(isReunion);
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
      // V4: las salidas reservadas a su nombre, en una línea (horas, con ×n si se repiten), sin tachar ni contar.
      if (reservas.length) {
        const horas = {}; reservas.forEach((e) => { const h = e.inicio ? hhmm(e.inicio) : '—'; horas[h] = (horas[h] || 0) + 1; });
        const txt = Object.keys(horas).sort().map((h) => h + (horas[h] > 1 ? ' ×' + horas[h] : '')).join(' · ');
        tl.innerHTML += '<div class="ev res"><span class="t">' + reservas.length + '</span><span class="s">' + (reservas.length === 1 ? 'salida reservada a tu nombre' : 'salidas reservadas a tu nombre') + '<small>' + esc(txt) + ' · GolfManager</small></span><span class="k res">reservas</span></div>';
      }
    }
    // Próximos días (hasta 3 con eventos, sin hoy)
    const el = $('#agenda'); if (!el) return;
    const days = []; for (let i = 1; i < 10 && days.length < 3; i++) { const d = addDays(today(), i), ds = ymd(d); const ev = eventsOn(ds).filter((e) => !isReserva(e)); if (ev.length) days.push({ d, ds, evs: ev }); }
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
    const enF = new Set(vencidosEnc().map((x) => x.id));
    const list = cng().filter((it) => open(it) && (it.tipo === 'seguimiento' || it.tipo === 'pedido') && !enF.has(it.id)).sort((a, b) => urgency(a) - urgency(b));
    const venc = list.filter((it) => it.tipo !== 'pedido' && daysUntil(it.fecha_limite) !== null && daysUntil(it.fecha_limite) <= 0).length; const ped = list.filter((it) => it.tipo === 'pedido').length;
    $('#delN').textContent = list.length ? [(list.length - ped) + (list.length - ped === 1 ? ' encargo' : ' encargos'), venc ? venc + (venc === 1 ? ' vencido' : ' vencidos') : '', ped ? ped + (ped === 1 ? ' pedido' : ' pedidos') : '', enF.size ? enF.size + ' más en «A tu firma»' : ''].filter(Boolean).join(' · ') : enF.size ? plural(enF.size, 'encargo vencido', 'encargos vencidos') + ', en «A tu firma»' : 'no esperas nada de nadie';
    defaultOpen('dDel', list.length > 0);
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
        (pr ? '<p class="pend">Recordatorio pedido: estará en tus borradores de Gmail en breve.</p>' : '') + '</div>' +
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
    const rs = $('#radarS'); if (rs) { const nt = rows.filter((r) => r.cls === 'tor').length; const nm = rows.length - nt; rs.textContent = rows.length ? [nt ? nt + (nt === 1 ? ' torneo' : ' torneos') : '', nm ? nm + (nm === 1 ? ' plazo tuyo' : ' plazos tuyos') : ''].filter(Boolean).join(' · ') + ' en 14 días' : 'nada en los próximos 14 días'; }
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
    const ls = $('#libS'); if (ls) ls.textContent = [ideas.length ? ideas.length + (ideas.length === 1 ? ' idea' : ' ideas') : 'sin ideas apuntadas', ordenando.length ? ordenando.length + ' ordenando' : '', recordatorios.length ? recordatorios.length + (recordatorios.length === 1 ? ' aviso puesto' : ' avisos puestos') : ''].filter(Boolean).join(' · ');
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
    const b = blocker(it); const sz = snoozed(it);
    return '<li class="' + (b || sz ? 'blk' : '') + '" data-id="' + esc(it.id) + '"><button class="tick" data-action="done" aria-label="Marcar como hecha"></button><span class="t" data-action="edit">' + esc(it.titulo) + (b ? ' · antes: ' + esc(b.titulo) : '') + '</span><span class="r">' + esc(right != null ? right : b ? 'esperando' : sz ? 'aplazada · ' + relDate(it.pospuesto_hasta) : it.fecha_limite ? relDate(it.fecha_limite) : '') + '</span></li>';
  }
  function renderFolds() {
    const firmaIds = new Set(firmaList().map((x) => x.id));
    const tareas = cng().filter((it) => open(it) && (it.tipo === 'tarea' || !it.tipo || it.tipo === 'vencimiento') && !firmaIds.has(it.id) && !isInc(it)).sort((a, b) => ((blocker(a) || snoozed(a)) ? 1 : 0) - ((blocker(b) || snoozed(b)) ? 1 : 0) || urgency(a) - urgency(b));
    defaultOpen('dTareas', tareas.length > 0);
    // V3.1: «Tus tareas» va en el bloque Hoy, plegable, con resumen (cuántas, vencidas y para hoy).
    const venc = tareas.filter((it) => daysUntil(it.fecha_limite) !== null && daysUntil(it.fecha_limite) < 0).length;
    const paraHoy = tareas.filter((it) => daysUntil(it.fecha_limite) === 0).length;
    const ts = $('#tareasS'); if (ts) ts.textContent = tareas.length ? [tareas.length + (tareas.length === 1 ? ' pendiente' : ' pendientes'), venc ? venc + (venc === 1 ? ' vencida' : ' vencidas') : '', paraHoy ? paraHoy + ' para hoy' : ''].filter(Boolean).join(' · ') + ' · además de las de «A tu firma»' : 'nada más apuntado';
    $('#tareas').innerHTML = tareas.length ? tareas.map((it) => rowLi(it)).join('') : '<li class="plain"><span class="muted">Nada más apuntado.</span><span></span></li>';
    const hablar = cng().filter((it) => open(it) && it.tipo === 'hablar').sort((a, b) => norm(a.persona).localeCompare(norm(b.persona)));
    const hs = $('#hablarS'); if (hs) hs.textContent = hablar.length ? hablar.length + (hablar.length === 1 ? ' persona' : ' personas') : 'nadie pendiente';
    defaultOpen('dHablar', hablar.length > 0);
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
    // V4: lo que ya sale en «Próximos 30 días» no se repite en Pendiente.
    const vencIds = new Set(perVencList().map((x) => x.id));
    const pp = per().filter((it) => open(it) && it.tipo !== 'idea' && !vencIds.has(it.id)).sort((a, b) => urgency(a) - urgency(b));
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
  function eqAsunto(p) { const s = String(p.asunto || '').replace(/\s*\((parado|sección)[^)]*\)\s*$/i, '').trim(); return s || ('Sin asunto' + (p.bandeja ? ' · ' + p.bandeja : '')); } // V4: nunca una fila vacía
  function renderEquipo() {
    const r = state.revision; const el = $('#equipo');
    if (!r) { $('#nEquipo').textContent = ''; el.innerHTML = '<p class="empty-s">Aún sin datos: el informe y las revisiones lo rellenan.</p>'; return; }
    const pend = (Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo : []).slice()
      .sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
    const res = Array.isArray(r.resueltos_equipo) ? r.resueltos_equipo : [];
    const cuando = r.at ? (localDay(r.at) === ymd(today()) ? 'hoy ' : fmtShort(localDay(r.at)) + ' ') + hhmm(r.at) : '';
    const viejo = pend.length ? pend.slice().sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1))[0] : null;
    $('#nEquipo').textContent = [pend.length ? pend.length + (pend.length === 1 ? ' cliente esperando' : ' clientes esperando') + (viejo && typeof viejo.dias === 'number' ? ' · el más antiguo ' + viejo.dias + ' d' : '') : 'al día', res.length ? res.length + (res.length === 1 ? ' resuelto hoy' : ' resueltos hoy') : '', cuando ? 'revisado ' + cuando : ''].filter(Boolean).join(' · ');
    defaultOpen('dEq', pend.length > 0);
    const porB = {}; pend.forEach((p) => { const k = p.bandeja || 'Sin bandeja'; porB[k] = (porB[k] || 0) + 1; });
    // V4: antigüedad a la vista (hoy · 1-2 d · 3 d o más) y después las bandejas.
    const ag = { hoy: 0, rec: 0, vie: 0 }; pend.forEach((p) => { const d = typeof p.dias === 'number' ? p.dias : null; if (d === null) return; if (d <= 0) ag.hoy++; else if (d < 3) ag.rec++; else ag.vie++; });
    const ages = [ag.vie ? '<span class="chip crit">' + ag.vie + ' de 3 d o más</span>' : '', ag.rec ? '<span class="chip flag">' + ag.rec + ' de 1-2 d</span>' : '', ag.hoy ? '<span class="chip">' + ag.hoy + ' de hoy</span>' : ''].join('');
    // V6.1: las pestañitas filtran la lista (por antigüedad o por bandeja); otra pulsación quita el filtro.
    if (state.eqFilter && !pend.some(eqMatch)) state.eqFilter = null;
    const sum = (ag.vie ? fchip('crit', 'e:vie', ag.vie + ' de 3 d o más') : '') + (ag.rec ? fchip('flag', 'e:rec', ag.rec + ' de 1-2 d') : '') + (ag.hoy ? fchip('', 'e:hoy', ag.hoy + ' de hoy') : '') + Object.keys(porB).sort((a, b) => porB[b] - porB[a]).map((k) => fchip('plain', 'b:' + k, k + ' ' + porB[k])).join('') + (state.eqFilter && state.eqFilter.slice(0, 2) === 'a:' ? fchip('plain', state.eqFilter, 'Área: ' + state.eqFilter.slice(2) + ' ' + pend.filter(eqMatch).length) : '');
    state.eqPend = pend;
    const rows = pend.map((p, i) => {
      if (!eqMatch(p)) return '';
      const d = typeof p.dias === 'number' ? p.dias : null; const st = eqEstado(p);
      const pr = p.enlace ? eqPedido(p.enlace) : null;
      const pasar = !p.enlace ? '' : pr ? '<span class="eqfwd-ok">Reenvío a ' + esc(pr.para_nombre || pr.para || '') + ' pedido</span>'
        : '<button class="mini" data-eqfwd="' + i + '">Pasar</button>';
      const age = d === null ? '—' : d === 0 ? 'hoy' : d + '<small>d</small>';
      const link = p.enlace ? '<a href="' + esc(p.enlace) + '" target="_blank" rel="noopener">' + esc(eqAsunto(p)) + '</a>' : esc(eqAsunto(p));
      const extra = /pasada|cerrar/i.test(p.estado || '') ? '<span>fecha pasada: responder o cerrar</span>' : '';
      return '<li><span class="age' + (d >= 7 ? ' hot' : d >= 3 ? ' warm' : '') + '">' + age + '</span><span class="asu">' + link + '</span>' +
        (p.enlace ? '<span class="eqbtns"><a class="mini go" href="' + esc(p.enlace) + '" target="_blank" rel="noopener">Abrir</a>' + pasar + '</span>' : '<span></span>') +
        '<span class="sub"><span class="st ' + st.cls + '">' + esc(st.txt) + '</span><span>' + esc([p.area, p.bandeja].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(' · ')) + '</span>' + extra + '</span></li>';
    }).join('');
    const resHtml = res.length ? '<details class="res"><summary>' + res.length + (res.length === 1 ? ' resuelto' : ' resueltos') + ' desde el informe</summary><ul>' +
      res.map((x) => '<li><span class="t">' + (x.enlace ? '<a href="' + esc(x.enlace) + '" target="_blank" rel="noopener" style="color:inherit">' + esc(x.asunto || '') + '</a>' : esc(x.asunto || '')) + '</span><span class="r">' + esc(x.quien || '') + '</span></li>').join('') + '</ul></details>' : '';
    // V3: al día = una línea; los resueltos en texto corrido (quién y qué), sin desplegable.
    const resTxt = res.length ? '<p class="res"><b>' + res.length + (res.length === 1 ? ' resuelto' : ' resueltos') + '</b> desde el informe · ' + esc(res.slice(0, 4).map((x) => (x.quien && x.quien !== '—' ? String(x.quien).split(' ')[0] + ' (' + String(x.asunto || '').slice(0, 40) + ')' : String(x.asunto || '').slice(0, 40))).join(' · ')) + (res.length > 4 ? ' · y ' + (res.length - 4) + ' más' : '') + '</p>' : '';
    el.innerHTML = (pend.length
      ? '<div class="eqsum">' + sum + '</div>' + (state.eqFilter ? '<p class="eqfil"><span>Viendo ' + pend.filter(eqMatch).length + ' de ' + pend.length + '</span><button type="button" class="mini" data-eqf="">Ver todos</button></p>' : '') + '<ul class="eqlist">' + rows + '</ul>' + resHtml
      : '<div class="eqok">✓ El equipo está al día <small>ningún cliente esperando respuesta</small></div>' + resTxt) +
      '<p class="eqmeta">Comprobado en Gmail ' + esc(cuando) + '.</p>';
  }
  // Tarjeta de juego (V2 22/10/2026): las cuatro cifras del día; cada casilla lleva a su sección.
  // V6: las cifras de cabecera pasan al tablero de inicio (renderInicio, al final).
  function renderScore() { renderInicio(); }
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
    // P111 (14/11/2026 · Sr. Vela): alquileres (buggies, carros eléctricos y manuales) como casilla propia; por la noche, los de mañana.
    // No entran en el total de reservas (no son una unidad de negocio). Sin lectura = «—».
    const alq = u.alquileres && u.alquileres.version === 'P111' ? u.alquileres : null;
    const alqK = noche && alq && alq.fuente !== 'ventas' ? 'manana' : 'hoy'; const alqB = alq && alq[alqK] ? alq[alqK] : null;
    const alqT = (x) => x ? (x.buggies || 0) + (x.carros_electricos || 0) + (x.carros_manuales || 0) + (x.sets_palos || 0) + (x.palos_sueltos || 0) : null;
    cells.push(cel(alqT(alqB), 'alquileres', alqB ? (alqB.buggies || 0) + ' buggies · ' + (alqB.carros_electricos || 0) + ' eléctricos · ' + (alqB.carros_manuales || 0) + ' manuales' + ((alqB.sets_palos || 0) + (alqB.palos_sueltos || 0) ? ' · ' + (alqB.sets_palos || 0) + ' sets de palos · ' + (alqB.palos_sueltos || 0) + ' palos sueltos' : '') : 'no disponible',
      alq && alq.d7 ? '<span class="cmp eq">7 d · ' + esc(fN(alqT(alq.d7))) + '</span>' : ''));
    // Unidades nuevas que aparezcan en GolfManager no se pierden: van detrás, con su nº de reservas.
    otras.forEach((a) => cells.push(cel(val(blq[a], 'reservas'), a, s7(a, 'reservas'))));
    cells.push('<div class="sum"><b>' + (totN === null ? '—' : esc(fN(totN))) + '</b><span class="et">reservas · total</span></div>');
    el.hidden = false;
    el.innerHTML = '<p class="bizcap">Ocupación ' + cuando + ' · GolfManager ' + esc(horaVivo(d)) + (u.completo ? '' : ' · <b>lectura incompleta</b>') + '</p><div class="biz occ">' + cells.join('') + '</div>';
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
    $('#negS').textContent = 'GolfManager' + (vd && vd.generado ? ' ' + horaVivo(vd) : '') + ' · ocupación por unidad y ventas del día';
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
    if (tS) tS.textContent = [todos.length + (todos.length === 1 ? ' persona' : ' personas'), dentroN === null ? null : dentroN + ' ahora dentro', aus.length ? aus.length + (aus.length === 1 ? ' ausencia' : ' ausencias') : null, 'GolfManager ' + horaVivo(d)].filter(Boolean).join(' · ');
    let html = '<div class="ticks"' + nowStyle + '><span></span><span class="track">' + ticks.join('') + (nowPct === null ? '' : '<b></b>') + '</span></div>';
    DEPS.forEach((dep) => {
      const gente = (Array.isArray(blq[dep]) ? blq[dep] : []).filter((p) => !p.ausente);
      html += '<div class="grp">' + esc(dep) + (gente.length ? '' : ' <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">· nadie con turno</span>') + '</div>';
      gente.sort((a, b) => (toMin(a.desde) || 0) - (toMin(b.desde) || 0)).forEach((p) => {
        const a = toMin(p.desde), b = toMin(p.hasta);
        const dentro = nowPct !== null && a !== null && b !== null && a <= nowMin && nowMin < b;
        const rol = p.rol ? String(p.rol).toLowerCase().replace(/\s+/g, ' ').trim() : '';
        const bar = a !== null && b !== null && b > a ? '<span class="bar" style="left:' + pct(a).toFixed(1) + '%;width:' + (pct(b) - pct(a)).toFixed(1) + '%"><small>' + esc(String(p.desde).replace(/^0/, '').replace(/:00$/, '') + '–' + String(p.hasta).replace(/^0/, '').replace(/:00$/, '')) + '</small></span>' : '<span class="bar nodata"><small>sin horario</small></span>';
        html += '<div class="row' + (dentro ? ' now' : '') + '"' + nowStyle + '><span class="n" title="' + esc(p.nombre + (rol ? ' · ' + rol : '')) + '">' + esc(label(p)) + '</span><span class="track">' + bar + '</span></div>';
      });
    });
    html += '<div class="aus">' + (aus.length ? 'Ausentes: ' + esc(aus.map(first).join(' · ')) + '. ' : '') + 'Cuadrante de GolfManager, no fichaje real.</div>';
    el.innerHTML = html;
  }
  // P110 (14/11/2026 · Sr. Vela): «jugadores hoy» en vivo desde GolfManager (D4, cada 30 min: reservas activas de golf de hoy,
  // sin buggies ni carros) con su hora; si no hay lectura de hoy, el dato del Informe Diario de la mañana, etiquetado con su hora.
  // La ocupación sigue siendo la del Informe (GolfManager calcula el % sobre plazas que no se pueden reproducir aquí).
  function jugadoresVivo() {
    const vd = state.vivo && state.vivo.datos; const u = vd && vd.fecha === ymd(today()) && vd.unidades && vd.unidades.hoy ? vd.unidades : null;
    if (!u) return null;
    const k = Object.keys(u.hoy).find((a) => /golf|campo|green/i.test(a) && !/gourmet/i.test(a));
    const n = k && u.hoy[k] && typeof u.hoy[k].reservas === 'number' ? u.hoy[k].reservas : null; // sin lectura completa o sin golf: null, nunca 0
    return n === null ? null : { n, hora: vd.generado ? horaVivo(vd) : null };
  }
  // V3 · Baldosas de «Hoy»: semáforo del campo, jugadores, ocupación y reclamaciones (Informe Diario vía sync). Sin dato = «—».
  function renderTiles() {
    const el = $('#tiles'); if (!el) return;
    const s = state.sync; const hoyS = s && localDay(s.at) === ymd(today()) ? s.datos || {} : null;
    const c = hoyS && hoyS.campo; const n = (hoyS && hoyS.negocio) || {}; const cl = hoyS && hoyS.clientes;
    const sem = c && c.semaforo ? String(c.semaforo) : null; const semCls = sem ? (SEMCLS[sem.toLowerCase()] || '') : '';
    const tile = (val, txt, cls) => '<div><b class="' + (cls || '') + '">' + val + '</b><span>' + esc(txt) + '</span></div>';
    const rec = cl ? cl.reclamaciones_sin_respuesta : null;
    const jv = jugadoresVivo(); const infH = hoyS && hoyS.informe_hora ? ' · informe ' + hoyS.informe_hora : '';
    el.innerHTML = tile(sem ? '<span class="dot ' + semCls + '"></span>' + esc(sem.charAt(0) + sem.slice(1).toLowerCase()) : '—', 'campo' + (c && typeof c.puntos === 'number' ? ' · ' + c.puntos + '/100' : '') + (c && c.tendencia ? ' · ' + c.tendencia : ''), semCls) +
      (jv ? tile(esc(String(jv.n)), 'jugadores' + (jv.hora ? ' · ' + jv.hora : '')) : tile(n.jugadores_hoy != null ? esc(String(n.jugadores_hoy)) : '—', 'jugadores' + (n.jugadores_hoy != null ? infH : ''))) +
      tile(n.ocupacion_hoy != null ? esc(n.ocupacion_hoy + ' %') : '—', 'ocupación' + (n.ocupacion_hoy != null ? infH : '')) +
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
      // P111 (14/11/2026 · Sr. Vela): también jugadores de golf (salidas ya dadas a la hora de la lectura) y alquileres (buggies, carros).
      const tr = (et, t, h) => '<tr><th>' + et + '</th><td>' + t + '</td><td>' + h + '</td><td>' + Math.max(0, t - h) + '</td></tr>';
      const golfK = Object.keys(hb).find((a) => /golf|campo|green/i.test(a) && !/gourmet/i.test(a));
      const filasGolf = golfK && hb[golfK] && hb[golfK].reservas > 0 ? tr('Jugadores de golf', hb[golfK].reservas, (hh[golfK] && hh[golfK].reservas) || 0) : '';
      const FIL = [['Escuela', 'reservas', 'Clases'], ['Escuela', 'personas', 'Alumnos'], ['Fitting', 'reservas', 'Sesiones de fitting'], ['Gourmet Experience', 'reservas', 'Bahías de Gourmet'], ['Gourmet Experience', 'personas', 'Personas en Gourmet']];
      const alq = vu.alquileres && vu.alquileres.version === 'P111' && vu.alquileres.hoy ? vu.alquileres : null;
      const ALQ = [['buggies', 'Buggies'], ['carros_electricos', 'Carros eléctricos'], ['carros_manuales', 'Carros manuales'], ['sets_palos', 'Sets de palos'], ['palos_sueltos', 'Palos sueltos']];
      const filasAlq = alq ? ALQ.filter(([k]) => alq.hoy[k] > 0).map(([k, et]) => tr(et, alq.hoy[k], (alq.hoy_hechas && alq.hoy_hechas[k]) || 0)).join('') : '';
      const filas = filasGolf + FIL.filter(([k, c]) => hb[k] && hb[k][c] > 0).map(([k, c, et]) => tr(et, hb[k][c], (hh[k] && hh[k][c]) || 0)).join('') + filasAlq;
      const din = vh && vh.version === 'P86' ? (typeof vh.anticipada === 'number' && vh.anticipada > 0 && typeof vh.total === 'number' ? '<p>De lo facturado hoy: <b>' + esc(eur(vh.anticipada)) + '</b> para otros días (reservas futuras, p. ej. Gourmet) · <b>' + esc(eur(vh.total - vh.anticipada)) + '</b> para hoy</p>' : '') + '<p class="muted">Con IVA · sin borradores ni recargas' + (vh.completo === false ? ' · lectura incompleta' : '') + '</p>'
        : '<p class="muted">Ventas de hoy: no disponibles en esta lectura.</p>';
      const cuerpo = din + (filas ? '<table class="tdia"><thead><tr><th></th><th>Hoy</th><th>Ya dadas</th><th>Quedan</th></tr></thead><tbody>' + filas + '</tbody></table>'
        : '<p class="muted">Hoy no hay salidas, clases ni sesiones reservadas.</p>');
      cards.push(cardOp('Hoy en el centro · ' + esc(horaVivo(vd)), cuerpo, 'Ventas registradas en GolfManager (no es contabilidad). Golf desde el 02/11.'));
    }
    // Campo (parte del día: siempre el de hoy; por la noche se avisa de que es el de hoy)
    const c = hoyS && hoyS.campo;
    if (c && (c.semaforo || c.resumen)) {
      const sem = String(c.semaforo || '').toLowerCase();
      const cab = '<p class="sem ' + (SEMCLS[sem] || '') + '"><b>' + esc(c.semaforo || '—') + '</b>' + (typeof c.puntos === 'number' ? ' · ' + c.puntos + '/100' : '') + (c.tendencia ? ' · ' + esc(c.tendencia) : '') + '</p>';
      // V3.2 (Sr. Vela): la tarjeta del campo, estructurada: estado · filas de dato (green, buggies, bandera) · aperturas · nota del parte.
      const low = (x) => { const t = String(x || '').trim(); return /^[A-ZÁÉÍÓÚÑ0-9 º·,.:()-]+$/.test(t) && t.length > 3 ? t.charAt(0) + t.slice(1).toLowerCase() : t; };
      const filas = [];
      if (c.green != null && c.green !== '') filas.push(['Velocidad de green', esc(String(c.green))]);
      if (c.buggies) filas.push(['Buggies', esc(low(c.buggies))]);
      const obs = String(c.observaciones || '');
      const band = obs.match(/bandera\s*:?\s*([0-9]+|[A-Za-z]+)/i);
      if (band) filas.push(['Bandera', esc(band[1])]);
      const resto = obs.replace(/posici[oó]n de bandera\s*:?\s*[^·]*·?\s*/i, '').trim();
      if (resto) filas.push(['Nota', esc(low(resto))]);
      const aper = String(c.instalaciones || '').split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean).map((x) => {
        const m = x.match(/^(.*?):\s*(?:abiert[oa]s?\s*)?(?:desde\s*(?:las\s*)?)?(\d{1,2}[:.]\d{2}|\d{1,2}\s*h|cerrad[oa])\s*$/i);
        return m ? '<li><span>' + esc(low(m[1])) + '</span><b>' + esc(m[2].replace('.', ':')) + '</b></li>' : '<li><span>' + esc(low(x)) + '</span><b></b></li>';
      }).join('');
      const det = (filas.length ? '<div class="crows">' + filas.map(([k, v]) => '<div><span>' + k + '</span><b>' + v + '</b></div>').join('') + '</div>' : '') +
        (aper ? '<ul class="aper">' + aper + '</ul>' : '') +
        (c.resumen ? '<p class="muted" style="font-size:13px">' + esc(c.resumen) + '</p>' : '');
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
    const jv = jugadoresVivo(); // P110: jugadores de hoy en vivo (GolfManager vía D4); si no, el Informe Diario
    const kp = [['Green fees ayer', n.green_fees_ayer != null ? String(n.green_fees_ayer) : null], ['Ocupación hoy' + (n.ocupacion_hoy != null && hoyS && hoyS.informe_hora ? ' · informe ' + hoyS.informe_hora : ''), n.ocupacion_hoy != null ? n.ocupacion_hoy + ' %' : null],
      jv ? ['Jugadores hoy' + (jv.hora ? ' · GolfManager ' + jv.hora : ''), String(jv.n)] : ['Jugadores hoy' + (n.jugadores_hoy != null && hoyS && hoyS.informe_hora ? ' · informe ' + hoyS.informe_hora : ''), n.jugadores_hoy != null ? String(n.jugadores_hoy) : null],
      ['Internacionales', n.cuota_internacional != null ? n.cuota_internacional + ' %' : null]];
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
    // V4: la comparativa va debajo del concepto (en móvil no cabe a la derecha).
    const fila = (t, sub, r, extra) => '<li class="plain"><span>' + t + (sub ? '<span class="sub">' + sub + '</span>' : '') + (extra || '') + '</span><span class="r"><b>' + esc(r) + '</b></span></li>';
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
  function renderAll() { header(); renderScore(); renderFresh(); renderBiz(); renderOperacion(); renderTiles(); renderTurnos(); renderSemana(); renderParte(); renderFirma(); renderAgenda(); renderDelegado(); renderEquipo(); renderRadar(); renderLibreta(); renderPerVenc(); renderFolds(); renderHecho(); renderClientes(); renderAreas(); renderIncidencias(); renderVigilar(); renderTendencia(); renderResumenes(); }

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
    else if (t === 'briefings') q = sb.from('briefings').select('*').order('at', { ascending: false }).limit(2);
    else if (t === 'revisiones') q = sb.from('revisiones').select('*').order('at', { ascending: false }).limit(1);
    else if (t === 'libreta') q = sb.from('libreta').select('*').order('at', { ascending: false }).limit(20);
    else if (t === 'sync') q = sb.from('sync').select('*').order('id', { ascending: false }).limit(1);
    else if (t === 'negocio_vivo') q = sb.from('negocio_vivo').select('*').eq('id', 'reservas').limit(1);
    else if (t === 'solicitudes') q = sb.from('solicitudes').select('*').or('estado.eq.pendiente,and(estado.eq.error,hecha_at.gt.' + new Date(Date.now() - 864e5).toISOString() + ')');
    else return;
    const { data, error } = await q;
    if (error) { state.loadErr = true; if (!state.snapAt && !state.loadedAt) showBanner('No se pudieron cargar tus datos (' + error.message + '). Comprueba la conexión.', true); return; }
    if (t === 'asuntos') state.items = data;
    else if (t === 'agenda') state.events = data;
    else if (t === 'prep') { const m = {}; data.forEach((p) => { m[p.id] = p; }); state.prep = m; }
    else if (t === 'briefings') { state.briefing = data[0] || null; state.briefingPrev = data[1] || null; }
    else if (t === 'revisiones') state.revision = data[0] || null;
    else if (t === 'libreta') state.libreta = data;
    else if (t === 'solicitudes') state.solicitudes = data;
    else if (t === 'sync') state.sync = data[0] || null;
    else if (t === 'negocio_vivo') state.vivo = data[0] || null;
  }
  const TABLES = ['asuntos', 'agenda', 'prep', 'briefings', 'revisiones', 'libreta', 'solicitudes', 'sync', 'negocio_vivo'];
  const SEMANA_DE = ['asuntos', 'agenda', 'revisiones'];
  async function loadAll() {
    state.loadErr = false;
    await Promise.all(TABLES.concat('semana').map(loadTable));
    // V6: si carga bien, se guarda el estado; si no hay red, se sigue viendo el último con su hora.
    if (!state.loadErr) { state.snapAt = null; state.loadedAt = Date.now(); await loadHist(); await loadExtra(); saveSnap(); showBanner(''); }
    else { if (!state.snapAt && state.loadedAt) state.snapAt = state.loadedAt; if (state.snapAt) showBanner(snapTxt(), true); }
    state.loaded = true; renderAll();
  }
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
  // V6: al marcar hecho sale un aviso con «Deshacer» durante unos segundos.
  async function markDone(it) {
    await patch(it, { estado: 'hecho', hecho_at: new Date().toISOString() });
    if (it.estado !== 'hecho') return;
    let nextId = null;
    if (it.tipo === 'vencimiento' && it.recurrencia && it.fecha_limite) {
      const next = addRecurrence(it.fecha_limite, it.recurrencia);
      if (next) { const { data } = await sb.from('asuntos').insert(newItem({ titulo: it.titulo, tipo: 'vencimiento', ambito: it.ambito, prioridad: it.prioridad, fecha_limite: next, recurrencia: it.recurrencia, detalle: it.detalle, origen: 'recurrencia' })).select('id').single(); nextId = data && data.id ? data.id : null; }
    }
    toast('Hecho: ' + String(it.titulo || '').slice(0, 70), async () => {
      if (nextId) { await sb.from('asuntos').delete().eq('id', nextId); state.items = state.items.filter((x) => x.id !== nextId); }
      await patch(it, { estado: 'pendiente', hecho_at: null });
    });
  }

  // ---------- acciones ----------
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-action]'); if (!btn) return;
    const host = btn.closest('[data-id]'); if (!host) return;
    const it = state.items.find((x) => x.id === host.dataset.id); if (!it) return;
    const a = btn.dataset.action;
    if (a === 'more') { state.openMore = state.openMore || new Set(); const o = host.classList.toggle('open'); if (o) state.openMore.add(it.id); else state.openMore.delete(it.id); btn.textContent = o ? 'Menos' : 'Más'; return; }
    if (a === 'totask') { patch(it, { tipo: 'tarea', prioridad: it.prioridad || 'normal', tema: null }); return; }
    if (a === 'done') markDone(it);
    else if (a === 'reopen') patch(it, { estado: 'pendiente', hecho_at: null });
    else if (a === 'edit') openEditor(it);
    else if (a === 'mail') openMail(it, 'borrador');
    else if (a === 'fwd') openFwd(it);
    else if (a === 'nudge') openMail(it, 'recordatorio');
    else if (a === 'later') openLater(it);
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
    // V6 · incidencia del día: con el botón «Incidencia» marcado, o si empiezas diciendo «incidencia…», se apunta directamente
    // en Centro › Incidencias (no pasa por la Libreta, así no se duplica como tarea).
    const incOn = $('#chipInc').getAttribute('aria-pressed') === 'true'; const incRe = /^\s*incidencia\b[\s:,.;-]*/i;
    if (incOn || incRe.test(texto)) {
      const titulo = texto.replace(incRe, '').trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 160);
      if (!titulo) { sStatus('Di o escribe qué ha pasado.', true); return; }
      state.busy = true; $('#btnSoltar').disabled = true; sStatus('Guardando…');
      const doc = newItem({ titulo, tipo: 'tarea', ambito: 'cng', prioridad: 'alta', origen: 'app' }); doc.extra = { incidencia: true };
      const { error: e2 } = await sb.from('asuntos').insert(doc);
      state.busy = false; $('#btnSoltar').disabled = false;
      if (e2) { sStatus('No se pudo guardar (' + e2.message + '). El texto sigue en la caja.', true); return; }
      $('#suelta').value = ''; try { localStorage.removeItem('dp.suelta'); } catch (e) {} $('#chipInc').setAttribute('aria-pressed', 'false');
      sStatus('Incidencia apuntada.'); await loadTable('asuntos'); renderAll(); setTimeout(() => { sStatus(''); closeSoltar(); }, 1100); return;
    }
    state.busy = true; $('#btnSoltar').disabled = true; sStatus('Guardando…');
    const { data: entry, error } = await sb.from('libreta').insert({ texto, estado: 'sin_ordenar', origen: 'app' }).select('*').single();
    if (error) { sStatus('No se pudo guardar (' + error.message + '). El texto sigue en la caja.', true); state.busy = false; $('#btnSoltar').disabled = false; return; }
    $('#suelta').value = ''; try { localStorage.removeItem('dp.suelta'); } catch (e) {}
    sStatus(CONFIG.ordenarUrl ? 'Guardado. Ordenando…' : 'Guardado. Lo ordeno en unos minutos.');
    const n = await ordenarAhora(entry);
    if (CONFIG.ordenarUrl) sStatus(n ? (n === 1 ? 'Ordenado: 1 elemento.' : 'Ordenado: ' + n + ' elementos.') : 'Guardado. No he podido ordenarlo ahora; lo hago en unos minutos.');
    state.busy = false; $('#btnSoltar').disabled = false;
    await loadTable('libreta'); await loadTable('asuntos'); renderAll(); setTimeout(() => { sStatus(''); closeSoltar(); }, 1400);
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
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { sStatus('El dictado no está permitido aquí: usa el micrófono del teclado.', true); $('#btnMic').hidden = true; try { $('#suelta').focus(); } catch (e2) {} } };
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
    // V4: aplazada hasta y «esperando a» (otro asunto abierto del mismo ámbito).
    $('#edPosp').value = it.pospuesto_hasta || '';
    const sel = $('#edBloq'); const otros = state.items.filter((x) => open(x) && x.id !== it.id && (x.ambito || 'cng') === (it.ambito || 'cng') && x.tipo !== 'idea').sort((a, b) => norm(a.titulo).localeCompare(norm(b.titulo)));
    sel.innerHTML = '<option value="">Nada</option>' + otros.map((x) => '<option value="' + esc(x.id) + '">' + esc(String(x.titulo || '').slice(0, 70)) + '</option>').join('');
    sel.value = it.bloqueado_por && otros.some((x) => x.id === it.bloqueado_por) ? it.bloqueado_por : '';
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
      recurrencia: $('#edRec').value || null, detalle: $('#edDetalle').value.trim() || null,
      pospuesto_hasta: $('#edPosp').value || null, bloqueado_por: $('#edBloq').value || null };
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

  // ---------- aplazar (V4) ----------
  function nextMonday() { const d = today(); const n = (8 - d.getDay()) % 7 || 7; return addDays(d, n); }
  function openLater(it) {
    state.laterItem = it;
    $('#lTitle').textContent = 'Aplazar';
    $('#lSub').textContent = '«' + String(it.titulo || '').slice(0, 90) + '». ' + (it.pospuesto_hasta && daysUntil(it.pospuesto_hasta) > 0 ? 'Ahora está aplazada hasta ' + relDate(it.pospuesto_hasta) + '. Sigue en tu lista, pero no te la pongo delante hasta entonces.' : 'Sigue en tu lista, pero no te la pongo delante hasta ese día.');
    $('#lFecha').value = ''; $('#lStatus').textContent = ''; $('#lOk').disabled = false; $('#lQuitar').hidden = !snoozed(it);
    if (!$('#overlay').hidden) closeEditor();
    $('#laterOverlay').hidden = false;
  }
  function closeLater() { $('#laterOverlay').hidden = true; state.laterItem = null; }
  async function aplazar(hasta) { const it = state.laterItem; if (!it) return; $('#lOk').disabled = true; await patch(it, { pospuesto_hasta: hasta }); closeLater(); }
  $('#laterOverlay').addEventListener('click', (e) => { if (e.target === $('#laterOverlay')) { closeLater(); return; } const b = e.target.closest('[data-later]'); if (!b) return; const v = b.dataset.later; aplazar(ymd(v === 'lunes' ? nextMonday() : addDays(today(), Number(v)))); });
  $('#lOk').addEventListener('click', () => { const v = $('#lFecha').value; if (!v) { $('#lStatus').textContent = 'Elige un día o pulsa una de las opciones.'; return; } if (daysUntil(v) <= 0) { $('#lStatus').textContent = 'Tiene que ser un día posterior a hoy.'; return; } aplazar(v); });
  $('#lQuitar').addEventListener('click', () => aplazar(null));
  $('#lCancel').addEventListener('click', closeLater);

  // ---------- Personal · próximos 30 días (V4) ----------
  function perVencList() {
    const fin = ymd(addDays(today(), 30));
    return per().filter((it) => open(it) && it.tipo !== 'idea' && it.fecha_limite && it.fecha_limite <= fin && !snoozed(it)).sort((a, b) => String(a.fecha_limite).localeCompare(String(b.fecha_limite)));
  }
  function renderPerVenc() {
    const el = $('#perVenc'); if (!el) return; const list = perVencList();
    const venc = list.filter((it) => daysUntil(it.fecha_limite) < 0).length;
    const n = $('#nPerVenc'); if (n) n.textContent = list.length ? list.length + (venc ? ' · ' + venc + (venc === 1 ? ' vencido' : ' vencidos') : '') : '';
    const REC = { semanal: 'cada semana', mensual: 'cada mes', trimestral: 'cada trimestre', anual: 'cada año' };
    el.innerHTML = list.length ? list.map((it) => { const d = parseYmd(it.fecha_limite); const nd = daysUntil(it.fecha_limite);
      return '<div class="vrow' + (nd < 0 ? ' late' : nd <= 3 ? ' soon' : '') + '" data-id="' + esc(it.id) + '"><span class="vd"><b>' + d.getDate() + '</b><small>' + MES3[d.getMonth()] + '</small></span>' +
        '<span class="vt" data-action="edit">' + esc(it.titulo) + '<small>' + esc([nd < 0 ? 'vencido ' + relDate(it.fecha_limite) : nd === 0 ? 'hoy' : nd === 1 ? 'mañana' : 'en ' + nd + ' días', it.tipo === 'vencimiento' ? 'vencimiento' : '', REC[it.recurrencia] || ''].filter(Boolean).join(' · ')) + '</small></span>' +
        '<button class="tick" data-action="done" aria-label="Marcar como hecho"></button></div>'; }).join('')
      : '<p class="empty-s">Nada que venza en los próximos 30 días. Suelta «seguro del coche el 12 de diciembre, cada año» y aparecerá aquí.</p>';
  }

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
  document.addEventListener('keydown', (ev) => { if (ev.key !== 'Escape') return; if (!$('#laterOverlay').hidden) closeLater(); else if (!$('#fwdOverlay').hidden) closeFwd(); else if (!$('#mailOverlay').hidden) closeMail(); else if (!$('#overlay').hidden) closeEditor(); });

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


  // ================= V6 (21/11/2026 · Sr. Vela) =================
  // Tablero de inicio en casillas, cuatro pestañas con barra inferior, color solo cuando algo pide atención, novedades desde la
  // última visita, modo torneo, dato caducado a la vista, tendencia de 7 días, Clientes con su detalle cuando el informe lo envíe,
  // incidencias dictadas, deshacer al marcar hecho y último estado guardado para abrir sin cobertura.
  const svg = (d, s) => '<svg aria-hidden="true" width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  const I_GO = '<path d="M9 6l6 6-6 6"></path>';
  const lab = (t) => '<span class="lab">' + esc(t) + '</span>';
  const sub = (t, cls) => '<span class="sub' + (cls ? ' ' + cls : '') + '">' + esc(t) + '</span>';
  const big = (v, cls) => '<span class="big' + (cls ? ' ' + cls : '') + '">' + esc(v) + '</span>';
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const minsAgo = (iso) => iso ? (Date.now() - new Date(iso).getTime()) / 60000 : null;
  const deDia = () => { const h = new Date().getHours(); return h >= 8 && h < 22; };

  // ---------- pestañas ----------
  function applyTab() {
    const cur = state.tab || 'pInicio';
    ['pInicio', 'pTuyo', 'pCentro', 'pClientes'].forEach((t) => { const el = document.getElementById(t); if (el) el.hidden = t !== cur; });
    document.querySelectorAll('#dock [data-tab]').forEach((b) => { const on = state.view === 'cng' && b.dataset.tab === cur; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }
  function setTab(t, target) {
    state.tab = t;
    if (state.view !== 'cng') { state.view = 'cng'; try { localStorage.setItem('dp.view', 'cng'); } catch (e) {} applyView(); }
    applyTab();
    const el = target && document.getElementById(target);
    if (el && !el.hidden) { const d = el.closest('details'); if (d && !d.open) { d.dataset.auto = '1'; d.open = true; } requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
    else window.scrollTo(0, 0);
  }
  document.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-go]'); if (g) { const p = g.dataset.go.split(':'); setTab(p[0], p[1]); return; }
    const b = ev.target.closest('#dock [data-tab]'); if (b) setTab(b.dataset.tab);
  });
  $('#tabCng').addEventListener('click', applyTab); $('#tabPer').addEventListener('click', applyTab);
  $('#parteMas').addEventListener('click', () => { $('#tParte').classList.toggle('cut'); renderResumenes(); });

  // ---------- novedades desde la última visita ----------
  // Se compara cada casilla con cómo estaba la última vez que cerraste la app (o la dejaste más de 5 minutos). Las cifras que cambian
  // en cada lectura (jugadores, facturado, turnos) no cuentan: siempre serían «novedad».
  let novBase = null; const novNow = {};
  try { novBase = JSON.parse(localStorage.getItem('dp6.novNext') || localStorage.getItem('dp6.nov') || 'null'); if (novBase) localStorage.setItem('dp6.nov', JSON.stringify(novBase)); } catch (e) {}
  function setTile(id, html, o) {
    const el = document.getElementById(id); if (!el) return; o = o || {};
    el.innerHTML = html; el.hidden = !!o.hidden; el.classList.toggle('crit', !!o.crit); el.classList.toggle('stale', !!o.stale);
    if (o.go) el.dataset.go = o.go;
    let nov = false;
    if (o.sig != null && !o.hidden) { novNow[id] = String(o.sig); nov = !!(state.loaded && !state.snapAt && novBase && novBase.sigs && novBase.sigs[id] != null && novBase.sigs[id] !== String(o.sig)); }
    el.classList.toggle('nw', nov);
  }
  let hiddenAt = 0;
  function guardarVisita() { if (state.loaded && !state.snapAt) { try { localStorage.setItem('dp6.novNext', JSON.stringify({ at: Date.now(), sigs: novNow })); } catch (e) {} } }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); guardarVisita(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 5 * 60000) { try { novBase = JSON.parse(localStorage.getItem('dp6.novNext') || 'null') || novBase; localStorage.setItem('dp6.nov', JSON.stringify(novBase)); } catch (e) {} }
  });
  window.addEventListener('pagehide', guardarVisita);

  // ---------- dato caducado ----------
  function gmStale() {
    const vd = state.vivo && state.vivo.datos; if (!state.loaded) return null;
    if (!vd || !vd.generado || vd.fecha !== ymd(today())) return 'sin lectura de GolfManager';
    if (vd.deAyer) return null;
    return deDia() && minsAgo(vd.generado) > 90 ? 'sin lectura desde ' + hhmm(vd.generado) : null;
  }
  function syncHoy() { const s = state.sync; return s && localDay(s.at) === ymd(today()) ? s.datos || {} : null; }
  function informeStale() { if (!state.loaded || syncHoy()) return null; return new Date().getHours() * 60 + new Date().getMinutes() >= 9 * 60 + 30 ? 'sin informe de hoy' : 'a la espera del informe'; }
  function buzonStale() { const r = state.revision; if (!state.loaded) return null; if (!r || !r.at) return 'sin revisión del buzón'; return deDia() && minsAgo(r.at) > 90 ? 'revisado ' + (localDay(r.at) === ymd(today()) ? '' : fmtShort(localDay(r.at)) + ' ') + hhmm(r.at) : null; }

  // ---------- esfera del día ----------
  function dialSvg(evs, cl, now) {
    const W = 326, H = 66, r = 300, A = 30, cx = W / 2, cy = 318, h0 = 7, h1 = 21;
    const ang = (h) => (-A + (h - h0) * (2 * A / (h1 - h0))) * Math.PI / 180;
    const pt = (h, rr) => [cx + (rr || r) * Math.sin(ang(h)), cy - (rr || r) * Math.cos(ang(h))];
    const f = (v) => v.toFixed(1); const P = (p) => f(p[0]) + ' ' + f(p[1]);
    const hNow = now.getHours() + now.getMinutes() / 60; const n = Math.max(h0, Math.min(h1, hNow));
    const hOf = (iso) => { const d = new Date(iso); return d.getHours() + d.getMinutes() / 60; };
    let s = '<svg class="dial" role="img" aria-label="Tu día de 7 a 21 h" viewBox="0 0 ' + W + ' ' + H + '" fill="none">';
    if (n < h1) s += '<path class="rest" d="M' + P(pt(n)) + ' A' + r + ' ' + r + ' 0 0 1 ' + P(pt(h1)) + '" stroke-width="2" stroke-linecap="round"></path>';
    if (n > h0) s += '<path class="done" d="M' + P(pt(h0)) + ' A' + r + ' ' + r + ' 0 0 1 ' + P(pt(n)) + '" stroke-width="2.5" stroke-linecap="round"></path>';
    for (let h = h0; h <= h1; h++) {
      const b = (h - h0) % 2 === 1;
      s += '<path class="tk" d="M' + P(pt(h, r - 6)) + ' L' + P(pt(h, r - (b ? 12 : 9))) + '" stroke-width="1" stroke-linecap="round" opacity="' + (b ? .9 : .45) + '"></path>';
      if (h === 10 || h === 14 || h === 18) { const t = pt(h, r - 24); s += '<text x="' + f(t[0]) + '" y="' + f(t[1] + 4) + '" text-anchor="middle">' + h + '</text>'; }
    }
    evs.forEach((e) => {
      const h = hOf(e.inicio); if (h < h0 || h > h1) return; const p = pt(h);
      if (isRecordatorio(e)) { s += '<rect class="evr" x="' + f(p[0] - 4) + '" y="' + f(p[1] - 4) + '" width="8" height="8" rx="1.5" transform="rotate(45 ' + P(p) + ')" stroke-width="1.5"></rect>'; return; }
      const past = e.fin && new Date(e.fin) <= now;
      s += '<circle class="' + (past ? 'evp' : cl.has(e.id) ? 'evc' : 'evn') + '" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="' + (past ? 4 : 4.5) + '" stroke-width="1.5"></circle>';
    });
    if (hNow >= h0 && hNow <= h1) { const p = pt(n); s += '<circle class="halo" cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="9"></circle><path class="now" d="M' + P(pt(n, r - 13)) + ' L' + P(pt(n, r + 11)) + '" stroke-width="2" stroke-linecap="round"></path>'; }
    return s + '</svg>';
  }
  function enCuanto(d, now) { const m = Math.round((d - now) / 60000); if (m < 1) return 'ahora'; if (m < 60) return 'en ' + m + ' min'; const h = Math.floor(m / 60), r = m % 60; return 'en ' + h + ' h' + (r ? ' ' + r + ' min' : ''); }

  // ---------- cálculos compartidos ----------
  function tareasList() { const ids = new Set(firmaList().map((x) => x.id)); return cng().filter((it) => open(it) && (it.tipo === 'tarea' || !it.tipo || it.tipo === 'vencimiento') && !ids.has(it.id) && !isInc(it)); }
  function encargosList() { return cng().filter((it) => open(it) && (it.tipo === 'seguimiento' || it.tipo === 'pedido')); }
  function incidenciasList() { return cng().filter((it) => open(it) && isInc(it)).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))); }
  const keyT = (x) => norm(x).replace(/^(po|pr|pb|ab|a|b|f|p) · /, '').replace(/[^a-z0-9]/g, '');
  const igualT = (x, y) => { const a = keyT(x), b = keyT(y); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
  function torneoHoy() {
    const hoy = ymd(today()); const cal = state.events.filter((e) => isTorneo(e) && e.dia <= hoy && hoy <= (e.dia_fin || e.dia));
    const vd = state.vivo && state.vivo.datos; const tg = vd && vd.fecha === hoy && vd.unidades && vd.unidades.torneos_gm; const gm = tg && Array.isArray(tg.hoy) ? tg.hoy : [];
    const hs = syncHoy(); const inf = hs && Array.isArray(hs.torneo_hoy) ? hs.torneo_hoy : [];
    const nombres = []; cal.map((e) => { const t = torneoName(e); return (t.codigo ? t.codigo + ' · ' : '') + t.nombre; }).concat(gm.map((g) => g.nombre)).forEach((x) => { if (x && !nombres.some((y) => igualT(x, y))) nombres.push(x); });
    return nombres.map((n) => { const m = String(n).match(/^(PO|PR|PB|AB|A|B|F|P) · (.+)$/); return { nombre: nice(m ? m[2] : n), codigo: m ? m[1] : null, gm: gm.find((x) => igualT(x.nombre, n)) || null, inf: inf.find((x) => igualT(x.nombre || '', n)) || null }; });
  }
  function turnosAhora() {
    const vd = state.vivo && state.vivo.datos; const t = vd && vd.fecha === ymd(today()) && vd.unidades && vd.unidades.turnos;
    if (!t || t.version !== 'P81') return null;
    const noche = new Date().getHours() >= 19; const blq = t[noche ? 'manana' : 'hoy'] || {};
    const toMin = (s) => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const now = new Date().getHours() * 60 + new Date().getMinutes(); let total = 0, dentro = 0, aus = 0;
    Object.keys(blq).forEach((dep) => (Array.isArray(blq[dep]) ? blq[dep] : []).forEach((p) => { if (p.ausente) { aus++; return; } total++; const a = toMin(p.desde), b = toMin(p.hasta); if (a !== null && b !== null && a <= now && now < b) dentro++; }));
    return { noche, total, dentro, aus };
  }
  function vieneTxt() {
    const hoy = ymd(today()), fin = ymd(addDays(today(), 14));
    const tor = new Set(state.events.filter((e) => isTorneo(e) && (e.dia_fin || e.dia) >= hoy && e.dia <= fin).map((e) => e.dia + e.titulo)).size;
    let prox = '';
    for (let i = 1; i < 10 && !prox; i++) { const ds = ymd(addDays(today(), i)); const ev = eventsOn(ds).filter((e) => !isReserva(e)).sort((a, b) => (a.todo_el_dia ? '0' : '1' + a.inicio).localeCompare(b.todo_el_dia ? '0' : '1' + b.inicio)); if (ev.length) prox = (i === 1 ? 'mañana' : fmtShort(ds)) + ' · ' + (isTorneo(ev[0]) ? torneoName(ev[0]).nombre : evName(ev[0])) + (ev.length > 1 ? ' +' + (ev.length - 1) : ''); }
    const partes = [prox, tor ? plural(tor, 'torneo', 'torneos') + ' en 14 días' : ''].filter(Boolean);
    return { txt: partes.length ? partes.join(' · ') : 'nada en los próximos días', tor, prox };
  }

  // ---------- Inicio: el tablero ----------
  function renderInicio() {
    const now = new Date(); const hoy = ymd(today()); const L = state.loaded;
    const ld = $('#liveDot'); if (ld) ld.classList.toggle('on', !!(L && !state.snapAt && state.loadedAt && Date.now() - state.loadedAt < 12 * 60000));

    // Tu día
    const delDia = eventsOn(hoy).filter((e) => !isReserva(e)); const cl = clashes(delDia);
    const conHora = delDia.filter((e) => !e.todo_el_dia && e.inicio && !isTorneo(e));
    const reun = conHora.filter((e) => !isRecordatorio(e)).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
    const cur = reun.find((e) => e.fin && new Date(e.inicio) <= now && now < new Date(e.fin));
    const nx = reun.find((e) => new Date(e.inicio) > now);
    const foco = cur || nx; let cab = 'Hoy', what = L ? (reun.length ? 'Sin más reuniones hoy' : 'Sin reuniones hoy') : 'Cargando la agenda…', chipH = '';
    if (cur) { cab = 'Ahora · hasta las ' + hhmm(cur.fin); what = evName(cur); }
    else if (nx) { cab = 'Siguiente · ' + enCuanto(new Date(nx.inicio), now); what = hhmm(nx.inicio) + ' · ' + evName(nx); }
    if (foco && cl.has(foco.id)) { const otra = reun.find((e) => e.id !== foco.id && cl.has(e.id) && new Date(e.inicio) < new Date(foco.fin) && new Date(foco.inicio) < new Date(e.fin)); chipH = '<span class="chip crit">se pisa' + (otra ? ' con ' + hhmm(otra.inicio) : '') + '</span>'; }
    else if (foco && foco.mi_respuesta === 'needsAction') chipH = '<span class="chip flag">sin responder</span>';
    setTile('tDia', '<span class="dialw">' + dialSvg(conHora, cl, now) + '</span><span class="nx"><span class="nxh">' + lab(cab) + chipH + '</span><span class="what">' + esc(what) + '</span></span>',
      { sig: reun.map((e) => e.id + (e.inicio || '')).join('|') + '#' + cl.size });

    // Parte
    const b = state.briefing; const pl = $('#parteLab'); if (pl) pl.textContent = b && b.at ? 'Parte · ' + (localDay(b.at) === hoy ? '' : DIAS3[new Date(b.at).getDay()] + ' ') + hhmm(b.at) : 'Parte';

    // Modo torneo: el día de torneo su casilla sube bajo el parte, a todo el ancho
    const tors = torneoHoy(); const t0 = tors[0];
    if (t0) {
      const g = t0.gm, i = t0.inf; const kv = [];
      const ins = g && typeof g.inscritos === 'number' ? g.inscritos : null; const pz = g && typeof g.plazas === 'number' && g.plazas > 0 ? g.plazas : null;
      if (i && i.bandera) kv.push(['Bandera', i.bandera]); if (g && g.salida) kv.push(['Salida', g.salida]);
      if (ins !== null) kv.push(['Inscritos', ins + (pz ? ' de ' + pz : '')]); if (g && g.espera) kv.push(['En espera', g.espera]);
      if (i && typeof i.asuntos === 'number' && i.asuntos > 0) kv.push([i.asuntos === 1 ? 'Asunto abierto' : 'Asuntos abiertos', i.asuntos]);
      setTile('tTorneo', lab('Torneo hoy' + (t0.codigo && CODIGOS[t0.codigo] ? ' · ' + CODIGOS[t0.codigo] : '') + (tors.length > 1 ? ' · y ' + (tors.length - 1) + ' más' : '')) + '<span class="name">' + esc(t0.nombre) + '</span>' +
        (kv.length ? '<span class="kvs">' + kv.map((x) => '<span class="kv"><i>' + esc(x[0]) + '</i><b>' + esc(String(x[1])) + '</b></span>').join('') + '</span>' : sub('sin más datos del torneo todavía')) +
        (ins !== null && pz ? '<span class="bar"><i style="width:' + Math.min(100, ins / pz * 100).toFixed(1) + '%"></i></span>' : ''), { sig: t0.nombre + '#' + ins });
    } else setTile('tTorneo', '', { hidden: true });

    // Lo tuyo
    const firma = firmaList(), encV = vencidosEnc(), tareas = tareasList();
    const nF = firma.length + encV.length; const venc = firma.filter((it) => { const n = daysUntil(it.fecha_limite); return n !== null && n < 0; }).length + encV.length;
    const hoyN = firma.filter((it) => daysUntil(it.fecha_limite) === 0).length;
    const aviso = venc ? plural(venc, 'vencido', 'vencidos') : hoyN ? (hoyN === 1 ? '1 vence hoy' : hoyN + ' vencen hoy') : '';
    setTile('tTuyo', lab('Lo tuyo') + '<span class="rowb">' + big(String(nF), nF ? 'gold' : 'dim') + sub('a tu firma') + '</span>' +
      '<span class="sub">' + (aviso ? '<b class="crit">' + esc(aviso) + '</b> · ' : '') + esc(plural(tareas.length, 'tarea', 'tareas')) + '</span>',
      { crit: venc > 0, sig: firma.map((x) => x.id).join('|') + '#' + encV.length + '#' + tareas.length, go: nF ? 'pTuyo:h-firma' : 'pTuyo' });

    // Clientes
    const hs = syncHoy(); const c = hs && hs.clientes; const stI = informeStale();
    const rec = c && typeof c.reclamaciones_sin_respuesta === 'number' ? c.reclamaciones_sin_respuesta : null; const din = c && c.dinero_pendiente != null ? c.dinero_pendiente : null;
    setTile('tCli', lab('Clientes') + (rec === null ? big('—', 'dim') + sub(stI || 'sin dato de reclamaciones')
      : '<span class="rowc">' + big(String(rec), rec > 0 ? 'crit' : 'ok') + '<span class="sub wrap strong">' + (rec === 1 ? 'reclamación sin respuesta' : 'reclamaciones sin respuesta') + '</span></span>' + (din !== null ? sub(plural(Number(din) || 0, 'asunto de dinero', 'asuntos de dinero')) : '')),
      { crit: rec > 0, stale: rec === null, sig: rec === null ? null : rec + '#' + din });

    // Campo (con las incidencias abiertas del día)
    const cp = hs && hs.campo; const sem = cp && cp.semaforo ? String(cp.semaforo) : null; const semC = sem ? (SEMCLS[sem.toLowerCase()] || '') : '';
    const inc = incidenciasList();
    setTile('tCampo', lab('Campo') + (sem ? '<span class="rowc"><span class="dot ' + semC + '"></span>' + big(sem.charAt(0) + sem.slice(1).toLowerCase(), 'm') + '</span>' + (inc.length ? sub(plural(inc.length, 'incidencia', 'incidencias'), 'crit') : sub((typeof cp.puntos === 'number' ? cp.puntos + '/100' : '') + (cp.tendencia ? ' · ' + cp.tendencia : '')))
      : big('—', 'm dim') + (inc.length ? sub(plural(inc.length, 'incidencia', 'incidencias'), 'crit') : sub(stI || 'sin parte del campo'))),
      { crit: semC === 'bad', stale: !sem, sig: (sem || '') + '#' + (cp && cp.puntos) + '#' + inc.length, go: inc.length ? 'pCentro:dInc' : 'pCentro:dOp' });

    // Jugadores y facturado (GolfManager)
    const stG = gmStale(); const vd = state.vivo && state.vivo.datos; const vu = vd && vd.fecha === hoy ? vd.unidades : null;
    const jv = jugadoresVivo(); const nInf = hs && hs.negocio && hs.negocio.jugadores_hoy != null ? hs.negocio.jugadores_hoy : null;
    const gk = vu && vu.hoy ? Object.keys(vu.hoy).find((a) => /golf|campo|green/i.test(a) && !/gourmet/i.test(a)) : null;
    const dadas = gk && vu.hoy_hechas && vu.hoy_hechas[gk] && typeof vu.hoy_hechas[gk].reservas === 'number' ? vu.hoy_hechas[gk].reservas : null;
    setTile('tJug', lab('Jugadores') + (jv ? big(String(jv.n), 'm') + sub(stG || (dadas !== null ? dadas + ' ya dadas' : 'GolfManager ' + (jv.hora || ''))) + (dadas !== null && jv.n > 0 ? '<span class="bar"><i style="width:' + Math.min(100, dadas / jv.n * 100).toFixed(1) + '%"></i></span>' : '')
      : nInf !== null ? big(String(nInf), 'm') + sub('del informe' + (hs.informe_hora ? ' ' + hs.informe_hora : '')) : big('—', 'm dim') + sub(stG || 'no disponible')), { stale: !!stG || (!jv && nInf === null) });
    const vh = vu ? vu.ventas_hoy : null; const fac = vh && vh.version === 'P86' && vh.fecha === hoy ? eur(vh.total) : null;
    setTile('tFac', lab('Facturado') + (fac ? big(fac, 'm') + sub(stG || 'con IVA · ' + hhmm(vd.generado)) : big('—', 'm dim') + sub(stG || 'no disponible')), { stale: !!stG || !fac });

    // Buzón del equipo
    const r = state.revision; const pend = r && Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo : null; const stB = buzonStale();
    const viejo = pend && pend.length ? Math.max.apply(null, pend.map((p) => typeof p.dias === 'number' ? p.dias : 0)) : 0;
    setTile('tBuzon', lab('Buzón del equipo') + (pend === null ? big('—', 'm dim') + sub(stB || 'sin revisión todavía')
      : '<span class="rowb">' + big(String(pend.length), 'm' + (pend.length ? '' : ' ok')) + sub(pend.length ? 'esperando' : 'al día') + '</span>' + sub(stB || (pend.length ? 'el más antiguo, ' + (viejo === 0 ? 'de hoy' : plural(viejo, 'día', 'días')) : 'ningún cliente esperando'), !stB && viejo >= 3 ? 'crit' : '') + (areasResumen().length ? sub(areasResumen().join(' · '), 'wrap') : '')),
      { crit: viejo >= 7, stale: !!stB, sig: pend === null ? null : pend.map((p) => p.enlace || p.asunto || '').sort().join('|') });

    // Trabajan
    const tu = turnosAhora();
    setTile('tTurnos', lab(tu && tu.noche ? 'Trabajan mañana' : 'Trabajan ahora') + (tu ? '<span class="rowb">' + big(String(tu.noche ? tu.total : tu.dentro), 'm') + sub(tu.noche ? 'con turno' : 'de ' + tu.total + ' con turno') + '</span>' + sub(stG || (tu.aus ? plural(tu.aus, 'ausencia', 'ausencias') : 'sin ausencias'))
      : big('—', 'm dim') + sub(stG || 'turnos no disponibles')), { stale: !!stG || !tu });

    // Lo que viene
    const v = vieneTxt();
    setTile('tViene', lab('Lo que viene') + '<span class="go">' + sub(v.txt) + svg(I_GO, 16) + '</span>', { sig: v.tor + '#' + v.prox });

    // Cuántas casillas han cambiado desde la última visita
    const nNov = document.querySelectorAll('#tablero .tile.nw').length; const pn = $('#parteNov');
    if (pn) pn.textContent = nNov && novBase && novBase.at ? plural(nNov, 'novedad', 'novedades') + ' desde ' + (localDay(new Date(novBase.at).toISOString()) === hoy ? '' : 'el ' + fmtShort(localDay(new Date(novBase.at).toISOString())) + ' ') + hhmm(new Date(novBase.at).toISOString()) : '';

    // Barra inferior: contadores
    const badge = (id, n, crit) => { const el = document.getElementById(id); if (!el) return; el.hidden = !n; el.textContent = n || ''; el.classList.toggle('crit', !!crit); };
    badge('bTuyo', nF, venc > 0); badge('bCentro', inc.length, true); badge('bCli', (rec || 0) + (pend ? pend.length : 0), rec > 0 || viejo >= 3);
  }

  // ---------- Clientes ----------
  // El informe envía hoy solo recuentos. Cuando envíe el detalle (clientes.reclamaciones y clientes.dinero: asunto, días, área, estado,
  // importe, enlace) se lista aquí caso a caso; mientras tanto se dice el recuento y que el detalle no ha llegado. Nunca un dato inventado.
  // P129 (21/11/2026) · contrato de `sync.datos.clientes` versión 1: listas `reclamaciones` y `dinero` con su `*_meta`.
  // Lista null + meta.disponible = false → sin dato. Lista vacía + disponible = true → cero real. La hora válida es meta.leido_at.
  function casoRow(x, tipo, dup) {
    const ds = typeof x.dias_sin_respuesta === 'number' ? x.dias_sin_respuesta : null; const da = typeof x.dias_abierta === 'number' ? x.dias_abierta : typeof x.dias === 'number' ? x.dias : null;
    const d = ds !== null ? ds : da; const hot = tipo === 'rec' ? (d !== null && d >= 1) || /cr[ií]tica/i.test(x.nivel || '') : ds !== null && ds >= 3;
    const est = tipo === 'din' && x.estado_hilo ? x.estado_hilo : x.estado;
    const donde = [x.area, x.bandeja].filter(Boolean).filter((v, i, l) => l.indexOf(v) === i).join(' · ');
    const meta = [donde, typeof x.importe === 'number' ? eur(x.importe) : '', ds !== null && da !== null && da !== ds ? 'abierto hace ' + (da === 0 ? 'hoy' : da + ' d') : '', x.hilos_total > 1 ? x.hilos_total + ' hilos' : '', dup ? 'también en reclamaciones' : ''].filter(Boolean).map(esc).join(' · ');
    const inner = '<span class="age">' + (d === null ? '—' : d === 0 ? 'hoy' : d + ' d') + '</span><span class="ct"><b>' + esc(x.asunto || x.titulo || 'Sin asunto') + '</b><span>' + (est ? '<em>' + esc(est) + '</em>' + (meta ? ' · ' : '') : '') + meta + '</span></span>';
    return x.enlace && /^https:\/\//i.test(x.enlace) ? '<a class="crow' + (hot ? ' hot' : '') + '" href="' + esc(x.enlace) + '" target="_blank" rel="noopener">' + inner + '<span class="go">' + svg(I_GO, 18) + '</span></a>'
      : '<div class="crow' + (hot ? ' hot' : '') + '">' + inner + '<span></span></div>';
  }
  function cliBloque(c, k) {
    const lista = c && Array.isArray(c[k]) ? c[k] : null; const m = c && c[k + '_meta'] && typeof c[k + '_meta'] === 'object' ? c[k + '_meta'] : null;
    const cuenta = c ? (k === 'reclamaciones' ? c.reclamaciones_sin_respuesta : c.dinero_pendiente) : null; const n = lista ? lista.length : typeof cuenta === 'number' ? cuenta : cuenta != null && isFinite(Number(cuenta)) ? Number(cuenta) : null;
    const hoy = ymd(today()); const leido = m && m.leido_at ? (localDay(m.leido_at) === hoy ? 'leído a las ' + hhmm(m.leido_at) : 'leído el ' + fmtShort(localDay(m.leido_at)) + ' ' + hhmm(m.leido_at)) : '';
    return { lista, n, leido, sinDetalle: !lista, motivo: m && m.disponible === false ? (m.motivo || 'no disponible') : '', foto: c && c.informe && typeof c.informe === 'object' ? c.informe : null };
  }
  function renderClientes() {
    const hs = syncHoy(); const c = hs && hs.clientes; const stI = informeStale();
    const R = cliBloque(c, 'reclamaciones'), D = cliBloque(c, 'dinero'); const rec = R.n, din = D.n;
    const r = state.revision; const pend = r && Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo : null; const res = r && Array.isArray(r.resueltos_equipo) ? r.resueltos_equipo : null;
    const cel = (v, t, crit) => '<div><b' + (crit ? ' class="crit"' : '') + '>' + (v === null ? '—' : esc(String(v))) + '</b><span>' + esc(t) + '</span></div>';
    $('#cliPulse').innerHTML = cel(rec, rec === 1 ? 'reclamación' : 'reclamaciones', rec > 0) + cel(din, din === 1 ? 'asunto de dinero' : 'asuntos de dinero') + cel(pend ? pend.length : null, 'esperando al equipo') + cel(res ? res.length : null, res && res.length === 1 ? 'resuelto hoy' : 'resueltos hoy');
    const hora = hs && hs.informe_hora ? 'informe de las ' + hs.informe_hora : '';
    const sinDet = (B) => B.motivo ? 'Sin detalle ahora (' + B.motivo + ').' : 'El detalle todavía no ha llegado; se actualiza con cada revisión del buzón.';
    $('#reclS').textContent = rec === null ? (stI || 'sin dato') : (rec ? plural(rec, 'sin respuesta', 'sin respuesta') : 'ninguna sin respuesta') + (R.leido || hora ? ' · ' + (R.leido || hora) : '');
    $('#reclList').innerHTML = R.lista && R.lista.length ? '<div class="cbody">' + R.lista.slice().sort((a, b) => (b.dias_sin_respuesta || 0) - (a.dias_sin_respuesta || 0)).map((x) => casoRow(x, 'rec')).join('') + '</div>'
      : rec === null ? '<p class="cnote">' + esc(L0(stI, 'Hoy no hay dato de reclamaciones.')) + '</p>'
      : rec === 0 ? '<p class="cnote">Ninguna reclamación sin respuesta.</p>'
      : '<p class="cnote"><b>' + esc(rec === 1 ? '1 reclamación sin respuesta.' : rec + ' reclamaciones sin respuesta.') + '</b> ' + esc(sinDet(R)) + '</p>';
    const enRec = {}; (R.lista || []).forEach((x) => { if (x.thread_id) enRec[String(x.thread_id).toLowerCase()] = 1; });
    const foto = D.foto && typeof D.foto.dinero_pendiente === 'number' && D.lista && D.foto.dinero_pendiente !== din ? D.foto.dinero_pendiente + ' en el informe' + (D.foto.hora ? ' de las ' + D.foto.hora : '') : '';
    $('#dinS').textContent = din === null ? (stI || 'sin dato') : din ? [plural(din, 'abierto', 'abiertos'), foto, D.leido].filter(Boolean).join(' · ') : 'ninguno abierto' + (D.leido ? ' · ' + D.leido : '');
    const pie = '<p class="cnote">Son asuntos de correo abiertos donde hay dinero de por medio, no importes pendientes de pago. ' + (c && c.dinero_tipos ? esc(c.dinero_tipos) + '. ' : '') + (c && c.devoluciones_7d ? 'Devoluciones en 7 días: ' + esc(c.devoluciones_7d) + '.' : '') + '</p>';
    $('#dinList').innerHTML = D.lista && D.lista.length ? '<div class="cbody">' + D.lista.slice().sort((a, b) => (b.dias_sin_respuesta === null || b.dias_sin_respuesta === undefined ? -1 : b.dias_sin_respuesta) - (a.dias_sin_respuesta === null || a.dias_sin_respuesta === undefined ? -1 : a.dias_sin_respuesta) || (b.dias_abierta || 0) - (a.dias_abierta || 0)).map((x) => casoRow(x, 'din', x.thread_id && enRec[String(x.thread_id).toLowerCase()])).join('') + '</div>' + pie
      : din === null ? '<p class="cnote">' + esc(L0(stI, 'Hoy no hay dato de asuntos de dinero.')) + '</p>'
      : din === 0 ? '<p class="cnote">Ningún asunto de dinero abierto.' + (c && c.devoluciones_7d ? '<br>Devoluciones en 7 días: ' + esc(c.devoluciones_7d) + '.' : '') + '</p>'
      : '<p class="cnote"><b>' + esc(plural(din, 'asunto de dinero abierto', 'asuntos de dinero abiertos')) + '.</b> ' + esc(sinDet(D)) + '</p>' + pie;
    defaultOpen('dRecl', rec > 0); defaultOpen('dDin', din > 0);
  }
  function L0(stale, otro) { return stale ? stale.charAt(0).toUpperCase() + stale.slice(1) + '.' : otro; }

  // ---------- Incidencias del día (las dictas tú) ----------
  function renderIncidencias() {
    const list = incidenciasList(); const hoy = ymd(today());
    const cerradas = cng().filter((it) => isInc(it) && it.estado === 'hecho' && localDay(it.hecho_at) === hoy).length;
    $('#incS').textContent = [list.length ? plural(list.length, 'abierta', 'abiertas') : 'ninguna abierta', cerradas ? plural(cerradas, 'resuelta hoy', 'resueltas hoy') : ''].filter(Boolean).join(' · ');
    defaultOpen('dInc', list.length > 0);
    $('#incidencias').innerHTML = list.length ? list.map((it) => { const d = localDay(it.created_at); return rowLi(it, d === hoy ? hhmm(it.created_at) : ago(it.created_at)); }).join('')
      : '<li class="plain"><span class="muted">Sin incidencias abiertas.</span><span></span></li>';
  }

  // ---------- Tendencia de 7 días (lecturas guardadas de GolfManager) ----------
  async function loadHist() {
    if (state.histAt && Date.now() - state.histAt < 30 * 60000) return;
    const desde = ymd(addDays(today(), -7)), hasta = ymd(today()); let rows = [];
    for (let p = 0; p < 4; p++) {
      const { data, error } = await sb.from('reservas_historico').select('fecha,unidad,reservas,generado').gte('fecha', desde).lte('fecha', hasta).order('generado', { ascending: false }).range(p * 1000, p * 1000 + 999);
      if (error || !Array.isArray(data)) return; rows = rows.concat(data); if (data.length < 1000) break;
    }
    const last = {}; rows.forEach((x) => { const k = x.fecha + '|' + x.unidad; if (!last[k] || String(x.generado) > String(last[k].generado)) last[k] = x; });
    state.hist = Object.keys(last).map((k) => last[k]); state.histAt = Date.now();
  }
  function renderTendencia() {
    const el = $('#tend'); if (!el) return; const h = Array.isArray(state.hist) ? state.hist : [];
    const golf = h.filter((x) => /golf|campo|green/i.test(x.unidad) && !/gourmet/i.test(x.unidad));
    if (golf.length < 2) { el.hidden = true; return; }
    const por = {}; golf.forEach((x) => { por[x.fecha] = x; }); const hoy = ymd(today()); const dias = []; for (let i = 7; i >= 0; i--) dias.push(ymd(addDays(today(), -i)));
    const max = Math.max.apply(null, dias.map((d) => por[d] ? por[d].reservas || 0 : 0).concat(1));
    el.hidden = false;
    el.innerHTML = lab('Golf · últimos 7 días') + '<div class="bars">' + dias.map((d) => { const x = por[d]; const n = x ? x.reservas || 0 : null;
      return '<div class="col' + (d === hoy ? ' hoy' : '') + '"><b>' + (n === null ? '—' : n) + '</b><i style="height:' + (n === null ? 0 : Math.max(3, n / max * 60)).toFixed(0) + 'px"></i><small>' + DIAS3[parseYmd(d).getDay()].slice(0, 1) + '</small></div>'; }).join('') + '</div>' +
      '<p>Reservas de golf en la última lectura de cada día' + (por[hoy] ? '; hoy, a las ' + hhmm(por[hoy].generado) : '') + '.</p>';
  }

  // ---------- resúmenes de módulos ----------
  function renderResumenes() {
    // El tablero enseña la primera línea del parte; el resto se despliega sin salir de la casilla
    const pm = $('#parteMas'); const tp = $('#tParte');
    if (pm && tp) { const extra = $('#parte').querySelectorAll('p:not(.calm):not(.empty)').length - 1 + ($('#parte').querySelector('.since') ? 1 : 0); const cut = tp.classList.contains('cut');
      const largo = [...$('#parte').querySelectorAll('p:not(.calm):not(.empty)')].some((x) => x.scrollHeight > x.clientHeight + 2); pm.hidden = extra < 0 || (cut && !largo && !$('#parte').querySelector('.since')); pm.textContent = cut ? 'Ampliar' : 'Recoger'; pm.setAttribute('aria-expanded', String(!cut)); }

    const v = $('#vieneS'); if (v) v.textContent = vieneTxt().txt;
    const c = $('#cerradoS'); if (c && $('#cierreLine')) c.textContent = $('#cierreLine').textContent.replace(/^Hoy: /, 'hoy ');
  }

  // ---------- hoja para soltar o dictar ----------
  function openSoltar(dictar) { $('#soltarOverlay').hidden = false; if (dictar && SR && !rec && !$('#btnMic').hidden) $('#btnMic').click(); else setTimeout(() => { try { $('#suelta').focus(); } catch (e) {} }, 60); }
  function closeSoltar() { stopMic(); $('#soltarOverlay').hidden = true; }
  $('#orb').addEventListener('click', () => openSoltar(true));
  $('#sCerrar').addEventListener('click', closeSoltar);
  $('#soltarOverlay').addEventListener('click', (e) => { if (e.target === $('#soltarOverlay')) closeSoltar(); });
  $('#chipInc').addEventListener('click', () => { const b = $('#chipInc'); b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#soltarOverlay').hidden) closeSoltar(); });

  // ---------- aviso con «Deshacer» ----------
  let toastTimer = null;
  function toast(msg, undo) {
    const t = $('#toast'); t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button" class="mini" id="toastUndo">Deshacer</button>' : '');
    t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
    if (undo) $('#toastUndo').addEventListener('click', async () => { t.hidden = true; clearTimeout(toastTimer); await undo(); });
  }

  // ---------- último estado guardado (abre al instante y sin cobertura) ----------
  const SNAP = 'dp6.snap'; const SNAPK = ['items', 'events', 'prep', 'briefing', 'briefingPrev', 'revision', 'libreta', 'solicitudes', 'sync', 'vivoRaw', 'semana', 'hist', 'vig', 'metricas', 'avisos', 'areas', 'resp'];
  function saveSnap() { try { const o = { at: Date.now() }; SNAPK.forEach((k) => { o[k] = state[k]; }); localStorage.setItem(SNAP, JSON.stringify(o)); } catch (e) {} }
  function loadSnap() { try { const s = JSON.parse(localStorage.getItem(SNAP) || 'null'); if (!s || !Array.isArray(s.items)) return false; SNAPK.forEach((k) => { if (s[k] !== undefined && s[k] !== null) state[k] = s[k]; }); state.snapAt = s.at; return true; } catch (e) { return false; } }
  function storedUserOk() { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) { const v = JSON.parse(localStorage.getItem(k)); const u = v && (v.user || (v.currentSession && v.currentSession.user)); if (u && u.email === EMAIL) return true; } } } catch (e) {} return false; }
  function snapTxt() { const iso = new Date(state.snapAt).toISOString(); return 'Sin conexión: ves los datos de ' + (localDay(iso) === ymd(today()) ? 'las ' : 'el ' + fmtShort(localDay(iso)) + ', ') + hhmm(iso) + '.'; }
  $('#btnSalir').addEventListener('click', () => { try { localStorage.removeItem(SNAP); localStorage.removeItem('dp6.nov'); localStorage.removeItem('dp6.novNext'); } catch (e) {} });

  // ---------- apariencia: automática, noche o día ----------
  const TEMAS = ['auto', 'dark', 'light']; const TEMAN = { auto: 'Automática', dark: 'Noche', light: 'Día' };
  function temaActual() { try { const t = localStorage.getItem('dp6.theme'); return TEMAS.includes(t) ? t : 'auto'; } catch (e) { return 'auto'; } }
  function applyTheme() {
    const t = temaActual(); if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
    $('#btnTema').textContent = 'Apariencia: ' + TEMAN[t];
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', dark ? '#0A1220' : '#F2F4F7');
  }
  $('#btnTema').addEventListener('click', () => { try { localStorage.setItem('dp6.theme', TEMAS[(TEMAS.indexOf(temaActual()) + 1) % 3]); } catch (e) {} applyTheme(); });
  applyTheme();

  // El reloj de la cabecera y la esfera avanzan cada minuto; los datos se recargan cada 5 minutos mientras la app está a la vista.
  setInterval(() => { if (!document.hidden && !$('#appView').hidden) { header(); renderInicio(); } }, 60000);
  setInterval(() => { if (!document.hidden && !$('#appView').hidden && navigator.onLine !== false) loadAll(); }, 5 * 60000);

  // ================= V6.1 (21/11/2026 · Sr. Vela) =================
  // «Vigilar» y avisos al móvil (fase 2 de Supabase), buzón por bandeja y responsable, filtro por pestañitas en «Esperando
  // respuesta del equipo», parte como lista numerada y nombres de torneo sin mayúsculas corridas.
  const fmtN = (v) => v === null || v === undefined || v === '' ? '—' : String(Math.round(Number(v) * 100) / 100).replace('.', ',');
  const OPS = { '<': 'menor que', '<=': 'menor o igual que', '>': 'mayor que', '>=': 'mayor o igual que', '=': 'igual a' };
  const I_PLUS = '<path d="M12 5v14M5 12h14"></path>';

  // ---------- carga de lo nuevo (si la fase 2 no estuviera instalada, estos módulos simplemente no salen) ----------
  let canal6 = null, extraT = null;
  async function loadExtra() {
    const [v, m, a, ar, rp] = await Promise.all([
      sb.from('vigilancias').select('*').order('created_at'), sb.from('vigilar_metricas').select('*').order('orden'),
      sb.from('avisos').select('*').order('at', { ascending: false }).limit(12), sb.rpc('buzon_areas', { p_dias: 7 }), sb.from('despacho_responsables').select('*')]);
    if (!v.error && Array.isArray(v.data)) state.vig = v.data; if (!m.error && Array.isArray(m.data)) state.metricas = m.data;
    if (!a.error && Array.isArray(a.data)) state.avisos = a.data; if (!ar.error && ar.data && Array.isArray(ar.data.areas)) state.areas = ar.data;
    if (!rp.error && Array.isArray(rp.data)) state.resp = rp.data;
    if (!canal6 && !v.error) {
      const re = () => { clearTimeout(extraT); extraT = setTimeout(async () => { await loadExtra(); renderAll(); }, 300); };
      canal6 = sb.channel('despacho6').on('postgres_changes', { event: '*', schema: 'public', table: 'vigilancias' }, re).on('postgres_changes', { event: '*', schema: 'public', table: 'avisos' }, re); canal6.subscribe();
    }
    pushEstado();
  }

  // ---------- Vigilar ----------
  function metrica(k) { return (state.metricas || []).find((x) => x.clave === k) || { clave: k, nombre: k, unidad: '', fuente: '' }; }
  function conUnidad(v, u) { return fmtN(v) + (u === '' ? '' : u === '/100' ? '/100' : ' ' + u); }
  function renderVigilar() {
    const d = $('#dVig'); const list = Array.isArray(state.vig) ? state.vig : null;
    if (!d) return; d.hidden = list === null; if (list === null) { setTile('tVig', '', { hidden: true }); return; }
    const al = list.filter((r) => r.activa && r.en_alerta);
    $('#vigS').textContent = list.length ? [plural(list.length, 'regla', 'reglas'), al.length ? al.length + ' en alerta' : 'ninguna en alerta'].join(' · ') : 'sin reglas todavía';
    $('#vigList').innerHTML = list.length ? list.map((r) => { const m = metrica(r.metrica); const est = !r.activa ? 'off' : r.en_alerta ? 'bad' : r.valor === null || r.valor === undefined ? 'nd' : 'ok';
      return '<button type="button" class="vgrow ' + est + '" data-vig="' + esc(r.id) + '"><span class="dot"></span><span class="vt2"><b>' + esc(r.titulo) + '</b><span>' + esc(m.nombre + ' ' + ({ '>=': '≥', '<=': '≤' }[r.op] || r.op) + ' ' + conUnidad(r.umbral, m.unidad)) + ' · ' +
        (!r.activa ? 'en pausa' : r.valor === null || r.valor === undefined ? 'sin dato ahora' : 'ahora ' + esc(conUnidad(r.valor, m.unidad))) + (r.evaluada_at && r.activa ? ' · ' + hhmm(r.evaluada_at) : '') + '</span></span><span class="go">' + svg(I_GO, 18) + '</span></button>'; }).join('')
      : '<p class="cnote">Sin reglas. Añade la primera con el botón de abajo.</p>';
    // avisos
    const av = Array.isArray(state.avisos) ? state.avisos : []; const hoy = ymd(today());
    $('#avList').innerHTML = av.length ? av.slice(0, 8).map((a) => '<li class="plain"><span>' + esc(a.titulo) + (a.cuerpo ? '<span class="sub">' + esc(a.cuerpo) + '</span>' : '') + '</span><span class="r">' + esc((localDay(a.at) === hoy ? '' : fmtShort(localDay(a.at)) + ' ') + hhmm(a.at)) + '</span></li>').join('')
      : '<li class="plain"><span class="muted">Todavía no hay avisos.</span><span></span></li>';
    const p = state.push || 'cargando'; const ps = $('#pushS'), pb = $('#btnPush'), pt = $('#btnPushTest');
    ps.textContent = p === 'activo' ? 'Avisos activados en este dispositivo.' : p === 'denegado' ? 'Los avisos están bloqueados para Despacho en los ajustes de este dispositivo.'
      : p === 'no' ? 'Aquí no se pueden activar avisos. En el iPhone: añade Despacho a la pantalla de inicio y ábrelo desde ese icono.' : p === 'inactivo' ? 'Este dispositivo todavía no recibe avisos.' : '';
    pb.hidden = p !== 'inactivo'; pt.hidden = p !== 'activo';
    // casilla del tablero
    setTile('tVig', lab('Vigilar') + '<span class="go">' + sub(al.length ? al.length + ' en alerta · ' + al[0].titulo : list.length ? 'todo en orden · ' + plural(list.length, 'regla', 'reglas') : 'sin reglas') + svg(I_GO, 16) + '</span>',
      { crit: al.length > 0, sig: al.map((r) => r.id).sort().join('|') });
  }
  function openVig(r) {
    state.vigEdit = r || null; const ms = state.metricas || [];
    $('#vgMet').innerHTML = ms.map((m) => '<option value="' + esc(m.clave) + '">' + esc(m.nombre) + (m.unidad ? ' (' + esc(m.unidad) + ')' : '') + ' · ' + esc(m.fuente) + '</option>').join('');
    $('#vgTitle').textContent = r ? 'Regla' : 'Nueva regla';
    $('#vgTitulo').value = r ? r.titulo : ''; $('#vgMet').value = r ? r.metrica : (ms[0] ? ms[0].clave : ''); $('#vgOp').value = r ? r.op : '>';
    $('#vgUmbral').value = r ? String(r.umbral).replace('.', ',') : ''; $('#vgDesde').value = r ? r.desde_hora : 7; $('#vgHasta').value = r ? r.hasta_hora : 22;
    $('#vgActiva').checked = r ? !!r.activa : true; $('#vgDel').hidden = !r; $('#vgDel').textContent = 'Eliminar'; $('#vgDel').dataset.armed = ''; $('#vgStatus').textContent = '';
    $('#vigOverlay').hidden = false;
  }
  function closeVig() { $('#vigOverlay').hidden = true; state.vigEdit = null; }
  $('#vigList').addEventListener('click', (e) => { const b = e.target.closest('[data-vig]'); if (!b) return; const r = (state.vig || []).find((x) => x.id === b.dataset.vig); if (r) openVig(r); });
  $('#btnVigNew').addEventListener('click', () => openVig(null));
  $('#vgCancel').addEventListener('click', closeVig);
  $('#vigOverlay').addEventListener('click', (e) => { if (e.target === $('#vigOverlay')) closeVig(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#vigOverlay').hidden) closeVig(); });
  $('#vgSave').addEventListener('click', async () => {
    const st = $('#vgStatus'); const umbral = Number(String($('#vgUmbral').value).trim().replace(',', '.'));
    const desde = Number($('#vgDesde').value), hasta = Number($('#vgHasta').value); const met = $('#vgMet').value, op = $('#vgOp').value;
    if (!met) { st.textContent = 'Elige qué vigilar.'; return; }
    if (String($('#vgUmbral').value).trim() === '' || !isFinite(umbral)) { st.textContent = 'Escribe el valor a partir del cual avisar.'; return; }
    if (!(desde >= 0 && desde <= 23 && hasta >= 1 && hasta <= 24 && desde < hasta)) { st.textContent = 'El horario va de 0 a 24 y «desde» tiene que ser menor que «hasta».'; return; }
    const m = metrica(met); const titulo = ($('#vgTitulo').value.trim() || (m.nombre + ' ' + OPS[op] + ' ' + conUnidad(umbral, m.unidad))).slice(0, 160);
    const data = { titulo, metrica: met, op, umbral, desde_hora: desde, hasta_hora: hasta, activa: $('#vgActiva').checked };
    // Si cambia la condición, la regla vuelve a empezar: no arrastra la alerta de la condición anterior.
    const r = state.vigEdit; if (r && (r.metrica !== met || r.op !== op || Number(r.umbral) !== umbral)) Object.assign(data, { en_alerta: false, alerta_desde: null, valor: null, evaluada_at: null });
    $('#vgSave').disabled = true;
    const { error } = r ? await sb.from('vigilancias').update(data).eq('id', r.id) : await sb.from('vigilancias').insert(data);
    $('#vgSave').disabled = false;
    if (error) { st.textContent = 'No se pudo guardar (' + error.message + ').'; return; }
    closeVig(); await loadExtra(); renderAll(); toast(r ? 'Regla guardada.' : 'Regla creada: se comprueba cada 5 minutos.');
  });
  $('#vgDel').addEventListener('click', async () => {
    const b = $('#vgDel'); if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = '¿Seguro? Eliminar'; return; }
    if (!state.vigEdit) return; const { error } = await sb.from('vigilancias').delete().eq('id', state.vigEdit.id);
    if (error) { $('#vgStatus').textContent = 'No se pudo eliminar (' + error.message + ').'; return; }
    closeVig(); await loadExtra(); renderAll();
  });

  // ---------- avisos al móvil ----------
  const b64uBytes = (s) => { const t = String(s).replace(/-/g, '+').replace(/_/g, '/'); const p = t + '='.repeat((4 - (t.length % 4)) % 4); const raw = atob(p); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
  async function pushEstado() {
    let e = 'no';
    try {
      if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
        if (Notification.permission === 'denied') e = 'denegado';
        else { const reg = await navigator.serviceWorker.getRegistration(); const s = reg && Notification.permission === 'granted' ? await reg.pushManager.getSubscription() : null; e = s ? 'activo' : 'inactivo'; }
      }
    } catch (err) { e = 'no'; }
    if (state.push !== e) { state.push = e; renderVigilar(); }
  }
  $('#btnPush').addEventListener('click', async () => {
    const ps = $('#pushS'); const b = $('#btnPush'); b.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { state.push = perm === 'denied' ? 'denegado' : 'inactivo'; renderVigilar(); return; }
      const { data: pub, error: e1 } = await sb.rpc('avisos_clave_publica');
      if (e1 || !pub) { ps.textContent = 'El servidor de avisos no ha dado su clave' + (e1 ? ' (' + e1.message + ')' : '') + '. Inténtalo en un minuto.'; return; }
      const reg = await navigator.serviceWorker.ready; const opts = { userVisibleOnly: true, applicationServerKey: b64uBytes(pub) };
      let s = await reg.pushManager.getSubscription();
      if (!s) { try { s = await reg.pushManager.subscribe(opts); } catch (err) { const old = await reg.pushManager.getSubscription(); if (old) { await old.unsubscribe(); s = await reg.pushManager.subscribe(opts); } else throw err; } }
      const j = s.toJSON(); const ua = navigator.userAgent; const disp = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Navegador';
      const { error: e2 } = await sb.from('push_subs').upsert({ endpoint: s.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, dispositivo: disp, activa: true, fallos: 0 }, { onConflict: 'endpoint' });
      if (e2) { ps.textContent = 'No se pudo registrar este dispositivo (' + e2.message + ').'; return; }
      state.push = 'activo'; renderVigilar(); toast('Avisos activados en este dispositivo.');
    } catch (err) { ps.textContent = 'No se pudieron activar los avisos (' + (err && err.message ? err.message : err) + ').'; }
    finally { b.disabled = false; }
  });
  $('#btnPushTest').addEventListener('click', async () => {
    const { error } = await sb.from('avisos').insert({ tipo: 'prueba', titulo: 'Aviso de prueba', cuerpo: 'Si lo ves en el móvil, los avisos funcionan.' });
    toast(error ? 'No se pudo enviar la prueba (' + error.message + ').' : 'Prueba enviada: debería llegar en unos segundos.');
  });

  // ---------- buzón por bandeja y responsable ----------
  // Extranjeros es de Mónica y Escuela de Jessica (lo guarda Supabase, no el código): aquí se ve si cada bandeja está al día.
  function respDe(nombre) { const n = norm(nombre); const r = (state.resp || []).find((x) => x.patron && n.includes(norm(x.patron))); return r || null; }
  // Gmail etiqueta cada correo con un Área (Escuela CNG, Extranjeros…) y con un Responsable (Atención al Cliente, Sergio…).
  // Aquí se mide por Área, que es lo que lleva cada responsable de verdad; mientras la revisión guardada no traiga el área, por bandeja.
  function modoAreas() {
    const r = state.revision; const pend = r && Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo : [];
    return pend.some((p) => p && 'area' in p) || (!pend.length && !!(state.areas && state.areas.area_desde)) ? 'area' : 'bandeja';
  }
  function grupoDe(p, modo) { return modo === 'area' ? (p.area || 'Sin área') : (p.bandeja || 'Sin bandeja'); }
  function areasList() {
    const r = state.revision; const pend = r && Array.isArray(r.pendientes_equipo) ? r.pendientes_equipo : [];
    const modo = modoAreas(); const pre = modo === 'area' ? 'a:' : 'b:'; const por = {};
    const fila = (k) => por[k] || (por[k] = { nombre: k, clave: pre + k, ahora: 0, max_dias: null, salieron: null, serie: [], en: [] });
    pend.forEach((p) => { const o = fila(grupoDe(p, modo)); o.ahora++; if (typeof p.dias === 'number') o.max_dias = Math.max(o.max_dias === null ? 0 : o.max_dias, p.dias); if (modo === 'area' && p.bandeja && !o.en.includes(p.bandeja)) o.en.push(p.bandeja); });
    const hist = state.areas ? (modo === 'area' ? state.areas.por_area : state.areas.areas) : null;
    (Array.isArray(hist) ? hist : []).forEach((h) => { const o = fila(h.bandeja); o.salieron = h.salieron; o.serie = Array.isArray(h.serie) ? h.serie : []; });
    // las áreas con responsable salen siempre: «al día» también es un dato. Sin dato por área todavía, se dice, no se inventa.
    (state.resp || []).forEach((x) => { if (!Object.keys(por).some((k) => norm(k).includes(norm(x.patron)))) Object.assign(fila(x.area), modo === 'area' ? {} : { sinDato: true, clave: '' }); });
    return Object.keys(por).map((k) => Object.assign(por[k], { resp: respDe(k), modo })).sort((a, b) => (b.resp ? 1 : 0) - (a.resp ? 1 : 0) || b.ahora - a.ahora || a.nombre.localeCompare(b.nombre));
  }
  function areasResumen() { return areasList().filter((a) => a.resp).map((a) => a.nombre + ': ' + (a.sinDato ? 'sin dato aún' : a.ahora ? a.ahora + (a.max_dias ? ' · ' + a.max_dias + ' d' : '') : 'al día')); }
  function renderAreas() {
    const d = $('#dAreas'); if (!d) return; const r = state.revision; d.hidden = !r; if (!r) return;
    const list = areasList(); const modo = modoAreas(); const dias = []; for (let i = 6; i >= 0; i--) dias.push(ymd(addDays(today(), -i)));
    $('#areasT').textContent = modo === 'area' ? 'Por área y responsable' : 'Por bandeja y responsable';
    const res = areasResumen(); $('#areasS').textContent = res.length ? res.join(' · ') : plural(list.length, modo === 'area' ? 'área' : 'bandeja', modo === 'area' ? 'áreas' : 'bandejas');
    const max = Math.max.apply(null, list.map((a) => Math.max.apply(null, a.serie.map((s) => s.n).concat(a.ahora, 1))));
    // por área solo hay historia desde que la revisión guarda el área: se dice desde cuándo
    const desde = modo === 'area' && state.areas && state.areas.area_desde ? localDay(state.areas.area_desde) : null;
    const periodo = desde && desde > dias[0] ? (desde === ymd(today()) ? 'desde hoy' : 'desde el ' + fmtShort(desde)) : 'en 7 días';
    $('#areasList').innerHTML = list.map((a) => { const por = {}; a.serie.forEach((s) => { por[s.dia] = s.n; }); const hot = a.max_dias !== null && a.max_dias >= 3;
      const bars = a.serie.length ? '<span class="spark" role="img" aria-label="Pendientes al final de cada uno de los últimos 7 días">' + dias.map((x) => '<i style="height:' + (por[x] ? Math.max(3, Math.round(por[x] / max * 22)) : 2) + 'px"' + (por[x] ? '' : ' class="z"') + '></i>').join('') + '</span>' : '<span class="spark"></span>';
      const sub2 = [a.resp ? a.resp.responsable : '', a.en.filter((x) => norm(x) !== norm(a.nombre)).length ? 'asignados a ' + a.en.filter((x) => norm(x) !== norm(a.nombre)).join(', ') : ''].filter(Boolean).join(' · ');
      return '<button type="button" class="arow' + (hot ? ' hot' : '') + (a.clave && state.eqFilter === a.clave ? ' sel' : '') + '" data-eqf="' + esc(a.clave) + '" data-ir="1"' + (a.ahora ? '' : ' disabled') + '>' +
        '<span class="an"><b>' + esc(a.nombre) + '</b>' + (sub2 ? '<span>' + esc(sub2) + '</span>' : '') + '</span>' + bars +
        '<span class="ast">' + (a.sinDato ? '<b class="nd">sin dato</b><span>por área, aún</span>' : a.ahora ? '<b>' + a.ahora + '</b><span>' + (a.max_dias === null ? 'esperando' : a.max_dias === 0 ? 'de hoy' : 'hasta ' + a.max_dias + ' d') + '</span>' : '<b class="ok">al día</b><span>nada esperando</span>') + '</span>' +
        (a.sinDato ? '<span class="aft">La revisión del buzón guardada todavía no trae el área de cada correo. Llega con la próxima pasada (cada 30 minutos).</span>' : '') +
        (a.salieron !== null && !(a.salieron === 0 && desde === ymd(today())) ? '<span class="aft">' + (a.salieron === 1 ? '1 hilo ha salido' : a.salieron + ' hilos han salido') + ' de pendientes ' + periodo + '</span>' : '') + '</button>'; }).join('');
  }

  // ---------- filtro de «Esperando respuesta del equipo» por pestañita ----------
  function eqMatch(p) {
    const f = state.eqFilter; if (!f) return true; const d = typeof p.dias === 'number' ? p.dias : null;
    if (f === 'e:vie') return d !== null && d >= 3; if (f === 'e:rec') return d !== null && d > 0 && d < 3; if (f === 'e:hoy') return d !== null && d <= 0;
    if (f.slice(0, 2) === 'a:') return (p.area || 'Sin área') === f.slice(2);
    return f.slice(0, 2) === 'b:' && (p.bandeja || 'Sin bandeja') === f.slice(2);
  }
  function fchip(cls, key, txt) { return '<button type="button" class="chip fbtn ' + cls + '" data-eqf="' + esc(key) + '" aria-pressed="' + (state.eqFilter === key ? 'true' : 'false') + '">' + esc(txt) + '</button>'; }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-eqf]'); if (!b || b.disabled) return;
    const k = b.dataset.eqf; if (b.dataset.ir && !k) return; state.eqFilter = state.eqFilter === k && !b.dataset.ir ? null : k; if (k === '') state.eqFilter = null;
    renderEquipo(); renderAreas();
    if (b.dataset.ir) { const d = $('#dEq'); if (d && !d.open) { d.dataset.auto = '1'; d.open = true; } requestAnimationFrame(() => d.scrollIntoView({ block: 'start' })); }
  });

  // ---------- nombres en mayúsculas corridas → nombre propio ----------
  const SIGLAS = /^(RFEG|CNG|WAGR|PGA|LET|FGM|AESGOLF|AECG|RCG|CG|II|III|IV|VI|VII|VIII|IX|XI|XII|XIII|XIV|XV|XX|XXI|XXV|XXX|U\d+|SUB-?\d+)$/;
  const MENUDAS = /^(de|del|la|las|el|los|y|e|en|a|al|por|con|para)$/;
  function nice(s) {
    s = String(s || '').trim(); if (!s || s !== s.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]{3}/.test(s)) return s;
    return s.split(/(\s+|-)/).map((w, i) => { if (!/[A-ZÁÉÍÓÚÑ]/.test(w) || SIGLAS.test(w) || /\d/.test(w)) return w; const l = w.toLowerCase(); return i > 0 && MENUDAS.test(l) ? l : l.charAt(0).toUpperCase() + l.slice(1); }).join('');
  }

  // ---------- arranque ----------
  async function showFor(session) {
    let ok = !!(session && session.user && session.user.email === EMAIL);
    // V6: sin red y con tu sesión guardada en este dispositivo, se abre con el último estado guardado.
    const sinRed = !ok && !session && navigator.onLine === false && storedUserOk();
    if (sinRed) ok = true;
    $('#loginView').hidden = ok; $('#appView').hidden = !ok; $('#dock').hidden = !ok;
    if (session && !ok) lgStatus('Este acceso es solo para Sergio Vela.', true);
    if (!ok) return;
    if (!state.loaded && !state.snapAt) loadSnap();
    header(); applyTab(); renderAll();
    if (sinRed) { state.loaded = true; if (state.snapAt) showBanner(snapTxt(), true); else showBanner('Sin conexión y sin datos guardados todavía.', true); renderAll(); return; }
    await loadAll(); subscribe();
  }
  sb.auth.onAuthStateChange((_ev, session) => { showFor(session); });
  // V6: si este dispositivo recuerda tu sesión y hay un estado guardado, se pinta al instante mientras se comprueba la sesión
  // (sin cobertura, comprobarla puede tardar; no hace falta esperar para ver lo último que cargaste).
  if (storedUserOk() && loadSnap()) {
    $('#loginView').hidden = true; $('#appView').hidden = false; $('#dock').hidden = false; header(); applyTab(); renderAll();
    if (navigator.onLine === false) { state.loaded = true; showBanner(snapTxt(), true); renderAll(); }
  }
  sb.auth.getSession().then(({ data }) => showFor(data.session));
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
})();

