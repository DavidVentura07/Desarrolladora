/* =========================================================
   GALITHA · Fuerza de trabajo, parte 1 (v0.13, 2026-10-09)
   Se registra en window.GALITHA_MODULOS como los demás módulos.

   Una sección con tres pestañas:
   - Pase de lista (el residente, todos los días de lunes a sábado, antes de la hora límite):
     un toque por trabajador (asistencia ✓ / falta ✗; "···" para retardo, medio día, permiso,
     incapacidad, comisión o descanso) y fotos por cuadrilla con la cámara de la app (no hay
     galería). Cada foto lleva marca de agua (obra, cuadrilla, fecha y hora, coordenadas y
     distancia a la obra), su huella SHA-256, la ubicación del GPS y la hora del celular.
     Se envía con la función enviar_pase_lista: la base revisa todo, pone la hora del servidor
     y ya no se puede cambiar (el residente pide la corrección; el coordinador o los jefes corrigen).
     "Hoy no se labora" (lluvia, festivo…) cuenta como pase de lista del día.
   - Trabajadores: altas, bajas con motivo, transferencias a otra obra y reingresos, sin
     aprobación. Los cambios se juntan y "Publicar cambios" los marca como avisados
     (el WhatsApp a Dirección y coordinador es la parte 2).
   - Registro: tabla de asistencia por rango de fechas, con el estado del pase de cada día
     (a tiempo, tarde, no se laboró, sin pase) y las fotos con sus datos.
   Reglas en supabase/12-fuerza-trabajo.sql.
   Partes 2 y 3 (14-fuerza-avisos.sql): "Publicar cambios" llama a la Edge Function "aviso-fuerza"
   (WhatsApp/correo a Dirección, admin y coordinador; la misma función avisa sola, con pg_cron, cuando
   pasa la hora límite sin pase de lista). En Registro: PDF con logo y PDF interno con fotos (Edge Function
   "reporte-fuerza"), Excel, y "Enviar al gestor IMSS" (correo con el PDF + WhatsApp con un clic).
   ========================================================= */
