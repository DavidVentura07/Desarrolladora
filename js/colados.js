/* =========================================================
   GALITHA · Programación de colados (v0.11, 2026-10-07)
   Se registra en window.GALITHA_MODULOS como los demás módulos.

   Solicitud de colado: borrador → enviada → (devuelta → enviada…) → aprobada → realizado  (o cancelada)
   - El residente de la obra (o su suplente vigente) la arma por semana, la guarda
     como borrador y la envía al coordinador cuando está seguro.
   - El coordinador la aprueba o la devuelve con un comentario; también la puede cancelar.
   - Una solicitud puede tener varios eventos (v0.12): el evento 1 vive en las columnas de
     siempre (fecha, hora, elemento, ubicación, concretos) y los demás en eventos_extra;
     todos salen en el mismo PDF.
   - Ya aprobada, compras manda la solicitud a proveedores del directorio con la categoría
     de concreto o bombeo (correo con el PDF por la Edge Function "cotizar-colado" y WhatsApp
     con un clic) y registra solo la cotización que Dirección aprobó (v0.12: sin comparativo):
     concreto y bombeo juntos, o cada uno por separado. Cada una crea su compra, que sigue en
     Compras y facturas (pago, factura, remisión por olla).
   - Compras marca "confirmado con el proveedor"; al final se cierra con el volumen real.
   - El admin técnico corrige un colado en cualquier estado (v0.12).
   - Cada cambio de estado manda correo (Edge Function "aviso-colado").
   Los desplegables salen de colado_listas (cualquiera agrega opciones; jefes,
   coordinador y compras las quitan o renombran). Reglas en supabase/08-colados.sql.
   ========================================================= */
