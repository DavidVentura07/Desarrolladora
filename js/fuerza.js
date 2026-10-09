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
  let F = { listo: false, error: '', obras: [], trab: [], datos: {}, movs: [], pases: [], asis: [], fotos: [], listas: { puestos: [], cuadrillas: [] }, limite: '09:00', ini: '', fin: '' };
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
      sb().from('config').select('valor').eq('clave', 'fuerza_trabajo')
    ]);
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

  /* ---------- Estado de la página ---------- */
  const UI = Object.assign({ tab: '', obra: '', desde: lunesDe(hoy()), hasta: addDays(lunesDe(hoy()), 5) },
    (() => { try { return JSON.parse(sessionStorage.getItem('galitha.ft.ui')) || {}; } catch { return {}; } })());
  const saveUI = () => { try { sessionStorage.setItem('galitha.ft.ui', JSON.stringify(UI)); } catch { /* sin acceso */ } };

  function sinTabla() {
    return { title: 'Fuerza de trabajo', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div>
      <h2 class="h2">Falta preparar el servidor</h2><p class="muted">Para usar la fuerza de trabajo hay que correr <span class="mono">supabase/12-fuerza-trabajo.sql</span> en Supabase.</p></div></section>`, bind() { } };
  }

  async function pageFT() {
    await cargar();
    if (!F.listo) return sinTabla();
    const obras = obrasVis();
    if (rol() === 'compras') return { title: 'Fuerza de trabajo', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">Sin acceso</h2><p class="muted">La fuerza de trabajo la ven Dirección, el coordinador y el residente de cada obra.</p></div></section>`, bind() { } };
    if (!obras.length) return { title: 'Fuerza de trabajo', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">Sin obras asignadas</h2><p class="muted">Cuando seas residente (o suplente) de una obra, aquí pasarás lista a tus trabajadores.</p></div></section>`, bind() { } };
    if (!obras.some(o => o.id === UI.obra)) UI.obra = (obras.find(o => esResDe(o.id)) || obras[0]).id;
    if (!['pase', 'trab', 'reg'].includes(UI.tab)) UI.tab = esResDe(UI.obra) ? 'pase' : 'reg';
    saveUI();
    const o = obra(UI.obra);
    const tabs = [['pase', 'Pase de lista'], ['trab', 'Trabajadores'], ['reg', 'Registro']];
    const cuerpo = UI.tab === 'pase' ? paseHTML(o) : UI.tab === 'trab' ? trabHTML(o) : regHTML(o);
    return {
      title: 'Fuerza de trabajo',
      html: `<section class="page ft">
        <header class="page-head rv"><div><p class="eyebrow">Trabajadores y pase de lista por obra</p><h1 class="title">Fuerza de trabajo</h1></div>
          <div class="col-hb">${esJefe() ? `<button class="tbtn" type="button" data-limite>${ic('clock')}<span>Hora límite ${esc(F.limite)}</span></button>` : ''}</div></header>
        <div class="filterbar ft-bar rv" style="--d:60">
          <div class="seg" role="group" aria-label="Sección">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${UI.tab === k}">${l}</button>`).join('')}</div>
          ${obras.length > 1 ? `<span class="fb-sep"></span><label class="psel on"><span class="sr">Obra</span><select data-obra-f>${obras.map(x => `<option value="${esc(x.id)}"${x.id === UI.obra ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>` : `<span class="ft-obra">${ic('building')}${esc(o.nombre)}</span>`}
        </div>
        <div data-ft-cuerpo>${cuerpo}</div>
      </section>`,
      bind(sec) {
        $$('[data-tab]', sec).forEach(b => b.addEventListener('click', () => { UI.tab = b.dataset.tab; saveUI(); api.rerender(); }));
        const so = $('[data-obra-f]', sec); if (so) so.addEventListener('change', () => { UI.obra = so.value; saveUI(); api.rerender(); });
        const bl = $('[data-limite]', sec); if (bl) bl.addEventListener('click', cambiarLimite);
        if (UI.tab === 'pase') bindPase(sec, o);
        else if (UI.tab === 'trab') bindTrab(sec, o);
        else bindReg(sec, o);
      }
    };
  }

  async function cambiarLimite() {
    const v = await api.preguntar({ titulo: 'Hora límite del pase de lista', texto: 'Una sola para todas las obras. Si a esa hora no se ha pasado lista, se avisa al coordinador y a Dirección (parte 2).', etiqueta: 'Hora (24 h, por ejemplo 09:00)', valor: F.limite, ok: 'Guardar', requerido: true });
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
     PASE DE LISTA
     ========================================================= */
  let PL = null;   // { obraId, fecha, marcas: {id: {m, hora, nota}}, fotos: [], paso }
  const KEYB = (o, f) => `galitha.ft.pl.${o}.${f}`;
  const leerBorrador = (o, f) => { try { return JSON.parse(localStorage.getItem(KEYB(o, f))) || {}; } catch { return {}; } };
  const guardarBorrador = () => { try { localStorage.setItem(KEYB(PL.obraId, PL.fecha), JSON.stringify(PL.marcas)); } catch { /* sin acceso */ } };
  const borrarBorrador = (o, f) => { try { localStorage.removeItem(KEYB(o, f)); } catch { /* sin acceso */ } };
  function plDe(obraId) {
    const f = hoy();
    if (!PL || PL.obraId !== obraId || PL.fecha !== f) {
      if (PL) PL.fotos.forEach(x => URL.revokeObjectURL(x.url));
      PL = { obraId, fecha: f, marcas: leerBorrador(obraId, f), fotos: [], paso: 1 };
    }
    const ids = new Set(activosDe(obraId).map(t => t.id));
    Object.keys(PL.marcas).forEach(k => { if (!ids.has(k)) delete PL.marcas[k]; });
    return PL;
  }
  const VIGENCIA = 18 * 60e3;   // la base acepta fotos tomadas hace 20 min o menos
  const vencida = x => !x.ruta && Date.now() - new Date(x.tomadaEn).getTime() > VIGENCIA;

  function limiteHTML(fecha) {
    const ahora = minHM(horaMX()), lim = minHM(F.limite);
    if (fecha !== hoy()) return '';
    return ahora <= lim ? `<span class="pill pill--sun">${ic('clock')}Límite ${esc(F.limite)} · faltan ${lim - ahora} min</span>`
      : `<span class="pill pill--bad">${ic('clock')}Ya pasó la hora límite (${esc(F.limite)}): se registrará fuera de hora</span>`;
  }

  function paseHTML(o) {
    const f = hoy(), p = paseDe(o.id, f);
    const hero = (titulo, extra) => `<div class="ft-hero rv" style="--d:80"><small>${esc(o.nombre)} · ${esc(fDia(f))}</small><b>${titulo}</b><div class="ft-pills">${extra || ''}</div></div>`;
    if (p) return hero(p.estado === 'no_labora' ? 'Hoy no se labora' : 'Pase de lista enviado', `<span class="pill pill--w">${ic('candado')}Cerrado</span>`) + resumenPase(p, o);
    if (dow(f) === 0) return hero('Hoy es domingo') + '<div class="empty empty--sm"><p class="h3">Los domingos no se pasa lista</p></div>';
    if (!puedeEditar(o.id)) return hero('Todavía no se pasa lista', minHM(horaMX()) > minHM(F.limite) ? `<span class="pill pill--bad">${ic('clock')}Ya pasó la hora límite (${esc(F.limite)})</span>` : limiteHTML(f)) + `<div class="empty empty--sm"><p class="muted small">El residente de la obra pasa lista cada mañana.</p></div>`;
    const ts = activosDe(o.id);
    if (!ts.length) return hero('Pase de lista de hoy', limiteHTML(f)) + `<div class="empty empty--sm"><p class="h3">Todavía no hay trabajadores</p><p class="muted small">Primero da de alta a tus trabajadores.</p><button class="btn btn--solid" type="button" data-alta>${ic('plus')}<span>Dar de alta</span></button>
      <p class="muted small" style="margin-top:14px"><button type="button" class="link-u" data-nolabora>Hoy no se labora</button></p></div>`;
    const pl = plDe(o.id);
    return hero('Pase de lista de hoy', `${limiteHTML(f)}<span class="pill pill--w">Paso ${pl.paso} de 2</span>`)
      + (esCoord() && !esResDe(o.id) ? `<div class="note note--info">${ic('alert')}<p>Normalmente pasa lista el residente. Si lo haces tú, las fotos saldrán con su ubicación real.</p></div>` : '')
      + `<div data-ft-pase></div>`;
  }

  function pintarPase(box, o) {
    const pl = plDe(o.id), ts = activosDe(o.id);
    const n = k => ts.filter(t => (pl.marcas[t.id] || {}).m && (k === 'A' ? cuentaAsist(pl.marcas[t.id].m) : pl.marcas[t.id].m === k)).length;
    const sin = ts.filter(t => !(pl.marcas[t.id] || {}).m).length;
    if (pl.paso === 1) {
      let g0 = '';
      box.innerHTML = `
        <div class="ft-count"><div><b>${n('A')}</b><span>Asistencia</span></div><div><b>${n('F')}</b><span>Falta</span></div><div><b>${sin}</b><span>Sin marcar</span></div></div>
        <p class="ft-todos">${sin ? `<button type="button" class="link-u" data-todos>Marcar asistencia a los ${sin} que faltan</button>` : '<span></span>'}<button type="button" class="link-u ft-nl" data-nolabora>Hoy no se labora</button></p>
        <div class="ft-lista">${ts.map(t => {
          const g = grupo(t), x = pl.marcas[t.id] || {}, otra = x.m && OTRAS.includes(x.m);
          const h = g !== g0 ? `<div class="ft-grp"><span>${esc(g)}</span><span>${ts.filter(y => grupo(y) === g).length}</span></div>` : ''; g0 = g;
          return `${h}<div class="ft-w" data-tid="${esc(t.id)}"><span class="ft-av">${esc(api.iniciales(t.nombre))}</span>
            <div class="ft-n"><b>${esc(t.nombre)}</b><span>${esc(t.puesto)}${otra ? ` <em class="ft-tag">${esc(MARCAS[x.m].l)}${x.m === 'R' && x.hora ? ' ' + esc(x.hora) : ''}</em>` : ''}${x.nota ? ` · ${esc(x.nota)}` : ''}</span></div>
            <div class="ft-mk"><button type="button" data-m="A" class="a${x.m === 'A' ? ' on' : ''}" aria-label="Asistencia" aria-pressed="${x.m === 'A'}">✓</button><button type="button" data-m="F" class="f${x.m === 'F' ? ' on' : ''}" aria-label="Falta" aria-pressed="${x.m === 'F'}">✗</button><button type="button" data-m="O" class="o${otra ? ' on' : ''}" aria-label="Otras opciones">${otra ? esc(x.m) : '···'}</button></div></div>`;
        }).join('')}</div>
        <div class="ft-foot"><button type="button" class="btn btn--solid ft-sig" data-sig${sin ? ' disabled' : ''}><span>${sin ? `Faltan ${sin} por marcar` : 'Siguiente: fotos por cuadrilla'}</span>${sin ? '' : api.ARR}</button></div>`;
      return;
    }
    // Paso 2: fotos
    const cuads = [...new Set(ts.filter(t => (pl.marcas[t.id] || {}).m !== 'F').map(t => t.cuadrilla))];
    const faltanC = cuads.filter(c => !pl.fotos.some(x => x.cuadrilla === c));
    const venc = pl.fotos.filter(vencida).length;
    box.innerHTML = `
      <div class="ft-count"><div><b>${n('A')}</b><span>Asistencia</span></div><div><b>${n('F')}</b><span>Falta</span></div><div><b>${pl.fotos.length}</b><span>Fotos</span></div></div>
      <p class="ft-todos"><button type="button" class="link-u" data-atras>← Regresar a la lista</button></p>
      <div class="ft-fotobox">
        <p class="ft-fh">Toma una foto de cada cuadrilla con la cámara de la app. ${faltanC.length ? `Faltan: <b>${faltanC.map(esc).join(', ')}</b>.` : cuads.length ? '<b>Ya están todas las cuadrillas.</b>' : ''}</p>
        <button type="button" class="btn btn--solid ft-cam-btn" data-camara>${ic('camara')}<span>${pl.fotos.length ? 'Tomar otra foto' : 'Abrir cámara'}</span></button>
      </div>
      <div class="ft-fotos">${pl.fotos.map((x, i) => `<div class="ft-ph${x.dist != null && x.dist > (obra(pl.obraId).radioM || 150) ? ' is-bad' : ''}${vencida(x) ? ' is-old' : ''}">
        <img src="${x.url}" alt=""><div class="ft-pi"><b>${esc(x.cuadrilla)}</b><span>${esc(horaMX(x.tomadaEn))} · ${distTxt(x.dist, obra(pl.obraId))} · ±${esc(x.prec)} m</span>${vencida(x) ? '<span class="ft-bad">Tiene más de 18 min: vuelve a tomarla</span>' : ''}</div>
        <button type="button" class="ibtn" data-quitar="${i}" aria-label="Quitar foto">${ic('trash')}</button></div>`).join('')}</div>
      ${venc ? `<div class="note note--bad">${ic('alert')}<p>${venc === 1 ? 'Una foto ya tiene' : venc + ' fotos ya tienen'} más de 18 minutos. Quítala${venc === 1 ? '' : 's'} y vuelve a tomarla${venc === 1 ? '' : 's'}: el servidor solo acepta fotos recientes.</p></div>` : ''}
      <div class="ft-foot"><button type="button" class="btn btn--solid ft-sig" data-enviar${!pl.fotos.length || venc ? ' disabled' : ''}>${ic('send')}<span>${pl.fotos.length ? 'Enviar pase de lista' : 'Falta al menos una foto'}</span></button>
        </div>`;
  }
  const distTxt = (d, o) => (d == null ? (o && o.lat != null ? 'sin distancia' : 'obra sin ubicación') : d > ((o && o.radioM) || 150) ? `<span class="ft-bad">fuera de la obra (${Math.round(d)} m)</span>` : `dentro de la obra (${Math.round(d)} m)`);

  function bindPase(sec, o) {
    const box = $('[data-ft-pase]', sec);
    $$('[data-alta]', sec).forEach(b => b.addEventListener('click', () => drTrabajador(null)));
    $$('[data-nolabora]', sec).forEach(b => b.addEventListener('click', () => noLabora(o)));
    if (!box) { bindResumen(sec, o); return; }
    const pinta = () => pintarPase(box, o);
    pinta();
    box.addEventListener('click', async e => {
      const pl = PL;
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.nolabora != null) { noLabora(o); return; }
      if (b.dataset.todos != null) { activosDe(o.id).forEach(t => { if (!(pl.marcas[t.id] || {}).m) pl.marcas[t.id] = { m: 'A' }; }); guardarBorrador(); pinta(); return; }
      if (b.dataset.m) {
        const t = trabDe(b.closest('[data-tid]').dataset.tid);
        if (b.dataset.m === 'O') { otraMarca(t, pinta); return; }
        const x = pl.marcas[t.id] || {};
        pl.marcas[t.id] = x.m === b.dataset.m ? {} : { m: b.dataset.m };
        guardarBorrador(); pinta(); return;
      }
      if (b.dataset.sig != null) { pl.paso = 2; pinta(); sec.querySelector('.ft-pills .pill--w:last-child').textContent = 'Paso 2 de 2'; scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (b.dataset.atras != null) { pl.paso = 1; pinta(); return; }
      if (b.dataset.quitar != null) { const [x] = pl.fotos.splice(+b.dataset.quitar, 1); if (x) URL.revokeObjectURL(x.url); pinta(); return; }
      if (b.dataset.camara != null) { abrirCamara(o, pinta); return; }
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

  /* ---------- Resumen de un pase ya enviado ---------- */
  function resumenPase(p, o) {
    if (p.estado === 'no_labora') return `<div class="ft-lock">${ic('check')}<div><b>Registrado a las ${esc(horaMX(p.en))}</b>${esc(p.motivo)} · ${esc(p.por)}</div></div>`;
    const ms = marcasDe(p), fs = fotosDe(p);
    const n = k => ms.filter(a => a.marca === k).length;
    const otras = ms.filter(a => OTRAS.includes(a.marca));
    const fuera = fs.filter(x => x.fuera).length;
    return `<div class="ft-lock${p.aTiempo ? '' : ' is-late'}">${ic(p.aTiempo ? 'check' : 'clock')}<div><b>${p.aTiempo ? 'A tiempo' : 'Fuera de hora'} · ${esc(horaMX(p.en))}</b>Hora del servidor (límite ${esc(p.limite)}). Pasó lista: ${esc(p.por)}.</div></div>
      ${p.correccion ? `<div class="note">${ic('undo')}<p><b>Corrección pedida</b> por ${esc(p.correccionPor)}: ${esc(p.correccion)}</p></div>` : ''}
      ${p.corregidoEn ? `<p class="muted small ft-corr">Corregido por ${esc(p.corregidoPor)} el ${esc(fMes(FMX.format(new Date(p.corregidoEn))))} a las ${esc(horaMX(p.corregidoEn))}.</p>` : ''}
      <dl class="ft-kv"><dt>Asistencia</dt><dd>${ms.filter(a => cuentaAsist(a.marca)).length}</dd><dt>Faltas</dt><dd>${n('F')}</dd>
        ${otras.length ? `<dt>Otras</dt><dd>${otras.map(a => `${esc(MARCAS[a.marca].l)}: ${esc((trabDe(a.trabajadorId) || {}).nombre || '')}${a.hora ? ' (' + esc(a.hora) + ')' : ''}`).join('<br>')}</dd>` : ''}
        <dt>Fotos</dt><dd>${fs.length}${fuera ? ` · <span class="ft-bad">${fuera} fuera de la obra</span>` : ''}</dd></dl>
      ${rol() === 'consulta' ? '' : fotosHTML(fs, o)}
      <div class="ft-acc">
        ${esCoord() ? `<button type="button" class="btn" data-dia="${esc(p.id)}">${ic('edit')}<span>Ver detalle y corregir</span></button>`
          : puedeEditar(o.id) ? `<button type="button" class="btn" data-pedir="${esc(p.id)}">${ic('undo')}<span>Pedir corrección</span></button>` : ''}
      </div>`;
  }
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

  function abrirCamara(o, alCambiar) {
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
    sel.value = sigCuad();
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

  /* =========================================================
     TRABAJADORES
     ========================================================= */
  function trabHTML(o) {
    const ts = activosDe(o.id), bajas = F.trab.filter(t => t.obraId === o.id && !t.activo).sort((a, b) => String(b.baja).localeCompare(String(a.baja)));
    const pend = pendientes(o.id), ed = puedeEditar(o.id);
    const nAlt = pend.filter(m => ['alta', 'reingreso'].includes(m.tipo)).length, nBaj = pend.filter(m => m.tipo === 'baja').length, nCam = pend.filter(m => m.tipo === 'cambio').length;
    const nTra = pend.filter(m => m.tipo.startsWith('transferencia')).length;
    let g0 = '';
    return `${ed && pend.length ? `<div class="ft-chg rv" style="--d:80"><div><b>${pend.length} ${pend.length === 1 ? 'cambio sin publicar' : 'cambios sin publicar'}</b>
        <span>${[nAlt && `${nAlt} ${nAlt === 1 ? 'alta' : 'altas'}`, nBaj && `${nBaj} ${nBaj === 1 ? 'baja' : 'bajas'}`, nTra && `${nTra} ${nTra === 1 ? 'transferencia' : 'transferencias'}`, nCam && `${nCam} ${nCam === 1 ? 'cambio' : 'cambios'}`].filter(Boolean).join(' · ')}. La oficina ya los ve; al publicar se avisa a Dirección y al coordinador.</span></div>
        <button type="button" class="btn btn--solid" data-publicar>${ic('send')}<span>Publicar cambios</span></button></div>` : ''}
      <div class="ft-th rv" style="--d:100"><p><b>${ts.length}</b> ${ts.length === 1 ? 'trabajador activo' : 'trabajadores activos'} en ${esc(o.nombre)}</p>
        ${ed ? `<button type="button" class="btn btn--solid btn--sm" data-alta>${ic('plus')}<span>Dar de alta</span></button>` : ''}</div>
      ${ts.length ? `<div class="ft-lista ft-lista--trab">${ts.map(t => {
        const g = grupo(t), h = g !== g0 ? `<div class="ft-grp"><span>${esc(g)}</span><span>${ts.filter(y => grupo(y) === g).length}</span></div>` : ''; g0 = g;
        const nuevo = pend.some(m => m.trabajadorId === t.id && ['alta', 'reingreso', 'transferencia_entra'].includes(m.tipo));
        return `${h}<button type="button" class="ft-w ft-w--btn" data-trab="${esc(t.id)}"><span class="ft-av">${esc(api.iniciales(t.nombre))}</span>
          <span class="ft-n"><b>${esc(t.nombre)}${nuevo ? '<em class="ft-tag">nuevo</em>' : ''}</b><span>${esc(t.puesto)} · desde el ${esc(fMes(t.alta))}</span></span>${api.ARR}</button>`;
      }).join('')}</div>` : `<div class="empty empty--sm"><p class="h3">Sin trabajadores activos</p><p class="muted small">${ed ? 'Usa <b>Dar de alta</b> para agregar a la gente de la obra.' : 'El residente da de alta a los trabajadores de su obra.'}</p></div>`}
      ${bajas.length ? `<details class="ft-bajas"><summary>Dados de baja (${bajas.length})</summary>${bajas.map(t => `<button type="button" class="ft-w ft-w--btn is-off" data-trab="${esc(t.id)}"><span class="ft-av">${esc(api.iniciales(t.nombre))}</span>
        <span class="ft-n"><b>${esc(t.nombre)}</b><span>${esc(t.puesto)} · baja el ${esc(fMes(t.baja))}${t.motivoBaja ? ' · ' + esc(t.motivoBaja) : ''}</span></span>${api.ARR}</button>`).join('')}</details>` : ''}`;
  }
  function bindTrab(sec, o) {
    $$('[data-alta]', sec).forEach(b => b.addEventListener('click', () => drTrabajador(null)));
    $$('[data-trab]', sec).forEach(b => b.addEventListener('click', () => drTrabajador(trabDe(b.dataset.trab))));
    const bp = $('[data-publicar]', sec);
    if (bp) bp.addEventListener('click', async () => {
      bp.disabled = true;
      let r;
      try { r = ok(await sb().rpc('publicar_movimientos', { p_obra: o.id })); } catch (e) { bp.disabled = false; toast(e.message); return; }
      toast(r && r.total ? `${r.total} ${r.total === 1 ? 'cambio publicado' : 'cambios publicados'}.` : 'No había cambios por publicar.');
      api.rerender();
    });
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
        if (!t) { UI.tab = 'trab'; UI.obra = destino; saveUI(); }
        if (location.hash === '#/fuerza') api.rerender(); else location.hash = '#/fuerza';
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
  function regHTML(o) {
    const dias = diasRango();
    const enRango = t => t.obraId === o.id ? (t.alta <= UI.hasta && (t.activo || !t.baja || t.baja >= UI.desde)) : false;
    const conMarca = new Set(F.asis.filter(a => { const p = F.pases.find(x => x.id === a.paseId); return p && p.obraId === o.id && p.fecha >= UI.desde && p.fecha <= UI.hasta; }).map(a => a.trabajadorId));
    const ts = F.trab.filter(t => enRango(t) || conMarca.has(t.id)).sort(porGrupo);
    const est = dias.map(d => estadoDia(o, d));
    const celda = (t, d, i) => {
      const p = est[i].p;
      if (!p) return `<td><span class="ft-c ft-c--x">${est[i].c === 'fut' ? '' : '?'}</span></td>`;
      if (p.estado === 'no_labora') return '<td><span class="ft-c ft-c--x">–</span></td>';
      const a = F.asis.find(x => x.paseId === p.id && x.trabajadorId === t.id);
      if (!a) return '<td><span class="ft-c ft-c--x">·</span></td>';
      const mk = MARCAS[a.marca];
      return `<td><span class="ft-c ft-c--${mk.c}" title="${esc(mk.l)}${a.hora ? ' ' + esc(a.hora) : ''}${a.nota ? ' · ' + esc(a.nota) : ''}">${esc(mk.s)}</span></td>`;
    };
    const tot = (t, f) => dias.reduce((n, d, i) => { const p = est[i].p; const a = p && F.asis.find(x => x.paseId === p.id && x.trabajadorId === t.id); return n + (a && f(a.marca) ? 1 : 0); }, 0);
    const resumen = { ok: est.filter(e => e.c === 'ok').length, late: est.filter(e => e.c === 'late').length, no: est.filter(e => e.c === 'no').length };
    return `<div class="ft-rango rv" style="--d:80">
        <label class="fld"><span class="fld-l">Desde</span><input class="in" type="date" name="desde" value="${esc(UI.desde)}"></label>
        <label class="fld"><span class="fld-l">Hasta</span><input class="in" type="date" name="hasta" value="${esc(UI.hasta)}"></label>
        <div class="ft-rapidos"><button type="button" class="tbtn tbtn--sm" data-rango="sem">Esta semana</button><button type="button" class="tbtn tbtn--sm" data-rango="ant">Semana pasada</button><button type="button" class="tbtn tbtn--sm" data-rango="mes">Este mes</button></div>
      </div>
      <p class="ft-res rv" style="--d:100">${dias.length} ${dias.length === 1 ? 'día laboral' : 'días laborales'} · <b class="ok">${resumen.ok} a tiempo</b>${resumen.late ? ` · <b class="late">${resumen.late} fuera de hora</b>` : ''}${resumen.no ? ` · <b class="no">${resumen.no} sin pase de lista</b>` : ''}</p>
      ${ts.length || dias.length ? `<div class="ft-tw rv" style="--d:120"><table class="ft-tabla">
        <thead><tr><th class="l">Trabajador</th>${dias.map((d, i) => `<th><button type="button" class="ft-dh" data-dia-f="${esc(d)}"${est[i].p ? '' : ' disabled'}>${esc(fCorta(d))}</button></th>`).join('')}<th>Asist.</th><th>Faltas</th></tr>
          <tr class="ft-ev"><td class="l">Pase de lista</td>${est.map(e => `<td class="${e.c}">${esc(e.t)}${e.p && fotosDe(e.p).some(x => x.fuera) ? ' <span class="ft-bad" title="Foto fuera de la obra">!</span>' : ''}${e.p && e.p.correccion ? ' <span class="ft-warn" title="Corrección pedida">✎</span>' : ''}</td>`).join('')}<td></td><td></td></tr></thead>
        <tbody>${ts.map(t => `<tr><td class="l"><b>${esc(t.nombre)}</b><span>${esc(t.puesto)} · ${esc(t.cuadrilla)} · ${esc(t.contratista)}${t.obraId !== o.id ? ' · transferido' : !t.activo ? ' · baja ' + esc(fMes(t.baja)) : t.alta >= UI.desde ? ' · alta ' + esc(fMes(t.alta)) : ''}</span></td>${dias.map((d, i) => celda(t, d, i)).join('')}<td>${tot(t, cuentaAsist)}</td><td>${tot(t, m => m === 'F')}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="ft-ley muted small"><span class="ft-c ft-c--a">✓</span> Asistencia <span class="ft-c ft-c--f">✗</span> Falta <span class="ft-c ft-c--o">R</span> Retardo · M medio día · P permiso · I incapacidad · C comisión · D descanso <span class="ft-c ft-c--x">?</span> Sin pase de lista · Toca un día para ver sus fotos.</p>`
      : '<div class="empty empty--sm"><p class="h3">Sin datos en estas fechas</p></div>'}`;
  }
  function bindReg(sec, o) {
    const f1 = $('[name=desde]', sec), f2 = $('[name=hasta]', sec);
    const fijar = (a, b) => { if (!a || !b) return; if (b < a) [a, b] = [b, a]; UI.desde = a; UI.hasta = b; saveUI(); api.rerender(); };
    f1.addEventListener('change', () => fijar(f1.value, f2.value));
    f2.addEventListener('change', () => fijar(f1.value, f2.value));
    $$('[data-rango]', sec).forEach(b => b.addEventListener('click', () => {
      const h = hoy(), l = lunesDe(h);
      if (b.dataset.rango === 'sem') fijar(l, addDays(l, 5));
      else if (b.dataset.rango === 'ant') fijar(addDays(l, -7), addDays(l, -2));
      else fijar(h.slice(0, 8) + '01', h);
    }));
    $$('[data-dia-f]', sec).forEach(b => b.addEventListener('click', () => { const p = paseDe(o.id, b.dataset.diaF); if (p) drDia(p); }));
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
      <footer class="dr-f"><button type="button" class="btn" data-close><span>Cerrar</span></button></footer>
    </form>`, { wide: true }, panel => {
      bindResumen(panel, o);
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
    pages: { fuerza: pageFT },
    titulos: { fuerza: 'Fuerza de trabajo' },
    acciones: { fuerza: { label: 'Dar de alta', act: 'alta-trabajador', puede: () => obrasEdit().length > 0 } },
    onAct(a) { if (a === 'alta-trabajador') drTrabajador(null); },
    cargar, chrome
  };
});