(window.GALITHA_MODULOS = window.GALITHA_MODULOS || []).push(api => {
  const R = window.StoreReq;
  const N = window.Nube;
  const { esc, I, toast } = api;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const sb = () => N.sb;
  const str = v => (v == null ? '' : String(v)).trim();
  const arr = v => (Array.isArray(v) ? v : []);
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };

  Object.assign(I, {
    casco: api.ico('<path d="M3 17.5h18M4.5 17.5v-2.8a7.5 7.5 0 0 1 15 0v2.8"/><path d="M9.5 8V5.5h5V8M12 7.5v4"/>'),
    camara: api.ico('<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.5-2h6.6l1.5 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="12.8" r="3.4"/>'),
    pin: api.ico('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'),
    candado: api.ico('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>')
  });
  const ic = k => I[k] || '';

  /* ---------- Fechas (siempre en hora de la Ciudad de México) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const FMX = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
  const HMX = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false });
  const HSMX = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const hoy = () => FMX.format(new Date());
  const horaMX = d => HMX.format(d ? new Date(d) : new Date());
  const toDate = s => { const m = String(s || '').slice(0, 10).split('-'); return m.length === 3 ? new Date(+m[0], +m[1] - 1, +m[2]) : null; };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); };
  const dow = s => toDate(s).getDay();
  const fDia = s => { const d = toDate(s); return d ? `${DIA[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}` : ''; };
  const fCorta = s => { const d = toDate(s); return d ? `${DIA[d.getDay()].slice(0, 3)} ${d.getDate()}` : ''; };
  const fMes = s => { const d = toDate(s); return d ? `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}` : ''; };
  const lunesDe = s => { const w = dow(s) || 7; return addDays(s, 1 - w); };
  const minHM = s => { const [h, m] = String(s || '0:0').split(':'); return (+h || 0) * 60 + (+m || 0); };

  /* ---------- Catálogos ---------- */
  const MARCAS = {
    A: { l: 'Asistencia', c: 'a', s: '✓' }, F: { l: 'Falta', c: 'f', s: '✗' },
    R: { l: 'Retardo', c: 'o', s: 'R' }, M: { l: 'Medio día', c: 'o', s: 'M' }, P: { l: 'Permiso', c: 'o', s: 'P' },
    I: { l: 'Incapacidad', c: 'o', s: 'I' }, C: { l: 'Comisión fuera de obra', c: 'o', s: 'C' }, D: { l: 'Descanso', c: 'o', s: 'D' }
  };
  const OTRAS = ['R', 'M', 'P', 'I', 'C', 'D'];
  const cuentaAsist = m => ['A', 'R', 'M', 'C'].includes(m);
  const NO_LABORA = ['Lluvia', 'Día festivo', 'Suspensión de obra', 'Falta de material', 'Otro'];
  const LISTAS = { puestos: 'Puesto', cuadrillas: 'Cuadrilla' };
  const MOV = { alta: 'Alta', reingreso: 'Reingreso', baja: 'Baja', transferencia_sale: 'Transferido', transferencia_entra: 'Llegó por transferencia', cambio: 'Cambio' };

  /* ---------- Datos ---------- */
  let F = { listo: false, error: '', obras: [], trab: [], datos: {}, movs: [], pases: [], asis: [], fotos: [], listas: { puestos: [], cuadrillas: [] }, limite: '09:00', ini: '', fin: '', avisos: [] };
  const quien = id => (id ? N.nombreDe(id) || 'Usuario' : '');
  const deTrab = t => ({ id: t.id, obraId: t.obra_id, nombre: str(t.nombre), puesto: str(t.puesto), cuadrilla: str(t.cuadrilla), contratistaId: t.contratista_id || '',
    contratista: str(t.contratista), activo: !!t.activo, alta: t.alta, baja: t.baja || '', motivoBaja: str(t.motivo_baja) });
  const dePase = p => ({ id: p.id, obraId: p.obra_id, fecha: String(p.fecha).slice(0, 10), estado: p.estado, motivo: str(p.motivo), limite: p.hora_limite, aTiempo: !!p.a_tiempo,
    por: quien(p.enviado_por), en: p.enviado_en, correccion: str(p.correccion_pedida), correccionPor: quien(p.correccion_pedida_por), correccionEn: p.correccion_pedida_en || '',
    corregidoPor: quien(p.corregido_por), corregidoEn: p.corregido_en || '' });

  function ok({ data, error }) { if (error) throw new Error(N.traducir(error)); return data; }
  async function cargar() {
    const s0 = R.snapshot();
    const s = s0.obras.length ? s0 : await R.cargar().catch(() => s0);
    F.obras = s.obras;
    const h = hoy();
    F.ini = [UI.desde, addDays(h, -7)].sort()[0];
    F.fin = [UI.hasta, h].sort()[1];
    const [ts, ds, ms, ps, ls, cf] = await Promise.all([
      sb().from('trabajadores').select('*').order('nombre'),
      sb().from('trabajador_datos').select('*').then(r => r, () => ({ data: [] })),
      sb().from('trabajador_movimientos').select('*').order('en', { ascending: false }).limit(800).then(r => r, () => ({ data: [] })),
      sb().from('pases_lista').select('*').gte('fecha', F.ini).lte('fecha', F.fin),
      sb().from('colado_listas').select('clave, valores').in('clave', Object.keys(LISTAS)),
      sb().from('config').select('valor').eq('clave', 'fuerza_trabajo'),
      // v0.13 partes 2 y 3 (14-fuerza-avisos.sql): avisos por obra
      sb().from('avisos').select('*').not('obra_id', 'is', null).order('en', { ascending: false }).limit(300).then(r => r, () => ({ data: [] }))
    ]).then(rs => { F.avisos = arr((rs[6] || {}).data).map(a => ({ obraId: a.obra_id, evento: a.evento, fecha: a.fecha || '', para: arr(a.para), por: quien(a.por), en: a.en })); return rs; });
    if (ts.error || ps.error) { F.listo = false; F.error = (ts.error || ps.error).message; return F; }
    F.listo = true; F.error = '';
    F.trab = ts.data.map(deTrab);
    F.datos = {}; arr(ds.data).forEach(d => { F.datos[d.trabajador_id] = { curp: str(d.curp), nss: str(d.nss), salario: d.salario == null ? null : num(d.salario) }; });
    F.movs = arr(ms.data).map(m => ({ id: m.id, trabajadorId: m.trabajador_id, obraId: m.obra_id, tipo: m.tipo, fecha: m.fecha, detalle: str(m.detalle), por: quien(m.por), en: m.en, publicado: !!m.publicado_en }));
    F.pases = ps.data.map(dePase);
    F.listas = { puestos: [], cuadrillas: [] }; arr(ls.data).forEach(l => { F.listas[l.clave] = arr(l.valores); });
    F.limite = str((arr(cf.data)[0] || {}).valor && cf.data[0].valor.hora_limite) || '09:00';
    const ids = F.pases.map(p => p.id);
    if (ids.length) {
      const [as, fs] = await Promise.all([sb().from('asistencias').select('*').in('pase_id', ids), sb().from('pase_fotos').select('*').in('pase_id', ids).then(r => r, () => ({ data: [] }))]);
      F.asis = arr(as.data).map(a => ({ paseId: a.pase_id, trabajadorId: a.trabajador_id, marca: a.marca, hora: str(a.hora), nota: str(a.nota) }));
      F.fotos = arr(fs.data).map(f => ({ id: f.id, paseId: f.pase_id, cuadrilla: str(f.cuadrilla), ruta: f.ruta, tomadaEn: f.tomada_en, subidaEn: f.subida_en,
        lat: num(f.lat), lng: num(f.lng), prec: num(f.precision_m), dist: num(f.distancia_m), fuera: f.fuera, hash: str(f.hash) }));
    } else { F.asis = []; F.fotos = []; }
    contar();
    return F;
  }
  const obra = id => F.obras.find(o => o.id === id);
  const trabDe = id => F.trab.find(t => t.id === id);
  const activosDe = obraId => F.trab.filter(t => t.obraId === obraId && t.activo).sort(porGrupo);
  const grupo = t => `${t.cuadrilla} · ${t.contratista}`;
  const porGrupo = (a, b) => grupo(a).localeCompare(grupo(b), 'es') || a.nombre.localeCompare(b.nombre, 'es');
  const paseDe = (obraId, fecha) => F.pases.find(p => p.obraId === obraId && p.fecha === fecha);
  const marcasDe = p => F.asis.filter(a => a.paseId === p.id);
  const fotosDe = p => F.fotos.filter(f => f.paseId === p.id);
  const pendientes = obraId => F.movs.filter(m => m.obraId === obraId && !m.publicado);

  /* ---------- Permisos (la base los vuelve a revisar) ---------- */
  const rol = () => (N.perfil || {}).rol;
  const yoId = () => (N.perfil || {}).id;
  const esJefe = () => ['direccion', 'admin'].includes(rol());
  const esCoord = () => esJefe() || rol() === 'coordinador';
  const esAdmin = () => rol() === 'admin';   // borra por completo (limpiar pruebas)
  const esResDe = id => {
    if (rol() === 'consulta') return false;
    const o = obra(id); if (!o) return false;
    if (o.residenteId && o.residenteId === yoId()) return true;
    const h = hoy();
    return o.suplentes.some(s => s.perfilId === yoId() && s.desde <= h && h <= s.hasta);
  };
  const puedeEditar = id => esCoord() || esResDe(id);
  const verDatos = id => esCoord() || esResDe(id);
  const activas = () => F.obras.filter(o => o.estatus !== 'cerrada');
  const obrasVis = () => activas().filter(o => esCoord() || rol() === 'consulta' || esResDe(o.id));
  const obrasEdit = () => activas().filter(o => puedeEditar(o.id));

  /* ---------- Estado de las páginas (v0.13: tres páginas con submenú) ---------- */
  const UI = Object.assign({ obra: '', desde: addDays(lunesDe(hoy()), -21), hasta: addDays(lunesDe(hoy()), 5) },
    (() => { try { return JSON.parse(sessionStorage.getItem('galitha.ft.ui')) || {}; } catch { return {}; } })());
  const saveUI = () => { try { sessionStorage.setItem('galitha.ft.ui', JSON.stringify(UI)); } catch { /* sin acceso */ } };
  const TITULO = { 'ft-altas': 'Altas y bajas', 'ft-pase': 'Pase de lista', 'ft-registro': 'Registro de asistencia' };

  const vacia = (titulo, h2, texto) => ({ title: titulo, html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">${h2}</h2><p class="muted">${texto}</p></div></section>`, bind() { } });
  function sinTabla() { return vacia('Fuerza de trabajo', 'Falta preparar el servidor', 'Para usar la fuerza de trabajo hay que correr <span class="mono">supabase/12-fuerza-trabajo.sql</span> en Supabase.'); }

  // Revisa acceso y deja elegida una obra válida; devuelve una página de aviso si no se puede seguir
  async function preparar(ruta) {
    await cargar();
    if (!F.listo) return sinTabla();
    if (rol() === 'compras') return vacia(TITULO[ruta], 'Sin acceso', 'La fuerza de trabajo la ven Dirección, el coordinador y el residente de cada obra.');
    const obras = obrasVis();
    if (!obras.length) return vacia(TITULO[ruta], 'Sin obras asignadas', 'Cuando seas residente (o suplente) de una obra, aquí verás a tus trabajadores y pasarás lista.');
    const todasOk = ruta === 'ft-registro' && obras.length > 1;
    if (!(UI.obra === 'todas' && todasOk) && !obras.some(o => o.id === UI.obra)) UI.obra = (obras.find(o => esResDe(o.id)) || obras[0]).id;
    saveUI();
    return null;
  }
  // El isotipo de fondo de la tarjeta azul, como en Requisiciones
  const deco = () => `<div class="deco">${api.markSVG()}</div>`;
  const heroHTML = (eyebrow, titulo, sum, sqs) => `<section class="hero">
      <div class="hero-main rv" style="--d:0">${deco()}<div><p class="h-eyebrow">${eyebrow}</p><h1>${titulo}</h1></div><p class="h-sum" data-h-sum>${sum}</p></div>
      <div class="sqs-h" data-sqs>${sqs}</div></section>`;
  const sqHTML = (cls, t, n, small, d = 80) => `<div class="sq sq--${cls} rv" style="--d:${d}"><p>${t}</p><div class="sq-row"><strong>${n}</strong><small>${small}</small></div></div>`;
  const residenteDe = o => (o.residente && o.residente.nombre) || 'sin residente';
  const fFecha = s => { const d = toDate(s); return d ? `${d.getDate()} de ${MES[d.getMonth()]}` : ''; };

  // Selector de obra (solo con varias obras: Dirección, admin, coordinador o suplente de otra obra)
  function barraObras(ruta) {
    const obras = obrasVis();
    if (obras.length < 2) return '';
    const est = o => {
      if (ruta === 'ft-pase') {
        const p = paseDe(o.id, hoy());
        if (p) return p.estado === 'no_labora' ? ['gris', 'No se labora'] : [p.aTiempo ? 'ok' : 'sun', `Enviado ${horaMX(p.en)}${p.aTiempo ? ' ✓' : ' · tarde'}`];
        if (dow(hoy()) === 0) return ['gris', 'Domingo'];
        if (!activosDe(o.id).length) return ['gris', 'Sin trabajadores'];
        return minHM(horaMX()) > minHM(F.limite) ? ['bad', 'Sin pase · ya pasó la hora'] : ['sun', 'Pendiente'];
      }
      if (ruta === 'ft-altas') { const n = activosDe(o.id).length, pe = pendientes(o.id).length; return pe ? ['sun', `${n} activos · ${pe} sin publicar`] : ['gris', `${n} ${n === 1 ? 'activo' : 'activos'}`]; }
      const s = statsObra(o); return s.no ? ['bad', `${s.ok}/${s.env} a tiempo · ${s.no} sin pase`] : ['ok', `${s.ok}/${s.env} a tiempo`];
    };
    const todas = ruta === 'ft-registro' ? `<button type="button" class="fz-ob${UI.obra === 'todas' ? ' on' : ''}" data-obra-sel="todas"><b>Todas las obras</b><small>Comparar las ${obras.length}</small></button>` : '';
    return `<nav class="fz-obras rv" aria-label="Obra">${todas}${obras.map(o => { const [c, t] = est(o); return `<button type="button" class="fz-ob${UI.obra === o.id ? ' on' : ''}" data-obra-sel="${esc(o.id)}"><b>${esc(o.nombre)}</b><small><i class="e-${c}"></i>${esc(t)}</small></button>`; }).join('')}</nav>`;
  }
  function bindObras(sec) {
    $$('[data-obra-sel]', sec).forEach(b => b.addEventListener('click', () => { UI.obra = b.dataset.obraSel; saveUI(); api.rerender(); }));
  }
  // La barra lateral: "Fuerza de trabajo" se despliega y queda abierta en sus tres páginas
  function marcarGrupo() {
    const r = (location.hash.match(/^#\/([^/]+)/) || [])[1] || '';
    $$('[data-ftgrp]').forEach(g => { const den = r.startsWith('ft-'); g.classList.toggle('en', den); g.classList.toggle('open', den); });   // abierto solo en sus páginas (así cabe la barra)
    if (r !== 'ft-altas') { const x = $('#ft-pub-top'); if (x) x.remove(); }
  }
  addEventListener('hashchange', marcarGrupo);
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-ftgrp-t]'); if (!t) return;
    e.preventDefault();
    const g = t.closest('[data-ftgrp]');
    if (g.classList.contains('en')) g.classList.toggle('open'); else location.hash = t.getAttribute('href');   // fuera de sus páginas, abre Altas y bajas
  });
  setTimeout(marcarGrupo, 0);
  async function pageFuerza() {   // #/fuerza (ligas viejas): manda a la página que corresponde
    await cargar().catch(() => { });
    const r = obrasEdit().some(o => esResDe(o.id)) ? 'ft-pase' : esCoord() ? 'ft-registro' : 'ft-altas';
    setTimeout(() => { location.replace(location.pathname + location.search + '#/' + r); }, 0);
    return { title: 'Fuerza de trabajo', html: '<section class="page"></section>', bind() { } };
  }

  async function cambiarLimite() {
    const v = await api.preguntar({ titulo: 'Hora límite del pase de lista', texto: 'Una sola para todas las obras. Si a esa hora no se ha pasado lista, se avisa al coordinador y a Dirección.', etiqueta: 'Hora (24 h, por ejemplo 09:00)', valor: F.limite, ok: 'Guardar', requerido: true });
    if (v == null) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(str(v));
    if (!m || +m[1] > 23 || +m[2] > 59) { toast('Escribe la hora como 09:00.'); return; }
    try {
      const filas = ok(await sb().from('config').update({ valor: { hora_limite: `${pad(+m[1])}:${m[2]}` } }).eq('clave', 'fuerza_trabajo').select('clave'));
      if (!filas.length) throw new Error('Solo Dirección y el admin técnico cambian la hora límite.');
    } catch (e) { toast(e.message); return; }
    toast('Hora límite guardada.'); api.rerender();
  }

  /* =========================================================
     ALTAS Y BAJAS
     ========================================================= */
  const DOT = { alta: ['c2', '+'], reingreso: ['c2', '+'], baja: ['c4', '−'], transferencia_sale: ['c0', '→'], transferencia_entra: ['c0', '←'], cambio: ['c1', '✎'] };
  async function pageAltas() {
    const x0 = await preparar('ft-altas'); if (x0) return x0;
    const o = obra(UI.obra), ed = puedeEditar(o.id);
    const ts = activosDe(o.id), bajas = F.trab.filter(t => t.obraId === o.id && !t.activo).sort((a, b) => String(b.baja).localeCompare(String(a.baja)));
    const pend = pendientes(o.id), u = ultimoAviso(o.id, 'ft_cambios');
    const cuads = [...new Set(ts.map(t => t.cuadrilla))], cons = new Set(ts.map(t => t.contratista)).size;
    const mes = hoy().slice(0, 7), bajasMes = bajas.filter(t => String(t.baja).startsWith(mes)).length;
    const tipos = k => pend.filter(m => k.includes(m.tipo)).length;
    const resPend = [[tipos(['alta', 'reingreso']), 'alta', 'altas'], [tipos(['baja']), 'baja', 'bajas'], [tipos(['transferencia_sale', 'transferencia_entra']), 'transferencia', 'transferencias'], [tipos(['cambio']), 'cambio', 'cambios']]
      .filter(x => x[0]).map(([n, s, p]) => `${n} ${n === 1 ? s : p}`).join(' · ');
    const grupos = cuads.map((c, ci) => {
      const ws = ts.filter(t => t.cuadrilla === c), con = [...new Set(ws.map(t => t.contratista))].join(' · ');
      return `<div class="fz-gcard" data-cuad="${esc(c)}"><div class="fz-gh"><i class="fz-pt t-${ci % 7}"></i><div><b>${esc(c)}</b><small>${esc(con)}</small></div><span>${ws.length}</span></div>
        ${ws.map(t => { const nuevo = pend.some(m => m.trabajadorId === t.id && ['alta', 'reingreso', 'transferencia_entra'].includes(m.tipo));
          return `<button type="button" class="ft-w ft-w--btn" data-trab="${esc(t.id)}" data-txt="${esc([t.nombre, t.puesto, t.contratista, t.cuadrilla].join(' ').toLowerCase())}"><span class="ft-av">${esc(api.iniciales(t.nombre))}</span>
            <span class="ft-n"><b>${esc(t.nombre)}${nuevo ? '<em class="ft-tag">nuevo</em>' : ''}</b><span>${esc(t.puesto)} · desde el ${esc(fMes(t.alta))}</span></span>${api.ARR}</button>`; }).join('')}</div>`;
    }).join('');
    const movs = F.movs.filter(m => m.obraId === o.id).slice(0, 8);
    return {
      title: 'Altas y bajas',
      html: `<section class="page ft">
        ${barraObras('ft-altas')}
        ${heroHTML(`${esc(o.nombre)} · residente ${esc(residenteDe(o))}`, 'Altas y<br>bajas',
          `<span class="h-count"><b>${ts.length}</b> ${ts.length === 1 ? 'trabajador activo' : 'trabajadores activos'} · <b>${cuads.length}</b> ${cuads.length === 1 ? 'cuadrilla' : 'cuadrillas'} · <b>${cons}</b> ${cons === 1 ? 'contratista' : 'contratistas'}</span><span class="pill">${bajasMes ? `${bajasMes} ${bajasMes === 1 ? 'baja' : 'bajas'} este mes` : 'Sin bajas este mes'}</span>`,
          sqHTML('sun', 'Cambios sin<br>publicar', pend.length, pend.length ? `${esc(resPend)} · la oficina ya los ve; al publicar se le avisa` : 'Todo está publicado')
          + sqHTML('lav', 'Último aviso<br>a la oficina', u ? `<span class="sq-fecha">${esc(fMes(FMX.format(new Date(u.en))))}<br>${esc(horaMX(u.en))}</span>` : '—', u ? esc(paraTxt(u)) : 'Todavía no se publica nada', 140))}
        ${ed && pend.length ? `<button type="button" class="btn fz-pub fz-solo-cel" data-publicar>${ic('send')}<span>Publicar ${pend.length} ${pend.length === 1 ? 'cambio' : 'cambios'}</span></button>` : ''}
        <div class="fz-ab rv" style="--d:120">
          <div>
            ${ts.length ? `<div class="fz-bar">
              <label class="fz-buscar">${ic('search')}<input type="search" data-buscar placeholder="Buscar trabajador, puesto o contratista" aria-label="Buscar"></label>
              ${cuads.length > 1 ? `<div class="seg fz-seg" role="group" aria-label="Cuadrilla"><button type="button" data-cf="" aria-pressed="true">Todas</button>${cuads.map(c => `<button type="button" data-cf="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>` : ''}
            </div>
            <div class="fz-cols">${grupos}</div>`
            : `<div class="empty empty--sm"><p class="h3">Sin trabajadores activos</p><p class="muted small">${ed ? 'Usa <b>Dar de alta</b> para agregar a la gente de la obra.' : 'El residente da de alta a los trabajadores de su obra.'}</p></div>`}
          </div>
          <aside class="fz-side">
            <div class="fz-card"><h3>Movimientos recientes</h3>${movs.length ? `<ul class="fz-mov">${movs.map(m => { const t = trabDe(m.trabajadorId) || { nombre: 'Trabajador' }; const [c, s] = DOT[m.tipo] || ['c6', '·'];
              return `<li><span class="dot ${c}">${s}</span><div><b>${esc(MOV[m.tipo] || m.tipo)} · ${esc(t.nombre)}</b><small>${esc(m.detalle && m.tipo !== 'alta' ? m.detalle + ' · ' : '')}${esc(fMes(m.fecha))}${m.publicado ? '' : ' · sin publicar'}</small></div></li>`; }).join('')}</ul>` : '<p class="fz-help">Sin movimientos todavía.</p>'}</div>
            <div class="fz-card"><h3>Dados de baja <small>${bajas.length}</small></h3>${bajas.length ? bajas.map(t => `<button type="button" class="ft-w ft-w--btn is-off" data-trab="${esc(t.id)}"><span class="ft-av">${esc(api.iniciales(t.nombre))}</span>
              <span class="ft-n"><b>${esc(t.nombre)}</b><span>${esc(t.puesto)} · ${esc(fMes(t.baja))}${t.motivoBaja ? ' · ' + esc(t.motivoBaja) : ''}</span></span>${api.ARR}</button>`).join('') : '<p class="fz-help">Nadie dado de baja.</p>'}</div>
          </aside>
        </div>
      </section>`,
      bind(sec) {
        bindObras(sec); marcarGrupo();
        $$('[data-trab]', sec).forEach(b => b.addEventListener('click', () => drTrabajador(trabDe(b.dataset.trab))));
        // "Publicar cambios" va arriba a la derecha, junto a "Dar de alta" (en celular, debajo de los cuadros)
        const r0 = $('#ft-pub-top'); if (r0) r0.remove();
        if (ed && pend.length) {
          const b = document.createElement('button');
          b.type = 'button'; b.id = 'ft-pub-top'; b.className = 'btn fz-pub';
          b.innerHTML = `${ic('send')}<span>Publicar cambios</span><b>${pend.length}</b>`;
          const r = $('.deskbar-r'); if (r) r.insertBefore(b, r.firstChild);
          b.addEventListener('click', () => publicar(o, b));
        }
        $$('[data-publicar]', sec).forEach(b => b.addEventListener('click', () => publicar(o, b)));
        let cf = '';
        const filtra = () => {
          const q = norm(($('[data-buscar]', sec) || {}).value || '');
          $$('.fz-gcard', sec).forEach(g => {
            let n = 0;
            $$('[data-trab]', g).forEach(t => { const v = (!q || norm(t.dataset.txt).includes(q)); t.hidden = !v; if (v) n++; });
            g.hidden = (cf && g.dataset.cuad !== cf) || !n;
          });
        };
        const bq = $('[data-buscar]', sec); if (bq) bq.addEventListener('input', filtra);
        $$('[data-cf]', sec).forEach(b => b.addEventListener('click', () => { cf = b.dataset.cf; $$('[data-cf]', sec).forEach(x => x.setAttribute('aria-pressed', x === b)); filtra(); }));
      }
    };
  }
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  async function publicar(o, bp) {
    bp.disabled = true;
    let r;
    try { r = ok(await sb().rpc('publicar_movimientos', { p_obra: o.id })); } catch (e) { bp.disabled = false; toast(e.message); return; }
    if (!r || !r.total) { toast('No había cambios por publicar.'); api.rerender(); return; }
    toast(`${r.total} ${r.total === 1 ? 'cambio publicado' : 'cambios publicados'}. Avisando a Dirección y al coordinador…`);
    await avisarCambios(o.id);
    api.rerender();
  }

  /* =========================================================
     PASE DE LISTA
     ========================================================= */
  let PL = null;   // { obraId, fecha, marcas: {id: {m, hora, nota}}, fotos: [] }
  const KEYB = (o, f) => `galitha.ft.pl.${o}.${f}`;
  const leerBorrador = (o, f) => { try { return JSON.parse(localStorage.getItem(KEYB(o, f))) || {}; } catch { return {}; } };
  const guardarBorrador = () => { try { localStorage.setItem(KEYB(PL.obraId, PL.fecha), JSON.stringify(PL.marcas)); } catch { /* sin acceso */ } };
  const borrarBorrador = (o, f) => { try { localStorage.removeItem(KEYB(o, f)); } catch { /* sin acceso */ } };
  function plDe(obraId) {
    const f = hoy();
    if (!PL || PL.obraId !== obraId || PL.fecha !== f) {
      if (PL) PL.fotos.forEach(x => URL.revokeObjectURL(x.url));
      PL = { obraId, fecha: f, marcas: leerBorrador(obraId, f), fotos: [] };
    }
    const ids = new Set(activosDe(obraId).map(t => t.id));
    Object.keys(PL.marcas).forEach(k => { if (!ids.has(k)) delete PL.marcas[k]; });
    return PL;
  }
  const VIGENCIA = 18 * 60e3;   // la base acepta fotos tomadas hace 20 min o menos
  const vencida = x => !x.ruta && Date.now() - new Date(x.tomadaEn).getTime() > VIGENCIA;
  const distTxt = (d, o) => (d == null ? (o && o.lat != null ? 'sin distancia' : 'obra sin ubicación') : d > ((o && o.radioM) || 150) ? `<span class="ft-bad">fuera de la obra (${Math.round(d)} m)</span>` : `dentro de la obra (${Math.round(d)} m)`);
  const pillLimite = () => { const a = minHM(horaMX()), l = minHM(F.limite);
    return a <= l ? `<span class="pill fz-pill-sun">${ic('clock')} Límite ${esc(F.limite)} · faltan ${l - a} min</span>` : `<span class="pill fz-pill-bad">${ic('clock')} Ya pasó la hora límite (${esc(F.limite)})</span>`; };
  // Una tarjeta de trabajador del pase (botones ✓ ✗ ···); de solo lectura si ya se envió
  const filaPase = (t, x, lect) => {
    const otra = x.m && OTRAS.includes(x.m);
    return `<div class="ft-w${lect ? ' fz-lect' : ''}" data-tid="${esc(t.id)}"><span class="ft-av">${esc(api.iniciales(t.nombre))}</span>
      <div class="ft-n"><b>${esc(t.nombre)}</b><span>${esc(t.puesto)}${otra ? ` <em class="ft-tag">${esc(MARCAS[x.m].l)}${x.m === 'R' && x.hora ? ' ' + esc(x.hora) : ''}</em>` : ''}${x.nota ? ` · ${esc(x.nota)}` : ''}</span></div>
      <div class="ft-mk"><button type="button" data-m="A" class="a${x.m === 'A' ? ' on' : ''}" aria-label="Asistencia" aria-pressed="${x.m === 'A'}"${lect ? ' tabindex="-1"' : ''}>✓</button><button type="button" data-m="F" class="f${x.m === 'F' ? ' on' : ''}" aria-label="Falta" aria-pressed="${x.m === 'F'}"${lect ? ' tabindex="-1"' : ''}>✗</button><button type="button" data-m="O" class="o${otra ? ' on' : ''}" aria-label="Otras opciones"${lect ? ' tabindex="-1"' : ''}>${otra ? esc(x.m) : '···'}</button></div></div>`;
  };
  const gruposPase = (ts, marca, lect) => {
    const cs = [...new Set(ts.map(t => t.cuadrilla))];
    return cs.map((c, ci) => { const ws = ts.filter(t => t.cuadrilla === c), con = [...new Set(ws.map(t => t.contratista))].join(' · ');
      return `<div class="fz-g"><div class="ft-grp"><span><i class="fz-pt t-${ci % 7}"></i>${esc(c)} · ${esc(con)}</span><span>${ws.filter(t => (marca(t) || {}).m).length} de ${ws.length}</span></div>${ws.map(t => filaPase(t, marca(t) || {}, lect)).join('')}</div>`; }).join('');
  };

  async function pagePase() {
    const x0 = await preparar('ft-pase'); if (x0) return x0;
    const o = obra(UI.obra), f = hoy(), p = paseDe(o.id, f), ts = activosDe(o.id), total = ts.length;
    const eyebrow = `${esc(o.nombre)} · residente ${esc(residenteDe(o))} · ${esc(fDia(f))}`;
    const jefeLim = esJefe() ? `<button type="button" class="tbtn tbtn--sm" data-limite>${ic('clock')}<span>Hora límite ${esc(F.limite)}</span></button>` : '';
    const pagina = (html, bind) => ({ title: 'Pase de lista', html: `<section class="page ft">${barraObras('ft-pase')}${html}</section>`, bind(sec) { bindObras(sec); marcarGrupo(); const bl = $('[data-limite]', sec); if (bl) bl.addEventListener('click', cambiarLimite); if (bind) bind(sec); } });

    // Hoy no se labora
    if (p && p.estado === 'no_labora') return pagina(heroHTML(eyebrow, 'Hoy no se<br>labora', `<span class="h-count">Registrado por <b>${esc(p.por)}</b> a las ${esc(horaMX(p.en))}</span><span class="pill">Cuenta como el pase de lista de hoy</span>`,
      sqHTML('lav', 'Motivo', `<span class="sq-txt">${esc(p.motivo.split(':')[0])}</span>`, esc(p.motivo.split(':').slice(1).join(':').trim() || 'Sin detalle'))
      + sqHTML('sun', 'Trabajadores<br>en la obra', total, 'no se les marca falta este día', 140))
      + `<div class="note note--info rv">${ic('cal')}<p>Este día aparece en gris en el Registro y no genera aviso de "pase no enviado".${esJefe() ? ' Si fue un error, bórralo desde el Registro (detalle del día) para que se pueda pasar lista.' : ''}</p></div>`);

    // Ya enviado: solo lectura
    if (p) {
      const ms = marcasDe(p), fs = fotosDe(p), asist = ms.filter(a => cuentaAsist(a.marca)).length, faltas = ms.filter(a => a.marca === 'F').length;
      const otras = ms.filter(a => OTRAS.includes(a.marca)).length, fuera = fs.filter(x => x.fuera).length;
      const tsP = ms.map(a => trabDe(a.trabajadorId)).filter(Boolean).sort(porGrupo);
      const marca = t => { const a = ms.find(y => y.trabajadorId === t.id); return a ? { m: a.marca, hora: a.hora, nota: a.nota } : {}; };
      return pagina(heroHTML(eyebrow, 'Pase de<br>lista', `<span class="h-count"><b>${ms.length}</b> de <b>${ms.length}</b> marcados · <b>${fs.length}</b> ${fs.length === 1 ? 'foto' : 'fotos'}</span><span class="pill ${p.aTiempo ? '' : 'fz-pill-sun'}">${ic('clock')} Enviado ${esc(horaMX(p.en))} · ${p.aTiempo ? 'a tiempo' : 'fuera de hora'}</span>`,
        sqHTML('ok', 'Asistencia<br>de hoy', `${asist}<span class="sq-de">/${ms.length}</span>`, `${faltas} ${faltas === 1 ? 'falta' : 'faltas'}${otras ? ` · ${otras} con otra marca` : ''}`)
        + sqHTML('lav', 'Pase de lista<br>enviado', `<span class="sq-txt">${esc(horaMX(p.en))}</span>`, 'Hora del servidor · ya no se modifica', 140))
        + `<div class="fz-pl rv" style="--d:120"><div>
            <div class="fz-sec" style="margin-top:0"><span class="num">1</span><h2>Asistencia enviada</h2><div class="r">
              ${esCoord() ? `<button type="button" class="tbtn tbtn--sm" data-dia="${esc(p.id)}">${ic('edit')}<span>Ver detalle y corregir</span></button>` : puedeEditar(o.id) ? `<button type="button" class="tbtn tbtn--sm" data-pedir="${esc(p.id)}">${ic('undo')}<span>Pedir corrección</span></button>` : ''}${jefeLim}</div></div>
            ${p.correccion ? `<div class="note">${ic('undo')}<p><b>Corrección pedida</b> por ${esc(p.correccionPor)}: ${esc(p.correccion)}</p></div>` : ''}
            ${p.corregidoEn ? `<p class="fz-help">Corregido por ${esc(p.corregidoPor)} el ${esc(fMes(FMX.format(new Date(p.corregidoEn))))} a las ${esc(horaMX(p.corregidoEn))}.</p>` : ''}
            <div class="fz-cols">${gruposPase(tsP, marca, true)}</div></div>
          <aside class="fz-side">
            <div class="fz-card"><div class="fz-sec" style="margin:0 0 12px"><span class="num">2</span><h2>Fotos por cuadrilla</h2></div>
              ${rol() === 'consulta' ? '<p class="fz-help">Las fotos las ven el residente, el coordinador y Dirección.</p>' : `<div class="fz-frs">${fs.map(x => `<button type="button" class="fz-fr" data-ver="${esc(x.ruta)}"><img class="fz-th" data-ruta="${esc(x.ruta)}" alt=""><div><b>${esc(x.cuadrilla)}</b><small>${esc(horaMX(x.tomadaEn))} · ${distTxt(x.dist, o)}</small></div></button>`).join('')}</div>`}
              ${fuera ? `<p class="fz-help" style="margin:10px 0 0"><span class="ft-bad">${fuera} ${fuera === 1 ? 'foto quedó' : 'fotos quedaron'} fuera de la obra.</span></p>` : ''}</div>
            <div class="fz-card fz-envio fz-envio--ok"><b>✓ Enviado a las ${esc(horaMX(p.en))}</b><small>${p.aTiempo ? 'A tiempo' : 'Fuera de hora'} · pasó lista ${esc(p.por)}. ${esCoord() ? 'Si algo está mal, corrígelo en el detalle.' : 'Si algo está mal, pide la corrección.'}</small></div>
          </aside></div>`,
        sec => bindResumen(sec, o));
    }

    if (dow(f) === 0) return pagina(heroHTML(eyebrow, 'Hoy es<br>domingo', '<span class="h-count">Los domingos no se pasa lista</span>', sqHTML('ok', 'Trabajadores<br>activos', total, 'en la obra') + sqHTML('lav', 'Hora límite', `<span class="sq-txt">${esc(F.limite)}</span>`, 'de lunes a sábado', 140)));

    // Quien no puede pasar lista (cuenta de consulta)
    if (!puedeEditar(o.id)) return pagina(heroHTML(eyebrow, 'Pase de<br>lista', `<span class="h-count">Todavía no se pasa lista hoy</span>${pillLimite()}`,
      sqHTML('ok', 'Trabajadores<br>activos', total, 'en la obra') + sqHTML('sun', 'Hora límite', `<span class="sq-txt">${esc(F.limite)}</span>`, 'el residente pasa lista cada mañana', 140)));

    if (!total) return pagina(heroHTML(eyebrow, 'Pase de<br>lista', `<span class="h-count">Todavía no hay trabajadores</span>${pillLimite()}`,
      sqHTML('ok', 'Trabajadores<br>activos', 0, 'da de alta a la gente en Altas y bajas') + sqHTML('sun', 'Hora límite', `<span class="sq-txt">${esc(F.limite)}</span>`, 'de lunes a sábado', 140))
      + `<div class="empty empty--sm"><a class="btn btn--solid" href="#/ft-altas">${ic('plus')}<span>Ir a Altas y bajas</span></a><p class="muted small" style="margin-top:14px"><button type="button" class="link-u" data-nolabora>Hoy no se labora</button></p></div>`,
      sec => { $$('[data-nolabora]', sec).forEach(b => b.addEventListener('click', () => noLabora(o))); });

    // En curso
    plDe(o.id);
    return pagina(heroHTML(eyebrow, 'Pase de<br>lista', '', '')
      + (esCoord() && !esResDe(o.id) ? `<div class="note note--info rv">${ic('alert')}<p>Normalmente pasa lista el residente. Si lo haces tú, las fotos saldrán con tu ubicación real.</p></div>` : '')
      + `<div class="fz-pl rv" style="--d:120"><div>
          <div class="fz-sec" style="margin-top:0"><span class="num">1</span><h2>Marca la asistencia</h2><div class="r" data-pl-acc></div></div>
          <div class="fz-cols" data-pl-lista></div></div>
        <aside class="fz-side" data-pl-side></aside></div>`,
      sec => bindPase(sec, o, jefeLim));
  }

  function pintarPase(sec, o, jefeLim) {
    const pl = plDe(o.id), ts = activosDe(o.id), total = ts.length;
    const m = t => pl.marcas[t.id] || {};
    const sin = ts.filter(t => !m(t).m).length, asist = ts.filter(t => m(t).m && cuentaAsist(m(t).m)).length, faltas = ts.filter(t => m(t).m === 'F').length;
    const ret = ts.filter(t => m(t).m === 'R').length;
    const cuads = [...new Set(ts.filter(t => m(t).m !== 'F').map(t => t.cuadrilla))];
    const faltanC = cuads.filter(c => !pl.fotos.some(x => x.cuadrilla === c)), venc = pl.fotos.filter(vencida).length;
    $('[data-h-sum]', sec).innerHTML = `<span class="h-count"><b>${total - sin}</b> de <b>${total}</b> marcados · <b>${cuads.length - faltanC.length}</b> de <b>${cuads.length}</b> fotos</span>${pillLimite()}`;
    $('[data-sqs]', sec).innerHTML = sqHTML('ok', 'Asistencia<br>de hoy', `${asist}<span class="sq-de">/${total}</span>`, `${faltas} ${faltas === 1 ? 'falta' : 'faltas'}${ret ? ` · ${ret} ${ret === 1 ? 'retardo' : 'retardos'}` : ''}`, 0)
      + sqHTML('sun', 'Falta por<br>completar', sin || faltanC.length || '✓', sin ? `${sin === 1 ? 'trabajador' : 'trabajadores'} sin marcar${faltanC.length ? ` y ${faltanC.length} ${faltanC.length === 1 ? 'foto' : 'fotos'}` : ''}` : faltanC.length ? `${faltanC.length === 1 ? 'foto de cuadrilla' : 'fotos de cuadrilla'} por tomar` : 'Listo para enviar', 0);
    $$('.sq', sec).forEach(e => e.classList.add('is-in'));
    $('[data-pl-acc]', sec).innerHTML = `${sin ? `<button type="button" class="tbtn tbtn--sm" data-todos>Marcar asistencia a los ${sin} que faltan</button>` : ''}<button type="button" class="tbtn tbtn--sm" data-nolabora>Hoy no se labora</button>${jefeLim}`;
    $('[data-pl-lista]', sec).innerHTML = gruposPase(ts, m, false);
    const radio = o.radioM || 150;
    $('[data-pl-side]', sec).innerHTML = `<div class="fz-card">
        <div class="fz-sec" style="margin:0 0 12px"><span class="num">2</span><h2>Fotos por cuadrilla</h2></div>
        <p class="fz-help">Con la cámara de la app. Cada foto queda con fecha, hora y ubicación.</p>
        <div class="fz-frs">${pl.fotos.map((x, i) => `<div class="fz-fr${x.dist != null && x.dist > radio ? ' is-bad' : ''}${vencida(x) ? ' is-old' : ''}"><img class="fz-th" src="${x.url}" alt=""><div><b>${esc(x.cuadrilla)}</b><small>${esc(horaMX(x.tomadaEn))} · ${distTxt(x.dist, o)}</small>${vencida(x) ? '<small class="ft-bad">Tiene más de 18 min: vuelve a tomarla</small>' : ''}</div><button type="button" class="ibtn" data-quitar="${i}" aria-label="Quitar foto">${ic('trash')}</button></div>`).join('')}
          ${faltanC.map(c => `<button type="button" class="fz-fr fz-fr--falta" data-camara="${esc(c)}"><span class="fz-th">${ic('camara')}</span><div><b>${esc(c)}</b><small>Tomar foto</small></div></button>`).join('')}
          ${!faltanC.length ? `<button type="button" class="tbtn tbtn--sm" data-camara="">${ic('camara')}<span>Tomar otra foto</span></button>` : ''}</div>
      </div>
      <div class="fz-card fz-envio">
        <div class="fz-prog"><span>Marcados</span><b>${total - sin}/${total}</b><i><em style="width:${total ? (total - sin) / total * 100 : 0}%"></em></i></div>
        <div class="fz-prog"><span>Fotos</span><b>${cuads.length - faltanC.length}/${cuads.length}</b><i><em style="width:${cuads.length ? (cuads.length - faltanC.length) / cuads.length * 100 : 0}%"></em></i></div>
        <button type="button" class="btn btn--solid" data-enviar${sin || !pl.fotos.length || venc ? ' disabled' : ''}>${ic('send')}<span>${sin ? `Faltan ${sin} por marcar` : !pl.fotos.length ? 'Falta al menos una foto' : venc ? 'Repite las fotos vencidas' : 'Enviar pase de lista'}</span></button>
        <small>${!sin && pl.fotos.length && faltanC.length ? `Sin foto: ${esc(faltanC.join(', '))}. ` : ''}Ya enviado no se puede cambiar; cuenta la hora del servidor.</small>
      </div>`;
  }

  function bindPase(sec, o, jefeLim) {
    const pinta = () => pintarPase(sec, o, jefeLim);
    pinta();
    sec.addEventListener('click', async e => {
      const pl = PL;
      const b = e.target.closest('button'); if (!b || !pl) return;
      if (b.dataset.nolabora != null) { noLabora(o); return; }
      if (b.dataset.todos != null) { activosDe(o.id).forEach(t => { if (!(pl.marcas[t.id] || {}).m) pl.marcas[t.id] = { m: 'A' }; }); guardarBorrador(); pinta(); return; }
      if (b.dataset.m) {
        const t = trabDe(b.closest('[data-tid]').dataset.tid);
        if (b.dataset.m === 'O') { otraMarca(t, pinta); return; }
        const x = pl.marcas[t.id] || {};
        pl.marcas[t.id] = x.m === b.dataset.m ? {} : { m: b.dataset.m };
        guardarBorrador(); pinta(); return;
      }
      if (b.dataset.quitar != null) { const [x] = pl.fotos.splice(+b.dataset.quitar, 1); if (x) URL.revokeObjectURL(x.url); pinta(); return; }
      if (b.dataset.camara != null) { abrirCamara(o, pinta, b.dataset.camara); return; }
      if (b.dataset.enviar != null) enviarPase(o, b, pinta);
    });
  }

  function otraMarca(t, pinta) {
    const x = PL.marcas[t.id] || {};
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(t.puesto)} · ${esc(t.cuadrilla)}</p><h2 id="dr-title">${esc(t.nombre)}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${ic('close')}</button></header>
      <div class="dr-b">
        <div class="ft-opts">${OTRAS.map(k => `<label class="ft-opt"><input type="radio" name="m" value="${k}"${x.m === k ? ' checked' : ''}><span>${esc(MARCAS[k].l)}</span></label>`).join('')}</div>
        <label class="fld" data-hora${x.m === 'R' ? '' : ' hidden'}><span class="fld-l">Hora de llegada</span><input class="in" type="time" name="hora" value="${esc(x.hora || horaMX())}"></label>
        <label class="fld"><span class="fld-l">Nota (opcional)</span><input class="in" name="nota" value="${esc(x.nota || '')}" maxlength="300" placeholder="Por ejemplo: avisó por teléfono"></label>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-quitar-m><span>Quitar marca</span></button><button type="submit" class="btn btn--solid">${ic('check')}<span>Listo</span></button></footer>
    </form>`, {}, panel => {
      const f = $('form', panel);
      f.addEventListener('change', () => { $('[data-hora]', panel).hidden = (f.querySelector('[name=m]:checked') || {}).value !== 'R'; });
      $('[data-quitar-m]', panel).addEventListener('click', () => { PL.marcas[t.id] = {}; guardarBorrador(); api.closeDrawer(true); pinta(); });
      f.addEventListener('submit', e => {
        e.preventDefault();
        const m = (f.querySelector('[name=m]:checked') || {}).value;
        if (!m) { $('[data-err]', panel).textContent = 'Elige una opción.'; return; }
        PL.marcas[t.id] = { m, hora: m === 'R' ? f.hora.value : '', nota: f.nota.value.trim() };
        guardarBorrador(); api.closeDrawer(true); pinta();
      });
    });
  }

  async function noLabora(o) {
    const opts = NO_LABORA.map(m => `<option>${esc(m)}</option>`).join('');
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(o.nombre)} · ${esc(fDia(hoy()))}</p><h2 id="dr-title">Hoy no se labora</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${ic('close')}</button></header>
      <div class="dr-b"><p class="fld-h">Cuenta como el pase de lista de hoy (así no sale el aviso de "no enviado"). Ya registrado no se puede cambiar.</p>
        <label class="fld"><span class="fld-l">Motivo</span><select class="in" name="motivo">${opts}</select></label>
        <label class="fld"><span class="fld-l">Detalle (opcional)</span><input class="in" name="det" maxlength="200" placeholder="Por ejemplo: lluvia fuerte desde las 7"></label></div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${ic('check')}<span>Registrar</span></button></footer>
    </form>`, {}, panel => {
      const f = $('form', panel);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        $('[data-ok]', panel).disabled = true;
        const motivo = [f.motivo.value, f.det.value.trim()].filter(Boolean).join(': ');
        try { ok(await sb().rpc('marcar_no_labora', { p_obra: o.id, p_motivo: motivo })); }
        catch (x) { $('[data-ok]', panel).disabled = false; $('[data-err]', panel).textContent = x.message; return; }
        borrarBorrador(o.id, hoy()); PL = null;
        api.closeDrawer(true); toast('Quedó registrado que hoy no se labora.'); api.rerender();
      });
    });
  }

  async function enviarPase(o, btn, pinta) {
    const pl = PL, ts = activosDe(o.id);
    if (ts.some(t => !(pl.marcas[t.id] || {}).m)) { pl.paso = 1; pinta(); toast('Falta marcar a algunos trabajadores.'); return; }
    const nA = ts.filter(t => cuentaAsist(pl.marcas[t.id].m)).length, nF = ts.filter(t => pl.marcas[t.id].m === 'F').length;
    const fuera = pl.fotos.filter(x => x.dist != null && x.dist > (o.radioM || 150)).length;
    if (!(await api.confirmar({ titulo: 'Enviar pase de lista', ok: 'Enviar',
      texto: `<b>${nA}</b> con asistencia, <b>${nF}</b> ${nF === 1 ? 'falta' : 'faltas'} y <b>${pl.fotos.length}</b> ${pl.fotos.length === 1 ? 'foto' : 'fotos'}.${fuera ? ` <b>${fuera} ${fuera === 1 ? 'foto quedó' : 'fotos quedaron'} fuera de la obra</b> y se marcará${fuera === 1 ? '' : 'n'} con alerta.` : ''} Ya enviado no se puede cambiar.` }))) return;
    btn.disabled = true; $('span', btn).textContent = 'Subiendo fotos…';
    try {
      const carpeta = `${o.id}/asistencia/${pl.fecha}/`;
      const fotos = [];
      for (const x of pl.fotos) {
        if (!x.ruta) {
          const ruta = carpeta + Date.now().toString(36) + '-' + x.hash.slice(0, 12) + '.jpg';
          ok(await sb().storage.from('documentos').upload(ruta, x.blob, { contentType: 'image/jpeg', upsert: false }));
          x.ruta = ruta;
        }
        fotos.push({ ruta: x.ruta, cuadrilla: x.cuadrilla, tomada_en: x.tomadaEn, lat: x.lat, lng: x.lng, precision: x.prec, hash: x.hash });
      }
      $('span', btn).textContent = 'Enviando…';
      const marcas = ts.map(t => ({ trabajador_id: t.id, marca: pl.marcas[t.id].m, hora: pl.marcas[t.id].hora || '', nota: pl.marcas[t.id].nota || '' }));
      ok(await sb().rpc('enviar_pase_lista', { p_obra: o.id, p_marcas: marcas, p_fotos: fotos }));
    } catch (e) {
      btn.disabled = false; $('span', btn).textContent = 'Enviar pase de lista';
      toast(e.message); return;
    }
    borrarBorrador(o.id, pl.fecha);
    pl.fotos.forEach(x => URL.revokeObjectURL(x.url)); PL = null;
    toast('Pase de lista enviado.');
    api.rerender();
  }

  /* ---------- Fotos de un pase ya enviado (detalle del día y pase enviado) ---------- */
  const fotosHTML = (fs, o) => `<div class="ft-fotos">${fs.map(x => `<button type="button" class="ft-ph${x.fuera ? ' is-bad' : ''}" data-ver="${esc(x.ruta)}">
      <img data-ruta="${esc(x.ruta)}" alt="Foto de ${esc(x.cuadrilla)}"><span class="ft-pi"><b>${esc(x.cuadrilla)}</b><span>Tomada ${esc(horaMX(x.tomadaEn))} · subida ${esc(horaMX(x.subidaEn))}</span><span>${distTxt(x.dist, o)}${x.prec != null ? ` · ±${Math.round(x.prec)} m` : ''}</span></span></button>`).join('')}</div>`;
  async function cargarFotos(root) {
    for (const img of $$('img[data-ruta]', root)) {
      try { img.src = await R.urlArchivo(img.dataset.ruta); } catch { img.alt = 'No se pudo cargar'; }
    }
  }
  function bindResumen(root, o) {
    cargarFotos(root);
    $$('[data-ver]', root).forEach(b => b.addEventListener('click', async () => {
      const w = window.open('', '_blank');
      try { const u = await R.urlArchivo(b.dataset.ver); if (w) w.location.href = u; else location.href = u; } catch (e) { if (w) w.close(); toast(e.message); }
    }));
    $$('[data-pedir]', root).forEach(b => b.addEventListener('click', async () => {
      const t = await api.preguntar({ titulo: 'Pedir corrección', texto: 'El coordinador la revisa y corrige; el cambio queda registrado.', etiqueta: 'Qué hay que corregir', campo: 'area', ok: 'Pedir corrección', requerido: true });
      if (t == null) return;
      try { ok(await sb().rpc('pedir_correccion_pase', { p_pase: b.dataset.pedir, p_texto: t })); } catch (e) { toast(e.message); return; }
      toast('Corrección pedida.'); api.rerender();
    }));
    $$('[data-dia]', root).forEach(b => b.addEventListener('click', () => drDia(F.pases.find(p => p.id === b.dataset.dia))));
  }

  /* ---------- Cámara de la app (sin galería), con GPS y marca de agua ---------- */
  const distancia = (o, p) => {
    if (!o || o.lat == null || o.lng == null || !p) return null;
    const r = x => x * Math.PI / 180, dLa = r(p.lat - o.lat), dLn = r(p.lng - o.lng);
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(r(o.lat)) * Math.cos(r(p.lat)) * Math.sin(dLn / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  };
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  function abrirCamara(o, alCambiar, inicial) {
    const pl = PL, ts = activosDe(o.id);
    const cuads = [...new Set([...ts.filter(t => (pl.marcas[t.id] || {}).m !== 'F').map(t => t.cuadrilla), ...F.listas.cuadrillas])];
    const sigCuad = () => cuads.find(c => !pl.fotos.some(x => x.cuadrilla === c)) || cuads[0] || '';
    const ov = document.createElement('div');
    ov.id = 'ft-cam'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Cámara');
    ov.innerHTML = `<div class="fc-top"><span><b>${esc(o.nombre)}</b><small data-n></small></span><button type="button" class="fc-x" data-x aria-label="Cerrar">${ic('close')}</button></div>
      <div class="fc-vid"><video playsinline muted autoplay></video><span class="fc-gps" data-gps>Buscando ubicación…</span><div class="fc-flash"></div></div>
      <div class="fc-bar">
        <label class="fc-sel"><span>Cuadrilla</span><select data-cua>${cuads.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <div class="fc-ctl"><button type="button" class="fc-flip" data-flip aria-label="Cambiar de cámara">↺</button><button type="button" class="fc-shot" data-shot disabled aria-label="Tomar foto"><i></i></button><button type="button" class="fc-ok" data-x>Listo</button></div>
      </div>`;
    document.body.appendChild(ov); document.body.classList.add('ft-cam-on');
    const video = $('video', ov), gps = $('[data-gps]', ov), shot = $('[data-shot]', ov), sel = $('[data-cua]', ov);
    sel.value = inicial && cuads.includes(inicial) ? inicial : sigCuad();
    let stream = null, facing = 'environment', pos = null, watch = null, camErr = '', cerrada = false;
    const cuenta = () => { $('[data-n]', ov).textContent = pl.fotos.length ? ` · ${pl.fotos.length} ${pl.fotos.length === 1 ? 'foto' : 'fotos'}` : ''; };
    const pintaGps = () => {
      const d = distancia(o, pos), fuera = d != null && d > (o.radioM || 150);
      gps.className = 'fc-gps' + (camErr || !pos ? ' is-wait' : fuera ? ' is-bad' : ' is-ok');
      gps.textContent = camErr || (!pos ? 'Buscando ubicación… (activa la ubicación del celular)'
        : `GPS ±${Math.round(pos.prec)} m · ${d == null ? 'obra sin ubicación registrada' : fuera ? `fuera de la obra (${Math.round(d)} m)` : `dentro de la obra (${Math.round(d)} m)`}`);
      shot.disabled = !!camErr || !pos || !stream || !sel.value;
    };
    async function iniciar() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Este navegador no deja usar la cámara.');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cerrada) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream; await video.play().catch(() => { });
        camErr = '';
      } catch (e) {
        stream = null;
        camErr = e && e.name === 'NotAllowedError' ? 'Sin permiso para la cámara: permítela en el navegador (en iPhone: Ajustes → Safari → Cámara).' : 'No se pudo abrir la cámara. ' + ((e && e.message) || '');
      }
      pintaGps();
    }
    if (navigator.geolocation) {
      watch = navigator.geolocation.watchPosition(p => { pos = { lat: p.coords.latitude, lng: p.coords.longitude, prec: p.coords.accuracy || 0, t: Date.now() }; pintaGps(); },
        e => { pos = null; if (e.code === 1) camErr = 'Sin permiso para la ubicación: permítela en el navegador (en iPhone: Ajustes → Privacidad → Localización → Safari).'; pintaGps(); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    } else camErr = 'Este navegador no da la ubicación.';
    iniciar(); cuenta(); pintaGps();
    const cerrar = () => {
      cerrada = true;
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (watch != null) navigator.geolocation.clearWatch(watch);
      ov.remove(); document.body.classList.remove('ft-cam-on'); document.removeEventListener('keydown', esc_);
      alCambiar();
    };
    const esc_ = e => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', esc_);
    $$('[data-x]', ov).forEach(b => b.addEventListener('click', cerrar));
    $('[data-flip]', ov).addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; iniciar(); });
    sel.addEventListener('change', pintaGps);
    shot.addEventListener('click', async () => {
      if (shot.disabled) return;
      if (Date.now() - pos.t > 60e3) { toast('La ubicación es de hace más de un minuto; espera a que se actualice.'); return; }
      shot.disabled = true;
      try {
        const x = await capturar(video, o, sel.value, pos);
        pl.fotos.push(x);
        ov.classList.remove('flash'); void ov.offsetWidth; ov.classList.add('flash');
        toast(`Foto de ${x.cuadrilla} lista.`);
        sel.value = sigCuad(); cuenta();
      } catch (e) { toast(e.message); }
      pintaGps();
    });
  }

  async function capturar(video, o, cuadrilla, pos) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) throw new Error('La cámara todavía no está lista.');
    const k = Math.min(1, 1600 / Math.max(vw, vh)), W = Math.round(vw * k), H = Math.round(vh * k);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.drawImage(video, 0, 0, W, H);
    const t = new Date(), d = distancia(o, pos);
    const lineas = [
      `${o.nombre} · ${cuadrilla}`,
      `${fDia(FMX.format(t))} de ${FMX.format(t).slice(0, 4)} · ${HSMX.format(t)}`,
      `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} (±${Math.round(pos.prec)} m)${d == null ? '' : ` · ${Math.round(d)} m de la obra${d > (o.radioM || 150) ? ' (FUERA)' : ''}`}`,
      `${(N.perfil || {}).nombre || ''} · Galitha`
    ];
    const fs = Math.max(13, Math.round(Math.min(W, H) * 0.034)), lh = Math.round(fs * 1.38), m = Math.round(fs * 0.8), bh = lineas.length * lh + m * 1.3;
    g.fillStyle = 'rgba(11, 28, 74, .74)'; g.fillRect(0, H - bh, W, bh);
    g.fillStyle = '#fff'; g.textBaseline = 'top';
    lineas.forEach((l, i) => { g.font = `${i === 0 ? 700 : 500} ${fs}px "Plus Jakarta Sans", system-ui, sans-serif`; g.fillText(l, m, H - bh + m * 0.65 + i * lh, W - m * 2); });
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('No se pudo guardar la foto.');
    const hash = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    return { blob, url: URL.createObjectURL(blob), cuadrilla, tomadaEn: t.toISOString(), lat: pos.lat, lng: pos.lng, prec: Math.round(pos.prec), dist: d, hash };
  }

  // Contratistas: primero los del directorio que parecen de mano de obra
  const esContratista = p => /contrat|mano de obra|subcontrat|destajo/i.test([p.tipo, ...arr(p.categorias), ...arr(p.etiquetas)].join(' '));
  async function agregarOpcion(clave, valor) {
    const v = str(valor); if (!v) return;
    const [l] = ok(await sb().from('colado_listas').select('valores').eq('clave', clave));
    const vals = arr(l && l.valores);
    if (vals.some(x => x.toLowerCase() === v.toLowerCase())) return;
    const filas = ok(await sb().from('colado_listas').update({ valores: [...vals, v] }).eq('clave', clave).select('clave'));
    if (!filas.length) throw new Error('No se pudo agregar la opción.');
    F.listas[clave] = [...vals, v];
  }

  function drTrabajador(t0) {
    const t = t0 ? trabDe(t0.id) : null;
    const editables = obrasEdit();
    const obraId = t ? t.obraId : (editables.some(o => o.id === UI.obra) ? UI.obra : (editables[0] || {}).id);
    if (!obraId) { toast('No tienes obras donde dar de alta trabajadores.'); return; }
    const ed = puedeEditar(obraId), vd = verDatos(obraId), d = (t && F.datos[t.id]) || { curp: '', nss: '', salario: null };
    const dis = ed && (!t || t.activo) ? '' : ' disabled';
    const provs = api.proveedores().filter(p => p.estatus !== 'no_recomendado').sort((a, b) => (esContratista(b) - esContratista(a)) || api.nombreProveedor(a).localeCompare(api.nombreProveedor(b), 'es'));
    const enDir = !t || !!t.contratistaId || !t.contratista;
    const sel = (clave, val) => {
      const ops = [...new Set([...F.listas[clave], ...(val ? [val] : [])])];
      return `<select class="in" name="${clave}" data-lista="${clave}"${dis}><option value="">Elige…</option>${ops.map(x => `<option${x === val ? ' selected' : ''}>${esc(x)}</option>`).join('')}${dis ? '' : '<option value="__nueva">＋ Agregar opción…</option>'}</select>`;
    };
    const hist = t ? F.movs.filter(m => m.trabajadorId === t.id) : [];
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">Fuerza de trabajo · ${esc((obra(obraId) || {}).nombre || '')}</p><h2 id="dr-title">${t ? esc(t.nombre) : 'Alta de trabajador'}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${ic('close')}</button></header>
      <div class="dr-b">
        ${t && !t.activo ? `<div class="note">${ic('alert')}<p><b>Dado de baja</b> el ${esc(fMes(t.baja))}${t.motivoBaja ? ': ' + esc(t.motivoBaja) : ''}.</p></div>` : ''}
        <fieldset class="fs"><legend><span class="mono">1</span>Trabajador</legend><div class="fs-b"><div class="grid2">
          ${!t && editables.length > 1 ? `<label class="fld fld--wide"><span class="fld-l">Obra</span><select class="in" name="obra">${editables.map(o => `<option value="${esc(o.id)}"${o.id === obraId ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>` : ''}
          <label class="fld fld--wide"><span class="fld-l">Nombre completo <em>*</em></span><input class="in" name="nombre" value="${esc(t ? t.nombre : '')}" autocomplete="off" placeholder="Nombre(s) y apellidos"${dis}></label>
          <label class="fld"><span class="fld-l">Puesto <em>*</em></span>${sel('puestos', t ? t.puesto : '')}</label>
          <label class="fld"><span class="fld-l">Cuadrilla <em>*</em></span>${sel('cuadrillas', t ? t.cuadrilla : '')}</label>
          <label class="fld fld--wide"><span class="fld-l">Contratista <em>*</em></span><select class="in" name="prov"${dis}><option value="">Elige…</option>
            ${provs.map(p => `<option value="${esc(p.id)}"${t && t.contratistaId === p.id ? ' selected' : ''}>${esc(api.nombreProveedor(p))}</option>`).join('')}
            <option value="__otro"${!enDir ? ' selected' : ''}>Otro (no está en el directorio)…</option></select></label>
          <label class="fld fld--wide" data-otro${enDir ? ' hidden' : ''}><span class="fld-l">Nombre del contratista</span><input class="in" name="contratista" value="${esc(t && !t.contratistaId ? t.contratista : '')}"${dis}><span class="fld-h">Si trabaja seguido con Galitha, pide a compras que lo dé de alta en el directorio.</span></label>
        </div></div></fieldset>
        ${vd ? `<fieldset class="fs"><legend><span class="mono">2</span>Datos para el IMSS</legend><div class="fs-b"><div class="grid2">
          <label class="fld"><span class="fld-l">Salario semanal</span><input class="in" name="salario" type="number" min="0" step="0.01" inputmode="decimal" value="${d.salario == null ? '' : esc(d.salario)}"${dis}></label>
          <label class="fld"><span class="fld-l">NSS</span><input class="in" name="nss" inputmode="numeric" maxlength="14" value="${esc(d.nss)}" placeholder="11 dígitos"${dis}></label>
          <label class="fld fld--wide"><span class="fld-l">CURP</span><input class="in" name="curp" maxlength="18" value="${esc(d.curp)}" style="text-transform:uppercase" placeholder="18 caracteres"${dis}><span class="fld-h">Se revisan al guardar: el formato y que no esté activo en otra obra.</span></label>
        </div></div></fieldset>` : ''}
        ${t && ed ? `<fieldset class="fs"><legend><span class="mono">${vd ? 3 : 2}</span>Movimientos</legend><div class="fs-b"><div class="ft-accs">
          ${t.activo ? `<button type="button" class="btn btn--sm" data-transferir>${ic('building')}<span>Transferir a otra obra</span></button><button type="button" class="btn btn--sm btn--danger" data-baja>${ic('x')}<span>Dar de baja</span></button>`
            : `<button type="button" class="btn btn--sm" data-reingreso>${ic('undo')}<span>Reingresar a esta obra</span></button>`}</div></div></fieldset>` : ''}
        ${t && esAdmin() ? `<fieldset class="fs"><legend>Solo admin técnico</legend><div class="fs-b">
          <p class="fld-h">Para limpiar pruebas: borra al trabajador por completo (sus datos, movimientos y marcas de asistencia). No se puede deshacer. Para un trabajador real usa "Dar de baja".</p>
          <button type="button" class="btn btn--sm btn--danger" data-borrar-trab>${ic('trash')}<span>Borrar definitivamente</span></button></div></fieldset>` : ''}
        ${hist.length ? `<fieldset class="fs"><legend>Historial</legend><div class="fs-b"><ul class="ft-hist">${hist.map(m => `<li><b>${esc(MOV[m.tipo] || m.tipo)}</b> · ${esc(fMes(m.fecha))}${m.detalle ? ` · ${esc(m.detalle)}` : ''}<small>${esc(m.por)}${m.publicado ? '' : ' · sin publicar'}</small></li>`).join('')}</ul></div></fieldset>` : ''}
      </div>
      ${dis ? '<footer class="dr-f"><button type="button" class="btn" data-close><span>Cerrar</span></button></footer>'
        : `<footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${ic('check')}<span>${t ? 'Guardar' : 'Guardar alta'}</span></button></footer>`}
    </form>`, {}, panel => {
      const f = $('form', panel), err = () => $('[data-err]', panel);
      f.addEventListener('input', api.markDirty);
      f.prov && f.prov.addEventListener('change', () => { $('[data-otro]', panel).hidden = f.prov.value !== '__otro'; });
      panel.addEventListener('change', async e => {
        const s = e.target.closest('select[data-lista]'); if (!s || s.value !== '__nueva') return;
        const val = await api.preguntar({ titulo: 'Agregar opción', texto: `Lista: <b>${esc(LISTAS[s.dataset.lista])}</b>. Quedará disponible para todos.`, etiqueta: 'Nueva opción', ok: 'Agregar', requerido: true });
        if (!val) { s.value = ''; return; }
        try { await agregarOpcion(s.dataset.lista, val); } catch (x) { toast(x.message); s.value = ''; return; }
        const o2 = document.createElement('option'); o2.textContent = str(val); s.insertBefore(o2, s.lastElementChild); s.value = str(val);
      });
      const tras = async (fn, msg) => { try { await fn(); } catch (x) { toast(x.message); return; } api.closeDrawer(true); toast(msg); api.rerender(); };
      const bt = $('[data-transferir]', panel);
      if (bt) bt.addEventListener('click', async () => {
        const destinos = activas().filter(o => o.id !== t.obraId);
        if (!destinos.length) { toast('No hay otra obra activa.'); return; }
        const v = await elegirObra(destinos, t);
        if (!v) return;
        tras(async () => ok(await sb().rpc('transferir_trabajador', { p_trab: t.id, p_obra: v })), `${t.nombre} se transfirió a ${(obra(v) || {}).nombre || 'la otra obra'}.`);
      });
      const bb = $('[data-baja]', panel);
      if (bb) bb.addEventListener('click', async () => {
        const m = await api.preguntar({ titulo: 'Dar de baja', texto: `${esc(t.nombre)} deja de aparecer en el pase de lista. Su asistencia anterior se conserva.`, etiqueta: 'Motivo de la baja', ok: 'Dar de baja', requerido: true, peligro: true });
        if (m == null) return;
        tras(async () => { const fl = ok(await sb().from('trabajadores').update({ activo: false, motivo_baja: str(m) }).eq('id', t.id).select('id')); if (!fl.length) throw new Error('No tienes permiso para dar de baja a este trabajador.'); }, 'Baja registrada.');
      });
      const bd = $('[data-borrar-trab]', panel);
      if (bd) bd.addEventListener('click', async () => {
        const v = await api.preguntar({ titulo: 'Borrar definitivamente', texto: `Se borra a <b>${esc(t.nombre)}</b> con sus datos, movimientos y marcas de asistencia. No se puede deshacer. Escribe su nombre completo para confirmar.`, etiqueta: 'Nombre completo', ok: 'Borrar', requerido: true, peligro: true });
        if (v == null) return;
        if (str(v).replace(/\s+/g, ' ').toLowerCase() !== t.nombre.toLowerCase()) { toast('El nombre no coincide; no se borró nada.'); return; }
        tras(async () => {
          const r = await sb().rpc('borrar_trabajador', { p_trab: t.id });
          if (r.error && /borrar_trabajador|schema cache|does not exist/i.test(r.error.message || '')) throw new Error('Falta correr supabase/13-fuerza-borrar.sql en Supabase.');
          ok(r);
        }, `${t.nombre} se borró por completo.`);
      });
      const br = $('[data-reingreso]', panel);
      if (br) br.addEventListener('click', async () => {
        if (!(await api.confirmar({ titulo: 'Reingresar', texto: `${esc(t.nombre)} vuelve a la lista de ${esc((obra(t.obraId) || {}).nombre || '')} desde hoy.`, ok: 'Reingresar' }))) return;
        tras(async () => { const fl = ok(await sb().from('trabajadores').update({ activo: true }).eq('id', t.id).select('id')); if (!fl.length) throw new Error('No tienes permiso.'); }, 'Trabajador reingresado.');
      });
      f.addEventListener('submit', async e => {
        e.preventDefault();
        if (dis) return;
        const sinN = v => (v === '__nueva' ? '' : v);
        const nombre = f.nombre.value.trim().replace(/\s+/g, ' '), puesto = sinN(f.puestos.value), cuadrilla = sinN(f.cuadrillas.value);
        const provId = f.prov.value && f.prov.value !== '__otro' ? f.prov.value : null, contratista = provId ? '' : f.contratista.value.trim();
        const falta = !nombre || nombre.split(' ').length < 2 ? 'Escribe el nombre completo (nombre y apellidos).' : !puesto ? 'Elige el puesto.' : !cuadrilla ? 'Elige la cuadrilla.' : !provId && !contratista ? 'Elige el contratista.' : '';
        if (falta) { err().textContent = falta; return; }
        const curp = vd ? f.curp.value.trim().toUpperCase() : '', nss = vd ? f.nss.value.replace(/\D/g, '') : '';
        if (curp && !/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/.test(curp)) { err().textContent = 'La CURP no tiene un formato válido (18 caracteres).'; return; }
        if (nss && nss.length !== 11) { err().textContent = 'El NSS debe tener 11 dígitos.'; return; }
        const destino = t ? t.obraId : (f.obra ? f.obra.value : obraId);
        if (!t && F.trab.some(x => x.activo && x.obraId === destino && x.nombre.toLowerCase() === nombre.toLowerCase())
          && !(await api.confirmar({ titulo: 'Nombre repetido', texto: `Ya hay un trabajador activo llamado <b>${esc(nombre)}</b> en esta obra. ¿Darlo de alta de todos modos?`, ok: 'Dar de alta' }))) return;
        $('[data-ok]', panel).disabled = true;
        const fila = { nombre, puesto, cuadrilla, contratista_id: provId, contratista };
        let id = t ? t.id : null, creado = false;
        try {
          if (t) {
            const fl = ok(await sb().from('trabajadores').update(fila).eq('id', t.id).select('id'));
            if (!fl.length) throw new Error('No tienes permiso para modificar a este trabajador.');
          } else {
            id = R.uid();
            ok(await sb().from('trabajadores').insert(Object.assign({ id, obra_id: destino }, fila)).select('id'));
            creado = true;
          }
          if (vd) {
            const sal = f.salario.value === '' ? null : num(f.salario.value);
            const ant = F.datos[id];
            if (ant ? (ant.curp !== curp || ant.nss !== nss || ant.salario !== sal) : (curp || nss || sal != null)) {
              ok(await sb().from('trabajador_datos').upsert({ trabajador_id: id, curp, nss, salario: sal }).select('trabajador_id'));
            }
          }
        } catch (x) {
          $('[data-ok]', panel).disabled = false;
          if (creado) {   // el trabajador ya quedó; lo que falló fueron sus datos
            await cargar(); api.closeDrawer(true); api.rerender();
            toast(`${nombre} quedó dado de alta, pero sus datos no se guardaron: ${x.message}`);
            return;
          }
          err().textContent = x.message; return;
        }
        api.closeDrawer(true);
        toast(t ? 'Cambios guardados.' : `${nombre} quedó dado de alta. Publica los cambios al terminar.`);
        if (!t) { UI.obra = destino; saveUI(); }
        if (location.hash === '#/ft-altas') api.rerender(); else location.hash = '#/ft-altas';
      });
    });
  }
  function elegirObra(destinos, t) {
    return new Promise(res => {
      api.openPanel(`<form class="dr-form" novalidate>
        <header class="dr-h"><div><p class="mono">${esc(t.nombre)}</p><h2 id="dr-title">Transferir a otra obra</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${ic('close')}</button></header>
        <div class="dr-b"><p class="fld-h">Sale de la lista de esta obra y entra a la de la otra desde hoy. El residente de la otra obra lo verá en su pase de lista.</p>
          <label class="fld"><span class="fld-l">Obra de destino</span><select class="in" name="o">${destinos.map(o => `<option value="${esc(o.id)}">${esc(o.nombre)}</option>`).join('')}</select></label></div>
        <footer class="dr-f"><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid">${ic('check')}<span>Transferir</span></button></footer>
      </form>`, {}, panel => {
        let listo = false;
        const f = $('form', panel);
        f.addEventListener('submit', e => { e.preventDefault(); listo = true; const v = f.o.value; api.closeDrawer(true); res(v); });
        $$('[data-close]', panel).forEach(b => b.addEventListener('click', () => { if (!listo) res(null); }));
      });
    });
  }

  /* =========================================================
     REGISTRO (tabla por rango de fechas)
     ========================================================= */
  function diasRango() {
    const out = [];
    let d = UI.desde;
    for (let i = 0; d <= UI.hasta && i < 62; i++, d = addDays(d, 1)) if (dow(d) !== 0) out.push(d);
    return out;
  }
  function estadoDia(o, d) {
    const p = paseDe(o.id, d), h = hoy();
    if (p) return p.estado === 'no_labora' ? { c: 'nl', t: 'No se laboró', p } : p.aTiempo ? { c: 'ok', t: horaMX(p.en), p } : { c: 'late', t: `${horaMX(p.en)} tarde`, p };
    if (d > h || (d === h && minHM(horaMX()) <= minHM(F.limite))) return { c: 'fut', t: '—' };
    return { c: 'no', t: 'Sin pase' };
  }
  // Números del periodo de una obra (pases, marcas y fotos)
  function statsObra(o) {
    const dias = diasRango(), est = dias.map(d => estadoDia(o, d));
    const c = k => est.filter(e => e.c === k).length;
    const pases = est.map(e => e.p).filter(p => p && p.estado === 'enviado');
    const ms = F.asis.filter(a => pases.some(p => p.id === a.paseId));
    return { dias, est, ok: c('ok'), late: c('late'), no: c('no'), nl: c('nl'), lab: dias.length - c('fut'), env: c('ok') + c('late'),
      marcas: ms.length, asist: ms.filter(a => cuentaAsist(a.marca)).length, faltas: ms.filter(a => a.marca === 'F').length, ret: ms.filter(a => a.marca === 'R').length,
      fuera: F.fotos.filter(f => f.fuera && pases.some(p => p.id === f.paseId)).length };
  }
  const RANGOS = () => { const h = hoy(), l = lunesDe(h); return { sem: [l, addDays(l, 5)], ant: [addDays(l, -7), addDays(l, -2)], cuatro: [addDays(l, -21), addDays(l, 5)], mes: [h.slice(0, 8) + '01', h] }; };
  const rangoHTML = conFechas => {
    const R0 = RANGOS(), act = Object.keys(R0).find(k => R0[k][0] === UI.desde && R0[k][1] === UI.hasta) || '';
    return `<div class="seg fz-seg" role="group" aria-label="Periodo">${[['sem', 'Esta semana'], ['ant', 'Semana pasada'], ['cuatro', 'Últimas 4 semanas'], ['mes', 'Este mes']].map(([k, l]) => `<button type="button" data-rango="${k}" aria-pressed="${act === k}">${l}</button>`).join('')}</div>
      ${conFechas ? `<button type="button" class="tbtn tbtn--sm${act ? '' : ' on'}" data-otro>${ic('cal')}<span>${act ? 'Otro rango' : `${esc(fMes(UI.desde))} – ${esc(fMes(UI.hasta))}`}</span></button>
      <span class="fz-fechas" data-fechas hidden><input class="in in--sm" type="date" name="desde" value="${esc(UI.desde)}" aria-label="Desde"><input class="in in--sm" type="date" name="hasta" value="${esc(UI.hasta)}" aria-label="Hasta"></span>` : ''}`;
  };
  const etiqDia = { ok: 'A tiempo', late: 'Fuera de hora', no: 'Sin pase', nl: 'No se laboró', fut: '' };
  const leyendaDias = `<div class="fz-leg"><span><i class="d-ok"></i>A tiempo</span><span><i class="d-late"></i>Fuera de hora</span><span><i class="d-no"></i>Sin pase de lista</span><span><i class="d-nl"></i>No se laboró</span></div>`;
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);

  async function pageRegistro() {
    const x0 = await preparar('ft-registro'); if (x0) return x0;
    if (UI.obra === 'todas') return pageTodas();
    const o = obra(UI.obra), st = statsObra(o), dias = st.dias, est = st.est, u = ultimoAviso(o.id, 'ft_reporte');
    // Calendario: cuadros por día, alineados por día de la semana
    const hueco = dias.length ? (dow(dias[0]) || 7) - 1 : 0;
    const cal = `${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(d => `<span class="dh">${d}</span>`).join('')}${'<span class="fz-hueco"></span>'.repeat(hueco)}${dias.map((d, i) => {
      const e = est[i], p = e.p, ms = p && p.estado === 'enviado' ? marcasDe(p) : [];
      const marca = p && fotosDe(p).some(x => x.fuera) ? ' <b class="ft-bad" title="Foto fuera de la obra">!</b>' : '', corr = p && p.correccion ? ' <b class="ft-warn" title="Corrección pedida">✎</b>' : '';
      return `<button type="button" class="fz-d d-${e.c}${d === hoy() ? ' d-hoy' : ''}" data-dia-f="${esc(d)}"${p ? '' : ' disabled'}><span class="t"><span>${esc(fMes(d))}</span><span>${p ? (p.estado === 'no_labora' ? '' : esc(horaMX(p.en))) : ''}${marca}${corr}</span></span>
        <strong>${ms.length ? `${ms.filter(a => cuentaAsist(a.marca)).length}/${ms.length}` : ''}</strong><small>${esc(p && p.estado === 'no_labora' ? (p.motivo.split(':')[0] || 'No se laboró') : etiqDia[e.c])}${ms.length ? ' · asistencia' : ''}</small></button>`;
    }).join('')}`;
    // Tabla por trabajador (todo el periodo)
    const enRango = t => t.obraId === o.id && t.alta <= UI.hasta && (t.activo || !t.baja || t.baja >= UI.desde);
    const conMarca = new Set(F.asis.filter(a => { const p = F.pases.find(x => x.id === a.paseId); return p && p.obraId === o.id && p.fecha >= UI.desde && p.fecha <= UI.hasta; }).map(a => a.trabajadorId));
    const ts = F.trab.filter(t => enRango(t) || conMarca.has(t.id)).sort(porGrupo);
    const celda = (t, i) => {
      const p = est[i].p;
      if (!p) return `<td><span class="ft-c ft-c--x">${est[i].c === 'fut' ? '' : '?'}</span></td>`;
      if (p.estado === 'no_labora') return '<td><span class="ft-c ft-c--x">–</span></td>';
      const a = F.asis.find(x => x.paseId === p.id && x.trabajadorId === t.id);
      if (!a) return '<td><span class="ft-c ft-c--x">·</span></td>';
      const mk = MARCAS[a.marca];
      return `<td><span class="ft-c ft-c--${mk.c}" title="${esc(mk.l)}${a.hora ? ' ' + esc(a.hora) : ''}${a.nota ? ' · ' + esc(a.nota) : ''}">${esc(mk.s)}</span></td>`;
    };
    const tot = (t, f) => dias.reduce((n, d, i) => { const p = est[i].p; const a = p && F.asis.find(x => x.paseId === p.id && x.trabajadorId === t.id); return n + (a && f(a.marca) ? 1 : 0); }, 0);
    return {
      title: 'Registro de asistencia',
      html: `<section class="page ft">
        ${barraObras('ft-registro')}
        ${heroHTML(`${esc(o.nombre)} · residente ${esc(residenteDe(o))} · del ${esc(fFecha(UI.desde))} al ${esc(fFecha(UI.hasta))}`, 'Registro de<br>asistencia',
          `<span class="h-count"><b>${st.lab}</b> ${st.lab === 1 ? 'día laboral' : 'días laborales'} · <b>${st.env}</b> ${st.env === 1 ? 'pase enviado' : 'pases enviados'}</span><span class="pill">${u ? 'Último envío al gestor: ' + esc(fMes(FMX.format(new Date(u.en)))) : 'Aún no se manda al gestor'}</span>`,
          sqHTML('ok', 'Pases a<br>tiempo', `${st.ok}<span class="sq-de">/${st.env}</span>`, st.late ? `${st.late} ${st.late === 1 ? 'llegó' : 'llegaron'} después de las ${esc(F.limite)}` : 'Ninguno fuera de hora')
          + sqHTML(st.no ? 'bad' : 'ok', 'Días sin<br>pase de lista', st.no, st.no ? 'se avisó a la oficina cada día' : 'Ningún día sin pase', 140))}
        ${esCoord() ? `<button type="button" class="btn btn--solid fz-solo-cel" data-gestor>${ic('send')}<span>Enviar al gestor IMSS</span></button>` : ''}
        <div class="fz-tools rv" style="--d:100">${rangoHTML(true)}<span class="fz-esp"></span>
          ${esCoord() ? `<button type="button" class="tbtn tbtn--sm" data-rep="pdf">${ic('file')}<span>PDF</span></button><button type="button" class="tbtn tbtn--sm" data-rep="fotos">${ic('camara')}<span>PDF con fotos</span></button>` : ''}
          <button type="button" class="tbtn tbtn--sm" data-rep="xls">${ic('db')}<span>Excel</span></button></div>
        ${u ? `<p class="fz-help rv">Último envío al gestor: ${esc(fechaHora(u.en))} · ${esc(paraTxt(u))}${u.para[0] && u.para[0].desde ? ` · periodo ${esc(fMes(u.para[0].desde))} al ${esc(fMes(u.para[0].hasta))}` : ''}.</p>` : ''}
        <div class="fz-kpis rv" style="--d:120">
          <div class="fz-k"><p>Asistencia promedio</p><strong>${st.marcas ? pct(st.asist, st.marcas) + '%' : '—'}</strong><small>de la plantilla en los días con pase</small></div>
          <div class="fz-k"><p>Faltas</p><strong class="b">${st.faltas}</strong><small>en ${st.env} ${st.env === 1 ? 'día' : 'días'} con pase</small></div>
          <div class="fz-k"><p>Retardos</p><strong class="w">${st.ret}</strong><small>con hora de llegada</small></div>
          <div class="fz-k"><p>Fotos fuera de la obra</p><strong>${st.fuera}</strong><small>${st.fuera ? 'revisa esos días' : 'todas dentro del radio'}</small></div>
        </div>
        <div class="fz-sec rv"><h2>Día por día</h2><small>Toca un día para ver sus fotos${esCoord() ? ' y corregir' : ''}</small></div>
        ${dias.length ? `<div class="fz-cal rv">${cal}</div>${leyendaDias}` : '<div class="empty empty--sm"><p class="h3">Sin días en este periodo</p></div>'}
        <div class="fz-sec rv"><h2>Por trabajador</h2><small>Todo el periodo · desliza para ver más días</small></div>
        ${ts.length && dias.length ? `<div class="ft-tw rv"><table class="ft-tabla">
          <thead><tr><th class="l">Trabajador</th>${dias.map((d, i) => `<th><button type="button" class="ft-dh" data-dia-f="${esc(d)}"${est[i].p ? '' : ' disabled'}>${esc(fCorta(d))}</button></th>`).join('')}<th>Asist.</th><th>Faltas</th></tr></thead>
          <tbody>${ts.map(t => `<tr><td class="l"><b>${esc(t.nombre)}</b><span>${esc(t.puesto)} · ${esc(t.cuadrilla)}${t.obraId !== o.id ? ' · transferido' : !t.activo ? ' · baja ' + esc(fMes(t.baja)) : t.alta >= UI.desde ? ' · alta ' + esc(fMes(t.alta)) : ''}</span></td>${dias.map((d, i) => celda(t, i)).join('')}<td><b>${tot(t, cuentaAsist)}</b></td><td class="ft-bad">${tot(t, m => m === 'F')}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="ft-ley muted small"><span class="ft-c ft-c--a">✓</span> Asistencia <span class="ft-c ft-c--f">✗</span> Falta <span class="ft-c ft-c--o">R</span> Retardo · M medio día · P permiso · I incapacidad · C comisión · D descanso <span class="ft-c ft-c--x">?</span> Sin pase de lista</p>`
          : '<div class="empty empty--sm"><p class="muted small">Sin trabajadores en este periodo.</p></div>'}
      </section>`,
      bind(sec) {
        bindObras(sec); marcarGrupo(); bindRango(sec);
        const tw = $('.ft-tw', sec); if (tw) tw.scrollLeft = tw.scrollWidth;   // abre en los días más recientes
        $$('[data-dia-f]', sec).forEach(b => b.addEventListener('click', () => { const p = paseDe(o.id, b.dataset.diaF); if (p) drDia(p); }));
        $$('[data-rep]', sec).forEach(b => b.addEventListener('click', () => { const k = b.dataset.rep; if (k === 'xls') excelFT(o); else verPdf(o, k === 'fotos', b); }));
        $$('[data-gestor]', sec).forEach(b => b.addEventListener('click', () => drGestor(o)));
      }
    };
  }
  function bindRango(sec) {
    const fijar = (a, b) => { if (!a || !b) return; if (b < a) [a, b] = [b, a]; UI.desde = a; UI.hasta = b; saveUI(); api.rerender(); };
    $$('[data-rango]', sec).forEach(b => b.addEventListener('click', () => { const r = RANGOS()[b.dataset.rango]; fijar(r[0], r[1]); }));
    const bo = $('[data-otro]', sec), fs = $('[data-fechas]', sec);
    if (bo && fs) {
      bo.addEventListener('click', () => { fs.hidden = !fs.hidden; });
      $$('input', fs).forEach(i => i.addEventListener('change', () => fijar($('[name=desde]', fs).value, $('[name=hasta]', fs).value)));
    }
  }

  // Todas las obras: comparativo (solo la oficina)
  function pageTodas() {
    const L = obrasVis().map(o => [o, statsObra(o)]), sum = f => L.reduce((a, x) => a + f(x[1]), 0);
    const h = hoy();
    const hoyDe = o => { const p = paseDe(o.id, h);
      if (p) return p.estado === 'no_labora' ? ['gris', `No se labora (${(p.motivo.split(':')[0] || '').toLowerCase()})`] : [p.aTiempo ? 'ok' : 'sun', `Pase enviado a las ${horaMX(p.en)}${p.aTiempo ? '' : ' (tarde)'}`];
      if (dow(h) === 0) return ['gris', 'Domingo'];
      if (!activosDe(o.id).length) return ['gris', 'Sin trabajadores'];
      return minHM(horaMX()) > minHM(F.limite) ? ['bad', 'Sin pase · ya pasó la hora'] : ['sun', 'Pase pendiente']; };
    const sinPase = L.filter(x => x[1].no);
    return {
      title: 'Registro de asistencia',
      html: `<section class="page ft">
        ${barraObras('ft-registro')}
        ${heroHTML(`${L.length} obras activas · del ${esc(fFecha(UI.desde))} al ${esc(fFecha(UI.hasta))}`, 'Registro de<br>asistencia',
          `<span class="h-count"><b>${L.reduce((a, x) => a + activosDe(x[0].id).length, 0)}</b> trabajadores · <b>${sum(s => s.env)}</b> pases enviados</span><span class="pill">Todas las obras</span>`,
          sqHTML('ok', 'Pases a<br>tiempo', `${sum(s => s.ok)}<span class="sq-de">/${sum(s => s.env)}</span>`, `${sum(s => s.late)} fuera de hora entre las ${L.length} obras`)
          + sqHTML(sum(s => s.no) ? 'bad' : 'ok', 'Días sin<br>pase de lista', sum(s => s.no), sinPase.length ? esc(sinPase.map(x => `${x[0].nombre}: ${x[1].no}`).join(' · ')) : 'Ningún día sin pase', 140))}
        <div class="fz-tools rv" style="--d:100">${rangoHTML(true)}</div>
        <div class="fz-sec rv"><h2>Comparativo por obra</h2><small>Toca una obra para ver su registro completo</small></div>
        <div class="fz-cmp rv">${L.map(([o, s], k) => { const [c, t] = hoyDe(o), u = ultimoAviso(o.id, 'ft_reporte');
          return `<button type="button" class="fz-ocard" data-obra-sel="${esc(o.id)}">
            <span class="fz-oh"><span><b>${esc(o.nombre)}</b><small>${esc(residenteDe(o))} · ${activosDe(o.id).length} trabajadores</small></span>${api.ARR}</span>
            <span class="fz-onum"><span><strong>${s.ok}<span>/${s.env}</span></strong><small>a tiempo</small></span><span><strong class="w">${s.late}</strong><small>tarde</small></span><span><strong class="b">${s.no}</strong><small>sin pase</small></span><span><strong>${s.marcas ? pct(s.asist, s.marcas) + '%' : '—'}</strong><small>asistencia</small></span></span>
            <span class="fz-hoy"><i class="e-${c}"></i>Hoy: ${esc(t)}</span>
            <span class="fz-mini">${s.dias.map((d, i) => `<i class="d-${s.est[i].c}${d === h ? ' d-hoy' : ''}" title="${esc(fMes(d))} · ${esc(etiqDia[s.est[i].c])}"></i>`).join('')}</span>
            <span class="fz-gst">${u ? 'Último envío al gestor: ' + esc(fMes(FMX.format(new Date(u.en)))) : '<b>Aún no se manda al gestor</b>'}</span>
          </button>`; }).join('')}</div>
        ${leyendaDias}
        <div class="fz-sec rv"><h2>Hoy en las obras</h2><small>${esc(fDia(h))} · límite ${esc(F.limite)}</small></div>
        <div class="ft-tw rv"><table class="ft-tabla fz-hoyt"><thead><tr><th class="l">Obra</th><th>Residente</th><th>Pase de hoy</th><th>Asistencia</th><th>Faltas</th><th>Fotos</th><th>Cambios sin publicar</th></tr></thead><tbody>
          ${L.map(([o]) => { const p = paseDe(o.id, h), [c, t] = hoyDe(o), ms = p && p.estado === 'enviado' ? marcasDe(p) : [], pe = pendientes(o.id).length;
            return `<tr><td class="l"><b>${esc(o.nombre)}</b></td><td>${esc(residenteDe(o))}</td><td><span class="fz-est"><i class="e-${c}"></i>${esc(t)}</span></td>
              <td>${ms.length ? `${ms.filter(a => cuentaAsist(a.marca)).length}/${ms.length}` : '—'}</td><td>${ms.length ? ms.filter(a => a.marca === 'F').length : '—'}</td><td>${p && p.estado === 'enviado' ? fotosDe(p).length : '—'}</td><td>${pe || '—'}</td></tr>`; }).join('')}
        </tbody></table></div>
      </section>`,
      bind(sec) { bindObras(sec); marcarGrupo(); bindRango(sec); }
    };
  }

  /* =========================================================
     PARTES 2 Y 3: avisos, reportes (PDF y Excel) y envío al gestor del IMSS
     ========================================================= */
  const errFuncion = async (r, nombre) => {
    let m = ''; try { m = (await r.error.context.json()).error; } catch (x) { /* sin cuerpo */ }
    return new Error(m || `No se pudo completar (¿está publicada la función "${nombre}" en Supabase?).`);
  };
  const canal = p => (p.canal === 'whatsapp' ? 'WhatsApp' : 'correo');
  const paraTxt = a => a.para.map(p => `${p.nombre || p.correo || p.telefono}${p.proveedor && p.proveedor !== p.nombre ? ' (' + p.proveedor + ')' : ''} · ${canal(p)}`).join(', ');
  const fechaHora = iso => `${fMes(FMX.format(new Date(iso)))} ${horaMX(iso)}`;
  const ultimoAviso = (obraId, evento) => F.avisos.find(a => a.obraId === obraId && a.evento === evento);
  async function avisarCambios(obraId) {
    try {
      const r = await sb().functions.invoke('aviso-fuerza', { body: { evento: 'cambios', obra_id: obraId } });
      if (r.error) throw await errFuncion(r, 'aviso-fuerza');
      if (r.data.omitido) return;
      toast(`Aviso enviado a ${r.data.aviso.para.map(p => `${p.nombre} (${canal(p)})`).join(', ')}.`);
    } catch (e) { toast(`Los cambios quedaron publicados, pero no salió el aviso: ${e.message}`); }
  }
  async function verPdf(o, fotos, btn) {
    const w = window.open('', '_blank');
    const t0 = btn.innerHTML; btn.disabled = true; btn.querySelector('span').textContent = 'Armando PDF…';
    try {
      const r = await sb().functions.invoke('reporte-fuerza', { body: { accion: 'pdf', obra_id: o.id, desde: UI.desde, hasta: UI.hasta, fotos } });
      if (r.error) throw await errFuncion(r, 'reporte-fuerza');
      if (w) w.location.href = r.data.url; else location.href = r.data.url;
    } catch (e) { if (w) w.close(); toast(e.message); }
    btn.disabled = false; btn.innerHTML = t0;
  }

  // Excel (HTML con extensión .xls, como los demás reportes de la plataforma)
  function excelFT(o) {
    const dias = diasRango(), vd = verDatos(o.id);
    const pase = d => paseDe(o.id, d);
    const movs = F.movs.filter(m => m.obraId === o.id && m.fecha >= UI.desde && m.fecha <= UI.hasta && (m.tipo !== 'cambio' || /^salario/i.test(m.detalle)))
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const conMarca = new Set(F.asis.filter(a => { const p = F.pases.find(x => x.id === a.paseId); return p && p.obraId === o.id && p.fecha >= UI.desde && p.fecha <= UI.hasta; }).map(a => a.trabajadorId));
    const ts = F.trab.filter(t => (t.obraId === o.id && t.alta <= UI.hasta && (t.activo || !t.baja || t.baja >= UI.desde)) || conMarca.has(t.id)).sort(porGrupo);
    const td = (v, st = '') => `<td style="border:.5pt solid #999;font-size:9pt;vertical-align:top;${st}">${v}</td>`;
    const th = v => `<th style="border:.5pt solid #999;background:#153588;color:#fff;font-size:9pt">${v}</th>`;
    const txt = "mso-number-format:'\\@'", num = "mso-number-format:'\\#\\,\\#\\#0\\.00';text-align:right";
    const dt = id => (vd && F.datos[id]) || {};
    const MOVX = { alta: 'Alta', reingreso: 'Reingreso', baja: 'Baja', transferencia_sale: 'Transferido a otra obra', transferencia_entra: 'Llegó de otra obra', cambio: 'Cambio de salario' };
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>
      <table style="border-collapse:collapse;font-family:Calibri">
      <tr><td colspan="8" style="font-size:14pt;font-weight:bold;color:#153588">GALITHA · Reporte de fuerza de trabajo</td></tr>
      <tr><td colspan="8">Obra: <b>${esc(o.nombre)}</b> · Residente: ${esc((o.residente || {}).nombre || 'sin residente')} · Del ${esc(fMes(UI.desde))} al ${esc(fMes(UI.hasta))} ${esc(UI.hasta.slice(0, 4))}</td></tr>
      <tr><td></td></tr>
      <tr><td colspan="8" style="font-weight:bold;color:#153588">ALTAS, BAJAS Y CAMBIOS DEL PERIODO</td></tr>
      <tr>${['Fecha', 'Movimiento', 'Detalle', 'Nombre', 'Puesto', 'Cuadrilla', 'Contratista', ...(vd ? ['CURP', 'NSS', 'Salario semanal'] : [])].map(th).join('')}</tr>
      ${movs.length ? movs.map(m => { const t = trabDe(m.trabajadorId) || {}; const x = dt(m.trabajadorId);
        return `<tr>${td(esc(m.fecha))}${td(esc(MOVX[m.tipo] || m.tipo))}${td(esc(m.tipo === 'alta' ? '' : m.detalle))}${td(esc(t.nombre || ''))}${td(esc(t.puesto || ''))}${td(esc(t.cuadrilla || ''))}${td(esc(t.contratista || ''))}${vd ? td(esc(x.curp || ''), txt) + td(esc(x.nss || ''), txt) + td(x.salario == null ? '' : x.salario, num) : ''}</tr>`; }).join('')
        : `<tr><td colspan="8">Sin movimientos en el periodo.</td></tr>`}
      <tr><td></td></tr>
      <tr><td colspan="8" style="font-weight:bold;color:#153588">ASISTENCIA (A asistencia · F falta · R retardo · M medio día · P permiso · I incapacidad · C comisión · D descanso)</td></tr>
      <tr>${['Nombre', 'Puesto', 'Cuadrilla', 'Contratista', ...(vd ? ['CURP', 'NSS', 'Salario semanal'] : []), ...dias.map(fCorta), 'Asistencias', 'Faltas'].map(th).join('')}</tr>
      <tr>${td('<b>Pase de lista</b>')}${td('')}${td('')}${td('')}${vd ? td('') + td('') + td('') : ''}${dias.map(d => { const p = pase(d); return td(p ? (p.estado === 'no_labora' ? 'No se laboró' : horaMX(p.en) + (p.aTiempo ? '' : ' (tarde)')) : 'Sin pase'); }).join('')}${td('')}${td('')}</tr>
      ${ts.map(t => { const x = dt(t.id); let na = 0, nf = 0;
        const celdas = dias.map(d => { const p = pase(d); const a = p && F.asis.find(y => y.paseId === p.id && y.trabajadorId === t.id); if (a) { if (cuentaAsist(a.marca)) na++; if (a.marca === 'F') nf++; }
          return td(a ? esc(a.marca + (a.hora ? ' ' + a.hora : '')) : '', 'text-align:center'); }).join('');
        return `<tr>${td(esc(t.nombre))}${td(esc(t.puesto))}${td(esc(t.cuadrilla))}${td(esc(t.contratista))}${vd ? td(esc(x.curp || ''), txt) + td(esc(x.nss || ''), txt) + td(x.salario == null ? '' : x.salario, num) : ''}${celdas}${td(na, 'text-align:center')}${td(nf, 'text-align:center')}</tr>`; }).join('')}
      </table></body></html>`;
    api.descargar(`Fuerza de trabajo ${o.nombre} ${UI.desde} a ${UI.hasta}.xls`.replace(/[\\/:*?"<>|#]+/g, ' '), '﻿' + html, 'application/vnd.ms-excel');
  }

  // Enviar el reporte al gestor del IMSS (o a otro proveedor del directorio)
  const esGestor = p => /imss|gestor|nómina|nomina|seguro social|recursos humanos/i.test([p.tipo, ...arr(p.categorias), ...arr(p.etiquetas), p.nombreComercial, p.nombre_comercial, p.razonSocial].join(' '));
  const telsWa = ts => arr(ts).filter(t => t.whatsapp && String(t.numero).replace(/\D/g, '').length >= 10);
  async function drGestor(o) {
    await api.refresh();
    const provs = api.proveedores().filter(p => p.estatus !== 'no_recomendado').sort((a, b) => (esGestor(b) - esGestor(a)) || api.nombreProveedor(a).localeCompare(api.nombreProveedor(b), 'es'));
    const sugerido = provs.find(esGestor);
    const ult = ultimoAviso(o.id, 'ft_reporte');
    const contactosDe = p => {
      if (!p) return '';
      const ks = (p.contactos || []).filter(k => k.activo !== false && (k.correo || telsWa(k.telefonos).length)), gen = p.correo || telsWa(p.telefonos).length;
      return `${gen ? `<label class="chk chk--wa"><input type="checkbox" data-gen checked><span>Datos de la empresa${p.correo ? ' · ' + esc(p.correo) : ''}${telsWa(p.telefonos).length ? ' · WhatsApp' : ''}</span></label>` : ''}
        ${ks.map(k => `<label class="chk chk--wa"><input type="checkbox" data-k="${esc(k.id)}" checked><span>${esc(k.nombre || 'Contacto')}${k.correo ? ' · ' + esc(k.correo) : ''}${telsWa(k.telefonos).length ? ' · WhatsApp' : ''}</span></label>`).join('')}
        ${gen || ks.length ? '' : '<p class="muted small">Sin correo ni WhatsApp en el directorio: agrégalos en su ficha.</p>'}`;
    };
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(o.nombre)} · del ${esc(fMes(UI.desde))} al ${esc(fMes(UI.hasta))}</p><h2 id="dr-title">Enviar al gestor del IMSS</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${ic('close')}</button></header>
      <div class="dr-b">
        <p class="fld-h">Se arma el PDF con el logo (altas, bajas y cambios de salario del periodo con CURP, NSS y salario, y la plantilla) y se manda por correo a los contactos marcados; las respuestas te llegan a ti. A los que tienen WhatsApp se les manda con un clic al terminar. <b>Nunca lleva fotos.</b></p>
        ${ult ? `<div class="note note--info">${ic('send')}<p>Último envío: ${esc(fechaHora(ult.en))} · ${esc(paraTxt(ult))}.</p></div>` : ''}
        ${!sugerido ? `<div class="note">${ic('alert')}<p>No encontré al gestor en el directorio. Dalo de alta como proveedor (con su correo y WhatsApp) y ponle el tipo o la categoría "Gestor IMSS". Mientras, puedes elegir cualquier proveedor.</p></div>` : ''}
        <label class="fld"><span class="fld-l">Mandar a</span><select class="in" name="prov">${provs.map(p => `<option value="${esc(p.id)}"${sugerido && p.id === sugerido.id ? ' selected' : ''}>${esc(api.nombreProveedor(p))}${esGestor(p) ? ' · gestor' : ''}</option>`).join('')}</select></label>
        <div class="ft-gk" data-cont>${contactosDe(sugerido || provs[0])}</div>
        <label class="chk chk--wa"><input type="checkbox" name="asis" checked><span>Incluir la tabla de asistencia</span></label>
        <label class="fld"><span class="fld-l">Mensaje (opcional)</span><textarea class="in" name="nota" rows="3" maxlength="1000" placeholder="Por ejemplo: favor de dar de baja a Carlos Díaz a partir del 7 de octubre."></textarea></label>
        <div data-res></div>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cerrar</span></button>${provs.length ? `<button type="submit" class="btn btn--solid" data-ok>${ic('send')}<span>Enviar</span></button>` : ''}</footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), res = $('[data-res]', panel), okb = $('[data-ok]', panel);
      f.prov && f.prov.addEventListener('change', () => { $('[data-cont]', panel).innerHTML = contactosDe(provs.find(p => p.id === f.prov.value)); });
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        const envio = { proveedor_id: f.prov.value, contactos: $$('[data-k]:checked', panel).map(i => i.dataset.k), general: !!($('[data-gen]', panel) || {}).checked };
        if (!envio.contactos.length && !envio.general) { err.textContent = 'Marca a quién se le manda.'; return; }
        okb.disabled = true; $('span', okb).textContent = 'Armando y enviando…';
        let data;
        try {
          const r = await sb().functions.invoke('reporte-fuerza', { body: { accion: 'enviar', obra_id: o.id, desde: UI.desde, hasta: UI.hasta, asistencia: f.asis.checked, envios: [envio], nota: f.nota.value.trim() } });
          if (r.error) throw await errFuncion(r, 'reporte-fuerza');
          data = r.data;
        } catch (x) { okb.disabled = false; $('span', okb).textContent = 'Enviar'; err.textContent = x.message; return; }
        okb.hidden = true;
        const pila = (nombre, prov) => (!nombre || nombre === prov ? '' : ' ' + api.sinTitulo(nombre).split(' ')[0]);
        const msg = (nombre, prov) => `Buen día${pila(nombre, prov)}. ${data.mensaje}${f.nota.value.trim() ? '\n' + f.nota.value.trim() : ''}\nPDF (la liga vence en 7 días): ${data.pdf_url}\nGracias. ${(N.perfil || {}).nombre || ''} · Galitha`;
        res.innerHTML = `<div class="col-res"><h3>Resultado</h3>${data.resultados.map(r => `<div class="col-r"><b>${esc(r.nombre || '')}</b>
          ${r.correo_ok ? `<p class="ok">${ic('okc')}<span>Correo enviado a ${esc(r.correos.map(x => x.correo).join(', '))}</span></p>` : r.correos.length ? '' : '<p class="muted small">Sin correo marcado.</p>'}
          ${r.errores.map(x => `<p class="no">${ic('x')}<span>${esc(x)}</span></p>`).join('')}
          ${r.whatsapps.length ? `<div class="acts">${r.whatsapps.filter(w => String(w.telefono).length === 10).map(w => `<a class="btn btn--sm" target="_blank" rel="noopener" data-wa="${esc(r.proveedor_id)}" data-wap="${esc(r.nombre || '')}" data-wan="${esc(w.nombre)}" data-wat="${esc(w.telefono)}" href="https://wa.me/52${esc(w.telefono)}?text=${encodeURIComponent(msg(w.nombre, r.nombre))}">${ic('wa')}<span>WhatsApp a ${esc(w.nombre || w.telefono)}</span></a>`).join('')}</div>` : ''}
        </div>`).join('')}
        <p class="muted small">PDF enviado: <a class="link-u" href="${esc(data.pdf_url)}" target="_blank" rel="noopener">abrir</a> (liga de 7 días).</p></div>`;
        $$('[data-wa]', res).forEach(a => a.addEventListener('click', async () => {
          try {
            ok(await sb().from('avisos').insert({ obra_id: o.id, evento: 'ft_reporte', para: [{ proveedorId: a.dataset.wa, proveedor: a.dataset.wap, nombre: a.dataset.wan, canal: 'whatsapp', telefono: a.dataset.wat, desde: UI.desde, hasta: UI.hasta }] }).select('id'));
            a.classList.add('is-sent');
          } catch (e2) { toast('Se abrió WhatsApp, pero no se anotó el envío: ' + e2.message); }
        }));
        await cargar();
      });
    });
  }

  /* ---------- Detalle de un día (fotos y corrección) ---------- */
  function drDia(p) {
    if (!p) return;
    const o = obra(p.obraId) || {}, fs = fotosDe(p), ms = marcasDe(p).map(a => Object.assign({ t: trabDe(a.trabajadorId) || { nombre: 'Trabajador', puesto: '', cuadrilla: '' } }, a)).sort((a, b) => porGrupo(a.t, b.t));
    const corrige = esCoord() && p.estado === 'enviado';
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(o.nombre)}</p><h2 id="dr-title">Pase de lista · ${esc(fDia(p.fecha))}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${ic('close')}</button></header>
      <div class="dr-b">
        ${p.estado === 'no_labora' ? `<div class="note note--info">${ic('cal')}<p><b>No se laboró:</b> ${esc(p.motivo)} · registró ${esc(p.por)} a las ${esc(horaMX(p.en))}.</p></div>` : `
        <div class="ft-lock${p.aTiempo ? '' : ' is-late'}">${ic(p.aTiempo ? 'check' : 'clock')}<div><b>${p.aTiempo ? 'A tiempo' : 'Fuera de hora'} · ${esc(horaMX(p.en))}</b>Pasó lista: ${esc(p.por)} · límite ${esc(p.limite)}</div></div>
        ${p.correccion ? `<div class="note">${ic('undo')}<p><b>Corrección pedida</b> por ${esc(p.correccionPor)}: ${esc(p.correccion)}</p></div>` : ''}
        ${p.corregidoEn ? `<p class="muted small">Última corrección: ${esc(p.corregidoPor)}, ${esc(fMes(FMX.format(new Date(p.corregidoEn))))} ${esc(horaMX(p.corregidoEn))}.</p>` : ''}
        ${rol() === 'consulta' ? '' : `<fieldset class="fs"><legend>Fotos (${fs.length})</legend><div class="fs-b">${fotosHTML(fs, o)}
          <p class="fld-h">La hora de la foto es la del celular (la base solo acepta fotos de hace 20 min o menos); la de subida, la del servidor. La distancia se mide desde el punto de la obra (radio ${esc(o.radioM || 150)} m).</p></div></fieldset>`}
        <fieldset class="fs"><legend>Trabajadores (${ms.length})</legend><div class="fs-b"><ul class="ft-dl">${ms.map(a => `<li><span><b>${esc(a.t.nombre)}</b><small>${esc(a.t.puesto)} · ${esc(a.t.cuadrilla)}${a.hora ? ' · llegó ' + esc(a.hora) : ''}${a.nota ? ' · ' + esc(a.nota) : ''}</small></span>
          ${corrige ? `<select class="in in--sm" data-corr="${esc(a.trabajadorId)}">${Object.entries(MARCAS).map(([k, v]) => `<option value="${k}"${k === a.marca ? ' selected' : ''}>${esc(v.l)}</option>`).join('')}</select>` : `<span class="ft-c ft-c--${MARCAS[a.marca].c}">${esc(MARCAS[a.marca].s)}</span>`}</li>`).join('')}</ul>
          ${corrige ? '<p class="fld-h">Al cambiar una marca se pide el motivo; la corrección queda en la bitácora.</p>' : ''}</div></fieldset>`}
      </div>
      <footer class="dr-f">${esAdmin() ? `<button type="button" class="btn btn--danger" data-borrar-pase>${ic('trash')}<span>Borrar este pase de lista</span></button>` : ''}<button type="button" class="btn" data-close><span>Cerrar</span></button></footer>
    </form>`, { wide: true }, panel => {
      bindResumen(panel, o);
      const bp = $('[data-borrar-pase]', panel);
      if (bp) bp.addEventListener('click', async () => {
        if (!(await api.confirmar({ titulo: 'Borrar pase de lista', texto: `Se borra el pase de lista del <b>${esc(fDia(p.fecha))}</b> en ${esc(o.nombre)}: sus marcas y sus ${fs.length} ${fs.length === 1 ? 'foto' : 'fotos'}. Ese día quedará "sin pase de lista". No se puede deshacer.`, ok: 'Borrar', peligro: true }))) return;
        bp.disabled = true;
        try {
          const fl = ok(await sb().from('pases_lista').delete().eq('id', p.id).select('id'));
          if (!fl.length) throw new Error('No se pudo borrar (solo el admin técnico y Dirección).');
          await R.borrarArchivos(fs.map(x => x.ruta)).catch(() => toast('El pase se borró, pero quedaron archivos de fotos en el servidor.'));
        } catch (e) { bp.disabled = false; toast(e.message); return; }
        if (p.fecha === hoy()) { borrarBorrador(p.obraId, p.fecha); PL = null; }
        api.closeDrawer(true); toast('Pase de lista borrado.'); api.rerender();
      });
      $$('[data-corr]', panel).forEach(s => s.addEventListener('change', async () => {
        const a = ms.find(x => x.trabajadorId === s.dataset.corr);
        const nota = await api.preguntar({ titulo: 'Corregir asistencia', texto: `${esc(a.t.nombre)}: ${esc(MARCAS[a.marca].l)} → <b>${esc(MARCAS[s.value].l)}</b>`, etiqueta: 'Motivo de la corrección', ok: 'Corregir', requerido: true });
        if (nota == null) { s.value = a.marca; return; }
        try { ok(await sb().rpc('corregir_asistencia', { p_pase: p.id, p_trabajador: a.trabajadorId, p_marca: s.value, p_nota: nota })); }
        catch (e) { toast(e.message); s.value = a.marca; return; }
        a.marca = s.value;
        await cargar(); toast('Asistencia corregida.'); api.rerender();
      }));
    });
  }

  /* ---------- Contador de la barra lateral ---------- */
  let cargado = false;
  function chrome() {
    if (!N.perfil) return;
    if (!cargado) { cargado = true; cargar().catch(() => { }); return; }
    contar();
  }
  function contar() {   // también al terminar cada carga (así se apaga en cuanto se envía el pase)
    if (!F.listo || !N.perfil) return;
    const h = hoy(), tarde = minHM(horaMX()) > minHM(F.limite);
    const sinPase = o => dow(h) !== 0 && activosDe(o.id).length && !paseDe(o.id, h);
    const n = esCoord() ? (tarde ? activas().filter(sinPase).length : 0) : obrasEdit().filter(sinPase).length;
    $$('[data-fcount]').forEach(el => { el.textContent = n || ''; el.title = esCoord() ? 'Obras sin pase de lista hoy' : 'Falta pasar lista hoy'; });
  }

  return {
    pages: { fuerza: pageFuerza, 'ft-altas': pageAltas, 'ft-pase': pagePase, 'ft-registro': pageRegistro },
    titulos: { 'ft-altas': 'Altas y bajas', 'ft-pase': 'Pase de lista', 'ft-registro': 'Registro' },
    acciones: {
      'ft-altas': { label: 'Dar de alta', act: 'alta-trabajador', puede: () => obrasEdit().length > 0 },
      'ft-registro': { label: 'Enviar al gestor IMSS', act: 'gestor-ft', puede: () => esCoord() && UI.obra !== 'todas' && !!obra(UI.obra) }
    },
    onAct(a) { if (a === 'alta-trabajador') drTrabajador(null); if (a === 'gestor-ft' && obra(UI.obra)) drGestor(obra(UI.obra)); },
    cargar, chrome
  };
});