(window.GALITHA_MODULOS = window.GALITHA_MODULOS || []).push(api => {
  const R = window.StoreReq;
  const N = window.Nube;
  const { esc, I, toast } = api;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const sb = () => N.sb;
  const str = v => (v == null ? '' : String(v)).trim();
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  /* ---------- Fechas y semanas (las mismas reglas que requisiciones) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const toDate = s => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const m = s.split('-'); return new Date(+m[0], +m[1] - 1, +m[2]); }
    const d = new Date(s); return isNaN(d) ? null : d;
  };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => ymd(new Date());
  const fDate = s => { const d = toDate(s); return d ? `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}` : '—'; };
  const fDateL = s => { const d = toDate(s); return d ? `${DIA[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]} ${d.getFullYear()}` : 'Sin fecha'; };
  const fDateT = s => {
    const d = toDate(s); if (!d) return '—';
    let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return `${DIA[d.getDay()].slice(0, 3)} ${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}, ${h}:${pad(d.getMinutes())} ${ap}`;
  };
  function isoWeek(dt) {
    const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { anio: d.getUTCFullYear(), semana: Math.ceil(((d - y0) / 864e5 + 1) / 7) };
  }
  const lunes = (anio, semana) => { const s = new Date(anio, 0, 4); const day = s.getDay() || 7; return addDays(s, -day + 1 + (semana - 1) * 7); };
  const wkKey = w => w.anio * 100 + w.semana;
  const wkRange = w => { const l = lunes(w.anio, w.semana), s = addDays(l, 5); return `${l.getDate()} ${MES[l.getMonth()].slice(0, 3)} – ${s.getDate()} ${MES[s.getMonth()].slice(0, 3)} ${s.getFullYear()}`; };
  const m3 = n => `${Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })} m³`;

  /* ---------- Catálogos fijos y listas editables ---------- */
  const ESTADOS = {
    borrador: { label: 'Borrador', cls: 'draft', ico: 'draft' },
    enviada: { label: 'Por aprobar', cls: 'wait', ico: 'clock' },
    devuelta: { label: 'Devuelto para corregir', cls: 'ext', ico: 'undo' },
    aprobada: { label: 'Aprobado', cls: 'ok', ico: 'shield' },
    realizado: { label: 'Realizado', cls: 'ok', ico: 'check' },
    cancelada: { label: 'Cancelado', cls: 'bad', ico: 'x' }
  };
  const tag = c => { const e = ESTADOS[c.estado] || ESTADOS.borrador; return `<span class="tagx tagx--${e.cls}">${I[e.ico] || ''}${esc(e.label)}</span>`; };
  const BOMBEO = { '': 'Por definir', estacionaria: 'Bomba estacionaria', pluma: 'Bomba pluma', tiro_directo: 'Tiro directo (sin bomba)' };
  const COLOCACION = ['Bombeable', 'Tiro directo'];
  const CHECK = [
    ['cimbra', 'Cimbra y acero revisados y liberados por supervisión'],
    ['bandereros', 'Personal de apoyo (bandereros) para la llegada de las ollas'],
    ['lechada', 'Material para la lechada de la bomba (cemento, arena y agua)'],
    ['lavado', 'Área de lavado de ollas dentro de la obra'],
    ['permisos', 'Permisos de vía pública, si la descarga es en la calle']
  ];
  const LISTAS = {
    elementos: 'Elemento a colar', resistencias: "Resistencia (f'c)", edades: 'Edad de la resistencia',
    tmas: 'Tamaño máximo del agregado (TMA)', revenimientos: 'Revenimiento', aditivos: 'Aditivos y especiales'
  };

  /* ---------- Datos ---------- */
  let C = { listo: false, colados: [], listas: {}, obras: [], compras: [], cots: [], parte2: false, ev10: false };
  const quien = id => (id ? N.nombreDe(id) || 'Usuario' : '');
  const deConcretos = ks => arr(ks).map(k => ({ volumen: num(k.volumen) || 0, fc: str(k.fc), clase: str(k.clase), edad: str(k.edad), tma: str(k.tma),
    revenimiento: str(k.revenimiento), colocacion: str(k.colocacion), aditivos: arr(k.aditivos).map(str).filter(Boolean), nota: str(k.nota) }));
  const deEvento = e => ({ fecha: e.fecha ? String(e.fecha).slice(0, 10) : '', hora: str(e.hora).slice(0, 5), elemento: str(e.elemento), ubicacion: str(e.ubicacion), concretos: deConcretos(e.concretos) });
  const deColado = c => ({
    id: c.id, obraId: c.obra_id, anio: c.anio, semana: c.semana, folio: str(c.folio), estado: c.estado,
    fecha: c.fecha ? String(c.fecha).slice(0, 10) : '', hora: str(c.hora).slice(0, 5), elemento: str(c.elemento), ubicacion: str(c.ubicacion),
    concretos: deConcretos(c.concretos),
    extra: arr(c.eventos_extra).map(deEvento),   // v0.12: eventos 2, 3…
    bombeo: c.bombeo || '', tuberiaM: c.tuberia_m, alturaM: c.altura_m, alcanceM: c.alcance_m, separacionMin: c.separacion_min,
    contacto: str(c.contacto), contactoTel: str(c.contacto_tel), acceso: str(c.acceso), checklist: obj(c.checklist), notas: str(c.notas),
    comentario: str(c.comentario_revision),
    creadaPorId: c.creada_por || '', creadaPor: quien(c.creada_por), creadaEn: c.creada_en,
    enviadaPor: quien(c.enviada_por), enviadaEn: c.enviada_en || '', devueltaPor: quien(c.devuelta_por), devueltaEn: c.devuelta_en || '',
    aprobadaPor: quien(c.aprobada_por), aprobadaEn: c.aprobada_en || '', canceladaPor: quien(c.cancelada_por), canceladaEn: c.cancelada_en || '',
    avisos: [], actualizadoEn: c.actualizado_en,
    // v0.11: confirmación con el proveedor y cierre
    confirmadoEn: c.confirmado_en || '', confirmadoPor: quien(c.confirmado_por),
    volumenReal: c.volumen_real == null ? null : num(c.volumen_real), ollas: c.ollas == null ? null : c.ollas, notaReal: str(c.nota_real),
    realizadoPor: quien(c.realizado_por), realizadoEn: c.realizado_en || ''
  });
  // v0.11: cotización de un colado (v0.12: solo se registran las aprobadas)
  const deCot = q => ({
    id: q.id, coladoId: q.colado_id, proveedorId: q.proveedor_id || '', proveedor: obj(q.proveedor), tipo: q.tipo, estado: q.estado,
    envios: arr(q.envios), lineas: arr(q.lineas).map(l => ({ concepto: str(l.concepto), volumen: num(l.volumen) || 0, precio: num(l.precio) || 0 })),
    bombeo: num(q.bombeo), otros: num(q.otros), subtotal: num(q.subtotal), total: num(q.total), vigencia: q.vigencia || '', condiciones: str(q.condiciones),
    archivos: arr(q.archivos), compraIds: arr(q.compra_ids), solicitadaEn: q.solicitada_en, solicitadaPor: quien(q.solicitada_por),
    recibidaEn: q.recibida_en || '', recibidaPor: quien(q.recibida_por), elegidaEn: q.elegida_en || '', elegidaPor: quien(q.elegida_por)
  });
  // Todos los eventos del colado (el 1 son las columnas de siempre)
  const eventosDe = c => [{ fecha: c.fecha, hora: c.hora, elemento: c.elemento, ubicacion: c.ubicacion, concretos: c.concretos }, ...arr(c.extra)];
  const volEv = e => e.concretos.reduce((a, k) => a + (k.volumen || 0), 0);
  const total = c => eventosDe(c).reduce((a, e) => a + volEv(e), 0);
  const nEv = c => 1 + arr(c.extra).length;
  const concretosTodos = c => eventosDe(c).flatMap(e => e.concretos);

  function ok({ data, error }) {
    if (error) {
      const m = String(error.message || '');
      if (/colados_folio/.test(m)) throw new Error('Ese folio ya existe; vuelve a intentarlo.');
      if (/eventos_extra/.test(m)) throw new Error('Para varios eventos falta correr supabase/10-colados-eventos.sql en Supabase.');
      throw new Error(N.traducir(error));
    }
    return data;
  }
  async function cargar(fresco) {
    // Obras, residentes, suplentes y compras: la copia del módulo de requisiciones (se recarga si hace falta)
    const s0 = R.snapshot();
    const s = s0.obras.length && !fresco ? s0 : await R.cargar().catch(() => s0);
    C.obras = s.obras;
    const [cs, ls, av, qs] = await Promise.all([
      sb().from('colados').select('*').order('fecha', { ascending: false }),
      sb().from('colado_listas').select('clave, valores'),
      sb().from('avisos').select('*').not('colado_id', 'is', null).order('en', { ascending: false }).then(r => r, () => ({ data: [] })),
      // v0.11 (09-colados-cotizaciones.sql); sin correrlo, la parte 1 sigue funcionando
      sb().from('colado_cotizaciones').select('*').order('solicitada_en').then(r => r, e => ({ data: null, error: e }))
    ]);
    if (cs.error) { C.listo = false; C.colados = []; C.error = cs.error.message; return C; }
    C.listo = true; C.error = '';
    C.colados = cs.data.map(deColado);
    C.ev10 = cs.data.some(r => 'eventos_extra' in r);   // v0.12: ¿ya se corrió 10-colados-eventos.sql?
    C.listas = {}; Object.keys(LISTAS).forEach(k => { C.listas[k] = []; });
    arr(ls.data).forEach(l => { C.listas[l.clave] = arr(l.valores); });
    C.parte2 = !qs.error;
    C.cots = C.parte2 ? arr(qs.data).map(deCot) : [];
    C.compras = R.snapshot().compras.filter(x => x.coladoId);
    arr(av.data).forEach(a => { const c = C.colados.find(x => x.id === a.colado_id); if (c) c.avisos.push({ evento: a.evento, en: a.en, para: arr(a.para) }); });
    return C;
  }
  const fila = c => ({
    anio: c.anio, semana: c.semana, folio: c.folio, fecha: c.fecha || null, hora: c.hora, elemento: str(c.elemento), ubicacion: str(c.ubicacion),
    concretos: c.concretos, bombeo: c.bombeo || '', tuberia_m: num(c.tuberiaM), altura_m: num(c.alturaM), alcance_m: num(c.alcanceM),
    eventos: nEv(c), separacion_min: num(c.separacionMin) != null ? Math.round(num(c.separacionMin)) : null,
    contacto: str(c.contacto), contacto_tel: str(c.contactoTel), acceso: str(c.acceso), checklist: c.checklist || {}, notas: str(c.notas),
    // v0.12: solo se manda si hay eventos extra o la columna ya existe (así funciona aunque falte 10-colados-eventos.sql)
    ...(arr(c.extra).length || C.ev10 ? { eventos_extra: arr(c.extra).map(e => ({ fecha: e.fecha || '', hora: e.hora || '', elemento: str(e.elemento), ubicacion: str(e.ubicacion), concretos: e.concretos })) } : {})
  });
  // Folio por obra y semana: EC469-C41-1, EC469-C41-2…
  const siguienteFolio = c => {
    const o = obra(c.obraId) || {};
    const base = `${(o.clave || 'OBRA').toUpperCase()}-C${c.semana}-`;
    const n = Math.max(0, ...C.colados.filter(x => x.obraId === c.obraId && x.id !== c.id && x.folio.startsWith(base)).map(x => parseInt(x.folio.slice(base.length), 10) || 0));
    return base + (n + 1);
  };
  async function guardar(c) {
    const prev = c.id && C.colados.find(x => x.id === c.id);
    if (!prev || prev.semana !== c.semana || prev.anio !== c.anio) c.folio = siguienteFolio(c);
    else c.folio = prev.folio;
    if (prev) {
      const filas = ok(await sb().from('colados').update(fila(c)).eq('id', c.id).select('id'));
      if (!filas.length) throw new Error('No tienes permiso para modificar este colado.');
      return c.id;
    }
    c.id = R.uid();
    ok(await sb().from('colados').insert(Object.assign({ id: c.id, obra_id: c.obraId }, fila(c))).select('id'));
    return c.id;
  }
  async function cambiarEstado(id, estado, comentario) {
    const f = { estado };
    if (comentario != null) f.comentario_revision = str(comentario);
    const filas = ok(await sb().from('colados').update(f).eq('id', id).select('id'));
    if (!filas.length) throw new Error('No tienes permiso para este cambio.');
  }
  async function borrar(id) {
    const filas = ok(await sb().from('colados').delete().eq('id', id).select('id'));
    if (!filas.length) throw new Error('Solo se borran solicitudes en borrador.');
  }
  // Agrega una opción leyendo la lista del servidor (para no pisar lo que otro agregó)
  async function agregarOpcion(clave, valor) {
    const v = str(valor); if (!v) return;
    const [l] = ok(await sb().from('colado_listas').select('valores').eq('clave', clave));
    const vals = arr(l && l.valores);
    if (vals.some(x => x.toLowerCase() === v.toLowerCase())) return;
    const filas = ok(await sb().from('colado_listas').update({ valores: [...vals, v] }).eq('clave', clave).select('clave'));
    if (!filas.length) throw new Error('No se pudo agregar la opción.');
    C.listas[clave] = [...vals, v];
  }
  async function guardarLista(clave, valores) {
    const filas = ok(await sb().from('colado_listas').update({ valores }).eq('clave', clave).select('clave'));
    if (!filas.length) throw new Error('Tu rol no puede editar esta lista.');
  }
  async function avisar(id, evento) {
    try {
      const { data, error } = await sb().functions.invoke('aviso-colado', { body: { colado_id: id, evento } });
      if (error) {
        let msg = ''; try { msg = (await error.context.json()).error; } catch (e) { /* sin cuerpo */ }
        throw new Error(msg || 'No se pudo enviar el correo (¿está publicada la función "aviso-colado" en Supabase?).');
      }
      toast(`Correo enviado a ${data.aviso.para.map(p => p.nombre || p.correo).join(', ')}.`);
      await cargar();
      if (location.hash === '#/col/' + id || location.hash === '#/colados') api.rerender();
    } catch (e) {
      toast(`El cambio quedó guardado, pero no salió el correo: ${e.message}`);
    }
  }
  async function hacer(fn, msgOk) {
    try { await fn(); } catch (e) { toast(e.message); await cargar(); return false; }
    await cargar();
    if (msgOk) toast(msgOk);
    return true;
  }

  /* ---------- Permisos (la base los vuelve a revisar) ---------- */
  const rol = () => (N.perfil || {}).rol;
  const yoId = () => (N.perfil || {}).id;
  const esJefe = () => ['direccion', 'admin'].includes(rol());
  const esCoord = () => esJefe() || rol() === 'coordinador';
  const editaListas = () => esCoord() || rol() === 'compras';
  const obra = id => C.obras.find(o => o.id === id);
  const esResDe = id => {
    if (rol() === 'consulta') return false;   // el iPad de consulta nunca captura, aunque lo asignen a una obra por error
    const o = obra(id); if (!o) return false;
    if (o.residenteId && o.residenteId === yoId()) return true;
    const h = today();
    return o.suplentes.some(s => s.perfilId === yoId() && s.desde <= h && h <= s.hasta);
  };
  const puedeEditar = id => esCoord() || esResDe(id);
  const obrasCaptura = () => C.obras.filter(o => o.estatus !== 'cerrada' && puedeEditar(o.id));
  const editable = c => puedeEditar(c.obraId) && ['borrador', 'devuelta'].includes(c.estado);
  const esAdmin = () => rol() === 'admin';   // v0.12: el admin técnico corrige un colado en cualquier estado

  /* ---------- Página: lista por semana ---------- */
  const UI = Object.assign({ est: 'todos', obra: '' }, (() => { try { return JSON.parse(sessionStorage.getItem('galitha.col.ui')) || {}; } catch { return {}; } })());
  const saveUI = () => { try { sessionStorage.setItem('galitha.col.ui', JSON.stringify(UI)); } catch { /* sin acceso */ } };
  const FILTROS = [['todos', 'Todos'], ['borrador', 'Borradores'], ['enviada', 'Por aprobar'], ['devuelta', 'Devueltos'], ['aprobada', 'Aprobados'], ['realizado', 'Realizados'], ['cancelada', 'Cancelados']];

  function sinTabla() {
    return { title: 'Programación de colados', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div>
      <h2 class="h2">Falta preparar el servidor</h2><p class="muted">Para usar la programación de colados hay que correr <span class="mono">supabase/08-colados.sql</span> en Supabase.</p></div></section>`, bind() { } };
  }

  async function pageColados() {
    await cargar();
    if (!C.listo) return sinTabla();
    const vis = C.colados.filter(c => !UI.obra || c.obraId === UI.obra);
    const lista = vis.filter(c => UI.est === 'todos' || c.estado === UI.est);
    const n = e => vis.filter(c => c.estado === e).length;
    const obrasV = [...new Set(C.colados.map(c => c.obraId))].map(obra).filter(Boolean);
    const proximos = vis.filter(c => c.estado === 'aprobada' && c.fecha >= today()).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    const porWk = {};
    lista.forEach(c => { (porWk[wkKey(c)] = porWk[wkKey(c)] || []).push(c); });
    let di = 0;
    const grupos = Object.keys(porWk).sort((a, b) => b - a).map(k => {
      const cs = porWk[k].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)), w = { anio: Math.floor(k / 100), semana: k % 100 };
      return `<section class="ogroup">
        <div class="ogroup-h rv" style="--d:${Math.min(di++ * 40, 400)}"><div><h2>Semana ${w.semana}</h2><p class="sub">${esc(wkRange(w))} · ${cs.length} ${cs.length === 1 ? 'colado' : 'colados'} · ${m3(cs.filter(c => c.estado !== 'cancelada').reduce((a, c) => a + total(c), 0))}</p></div></div>
        <div class="col-list">${cs.map(c => tarjeta(c, Math.min(di++ * 30, 500))).join('')}</div>
      </section>`;
    }).join('');
    return {
      title: 'Programación de colados',
      html: `<section class="page">
        <header class="page-head rv"><div><p class="eyebrow">Concreto premezclado y bombeo, por obra y semana</p><h1 class="title">Programación de colados</h1></div>
          <div class="col-hb">${editaListas() ? `<button class="tbtn" type="button" data-listas>${I.listas || I.list}<span>Listas de opciones</span></button>` : ''}</div></header>
        <div class="note note--info note--ayuda rv" style="--d:60">${I.colado}<p>${rol() === 'compras' ? 'Aquí aparecen los colados que el coordinador ya aprobó. Manda la solicitud a los proveedores y registra la cotización que apruebe Dirección.'
          : 'El residente arma la solicitud y la guarda como <b>borrador</b>; cuando está seguro, la <b>envía al coordinador</b>, que la aprueba o la devuelve. Ya aprobada, compras pide las cotizaciones.'}</p></div>
        ${proximos.length ? `<div class="col-prox rv" style="--d:80"><b>${I.cal}Próximos colados aprobados</b>${proximos.slice(0, 4).map(c => `<a href="#/col/${esc(c.id)}"><span>${esc(fDateL(c.fecha))}${c.hora ? ' · ' + esc(c.hora) : ''}</span><em>${esc((obra(c.obraId) || {}).nombre || '')} · ${esc(c.elemento || 'Colado')} · ${m3(total(c))}</em></a>`).join('')}</div>` : ''}
        <div class="filterbar rv" style="--d:100">
          <div class="seg" role="group" aria-label="Estado">${FILTROS.filter(([k]) => k === 'todos' || n(k) || UI.est === k).map(([k, l]) => `<button type="button" data-est="${k}" aria-pressed="${UI.est === k}">${l}${k !== 'todos' ? ` <b>${n(k)}</b>` : ''}</button>`).join('')}</div>
          ${obrasV.length > 1 ? `<span class="fb-sep"></span><label class="psel${UI.obra ? ' on' : ''}"><span class="sr">Obra</span><select data-obra-f><option value="">Obra: todas</option>${obrasV.map(o => `<option value="${esc(o.id)}"${UI.obra === o.id ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>` : ''}
        </div>
        ${grupos || `<div class="empty empty--sm"><p class="h3">${vis.length ? 'Nada con este filtro' : 'Todavía no hay colados'}</p><p class="muted small">${obrasCaptura().length ? 'Usa <b>Nuevo colado</b> para armar la primera solicitud.' : 'El residente de cada obra arma sus solicitudes de colado.'}</p></div>`}
      </section>`,
      bind(sec) {
        $$('[data-est]', sec).forEach(b => b.addEventListener('click', () => { UI.est = b.dataset.est; saveUI(); api.rerender(); }));
        const so = $('[data-obra-f]', sec); if (so) so.addEventListener('change', () => { UI.obra = so.value; saveUI(); api.rerender(); });
        const bl = $('[data-listas]', sec); if (bl) bl.addEventListener('click', drListas);
        $$('[data-href]', sec).forEach(el => {
          el.addEventListener('click', e => { if (e.target.closest('a, button')) return; location.hash = el.dataset.href; });
          el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === el) location.hash = el.dataset.href; });
        });
      }
    };
  }
  // v0.11: en qué va la compra de un colado aprobado
  function chipCot(c) {
    if (c.estado !== 'aprobada' || !C.parte2) return '';
    const el = elegidas(c);
    if (el.length) return `<span class="tagx tagx--ok">${esc(el.map(q => nombreProv(q.proveedorId, q)).join(' + '))}${c.confirmadoEn ? ' · confirmado' : ''}</span>`;
    return soloResidente() ? '' : '<span class="tagx tagx--wait">Sin cotización aprobada</span>';
  }
  function tarjeta(c, d) {
    const o = obra(c.obraId) || {};
    return `<article class="card colcard rv" style="--d:${d}" data-href="#/col/${esc(c.id)}" tabindex="0">
      <div class="col-dia"><b>${c.fecha ? toDate(c.fecha).getDate() : '—'}</b><small>${c.fecha ? DIA[toDate(c.fecha).getDay()].slice(0, 3) : 'sin fecha'}</small>${c.hora ? `<em>${esc(c.hora)}</em>` : ''}</div>
      <div class="col-main">
        <a class="pname" href="#/col/${esc(c.id)}">${esc(c.elemento || 'Colado sin elemento')}${c.ubicacion ? ' · ' + esc(c.ubicacion) : ''}</a>
        <span class="sub">${esc(o.nombre || '')} · ${esc(c.folio)} · ${esc(BOMBEO[c.bombeo])}${nEv(c) > 1 ? ` · <b>${nEv(c)} eventos</b> (también ${c.extra.map(e => esc(fDate(e.fecha))).join(', ')})` : ''}</span>
        <p class="col-conc">${concretosTodos(c).map(k => `<span>${esc([k.fc && "f'c " + k.fc, k.tma, k.revenimiento && 'rev. ' + k.revenimiento].filter(Boolean).join(' · ') || 'Concreto')} <b>${m3(k.volumen)}</b></span>`).join('') || '<span class="muted">Sin concretos todavía</span>'}</p>
        ${c.estado === 'devuelta' && c.comentario ? `<p class="k-rej">${I.alert}<span>${esc(c.comentario)}</span></p>` : ''}
      </div>
      <div class="col-side"><b>${m3(total(c))}</b>${tag(c)}${chipCot(c)}</div>
    </article>`;
  }

  /* ---------- Detalle ---------- */
  const listaK = k => `<li><b class="col-kv">${m3(k.volumen)}</b><div><div class="col-chips">${[k.fc && "f'c " + k.fc, k.clase && 'Clase ' + k.clase, k.edad, k.tma && 'TMA ' + k.tma, k.revenimiento && 'Rev. ' + k.revenimiento, k.colocacion, ...k.aditivos].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('') || '<span class="muted">Sin especificar</span>'}</div>${k.nota ? `<small class="muted">${esc(k.nota)}</small>` : ''}</div></li>`;
  async function pageColado({ id }) {
    await cargar(true);
    if (!C.listo) return sinTabla();
    const c = C.colados.find(x => x.id === id);
    if (!c) return { title: 'No encontrado', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">Colado no encontrado</h2><p class="muted">No existe, se borró o tu rol no lo puede ver.</p><a class="btn" href="#/colados"><span>Programación de colados</span>${api.ARR}</a></div></section>`, bind() { } };
    const o = obra(c.obraId) || {}, ed = editable(c), coord = esCoord();
    const dl = filas => `<dl class="dl">${filas.filter(f => f[1] !== '' && f[1] != null).map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
    const ultimo = c.avisos.find(a => a.evento === c.estado);
    const acts = [
      ed ? `<button class="btn btn--solid" type="button" data-enviar>${I.send}<span>Enviar al coordinador</span></button>` : '',
      ed ? `<button class="btn" type="button" data-editar>${I.edit}<span>Editar</span></button>` : '',
      !ed && esAdmin() ? `<button class="btn" type="button" data-corregir title="Corrección del admin técnico: no cambia el estado y queda en la bitácora">${I.edit}<span>Corregir</span></button>` : '',
      coord && c.estado === 'enviada' ? `<button class="btn btn--solid" type="button" data-aprobar>${I.check}<span>Aprobar</span></button><button class="btn" type="button" data-devolver>${I.undo}<span>Devolver para corregir</span></button>` : '',
      esComprasR() && C.parte2 && c.estado === 'aprobada' ? `<button class="btn${elegidas(c).length ? '' : ' btn--solid'}" type="button" data-pedir>${I.send}<span>Mandar solicitud a proveedores</span></button>` : '',
      puedeCerrar(c) ? `<button class="btn${esComprasR() ? '' : ' btn--solid'}" type="button" data-cerrar>${I.check}<span>Registrar colado realizado</span></button>` : '',
      `<button class="btn" type="button" data-pdf>${I.print}<span>PDF${['aprobada', 'realizado'].includes(c.estado) ? '' : ' (vista previa)'}</span></button>`,
      coord && ['enviada', 'aprobada'].includes(c.estado) ? `<button class="btn btn--danger" type="button" data-cancelar>${I.close}<span>Cancelar colado</span></button>` : '',
      c.estado === 'borrador' && puedeEditar(c.obraId) ? `<button class="ibtn ibtn--line" type="button" data-borrar title="Borrar borrador" aria-label="Borrar borrador">${I.trash}</button>` : ''
    ].join('');
    const hist = [
      ['Capturó', c.creadaPor && `${esc(c.creadaPor)}${c.creadaEn ? ' · ' + esc(fDateT(c.creadaEn)) : ''}`],
      ['Envió', c.enviadaEn && `${esc(c.enviadaPor)} · ${esc(fDateT(c.enviadaEn))}`],
      ['Devolvió', c.devueltaEn && `${esc(c.devueltaPor)} · ${esc(fDateT(c.devueltaEn))}`],
      ['Aprobó', c.aprobadaEn && `${esc(c.aprobadaPor)} · ${esc(fDateT(c.aprobadaEn))}`],
      ['Canceló', c.canceladaEn && `${esc(c.canceladaPor)} · ${esc(fDateT(c.canceladaEn))}`]
    ].filter(x => x[1]);
    return {
      title: c.folio || 'Colado',
      html: `<section class="page">
        <a class="back rv" href="#/colados">${I.back}<span>Programación de colados</span></a>
        <header class="d-hero rv" style="--d:30"><div class="d-top">
          <span class="av av--xl col-av">${I.colado}</span>
          <div class="d-title"><div class="d-tags">${tag(c)}<span class="tagx">${esc(c.folio)}</span></div>
            <h1 class="title title--d">${esc(c.elemento || 'Colado')}${c.ubicacion ? ' · ' + esc(c.ubicacion) : ''}</h1>
            <p class="d-sub"><span>${esc(o.nombre || '')}</span><span>Semana ${c.semana}</span><span>${esc(fDateL(c.fecha))}${c.hora ? ' · ' + esc(c.hora) + ' h' : ''}</span></p></div>
          <div class="d-money"><div class="big-money">${m3(total(c))}</div><small>${nEv(c) > 1 ? nEv(c) + ' eventos' : concretosTodos(c).length === 1 ? '1 concreto' : concretosTodos(c).length + ' concretos'} · ${esc(BOMBEO[c.bombeo])}</small></div>
        </div></header>
        ${c.estado === 'devuelta' && c.comentario ? `<div class="note rv" style="--d:40">${I.undo}<p><b>${esc(c.devueltaPor || 'El coordinador')} lo devolvió para corregir:</b> ${esc(c.comentario)}</p></div>` : ''}
        ${c.estado === 'cancelada' ? `<div class="note note--bad rv" style="--d:40">${I.alert}<p><b>Colado cancelado por ${esc(c.canceladaPor)}.</b> ${esc(c.comentario)}</p></div>` : ''}
        <div class="c-acts rv" style="--d:50">${acts}</div>
        ${ultimo ? `<p class="k-aviso col-sec rv">${I.mail}<span>Correo ${c.estado === 'enviada' ? 'al coordinador' : 'enviado'} · ${esc(ultimo.para.map(p => p.nombre || p.correo).join(', '))} · ${esc(fDateT(ultimo.en))}</span></p>` : ''}
        ${seccionCotizaciones(c)}
        <div class="d-grid">
          <div class="d-main">
            <section class="panel rv" style="--d:80"><header class="panel-h"><h2>${nEv(c) > 1 ? 'Eventos' : 'Concreto'} <span class="n">${nEv(c) > 1 ? nEv(c) : c.concretos.length}</span></h2></header>
              <div class="panel-b">${eventosDe(c).map((e, i) => `${nEv(c) > 1 ? `<p class="col-ev-t"><b>Evento ${i + 1} · ${esc(fDateL(e.fecha))}${e.hora ? ' · ' + esc(e.hora) + ' h' : ''}</b><span>${esc([e.elemento, e.ubicacion].filter(Boolean).join(' · '))} · ${m3(volEv(e))}</span></p>` : ''}
                <ul class="col-kl">${e.concretos.map(listaK).join('') || '<li class="muted">Sin concretos todavía.</li>'}</ul>`).join('')}
              ${concretosTodos(c).length > 1 ? `<p class="col-tot">Total <b>${m3(total(c))}</b></p>` : ''}</div>
            </section>
            <section class="panel rv" style="--d:120"><header class="panel-h"><h2>Bombeo y logística</h2></header><div class="panel-b">
              ${dl([['Bombeo', esc(BOMBEO[c.bombeo])], ['Tubería', c.tuberiaM != null ? esc(c.tuberiaM) + ' m' : ''], ['Alcance de la pluma', c.alcanceM != null ? esc(c.alcanceM) + ' m' : ''],
                ['Altura a bombear', c.alturaM != null ? esc(c.alturaM) + ' m' : ''], ['Separación entre ollas', c.separacionMin != null ? esc(c.separacionMin) + ' min' : ''],
                ['Recibe en obra', esc([c.contacto, c.contactoTel].filter(Boolean).join(' · '))], ['Dirección', esc(o.direccion || '')], ['Acceso y referencias', esc(c.acceso)], ['Notas', esc(c.notas)]])}
            </div></section>
          </div>
          <aside class="d-side">
            ${seccionConfirmacion(c)}
            ${seccionCierre(c)}
            <section class="panel rv" style="--d:140"><header class="panel-h"><h2>Obra lista</h2></header><div class="panel-b">
              <ul class="checks">${CHECK.map(([k, t]) => `<li class="${c.checklist[k] ? 'ok' : 'meh'}">${I[c.checklist[k] ? 'okc' : 'clock']}<span>${esc(t)}</span></li>`).join('')}</ul>
            </div></section>
            <section class="panel rv" style="--d:180"><header class="panel-h"><h2>Historial</h2></header><div class="panel-b">${dl(hist)}</div></section>
          </aside>
        </div>
      </section>`,
      bind(sec) {
        const on = (sel, fn) => { const b = $(sel, sec); if (b) b.addEventListener('click', fn); };
        on('[data-editar]', () => drColado(c));
        on('[data-corregir]', () => drColado(c, { correccion: true }));
        on('[data-pdf]', () => imprimir(c));
        on('[data-enviar]', async () => {
          const falta = faltantes(c);
          if (falta.length) { toast('Antes de enviar falta: ' + falta.join(', ') + '.'); return drColado(c); }
          if (!(await api.confirmar({ titulo: 'Enviar al coordinador', texto: `Se enviará <b>${esc(c.folio)}</b> (${m3(total(c))}) para su aprobación. Ya no podrás modificarla, salvo que te la devuelva.`, ok: 'Enviar' }))) return;
          if (await hacer(() => cambiarEstado(c.id, 'enviada'), 'Colado enviado al coordinador.')) { api.rerender(); avisar(c.id, 'enviada'); }
        });
        on('[data-aprobar]', async () => {
          if (!(await api.confirmar({ titulo: 'Aprobar colado', texto: `<b>${esc(c.folio)}</b> · ${m3(total(c))} · ${esc(fDateL(c.fecha))}. Compras podrá pedir las cotizaciones.`, ok: 'Aprobar' }))) return;
          if (await hacer(() => cambiarEstado(c.id, 'aprobada'), 'Colado aprobado.')) { api.rerender(); avisar(c.id, 'aprobada'); }
        });
        on('[data-devolver]', async () => {
          const m = await api.preguntar({ titulo: 'Devolver para corregir', texto: esc(c.folio), etiqueta: 'Qué hay que corregir (lo verá el residente)', campo: 'area', ok: 'Devolver', requerido: true });
          if (m != null && await hacer(() => cambiarEstado(c.id, 'devuelta', m), 'Colado devuelto al residente.')) { api.rerender(); avisar(c.id, 'devuelta'); }
        });
        on('[data-cancelar]', async () => {
          const m = await api.preguntar({ titulo: 'Cancelar colado', texto: `${esc(c.folio)} · ${esc(fDateL(c.fecha))}. Si ya se pidió al proveedor, avísale a tiempo para evitar cargos.`, etiqueta: 'Motivo de la cancelación', campo: 'area', ok: 'Cancelar colado', requerido: true, peligro: true });
          if (m != null && await hacer(() => cambiarEstado(c.id, 'cancelada', m), 'Colado cancelado.')) { api.rerender(); avisar(c.id, 'cancelada'); }
        });
        on('[data-pedir]', () => drPedir(c));
        on('[data-cerrar]', () => drCerrar(c));
        on('[data-cot-nueva]', () => drCotizacion(c, null));
        on('[data-confirmar]', async () => {
          const si = !c.confirmadoEn;
          if (si && !(await api.confirmar({ titulo: 'Confirmado con el proveedor', texto: 'Marca que ya confirmaste el pedido (fecha, hora, volumen y bombeo) con el proveedor elegido.', ok: 'Marcar confirmado' }))) return;
          if (await hacer(() => confirmar(c.id, si), si ? 'Pedido marcado como confirmado.' : 'Se quitó la confirmación.')) api.rerender();
        });
        $$('[data-cot]', sec).forEach(b => b.addEventListener('click', () => accionCot(c, C.cots.find(q => q.id === b.dataset.cot), b.dataset.acc)));
        $$('[data-ruta]', sec).forEach(b => b.addEventListener('click', () => abrirArchivo(b.dataset.ruta)));
        on('[data-borrar]', async () => {
          if (!(await api.confirmar({ titulo: 'Borrar borrador', texto: `Se borrará <b>${esc(c.folio)}</b>. No se puede deshacer.`, ok: 'Borrar', peligro: true }))) return;
          if (await hacer(() => borrar(c.id), 'Borrador borrado.')) location.hash = '#/colados';
        });
      }
    };
  }
  // Lo mínimo para enviar (la base revisa fecha y volúmenes)
  const faltantes = c => {
    const evs = eventosDe(c), en = (i, t) => (evs.length > 1 ? `${t} del evento ${i + 1}` : t);
    return [...evs.flatMap((e, i) => [!e.fecha && en(i, 'la fecha'), !e.elemento && en(i, 'el elemento a colar'), !e.concretos.length && en(i, 'el concreto'),
      e.concretos.some(k => !(k.volumen > 0)) && en(i, 'el volumen de cada concreto'), e.concretos.some(k => !k.fc) && en(i, "la resistencia (f'c)")]),
      !c.bombeo && 'el tipo de bombeo'].filter(Boolean);
  };

  /* ---------- Formulario ---------- */
  // Desplegable con opciones de la lista + valor actual + "Agregar opción…"
  const selLista = (clave, name, valor, extra = '') => {
    const ops = [...new Set([...(C.listas[clave] || []), valor].filter(Boolean))];
    return `<select class="in" name="${name}" data-lista="${clave}"${extra}><option value="">${(C.listas[clave] || []).length ? 'Elige…' : 'Sin opciones: agrega una'}</option>${ops.map(v => `<option${v === valor ? ' selected' : ''}>${esc(v)}</option>`).join('')}<option value="__nueva">＋ Agregar opción…</option></select>`;
  };
  const bloqueConcreto = (k, i) => `<div class="col-k" data-k>
    <div class="col-k-h"><b>Concreto <span data-kn>${i + 1}</span></b><button type="button" class="ibtn" data-quitar-k title="Quitar este concreto" aria-label="Quitar este concreto">${I.trash}</button></div>
    <div class="grid2 grid3">
      <label class="fld"><span class="fld-l">Volumen (m³) <em>*</em></span><input class="in" name="volumen" type="number" min="0" step="0.5" inputmode="decimal" value="${k.volumen || ''}"></label>
      <label class="fld"><span class="fld-l">Resistencia (f'c) <em>*</em></span>${selLista('resistencias', 'fc', k.fc)}</label>
      <label class="fld"><span class="fld-l">Clase</span><select class="in" name="clase"><option value="">—</option>${['1', '2'].map(v => `<option value="${v}"${k.clase === v ? ' selected' : ''}>Clase ${v}${v === '1' ? ' (estructural)' : ''}</option>`).join('')}</select></label>
      <label class="fld"><span class="fld-l">Edad de la resistencia</span>${selLista('edades', 'edad', k.edad)}</label>
      <label class="fld"><span class="fld-l">TMA (grava)</span>${selLista('tmas', 'tma', k.tma)}</label>
      <label class="fld"><span class="fld-l">Revenimiento</span>${selLista('revenimientos', 'rev', k.revenimiento)}</label>
      <label class="fld"><span class="fld-l">Colocación</span><select class="in" name="colocacion"><option value="">—</option>${COLOCACION.map(v => `<option${k.colocacion === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="fld fld--wide2"><span class="fld-l">Nota de este concreto</span><input class="in" name="knota" value="${esc(k.nota)}" placeholder="Ej. para columnas, con fibra…"></label>
    </div>
    <div class="fld"><span class="fld-l">Aditivos y especiales</span><div class="toggles" data-aditivos>${chipsAditivos(k.aditivos)}</div></div>
  </div>`;
  const chipsAditivos = sel => [...new Set([...(C.listas.aditivos || []), ...sel])].map(v => `<label class="chk chk--pill"><input type="checkbox" value="${esc(v)}"${sel.includes(v) ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')
    + `<button type="button" class="tbtn tbtn--sm" data-add-aditivo>${I.plus}<span>Agregar</span></button>`;

  // v0.12: un bloque por evento (fecha, hora, elemento, ubicación y sus concretos)
  const KVACIO = () => ({ volumen: 0, fc: '', clase: '1', edad: '', tma: '', revenimiento: '', colocacion: 'Bombeable', aditivos: [], nota: '' });
  const bloqueEvento = (e, i) => `<div class="col-ev" data-ev>
    <div class="col-ev-h"><b data-evt>${i ? 'Evento ' + (i + 1) : 'Evento 1'}</b>${i ? `<button type="button" class="tbtn tbtn--sm" data-quitar-ev>${I.trash}<span>Quitar este evento</span></button>` : ''}</div>
    <div class="grid2">
      <label class="fld"><span class="fld-l">Fecha <em>*</em></span><input class="in" name="fecha" type="date" value="${esc(e.fecha || '')}">${i ? '' : '<span class="fld-h" data-sem></span>'}</label>
      <label class="fld"><span class="fld-l">Hora de inicio</span><input class="in" name="hora" type="time" value="${esc(e.hora || '')}"></label>
      <label class="fld"><span class="fld-l">Elemento a colar <em>*</em></span>${selLista('elementos', 'elemento', e.elemento)}</label>
      <label class="fld"><span class="fld-l">Nivel, ejes o zona</span><input class="in" name="ubicacion" value="${esc(e.ubicacion || '')}" placeholder="Ej. Nivel 3, ejes A-D / 1-4"></label>
    </div>
    <div data-concretos>${(e.concretos.length ? e.concretos : [KVACIO()]).map(bloqueConcreto).join('')}</div>
    <button type="button" class="btn btn--sm" data-add-k>${I.plus}<span>Agregar otro concreto</span></button>
  </div>`;

  async function drColado(c0, { correccion = false } = {}) {
    await cargar();
    if (!C.listo) { toast('Falta correr 08-colados.sql en Supabase.'); return; }
    if (correccion && !(c0 && esAdmin())) { toast('Solo el admin técnico corrige colados ya enviados.'); return; }
    const nuevo = !c0;
    const obras = nuevo ? obrasCaptura() : [obra(c0.obraId)].filter(Boolean);
    if (!obras.length) { toast('Solo el residente de una obra (o el coordinador) capturan colados.'); return; }
    const o0 = obras[0], res = (o0 && o0.residente) || {};
    const c = c0 ? JSON.parse(JSON.stringify(c0)) : { obraId: o0.id, fecha: '', hora: '07:00', elemento: '', ubicacion: '', concretos: [KVACIO()], extra: [],
      bombeo: '', tuberiaM: null, alturaM: null, alcanceM: null, separacionMin: null, contacto: res.nombre || '', contactoTel: res.telefono || '', acceso: '', checklist: {}, notas: '' };
    const v = x => (x == null ? '' : esc(x));
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">Programación de colados${c0 ? ' · ' + esc(c0.folio) : ''}</p><h2 id="dr-title">${nuevo ? 'Nuevo colado' : correccion ? 'Corregir colado' : 'Editar colado'}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        ${correccion ? `<div class="note note--info">${I.edit}<p>Corrección del admin técnico: el colado se queda <b>${esc((ESTADOS[c0.estado] || {}).label || '')}</b>, no se manda aviso y el cambio queda en la bitácora.${c0.estado === 'aprobada' && elegidas(c0).length ? ' Ya tiene cotización registrada: si cambias volúmenes o fechas, revisa la compra.' : ''}</p></div>` : ''}
        ${c0 && c0.estado === 'devuelta' && c0.comentario ? `<div class="note">${I.undo}<p><b>Qué hay que corregir:</b> ${esc(c0.comentario)}</p></div>` : ''}
        <fieldset class="fs"><legend><span class="mono">1</span>Qué y cuándo</legend><div class="fs-b">
          <label class="fld"><span class="fld-l">Obra</span><select class="in" name="obra"${nuevo && obras.length > 1 ? '' : ' disabled'}>${obras.map(o => `<option value="${esc(o.id)}"${o.id === c.obraId ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>
          <div data-eventos>${eventosDe(c).map(bloqueEvento).join('')}</div>
          <button type="button" class="btn btn--sm" data-add-ev>${I.plus}<span>Agregar otro evento</span></button>
          <p class="fld-h">Si el colado se hace en varios días o etapas, agrega un evento por cada uno: todos salen en la misma solicitud para el proveedor. Si un evento lleva concretos distintos (por ejemplo, grava de 20 mm para la losa y de 10 mm para columnas), agrega uno por cada tipo. <b data-total></b></p>
          <label class="fld"><span class="fld-l">Separación entre ollas (min)</span><input class="in" name="separacion" type="number" min="0" step="5" value="${v(c.separacionMin)}"><span class="fld-h">El proveedor da 30 min de muestreo + 10 de descarga.</span></label>
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Bombeo</legend><div class="fs-b">
          <div class="toggles">${Object.entries(BOMBEO).filter(([k]) => k).map(([k, l]) => `<label class="chk chk--pill"><input type="radio" name="bombeo" value="${k}"${c.bombeo === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="grid2 grid3" style="margin-top:12px">
            <label class="fld" data-b="estacionaria"><span class="fld-l">Tubería (m)</span><input class="in" name="tuberia" type="number" min="0" step="1" value="${v(c.tuberiaM)}"><span class="fld-h">Horizontal más vertical.</span></label>
            <label class="fld" data-b="pluma"><span class="fld-l">Alcance de la pluma (m)</span><input class="in" name="alcance" type="number" min="0" step="1" value="${v(c.alcanceM)}"></label>
            <label class="fld" data-b="estacionaria pluma"><span class="fld-l">Altura a bombear (m)</span><input class="in" name="altura" type="number" min="0" step="0.5" value="${v(c.alturaM)}"></label>
          </div>
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">3</span>En obra</legend><div class="fs-b"><div class="grid2">
          <label class="fld"><span class="fld-l">Quién recibe</span><input class="in" name="contacto" value="${v(c.contacto)}"></label>
          <label class="fld"><span class="fld-l">Teléfono</span><input class="in" name="tel" type="tel" value="${v(c.contactoTel)}"></label>
          <label class="fld fld--wide"><span class="fld-l">Acceso y referencias</span><textarea class="in" name="acceso" rows="2" placeholder="Descarga en calle o banqueta, cables cerca, pendiente, horario de la calle…">${v(c.acceso)}</textarea></label>
          <div class="fld fld--wide"><span class="fld-l">Obra lista para el colado</span><div class="col-check">${CHECK.map(([k, t]) => `<label class="chk chk--wa"><input type="checkbox" name="ck" value="${k}"${c.checklist[k] ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></div>
          <label class="fld fld--wide"><span class="fld-l">Notas</span><textarea class="in" name="notas" rows="2">${v(c.notas)}</textarea></label>
        </div></div></fieldset>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p>${correccion
        ? `<button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.check}<span>Guardar corrección</span></button>`
        : `<button type="button" class="btn" data-borrador>${I.draft}<span>Guardar borrador</span></button><button type="submit" class="btn btn--solid" data-ok>${I.send}<span>Guardar y enviar</span></button>`}</footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), evs = $('[data-eventos]', panel);
      f.addEventListener('input', api.markDirty);
      const bloques = () => $$('[data-ev]', evs);
      const fecha1 = () => $('[name=fecha]', bloques()[0]).value;
      const semana = () => isoWeek(toDate(fecha1()) || new Date());
      const pintarSem = () => { const w = semana(); $('[data-sem]', panel).textContent = `Semana ${w.semana} · ${wkRange(w)}`; };
      const leerK = b => $$('[data-k]', $('[data-concretos]', b)).map(k => ({
        volumen: num($('[name=volumen]', k).value) || 0, fc: $('[name=fc]', k).value, clase: $('[name=clase]', k).value, edad: $('[name=edad]', k).value,
        tma: $('[name=tma]', k).value, revenimiento: $('[name=rev]', k).value, colocacion: $('[name=colocacion]', k).value,
        aditivos: $$('[data-aditivos] input:checked', k).map(i => i.value), nota: $('[name=knota]', k).value.trim()
      }));
      const sinNueva = x => (x === '__nueva' ? '' : x);
      const leerEv = b => ({ fecha: $('[name=fecha]', b).value, hora: $('[name=hora]', b).value, elemento: sinNueva($('[name=elemento]', b).value),
        ubicacion: $('[name=ubicacion]', b).value.trim(), concretos: leerK(b).map(k => Object.assign(k, { fc: sinNueva(k.fc), edad: sinNueva(k.edad), tma: sinNueva(k.tma), revenimiento: sinNueva(k.revenimiento) })) });
      const renum = () => bloques().forEach((b, i) => { $('[data-evt]', b).textContent = 'Evento ' + (i + 1); $$('[data-kn]', b).forEach((s0, j) => { s0.textContent = j + 1; }); });
      const pintarTotal = () => {
        const xs = bloques().map(leerEv), t = xs.reduce((a, e) => a + volEv(e), 0);
        $('[data-total]', panel).textContent = t ? `Total: ${m3(t)}${xs.length > 1 ? ` en ${xs.length} eventos` : ''}.` : '';
      };
      const bombeoVis = () => { const b = (f.querySelector('[name=bombeo]:checked') || {}).value || ''; $$('[data-b]', panel).forEach(el => { el.hidden = !el.dataset.b.split(' ').includes(b); }); };
      pintarSem(); pintarTotal(); bombeoVis();
      // Al cambiar de obra (captura nueva), propone al residente de esa obra como quien recibe
      if (nuevo && obras.length > 1) f.obra.addEventListener('change', () => {
        const r0 = (obra(c.obraId) || {}).residente || {}, r1 = (obra(f.obra.value) || {}).residente || {};
        if (!f.contacto.value.trim() || f.contacto.value.trim() === (r0.nombre || '')) { f.contacto.value = r1.nombre || ''; f.tel.value = r1.telefono || ''; }
        c.obraId = f.obra.value;
      });
      f.addEventListener('change', e => {
        if (e.target.name === 'bombeo') bombeoVis();
        if (e.target.name === 'fecha' && bloques()[0].contains(e.target)) pintarSem();
        if (e.target.name === 'volumen') pintarTotal();
      });
      evs.addEventListener('input', e => { if (e.target.name === 'volumen') pintarTotal(); });
      // "＋ Agregar opción…" en cualquier desplegable de lista
      panel.addEventListener('change', async e => {
        const s = e.target.closest('select[data-lista]'); if (!s || s.value !== '__nueva') return;
        const clave = s.dataset.lista;
        const val = await api.preguntar({ titulo: 'Agregar opción', texto: `Lista: <b>${esc(LISTAS[clave])}</b>. Quedará disponible para todos.`, etiqueta: 'Nueva opción', ok: 'Agregar', requerido: true });
        if (!val) { s.value = ''; return; }
        try { await agregarOpcion(clave, val); } catch (x) { toast(x.message); s.value = ''; return; }
        $$(`select[data-lista="${clave}"]`, panel).forEach(o => {
          if (![...o.options].some(op => op.value === val)) o.insertBefore(new Option(val, val), o.querySelector('option[value="__nueva"]'));
        });
        s.value = val;
        toast(`"${val}" agregado a la lista.`);
      });
      panel.addEventListener('click', async e => {
        const qe = e.target.closest('[data-quitar-ev]');
        if (qe) { qe.closest('[data-ev]').remove(); renum(); pintarTotal(); api.markDirty(); return; }
        if (e.target.closest('[data-add-ev]')) {
          // El nuevo evento copia las características del anterior (sin fecha ni volúmenes)
          const prev = leerEv(bloques().pop());
          evs.insertAdjacentHTML('beforeend', bloqueEvento({ fecha: '', hora: prev.hora, elemento: '', ubicacion: '', concretos: prev.concretos.map(k => Object.assign({}, k, { volumen: 0 })) }, bloques().length));
          renum(); api.markDirty();
          $('[name=fecha]', bloques().pop()).focus();
          return;
        }
        const q = e.target.closest('[data-quitar-k]');
        if (q) { const box = q.closest('[data-concretos]'); if ($$('[data-k]', box).length > 1) { q.closest('[data-k]').remove(); renum(); pintarTotal(); api.markDirty(); } else toast('Cada evento necesita al menos un concreto.'); return; }
        const ak = e.target.closest('[data-add-k]');
        if (ak) {
          const b = ak.closest('[data-ev]'), prev = leerK(b).pop() || KVACIO();
          $('[data-concretos]', b).insertAdjacentHTML('beforeend', bloqueConcreto(Object.assign({}, prev, { volumen: 0, nota: '', aditivos: prev.aditivos || [] }), $$('[data-k]', b).length));
          renum(); api.markDirty(); return;
        }
        const ad = e.target.closest('[data-add-aditivo]');
        if (ad) {
          const val = await api.preguntar({ titulo: 'Agregar aditivo o especial', texto: 'Quedará disponible en la lista para todos.', etiqueta: 'Nombre', ok: 'Agregar', requerido: true });
          if (!val) return;
          try { await agregarOpcion('aditivos', val); } catch (x) { toast(x.message); return; }
          $$('[data-aditivos]', panel).forEach(box => {
            const sel = $$('input:checked', box).map(i => i.value);
            if (box.contains(ad)) sel.push(val);
            box.innerHTML = chipsAditivos(sel);
          });
          api.markDirty();
        }
      });
      const guardarYa = async enviar => {
        err.textContent = '';
        const w = semana();
        const [e1, ...extra] = bloques().map(leerEv);
        const g = Object.assign({}, c, e1, {
          obraId: nuevo ? f.obra.value : c.obraId, anio: w.anio, semana: w.semana, extra, separacionMin: f.separacion.value,
          bombeo: (f.querySelector('[name=bombeo]:checked') || {}).value || '', tuberiaM: f.tuberia.value, alcanceM: f.alcance.value, alturaM: f.altura.value,
          contacto: f.contacto.value.trim(), contactoTel: f.tel.value.trim(), acceso: f.acceso.value.trim(), notas: f.notas.value.trim(),
          checklist: Object.fromEntries($$('[name=ck]', f).map(i => [i.value, i.checked]))
        });
        if (g.bombeo !== 'estacionaria') g.tuberiaM = null;
        if (g.bombeo !== 'pluma') g.alcanceM = null;
        if (!['estacionaria', 'pluma'].includes(g.bombeo)) g.alturaM = null;
        if (extra.length && !C.ev10 && !(await api.confirmar({ titulo: 'Varios eventos', texto: 'Para guardar varios eventos hay que haber corrido <span class="mono">supabase/10-colados-eventos.sql</span> en Supabase. ¿Intentarlo de todos modos?', ok: 'Intentar' }))) return;
        if (enviar || (correccion && c0.estado !== 'borrador')) {
          const falta = faltantes(g);
          if (falta.length) { err.textContent = (correccion ? 'Falta: ' : 'Para enviar falta: ') + falta.join(', ') + (correccion ? '.' : '. Puedes guardarlo como borrador.'); return; }
          if (enviar && g.fecha < today() && !(await api.confirmar({ titulo: 'Fecha pasada', texto: `La fecha del colado (${esc(fDateL(g.fecha))}) ya pasó. ¿Enviarlo de todos modos?`, ok: 'Enviar' }))) return;
        }
        $$('.dr-f .btn', panel).forEach(b => { b.disabled = true; });
        let id;
        try {
          id = await guardar(g);
          if (enviar) await cambiarEstado(id, 'enviada');
        } catch (x) {
          $$('.dr-f .btn', panel).forEach(b => { b.disabled = false; });
          err.textContent = x.message;
          if (id) await cargar();
          return;
        }
        await cargar();
        api.closeDrawer(true);
        toast(correccion ? 'Corrección guardada.' : enviar ? 'Colado enviado al coordinador.' : 'Borrador guardado. Envíalo cuando estés seguro.');
        if (location.hash === '#/col/' + id) api.rerender(); else location.hash = '#/col/' + id;
        if (enviar) avisar(id, 'enviada');
      };
      const bb = $('[data-borrador]', panel); if (bb) bb.addEventListener('click', () => guardarYa(false));
      f.addEventListener('submit', e => { e.preventDefault(); guardarYa(!correccion); });
    });
  }

  /* ---------- Listas de opciones (jefes, coordinador y compras) ---------- */
  function drListas() {
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">Programación de colados</p><h2 id="dr-title">Listas de opciones</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <p class="fld-h">Una opción por renglón; el orden es el de los desplegables. Quitar una opción no cambia los colados que ya la usan. Los residentes pueden agregar opciones desde el formulario, pero no quitarlas.</p>
        ${Object.entries(LISTAS).map(([k, t], i) => `<fieldset class="fs"><legend><span class="mono">${i + 1}</span>${t}</legend><div class="fs-b">
          <textarea class="in" name="${k}" rows="${Math.min(10, Math.max(3, (C.listas[k] || []).length + 1))}" placeholder="Vacía por ahora">${esc((C.listas[k] || []).join('\n'))}</textarea></div></fieldset>`).join('')}
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.check}<span>Guardar listas</span></button></footer>
    </form>`, {}, panel => {
      const f = $('form', panel);
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        $('[data-ok]', panel).disabled = true;
        try {
          for (const k of Object.keys(LISTAS)) {
            const vals = [...new Set(f[k].value.split('\n').map(s => s.trim()).filter(Boolean))];
            if (JSON.stringify(vals) !== JSON.stringify(C.listas[k] || [])) await guardarLista(k, vals);
          }
        } catch (x) { $('[data-ok]', panel).disabled = false; $('[data-err]', panel).textContent = x.message; return; }
        await cargar(); api.closeDrawer(true); toast('Listas guardadas.'); api.rerender();
      });
    });
  }

  /* ---------- PDF: solicitud de colado (para pedir cotizaciones) ---------- */
  function imprimir(c) {
    const o = obra(c.obraId) || {}, evs = eventosDe(c);
    const fila = (t, v) => (v ? `<tr><th>${t}</th><td>${v}</td></tr>` : '');
    $('#print').innerHTML = `<div class="pf pf--col">
      ${c.estado === 'aprobada' ? '' : `<div class="pf-marca">${esc((ESTADOS[c.estado] || {}).label || '').toUpperCase()} · NO ENVIAR</div>`}
      <div class="pf-h"><div class="pf-logo">${api.logoSVG()}</div><div class="pf-t"><h1>SOLICITUD DE CONCRETO PREMEZCLADO${c.bombeo && c.bombeo !== 'tiro_directo' ? ' Y BOMBEO' : ''}</h1>
        <p><span>FOLIO: ${esc(c.folio)}</span><span>SEMANA: ${c.semana}</span></p></div></div>
      <table class="pf-kv">
        ${fila('OBRA', esc(o.nombre || ''))}${fila('DIRECCIÓN', esc(o.direccion || ''))}
        ${evs.length > 1 ? fila('EVENTOS', evs.length + ' · VOLUMEN TOTAL ' + m3(total(c)).toUpperCase()) : fila('FECHA Y HORA', esc(fDateL(c.fecha).toUpperCase()) + (c.hora ? ' · ' + esc(c.hora) + ' H' : '')) + fila('ELEMENTO', esc([c.elemento, c.ubicacion].filter(Boolean).join(' · ')))}
        ${fila('SEPARACIÓN ENTRE OLLAS', c.separacionMin != null ? esc(c.separacionMin) + ' MIN' : '')}
      </table>
      ${evs.map((e, n) => `${evs.length > 1 ? `<p class="pf-ev"><b>EVENTO ${n + 1} · ${esc(fDateL(e.fecha).toUpperCase())}${e.hora ? ' · ' + esc(e.hora) + ' H' : ''}</b>${[e.elemento, e.ubicacion].filter(Boolean).length ? ' · ' + esc([e.elemento, e.ubicacion].filter(Boolean).join(' · ')) : ''}</p>` : ''}
      <table><colgroup><col style="width:4%"><col style="width:10%"><col style="width:12%"><col style="width:8%"><col style="width:14%"><col style="width:9%"><col style="width:12%"><col style="width:11%"><col style="width:20%"></colgroup>
        <thead><tr><th>#</th><th>VOLUMEN</th><th>F'C</th><th>CLASE</th><th>EDAD</th><th>TMA</th><th>REVENIMIENTO</th><th>COLOCACIÓN</th><th>ADITIVOS / NOTAS</th></tr></thead>
        <tbody>${e.concretos.map((k, i) => `<tr><td>${i + 1}</td><td>${m3(k.volumen)}</td><td>${esc(k.fc)}</td><td>${esc(k.clase)}</td><td>${esc(k.edad)}</td><td>${esc(k.tma)}</td><td>${esc(k.revenimiento)}</td><td>${esc(k.colocacion)}</td><td class="l">${esc([k.aditivos.join(', '), k.nota].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="tt"><td></td><td>${m3(volEv(e))}</td><td colspan="7" class="l">${evs.length > 1 ? 'VOLUMEN DEL EVENTO ' + (n + 1) : 'VOLUMEN TOTAL'}</td></tr></tfoot>
      </table>`).join('')}
      <table class="pf-kv">
        ${fila('BOMBEO', esc(BOMBEO[c.bombeo].toUpperCase()))}${fila('TUBERÍA', c.tuberiaM != null ? esc(c.tuberiaM) + ' M' : '')}
        ${fila('ALCANCE DE PLUMA', c.alcanceM != null ? esc(c.alcanceM) + ' M' : '')}${fila('ALTURA A BOMBEAR', c.alturaM != null ? esc(c.alturaM) + ' M' : '')}
        ${fila('RECIBE EN OBRA', esc([c.contacto, c.contactoTel].filter(Boolean).join(' · ')))}${fila('ACCESO Y REFERENCIAS', esc(c.acceso))}${fila('NOTAS', esc(c.notas))}
      </table>
      <p class="pf-n">Solicitó: ${esc(c.enviadaPor || c.creadaPor)}${c.aprobadaEn ? ` · Aprobó: ${esc(c.aprobadaPor)} (${esc(fDateT(c.aprobadaEn))})` : ''} · Galitha. Favor de enviar su cotización con precio por m³, bombeo y condiciones.</p>
    </div>`;
    const t0 = document.title;
    document.title = `Colado ${c.folio}`;   // nombre sugerido del PDF
    document.body.classList.add('printing');
    const fin = () => { document.title = t0; document.body.classList.remove('printing'); removeEventListener('afterprint', fin); };
    addEventListener('afterprint', fin);
    setTimeout(() => print(), 60);
  }

  /* =========================================================
     PARTES 2 Y 3 (v0.11; simplificadas en v0.12): solicitud a proveedores, cotización aprobada, compra y cierre
     ========================================================= */
  const esComprasR = () => esJefe() || rol() === 'compras';
  const soloResidente = () => rol() === 'residente';
  const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const money = n => MXN.format(+n || 0);
  const cotsDe = c => C.cots.filter(q => q.coladoId === c.id);
  const dirProv = id => api.proveedores().find(p => p.id === id);
  const nombreProv = (id, q) => { const d = dirProv(id); return d ? api.nombreProveedor(d) : (q && q.proveedor.nombre) || 'Proveedor'; };
  const comprasDe = c => C.compras.filter(x => x.coladoId === c.id);
  // v0.12: solo se registran cotizaciones aprobadas por Dirección (quedan "elegida" y crean su compra)
  const elegidas = c => cotsDe(c).filter(q => q.estado === 'elegida');
  const necesitaBomba = c => c.bombeo === 'estacionaria' || c.bombeo === 'pluma';
  const cubre = t => (t === 'ambos' ? ['concreto', 'bombeo'] : [t]);
  const seCruzan = (a, b) => cubre(a).some(x => cubre(b).includes(x));
  const TIPO = { ambos: 'Concreto y bombeo', concreto: 'Solo concreto', bombeo: 'Solo bombeo' };
  const cubierto = (c, t) => elegidas(c).some(q => cubre(q.tipo).includes(t));
  const faltaCot = c => !cubierto(c, 'concreto') || (necesitaBomba(c) && !cubierto(c, 'bombeo'));
  const puedeCerrar = c => c.estado === 'aprobada' && c.fecha && c.fecha <= today() && (puedeEditar(c.obraId) || esComprasR()) && C.parte2;
  // Proveedores de colado = los del directorio con tipo o categoría de concreto o bombeo
  const sinAcento = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // "Bombeo de concreto" cuenta como bombeo, no como concreto
  const surte = p => { const t = sinAcento([p.tipo, ...(p.categorias || [])].join(' | ')).replace(/bomb\w*\s+(de\s+)?concret\w*/g, 'bombeo'); return { concreto: /concret/.test(t), bombeo: /bomb/.test(t) }; };
  const provsColado = () => api.proveedores().filter(p => p.estatus !== 'no_recomendado' && (surte(p).concreto || surte(p).bombeo))
    .sort((a, b) => api.nombreProveedor(a).localeCompare(api.nombreProveedor(b), 'es'));
  async function abrirArchivo(ruta) {
    const w = window.open('', '_blank');
    try { const url = await R.urlArchivo(ruta); if (w) w.location.href = url; else location.href = url; }
    catch (e) { if (w) w.close(); toast(e.message); }
  }
  async function confirmar(id, si) {
    const filas = ok(await sb().from('colados').update({ confirmado_en: si ? new Date().toISOString() : null }).eq('id', id).select('id'));
    if (!filas.length) throw new Error('Tu rol no puede confirmar este colado.');
  }

  /* ---------- Sección: solicitudes enviadas y cotización aprobada ---------- */
  function seccionCotizaciones(c) {
    if (!['aprobada', 'realizado'].includes(c.estado) || rol() === 'consulta') return '';   // consulta: sin precios (la base tampoco se los manda)
    if (!C.parte2) return esComprasR() ? `<section class="panel col-sec rv"><div class="panel-b"><p class="muted small">Para registrar cotizaciones falta correr <span class="mono">supabase/09-colados-cotizaciones.sql</span> en Supabase.</p></div></section>` : '';
    const el = elegidas(c), compras = comprasDe(c);
    // El residente solo ve con quién se compró; los precios los manejan compras, coordinación y jefes
    if (soloResidente()) {
      return el.length ? `<section class="panel col-sec rv" style="--d:140"><header class="panel-h"><h2>Proveedor</h2></header><div class="panel-b"><ul class="tlist">${el.map(q => `<li class="tline"><span class="tmail">${esc(nombreProv(q.proveedorId, q))}</span><span class="tacts"><span class="tagx">${esc(TIPO[q.tipo])}</span></span></li>`).join('')}</ul></div></section>` : '';
    }
    const sols = c.avisos.filter(a => a.evento === 'solicitud');
    const falta = c.estado === 'aprobada' && faltaCot(c);
    const fila = q => {
      const sinCompra = !q.compraIds.some(id => C.compras.some(x => x.id === id));
      return `<li class="tline"><div><b>${esc(nombreProv(q.proveedorId, q))}</b><small class="muted d-blk">${esc(TIPO[q.tipo])}${q.subtotal && q.total && Math.abs(q.total - q.subtotal) < 0.5 ? ' · sin IVA' : ''}${q.elegidaEn ? ' · registró ' + esc(q.elegidaPor) + ' · ' + esc(fDateT(q.elegidaEn)) : ''}</small>
        ${q.condiciones ? `<small class="muted d-blk">${esc(q.condiciones)}</small>` : ''}
        ${q.archivos.length ? `<div class="col-arch">${q.archivos.map(a => `<button type="button" class="fchip" data-ruta="${esc(a.ruta)}">${I.file}<span>${esc(a.nombre)}</span></button>`).join('')}</div>` : ''}</div>
        <span class="tacts"><b>${money(q.total)}</b>${esComprasR() && sinCompra ? `<button class="ibtn" type="button" data-cot="${esc(q.id)}" data-acc="quitar" title="Quitar (su compra ya se borró)" aria-label="Quitar cotización">${I.close}</button>` : ''}</span></li>`;
    };
    return `<section class="panel col-sec rv" style="--d:140">
      <header class="panel-h"><h2>Cotización aprobada</h2>
        ${esComprasR() && falta ? `<button class="tbtn tbtn--sm" type="button" data-cot-nueva>${I.plus}<span>Registrar cotización aprobada</span></button>` : ''}</header>
      <div class="panel-b">
        ${el.length ? `<ul class="tlist">${el.map(fila).join('')}</ul>` : `<p class="muted small">Manda la solicitud a los proveedores; cuando Dirección apruebe una cotización, regístrala aquí con su archivo y se crea la compra.</p>`}
        ${falta && el.length ? `<p class="col-aviso">${I.alert}<span>Falta la cotización ${cubierto(c, 'concreto') ? 'del bombeo' : 'del concreto'}.</span></p>` : ''}
        ${compras.length ? `<div class="col-compras"><b>Compras</b>${compras.map(x => `<a class="tline" href="#/c/${esc(x.id)}"><span class="tmail">${esc(x.proveedor.nombre)}</span><span class="tacts">${['cotizacion', 'pago', 'factura', 'remision'].map(t => `<span class="dchip${x[t] ? ' ok' : ''}">${x[t] ? I.check : I.clock}${{ cotizacion: 'Cotización', pago: 'Pago', factura: 'Factura', remision: 'Remisiones' }[t]}</span>`).join('')}</span></a>`).join('')}</div>` : ''}
        ${sols.length ? `<div class="col-sol">${sols.slice(0, 4).map(a => `<span>${a.para.some(p => p.canal === 'whatsapp') ? I.wa : I.mail} Solicitud a ${esc([...new Set(a.para.map(p => p.proveedor || p.nombre || p.correo))].join(', '))} · ${esc(fDateT(a.en))}</span>`).join('')}</div>` : ''}
      </div></section>`;
  }

  /* ---------- Sección: confirmación con el proveedor (v0.12: sin plazos ni mínimos) ---------- */
  function seccionConfirmacion(c) {
    if (c.estado !== 'aprobada' || !C.parte2 || soloResidente() || !elegidas(c).length) return '';
    return `<section class="panel rv" style="--d:120"><header class="panel-h"><h2>Confirmación</h2></header><div class="panel-b">
      <p class="muted small">Confirma con el proveedor la fecha, hora, volumen y bombeo${nEv(c) > 1 ? ' de cada evento' : ''} antes del colado.</p>
      ${esComprasR() ? `<div class="acts"><button class="btn${c.confirmadoEn ? '' : ' btn--solid'}" type="button" data-confirmar>${I.check}<span>${c.confirmadoEn ? 'Quitar confirmación' : 'Marcar confirmado con el proveedor'}</span></button></div>` : ''}
      ${c.confirmadoEn ? `<p class="muted small">Confirmado por ${esc(c.confirmadoPor)} · ${esc(fDateT(c.confirmadoEn))}</p>` : ''}
    </div></section>`;
  }

  /* ---------- Sección: cierre (volumen real) ---------- */
  function seccionCierre(c) {
    if (c.estado !== 'realizado') return '';
    const pedido = total(c), dif = (c.volumenReal || 0) - pedido;
    return `<section class="panel rv" style="--d:110"><header class="panel-h"><h2>Colado realizado</h2></header><div class="panel-b">
      <dl class="dl"><div><dt>Volumen real</dt><dd><b>${m3(c.volumenReal)}</b> de ${m3(pedido)} pedidos${Math.abs(dif) >= 0.01 ? ` <span class="${dif < 0 ? 'col-neg' : 'muted'}">(${dif > 0 ? '+' : ''}${m3(dif)})</span>` : ''}</dd></div>
        ${c.ollas != null ? `<div><dt>Ollas</dt><dd>${esc(c.ollas)}</dd></div>` : ''}${c.notaReal ? `<div><dt>Nota</dt><dd>${esc(c.notaReal)}</dd></div>` : ''}
        <div><dt>Registró</dt><dd>${esc(c.realizadoPor)} · ${esc(fDateT(c.realizadoEn))}</dd></div></dl>
      ${esComprasR() || esCoord() ? `<div class="acts"><button class="tbtn tbtn--sm" type="button" data-cerrar>${I.edit}<span>Corregir</span></button></div>` : ''}
    </div></section>`;
  }

  /* ---------- Quitar una cotización cuya compra ya se borró ---------- */
  async function accionCot(c, q, acc) {
    if (!q || acc !== 'quitar') return;
    if (!(await api.confirmar({ titulo: 'Quitar cotización', texto: `Se quita la cotización de <b>${esc(nombreProv(q.proveedorId, q))}</b> (su compra ya no existe). Después puedes registrar otra.`, ok: 'Quitar' }))) return;
    if (await hacer(async () => {
      ok(await sb().from('colado_cotizaciones').update({ estado: 'descartada', compra_ids: [] }).eq('id', q.id).select('id'));
      ok(await sb().from('colado_cotizaciones').delete().eq('id', q.id).select('id'));
    }, 'Cotización quitada.')) api.rerender();
  }

  /* ---------- Mandar la solicitud a proveedores del directorio (correo con PDF y WhatsApp) ---------- */
  async function drPedir(c) {
    await api.refresh();
    const provs = provsColado();
    const yaA = new Set(c.avisos.filter(a => a.evento === 'solicitud').flatMap(a => a.para.map(p => p.proveedorId)).filter(Boolean));
    const telsWa = ts => (ts || []).filter(t => t.whatsapp && String(t.numero).replace(/\D/g, '').length >= 10);
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(c.folio)} · ${m3(total(c))}${nEv(c) > 1 ? ' · ' + nEv(c) + ' eventos' : ''}</p><h2 id="dr-title">Mandar solicitud a proveedores</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <p class="fld-h">Salen del directorio los proveedores con tipo o categoría de <b>concreto</b> o <b>bombeo</b>. Se manda un correo con el PDF a los contactos marcados (las respuestas te llegan a ti); a los que tienen WhatsApp se les manda con un clic al terminar.</p>
        ${provs.length ? provs.map(p => { const sv = surte(p), ks = (p.contactos || []).filter(k => k.activo !== false && (k.correo || telsWa(k.telefonos).length));
          const gen = p.correo || telsWa(p.telefonos).length;
          return `<fieldset class="fs col-pp" data-pp="${esc(p.id)}"><legend><label class="chk chk--wa"><input type="checkbox" data-pp-on><span><b>${esc(api.nombreProveedor(p))}</b> · ${[sv.concreto && 'Concreto', sv.bombeo && 'Bombeo'].filter(Boolean).join(' y ')}${yaA.has(p.id) ? ' · ya se le mandó' : ''}</span></label></legend><div class="fs-b">
          ${gen ? `<label class="chk chk--wa"><input type="checkbox" data-gen checked><span>Datos de la empresa${p.correo ? ' · ' + esc(p.correo) : ''}${telsWa(p.telefonos).length ? ' · WhatsApp' : ''}</span></label>` : ''}
          ${ks.map(k => `<label class="chk chk--wa"><input type="checkbox" data-k="${esc(k.id)}" checked><span>${esc(k.nombre || 'Contacto')}${k.correo ? ' · ' + esc(k.correo) : ''}${telsWa(k.telefonos).length ? ' · WhatsApp' : ''}</span></label>`).join('')}
          ${gen || ks.length ? '' : '<p class="muted small">Sin correo ni WhatsApp en el directorio: agrégalos en su ficha.</p>'}
        </div></fieldset>`; }).join('')
          : '<div class="note">' + I.alert + '<p>No hay proveedores de concreto o bombeo en el directorio. En la ficha de cada uno ponle el tipo "Concreto" o las categorías "Concreto premezclado" / "Bombeo de concreto".</p></div>'}
        <div data-res></div>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cerrar</span></button>${provs.length ? `<button type="submit" class="btn btn--solid" data-ok>${I.send}<span>Enviar solicitud</span></button>` : ''}</footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), res = $('[data-res]', panel), okb = $('[data-ok]', panel);
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        const envios = $$('[data-pp]', panel).filter(fs => $('[data-pp-on]', fs).checked)
          .map(fs => ({ proveedor_id: fs.dataset.pp, contactos: $$('[data-k]:checked', fs).map(i => i.dataset.k), general: !!($('[data-gen]', fs) || {}).checked }));
        if (!envios.length) { err.textContent = 'Marca al menos un proveedor.'; return; }
        if (envios.some(x => !x.contactos.length && !x.general)) { err.textContent = 'Marca a quién se le manda en cada proveedor elegido.'; return; }
        okb.disabled = true; $('span', okb).textContent = 'Enviando…';
        let data;
        try {
          const r = await sb().functions.invoke('cotizar-colado', { body: { colado_id: c.id, envios } });
          if (r.error) { let m = ''; try { m = (await r.error.context.json()).error; } catch (x) { /* sin cuerpo */ } throw new Error(m || 'No se pudo enviar (¿está publicada la función "cotizar-colado" en Supabase?).'); }
          data = r.data;
        } catch (x) { okb.disabled = false; $('span', okb).textContent = 'Enviar solicitud'; err.textContent = x.message; return; }
        await cargar(true);
        okb.hidden = true;
        const o = obra(c.obraId) || {}, evs = eventosDe(c);
        const cuando = evs.length > 1 ? `${evs.length} eventos (${evs.map(x => fDateL(x.fecha) + (x.hora ? ' ' + x.hora : '')).join('; ')})` : `${fDateL(c.fecha)}${c.hora ? ' a las ' + c.hora : ''}`;
        const msg = nombre => `Buen día${nombre ? ' ' + nombre.split(' ')[0] : ''}. En Galitha le solicitamos cotización de concreto premezclado${necesitaBomba(c) ? ' y bombeo' : ''} para la obra ${o.nombre || ''}: ${cuando}, ${m3(total(c))}, ${BOMBEO[c.bombeo].toLowerCase()}.\nCaracterísticas completas en el PDF (la liga vence en 7 días): ${data.pdf_url}\nGracias. ${(N.perfil || {}).nombre || ''}`;
        res.innerHTML = `<div class="col-res"><h3>Resultado</h3>${data.resultados.map(r => `<div class="col-r">
          <b>${esc(r.nombre || nombreProv(r.proveedor_id))}</b>
          ${r.correo_ok ? `<p class="ok">${I.okc}<span>Correo enviado a ${esc(r.correos.map(x => x.correo).join(', '))}</span></p>` : r.correos.length ? '' : '<p class="muted small">Sin correo marcado.</p>'}
          ${r.errores.map(x => `<p class="no">${I.x}<span>${esc(x)}</span></p>`).join('')}
          ${r.whatsapps.length ? `<div class="acts">${r.whatsapps.map(w0 => ({ nombre: w0.nombre, telefono: String(w0.telefono || '').replace(/\D/g, '').slice(-10) })).filter(w => w.telefono.length === 10).map(w => `<a class="btn btn--sm" target="_blank" rel="noopener" data-wa="${esc(r.proveedor_id)}" data-wap="${esc(r.nombre || '')}" data-wan="${esc(w.nombre)}" data-wat="${esc(w.telefono)}" href="https://wa.me/52${esc(w.telefono)}?text=${encodeURIComponent(msg(w.nombre))}">${I.wa}<span>WhatsApp a ${esc(w.nombre || w.telefono)}</span></a>`).join('')}</div>` : ''}
        </div>`).join('')}
        ${data.pdf_url ? `<p class="muted small">PDF enviado: <a class="link-u" href="${esc(data.pdf_url)}" target="_blank" rel="noopener">abrir</a> (liga de 7 días).</p>` : ''}</div>`;
        // WhatsApp con un clic: se anota como solicitud enviada
        $$('[data-wa]', res).forEach(a => a.addEventListener('click', async () => {
          try {
            ok(await sb().from('avisos').insert({ colado_id: c.id, evento: 'solicitud', para: [{ proveedorId: a.dataset.wa, proveedor: a.dataset.wap, nombre: a.dataset.wan, canal: 'whatsapp', telefono: a.dataset.wat }] }).select('id'));
            a.classList.add('is-sent'); await cargar(true); api.rerender();
          } catch (e2) { toast('Se abrió WhatsApp, pero no se anotó el envío: ' + e2.message); }
        }));
        api.rerender();
      });
    });
  }

  /* ---------- Registrar la cotización aprobada por Dirección: crea su compra ---------- */
  // Una cotización → su registro (elegida) y su compra, con la cotización como documento
  async function registrarCot(c, x) {
    const d = dirProv(x.pid) || {}, nombre = nombreProv(x.pid);
    const subidos = []; let cid, qid;
    try {
      for (const file of x.files) subidos.push(await R.subirArchivo(c.obraId, 'colado-' + c.id, file));
      const datos = { tipo: x.tipo, estado: 'recibida', total: x.total, subtotal: x.iva ? Math.round(x.total / 1.16 * 100) / 100 : x.total, condiciones: x.cond, compra_ids: [],
        archivos: subidos.map(({ ruta, nombre: n }) => ({ ruta, nombre: n })), proveedor: { nombre, rfc: d.rfc || '', razonSocial: d.razonSocial || '' } };
      // Una por proveedor y colado: si quedó una vieja (solicitada o descartada) se reutiliza
      const vieja = cotsDe(c).find(q => q.proveedorId === x.pid);
      if (vieja && vieja.estado === 'elegida') throw new Error(`Ya está registrada la cotización de ${nombre}. Si cubre las dos cosas, quítala y regístrala como "Concreto y bombeo".`);
      if (vieja) { ok(await sb().from('colado_cotizaciones').update(datos).eq('id', vieja.id).select('id')); qid = vieja.id; }
      else qid = ok(await sb().from('colado_cotizaciones').insert(Object.assign({ colado_id: c.id, proveedor_id: x.pid }, datos)).select('id'))[0].id;
      ok(await sb().from('colado_cotizaciones').update({ estado: 'elegida' }).eq('id', qid).select('id'));
      cid = await R.crearCompra({ obraId: c.obraId, anio: c.anio, semana: c.semana, partidas: [], fechaEntrega: c.fecha, coladoId: c.id,
        proveedor: { nombre, rfc: d.rfc || '', razonSocial: d.razonSocial || '', id: x.pid } });
      await R.cargar();
      await R.agregarDocumentoExistente(cid, 'cotizacion', { archivos: datos.archivos, fecha: today(), monto: x.total });
      if (!x.iva) await R.actualizarCompra(cid, { iva: false });
      ok(await sb().from('colado_cotizaciones').update({ compra_ids: [cid] }).eq('id', qid).select('id'));
    } catch (e) {
      if (!cid) {   // no quedó compra: se deshace lo registrado
        if (qid) await sb().from('colado_cotizaciones').update({ estado: 'descartada' }).eq('id', qid);
        await R.borrarArchivos(subidos.map(s2 => s2.ruta)).catch(() => {});
      }
      throw new Error(cid ? `La compra de ${nombre} se creó, pero falta terminar: ${e.message}` : e.message);
    }
  }

  async function drCotizacion(c) {
    await api.refresh();
    const bomba = necesitaBomba(c), hayC = cubierto(c, 'concreto'), hayB = cubierto(c, 'bombeo');
    // Qué falta: con bomba y nada registrado se elige "una sola" o "separadas"; si ya hay una, solo la otra
    const modoLibre = bomba && !hayC && !hayB;
    const fijo = !bomba ? 'concreto' : hayC ? 'bombeo' : hayB ? 'concreto' : '';
    const pc = provsColado(), otros = api.proveedores().filter(p => !pc.includes(p)).sort((a, b) => api.nombreProveedor(a).localeCompare(api.nombreProveedor(b), 'es'));
    // En cada bloque primero los proveedores que surten eso
    const opciones = t => {
      const de = pc.filter(p => t === 'ambos' ? surte(p).concreto : surte(p)[t]), resto = [...pc.filter(p => !de.includes(p)), ...otros];
      const opt = p => `<option value="${esc(p.id)}">${esc(api.nombreProveedor(p))}</option>`;
      return `<option value="">Elige…</option>${de.length ? `<optgroup label="${t === 'bombeo' ? 'Bombeo' : 'Concreto'}">${de.map(opt).join('')}</optgroup>` : ''}<optgroup label="Otros del directorio">${resto.map(opt).join('')}</optgroup>`;
    };
    const bloque = (t, titulo) => `<fieldset class="fs" data-q="${t}"><legend>${titulo}</legend><div class="fs-b"><div class="grid2">
      <label class="fld fld--wide"><span class="fld-l">Proveedor <em>*</em></span><select class="in" name="prov">${opciones(t)}</select></label>
      <label class="fld"><span class="fld-l">Total de la cotización <em>*</em></span><input class="in" name="total" type="number" min="0" step="0.01" inputmode="decimal"></label>
      <label class="chk chk--wa" style="align-self:end"><input type="checkbox" name="iva" checked><span>El total incluye IVA (lleva factura)</span></label>
      <label class="fld fld--wide"><span class="fld-l">Archivo de la cotización (PDF o foto)</span><input class="in" name="arch" type="file" accept="application/pdf,image/*" multiple></label>
      <label class="fld fld--wide"><span class="fld-l">Condiciones o notas</span><textarea class="in" name="cond" rows="2" placeholder="${t === 'bombeo' ? 'Tubería incluida, horario, forma de pago…' : 'Precio por m³, forma de pago, vigencia…'}"></textarea></label>
    </div></div></fieldset>`;
    const T2 = { ambos: 'Concreto y bombeo', concreto: 'Concreto', bombeo: 'Bombeo' };
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(c.folio)} · ${m3(total(c))}${nEv(c) > 1 ? ' · ' + nEv(c) + ' eventos' : ''}</p><h2 id="dr-title">Registrar cotización aprobada</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <p class="fld-h">Solo lo que ya aprobó Dirección. Cada cotización crea su compra, que sigue en Compras y facturas (pago, factura y remisiones de cada olla).</p>
        ${modoLibre ? `<div class="fld"><span class="fld-l">¿Cómo vino la cotización?</span><div class="toggles">
          <label class="chk chk--pill"><input type="radio" name="modo" value="ambos" checked><span>Una sola: concreto y bombeo</span></label>
          <label class="chk chk--pill"><input type="radio" name="modo" value="separadas"><span>Separadas: concreto y bombeo</span></label></div></div>` : ''}
        ${!bomba ? '<p class="muted small">Este colado es de tiro directo: solo lleva concreto.</p>' : fijo ? `<p class="muted small">Ya está registrada la del ${fijo === 'bombeo' ? 'concreto' : 'bombeo'}; falta la del ${fijo}.</p>` : ''}
        ${modoLibre ? bloque('ambos', T2.ambos) + bloque('concreto', T2.concreto) + bloque('bombeo', T2.bombeo) : bloque(fijo, T2[fijo])}
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.check}<span>Guardar y crear compra</span></button></footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), okb = $('[data-ok]', panel);
      const modo = () => (modoLibre ? (f.querySelector('[name=modo]:checked') || {}).value : fijo);
      const visibles = () => $$('[data-q]', panel).filter(b => !b.hidden);
      const pintar = () => {
        const m = modo();
        $$('[data-q]', panel).forEach(b => { b.hidden = modoLibre && (m === 'separadas' ? b.dataset.q === 'ambos' : b.dataset.q !== 'ambos'); });
        $('span', okb).textContent = visibles().length > 1 ? 'Guardar y crear las 2 compras' : 'Guardar y crear compra';
      };
      pintar();
      f.addEventListener('change', e => { if (e.target.name === 'modo') pintar(); });
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        let xs = visibles().map(b => ({ tipo: b.dataset.q, pid: $('[name=prov]', b).value, total: num($('[name=total]', b).value), iva: $('[name=iva]', b).checked,
          files: [...$('[name=arch]', b).files], cond: $('[name=cond]', b).value.trim(), titulo: T2[b.dataset.q] }));
        // Separadas con un bloque totalmente en blanco (p. ej. un ajuste de concreto que usa la bomba ya registrada): se pregunta y se guarda solo el otro
        const vacio = x => !x.pid && !(x.total > 0) && !x.files.length && !x.cond;
        const enBlanco = xs.length > 1 ? xs.filter(vacio) : [];
        if (enBlanco.length === xs.length) { err.textContent = 'Llena al menos una de las dos cotizaciones.'; return; }
        if (enBlanco.length) {
          const b0 = enBlanco[0].titulo.toLowerCase(), q0 = xs.find(x => !vacio(x)).titulo.toLowerCase();
          if (!(await api.confirmar({ titulo: `${enBlanco[0].titulo} en blanco`, texto: `Dejaste en blanco la cotización del ${b0}. ¿Guardar solo la del ${q0}? El colado seguirá marcando que falta la del ${b0}; si no se necesita, ignora ese aviso.`, ok: `Guardar solo ${q0}` }))) return;
          xs = xs.filter(x => !vacio(x));
        }
        const sep = xs.length > 1, en = x => (sep ? ` del ${x.titulo.toLowerCase()}` : '');
        for (const x of xs) {
          if (!x.pid) { err.textContent = `Elige el proveedor${en(x)}.`; return; }
          if (!(x.total > 0)) { err.textContent = `Escribe el total${en(x)}.`; return; }
        }
        if (sep && xs[0].pid === xs[1].pid) { err.textContent = 'Si el mismo proveedor cotizó las dos cosas, elige "Una sola: concreto y bombeo".'; return; }
        const sinArch = xs.filter(x => !x.files.length);
        if (sinArch.length && !(await api.confirmar({ titulo: 'Sin archivo', texto: `No subiste el archivo de la cotización${sep ? ' de: ' + sinArch.map(x => x.titulo.toLowerCase()).join(' y ') : ''}. ¿Guardar así? Lo puedes subir después en la compra.`, ok: 'Guardar sin archivo' }))) return;
        okb.disabled = true;
        const hechas = [];
        try {
          for (const x of xs) { await registrarCot(c, x); hechas.push(x.titulo); }
        } catch (x2) {
          await cargar(true);
          if (hechas.length) {   // la primera ya quedó: se cierra y se avisa qué falta
            api.closeDrawer(true); api.rerender();
            toast(`Se creó la compra del ${hechas[0].toLowerCase()}, pero la otra no: ${x2.message} Regístrala de nuevo.`);
            return;
          }
          okb.disabled = false; err.textContent = x2.message; return;
        }
        await cargar(true); api.closeDrawer(true);
        toast(hechas.length > 1 ? 'Se crearon las 2 compras (concreto y bombeo). Siguen en Compras y facturas.'
          : faltaCot(C.colados.find(y => y.id === c.id) || c) ? 'Compra creada. Falta registrar la otra cotización.' : 'Compra creada. Sigue en Compras y facturas: pago, factura y remisiones.');
        api.rerender();
      });
    });
  }

  /* ---------- Cierre: volumen real ---------- */
  function drCerrar(c) {
    const pedido = total(c), corr = c.estado === 'realizado';
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(c.folio)} · ${m3(pedido)} pedidos</p><h2 id="dr-title">${corr ? 'Corregir cierre' : 'Colado realizado'}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b"><div class="grid2">
        <label class="fld"><span class="fld-l">Volumen real recibido (m³) <em>*</em></span><input class="in" name="vol" type="number" min="0" step="0.5" value="${c.volumenReal != null ? c.volumenReal : pedido}"><span class="fld-h">Suma de las remisiones de las ollas.</span></label>
        <label class="fld"><span class="fld-l">Ollas</span><input class="in" name="ollas" type="number" min="0" step="1" value="${c.ollas != null ? c.ollas : ''}"></label>
        <label class="fld fld--wide"><span class="fld-l">Nota</span><textarea class="in" name="nota" rows="3" placeholder="Retrasos, olla devuelta, faltante reclamado…">${esc(c.notaReal)}</textarea></label>
        <p class="fld--wide muted small" data-dif></p>
        ${comprasDe(c).length ? `<p class="fld--wide muted small">Las fotos de las remisiones de cada olla se suben en la compra: ${comprasDe(c).map(x => `<a class="link-u" href="#/c/${esc(x.id)}" data-close>${esc(x.proveedor.nombre)}</a>`).join(', ')}.</p>` : ''}
      </div></div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.check}<span>${corr ? 'Guardar' : 'Marcar realizado'}</span></button></footer>
    </form>`, {}, panel => {
      const f = $('form', panel), err = $('[data-err]', panel);
      const dif = () => { const v = num(f.vol.value) || 0, d = v - pedido; $('[data-dif]', panel).innerHTML = Math.abs(d) < 0.01 ? 'Igual a lo pedido.' : d < 0 ? `<b class="col-neg">Faltan ${m3(-d)}</b> respecto a lo pedido. Si fue culpa del proveedor, reclámalo por escrito dentro de las 24 h siguientes.` : `Se recibieron ${m3(d)} más de lo pedido.`; };
      dif(); f.vol.addEventListener('input', dif); f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const v = num(f.vol.value);
        if (!(v > 0)) { err.textContent = 'Escribe el volumen real.'; return; }
        $('[data-ok]', panel).disabled = true;
        const fila = { volumen_real: v, ollas: num(f.ollas.value) != null ? Math.round(num(f.ollas.value)) : null, nota_real: f.nota.value.trim() };
        if (!corr) fila.estado = 'realizado';
        try { const filas = ok(await sb().from('colados').update(fila).eq('id', c.id).select('id')); if (!filas.length) throw new Error('Tu rol no puede cerrar este colado.'); }
        catch (x) { $('[data-ok]', panel).disabled = false; err.textContent = x.message; return; }
        await cargar(true); api.closeDrawer(true); toast(corr ? 'Cierre corregido.' : 'Colado marcado como realizado.'); api.rerender();
      });
    });
  }

  /* ---------- Contador de la barra lateral ---------- */
  let cargado = false;
  function chrome() {
    if (!N.perfil) return;
    if (!cargado) { cargado = true; cargar().then(chrome, () => { }); return; }
    const n = esCoord() ? C.colados.filter(c => c.estado === 'enviada').length
      : rol() === 'compras' ? C.colados.filter(c => c.estado === 'aprobada' && C.parte2 && faltaCot(c)).length
        : C.colados.filter(c => ['borrador', 'devuelta'].includes(c.estado) && esResDe(c.obraId)).length;
    $$('[data-ccount]').forEach(el => { el.textContent = n || ''; el.title = esCoord() ? 'Por aprobar' : rol() === 'compras' ? 'Aprobados sin cotización registrada' : 'Borradores y devueltos'; });
  }

  return {
    pages: { colados: pageColados, col: pageColado },
    nav: { col: 'colados' },
    titulos: { colados: 'Colados' },
    acciones: { colados: { label: 'Nuevo colado', act: 'nuevo-colado', puede: () => obrasCaptura().length > 0 } },
    onAct(a) { if (a === 'nuevo-colado') drColado(null); },
    cargar, chrome
  };
});
