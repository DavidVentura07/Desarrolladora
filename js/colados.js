/* =========================================================
   GALITHA · Programación de colados (v0.11, 2026-10-07)
   Se registra en window.GALITHA_MODULOS como los demás módulos.

   Solicitud de colado: borrador → enviada → (devuelta → enviada…) → aprobada → realizado  (o cancelada)
   - El residente de la obra (o su suplente vigente) la arma por semana, la guarda
     como borrador y la envía al coordinador cuando está seguro.
   - El coordinador la aprueba o la devuelve con un comentario; también la puede cancelar.
   - Ya aprobada, compras pide cotizaciones a los proveedores de colado (correo con el PDF
     por la Edge Function "cotizar-colado", WhatsApp con un clic o automático), captura lo
     que cotiza cada uno, compara y elige: se crea la compra (concreto y, si es otro
     proveedor, bombeo) que sigue en Compras y facturas (pago, factura, remisión por olla).
   - Plazos del proveedor (confirmar, cancelar bomba, pago) y mínimos; compras marca
     "confirmado"; al final se cierra con el volumen real (realizado).
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
  let C = { listo: false, colados: [], listas: {}, obras: [], compras: [], provs: [], cots: [], parte2: false };
  const quien = id => (id ? N.nombreDe(id) || 'Usuario' : '');
  const deColado = c => ({
    id: c.id, obraId: c.obra_id, anio: c.anio, semana: c.semana, folio: str(c.folio), estado: c.estado,
    fecha: c.fecha ? String(c.fecha).slice(0, 10) : '', hora: str(c.hora).slice(0, 5), elemento: str(c.elemento), ubicacion: str(c.ubicacion),
    concretos: arr(c.concretos).map(k => ({ volumen: num(k.volumen) || 0, fc: str(k.fc), clase: str(k.clase), edad: str(k.edad), tma: str(k.tma),
      revenimiento: str(k.revenimiento), colocacion: str(k.colocacion), aditivos: arr(k.aditivos).map(str).filter(Boolean), nota: str(k.nota) })),
    bombeo: c.bombeo || '', tuberiaM: c.tuberia_m, alturaM: c.altura_m, alcanceM: c.alcance_m, eventos: c.eventos, separacionMin: c.separacion_min,
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
  // v0.11: proveedor de colado (reglas) y cotización por proveedor
  const deProv = x => ({
    proveedorId: x.proveedor_id, tipos: arr(x.tipos), contactos: arr(x.contactos), correoExtra: str(x.correo_extra),
    limiteConfirmar: str(x.limite_confirmar), limiteBomba: str(x.limite_cancelar_bomba), limitePago: str(x.limite_pago),
    minimoM3: x.minimo_m3 == null ? null : num(x.minimo_m3), minimoBombeoM3: x.minimo_bombeo_m3 == null ? null : num(x.minimo_bombeo_m3),
    tuberiaIncluida: x.tuberia_incluida_m == null ? null : num(x.tuberia_incluida_m), notas: str(x.notas), activo: x.activo !== false
  });
  const deCot = q => ({
    id: q.id, coladoId: q.colado_id, proveedorId: q.proveedor_id || '', proveedor: obj(q.proveedor), tipo: q.tipo, estado: q.estado,
    envios: arr(q.envios), lineas: arr(q.lineas).map(l => ({ concepto: str(l.concepto), volumen: num(l.volumen) || 0, precio: num(l.precio) || 0 })),
    bombeo: num(q.bombeo), otros: num(q.otros), subtotal: num(q.subtotal), total: num(q.total), vigencia: q.vigencia || '', condiciones: str(q.condiciones),
    archivos: arr(q.archivos), compraIds: arr(q.compra_ids), solicitadaEn: q.solicitada_en, solicitadaPor: quien(q.solicitada_por),
    recibidaEn: q.recibida_en || '', recibidaPor: quien(q.recibida_por), elegidaEn: q.elegida_en || '', elegidaPor: quien(q.elegida_por)
  });
  const total = c => c.concretos.reduce((a, k) => a + (k.volumen || 0), 0);

  function ok({ data, error }) {
    if (error) {
      const m = String(error.message || '');
      if (/colados_folio/.test(m)) throw new Error('Ese folio ya existe; vuelve a intentarlo.');
      throw new Error(N.traducir(error));
    }
    return data;
  }
  async function cargar(fresco) {
    // Obras, residentes, suplentes y compras: la copia del módulo de requisiciones (se recarga si hace falta)
    const s0 = R.snapshot();
    const s = s0.obras.length && !fresco ? s0 : await R.cargar().catch(() => s0);
    C.obras = s.obras;
    const [cs, ls, av, pv, qs] = await Promise.all([
      sb().from('colados').select('*').order('fecha', { ascending: false }),
      sb().from('colado_listas').select('clave, valores'),
      sb().from('avisos').select('*').not('colado_id', 'is', null).order('en', { ascending: false }).then(r => r, () => ({ data: [] })),
      // v0.11 (09-colados-cotizaciones.sql); sin correrlo, la parte 1 sigue funcionando
      sb().from('colado_proveedores').select('*').then(r => r, e => ({ data: null, error: e })),
      sb().from('colado_cotizaciones').select('*').order('solicitada_en').then(r => r, e => ({ data: null, error: e }))
    ]);
    if (cs.error) { C.listo = false; C.colados = []; C.error = cs.error.message; return C; }
    C.listo = true; C.error = '';
    C.colados = cs.data.map(deColado);
    C.listas = {}; Object.keys(LISTAS).forEach(k => { C.listas[k] = []; });
    arr(ls.data).forEach(l => { C.listas[l.clave] = arr(l.valores); });
    C.parte2 = !pv.error && !qs.error;
    C.provs = C.parte2 ? arr(pv.data).map(deProv) : [];
    C.cots = C.parte2 ? arr(qs.data).map(deCot) : [];
    C.compras = R.snapshot().compras.filter(x => x.coladoId);
    arr(av.data).forEach(a => { const c = C.colados.find(x => x.id === a.colado_id); if (c) c.avisos.push({ evento: a.evento, en: a.en, para: arr(a.para) }); });
    return C;
  }
  const fila = c => ({
    anio: c.anio, semana: c.semana, folio: c.folio, fecha: c.fecha || null, hora: c.hora, elemento: str(c.elemento), ubicacion: str(c.ubicacion),
    concretos: c.concretos, bombeo: c.bombeo || '', tuberia_m: num(c.tuberiaM), altura_m: num(c.alturaM), alcance_m: num(c.alcanceM),
    eventos: num(c.eventos) ? Math.round(num(c.eventos)) : null, separacion_min: num(c.separacionMin) != null ? Math.round(num(c.separacionMin)) : null,
    contacto: str(c.contacto), contacto_tel: str(c.contactoTel), acceso: str(c.acceso), checklist: c.checklist || {}, notas: str(c.notas)
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
    const o = obra(id); if (!o) return false;
    if (o.residenteId && o.residenteId === yoId()) return true;
    const h = today();
    return o.suplentes.some(s => s.perfilId === yoId() && s.desde <= h && h <= s.hasta);
  };
  const puedeEditar = id => esCoord() || esResDe(id);
  const obrasCaptura = () => C.obras.filter(o => o.estatus !== 'cerrada' && puedeEditar(o.id));
  const editable = c => puedeEditar(c.obraId) && ['borrador', 'devuelta'].includes(c.estado);

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
          <div class="col-hb">${esComprasR() && C.parte2 ? `<button class="tbtn" type="button" data-provs>${I.users}<span>Proveedores de colado</span></button>` : ''}${editaListas() ? `<button class="tbtn" type="button" data-listas>${I.listas || I.list}<span>Listas de opciones</span></button>` : ''}</div></header>
        <div class="note note--info rv" style="--d:60">${I.colado}<p>${rol() === 'compras' ? 'Aquí aparecen los colados que el coordinador ya aprobó. Descarga el PDF para pedir las cotizaciones del concreto y del bombeo.'
          : 'El residente arma la solicitud y la guarda como <b>borrador</b>; cuando está seguro, la <b>envía al coordinador</b>, que la aprueba o la devuelve. Ya aprobada, compras pide las cotizaciones.'}</p></div>
        ${esComprasR() && vis.some(urgente) ? `<div class="note note--bad rv" style="--d:70">${I.alert}<p><b>Plazos de proveedor por vencer:</b> ${vis.filter(urgente).map(c => `<a class="link-u" href="#/col/${esc(c.id)}">${esc(c.folio)}</a>`).join(', ')}. Confirma el pedido y libera el pago a tiempo para evitar cargos.</p></div>` : ''}
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
        const bp = $('[data-provs]', sec); if (bp) bp.addEventListener('click', drProveedores);
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
    const qs = cotsDe(c), el = elegidas(c);
    if (urgente(c) && !soloResidente()) return `<span class="tagx tagx--bad">${I.alert}Plazo por vencer</span>`;
    if (el.length) return `<span class="tagx tagx--ok">${esc(el.map(q => nombreProv(q.proveedorId, q)).join(' + '))}${c.confirmadoEn ? ' · confirmado' : ''}</span>`;
    if (soloResidente()) return '';
    return qs.length ? `<span class="tagx">${qs.length} ${qs.length === 1 ? 'cotización' : 'cotizaciones'}</span>` : '<span class="tagx tagx--wait">Sin cotizar</span>';
  }
  function tarjeta(c, d) {
    const o = obra(c.obraId) || {};
    return `<article class="card colcard rv" style="--d:${d}" data-href="#/col/${esc(c.id)}" tabindex="0">
      <div class="col-dia"><b>${c.fecha ? toDate(c.fecha).getDate() : '—'}</b><small>${c.fecha ? DIA[toDate(c.fecha).getDay()].slice(0, 3) : 'sin fecha'}</small>${c.hora ? `<em>${esc(c.hora)}</em>` : ''}</div>
      <div class="col-main">
        <a class="pname" href="#/col/${esc(c.id)}">${esc(c.elemento || 'Colado sin elemento')}${c.ubicacion ? ' · ' + esc(c.ubicacion) : ''}</a>
        <span class="sub">${esc(o.nombre || '')} · ${esc(c.folio)} · ${esc(BOMBEO[c.bombeo])}</span>
        <p class="col-conc">${c.concretos.map(k => `<span>${esc([k.fc && "f'c " + k.fc, k.tma, k.revenimiento && 'rev. ' + k.revenimiento].filter(Boolean).join(' · ') || 'Concreto')} <b>${m3(k.volumen)}</b></span>`).join('') || '<span class="muted">Sin concretos todavía</span>'}</p>
        ${c.estado === 'devuelta' && c.comentario ? `<p class="k-rej">${I.alert}<span>${esc(c.comentario)}</span></p>` : ''}
      </div>
      <div class="col-side"><b>${m3(total(c))}</b>${tag(c)}${chipCot(c)}</div>
    </article>`;
  }

  /* ---------- Detalle ---------- */
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
      coord && c.estado === 'enviada' ? `<button class="btn btn--solid" type="button" data-aprobar>${I.check}<span>Aprobar</span></button><button class="btn" type="button" data-devolver>${I.undo}<span>Devolver para corregir</span></button>` : '',
      esComprasR() && C.parte2 && c.estado === 'aprobada' ? `<button class="btn btn--solid" type="button" data-pedir>${I.send}<span>Pedir cotizaciones</span></button>` : '',
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
          <div class="d-money"><div class="big-money">${m3(total(c))}</div><small>${c.concretos.length === 1 ? '1 concreto' : c.concretos.length + ' concretos'} · ${esc(BOMBEO[c.bombeo])}</small></div>
        </div></header>
        ${c.estado === 'devuelta' && c.comentario ? `<div class="note rv" style="--d:40">${I.undo}<p><b>${esc(c.devueltaPor || 'El coordinador')} lo devolvió para corregir:</b> ${esc(c.comentario)}</p></div>` : ''}
        ${c.estado === 'cancelada' ? `<div class="note note--bad rv" style="--d:40">${I.alert}<p><b>Colado cancelado por ${esc(c.canceladaPor)}.</b> ${esc(c.comentario)}</p></div>` : ''}
        <div class="c-acts rv" style="--d:50">${acts}</div>
        ${ultimo ? `<p class="k-aviso rv">${I.mail}<span>Correo ${c.estado === 'enviada' ? 'al coordinador' : 'enviado'} · ${esc(ultimo.para.map(p => p.nombre || p.correo).join(', '))} · ${esc(fDateT(ultimo.en))}</span></p>` : ''}
        ${seccionCotizaciones(c)}
        <div class="d-grid">
          <div class="d-main">
            <section class="panel rv" style="--d:80"><header class="panel-h"><h2>Concreto <span class="n">${c.concretos.length}</span></h2></header>
              <div class="panel-b"><ul class="col-kl">${c.concretos.map(k => `<li><b class="col-kv">${m3(k.volumen)}</b><div><div class="col-chips">${[k.fc && "f'c " + k.fc, k.clase && 'Clase ' + k.clase, k.edad, k.tma && 'TMA ' + k.tma, k.revenimiento && 'Rev. ' + k.revenimiento, k.colocacion, ...k.aditivos].filter(Boolean).map(t => `<span>${esc(t)}</span>`).join('') || '<span class="muted">Sin especificar</span>'}</div>${k.nota ? `<small class="muted">${esc(k.nota)}</small>` : ''}</div></li>`).join('') || '<li class="muted">Sin concretos todavía.</li>'}</ul>
              ${c.concretos.length > 1 ? `<p class="col-tot">Total <b>${m3(total(c))}</b></p>` : ''}</div>
            </section>
            <section class="panel rv" style="--d:120"><header class="panel-h"><h2>Bombeo y logística</h2></header><div class="panel-b">
              ${dl([['Bombeo', esc(BOMBEO[c.bombeo])], ['Tubería', c.tuberiaM != null ? esc(c.tuberiaM) + ' m' : ''], ['Alcance de la pluma', c.alcanceM != null ? esc(c.alcanceM) + ' m' : ''],
                ['Altura a bombear', c.alturaM != null ? esc(c.alturaM) + ' m' : ''], ['Eventos', c.eventos != null ? esc(c.eventos) : ''], ['Separación entre ollas', c.separacionMin != null ? esc(c.separacionMin) + ' min' : ''],
                ['Recibe en obra', esc([c.contacto, c.contactoTel].filter(Boolean).join(' · '))], ['Dirección', esc(o.direccion || '')], ['Acceso y referencias', esc(c.acceso)], ['Notas', esc(c.notas)]])}
            </div></section>
          </div>
          <aside class="d-side">
            ${seccionPlazos(c)}
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
  const faltantes = c => [!c.fecha && 'la fecha', !c.elemento && 'el elemento a colar', !c.concretos.length && 'el concreto',
    c.concretos.some(k => !(k.volumen > 0)) && 'el volumen de cada concreto', c.concretos.some(k => !k.fc) && "la resistencia (f'c)", !c.bombeo && 'el tipo de bombeo'].filter(Boolean);

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

  async function drColado(c0) {
    await cargar();
    if (!C.listo) { toast('Falta correr 08-colados.sql en Supabase.'); return; }
    const nuevo = !c0;
    const obras = nuevo ? obrasCaptura() : [obra(c0.obraId)].filter(Boolean);
    if (!obras.length) { toast('Solo el residente de una obra (o el coordinador) capturan colados.'); return; }
    const o0 = obras[0], res = (o0 && o0.residente) || {};
    const c = c0 ? JSON.parse(JSON.stringify(c0)) : { obraId: o0.id, fecha: '', hora: '07:00', elemento: '', ubicacion: '', concretos: [{ volumen: 0, fc: '', clase: '1', edad: '', tma: '', revenimiento: '', colocacion: 'Bombeable', aditivos: [], nota: '' }],
      bombeo: '', tuberiaM: null, alturaM: null, alcanceM: null, eventos: 1, separacionMin: null, contacto: res.nombre || '', contactoTel: res.telefono || '', acceso: '', checklist: {}, notas: '' };
    const v = x => (x == null ? '' : esc(x));
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">Programación de colados${c0 ? ' · ' + esc(c0.folio) : ''}</p><h2 id="dr-title">${nuevo ? 'Nuevo colado' : 'Editar colado'}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        ${c0 && c0.estado === 'devuelta' && c0.comentario ? `<div class="note">${I.undo}<p><b>Qué hay que corregir:</b> ${esc(c0.comentario)}</p></div>` : ''}
        <fieldset class="fs"><legend><span class="mono">1</span>Qué y cuándo</legend><div class="fs-b"><div class="grid2">
          <label class="fld fld--wide"><span class="fld-l">Obra</span><select class="in" name="obra"${nuevo && obras.length > 1 ? '' : ' disabled'}>${obras.map(o => `<option value="${esc(o.id)}"${o.id === c.obraId ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>
          <label class="fld"><span class="fld-l">Fecha del colado <em>*</em></span><input class="in" name="fecha" type="date" value="${v(c.fecha)}"><span class="fld-h" data-sem></span></label>
          <label class="fld"><span class="fld-l">Hora de inicio</span><input class="in" name="hora" type="time" value="${v(c.hora)}"></label>
          <label class="fld"><span class="fld-l">Elemento a colar <em>*</em></span>${selLista('elementos', 'elemento', c.elemento)}</label>
          <label class="fld"><span class="fld-l">Nivel, ejes o zona</span><input class="in" name="ubicacion" value="${v(c.ubicacion)}" placeholder="Ej. Nivel 3, ejes A-D / 1-4"></label>
          <label class="fld"><span class="fld-l">Número de eventos</span><input class="in" name="eventos" type="number" min="1" step="1" value="${v(c.eventos)}"><span class="fld-h">Cuántos colados (entregas) en este pedido.</span></label>
          <label class="fld"><span class="fld-l">Separación entre ollas (min)</span><input class="in" name="separacion" type="number" min="0" step="5" value="${v(c.separacionMin)}"><span class="fld-h">El proveedor da 30 min de muestreo + 10 de descarga.</span></label>
        </div></div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Concreto</legend><div class="fs-b">
          <div data-concretos>${c.concretos.map(bloqueConcreto).join('')}</div>
          <button type="button" class="btn btn--sm" data-add-k>${I.plus}<span>Agregar otro concreto</span></button>
          <p class="fld-h">Si el colado lleva concretos distintos (por ejemplo, grava de 20 mm para la losa y de 10 mm para columnas), agrega uno por cada tipo. <b data-total></b></p>
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">3</span>Bombeo</legend><div class="fs-b">
          <div class="toggles">${Object.entries(BOMBEO).filter(([k]) => k).map(([k, l]) => `<label class="chk chk--pill"><input type="radio" name="bombeo" value="${k}"${c.bombeo === k ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
          <div class="grid2 grid3" style="margin-top:12px">
            <label class="fld" data-b="estacionaria"><span class="fld-l">Tubería (m)</span><input class="in" name="tuberia" type="number" min="0" step="1" value="${v(c.tuberiaM)}"><span class="fld-h">Horizontal más vertical.</span></label>
            <label class="fld" data-b="pluma"><span class="fld-l">Alcance de la pluma (m)</span><input class="in" name="alcance" type="number" min="0" step="1" value="${v(c.alcanceM)}"></label>
            <label class="fld" data-b="estacionaria pluma"><span class="fld-l">Altura a bombear (m)</span><input class="in" name="altura" type="number" min="0" step="0.5" value="${v(c.alturaM)}"></label>
          </div>
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">4</span>En obra</legend><div class="fs-b"><div class="grid2">
          <label class="fld"><span class="fld-l">Quién recibe</span><input class="in" name="contacto" value="${v(c.contacto)}"></label>
          <label class="fld"><span class="fld-l">Teléfono</span><input class="in" name="tel" type="tel" value="${v(c.contactoTel)}"></label>
          <label class="fld fld--wide"><span class="fld-l">Acceso y referencias</span><textarea class="in" name="acceso" rows="2" placeholder="Descarga en calle o banqueta, cables cerca, pendiente, horario de la calle…">${v(c.acceso)}</textarea></label>
          <div class="fld fld--wide"><span class="fld-l">Obra lista para el colado</span><div class="col-check">${CHECK.map(([k, t]) => `<label class="chk chk--wa"><input type="checkbox" name="ck" value="${k}"${c.checklist[k] ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div></div>
          <label class="fld fld--wide"><span class="fld-l">Notas</span><textarea class="in" name="notas" rows="2">${v(c.notas)}</textarea></label>
        </div></div></fieldset>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-borrador>${I.draft}<span>Guardar borrador</span></button><button type="submit" class="btn btn--solid" data-ok>${I.send}<span>Guardar y enviar</span></button></footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), cont = $('[data-concretos]', panel);
      f.addEventListener('input', api.markDirty);
      const semana = () => { const d = toDate(f.fecha.value) || new Date(); return isoWeek(d); };
      const pintarSem = () => { const w = semana(); $('[data-sem]', panel).textContent = `Semana ${w.semana} · ${wkRange(w)}`; };
      const renum = () => $$('[data-kn]', panel).forEach((s, i) => { s.textContent = i + 1; });
      const leerK = () => $$('[data-k]', cont).map(b => ({
        volumen: num($('[name=volumen]', b).value) || 0, fc: $('[name=fc]', b).value, clase: $('[name=clase]', b).value, edad: $('[name=edad]', b).value,
        tma: $('[name=tma]', b).value, revenimiento: $('[name=rev]', b).value, colocacion: $('[name=colocacion]', b).value,
        aditivos: $$('[data-aditivos] input:checked', b).map(i => i.value), nota: $('[name=knota]', b).value.trim()
      }));
      const pintarTotal = () => { const t = leerK().reduce((a, k) => a + k.volumen, 0); $('[data-total]', panel).textContent = t ? `Total: ${m3(t)}.` : ''; };
      const bombeoVis = () => { const b = (f.querySelector('[name=bombeo]:checked') || {}).value || ''; $$('[data-b]', panel).forEach(el => { el.hidden = !el.dataset.b.split(' ').includes(b); }); };
      pintarSem(); pintarTotal(); bombeoVis();
      // Al cambiar de obra (captura nueva), propone al residente de esa obra como quien recibe
      if (nuevo && obras.length > 1) f.obra.addEventListener('change', () => {
        const r0 = (obra(c.obraId) || {}).residente || {}, r1 = (obra(f.obra.value) || {}).residente || {};
        if (!f.contacto.value.trim() || f.contacto.value.trim() === (r0.nombre || '')) { f.contacto.value = r1.nombre || ''; f.tel.value = r1.telefono || ''; }
        c.obraId = f.obra.value;
      });
      f.fecha.addEventListener('change', pintarSem);
      f.addEventListener('change', e => {
        if (e.target.name === 'bombeo') bombeoVis();
        if (e.target.name === 'volumen') pintarTotal();
      });
      cont.addEventListener('input', e => { if (e.target.name === 'volumen') pintarTotal(); });
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
        const q = e.target.closest('[data-quitar-k]');
        if (q) { if ($$('[data-k]', cont).length > 1) { q.closest('[data-k]').remove(); renum(); pintarTotal(); api.markDirty(); } else toast('El colado necesita al menos un concreto.'); return; }
        if (e.target.closest('[data-add-k]')) {
          const prev = leerK().pop() || {};
          cont.insertAdjacentHTML('beforeend', bloqueConcreto(Object.assign({}, prev, { volumen: 0, nota: '', aditivos: prev.aditivos || [] }), $$('[data-k]', cont).length));
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
        const g = Object.assign({}, c, {
          obraId: nuevo ? f.obra.value : c.obraId, anio: w.anio, semana: w.semana, fecha: f.fecha.value, hora: f.hora.value,
          elemento: f.elemento.value === '__nueva' ? '' : f.elemento.value, ubicacion: f.ubicacion.value.trim(),
          eventos: f.eventos.value, separacionMin: f.separacion.value, concretos: leerK().map(k => Object.assign(k, { fc: k.fc === '__nueva' ? '' : k.fc })),
          bombeo: (f.querySelector('[name=bombeo]:checked') || {}).value || '', tuberiaM: f.tuberia.value, alcanceM: f.alcance.value, alturaM: f.altura.value,
          contacto: f.contacto.value.trim(), contactoTel: f.tel.value.trim(), acceso: f.acceso.value.trim(), notas: f.notas.value.trim(),
          checklist: Object.fromEntries($$('[name=ck]', f).map(i => [i.value, i.checked]))
        });
        ['edad', 'tma', 'revenimiento'].forEach(k => g.concretos.forEach(x => { if (x[k] === '__nueva') x[k] = ''; }));
        if (g.bombeo !== 'estacionaria') g.tuberiaM = null;
        if (g.bombeo !== 'pluma') g.alcanceM = null;
        if (!['estacionaria', 'pluma'].includes(g.bombeo)) g.alturaM = null;
        if (enviar) {
          const falta = faltantes(g);
          if (falta.length) { err.textContent = 'Para enviar falta: ' + falta.join(', ') + '. Puedes guardarlo como borrador.'; return; }
          if (g.fecha < today() && !(await api.confirmar({ titulo: 'Fecha pasada', texto: `La fecha del colado (${esc(fDateL(g.fecha))}) ya pasó. ¿Enviarlo de todos modos?`, ok: 'Enviar' }))) return;
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
        toast(enviar ? 'Colado enviado al coordinador.' : 'Borrador guardado. Envíalo cuando estés seguro.');
        if (location.hash === '#/col/' + id) api.rerender(); else location.hash = '#/col/' + id;
        if (enviar) avisar(id, 'enviada');
      };
      $('[data-borrador]', panel).addEventListener('click', () => guardarYa(false));
      f.addEventListener('submit', e => { e.preventDefault(); guardarYa(true); });
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
    const o = obra(c.obraId) || {};
    const fila = (t, v) => (v ? `<tr><th>${t}</th><td>${v}</td></tr>` : '');
    $('#print').innerHTML = `<div class="pf pf--col">
      ${c.estado === 'aprobada' ? '' : `<div class="pf-marca">${esc((ESTADOS[c.estado] || {}).label || '').toUpperCase()} · NO ENVIAR</div>`}
      <div class="pf-h"><div class="pf-logo">${api.logoSVG()}</div><div class="pf-t"><h1>SOLICITUD DE CONCRETO PREMEZCLADO${c.bombeo && c.bombeo !== 'tiro_directo' ? ' Y BOMBEO' : ''}</h1>
        <p><span>FOLIO: ${esc(c.folio)}</span><span>SEMANA: ${c.semana}</span></p></div></div>
      <table class="pf-kv">
        ${fila('OBRA', esc(o.nombre || ''))}${fila('DIRECCIÓN', esc(o.direccion || ''))}
        ${fila('FECHA Y HORA', esc(fDateL(c.fecha).toUpperCase()) + (c.hora ? ' · ' + esc(c.hora) + ' H' : ''))}
        ${fila('ELEMENTO', esc([c.elemento, c.ubicacion].filter(Boolean).join(' · ')))}
        ${fila('EVENTOS', c.eventos != null ? esc(c.eventos) : '')}${fila('SEPARACIÓN ENTRE OLLAS', c.separacionMin != null ? esc(c.separacionMin) + ' MIN' : '')}
      </table>
      <table><colgroup><col style="width:4%"><col style="width:10%"><col style="width:12%"><col style="width:8%"><col style="width:14%"><col style="width:9%"><col style="width:12%"><col style="width:11%"><col style="width:20%"></colgroup>
        <thead><tr><th>#</th><th>VOLUMEN</th><th>F'C</th><th>CLASE</th><th>EDAD</th><th>TMA</th><th>REVENIMIENTO</th><th>COLOCACIÓN</th><th>ADITIVOS / NOTAS</th></tr></thead>
        <tbody>${c.concretos.map((k, i) => `<tr><td>${i + 1}</td><td>${m3(k.volumen)}</td><td>${esc(k.fc)}</td><td>${esc(k.clase)}</td><td>${esc(k.edad)}</td><td>${esc(k.tma)}</td><td>${esc(k.revenimiento)}</td><td>${esc(k.colocacion)}</td><td class="l">${esc([k.aditivos.join(', '), k.nota].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody>
        <tfoot><tr class="tt"><td></td><td>${m3(total(c))}</td><td colspan="7" class="l">VOLUMEN TOTAL</td></tr></tfoot>
      </table>
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
     PARTES 2 Y 3 (v0.11): proveedores, cotizaciones, compra, plazos y cierre
     ========================================================= */
  const esComprasR = () => esJefe() || rol() === 'compras';
  const soloResidente = () => rol() === 'residente';
  const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const money = n => MXN.format(+n || 0);
  const cotsDe = c => C.cots.filter(q => q.coladoId === c.id);
  const provDe = id => C.provs.find(x => x.proveedorId === id);
  const dirProv = id => api.proveedores().find(p => p.id === id);
  const nombreProv = (id, q) => { const d = dirProv(id); return d ? api.nombreProveedor(d) : (q && q.proveedor.nombre) || 'Proveedor'; };
  const comprasDe = c => C.compras.filter(x => x.coladoId === c.id);
  const elegidas = c => cotsDe(c).filter(q => q.estado === 'elegida');
  const necesitaBomba = c => c.bombeo === 'estacionaria' || c.bombeo === 'pluma';
  // Qué cubre una cotización y cuáles se pisan entre sí
  const cubre = t => (t === 'ambos' ? ['concreto', 'bombeo'] : [t]);
  const seCruzan = (a, b) => cubre(a).some(x => cubre(b).includes(x));
  const TIPO = { concreto: 'Concreto', bombeo: 'Bombeo', ambos: 'Concreto y bombeo' };
  const QEST = { solicitada: ['Solicitada', 'wait'], recibida: ['Recibida', 'ext'], elegida: ['Elegida', 'ok'], descartada: ['Descartada', 'draft'] };
  const puedeCerrar = c => c.estado === 'aprobada' && c.fecha && c.fecha <= today() && (puedeEditar(c.obraId) || esComprasR()) && C.parte2;
  const tipoPara = (c, prov) => {
    if (!necesitaBomba(c)) return 'concreto';
    const t = (prov && prov.tipos) || ['concreto'];
    return t.includes('concreto') && t.includes('bombeo') ? 'ambos' : t.includes('bombeo') ? 'bombeo' : 'concreto';
  };
  // Importe del concreto: Σ volumen × precio por m³
  const importeConcreto = q => q.lineas.reduce((a, l) => a + (l.volumen || 0) * (l.precio || 0), 0);
  async function abrirArchivo(ruta) {
    const w = window.open('', '_blank');
    try { const url = await R.urlArchivo(ruta); if (w) w.location.href = url; else location.href = url; }
    catch (e) { if (w) w.close(); toast(e.message); }
  }
  async function confirmar(id, si) {
    const filas = ok(await sb().from('colados').update({ confirmado_en: si ? new Date().toISOString() : null }).eq('id', id).select('id'));
    if (!filas.length) throw new Error('Tu rol no puede confirmar este colado.');
  }

  /* ---------- Sección: cotizaciones y comparativo ---------- */
  function seccionCotizaciones(c) {
    if (!['aprobada', 'realizado'].includes(c.estado)) return '';
    if (!C.parte2) return esComprasR() ? `<section class="panel rv"><div class="panel-b"><p class="muted small">Para pedir y comparar cotizaciones falta correr <span class="mono">supabase/09-colados-cotizaciones.sql</span> en Supabase.</p></div></section>` : '';
    const qs = cotsDe(c), vol = total(c), compras = comprasDe(c);
    const recibidas = qs.filter(q => q.total > 0 && q.estado !== 'descartada');
    // "La más baja" solo entre cotizaciones que cubren lo mismo (concreto, bombeo o ambos)
    const minimoDe = t => { const xs = recibidas.filter(q => q.tipo === t); return xs.length > 1 ? Math.min(...xs.map(q => q.total)) : null; };
    // El residente solo ve con quién se compró; los precios los manejan compras, coordinación y jefes
    if (soloResidente()) {
      const el = elegidas(c);
      return el.length ? `<section class="panel rv" style="--d:140"><header class="panel-h"><h2>Proveedor</h2></header><div class="panel-b"><ul class="tlist">${el.map(q => `<li class="tline"><span class="tmail">${esc(nombreProv(q.proveedorId, q))}</span><span class="tacts"><span class="tagx">${esc(TIPO[q.tipo])}</span></span></li>`).join('')}</ul></div></section>` : '';
    }
    const fila = q => {
      const [lab, cls] = QEST[q.estado] || QEST.solicitada;
      const env = q.envios[q.envios.length - 1];
      const acc = esComprasR() ? [
        q.estado !== 'elegida' && q.estado !== 'descartada' && c.estado === 'aprobada' ? `<button class="tbtn tbtn--sm" type="button" data-cot="${esc(q.id)}" data-acc="capturar">${I.edit}<span>${q.total ? 'Corregir' : 'Capturar'}</span></button>` : '',
        q.estado === 'recibida' && c.estado === 'aprobada' ? `<button class="tbtn tbtn--sm col-elegir" type="button" data-cot="${esc(q.id)}" data-acc="elegir">${I.check}<span>Elegir</span></button>` : '',
        q.estado === 'descartada' && c.estado === 'aprobada' ? `<button class="tbtn tbtn--sm" type="button" data-cot="${esc(q.id)}" data-acc="reactivar">${I.undo}<span>Reactivar</span></button>` : '',
        q.estado === 'elegida' && !q.compraIds.some(id => C.compras.some(x => x.id === id)) ? `<button class="tbtn tbtn--sm" type="button" data-cot="${esc(q.id)}" data-acc="deshacer">${I.undo}<span>Deshacer elección</span></button>` : '',
        ['solicitada', 'recibida'].includes(q.estado) && c.estado === 'aprobada' ? `<button class="ibtn" type="button" data-cot="${esc(q.id)}" data-acc="descartar" title="Descartar" aria-label="Descartar">${I.close}</button>` : ''
      ].join('') : '';
      return `<tr class="${q.estado === 'elegida' ? 'col-win' : q.estado === 'descartada' ? 'col-off' : ''}">
        <td><b>${esc(nombreProv(q.proveedorId, q))}</b><small class="muted d-blk">${esc(TIPO[q.tipo])}${env ? ` · pedida ${esc(fDateT(env.en))}${env.canales ? ' por ' + esc(env.canales.join(' y ')) : ''}` : ''}</small>
          ${q.archivos.length ? `<div class="col-arch">${q.archivos.map(a => `<button type="button" class="fchip" data-ruta="${esc(a.ruta)}">${I.file}<span>${esc(a.nombre)}</span></button>`).join('')}</div>` : ''}</td>
        <td><span class="tagx tagx--${cls}">${lab}</span>${q.vigencia ? `<small class="muted d-blk">vigente al ${esc(fDate(q.vigencia))}</small>` : ''}</td>
        <td class="num">${q.lineas.length ? money(importeConcreto(q)) : '—'}${q.lineas.length && vol ? `<small class="muted d-blk">${money(importeConcreto(q) / vol)}/m³</small>` : ''}</td>
        <td class="num">${q.bombeo != null ? money(q.bombeo) : '—'}</td>
        <td class="num">${q.otros ? money(q.otros) : '—'}</td>
        <td class="num"><b>${q.total ? money(q.total) : '—'}</b>${minimoDe(q.tipo) != null && q.total === minimoDe(q.tipo) ? '<small class="col-min d-blk">la más baja</small>' : ''}</td>
        <td class="col-acc">${acc}</td></tr>
        ${q.condiciones ? `<tr class="col-cond"><td colspan="7"><small class="muted">${esc(q.condiciones)}</small></td></tr>` : ''}`;
    };
    return `<section class="panel rv" style="--d:140">
      <header class="panel-h"><h2>Cotizaciones <span class="n">${qs.length}</span></h2>
        ${esComprasR() && c.estado === 'aprobada' ? `<button class="tbtn tbtn--sm" type="button" data-cot-nueva>${I.plus}<span>Registrar cotización</span></button>` : ''}</header>
      <div class="panel-b">
        ${qs.length ? `<div class="tablewrap tablewrap--bg"><table class="tbl col-cmp"><thead><tr><th>Proveedor</th><th>Estado</th><th class="num">Concreto</th><th class="num">Bombeo</th><th class="num">Otros</th><th class="num">Total con IVA</th><th></th></tr></thead>
          <tbody>${qs.map(fila).join('')}</tbody></table></div>`
          : `<p class="muted small">${esComprasR() ? 'Usa <b>Pedir cotizaciones</b> para mandar la solicitud a los proveedores de colado, o <b>Registrar cotización</b> si te la dieron por otro medio.' : 'Compras todavía no pide cotizaciones.'}</p>`}
        ${compras.length ? `<div class="col-compras"><b>Compras</b>${compras.map(x => `<a class="tline" href="#/c/${esc(x.id)}"><span class="tmail">${esc(x.proveedor.nombre)}</span><span class="tacts">${['cotizacion', 'pago', 'factura', 'remision'].map(t => `<span class="dchip${x[t] ? ' ok' : ''}">${x[t] ? I.check : I.clock}${{ cotizacion: 'Cotización', pago: 'Pago', factura: 'Factura', remision: 'Remisiones' }[t]}</span>`).join('')}</span></a>`).join('')}</div>` : ''}
      </div></section>`;
  }

  /* ---------- Sección: plazos del proveedor y confirmación ---------- */
  // Fecha y hora límite: el día anterior al colado a la hora que marca el proveedor ("15:00")
  const limite = (c, hhmm) => {
    if (!c.fecha || !/^\d{1,2}:\d{2}$/.test(hhmm || '')) return null;
    const d = addDays(toDate(c.fecha), -1), [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0); return d;
  };
  function plazos(c) {
    const el = elegidas(c);
    const qc = el.find(q => cubre(q.tipo).includes('concreto')), qb = el.find(q => cubre(q.tipo).includes('bombeo'));
    const pc = qc && provDe(qc.proveedorId), pb = qb && provDe(qb.proveedorId);
    const pagado = comprasDe(c).some(x => x.pago);
    const out = [];
    if (pc && limite(c, pc.limiteConfirmar)) out.push({ t: 'Confirmar o cancelar el concreto sin cargo', d: limite(c, pc.limiteConfirmar), hecho: !!c.confirmadoEn });
    if (pb && necesitaBomba(c) && limite(c, pb.limiteBomba)) out.push({ t: 'Cancelar la bomba sin cargo', d: limite(c, pb.limiteBomba), hecho: !!c.confirmadoEn });
    if (pc && limite(c, pc.limitePago)) out.push({ t: 'Pago liberado', d: limite(c, pc.limitePago), hecho: pagado });
    const avisos = [];
    const vol = total(c);
    if (pc && pc.minimoM3 && vol < pc.minimoM3) avisos.push(`El pedido (${m3(vol)}) es menor al mínimo de ${m3(pc.minimoM3)} del proveedor: puede haber cargo por la diferencia.`);
    if (pb && necesitaBomba(c) && pb.minimoBombeoM3 && vol < pb.minimoBombeoM3) avisos.push(`El bombeo se cobra mínimo ${m3(pb.minimoBombeoM3)}; el pedido es de ${m3(vol)}.`);
    if (pb && c.bombeo === 'estacionaria' && pb.tuberiaIncluida != null && c.tuberiaM > pb.tuberiaIncluida) avisos.push(`Se piden ${c.tuberiaM} m de tubería y el proveedor incluye ${pb.tuberiaIncluida} m: los ${c.tuberiaM - pb.tuberiaIncluida} m extra se cobran aparte.`);
    return { out, avisos, hayElegida: el.length > 0 };
  }
  const fLim = d => `${DIA[d.getDay()].slice(0, 3)} ${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  // Lo que urge de un colado aprobado (para la lista y el contador): plazo vencido o de hoy sin cumplir
  const urgente = c => c.estado === 'aprobada' && C.parte2 && plazos(c).out.some(x => !x.hecho && x.d - new Date() < 864e5);
  function seccionPlazos(c) {
    if (c.estado !== 'aprobada' || !C.parte2 || soloResidente()) return '';
    const { out, avisos, hayElegida } = plazos(c), ahora = new Date();
    return `<section class="panel rv" style="--d:120"><header class="panel-h"><h2>Plazos y confirmación</h2></header><div class="panel-b">
      ${hayElegida ? '' : '<p class="muted small">Cuando elijas la cotización aparecen aquí los plazos del proveedor (configúralos en <b>Proveedores de colado</b>).</p>'}
      ${out.length ? `<ul class="checks">${out.map(x => { const venc = !x.hecho && ahora > x.d, hoy = !x.hecho && !venc && x.d - ahora < 864e5;
        return `<li class="${x.hecho ? 'ok' : venc ? 'no' : 'meh'}">${I[x.hecho ? 'okc' : venc ? 'x' : 'clock']}<span><b>${esc(x.t)}</b><br>antes del ${esc(fLim(x.d))}${x.hecho ? ' · listo' : venc ? ' · <b>ya pasó</b>' : hoy ? ' · <b>hoy</b>' : ''}</span></li>`; }).join('')}</ul>` : hayElegida ? '<p class="muted small">El proveedor elegido no tiene horas límite registradas.</p>' : ''}
      ${avisos.map(a => `<p class="col-aviso">${I.alert}<span>${esc(a)}</span></p>`).join('')}
      ${esComprasR() && hayElegida ? `<div class="acts"><button class="btn${c.confirmadoEn ? '' : ' btn--solid'}" type="button" data-confirmar>${I.check}<span>${c.confirmadoEn ? 'Quitar confirmación' : 'Marcar confirmado con el proveedor'}</span></button></div>` : ''}
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

  /* ---------- Acciones sobre una cotización ---------- */
  async function accionCot(c, q, acc) {
    if (!q) return;
    const upd = async (f, msg) => {
      if (await hacer(async () => { const filas = ok(await sb().from('colado_cotizaciones').update(f).eq('id', q.id).select('id')); if (!filas.length) throw new Error('Tu rol no puede modificar cotizaciones.'); }, msg)) api.rerender();
    };
    if (acc === 'capturar') return drCotizacion(c, q);
    if (acc === 'descartar') { if (await api.confirmar({ titulo: 'Descartar cotización', texto: `La cotización de <b>${esc(nombreProv(q.proveedorId, q))}</b> queda descartada (se puede reactivar).`, ok: 'Descartar' })) await upd({ estado: 'descartada' }, 'Cotización descartada.'); return; }
    if (acc === 'reactivar') return upd({ estado: q.total ? 'recibida' : 'solicitada' }, 'Cotización reactivada.');
    if (acc === 'deshacer') return upd({ estado: 'recibida', compra_ids: [] }, 'Se deshizo la elección.');
    if (acc === 'elegir') return elegir(c, q);
  }

  // Elegir: la cotización queda "elegida", se crea su compra (con la cotización como documento) y se descartan las que cubren lo mismo
  async function elegir(c, q) {
    const otras = cotsDe(c).filter(x => x.id !== q.id && ['solicitada', 'recibida'].includes(x.estado) && seCruzan(x.tipo, q.tipo));
    const ya = elegidas(c).find(x => seCruzan(x.tipo, q.tipo));
    if (ya) { toast(`Ya está elegida la de ${nombreProv(ya.proveedorId, ya)} para ${TIPO[ya.tipo].toLowerCase()}.`); return; }
    const falta = necesitaBomba(c) && q.tipo === 'concreto' && !elegidas(c).some(x => cubre(x.tipo).includes('bombeo')) ? ' Después elige también la del bombeo.' : '';
    if (!(await api.confirmar({ titulo: 'Elegir cotización', texto: `Se creará la compra a <b>${esc(nombreProv(q.proveedorId, q))}</b> por <b>${money(q.total)}</b> (${esc(TIPO[q.tipo].toLowerCase())}), con su cotización como documento.${otras.length ? ` ${otras.length === 1 ? 'La otra cotización de lo mismo queda descartada.' : 'Las otras ' + otras.length + ' cotizaciones de lo mismo quedan descartadas.'}` : ''}${falta}`, ok: 'Elegir y crear compra' }))) return;
    const d = dirProv(q.proveedorId) || {};
    let cid;
    try {
      ok(await sb().from('colado_cotizaciones').update({ estado: 'elegida' }).eq('id', q.id).select('id'));
      cid = await R.crearCompra({ obraId: c.obraId, anio: c.anio, semana: c.semana, partidas: [], fechaEntrega: c.fecha, coladoId: c.id,
        proveedor: { nombre: nombreProv(q.proveedorId, q), rfc: d.rfc || q.proveedor.rfc || '', razonSocial: d.razonSocial || q.proveedor.razonSocial || '', id: q.proveedorId || '' } });
      await R.cargar();
      await R.agregarDocumentoExistente(cid, 'cotizacion', { archivos: q.archivos, fecha: today(), monto: q.total });
      if (q.subtotal && q.total && Math.abs(q.total - q.subtotal) < 0.5) await R.actualizarCompra(cid, { iva: false });   // cotización sin IVA
      ok(await sb().from('colado_cotizaciones').update({ compra_ids: [...q.compraIds, cid] }).eq('id', q.id).select('id'));
      if (otras.length) ok(await sb().from('colado_cotizaciones').update({ estado: 'descartada' }).in('id', otras.map(x => x.id)).select('id'));
    } catch (e) {
      if (!cid) await sb().from('colado_cotizaciones').update({ estado: 'recibida' }).eq('id', q.id);   // no quedó compra: se deshace la elección
      toast(cid ? `La compra se creó, pero falta terminar: ${e.message}` : e.message);
      await cargar(true); api.rerender(); return;
    }
    await cargar(true);
    toast('Compra creada. Sigue en Compras y facturas: pago, factura y remisiones.');
    api.rerender();
  }

  /* ---------- Pedir cotizaciones (correo con PDF y WhatsApp) ---------- */
  async function drPedir(c) {
    await api.refresh();
    const provs = C.provs.filter(x => x.activo && (necesitaBomba(c) || x.tipos.includes('concreto')));
    if (!provs.length) { toast('Primero registra los proveedores de colado.'); return drProveedores(); }
    const ya = new Set(cotsDe(c).map(q => q.proveedorId));
    const contactosDe = x => ((dirProv(x.proveedorId) || {}).contactos || []).filter(k => k.activo !== false);
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(c.folio)} · ${m3(total(c))}</p><h2 id="dr-title">Pedir cotizaciones</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <p class="fld-h">Se manda la solicitud con el PDF adjunto por correo a los contactos marcados; las respuestas te llegan a ti. A los que tienen WhatsApp se les puede mandar con un clic al terminar.</p>
        ${provs.map(x => { const ks = contactosDe(x); return `<fieldset class="fs col-pp" data-pp="${esc(x.proveedorId)}"><legend><label class="chk chk--wa"><input type="checkbox" data-pp-on${ya.has(x.proveedorId) ? '' : ' checked'}><span><b>${esc(nombreProv(x.proveedorId))}</b> · ${esc(x.tipos.map(t => TIPO[t]).join(' y '))}${ya.has(x.proveedorId) ? ' · ya se le pidió' : ''}</span></label></legend><div class="fs-b">
          ${ks.length ? ks.map(k => `<label class="chk chk--wa"><input type="checkbox" data-k="${esc(k.id)}"${x.contactos.includes(k.id) || !x.contactos.length ? ' checked' : ''}><span>${esc(k.nombre || 'Contacto')}${k.correo ? ' · ' + esc(k.correo) : ' · sin correo'}${k.telefonos.some(t => t.whatsapp) ? ' · WhatsApp' : ''}</span></label>`).join('') : '<p class="muted small">Sin contactos en el directorio.</p>'}
          ${x.correoExtra ? `<p class="muted small">También se manda a ${esc(x.correoExtra)} (correo de pedidos).</p>` : ''}
        </div></fieldset>`; }).join('')}
        <label class="chk chk--wa"><input type="checkbox" name="wa"><span>Mandar también por WhatsApp automático (solo si ya está configurado en Supabase)</span></label>
        <div data-res></div>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cerrar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.send}<span>Enviar solicitud</span></button></footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), res = $('[data-res]', panel), okb = $('[data-ok]', panel);
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        const envios = $$('[data-pp]', panel).filter(fs => $('[data-pp-on]', fs).checked).map(fs => ({ proveedor_id: fs.dataset.pp, contactos: $$('[data-k]:checked', fs).map(i => i.dataset.k) }));
        if (!envios.length) { err.textContent = 'Marca al menos un proveedor.'; return; }
        okb.disabled = true; $('span', okb).textContent = 'Enviando…';
        let data;
        try {
          const r = await sb().functions.invoke('cotizar-colado', { body: { colado_id: c.id, envios, whatsapp: f.wa.checked } });
          if (r.error) { let m = ''; try { m = (await r.error.context.json()).error; } catch (x) { /* sin cuerpo */ } throw new Error(m || 'No se pudo enviar (¿está publicada la función "cotizar-colado" en Supabase?).'); }
          data = r.data;
        } catch (x) { okb.disabled = false; $('span', okb).textContent = 'Enviar solicitud'; err.textContent = x.message; return; }
        await cargar(true);
        okb.hidden = true;
        const o = obra(c.obraId) || {};
        const msg = nombre => `Buen día${nombre ? ' ' + nombre.split(' ')[0] : ''}. En Galitha le solicitamos cotización de concreto premezclado${necesitaBomba(c) ? ' y bombeo' : ''} para la obra ${o.nombre || ''}: ${fDateL(c.fecha)}${c.hora ? ' a las ' + c.hora : ''}, ${[c.elemento, c.ubicacion].filter(Boolean).join(' ')}, ${m3(total(c))}, ${BOMBEO[c.bombeo].toLowerCase()}.\nCaracterísticas completas en el PDF (la liga vence en 7 días): ${data.pdf_url}\nGracias. ${(N.perfil || {}).nombre || ''}`;
        res.innerHTML = `<div class="col-res"><h3>Resultado</h3>${data.resultados.map(r => `<div class="col-r">
          <b>${esc(r.nombre || nombreProv(r.proveedor_id))}</b>
          ${r.correo_ok ? `<p class="ok">${I.okc}<span>Correo enviado a ${esc(r.correos.map(x => x.correo).join(', '))}</span></p>` : r.correos.length ? '' : '<p class="muted small">Sin correo registrado.</p>'}
          ${r.wa_ok ? `<p class="ok">${I.okc}<span>WhatsApp automático enviado (${r.wa_ok})</span></p>` : ''}
          ${r.errores.map(x => `<p class="no">${I.x}<span>${esc(x)}</span></p>`).join('')}
          ${!data.wa_auto && r.whatsapps.length ? `<div class="acts">${r.whatsapps.map(w0 => ({ nombre: w0.nombre, telefono: String(w0.telefono || '').replace(/\D/g, '').slice(-10) })).filter(w => w.telefono.length === 10).map(w => `<a class="btn btn--sm" target="_blank" rel="noopener" data-wa="${esc(r.proveedor_id)}" data-wan="${esc(w.nombre)}" data-wat="${esc(w.telefono)}" href="https://wa.me/52${esc(w.telefono)}?text=${encodeURIComponent(msg(w.nombre))}">${I.wa}<span>WhatsApp a ${esc(w.nombre || w.telefono)}</span></a>`).join('')}</div>` : ''}
        </div>`).join('')}
        ${data.pdf_url ? `<p class="muted small">PDF enviado: <a class="link-u" href="${esc(data.pdf_url)}" target="_blank" rel="noopener">abrir</a> (liga de 7 días).</p>` : ''}</div>`;
        // WhatsApp con un clic: se anota el envío en la cotización de ese proveedor
        $$('[data-wa]', res).forEach(a => a.addEventListener('click', async () => {
          const pid = a.dataset.wa, x = provDe(pid), q = C.cots.find(y => y.coladoId === c.id && y.proveedorId === pid);
          const envio = { en: new Date().toISOString(), por: yoId(), canales: ['whatsapp'], para: [{ nombre: a.dataset.wan, telefono: a.dataset.wat }] };
          try {
            if (q) ok(await sb().from('colado_cotizaciones').update({ envios: [...q.envios, envio] }).eq('id', q.id).select('id'));
            else { const d = dirProv(pid) || {}; ok(await sb().from('colado_cotizaciones').insert({ colado_id: c.id, proveedor_id: pid, tipo: tipoPara(c, x), proveedor: { nombre: nombreProv(pid), rfc: d.rfc || '', razonSocial: d.razonSocial || '' }, envios: [envio] }).select('id')); }
            await cargar(true); a.classList.add('is-sent');
          } catch (e2) { toast('Se abrió WhatsApp, pero no se anotó el envío: ' + e2.message); }
        }));
        api.rerender();
      });
    });
  }

  /* ---------- Capturar (o registrar) una cotización recibida ---------- */
  async function drCotizacion(c, q) {
    await api.refresh();
    const vol = total(c);
    const lineas = q && q.lineas.length ? q.lineas : c.concretos.map(k => ({ concepto: [k.fc && "f'c " + k.fc, k.tma, k.revenimiento && 'rev. ' + k.revenimiento, ...(k.aditivos || [])].filter(Boolean).join(' · ') || 'Concreto', volumen: k.volumen, precio: 0 }));
    const opciones = q ? [] : C.provs.filter(x => x.activo && !cotsDe(c).some(y => y.proveedorId === x.proveedorId));
    const ivaPrev = !q || !q.subtotal || !q.total || Math.abs(q.total - q.subtotal) >= 0.5;
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(c.folio)} · ${m3(vol)}</p><h2 id="dr-title">${q ? 'Cotización de ' + esc(nombreProv(q.proveedorId, q)) : 'Registrar cotización'}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        ${q ? '' : `<fieldset class="fs"><legend><span class="mono">1</span>Proveedor</legend><div class="fs-b">
          ${opciones.length ? `<select class="in" name="prov">${opciones.map(x => `<option value="${esc(x.proveedorId)}">${esc(nombreProv(x.proveedorId))} · ${esc(x.tipos.map(t => TIPO[t]).join(' y '))}</option>`).join('')}</select>`
            : '<p class="muted small">Todos los proveedores de colado ya tienen cotización en este colado. Agrega otro en "Proveedores de colado".</p>'}
        </div></fieldset>`}
        <fieldset class="fs"><legend><span class="mono">${q ? 1 : 2}</span>Lo que cotizó (sin IVA)</legend><div class="fs-b">
          <label class="fld"><span class="fld-l">Cubre</span><select class="in" name="tipo">${Object.entries(TIPO).map(([k, l]) => `<option value="${k}"${(q ? q.tipo : tipoPara(c, provDe((opciones[0] || {}).proveedorId))) === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
          <div data-lineas>${lineas.map(l => `<div class="col-lin" data-l><span class="col-lin-c">${esc(l.concepto)}</span>
            <label class="fld"><span class="fld-l">m³</span><input class="in" name="lv" type="number" min="0" step="0.5" value="${l.volumen || ''}"></label>
            <label class="fld"><span class="fld-l">Precio por m³</span><input class="in" name="lp" type="number" min="0" step="0.01" value="${l.precio || ''}" inputmode="decimal"></label>
            <input type="hidden" name="lc" value="${esc(l.concepto)}"></div>`).join('')}</div>
          <div class="grid2">
            <label class="fld"><span class="fld-l">Bombeo (importe)</span><input class="in" name="bombeo" type="number" min="0" step="0.01" value="${q && q.bombeo != null ? q.bombeo : ''}"></label>
            <label class="fld"><span class="fld-l">Otros cargos</span><input class="in" name="otros" type="number" min="0" step="0.01" value="${q && q.otros ? q.otros : ''}"><span class="fld-h">Tubería extra, horario, mínimo… (descríbelo abajo).</span></label>
            <label class="chk chk--wa fld--wide"><input type="checkbox" name="iva"${ivaPrev ? ' checked' : ''}><span>Lleva IVA (16 %)</span></label>
            <p class="fld--wide col-sum" data-sum></p>
            <label class="fld"><span class="fld-l">Total con IVA <em>*</em></span><input class="in" name="total" type="number" min="0" step="0.01" value="${q && q.total ? q.total : ''}"><span class="fld-h">Se calcula solo; corrígelo si el proveedor redondeó.</span></label>
            <label class="fld"><span class="fld-l">Vigencia</span><input class="in" name="vig" type="date" value="${esc(q ? q.vigencia : '')}"></label>
            <label class="fld fld--wide"><span class="fld-l">Condiciones</span><textarea class="in" name="cond" rows="3" placeholder="Pago de contado un día antes, confirmar antes de las 15:00, mínimo 6 m³…">${esc(q ? q.condiciones : '')}</textarea></label>
            <label class="fld fld--wide"><span class="fld-l">Archivo de la cotización (PDF o foto)</span><input class="in" name="arch" type="file" accept="application/pdf,image/*" multiple>
              <span class="fld-h">${q && q.archivos.length ? 'Ya tiene: ' + q.archivos.map(a => esc(a.nombre)).join(', ') + '. Lo que subas se agrega.' : 'Se guarda en la carpeta privada de la obra.'}</span></label>
          </div>
        </div></fieldset>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok${!q && !opciones.length ? ' disabled' : ''}>${I.check}<span>Guardar cotización</span></button></footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), err = $('[data-err]', panel);
      let totalTocado = !!(q && q.total);
      const leer = () => {
        const soloBomba = f.tipo.value === 'bombeo';
        $('[data-lineas]', panel).hidden = soloBomba;
        const ls = soloBomba ? [] : $$('[data-l]', panel).map(b => ({ concepto: $('[name=lc]', b).value, volumen: num($('[name=lv]', b).value) || 0, precio: num($('[name=lp]', b).value) || 0 }));
        const conc = ls.reduce((a, l) => a + l.volumen * l.precio, 0), sub = conc + (num(f.bombeo.value) || 0) + (num(f.otros.value) || 0);
        return { ls, conc, sub, tot: Math.round(sub * (f.iva.checked ? 1.16 : 1) * 100) / 100 };
      };
      const pintar = () => { const x = leer(); $('[data-sum]', panel).innerHTML = `Concreto ${money(x.conc)} · subtotal <b>${money(x.sub)}</b> · ${f.iva.checked ? 'con IVA' : 'sin IVA'} <b>${money(x.tot)}</b>${vol && x.conc ? ` · ${money(x.conc / vol)}/m³` : ''}`; if (!totalTocado) f.total.value = x.tot || ''; };
      pintar();
      f.addEventListener('input', e => { api.markDirty(); if (e.target.name === 'total') totalTocado = true; else pintar(); });
      f.iva.addEventListener('change', () => { totalTocado = false; pintar(); });
      f.tipo.addEventListener('change', () => { totalTocado = false; pintar(); });
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        const x = leer(), tot = num(f.total.value);
        if (!(tot > 0)) { err.textContent = 'Escribe el total con IVA.'; return; }
        const pid = q ? q.proveedorId : f.prov && f.prov.value;
        if (!pid) { err.textContent = 'Elige el proveedor.'; return; }
        $('[data-ok]', panel).disabled = true;
        const subidos = [];
        try {
          for (const file of f.arch.files) subidos.push(await R.subirArchivo(c.obraId, 'colado-' + c.id, file));
          const fila = { tipo: f.tipo.value, estado: 'recibida', lineas: f.tipo.value === 'bombeo' ? [] : x.ls.filter(l => l.precio > 0), bombeo: num(f.bombeo.value), otros: num(f.otros.value),
            subtotal: Math.round(x.sub * 100) / 100, total: tot, vigencia: f.vig.value || null, condiciones: f.cond.value.trim(),
            archivos: [...(q ? q.archivos : []), ...subidos.map(({ ruta, nombre }) => ({ ruta, nombre }))] };
          if (q) ok(await sb().from('colado_cotizaciones').update(fila).eq('id', q.id).select('id'));
          else { const d = dirProv(pid) || {}; ok(await sb().from('colado_cotizaciones').insert(Object.assign({ colado_id: c.id, proveedor_id: pid, proveedor: { nombre: nombreProv(pid), rfc: d.rfc || '', razonSocial: d.razonSocial || '' } }, fila)).select('id')); }
        } catch (x2) {
          await R.borrarArchivos(subidos.map(s2 => s2.ruta)).catch(() => {});
          $('[data-ok]', panel).disabled = false; err.textContent = x2.message; return;
        }
        await cargar(true); api.closeDrawer(true); toast('Cotización guardada.'); api.rerender();
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

  /* ---------- Catálogo: proveedores de colado (compras y jefes) ---------- */
  async function drProveedores() {
    await api.refresh(); await cargar();
    if (!C.parte2) { toast('Falta correr 09-colados-cotizaciones.sql en Supabase.'); return; }
    const DIR = api.proveedores().slice().sort((a, b) => api.nombreProveedor(a).localeCompare(api.nombreProveedor(b), 'es'));
    const tarjeta2 = x => { const d = dirProv(x.proveedorId) || { contactos: [] }; return `<fieldset class="fs col-pv" data-pv="${esc(x.proveedorId)}"><legend>${esc(nombreProv(x.proveedorId))}</legend><div class="fs-b">
      <div class="toggles">${['concreto', 'bombeo'].map(t => `<label class="chk chk--pill"><input type="checkbox" name="tipo" value="${t}"${x.tipos.includes(t) ? ' checked' : ''}><span>${TIPO[t]}</span></label>`).join('')}
        <label class="chk chk--wa"><input type="checkbox" name="activo"${x.activo ? ' checked' : ''}><span>Activo</span></label></div>
      <div class="fld"><span class="fld-l">A quién se le manda la solicitud</span>${d.contactos.length ? d.contactos.map(k => `<label class="chk chk--wa"><input type="checkbox" name="ct" value="${esc(k.id)}"${x.contactos.includes(k.id) ? ' checked' : ''}><span>${esc(k.nombre || 'Contacto')}${k.correo ? ' · ' + esc(k.correo) : ''}${k.telefonos.some(t => t.whatsapp) ? ' · WhatsApp' : ''}</span></label>`).join('') : '<p class="muted small">Sin contactos: agrégalos en su ficha del directorio.</p>'}</div>
      <div class="grid2 grid3">
        <label class="fld fld--wide2"><span class="fld-l">Correo de pedidos</span><input class="in" name="correo" type="email" value="${esc(x.correoExtra)}"></label>
        <label class="fld"><span class="fld-l">Confirmar o cancelar concreto (día anterior)</span><input class="in" name="lc" type="time" value="${esc(x.limiteConfirmar)}"></label>
        <label class="fld"><span class="fld-l">Cancelar bomba (día anterior)</span><input class="in" name="lb" type="time" value="${esc(x.limiteBomba)}"></label>
        <label class="fld"><span class="fld-l">Pago liberado (día anterior)</span><input class="in" name="lpago" type="time" value="${esc(x.limitePago)}"></label>
        <label class="fld"><span class="fld-l">Mínimo de concreto (m³)</span><input class="in" name="minc" type="number" min="0" step="0.5" value="${x.minimoM3 ?? ''}"></label>
        <label class="fld"><span class="fld-l">Mínimo de bombeo (m³)</span><input class="in" name="minb" type="number" min="0" step="0.5" value="${x.minimoBombeoM3 ?? ''}"></label>
        <label class="fld"><span class="fld-l">Tubería incluida (m)</span><input class="in" name="tub" type="number" min="0" step="1" value="${x.tuberiaIncluida ?? ''}"></label>
        <label class="fld fld--wide2"><span class="fld-l">Notas</span><input class="in" name="notas" value="${esc(x.notas)}"></label>
      </div>
      <button type="button" class="tbtn tbtn--sm" data-quitar-pv>${I.trash}<span>Quitar de proveedores de colado</span></button>
    </div></fieldset>`; };
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">Programación de colados</p><h2 id="dr-title">Proveedores de colado</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <p class="fld-h">Salen del directorio de proveedores. Marca qué surte cada uno, a qué contactos se les manda la solicitud y sus reglas: con las horas límite la app avisa el día anterior al colado.</p>
        <div class="col-add"><select class="in" name="nuevo"><option value="">Agregar un proveedor del directorio…</option>${DIR.filter(p => !provDe(p.id)).map(p => `<option value="${esc(p.id)}">${esc(api.nombreProveedor(p))}</option>`).join('')}</select></div>
        <div data-lista>${C.provs.map(tarjeta2).join('') || '<p class="muted small" data-vacio>Todavía no hay proveedores de colado.</p>'}</div>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.check}<span>Guardar</span></button></footer>
    </form>`, { wide: true }, panel => {
      const f = $('form', panel), lista = $('[data-lista]', panel), quitar = new Set();
      f.addEventListener('input', api.markDirty);
      f.nuevo.addEventListener('change', () => {
        const id = f.nuevo.value; if (!id) return;
        const v = $('[data-vacio]', lista); if (v) v.remove();
        quitar.delete(id);
        lista.insertAdjacentHTML('afterbegin', tarjeta2({ proveedorId: id, tipos: ['concreto'], contactos: [], correoExtra: '', limiteConfirmar: '', limiteBomba: '', limitePago: '', minimoM3: null, minimoBombeoM3: null, tuberiaIncluida: null, notas: '', activo: true }));
        f.nuevo.querySelector(`option[value="${id}"]`).remove(); f.nuevo.value = ''; api.markDirty();
      });
      lista.addEventListener('click', e => { const b = e.target.closest('[data-quitar-pv]'); if (!b) return; const fs = b.closest('[data-pv]'); if (provDe(fs.dataset.pv)) quitar.add(fs.dataset.pv); fs.remove(); api.markDirty(); });
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const filas = $$('[data-pv]', lista).map(fs => {
          const g = n => fs.querySelector(`[name="${n}"]`);
          return { proveedor_id: fs.dataset.pv, tipos: $$('[name=tipo]:checked', fs).map(i => i.value), contactos: $$('[name=ct]:checked', fs).map(i => i.value), correo_extra: g('correo').value.trim(),
            limite_confirmar: g('lc').value, limite_cancelar_bomba: g('lb').value, limite_pago: g('lpago').value, minimo_m3: num(g('minc').value), minimo_bombeo_m3: num(g('minb').value),
            tuberia_incluida_m: num(g('tub').value), notas: g('notas').value.trim(), activo: g('activo').checked };
        });
        const sinTipo = filas.find(x => !x.tipos.length);
        if (sinTipo) { $('[data-err]', panel).textContent = `Marca si ${nombreProv(sinTipo.proveedor_id)} surte concreto, bombeo o ambos.`; return; }
        $('[data-ok]', panel).disabled = true;
        try {
          if (filas.length) ok(await sb().from('colado_proveedores').upsert(filas).select('proveedor_id'));
          if (quitar.size) ok(await sb().from('colado_proveedores').delete().in('proveedor_id', [...quitar]).select('proveedor_id'));
        } catch (x) { $('[data-ok]', panel).disabled = false; $('[data-err]', panel).textContent = x.message; return; }
        await cargar(); api.closeDrawer(true); toast('Proveedores de colado guardados.'); api.rerender();
      });
    });
  }

  /* ---------- Contador de la barra lateral ---------- */
  let cargado = false;
  function chrome() {
    if (!N.perfil) return;
    if (!cargado) { cargado = true; cargar().then(chrome, () => { }); return; }
    const n = esCoord() ? C.colados.filter(c => c.estado === 'enviada').length
      : rol() === 'compras' ? C.colados.filter(c => c.estado === 'aprobada' && (!elegidas(c).length || urgente(c))).length
        : C.colados.filter(c => ['borrador', 'devuelta'].includes(c.estado) && esResDe(c.obraId)).length;
    $$('[data-ccount]').forEach(el => { el.textContent = n || ''; el.title = esCoord() ? 'Por aprobar' : rol() === 'compras' ? 'Por cotizar o con plazo por vencer' : 'Borradores y devueltos'; });
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
