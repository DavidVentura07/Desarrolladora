/* =========================================================
   GALITHA · Módulo de requisiciones de obra, compras y obras
   Se registra en window.GALITHA_MODULOS; app.js lo arranca con
   su API (panel lateral, avisos, router, directorio). Los datos
   pasan siempre por window.StoreReq (Supabase desde la v0.5).

   Requisición: borrador → enviada → (devuelta → enviada…) → revisada
   - El residente de la obra (o su suplente vigente) la arma y la envía.
   - El coordinador aprueba o rechaza material por material, puede
     devolverla para corregir y termina la revisión.
   - Solo entonces compras la ve y registra cotización, factura y XML;
     compras o Dirección suben el comprobante de pago; en obra se sube
     la remisión. Desde la v0.7 los documentos se suben en cualquier orden.
   Flujo de cada material:
   Requisitado → Autorizado → Cotizado → Facturado → Pagado → Recibido en obra
   ========================================================= */
(window.GALITHA_MODULOS = window.GALITHA_MODULOS || []).push(api => {
  const R = window.StoreReq;
  const N = window.Nube;
  const { esc, norm, ico, I, toast } = api;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');

  /* ---------- Íconos propios del módulo (se suman a los de la app) ---------- */
  Object.assign(I, {
    clip: ico('<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3.5h6v1M9 10h6M9 13.5h6M9 17h3.5"/>'),
    receipt: ico('<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>'),
    building: ico('<path d="M4 21V5.5L12 3v18M12 8.5l8 2.5v10M3 21h18"/><path d="M7.5 8.5v.5M7.5 12v.5M7.5 15.5v.5M15.5 13.5v.5M15.5 17v.5"/>'),
    chart: ico('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'),
    xml: ico('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M10 12l-2 2 2 2M14 12l2 2-2 2"/>'),
    cash: ico('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>'),
    check: ico('<path d="M4.5 12.5l4.5 4.5 10.5-11"/>'),
    truck: ico('<path d="M3 6.5h11v9.5H3zM14 9.5h4l3 3.2V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>'),
    camera: ico('<path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z"/><circle cx="12" cy="13.2" r="3.4"/>'),
    upload: ico('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
    print: ico('<path d="M7 9V3.5h10V9M7 17H4.5V9h15v8H17"/><rect x="7" y="13.5" width="10" height="7"/>'),
    left: ico('<path d="M15 5l-7 7 7 7"/>'),
    right: ico('<path d="M9 5l7 7-7 7"/>'),
    x: ico('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    okc: ico('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.8 2.8L16.2 9.5"/>'),
    bell: ico('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
    office: ico('<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M9 7V5h6v2M3.5 12.5h17"/>'),
    clock: ico('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    send: ico('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>'),
    undo: ico('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    draft: ico('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>')
  });
  I.up = I.up || I.upload;
  const icoSz = (k, px) => I[k].replace('class="ico"', `class="ico" style="width:${px}px;height:${px}px"`);

  /* ---------- Números y fechas ---------- */
  const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const money = n => MXN.format(+n || 0);
  const moneyK = n => (!n ? '$0' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + ' k' : money(n));
  const qty = n => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 });
  // Fecha "AAAA-MM-DD" (local) o marca de tiempo ISO del servidor
  const toDate = s => {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const m = s.split('-'); return new Date(+m[0], +m[1] - 1, +m[2]); }
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const fDate = s => { const d = toDate(s); return d ? `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}` : '—'; };
  const fDateL = s => { const d = toDate(s); return d ? `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : '—'; };
  const fDateT = s => {
    const d = toDate(s); if (!d) return '—';
    let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}, ${h}:${pad(d.getMinutes())} ${ap}`;
  };
  const ddmmyy = s => { const d = toDate(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}` : ''; };
  const today = () => ymd(new Date());

  // Semana ISO (lunes a domingo). El corte del formato en papel va de lunes a sábado.
  function isoWeek(dt) {
    const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { anio: d.getUTCFullYear(), semana: Math.ceil(((d - y0) / 864e5 + 1) / 7) };
  }
  function lunes(anio, semana) {
    const s = new Date(anio, 0, 4); const day = s.getDay() || 7;
    return addDays(s, -day + 1 + (semana - 1) * 7);
  }
  const wkAdd = (w, n) => isoWeek(addDays(lunes(w.anio, w.semana), n * 7));
  const wkKey = w => w.anio * 100 + w.semana;
  const wkRange = w => { const l = lunes(w.anio, w.semana), s = addDays(l, 5); return `${l.getDate()} ${MES[l.getMonth()].slice(0, 3)} – ${s.getDate()} ${MES[s.getMonth()].slice(0, 3)} ${s.getFullYear()}`; };
  // "DEL 28 AL 03 DE OCTUBRE 2026", igual que el formato en papel
  const corte = w => { const l = lunes(w.anio, w.semana), s = addDays(l, 5); return `DEL ${pad(l.getDate())} AL ${pad(s.getDate())} DE ${MES[s.getMonth()].toUpperCase()} ${s.getFullYear()}`; };
  const hoyWk = () => isoWeek(new Date());

  /* ---------- Estados de un material ---------- */
  const EST = [
    { id: 'requisitado', label: 'Requisitado', ico: 'clip' },
    { id: 'autorizado', label: 'Autorizado', ico: 'shield' },
    { id: 'cotizado', label: 'Cotizado', ico: 'file' },
    { id: 'facturado', label: 'Facturado', ico: 'receipt' },
    { id: 'pagado', label: 'Pagado', ico: 'check' },
    { id: 'recibido', label: 'Recibido en obra', ico: 'truck' }
  ];
  // Fuera del flujo: aún no se envía, o el coordinador lo rechazó
  const EXTRA = [
    { id: 'borrador', label: 'Borrador', ico: 'draft' },
    { id: 'rechazado', label: 'Rechazado', ico: 'x' },
    { id: 'nosum', label: 'No se suministró', ico: 'x' }   // v0.8: compras no lo consiguió
  ];
  const TODOS = [...EXTRA.slice(0, 1), ...EST, ...EXTRA.slice(1)];
  const estIdx = id => EST.findIndex(e => e.id === id);
  const st = (id, sm) => { const e = TODOS.find(x => x.id === id) || EST[0]; return `<span class="st st--${e.id}${sm ? ' st--sm' : ''}">${I[e.ico]}${esc(e.label)}</span>`; };
  const UNIDADES = ['PZA', 'TON', 'KG', 'BULTO', 'SACO', 'CUBETAS', 'M3', 'M2', 'ML', 'LT', 'ROLLO', 'JGO', 'SEM', 'SERV'];

  // Estado de la requisición completa
  const REQ_EST = {
    borrador: { label: 'Borrador', cls: 'draft', ico: 'draft' },
    enviada: { label: 'Por revisar', cls: 'wait', ico: 'clock' },
    devuelta: { label: 'Devuelta para corregir', cls: 'ext', ico: 'undo' },
    revisada: { label: 'Revisada', cls: 'ok', ico: 'shield' }
  };
  const reqTag = r => { const e = REQ_EST[r.estado] || REQ_EST.borrador; return `<span class="tagx tagx--${e.cls}">${I[e.ico]}${esc(e.label)}</span>`; };

  /* ---------- Datos: copia en memoria; cada cambio va directo al servidor ---------- */
  let D = R.snapshot();
  async function cargar() {
    try { D = await R.cargar(); }
    catch (e) { toast('No se pudieron cargar las requisiciones: ' + e.message); D = R.snapshot(); }
    return D;
  }
  // Ejecuta un cambio, avisa si falla y recarga
  async function hacer(fn, msgOk) {
    try { await fn(); }
    catch (e) { toast(e.message); await cargar(); return false; }
    await cargar();
    if (msgOk) toast(msgOk);
    return true;
  }
  const obra = id => D.obras.find(o => o.id === id);
  const req = id => D.requisiciones.find(r => r.id === id);
  const compra = id => (id ? D.compras.find(c => c.id === id) : null);
  // Los documentos se suben en cualquier orden (v0.7); el estado es el paso más alto que ya tiene
  const compraEstado = c => (c.remision ? 'recibido' : c.pago ? 'pagado' : c.factura ? 'facturado' : 'cotizado');
  // Filtros del listado de compras (pueden coincidir: una compra recibida puede seguir por pagar)
  const FILTRO_EST = {
    cotizado: c => c.iva && !c.factura, facturado: c => !c.pago && (!!c.factura || !c.iva), pagado: c => !!c.pago, recibido: c => !!c.remision,
    dif: c => diferencias(c).length > 0
  };
  // Diferencias de montos o datos en una compra; se marcan en rojo (cuentan los centavos)
  const cent = v => Math.round((+v || 0) * 100);
  function diferencias(c) {
    const f = c.factura, out = [], emp = D.config.empresa || {};
    if (f && emp.rfc && f.receptorRfc && f.receptorRfc !== emp.rfc) out.push({ doc: 'factura', txt: `La factura está a nombre de ${f.receptorRfc}, no de ${emp.nombre || 'la empresa'} (${emp.rfc}).` });
    if (f && c.cotizacion && c.cotizacion.monto && cent(f.total) !== cent(c.cotizacion.monto)) {
      const d = (cent(f.total) - cent(c.cotizacion.monto)) / 100;
      out.push({ doc: 'factura', txt: `La factura (${money(f.total)}) no coincide con la cotización (${money(c.cotizacion.monto)}): ${money(Math.abs(d))} ${d > 0 ? 'más' : 'menos'}.` });
    }
    const ref = f ? f.total : c.cotizacion ? c.cotizacion.monto : 0;
    if (c.pago && ref && cent(c.pago.monto) !== cent(ref)) {
      const d = (cent(c.pago.monto) - cent(ref)) / 100;
      out.push({ doc: 'pago', txt: `El pago (${money(c.pago.monto)}) no coincide con ${f ? 'la factura' : 'la cotización'} (${money(ref)}): ${money(Math.abs(d))} ${d > 0 ? 'más' : 'menos'}.` });
    }
    return out;
  }
  function estado(r, p) {
    if (r.estado === 'borrador') return 'borrador';
    if (p.aprobacion === 'rechazada') return 'rechazado';
    if (p.aprobacion !== 'aprobada') return 'requisitado';
    if (p.suministro === 'no_suministrado') return 'nosum';
    const c = compra(p.compraId);
    return c ? compraEstado(c) : 'autorizado';
  }
  // Una sola fecha de suministro por requisición (v0.7); la fecha propia por material ya no se usa
  const suministro = r => r.fechaSuministro;
  const entrega = p => { const c = compra(p.compraId); return c ? (c.entregas && c.entregas[p.id]) || c.fechaEntrega : ''; };
  const stats = r => { const s = {}; TODOS.forEach(e => { s[e.id] = 0; }); r.partidas.forEach(p => { s[estado(r, p)]++; }); return s; };
  const comprasDe = r => D.compras.filter(c => c.requisicionId === r.id);
  const montoCompra = c => (c.factura ? c.factura.total : c.cotizacion ? c.cotizacion.monto : 0);
  const montoReq = r => comprasDe(r).reduce((a, c) => a + montoCompra(c), 0);
  const seguros = s => s.pagado + s.recibido;
  const vivos = (r, s) => r.partidas.length - s.rechazado - s.nosum; // materiales que siguen en el flujo
  function findPartida(pid) { for (const r of D.requisiciones) { const p = r.partidas.find(x => x.id === pid); if (p) return p; } return null; }

  // Liga con el directorio: por id (si se eligió del directorio) o por nombre
  function enDirectorio(c) {
    const DIR = api.proveedores();
    if (c.proveedor.id) { const p = DIR.find(x => x.id === c.proveedor.id); if (p) return p; }
    const n = norm(c.proveedor.nombre); if (!n) return null;
    return DIR.find(p => { const a = norm(p.nombreComercial || p.razonSocial); return a && (a === n || (a.length > 3 && n.includes(a)) || (n.length > 3 && a.includes(n))); })
      || (c.proveedor.rfc ? DIR.find(p => p.rfc && p.rfc === c.proveedor.rfc) : null) || null;
  }
  const iniciales = s => String(s || '').replace(/\(.*?\)|S\.?A\.?|C\.?V\.?|DE /gi, ' ').trim().split(/\s+/).filter(w => /^[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '·';
  const tono = s => 't' + ([...String(s)].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 5);

  /* ---------- Permisos según el rol de la sesión (la base de datos los vuelve a revisar) ---------- */
  const rol = () => (N.perfil || {}).rol;
  const yoId = () => (N.perfil || {}).id;
  const yo = () => { const p = N.perfil || {}; return p.nombre || p.correo || ''; };
  const esJefe = () => ['direccion', 'admin'].includes(rol());
  const esAdmin = () => rol() === 'admin';   // solo el admin técnico corrige requisiciones ya enviadas (v0.7)
  const esCoord = () => esJefe() || rol() === 'coordinador';
  const esCompras = () => esJefe() || rol() === 'compras';
  const soloResidente = () => rol() === 'residente';
  // Titular de la obra o suplente con la fecha de hoy dentro de su periodo
  const esResDe = id => {
    const o = obra(id); if (!o) return false;
    if (o.residenteId && o.residenteId === yoId()) return true;
    const h = today();
    return o.suplentes.some(s => s.perfilId === yoId() && s.desde <= h && h <= s.hasta);
  };
  const puedeEditarReq = id => esCoord() || esResDe(id);
  const puedeRemision = id => esCompras() || esResDe(id);
  // El residente solo ve sus obras (la base de datos ya filtra requisiciones y compras)
  const visibleObra = id => !soloResidente() || esResDe(id);
  const obrasMias = () => D.obras.filter(o => visibleObra(o.id));

  /* ---------- Estado de la interfaz (por sesión) ---------- */
  const UI = Object.assign({ wk: null, obra: '', tipo: 'todas', cObra: '', cWk: '', cEst: 'todas', q: '', chObra: '' },
    (() => { try { return JSON.parse(sessionStorage.getItem('galitha.req.ui')) || {}; } catch { return {}; } })());
  const saveUI = () => { try { sessionStorage.setItem('galitha.req.ui', JSON.stringify(UI)); } catch { } };
  const curWk = () => UI.wk || hoyWk();

  const ligarHrefs = sec => $$('[data-href]', sec).forEach(el => {
    el.addEventListener('click', e => { if (e.target.closest('a, button, input, select, label')) return; location.hash = el.dataset.href; });
    el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === el) location.hash = el.dataset.href; });
  });

  function sinDatos(titulo) {
    const txt = esJefe()
      ? 'Cada requisición pertenece a una obra y a una semana. Agrega la primera obra y asígnale su residente.'
      : soloResidente()
        ? 'Todavía no tienes una obra asignada. Pide a Dirección o al admin técnico que te asignen como residente.'
        : 'Todavía no hay obras registradas. Dirección o el admin técnico las dan de alta.';
    return {
      title: titulo,
      html: `<section class="page"><div class="empty rv">
        <div class="empty-mark">${api.markSVG()}</div>
        <h2 class="h2">${soloResidente() ? 'Sin obra asignada' : 'Empieza por las obras'}</h2>
        <p class="muted">${txt}</p>
        ${esJefe() ? `<div class="empty-acts"><button class="btn btn--solid" type="button" data-act="nueva-obra">${I.plus}<span>Agregar obra</span></button></div>` : ''}
      </div></section>`,
      bind() { }
    };
  }

  /* =========================================================
     REQUISICIONES (por obra y por semana)
     ========================================================= */
  async function pageReqs() {
    await api.refresh(); await cargar();
    if (!obrasMias().length) return sinDatos('Requisiciones');
    const w = curWk(), hw = hoyWk();
    const obras = obrasMias().filter(o => (soloResidente() || !UI.obra || o.id === UI.obra) && o.estatus !== 'cerrada');
    const delWk = D.requisiciones.filter(r => r.anio === w.anio && r.semana === w.semana && obras.some(o => o.id === r.obraId) && (UI.tipo === 'todas' || r.tipo === UI.tipo));
    const mats = delWk.reduce((a, r) => a + r.partidas.length, 0);
    const seg = delWk.reduce((a, r) => a + seguros(stats(r)), 0);
    const porRev = D.requisiciones.filter(r => r.estado === 'enviada' && obras.some(o => o.id === r.obraId)).length;
    const ext = delWk.filter(r => r.tipo === 'extraordinaria').length;
    const esHoy = wkKey(w) === wkKey(hw);

    const grupos = obras.map((o, gi) => {
      const rs = delWk.filter(r => r.obraId === o.id).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'ordinaria' ? -1 : 1));
      const res = o.residente || {};
      const sup = o.suplentes.find(s => s.desde <= today() && today() <= s.hasta);
      return `<section class="ogroup">
        <div class="ogroup-h rv" style="--d:${120 + gi * 60}">
          <span class="p-av">${esc(api.iniciales(res.nombre))}</span>
          <div><h2>${esc(o.nombre)}</h2><p class="sub">Residente: ${esc(res.nombre || 'sin asignar')}${sup ? ` · suplente: ${esc(sup.nombre)} hasta el ${esc(fDate(sup.hasta))}` : ''}</p></div>
        </div>
        <div class="rgrid">${rs.length ? rs.map((r, i) => rcard(r, 160 + gi * 60 + i * 50)).join('') : `
          <div class="empty empty--sm rv r-empty" style="--d:${180 + gi * 60}">
            <p class="h3">Sin requisición esta semana</p>
            <p class="muted small">La requisición ordinaria se envía el lunes antes de las 4 pm.</p>
            ${puedeEditarReq(o.id) ? `<div class="empty-acts"><button class="btn" type="button" data-nueva-en="${esc(o.id)}">${I.plus}<span>Crear requisición</span></button></div>` : ''}
          </div>`}</div>
      </section>`;
    }).join('');

    const hist = D.requisiciones.filter(r => obras.some(o => o.id === r.obraId)).sort((a, b) => wkKey(b) - wkKey(a) || a.folio.localeCompare(b.folio));

    return {
      title: 'Requisiciones',
      html: `<section class="page">
        <section class="hero">
          <div class="hero-main rv" style="--d:0">
            <div class="deco">${api.markSVG()}</div>
            <div>
              <p class="h-eyebrow">Semana ${w.semana} · ${esc(wkRange(w))}${esHoy ? ' · semana en curso' : ''}</p>
              <h1>Requisiciones<br>de obra</h1>
            </div>
            <p class="h-sum"><span class="h-count"><b>${delWk.length}</b> ${delWk.length === 1 ? 'requisición' : 'requisiciones'} · <b>${mats}</b> materiales</span>
              <span class="pill">${obras.length} ${obras.length === 1 ? 'obra' : 'obras'}</span>
              ${ext ? `<span class="pill">${ext} extraordinaria${ext > 1 ? 's' : ''}</span>` : ''}</p>
          </div>
          <div class="sqs-h">
            <div class="sq sq--ok rv" style="--d:80">
              <p>Materiales pagados<br>esta semana</p>
              <div class="sq-row"><strong>${seg}<span class="sq-de">/${mats}</span></strong><small>Pagado = ya es seguro</small></div>
            </div>
            <div class="sq sq--sun rv" style="--d:140">
              <p>Por revisar</p>
              <div class="sq-row"><strong>${porRev}</strong><small>${porRev === 1 ? 'requisición espera' : 'requisiciones esperan'} al coordinador de obra</small></div>
            </div>
          </div>
        </section>

        <div class="tools-top rv" style="--d:100">
          <h2 class="h-sec">Semana</h2>
          <div class="wk">
            <button type="button" data-wk="-1" aria-label="Semana anterior">${I.left}</button>
            <div class="wk-l"><b>Semana ${w.semana}</b><small>${esc(wkRange(w))}</small></div>
            <button type="button" data-wk="1" aria-label="Semana siguiente">${I.right}</button>
            ${esHoy ? '' : '<button type="button" class="wk-hoy" data-wk="0">Hoy</button>'}
          </div>
          <div class="filterbar r-fb">
            ${!soloResidente() && obrasMias().length > 1
              ? `<label class="psel${UI.obra ? ' on' : ''}"><span class="sr">Obra</span><select data-rf="obra"><option value="">Obra: todas</option>${obrasMias().map(o => `<option value="${esc(o.id)}"${UI.obra === o.id ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>` : ''}
            <div class="seg" role="group" aria-label="Tipo">${[['todas', 'Todas'], ['ordinaria', 'Ordinarias'], ['extraordinaria', 'Extraordinarias']].map(([k, l]) => `<button type="button" data-tipo="${k}" aria-pressed="${UI.tipo === k}">${l}</button>`).join('')}</div>
          </div>
        </div>

        ${grupos || '<div class="empty empty--sm"><p class="h3">No hay obras activas</p><a class="btn" href="#/obras">Ver obras</a></div>'}

        <section class="panel hist rv" style="--d:200">
          <header class="panel-h"><h2>Historial por semana <span class="n">${hist.length}</span></h2></header>
          <div class="panel-b panel-b--flush">
            <div class="tablewrap">
            <table class="tbl">
              <thead><tr><th class="pl">Semana</th><th>Folio</th><th>Obra</th><th>Tipo</th><th>Estado</th><th>Materiales</th><th>Avance</th><th>Pagados</th><th class="pr num">Monto</th></tr></thead>
              <tbody>${hist.map(r => {
                const s = stats(r), n = r.partidas.length, v = vivos(r, s);
                return `<tr class="row" data-href="#/r/${esc(r.id)}">
                  <td class="pl"><b>S${r.semana}</b> <span class="muted small">${esc(wkRange(r))}</span></td>
                  <td><b>${esc(r.folio)}</b></td>
                  <td>${esc((obra(r.obraId) || {}).nombre || '—')}</td>
                  <td>${tipoTag(r)}</td>
                  <td>${reqTag(r)}</td>
                  <td>${n}</td>
                  <td>${sbar(s, n)}</td>
                  <td class="pct">${v ? Math.round(seguros(s) / v * 100) : 0}%</td>
                  <td class="pr num">${money(montoReq(r))}</td>
                </tr>`;
              }).join('') || '<tr><td colspan="9" class="pl muted">Todavía no hay requisiciones.</td></tr>'}</tbody>
            </table>
            </div>
          </div>
        </section>
      </section>`,
      bind(sec) {
        $$('[data-wk]', sec).forEach(b => b.addEventListener('click', () => {
          const n = +b.dataset.wk;
          UI.wk = n === 0 ? null : wkAdd(curWk(), n);
          saveUI(); api.rerender();
        }));
        $$('[data-tipo]', sec).forEach(b => b.addEventListener('click', () => { UI.tipo = b.dataset.tipo; saveUI(); api.rerender(); }));
        const so = $('[data-rf="obra"]', sec);
        if (so) so.addEventListener('change', () => { UI.obra = so.value; saveUI(); api.rerender(); });
        $$('[data-nueva-en]', sec).forEach(b => b.addEventListener('click', () => drReq(null, b.dataset.nuevaEn)));
        ligarHrefs(sec);
      }
    };
  }

  function sbar(s, n) {
    if (!n) return '<div class="sbar"></div>';
    return `<div class="sbar" role="img" aria-label="${TODOS.filter(e => s[e.id]).map(e => `${s[e.id]} ${e.label.toLowerCase()}`).join(', ')}">${TODOS.filter(e => s[e.id]).map(e => `<i class="b-${e.id}" style="flex:${s[e.id]}"></i>`).join('')}</div>`;
  }
  const slegend = s => `<div class="slegend">${TODOS.filter(e => s[e.id]).map(e => `<span><i class="b-${e.id}"></i>${s[e.id]} ${esc(e.label.toLowerCase())}</span>`).join('')}</div>`;
  const tipoTag = r => (r.tipo === 'extraordinaria' ? '<span class="tagx tagx--ext">Extraordinaria</span>' : '<span class="tagx">Ordinaria</span>');
  const cuando = r => (r.estado === 'borrador' ? `creada ${fDateT(r.creadaEn)}` : r.estado === 'devuelta' ? `devuelta ${fDateT(r.devueltaEn)}` : `enviada ${fDateT(r.enviadaEn)}`);

  function rcard(r, d) {
    const s = stats(r), n = r.partidas.length;
    return `<article class="card rcard rv" style="--d:${d}" data-href="#/r/${esc(r.id)}" tabindex="0">
      <div class="c-top">
        <span class="r-ic${r.tipo === 'extraordinaria' ? ' r-ic--ext' : ''}">${I.clip}</span>
        <div class="c-id"><a class="pname" href="#/r/${esc(r.id)}">${esc(r.folio)}</a><span class="sub">${r.tipo === 'extraordinaria' ? 'Extraordinaria' : 'Ordinaria'} · ${esc(cuando(r))}</span></div>
        ${reqTag(r)}
      </div>
      <div class="r-nums">
        <div><small>Materiales</small><b>${n}</b></div>
        <div><small>Pagados</small><b>${seguros(s)} de ${vivos(r, s)}</b></div>
        <div><small>Suministro</small><b>${esc(fDate(r.fechaSuministro))}</b></div>
      </div>
      <div>${sbar(s, n)}${slegend(s)}</div>
    </article>`;
  }

  /* ---------- Detalle de una requisición ---------- */
  async function pageReq({ id }) {
    await api.refresh(); await cargar();
    const r = req(id);
    if (!r) return noEncontrado('Requisición no encontrada', 'No existe, se borró o no tienes acceso a esa obra.', '#/requisiciones', 'Requisiciones');
    const o = obra(r.obraId) || {}, s = stats(r), n = r.partidas.length;
    const editable = ['borrador', 'devuelta'].includes(r.estado) && puedeEditarReq(r.obraId);
    const revisando = r.estado === 'enviada' && esCoord();
    const pend = r.partidas.filter(p => p.aprobacion === 'pendiente').length;
    const sel = r.estado === 'revisada' && esCompras();
    const aviso = {
      borrador: editable ? 'Es un borrador: el coordinador de obra no lo revisa hasta que lo envíes. Puedes editarlo cuantas veces quieras.' : 'Es un borrador: todavía no se envía.',
      enviada: revisando ? `Revisa cada material y apruébalo o recházalo. ${pend ? `Faltan <b>${pend}</b>.` : 'Ya revisaste todos: termina la revisión para que compras pueda cotizarlos.'}` : 'El coordinador de obra la está revisando. Lo que falte va en una requisición extraordinaria.',
      devuelta: `<b>El coordinador la devolvió para corregir${r.devueltaPor ? ` (${esc(r.devueltaPor)})` : ''}:</b> ${esc(r.comentarioRevision || 'sin comentario')}${editable ? ' — Corrígela y vuelve a enviarla.' : ''}`,
      revisada: ''
    }[r.estado];
    return {
      title: r.folio,
      html: `<section class="page">
        <a class="back rv" href="#/requisiciones">${I.back}<span>Requisiciones</span></a>
        <header class="d-hero rv" style="--d:40">
          <div class="d-top">
            <span class="av av--xl ${r.tipo === 'extraordinaria' ? 't1' : 't0'}">${icoSz('clip', 36)}</span>
            <div class="d-title">
              <div class="d-tags">${tipoTag(r)} ${reqTag(r)}</div>
              <h1 class="title title--d">${esc(r.folio)}</h1>
              <p class="d-sub"><span>${esc(o.nombre || '')}</span><span>Semana ${r.semana} · ${esc(wkRange(r))}</span><span>Hizo: ${esc(r.creadaPor || '—')}</span></p>
            </div>
            <div class="d-actions">
              <button class="btn" type="button" data-pdf>${I.print}<span>PDF</span></button>
              <button class="btn" type="button" data-xls>${I.vTabla}<span>Excel</span></button>
              ${editable ? `<button class="btn" type="button" data-edit>${I.edit}<span>Editar</span></button>` : ''}
              ${esAdmin() ? `<button class="btn" type="button" data-mover title="Mover la requisición y sus compras a otra semana">${I.left}<span>Mover de semana</span></button>` : ''}
              ${!editable && esAdmin() && ['enviada', 'revisada'].includes(r.estado) ? `<button class="btn" type="button" data-corregir title="Corrección del admin técnico: queda en la bitácora">${I.edit}<span>Corregir</span></button>` : ''}
              ${editable && r.estado === 'borrador' ? `<button class="ibtn ibtn--line" type="button" data-borrar title="Borrar borrador" aria-label="Borrar borrador">${I.trash}</button>` : ''}
              ${editable ? `<button class="btn btn--solid" type="button" data-enviar>${I.send}<span>${r.estado === 'devuelta' ? 'Reenviar' : 'Enviar'}</span></button>` : ''}
              ${revisando ? `<button class="btn" type="button" data-devolver>${I.undo}<span>Devolver para corregir</span></button>
                <button class="btn btn--solid" type="button" data-terminar${pend ? ' disabled' : ''} title="${pend ? 'Primero aprueba o rechaza todos los materiales' : ''}">${I.shield}<span>Terminar revisión</span></button>` : ''}
            </div>
          </div>
          <div class="quickbar r-meta-bar">
            <span><span class="muted">Enviada</span> <b>${r.enviadaEn ? esc(fDateT(r.enviadaEn)) : 'aún no'}</b></span>
            <span><span class="muted">Revisada</span> <b>${r.revisadaEn ? esc(fDateT(r.revisadaEn)) + ' · ' + esc(r.revisadaPor || '') : 'pendiente'}</b></span>
            <span><span class="muted">Suministro solicitado</span> <b>${esc(fDateL(r.fechaSuministro))}</b></span>
            ${r.avisos.length ? `<span class="r-aviso">${I.mail}<span class="muted">${esc(AVISO_EV[r.avisos[0].evento] || 'Aviso')}</span> <b>${esc(r.avisos[0].para.map(x => x.nombre || x.correo).join(', '))} · ${esc(fDateT(r.avisos[0].en))}</b></span>` : ''}
            ${r.nota ? `<span class="muted">${esc(r.nota)}</span>` : ''}
          </div>
        </header>

        <div class="pipe">${EST.map((e, i) => `<div class="rv${s[e.id] ? '' : ' zero'}" style="--d:${80 + i * 40}">${st(e.id, true)}<b>${s[e.id]}</b></div>`).join('')}</div>

        ${aviso ? `<div class="note${r.estado === 'devuelta' ? '' : ' note--info'} rv" style="--d:120">${I[r.estado === 'devuelta' ? 'alert' : 'clip']}<p>${aviso}</p></div>` : ''}

        <section class="panel rv" style="--d:160">
          <header class="panel-h"><h2>Materiales <span class="n">${n}</span></h2>${sel && s.autorizado ? '<span class="muted small">Selecciona los autorizados para registrar su cotización</span>' : ''}${s.rechazado ? `<span class="muted small">${s.rechazado} rechazado${s.rechazado > 1 ? 's' : ''}</span>` : ''}</header>
          <div class="panel-b panel-b--flush">
            <div class="tablewrap">
            <table class="tbl rtbl">
              <thead><tr>${sel ? '<th class="c-ck"></th>' : ''}<th class="c-n">#</th><th>Insumo</th><th class="num">Cantidad</th><th>Unidad</th><th>¿Dónde se empleará?</th><th>Proveedor</th><th>Entrega</th><th>${revisando ? 'Revisión' : 'Estado'}</th></tr></thead>
              <tbody>${r.partidas.map((p, i) => {
                const e = estado(r, p), c = compra(p.compraId), ent = entrega(p);
                const ovE = c && c.entregas && c.entregas[p.id];
                const rev = revisando ? `<div class="rev" role="group" aria-label="Revisión de ${esc(p.insumo)}">
                    <button type="button" class="rev-b rev-ok" data-rev="aprobada" aria-pressed="${p.aprobacion === 'aprobada'}" title="Aprobar">${I.check}<span>Aprobar</span></button>
                    <button type="button" class="rev-b rev-no" data-rev="rechazada" aria-pressed="${p.aprobacion === 'rechazada'}" title="Rechazar">${I.close}<span>Rechazar</span></button>
                  </div>` : st(e, true);
                return `<tr class="row${p.aprobacion === 'rechazada' ? ' is-off' : ''}" data-pid="${esc(p.id)}">
                  ${sel ? `<td class="c-ck">${e === 'autorizado' ? `<input class="ck" type="checkbox" value="${esc(p.id)}" aria-label="Seleccionar ${esc(p.insumo)}">` : ''}</td>` : ''}
                  <td class="c-n">${i + 1}</td>
                  <td class="ins"><b>${esc(p.insumo)}</b>${p.observaciones ? `<small>${esc(p.observaciones)}</small>` : ''}${p.aprobacion === 'rechazada' && p.motivoRechazo ? `<small class="rej">Rechazado: ${esc(p.motivoRechazo)}</small>` : ''}${sumNota(p)}</td>
                  <td class="c-q">${qty(p.cantidad)}</td>
                  <td>${esc(p.unidad)}</td>
                  <td class="small">${esc(p.destino) || '<span class="muted">—</span>'}</td>
                  <td class="c-prov">${c ? `<a href="#/c/${esc(c.id)}">${esc(c.proveedor.nombre)}</a>` : '<span class="muted">—</span>'}</td>
                  <td class="c-dt">${ent ? esc(fDate(ent)) + (ovE ? '<em>propia</em>' : '') : '<span class="muted">—</span>'}</td>
                  <td>${rev}</td>
                </tr>`;
              }).join('')}</tbody>
            </table>
            </div>
          </div>
        </section>
        <div class="selbar" hidden><span><b data-nsel>0</b> materiales seleccionados</span><button class="btn btn--solid" type="button" data-cot>${I.file}<span>Registrar cotización elegida</span></button></div>
      </section>`,
      bind(sec) {
        $('[data-pdf]', sec).addEventListener('click', () => imprimir(r));
        $('[data-xls]', sec).addEventListener('click', () => excel(r));
        const on = (sel, fn) => { const b = $(sel, sec); if (b) b.addEventListener('click', fn); };
        on('[data-edit]', () => drReq(r));
        on('[data-corregir]', () => drReq(r, null, { correccion: true }));
        on('[data-mover]', async () => {
          const ncs = comprasDe(r).length;
          const w = await pedirSemana(r, 'Mover de semana', `Se mueve <b>${esc(r.folio)}</b>${ncs ? ` con sus ${ncs} ${ncs === 1 ? 'compra' : 'compras'}` : ''}. El folio cambia a la nueva semana.`);
          if (!w) return;
          if (r.tipo === 'ordinaria' && D.requisiciones.some(x => x.id !== r.id && x.obraId === r.obraId && x.tipo === 'ordinaria' && x.anio === w.anio && x.semana === w.semana)) { toast('Esa semana ya tiene una requisición ordinaria de esta obra.'); return; }
          let folio = '';
          if (await hacer(async () => { folio = await R.moverRequisicion(r.id, w.anio, w.semana); }, '')) { toast(`Movida a la semana ${w.semana}: ${folio}.`); UI.wk = { anio: w.anio, semana: w.semana }; saveUI(); api.rerender(); }
        });
        on('[data-enviar]', async () => {
          if (!(await api.confirmar({ titulo: r.estado === 'devuelta' ? 'Reenviar requisición' : 'Enviar requisición', texto: `Se enviará <b>${esc(r.folio)}</b> con ${n} materiales al coordinador de obra, con aviso por correo. Después ya no podrás modificarla; lo que falte irá en una extraordinaria.`, ok: 'Enviar' }))) return;
          if (await hacer(() => R.cambiarEstado(r.id, 'enviada'), 'Requisición enviada. Avisando al coordinador por correo…')) { api.rerender(); avisar(r.id, 'enviada'); }
        });
        on('[data-borrar]', async () => {
          if (!(await api.confirmar({ titulo: 'Borrar borrador', texto: `Se borrará <b>${esc(r.folio)}</b> con sus ${n} materiales.`, ok: 'Borrar', peligro: true }))) return;
          if (await hacer(() => R.borrarRequisicion(r.id), 'Borrador eliminado.')) location.hash = '#/requisiciones';
        });
        on('[data-devolver]', async () => {
          const c = await api.preguntar({ titulo: 'Devolver para corregir', texto: `El residente podrá corregir <b>${esc(r.folio)}</b> y volver a enviarla. Lo que ya aprobaste se conserva, salvo los materiales que cambie.`, etiqueta: '¿Qué debe corregir?', campo: 'area', ok: 'Devolver', requerido: true });
          if (c == null) return;
          if (await hacer(() => R.cambiarEstado(r.id, 'devuelta', c), 'Requisición devuelta. Avisando al residente por correo…')) { api.rerender(); avisar(r.id, 'devuelta'); }
        });
        on('[data-terminar]', async () => {
          const ap = r.partidas.filter(p => p.aprobacion === 'aprobada').length;
          if (!(await api.confirmar({ titulo: 'Terminar revisión', texto: `Quedan <b>${ap}</b> materiales aprobados y <b>${n - ap}</b> rechazados. Compras podrá cotizar los aprobados.${n - ap ? ' Al residente le llega un correo con los rechazados y sus motivos.' : ''}`, ok: 'Terminar revisión' }))) return;
          if (await hacer(() => R.cambiarEstado(r.id, 'revisada'), 'Revisión terminada: compras ya puede cotizar.')) { api.rerender(); if (n - ap) avisar(r.id, 'revisada'); }
        });
        // Aprobar o rechazar material por material
        $$('[data-rev]', sec).forEach(b => b.addEventListener('click', async e => {
          e.stopPropagation();
          const pid = b.closest('tr').dataset.pid, p = r.partidas.find(x => x.id === pid), v = b.dataset.rev;
          if (p.aprobacion === v) return;
          let motivo = '';
          if (v === 'rechazada') {
            motivo = await api.preguntar({ titulo: 'Rechazar material', texto: `<b>${esc(p.insumo)}</b> · ${qty(p.cantidad)} ${esc(p.unidad)}`, etiqueta: 'Motivo (lo verá el residente)', campo: 'area', ok: 'Rechazar', peligro: true });
            if (motivo == null) return;
          }
          b.disabled = true;
          if (await hacer(() => R.revisarPartida(pid, v, motivo))) api.rerender();
        }));
        const bar = $('.selbar', sec);
        const upd = () => { const k = $$('.ck:checked', sec).length; bar.hidden = !k; $('[data-nsel]', sec).textContent = k; };
        $$('.ck', sec).forEach(c => c.addEventListener('change', upd));
        $('[data-cot]', sec).addEventListener('click', () => drCotizacion(r, $$('.ck:checked', sec).map(c => c.value)));
        $$('tr[data-pid]', sec).forEach(tr => tr.addEventListener('click', e => {
          if (e.target.closest('a, input, button')) return;
          drMaterial(r, r.partidas.find(p => p.id === tr.dataset.pid));
        }));
      }
    };
  }

  // v0.8: lo que marcó compras sobre el suministro de un material (lo ve también el residente)
  const sumNota = p => p.suministro === 'sustituido'
    ? `<small class="sust">Se cambió por: <b>${esc(p.sustituto)}</b>${p.notaSuministro ? ' · ' + esc(p.notaSuministro) : ''}</small>`
    : p.suministro === 'no_suministrado' ? `<small class="rej">No se pudo suministrar${p.notaSuministro ? ': ' + esc(p.notaSuministro) : ''}</small>` : '';
  // Pide año y semana (por defecto, la semana anterior)
  async function pedirSemana(x, titulo, texto) {
    const prev = wkAdd({ anio: x.anio, semana: x.semana }, -1);
    const v = await api.preguntar({ titulo, texto: texto + ` Ahora está en la semana <b>${x.semana}</b> de ${x.anio}.`, etiqueta: 'Nueva semana (1 a 53)', campo: 'numero', valor: String(prev.semana), ok: 'Mover', requerido: true });
    if (v == null) return null;
    const n = parseInt(v, 10);
    if (!(n >= 1 && n <= 53)) { toast('Escribe una semana del 1 al 53.'); return null; }
    if (n === x.semana) return null;
    // si pasa de la semana 1 a la 52/53 se entiende del año anterior (y al revés)
    const anio = n - x.semana > 26 ? x.anio - 1 : x.semana - n > 26 ? x.anio + 1 : x.anio;
    return { anio, semana: n };
  }

  // Correo automático de la requisición; si falla, el cambio de estado ya quedó guardado
  const AVISO_EV = { enviada: 'Correo al coordinador', devuelta: 'Correo de devolución', revisada: 'Correo de rechazos' };
  async function avisar(id, evento) {
    try {
      const x = await R.avisarRequisicion(id, evento);
      if (!x || x.omitido) return;
      toast(`Correo enviado a ${x.aviso.para.map(p => p.nombre || p.correo).join(' y ')}.`);
      await cargar();
      if (location.hash === '#/r/' + id) api.rerender();
    } catch (e) {
      toast(`Quedó guardado, pero no salió el correo: ${e.message}`);
    }
  }

  /* =========================================================
     COMPRAS Y FACTURAS
     ========================================================= */
  async function pageCompras() {
    await api.refresh(); await cargar();
    if (!obrasMias().length && !D.compras.length) return sinDatos('Compras y facturas');
    const hw = hoyWk();
    const vis = D.compras.filter(c => visibleObra(c.obraId));
    const obraF = UI.cObra;
    const q = norm(UI.q);
    const lista = vis.filter(c => (!obraF || c.obraId === obraF)
      && (!UI.cWk || String(wkKey(c)) === UI.cWk)
      && (!FILTRO_EST[UI.cEst] || FILTRO_EST[UI.cEst](c))
      && (!q || norm([c.proveedor.nombre, c.proveedor.rfc, c.factura && (c.factura.serie + ' ' + c.factura.folio), c.factura && c.factura.uuid,
        ...c.partidas.map(pid => (findPartida(pid) || {}).insumo)].filter(Boolean).join(' ')).includes(q)))
      .sort((a, b) => wkKey(b) - wkKey(a) || montoCompra(b) - montoCompra(a));
    const pagadas = vis.filter(c => c.pago);
    const totalPag = pagadas.reduce((a, c) => a + c.pago.monto, 0);
    const pagWkL = pagadas.filter(c => wkKey(c) === wkKey(hw));
    const porPagarM = vis.filter(c => c.factura && !c.pago).reduce((a, c) => a + c.factura.total, 0);
    const conDif = vis.filter(c => diferencias(c).length).length;
    const semanas = [...new Set(vis.map(c => wkKey(c)))].sort((a, b) => b - a);
    const varias = obrasMias().length > 1;

    const porWk = {};
    lista.forEach(c => { (porWk[wkKey(c)] = porWk[wkKey(c)] || []).push(c); });
    let di = 0;
    const grupos = Object.keys(porWk).sort((a, b) => b - a).map(k => {
      const cs = porWk[k], w = { anio: Math.floor(k / 100), semana: k % 100 };
      const tot = cs.reduce((a, c) => a + montoCompra(c), 0);
      return `<section class="ogroup">
        <div class="ogroup-h rv" style="--d:${Math.min(di++ * 40, 400)}"><div><h2>Semana ${w.semana}</h2><p class="sub">${esc(wkRange(w))} · ${cs.length} ${cs.length === 1 ? 'compra' : 'compras'} · ${money(tot)}</p></div></div>
        <div class="cards cards--ancho">${cs.map(c => ccard(c, Math.min(di++ * 40, 500))).join('')}</div>
      </section>`;
    }).join('');

    return {
      title: 'Compras y facturas',
      html: `<section class="page">
        <section class="hero">
          <div class="hero-main rv" style="--d:0">
            <div class="deco">${api.markSVG()}</div>
            <div><p class="h-eyebrow">Cotización elegida → factura y XML → pago → remisión</p><h1>Compras<br>y facturas</h1></div>
            <p class="h-sum"><span class="h-count">Pagado en total: <b class="h-money">${money(totalPag)}</b></span><span class="pill">${pagadas.length} pagos</span><span class="pill">${vis.filter(c => c.factura && c.factura.uuid).length} XML leídos</span></p>
          </div>
          <div class="sqs-h">
            <div class="sq sq--ok rv" style="--d:80"><p>Pagado<br>semana ${hw.semana}</p><div class="sq-row"><strong class="sq-money">${moneyK(pagWkL.reduce((a, c) => a + c.pago.monto, 0))}</strong><small>${pagWkL.length} ${pagWkL.length === 1 ? 'pago' : 'pagos'}</small></div></div>
            <div class="sq sq--sun rv" style="--d:140"><p>Facturado<br>por pagar</p><div class="sq-row"><strong class="sq-money">${moneyK(porPagarM)}</strong><button class="sq-go" type="button" data-est-go="facturado" aria-label="Ver lo que falta pagar">${I.arrow}</button></div></div>
          </div>
        </section>

        <section class="panel rv chart-panel" style="--d:120">
          <header class="panel-h"><h2>Erogaciones por semana</h2>
            ${varias ? `<label class="psel psel--sm${UI.chObra ? ' on' : ''}"><span class="sr">Obra de la gráfica</span><select data-rf="chObra"><option value="">Todas las obras</option>${obrasMias().map(o => `<option value="${esc(o.id)}"${UI.chObra === o.id ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>` : ''}
          </header>
          <div class="panel-b"><div class="chart-grid"><div class="chart-wrap" data-chart></div><div class="chart-side" data-chart-side></div></div>
          <p class="muted small chart-nota">Pagos registrados, agrupados por la semana de su requisición. Es la base del futuro control de erogaciones y avance de obra.</p></div>
        </section>

        <div class="tools-top rv" style="--d:160">
          <h2 class="h-sec">Compras</h2>
          <label class="search">${I.search}<input type="search" data-q placeholder="Proveedor, folio, UUID o material" value="${esc(UI.q)}" aria-label="Buscar compras"></label>
        </div>
        <div class="filterbar rv" style="--d:180">
          <div class="seg" role="group" aria-label="Estado">${[['todas', 'Todas'], ['cotizado', 'Sin factura'], ['facturado', 'Por pagar'], ['pagado', 'Pagadas'], ['recibido', 'Recibidas']].map(([k, l]) => `<button type="button" data-est="${k}" aria-pressed="${UI.cEst === k}">${l}</button>`).join('')}</div>
          ${conDif || UI.cEst === 'dif' ? `<button type="button" class="dif-f" data-est="dif" aria-pressed="${UI.cEst === 'dif'}">${I.alert}<span>Con diferencias <b>${conDif}</b></span></button>` : ''}
          <span class="fb-sep"></span>
          ${varias ? `<label class="psel${UI.cObra ? ' on' : ''}"><span class="sr">Obra</span><select data-rf="cObra"><option value="">Obra</option>${obrasMias().map(o => `<option value="${esc(o.id)}"${UI.cObra === o.id ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>` : ''}
          <label class="psel${UI.cWk ? ' on' : ''}"><span class="sr">Semana</span><select data-rf="cWk"><option value="">Semana</option>${semanas.map(k => `<option value="${k}"${UI.cWk === String(k) ? ' selected' : ''}>Semana ${k % 100}</option>`).join('')}</select></label>
        </div>
        <p class="count">Mostrando <b>${lista.length}</b> de ${vis.length} compras</p>
        ${grupos || `<div class="empty empty--sm"><p class="h3">${vis.length ? 'Sin compras con estos filtros' : 'Todavía no hay compras'}</p><p class="muted small">Las compras nacen en una requisición revisada: selecciona los materiales aprobados y registra la cotización elegida.</p></div>`}
      </section>`,
      bind(sec) {
        $$('[data-est]', sec).forEach(b => b.addEventListener('click', () => { UI.cEst = b.dataset.est === 'dif' && UI.cEst === 'dif' ? 'todas' : b.dataset.est; saveUI(); api.rerender(); }));
        $$('[data-est-go]', sec).forEach(b => b.addEventListener('click', () => { UI.cEst = b.dataset.estGo; saveUI(); api.rerender(); }));
        $$('select[data-rf]', sec).forEach(s => s.addEventListener('change', () => { UI[s.dataset.rf] = s.value; saveUI(); api.rerender(); }));
        const qi = $('[data-q]', sec); let t;
        qi.addEventListener('input', () => {
          clearTimeout(t);
          t = setTimeout(async () => {
            UI.q = qi.value; saveUI(); await api.rerender();
            const n = $('[data-q]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
          }, 250);
        });
        chart($('[data-chart]', sec), $('[data-chart-side]', sec));
        ligarHrefs(sec);
      }
    };
  }

  const docsDe = c => [
    ['Cotización', !!c.cotizacion], ...(c.iva ? [['Factura', !!(c.factura && c.factura.pdfArchivo)], ['XML', !!(c.factura && c.factura.xmlArchivo)]] : []),
    ['Pago', !!c.pago], ['Remisión', !!c.remision]
  ];
  function ccard(c, d) {
    const o = obra(c.obraId) || {}, r = req(c.requisicionId);
    const mats = c.partidas.map(findPartida).filter(Boolean);
    const difs = diferencias(c), difEn = new Set(difs.map(x => x.doc));
    const chipDe = { Factura: 'factura', XML: 'factura', Pago: 'pago' };
    return `<article class="card lcard ccard rv${difs.length ? ' ccard--dif' : ''}" style="--d:${d}" data-href="#/c/${esc(c.id)}" tabindex="0">
      <div class="l-id">
        <span class="av ${tono(c.proveedor.nombre)}">${esc(iniciales(c.proveedor.nombre))}</span>
        <div class="c-id"><a class="pname" href="#/c/${esc(c.id)}">${esc(c.proveedor.nombre)}</a>
          <span class="sub">${esc(o.nombre || '')}${c.factura && c.factura.folio ? ' · ' + esc((c.factura.serie || '') + ' ' + c.factura.folio) : ''}</span></div>
      </div>
      <div class="l-mid">
        <p class="w-serv c-mats">${mats.slice(0, 3).map(p => `${esc(p.insumo)} <span class="muted">(${qty(p.cantidad)} ${esc(p.unidad)})</span>`).join(' · ')}${mats.length > 3 ? ` <span class="muted">y ${mats.length - 3} más</span>` : ''}</p>
        <div class="dchips">${docsDe(c).map(([l, ok]) => ok && difEn.has(chipDe[l]) ? `<span class="dchip bad">${I.alert}${l}</span>` : `<span class="dchip${ok ? ' ok' : ''}">${ok ? I.check : I.clock}${l}</span>`).join('')}</div>
        ${difs.length ? `<p class="dif-l">${I.alert}<span>${esc(difs[0].txt)}${difs.length > 1 ? ` <b>(+${difs.length - 1} más)</b>` : ''}</span></p>` : ''}
        <span class="muted small">${r ? 'Requisición ' + esc(r.folio) + ' · ' : ''}${c.partidas.length} materiales · entrega ${esc(fDate(c.fechaEntrega))}</span>
      </div>
      <div class="c-total"><b>${money(montoCompra(c))}</b>${c.iva ? '' : '<span class="tagx tagx--siniva">Sin IVA</span>'}${difs.length ? `<span class="tagx tagx--bad tagx--dif">${I.alert}Diferencia</span>` : ''}${st(compraEstado(c), true)}<small>${c.factura ? 'Total facturado' : 'Total cotizado'}</small></div>
    </article>`;
  }

  /* ---------- Gráfica: erogaciones por semana (una sola serie) ---------- */
  function niceStep(v) {
    if (v <= 0) return 1000;
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function chart(el, side) {
    if (!el) return;
    const hw = hoyWk();
    const obraF = UI.chObra;
    const cs = D.compras.filter(c => c.pago && visibleObra(c.obraId) && (!obraF || c.obraId === obraF));
    if (!cs.length) { el.innerHTML = '<p class="muted">Aún no hay pagos registrados.</p>'; side.innerHTML = ''; return; }
    const min = Math.min(...cs.map(wkKey)), max = Math.max(wkKey(hw), ...cs.map(wkKey));
    const data = [];
    for (let w = { anio: Math.floor(min / 100), semana: min % 100 }; wkKey(w) <= max && data.length < 60; w = wkAdd(w, 1)) {
      const xs = cs.filter(c => wkKey(c) === wkKey(w));
      data.push({ w, total: xs.reduce((a, c) => a + c.pago.monto, 0), n: xs.length });
    }
    const tot = data.reduce((a, x) => a + x.total, 0);
    const top = data.reduce((a, x) => (x.total > a.total ? x : a), data[0]);
    const conPago = data.filter(x => x.total > 0).length;
    side.innerHTML = `<div class="stats4">
      <div><small>Acumulado</small><b>${money(tot)}</b></div>
      <div><small>Promedio por semana con pagos</small><b>${money(conPago ? tot / conPago : 0)}</b></div>
      <div><small>Semana más alta</small><b>S${top.w.semana} · ${moneyK(top.total)}</b></div></div>`;

    const draw = () => {
      const W = Math.max(260, el.clientWidth || 600), H = 220, L = 54, Rm = 6, T = 24, B = 26;
      const iw = W - L - Rm, ih = H - T - B;
      const step = niceStep(top.total / 3), ymax = Math.max(step * 3, step * Math.ceil(top.total / step));
      const band = iw / data.length, bw = Math.max(6, Math.min(34, band * .58));
      const y = v => T + ih - (v / ymax) * ih;
      const grid = []; for (let v = 0; v <= ymax + 1; v += step) grid.push(v);
      const every = band < 34 ? Math.ceil(34 / band) : 1;
      const bars = data.map((x, i) => {
        const cx = L + band * i + band / 2, h = Math.max(0, T + ih - y(x.total)), x0 = cx - bw / 2, y0 = T + ih - h, rr = Math.min(4, h, bw / 2);
        const cur = wkKey(x.w) === wkKey(hw);
        const path = h > 0 ? `<path class="bar${cur ? ' cur' : ''}" d="M${x0} ${T + ih}V${y0 + rr}Q${x0} ${y0} ${x0 + rr} ${y0}H${x0 + bw - rr}Q${x0 + bw} ${y0} ${x0 + bw} ${y0 + rr}V${T + ih}Z"/>` : '';
        const lab = (x === top || cur) && x.total > 0 ? `<text class="lbl" x="${cx}" y="${y0 - 6}" text-anchor="middle">${moneyK(x.total)}</text>` : '';
        const xl = i % every === 0 || cur ? `<text x="${cx}" y="${H - 8}" text-anchor="middle"${cur ? ' class="cur"' : ''}>S${x.w.semana}</text>` : '';
        return `<g class="col" data-i="${i}">${path}${lab}<g class="ax">${xl}</g><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${ih}"/></g>`;
      }).join('');
      el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Erogaciones pagadas por semana">
        <g class="grid">${grid.map(v => `<line x1="${L}" x2="${W - Rm}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
        <g class="ax">${grid.map(v => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${moneyK(v)}</text>`).join('')}</g>
        ${bars}</svg><div class="ctip"></div>`;
      const tip = $('.ctip', el);
      $$('g.col', el).forEach(g => {
        g.addEventListener('mouseenter', () => {
          const i = +g.dataset.i, x = data[i], cx = L + band * i + band / 2;
          tip.innerHTML = `<small>Semana ${x.w.semana} · ${esc(wkRange(x.w))}</small><b>${money(x.total)}</b><small>${x.n} ${x.n === 1 ? 'pago' : 'pagos'}</small>`;
          tip.style.left = Math.min(Math.max(cx, 90), W - 90) + 'px'; tip.style.top = Math.max(y(x.total), T + 30) + 'px'; tip.classList.add('on');
        });
        g.addEventListener('mouseleave', () => tip.classList.remove('on'));
      });
    };
    // Solo se redibuja si cambia el ancho (evita ciclos con la barra de desplazamiento)
    let lastW = el.clientWidth, raf = 0;
    draw();
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) { ro.disconnect(); return; }
      if (Math.abs(el.clientWidth - lastW) < 8) return;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { lastW = el.clientWidth; draw(); });
    });
    ro.observe(el);
  }

  /* ---------- Detalle de una compra ---------- */
  async function pageCompra({ id }) {
    await api.refresh(); await cargar();
    const c = compra(id);
    if (!c) return noEncontrado('Compra no encontrada', 'No existe, se borró o no tienes acceso a esa obra.', '#/compras', 'Compras y facturas');
    const o = obra(c.obraId) || {}, r = req(c.requisicionId), f = c.factura;
    const mats = c.partidas.map(findPartida).filter(Boolean);
    const dir = enDirectorio(c);
    const e = compraEstado(c);
    // Archivo privado: se abre con una liga temporal
    const fch = (icon, a, tipo) => a && a.ruta
      ? `<button type="button" class="fchip" data-ruta="${esc(a.ruta)}" title="Abrir ${esc(a.nombre)}">${I[icon]}<span>${esc(a.nombre)}</span><em>${tipo}</em></button>`
      : '';
    // Se pueden subir en cualquier orden; se resalta el primero que falta
    const next = !c.cotizacion ? 1 : !f && c.iva ? 2 : !c.pago ? 3 : !c.remision ? 4 : 0;
    const difs = diferencias(c), difEn = new Set(difs.map(x => x.doc));
    const res = o.residente || {};
    const recibida = !!c.remision;
    const puedeQuitar = () => esCompras();   // v0.7: compras también quita o reemplaza el comprobante de pago

    const doc = (n, titulo, sub, d, cuerpo, accion, tipo) => `<div class="doc rv${d && difEn.has(tipo) ? ' dif' : d ? ' ok' : next === n ? ' next' : ''}" style="--d:${60 + n * 40}">
      <div class="doc-h"><span class="doc-n">${d && difEn.has(tipo) ? icoSz('alert', 17) : d ? icoSz('check', 16) : n}</span><div><h3>${titulo}</h3><small>${d && difEn.has(tipo) ? '<b class="doc-dif">Diferencia en el monto o los datos</b>' : sub}</small></div>
        ${d && puedeQuitar(tipo) ? `<button type="button" class="ibtn doc-x" data-quitar="${esc(d.docId)}" data-tipo="${tipo}" title="Quitar este documento" aria-label="Quitar ${titulo}">${I.trash}</button>` : ''}</div>
      ${cuerpo}<div class="doc-act">${accion || ''}</div></div>`;
    const drop = (k, txt, icon = 'upload') => `<button class="drop-mini" type="button" data-up="${k}">${I[icon]}<span>${txt}</span></button>`;
    const lock = t => `<p class="lock">${t}</p>`;
    const sinArch = t => `<span class="fchip none">${t}</span>`;
    const archivosDe = (d, icon, tipo) => d.archivos.length ? d.archivos.map(a => fch(icon, a, tipo)).join('') : sinArch('Sin archivo');
    const checks = f ? validar(c) : [];
    const msg = avisoTexto(c, mats);
    const tel = String(res.telefono || '').replace(/\D/g, '').slice(-10);

    return {
      title: c.proveedor.nombre,
      html: `<section class="page">
        <a class="back rv" href="#/compras">${I.back}<span>Compras y facturas</span></a>
        <header class="d-hero rv" style="--d:30">
          <div class="d-top">
            <span class="av av--xl ${tono(c.proveedor.nombre)}">${esc(iniciales(c.proveedor.nombre))}</span>
            <div class="d-title">
              <div class="d-tags">${st(e)}${difs.length ? ` <span class="tagx tagx--bad">${I.alert}Con diferencias</span>` : ''}${f && f.uuid ? ' <span class="tagx tagx--ok">' + I.xml + 'XML leído</span>' : ''}</div>
              <h1 class="title title--d">${esc(c.proveedor.nombre)}</h1>
              <p class="d-sub">${c.proveedor.rfc ? `<span class="mono">${esc(c.proveedor.rfc)}</span>` : ''}<span>${esc(o.nombre || '')}</span><span>Semana ${c.semana}</span>
                ${r ? `<a class="link-u" href="#/r/${esc(r.id)}">Requisición ${esc(r.folio)}</a>` : ''}
                ${dir ? `<a class="link-u" href="#/p/${encodeURIComponent(dir.id)}">${I.users}Ficha en el directorio</a>` : '<span class="muted">No está en el directorio</span>'}</p>
            </div>
            <div class="d-money"><div class="big-money">${money(montoCompra(c))}</div><small>${f ? 'Total facturado (IVA incluido)' : 'Total de la cotización'}</small></div>
          </div>
        </header>

        ${difs.length ? `<div class="note note--bad rv" style="--d:50" role="alert">${I.alert}<p><b>${difs.length === 1 ? 'Hay una diferencia' : 'Hay ' + difs.length + ' diferencias'} en esta compra.</b> Revísala con el proveedor antes de pagar o archivar.<br>${difs.map(x => esc(x.txt)).join('<br>')}</p></div>` : ''}
        ${esCompras() || esAdmin() ? `<div class="c-acts rv" style="--d:40">
          ${esCompras() ? `<div class="seg" role="group" aria-label="IVA de la compra"><button type="button" data-iva="1" aria-pressed="${c.iva}">Con IVA</button><button type="button" data-iva="0" aria-pressed="${!c.iva}">Sin IVA</button></div>` : ''}
          ${esAdmin() ? `<button class="tbtn tbtn--sm" type="button" data-mover-c>${I.left}<span>Mover de semana</span></button>
            <button class="tbtn tbtn--sm c-borrar" type="button" data-borrar-c>${I.trash}<span>Borrar compra</span></button>` : ''}
        </div>` : ''}
        <div class="docs">
          ${doc(1, 'Cotización elegida', 'La que se va a pagar', c.cotizacion,
            c.cotizacion ? `<div class="files">${archivosDe(c.cotizacion, 'file', 'PDF')}</div><p class="dmeta"><b>${money(c.cotizacion.monto)}</b> · ${esc(fDate(c.cotizacion.fecha))} · ${esc(c.cotizacion.subidoPor)}</p>` : '',
            !c.cotizacion ? (esCompras() ? drop('cot', 'Subir cotización (PDF)') : lock('Compras sube la cotización.')) : '', 'cotizacion')}
          ${!c.iva && !f ? `<div class="doc doc--siniva rv" style="--d:140"><div class="doc-h"><span class="doc-n">–</span><div><h3>Sin factura</h3><small>Compra sin IVA</small></div></div><p class="dmeta">Las compras sin IVA no llevan factura ni XML. Se controla con la cotización y el comprobante de pago.</p></div>` : doc(2, 'Factura y XML', 'Los datos se leen del XML', f,
            f ? `<div class="files">${fch('file', f.pdfArchivo, 'PDF') || sinArch('Falta el PDF')}${fch('xml', f.xmlArchivo, 'XML')}</div>
              <p class="dmeta">Folio <b>${esc((f.serie || '') + ' ' + f.folio)}</b> · ${esc(fDate(f.fecha))}${f.uuid ? `<br>UUID <span class="mono">${esc(f.uuid.slice(0, 8))}…</span>` : ''}</p>` : '',
            !f ? (esCompras() ? drop('xml', 'Subir XML y PDF', 'xml') : lock('Compras sube la factura.')) : '', 'factura')}
          ${doc(3, 'Comprobante de pago', 'Al subirlo, el material ya es seguro', c.pago,
            c.pago ? `<div class="files">${archivosDe(c.pago, 'cash', 'PDF')}</div><p class="dmeta"><b>${money(c.pago.monto)}</b> · ${esc(fDate(c.pago.fecha))}${c.pago.referencia ? ' · ' + esc(c.pago.referencia) : ''}</p>` : '',
            !c.pago ? (esCompras() ? drop('pago', 'Subir comprobante', 'cash') : lock('Compras o Dirección suben el comprobante de pago.')) : '', 'pago')}
          ${doc(4, 'Remisión firmada', 'Foto desde la obra al recibir', c.remision,
            c.remision ? `<div class="files">${archivosDe(c.remision, 'camera', 'FOTO')}</div><p class="dmeta">Recibió <b>${esc(c.remision.recibio)}</b> · ${esc(fDate(c.remision.fecha))}</p>` : '',
            !c.remision ? (puedeRemision(c.obraId) ? drop('rem', soloResidente() ? 'Tomar foto de la remisión' : 'Subir foto de la remisión', 'camera') : lock('El residente sube la remisión.')) : '', 'remision')}
        </div>

        <div class="d-grid">
          <div class="d-main">
            <section class="panel rv" style="--d:200">
              <header class="panel-h"><h2>Materiales de esta compra <span class="n">${mats.length}</span></h2></header>
              <div class="panel-b panel-b--flush"><div class="tablewrap">
                <table class="tbl rtbl rtbl--c"><thead><tr><th class="c-n">#</th><th>Insumo</th><th class="num">Cantidad</th><th>Unidad</th><th>Entrega</th><th>Estado</th></tr></thead>
                <tbody>${mats.map((p, i) => {
                  const ov = c.entregas && c.entregas[p.id];
                  return `<tr><td class="c-n">${i + 1}</td><td class="ins"><b>${esc(p.insumo)}</b>${p.destino ? `<small>${esc(p.destino)}</small>` : ''}</td><td class="c-q">${qty(p.cantidad)}</td><td>${esc(p.unidad)}</td>
                  <td class="c-dt">${esCompras() && !recibida ? `<input class="in in--date" type="date" data-ent="${esc(p.id)}" value="${esc(ov || '')}" aria-label="Fecha de entrega de ${esc(p.insumo)}" title="Vacío = la fecha de la factura">${ov ? '' : `<small class="muted d-igual">igual que la factura · ${esc(fDate(c.fechaEntrega))}</small>`}` : esc(fDate(ov || c.fechaEntrega)) + (ov ? '<em>propia</em>' : '')}</td>
                  <td>${st(r ? estado(r, p) : e, true)}</td></tr>`;
                }).join('')}</tbody></table></div></div>
            </section>

            ${f ? `<section class="panel rv" style="--d:240">
              <header class="panel-h"><h2>Datos leídos del XML</h2></header>
              <div class="panel-b">
                <ul class="checks">${checks.map(k => `<li class="${k[0]}">${I[k[0] === 'ok' ? 'okc' : k[0] === 'no' ? 'x' : 'alert']}<span>${esc(k[1])}</span></li>`).join('')}</ul>
                <dl class="dl dl--fac">
                  <div><dt>Emisor</dt><dd>${esc(f.emisorNombre || '—')} <span class="mono muted">${esc(f.emisorRfc || '')}</span></dd></div>
                  <div><dt>Receptor</dt><dd>${esc(f.receptorNombre || '—')} <span class="mono muted">${esc(f.receptorRfc || '')}</span></dd></div>
                  <div><dt>Folio y fecha</dt><dd>${esc((f.serie || '') + ' ' + f.folio)} · ${esc(fDateT(f.fecha))}</dd></div>
                  ${f.uuid ? `<div><dt>UUID</dt><dd class="mono">${esc(f.uuid)}</dd></div>` : ''}
                  <div><dt>Pago</dt><dd>${esc(metodo(f.metodoPago))} · ${esc(forma(f.formaPago))}</dd></div>
                </dl>
                <div class="tablewrap tablewrap--bg"><table class="tbl ctbl"><thead><tr><th>Concepto</th><th class="num">Cantidad</th><th>Unidad</th><th class="num">P. unitario</th><th class="num">Importe</th></tr></thead>
                <tbody>${f.conceptos.map(k => `<tr><td>${esc(k.descripcion)}</td><td class="num">${qty(k.cantidad)}</td><td>${esc(k.unidad)}</td><td class="num">${money(k.valorUnitario)}</td><td class="num">${money(k.importe)}</td></tr>`).join('')}</tbody>
                <tfoot><tr><td colspan="4" class="num">Subtotal</td><td class="num">${money(f.subtotal)}</td></tr><tr><td colspan="4" class="num">IVA y otros</td><td class="num">${money(f.total - f.subtotal)}</td></tr><tr><td colspan="4" class="num">Total</td><td class="num">${money(f.total)}</td></tr></tfoot></table></div>
              </div>
            </section>` : ''}
          </div>

          <aside class="d-side">
            <section class="panel rv" style="--d:220">
              <header class="panel-h"><h2>Entrega programada</h2></header>
              <div class="panel-b">
                ${esCompras() && !recibida ? `<label class="fld"><span class="fld-l">Fecha para toda la factura</span><input class="in" type="date" data-fent value="${esc(c.fechaEntrega || '')}"><span class="fld-h">Si un material llega otro día, cámbialo en la tabla de materiales.</span></label>`
                  : `<p class="lead-s">${esc(fDateL(c.fechaEntrega))}</p>`}
              </div>
            </section>
            ${soloResidente() ? '' : `<section class="panel rv" style="--d:260">
              <header class="panel-h"><h2>Aviso al residente</h2></header>
              <div class="panel-b">
                <div class="msg-wrap">
                  <div class="msg-h"><span class="p-av">${icoSz('wa', 18)}</span><div><b>${esc(res.nombre || 'Residente')}</b><small>${c.pago ? 'Avísale que ya está pagado' : 'Se avisa al registrar el pago'}</small></div></div>
                  <div class="msg">${esc(msg)}<time>${c.pago ? esc(fDate(c.pago.fecha)) : 'pendiente'}</time></div>
                </div>
                ${!c.pago ? `<div class="auto">${I.bell}<span>Al subir el comprobante de pago se le manda un correo automático.</span></div>`
                  : c.pago.aviso ? `<div class="auto auto--ok">${I.mail}<span>Correo enviado a ${c.pago.aviso.para.map(p => `<b>${esc(p.nombre || p.correo)}</b>`).join(' y ')} · ${esc(fDateT(c.pago.aviso.en))}</span></div>`
                  : `<div class="auto auto--warn">${I.mail}<span>Todavía no se manda el correo de este pago.</span></div>`}
                <div class="acts">${c.pago && esCompras() ? `<button type="button" class="btn" data-aviso>${I.mail}<span>${c.pago.aviso ? 'Reenviar correo' : 'Enviar correo'}</span></button>` : ''}${tel ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/52${esc(tel)}?text=${encodeURIComponent(msg)}">${I.wa}<span>Enviar por WhatsApp</span></a>` : `<span class="muted small">Agrega el celular del residente en <a class="link-u" href="#/usuarios">Usuarios</a> para enviarlo por WhatsApp.</span>`}</div>
              </div>
            </section>`}
          </aside>
        </div>
      </section>`,
      bind(sec) {
        $$('[data-up]', sec).forEach(b => {
          const k = b.dataset.up;
          b.addEventListener('click', () => subir(c.id, k));
          b.addEventListener('dragover', ev => { ev.preventDefault(); b.classList.add('over'); });
          b.addEventListener('dragleave', () => b.classList.remove('over'));
          b.addEventListener('drop', ev => { ev.preventDefault(); b.classList.remove('over'); const fl = ev.dataTransfer.files[0]; if (fl) recibirArchivo(c.id, k, fl); });
        });
        $$('[data-ruta]', sec).forEach(b => b.addEventListener('click', () => abrirArchivo(b.dataset.ruta)));
        $$('[data-iva]', sec).forEach(b => b.addEventListener('click', async () => {
          const v = b.dataset.iva === '1';
          if (v === c.iva) return;
          if (!v && f && !(await api.confirmar({ titulo: 'Compra sin IVA', texto: 'Esta compra ya tiene factura. Al marcarla sin IVA la factura se conserva, pero ya no se pide.', ok: 'Marcar sin IVA' }))) return;
          if (await hacer(() => R.actualizarCompra(c.id, { iva: v }), v ? 'Compra con IVA: lleva factura y XML.' : 'Compra sin IVA: no lleva factura ni XML.')) api.rerender();
        }));
        const mc = $('[data-mover-c]', sec);
        if (mc) mc.addEventListener('click', async () => {
          const w = await pedirSemana(c, 'Mover compra de semana', 'Solo se mueve esta compra; su requisición se queda en su semana.');
          if (w && await hacer(() => R.actualizarCompra(c.id, w), `Compra movida a la semana ${w.semana}.`)) api.rerender();
        });
        const bc = $('[data-borrar-c]', sec);
        if (bc) bc.addEventListener('click', async () => {
          if (!(await api.confirmar({ titulo: 'Borrar compra', texto: `Se borrará la compra de <b>${esc(c.proveedor.nombre)}</b> con todos sus documentos y archivos. Sus materiales regresan a "Autorizado" en la requisición. No se puede deshacer.`, ok: 'Borrar compra', peligro: true }))) return;
          if (await hacer(() => R.borrarCompra(c.id), 'Compra borrada.')) location.hash = r ? '#/r/' + r.id : '#/compras';
        });
        $$('[data-quitar]', sec).forEach(b => b.addEventListener('click', async () => {
          const t = { cotizacion: 'la cotización', factura: 'la factura (PDF y XML)', pago: 'el comprobante de pago', remision: 'la remisión' }[b.dataset.tipo];
          if (!(await api.confirmar({ titulo: 'Quitar documento', texto: `Se borrará ${t} de esta compra, con sus archivos. Úsalo solo para corregir un error.`, ok: 'Quitar', peligro: true }))) return;
          if (await hacer(() => R.quitarDocumento(b.dataset.quitar), 'Documento quitado.')) api.rerender();
        }));
        const av = $('[data-aviso]', sec);
        if (av) av.addEventListener('click', async () => {
          av.disabled = true;
          await avisarPago(c.id);
          api.rerender();
        });
        const fe = $('[data-fent]', sec);
        if (fe) fe.addEventListener('change', async () => {
          if (await hacer(() => R.actualizarCompra(c.id, { fechaEntrega: fe.value }), 'Fecha de entrega actualizada.')) api.rerender();
        });
        $$('[data-ent]', sec).forEach(i => i.addEventListener('change', async () => {
          const ent = Object.assign({}, c.entregas);
          if (i.value && i.value !== c.fechaEntrega) ent[i.dataset.ent] = i.value; else delete ent[i.dataset.ent];
          if (await hacer(() => R.actualizarCompra(c.id, { entregas: ent }), 'Fecha del material actualizada.')) api.rerender();
        }));
      }
    };
  }

  // Abre un archivo privado con una liga temporal (la ventana se abre antes para que el navegador no la bloquee)
  async function abrirArchivo(ruta) {
    const w = window.open('', '_blank');
    try {
      const url = await R.urlArchivo(ruta);
      if (w) w.location.href = url; else location.href = url;
    } catch (e) { if (w) w.close(); toast(e.message); }
  }

  const metodo = m => ({ PUE: 'Pago en una sola exhibición (PUE)', PPD: 'Pago en parcialidades o diferido (PPD)' }[m] || m || '—');
  const forma = m => ({ '01': 'Efectivo', '02': 'Cheque', '03': 'Transferencia', '04': 'Tarjeta de crédito', '28': 'Tarjeta de débito', '99': 'Por definir' }[m] || m || '—');

  function validar(c) {
    const f = c.factura, out = [], emp = D.config.empresa;
    if (emp.rfc) out.push(f.receptorRfc === emp.rfc ? ['ok', `A nombre de ${emp.nombre || 'la empresa'} (${emp.rfc}).`] : ['no', `El receptor es ${f.receptorRfc || 'desconocido'}, no ${emp.rfc}.`]);
    if (f.uuid) out.push(['ok', 'UUID único: el servidor no permite registrar la misma factura dos veces.']);
    if (c.cotizacion && c.cotizacion.monto) {
      const d = Math.round((f.total - c.cotizacion.monto) * 100) / 100;
      out.push(d === 0 ? ['ok', 'El total coincide al centavo con la cotización.'] : ['no', `El total difiere ${money(Math.abs(d))} de la cotización (${d > 0 ? 'más caro' : 'más barato'}).`]);
    }
    if (f.metodoPago) out.push(f.metodoPago === 'PUE' ? ['ok', 'Pago en una sola exhibición: basta el comprobante de transferencia.'] : ['meh', 'Factura PPD: además del pago, el proveedor debe emitir complemento de pago.']);
    return out;
  }

  function avisoTexto(c, mats) {
    const o = obra(c.obraId) || {};
    const lis = mats.slice(0, 6).map(p => `• ${p.insumo.charAt(0) + p.insumo.slice(1).toLowerCase()} (${qty(p.cantidad)} ${p.unidad})`).join('\n');
    const mas = mats.length > 6 ? `\n• y ${mats.length - 6} más` : '';
    return `✅ Material pagado · ${o.nombre || ''}\n${c.proveedor.nombre} ya está pagado:\n${lis}${mas}\n\nEntrega programada: ${fDateL(c.fechaEntrega)}.\nAl recibir, sube la foto de la remisión firmada en la plataforma.`;
  }

  /* ---------- Documentos: se suben a la carpeta privada "documentos" ---------- */
  function subir(cid, k) {
    if (k === 'xml') return drXml(cid);
    const fp = $('#filepick');
    fp.value = '';
    fp.accept = k === 'rem' ? 'image/*,application/pdf' : 'application/pdf,image/*';
    if (k === 'rem') fp.setAttribute('capture', 'environment'); else fp.removeAttribute('capture');
    fp.onchange = () => { if (fp.files[0]) recibirArchivo(cid, k, fp.files[0]); };
    fp.click();
  }
  async function recibirArchivo(cid, k, file) {
    if (k === 'xml' || /\.xml$/i.test(file.name)) return drXml(cid, file);
    const c = compra(cid); if (!c) return;
    let datos = {}, monto = null, referencia = '';
    if (k === 'cot') {
      const m = await api.preguntar({ titulo: 'Total de la cotización', texto: esc(file.name), etiqueta: 'Total con IVA', campo: 'numero', ok: 'Subir', requerido: true });
      if (m == null) return;
      monto = parseFloat(m) || 0;
    }
    if (k === 'pago') {
      const m = await api.preguntar({ titulo: 'Monto pagado', texto: esc(file.name), etiqueta: 'Monto del comprobante', campo: 'numero', valor: c.factura ? String(c.factura.total) : c.cotizacion ? String(c.cotizacion.monto) : '', ok: 'Subir', requerido: true });
      if (m == null) return;
      monto = parseFloat(m) || 0; referencia = 'Transferencia';
    }
    if (k === 'rem') datos = { recibio: yo() };
    const tipo = { cot: 'cotizacion', pago: 'pago', rem: 'remision' }[k];
    toast(`Subiendo "${file.name}"…`);
    const ok = await hacer(() => R.agregarDocumento(cid, tipo, { archivos: [file], fecha: today(), monto, referencia, datos }));
    if (!ok) return;
    api.rerender();
    if (k === 'pago') {
      toast('Pagado: ya es seguro. Enviando el correo al residente…');
      if (await avisarPago(cid)) api.rerender();
    } else toast(k === 'rem' ? 'Remisión guardada: el material quedó como recibido en obra.' : 'Cotización guardada.');
  }

  // Correo automático al residente con el pago (si falla, el pago queda y se puede reintentar)
  async function avisarPago(cid) {
    try {
      const r = await R.avisarPago(cid);
      toast(`Correo enviado a ${r.aviso.para.map(p => p.nombre || p.correo).join(' y ')}.`);
      await cargar();
      return true;
    } catch (e) {
      toast(`El pago quedó registrado, pero no salió el correo: ${e.message}`);
      return false;
    }
  }

  /* ---------- Lectura del XML (CFDI) en el navegador ---------- */
  function parseCFDI(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('El archivo no es un XML válido.');
    const q = n => doc.getElementsByTagNameNS('*', n)[0];
    const c = q('Comprobante'); if (!c) throw new Error('No parece una factura (CFDI): falta el nodo Comprobante.');
    const e = q('Emisor') || c, r = q('Receptor') || c, t = q('TimbreFiscalDigital');
    const a = (el, k) => (el && el.getAttribute(k)) || '';
    const n = v => Math.round(parseFloat(v || 0) * 100) / 100;
    return {
      serie: a(c, 'Serie'), folio: a(c, 'Folio'), fecha: a(c, 'Fecha'), subtotal: n(a(c, 'SubTotal')), total: n(a(c, 'Total')), moneda: a(c, 'Moneda'),
      formaPago: a(c, 'FormaPago'), metodoPago: a(c, 'MetodoPago'), tipo: a(c, 'TipoDeComprobante'), version: a(c, 'Version'),
      emisorRfc: a(e, 'Rfc'), emisorNombre: a(e, 'Nombre'), receptorRfc: a(r, 'Rfc'), receptorNombre: a(r, 'Nombre'), usoCfdi: a(r, 'UsoCFDI'),
      uuid: a(t, 'UUID').toUpperCase(),
      conceptos: [...doc.getElementsByTagNameNS('*', 'Concepto')].map(k => ({ cantidad: n(a(k, 'Cantidad')), unidad: a(k, 'Unidad') || a(k, 'ClaveUnidad'), descripcion: a(k, 'Descripcion').replace(/\s+/g, ' ').trim(), valorUnitario: n(a(k, 'ValorUnitario')), importe: n(a(k, 'Importe')) }))
    };
  }
  const mismoNombre = (a, b) => { const x = norm(a).split(/\s+/)[0], y = norm(b); return x.length > 2 && y.includes(x); };

  // Encabezado y pie de los paneles del módulo (el panel lateral lo pone la app)
  const drHead = (sub, title) => `<header class="dr-h"><div><p class="mono">${sub}</p><h2 id="dr-title">${title}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>`;
  const drFoot = (okLabel, attrs = '') => `<footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok ${attrs}>${I.check}<span>${okLabel}</span></button></footer>`;
  const ocupado = (panel, on, txt) => { const b = $('[data-ok]', panel); if (!b) return; b.disabled = on; if (txt) $('span', b).textContent = txt; };

  function drXml(compraId, fileInicial) {
    if (!esCompras()) { toast('Solo compras y Dirección suben facturas.'); return; }
    let parsed = null, xmlFile = null;
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead('Compras y facturas', 'Subir factura')}
      <div class="dr-b">
        <fieldset class="fs"><legend><span class="mono">1</span>XML de la factura</legend><div class="fs-b">
          <label class="drop" data-drop>${I.xml}<b>Arrastra aquí el XML</b><span class="muted">o haz clic para elegirlo</span><input type="file" accept=".xml,text/xml,application/xml" hidden data-xmlin></label>
          <div data-res></div>
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>PDF de la factura</legend><div class="fs-b">
          <input class="in" type="file" accept="application/pdf" data-pdfin aria-label="PDF de la factura">
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">3</span>¿De qué compra es?</legend><div class="fs-b">
          <label class="fld"><span class="fld-l">Compra con cotización registrada</span><select class="in" data-dest></select>
          <span class="fld-h">Una factura es de una sola obra y de una sola semana. Se sugiere la compra del mismo proveedor.</span></label>
        </div></fieldset>
      </div>
      ${drFoot('Guardar factura', 'disabled')}
    </form>`, {}, panel => {
      const form = $('form', panel), sel = $('[data-dest]', panel), res = $('[data-res]', panel), ok = $('[data-ok]', panel);
      const upd = () => { ok.disabled = !(parsed && sel.value); };
      const fillSel = () => {
        const cs = D.compras.filter(c => !c.factura && c.cotizacion);
        let best = compraId || '';
        if (!best && parsed) {
          const m = cs.find(c => (c.proveedor.rfc && c.proveedor.rfc === parsed.emisorRfc) || mismoNombre(c.proveedor.nombre, parsed.emisorNombre));
          if (m) best = m.id;
        }
        sel.innerHTML = '<option value="">Elige una compra…</option>' + cs.map(c => `<option value="${esc(c.id)}"${c.id === best ? ' selected' : ''}>${esc(c.proveedor.nombre)} · ${esc((obra(c.obraId) || {}).nombre || '')} · S${c.semana} · ${money(c.cotizacion ? c.cotizacion.monto : 0)}</option>`).join('')
          + (cs.length ? '' : '<option value="" disabled>No hay compras esperando factura</option>');
        upd();
      };
      sel.addEventListener('change', upd);
      const leer = file => {
        xmlFile = file;
        file.text().then(t => {
          try { parsed = parseCFDI(t); } catch (x) { parsed = null; res.innerHTML = `<p class="warn">${I.alert}${esc(x.message)}</p>`; upd(); return; }
          const dup = D.compras.find(c => c.factura && c.factura.uuid && c.factura.uuid === parsed.uuid);
          const emp = D.config.empresa;
          const rfcOk = !emp.rfc || parsed.receptorRfc === emp.rfc;
          res.innerHTML = `<ul class="checks">
              <li class="ok">${I.okc}<span>CFDI ${esc(parsed.version)} leído: ${parsed.conceptos.length} conceptos.</span></li>
              ${emp.rfc ? `<li class="${rfcOk ? 'ok' : 'no'}">${I[rfcOk ? 'okc' : 'x']}<span>${rfcOk ? 'A nombre de ' + esc(emp.nombre || emp.rfc) : 'El receptor (' + esc(parsed.receptorRfc) + ') no es ' + esc(emp.rfc)}</span></li>` : ''}
              <li class="${dup ? 'no' : 'ok'}">${I[dup ? 'x' : 'okc']}<span>${dup ? 'Este UUID ya está registrado (' + esc(dup.proveedor.nombre) + ', S' + dup.semana + ').' : 'UUID nuevo.'}</span></li>
            </ul>
            <dl class="dl dl--fac">
              <div><dt>Proveedor</dt><dd>${esc(parsed.emisorNombre)} <span class="mono muted">${esc(parsed.emisorRfc)}</span></dd></div>
              <div><dt>Folio</dt><dd>${esc(parsed.serie + ' ' + parsed.folio)} · ${esc(fDateT(parsed.fecha))}</dd></div>
              <div><dt>UUID</dt><dd class="mono">${esc(parsed.uuid)}</dd></div>
              <div><dt>Total</dt><dd><b>${money(parsed.total)}</b> <span class="muted">(subtotal ${money(parsed.subtotal)})</span></dd></div>
              <div><dt>Conceptos</dt><dd>${parsed.conceptos.slice(0, 6).map(k => esc(k.descripcion) + ' <span class="muted">· ' + qty(k.cantidad) + ' ' + esc(k.unidad) + '</span>').join('<br>')}${parsed.conceptos.length > 6 ? '<br><span class="muted">y ' + (parsed.conceptos.length - 6) + ' más</span>' : ''}</dd></div>
            </dl>`;
          if (dup) parsed = null;
          fillSel();
        });
      };
      const dz = $('[data-drop]', panel), xi = $('[data-xmlin]', panel);
      xi.addEventListener('change', () => { if (xi.files[0]) leer(xi.files[0]); });
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('over'));
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) leer(e.dataTransfer.files[0]); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const c = compra(sel.value); if (!c || !parsed) return;
        const pdf = $('[data-pdfin]', panel).files[0];
        ocupado(panel, true, 'Subiendo…');
        try {
          await R.agregarDocumento(c.id, 'factura', { archivos: [xmlFile, pdf].filter(Boolean), fecha: parsed.fecha.slice(0, 10), monto: parsed.total, datos: parsed });
          if (!c.proveedor.rfc || !c.proveedor.razonSocial) {
            await R.actualizarCompra(c.id, { proveedor: Object.assign({}, c.proveedor, { rfc: c.proveedor.rfc || parsed.emisorRfc, razonSocial: c.proveedor.razonSocial || parsed.emisorNombre }) });
          }
        } catch (x) { ocupado(panel, false, 'Guardar factura'); $('[data-err]', panel).textContent = x.message; return; }
        await cargar();
        api.closeDrawer(true);
        toast('Factura guardada. Los materiales pasan a "Facturado".');
        if (location.hash === '#/c/' + c.id) api.rerender(); else location.hash = '#/c/' + c.id;
      });
      fillSel();
      if (fileInicial) leer(fileInicial);
    });
  }

  /* ---------- Registrar la cotización elegida para materiales seleccionados ---------- */
  async function drCotizacion(r, ids) {
    await api.refresh(); await cargar();
    const rr = req(r.id), ps = rr.partidas.filter(p => ids.includes(p.id));
    const DIR = api.proveedores();
    const nombres = [...new Set([...DIR.map(api.nombreProveedor), ...D.compras.map(c => c.proveedor.nombre)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead(`${esc(rr.folio)} · ${ps.length} materiales`, 'Cotización elegida')}
      <div class="dr-b">
        <fieldset class="fs"><legend><span class="mono">1</span>Proveedor y monto</legend><div class="fs-b"><div class="grid2">
          <label class="fld fld--wide"><span class="fld-l">Proveedor <em>*</em></span><input class="in" name="prov" list="dl-prov" required placeholder="Escribe o elige del directorio"><datalist id="dl-prov">${nombres.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
          <label class="fld"><span class="fld-l">Total con IVA <em>*</em></span><input class="in" name="monto" type="number" min="0" step="0.01" required></label>
          <label class="fld"><span class="fld-l">Entrega programada</span><input class="in" name="ent" type="date" value="${esc(rr.fechaSuministro)}"><span class="fld-h">Para toda la factura; se puede ajustar por material.</span></label>
          <label class="fld fld--wide"><span class="fld-l">Archivo de la cotización (PDF o foto)</span><input class="in" name="arch" type="file" accept="application/pdf,image/*"></label>
        </div></div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Materiales incluidos</legend><div class="fs-b">
          <ul class="tlist">${ps.map(p => `<li class="tline"><span class="tnum">${qty(p.cantidad)} ${esc(p.unidad)}</span><span class="tmail">${esc(p.insumo)}</span></li>`).join('')}</ul>
        </div></fieldset>
      </div>
      ${drFoot('Guardar cotización')}
    </form>`, {}, panel => {
      const form = $('form', panel);
      form.addEventListener('input', api.markDirty);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('[data-err]', panel);
        const prov = form.prov.value.trim(), monto = parseFloat(form.monto.value);
        if (!prov || !(monto > 0)) { err.textContent = 'Escribe el proveedor y el total.'; return; }
        const p0 = DIR.find(p => norm(api.nombreProveedor(p)) === norm(prov));
        ocupado(panel, true, 'Guardando…');
        let cid;
        try {
          cid = await R.crearCompra({
            obraId: rr.obraId, anio: rr.anio, semana: rr.semana, partidas: ps.map(p => p.id),
            proveedor: { nombre: prov, rfc: p0 ? p0.rfc : '', razonSocial: p0 ? p0.razonSocial : '', id: p0 ? p0.id : '' },
            fechaEntrega: form.ent.value || rr.fechaSuministro
          });
          await cargar();
          await R.agregarDocumento(cid, 'cotizacion', { archivos: form.arch.files[0] ? [form.arch.files[0]] : [], fecha: today(), monto });
        } catch (x) {
          ocupado(panel, false, 'Guardar cotización'); err.textContent = x.message;
          if (cid) { await cargar(); location.hash = '#/c/' + cid; api.closeDrawer(true); toast('La compra se creó, pero falta la cotización: súbela aquí.'); }
          return;
        }
        await cargar();
        api.closeDrawer(true);
        toast('Cotización registrada. Siguiente paso: la factura y su XML.');
        location.hash = '#/c/' + cid;
      });
    });
  }

  /* ---------- Línea de tiempo de un material ---------- */
  function drMaterial(r, p) {
    const c = compra(p.compraId), e = estado(r, p), k = estIdx(e), f = c && c.factura;
    const pasos = [
      ['Requisitado', r.enviadaEn ? `Lo pidió ${r.creadaPor} · ${fDateT(r.enviadaEn)}` : '', 'Lo pide el residente al enviar la requisición'],
      ['Autorizado', p.aprobacion === 'aprobada' ? `${p.revisadaPor} · ${fDateT(p.revisadaEn)}` : '', 'Espera la revisión del coordinador de obra'],
      ['Cotizado', c && c.cotizacion ? `${c.proveedor.nombre} · ${money(c.cotizacion.monto)} · ${fDate(c.cotizacion.fecha)}` : '', 'Compras registra la cotización elegida'],
      ['Facturado', f ? `Factura ${f.serie || ''} ${f.folio} · ${fDate(f.fecha)}` : '', 'Compras sube la factura y su XML'],
      ['Pagado: ya es seguro', c && c.pago ? `${money(c.pago.monto)} · ${fDateL(c.pago.fecha)}` : '', 'Compras o Dirección suben el comprobante de pago'],
      ['Recibido en obra', c && c.remision ? `Recibió ${c.remision.recibio} · ${fDate(c.remision.fecha)}` : '', entrega(p) ? `Entrega programada: ${fDateL(entrega(p))}` : 'Se sube la foto de la remisión firmada']
    ];
    // Los documentos de la compra se suben en cualquier orden: cada paso cuenta por sí solo
    const hechos = pasos.map(([, hecho], i) => (i < 2 ? i <= k : !!hecho));
    const puedeSum = esCompras() && r.estado === 'revisada' && p.aprobacion === 'aprobada';
    const sig = hechos.indexOf(false);
    api.openPanel(`<div class="dr-form">
      ${drHead(`${esc(r.folio)} · material ${r.partidas.indexOf(p) + 1}`, esc(p.insumo))}
      <div class="dr-b">
        <section class="fs"><div class="fs-b">
          <div class="m-head"><span class="lead-s">${qty(p.cantidad)} ${esc(p.unidad)}</span>${st(e)}</div>
          ${sumNota(p) ? `<p class="sum-nota">${sumNota(p)}</p>` : ''}
          ${e === 'rechazado' ? `<p class="warn">${I.alert}<span>Rechazado por ${esc(p.revisadaPor || 'el coordinador')}${p.motivoRechazo ? ': ' + esc(p.motivoRechazo) : ''}</span></p>` : ''}
          <dl class="dl">
            ${p.observaciones ? `<div><dt>Observaciones</dt><dd>${esc(p.observaciones)}</dd></div>` : ''}
            <div><dt>¿Dónde se empleará?</dt><dd>${esc(p.destino || '—')}</dd></div>
            <div><dt>Suministro solicitado</dt><dd>${esc(fDateL(suministro(r)))}</dd></div>
            <div><dt>Proveedor</dt><dd>${c ? `<a class="link-u" href="#/c/${esc(c.id)}">${esc(c.proveedor.nombre)}</a>` : '—'}</dd></div>
          </dl>
        </div></section>
        ${e === 'borrador' || e === 'rechazado' || e === 'nosum' ? '' : `<section class="fs"><div class="fs-b">
          <ol class="tl">${pasos.map(([t, hecho, pend], i) => `<li class="${hechos[i] ? 'done' : i === sig ? 'now' : ''}"><span class="dot">${I[EST[i].ico]}</span><div><h4>${t}</h4><p>${esc(hechos[i] ? hecho : pend)}</p></div></li>`).join('')}</ol>
        </div></section>`}
      </div>
      ${puedeSum ? `<fieldset class="fs"><legend class="sum-l">Suministro (compras)</legend><div class="fs-b sum-acts">
          ${p.suministro !== 'normal' ? `<button class="btn" type="button" data-sum="normal">${I.undo}<span>Regresar al material original</span></button>` : ''}
          <button class="btn" type="button" data-sum="sustituido">${I.edit}<span>${p.suministro === 'sustituido' ? 'Cambiar el sustituto' : 'Cambiar por otro similar'}</span></button>
          ${p.suministro !== 'no_suministrado' ? `<button class="btn btn--danger" type="button" data-sum="no_suministrado">${I.close}<span>No se pudo suministrar</span></button>` : ''}
        </div></fieldset>` : ''}
      <footer class="dr-f">${c ? `<a class="btn btn--solid" href="#/c/${esc(c.id)}">${I.receipt}<span>Ver la compra</span></a>` : '<button class="btn" type="button" data-close><span>Cerrar</span></button>'}</footer>
    </div>`, {}, panel => {
      $$('[data-sum]', panel).forEach(b => b.addEventListener('click', async () => {
        const v = b.dataset.sum;
        let sus = '', nota = '';
        if (v === 'sustituido') {
          sus = await api.preguntar({ titulo: 'Cambiar por otro material', texto: `<b>${esc(p.insumo)}</b> · ${qty(p.cantidad)} ${esc(p.unidad)}`, etiqueta: '¿Qué material se consiguió en su lugar?', valor: p.sustituto, ok: 'Guardar', requerido: true });
          if (sus == null) return;
          nota = await api.preguntar({ titulo: 'Nota para el residente (opcional)', etiqueta: 'Por qué se cambió', valor: p.notaSuministro, ok: 'Guardar' });
          if (nota == null) nota = '';
        } else if (v === 'no_suministrado') {
          nota = await api.preguntar({ titulo: 'No se pudo suministrar', texto: `<b>${esc(p.insumo)}</b> · ${qty(p.cantidad)} ${esc(p.unidad)}`, etiqueta: 'Motivo (lo verá el residente)', campo: 'area', ok: 'Marcar', requerido: true, peligro: true });
          if (nota == null) return;
        }
        if (await hacer(() => R.marcarSuministro(p.id, v, sus.trim().toUpperCase(), nota), v === 'normal' ? 'El material regresó al original.' : v === 'sustituido' ? 'Material cambiado: el residente lo verá.' : 'Marcado como no suministrado: el residente lo verá.')) {
          api.closeDrawer(true); api.rerender();
        }
      }));
    });
  }

  /* ---------- Nueva requisición / editar (se guarda como borrador o se envía) ---------- */
  // correccion: el admin técnico corrige una requisición ya enviada o revisada (v0.7);
  // lo que agrega entra aprobado y todo queda en la bitácora
  async function drReq(r0, obraPre, { correccion = false } = {}) {
    await cargar();
    const r = r0 ? req(r0.id) : null;
    const nueva = !r;
    if (correccion && !(r && esAdmin())) { toast('Solo el admin técnico corrige requisiciones enviadas.'); return; }
    if (r && !correccion && !(['borrador', 'devuelta'].includes(r.estado) && puedeEditarReq(r.obraId))) { toast('Esta requisición ya no se puede editar.'); return; }
    const obras = correccion ? D.obras.filter(o => o.id === r.obraId) : D.obras.filter(o => puedeEditarReq(o.id) && o.estatus !== 'cerrada');
    if (!obras.length) {
      toast(soloResidente() ? 'No tienes una obra asignada. Pide que te asignen como residente.' : esCoord() ? 'Primero agrega una obra.' : 'Tu rol no crea requisiciones.');
      if (esJefe()) location.hash = '#/obras';
      return;
    }
    const w = nueva ? curWk() : { anio: r.anio, semana: r.semana };
    const oSel = nueva ? (obras.some(o => o.id === obraPre) ? obraPre : obras.some(o => o.id === UI.obra) ? UI.obra : obras[0].id) : r.obraId;
    const ordinariaExiste = (oid, ww) => D.requisiciones.some(x => x !== r && x.obraId === oid && x.anio === ww.anio && x.semana === ww.semana && x.tipo === 'ordinaria');
    const tipo0 = nueva ? (ordinariaExiste(oSel, w) ? 'extraordinaria' : 'ordinaria') : r.tipo;
    const fSum0 = nueva ? ymd(addDays(lunes(w.anio, w.semana), 4)) : r.fechaSuministro;
    const vacia = () => ({ id: '', insumo: '', unidad: 'PZA', cantidad: '', observaciones: '', destino: '', fechaSuministro: '', compraId: '' });
    const filas = nueva ? Array.from({ length: 5 }, vacia) : r.partidas.map(p => Object.assign({}, p));
    const fila = (p, i) => `<div class="prow${p.aprobacion === 'rechazada' ? ' is-off' : ''}" data-pid="${esc(p.id)}">
      <i>${i + 1}</i>
      <input class="in" name="insumo" placeholder="Insumo" value="${esc(p.insumo)}" aria-label="Insumo">
      <select class="in" name="unidad" aria-label="Unidad">${[...new Set([...UNIDADES, p.unidad].filter(Boolean))].map(u => `<option${u === p.unidad ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>
      <input class="in" name="cantidad" type="number" min="0" step="any" placeholder="0" value="${esc(p.cantidad)}" aria-label="Cantidad">
      <input class="in" name="obs" placeholder="Presentación, color…" value="${esc(p.observaciones)}" aria-label="Observaciones">
      <input class="in" name="destino" placeholder="¿Dónde se empleará?" value="${esc(p.destino)}" aria-label="¿Dónde se empleará?">
      <button class="ibtn" type="button" data-del aria-label="Quitar renglón"${p.compraId ? ' data-en-compra title="Ya está en una compra: al quitarlo sale también de la compra"' : ''}>${I.trash}</button>
    </div>`;
    const reenviar = r && r.estado === 'devuelta' && !correccion;
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead(nueva ? 'Requisición de materiales' : esc(r.folio), nueva ? 'Nueva requisición' : correccion ? 'Corregir requisición' : 'Editar requisición')}
      <div class="dr-b">
        ${correccion ? `<div class="note note--info"><span>${I.shield}</span><p><b>Corrección del admin técnico.</b> La requisición conserva su estado. Lo que agregues queda aprobado; lo que cambies conserva su aprobación. Si quitas un material que ya está en una compra, sale también de esa compra. Todo queda en la bitácora.</p></div>` : ''}
        ${reenviar ? `<div class="note"><span>${I.alert}</span><p><b>Corrección pedida:</b> ${esc(r.comentarioRevision || '—')}. Los materiales que cambies vuelven a revisión; los demás conservan su aprobación.</p></div>` : ''}
        <fieldset class="fs"><legend><span class="mono">1</span>Obra y semana</legend><div class="fs-b"><div class="grid3">
          <label class="fld"><span class="fld-l">Obra</span><select class="in" name="obra"${nueva && obras.length > 1 ? '' : ' disabled'}>${obras.map(o => `<option value="${esc(o.id)}"${o.id === oSel ? ' selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select></label>
          <label class="fld"><span class="fld-l">Semana</span><input class="in" name="semana" type="number" min="1" max="53" value="${w.semana}"${nueva ? '' : ' disabled'}><span class="fld-h" data-corte>Corte ${esc(wkRange(w))}</span></label>
          <label class="fld"><span class="fld-l">Suministro en obra</span><input class="in" name="fsum" type="date" value="${esc(fSum0)}"><span class="fld-h">Una sola fecha para toda la requisición.</span></label>
          <div class="fld fld--wide"><span class="fld-l">Tipo</span><div class="toggles">
            <label class="chk chk--pill"><input type="radio" name="tipo" value="ordinaria"${tipo0 === 'ordinaria' ? ' checked' : ''}><span>Ordinaria (lunes 4 pm)</span></label>
            <label class="chk chk--pill"><input type="radio" name="tipo" value="extraordinaria"${tipo0 === 'extraordinaria' ? ' checked' : ''}><span>Extraordinaria</span></label>
          </div><span class="fld-h" data-tipo-h></span></div>
        </div></div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Materiales <span class="opt" data-cnt></span></legend><div class="fs-b">
          <div class="prow-h"><span>#</span><span>Insumo</span><span>Unidad</span><span>Cantidad</span><span>Observaciones</span><span>¿Dónde se empleará?</span><span></span></div>
          <div class="prows">${filas.map(fila).join('')}</div>
          <button class="tbtn tbtn--sm" type="button" data-add>${I.plus}<span>Agregar renglón</span></button>
        </div></fieldset>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p>
        <button type="button" class="btn" data-close><span>Cancelar</span></button>
        ${correccion ? `<button type="submit" class="btn btn--solid" data-ok>${I.check}<span>Guardar corrección</span></button>` : `<button type="submit" class="btn" data-guardar>${I.draft}<span>Guardar borrador</span></button>
        <button type="submit" class="btn btn--solid" data-ok data-enviar>${I.send}<span>${reenviar ? 'Guardar y reenviar' : 'Guardar y enviar'}</span></button>`}
      </footer>
    </form>`, { wide: true }, panel => {
      const form = $('form', panel), rows = $('.prows', panel);
      form.addEventListener('input', api.markDirty);
      const semanaDe = () => { const n = parseInt(form.semana.value, 10); return { anio: w.anio, semana: n >= 1 && n <= 53 ? n : w.semana }; };
      const renum = () => {
        $$('.prow', rows).forEach((x, i) => { x.querySelector('i').textContent = i + 1; });
        const n = $$('.prow', rows).length;
        $('[data-cnt]', panel).textContent = `${n} de 30 renglones`;
        $('[data-add]', panel).disabled = n >= 30;
      };
      const tipoH = () => {
        const oid = form.obra.value, ww = semanaDe();
        $('[data-corte]', panel).textContent = 'Corte ' + wkRange(ww);
        const ya = ordinariaExiste(oid, ww);
        $('[data-tipo-h]', panel).textContent = ya ? 'Esta obra ya tiene su requisición ordinaria esa semana: la nueva será extraordinaria.' : '';
        if (nueva && ya) form.tipo.value = 'extraordinaria';
      };
      form.obra.addEventListener('change', tipoH); form.semana.addEventListener('input', tipoH);
      rows.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b && $$('.prow', rows).length > 1) { b.closest('.prow').remove(); renum(); api.markDirty(); } });
      $('[data-add]', panel).addEventListener('click', () => { rows.insertAdjacentHTML('beforeend', fila(vacia(), 0)); renum(); $$('.prow', rows).pop().querySelector('input').focus(); });
      renum(); tipoH();
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const enviar = !!(e.submitter && e.submitter.hasAttribute('data-enviar'));
        const err = $('[data-err]', panel);
        const ps = $$('.prow', rows).map(x => ({
          id: x.dataset.pid || '', insumo: x.querySelector('[name="insumo"]').value.trim().toUpperCase(), unidad: x.querySelector('[name="unidad"]').value,
          cantidad: parseFloat(x.querySelector('[name="cantidad"]').value), observaciones: x.querySelector('[name="obs"]').value.trim().toUpperCase(),
          destino: x.querySelector('[name="destino"]').value.trim().toUpperCase(),
          // la fecha propia de antes se conserva tal cual (ya no se edita) para no mandar a revisión lo que no cambió
          fechaSuministro: ((r && r.partidas.find(y => y.id === x.dataset.pid)) || {}).fechaSuministro || ''
        })).filter(p => p.insumo || p.cantidad);
        const mal = ps.find(p => !p.insumo || !(p.cantidad > 0));
        if (!ps.length || mal) { err.textContent = !ps.length ? 'Agrega al menos un material.' : `Falta insumo o cantidad en "${mal.insumo || 'un renglón'}".`; return; }
        if (!form.fsum.value) { err.textContent = 'Indica la fecha de suministro en obra.'; return; }
        if (ps.length > 30) { err.textContent = 'El formato admite hasta 30 materiales.'; return; }
        const datos = nueva
          ? (() => {
            const o = obra(form.obra.value), ww = semanaDe(), tipo = form.tipo.value;
            const ext = D.requisiciones.filter(x => x.obraId === o.id && x.anio === ww.anio && x.semana === ww.semana && x.tipo === 'extraordinaria').length;
            return { obraId: o.id, anio: ww.anio, semana: ww.semana, tipo, folio: `${o.clave || 'OBRA'}-S${ww.semana}${tipo === 'extraordinaria' ? '-E' + (ext + 1) : ''}`, fechaSuministro: form.fsum.value, nota: '' };
          })()
          : Object.assign({}, r, { fechaSuministro: form.fsum.value, tipo: form.tipo.value });
        $$('button[type="submit"]', panel).forEach(b => { b.disabled = true; });
        try {
          const id = await R.guardarRequisicion(datos, ps, { aprobar: correccion });
          if (enviar && !correccion) { await R.cambiarEstado(id, 'enviada'); setTimeout(() => avisar(id, 'enviada'), 400); }
          datos.id = id;
        } catch (x) {
          $$('button[type="submit"]', panel).forEach(b => { b.disabled = false; });
          err.textContent = x.message; await cargar(); return;
        }
        await cargar();
        api.closeDrawer(true);
        toast(enviar ? 'Requisición enviada al coordinador de obra.' : 'Borrador guardado. Envíalo cuando esté completo.');
        UI.wk = { anio: datos.anio, semana: datos.semana }; saveUI();
        if (location.hash === '#/r/' + datos.id) api.rerender(); else location.hash = '#/r/' + datos.id;
      });
    });
  }

  /* =========================================================
     OBRAS (con su residente y suplentes). El nombre también vive
     en la lista "Obras" del directorio.
     ========================================================= */
  async function pageObras() {
    await api.refresh(); await cargar();
    const os = D.obras;
    const DIR = api.proveedores();
    const h = today();
    return {
      title: 'Obras',
      html: `<section class="page">
        <header class="page-head rv"><div><p class="eyebrow">Cada obra con su residente</p><h1 class="title">Obras</h1></div></header>
        <div class="note note--info rv" style="--d:60">${I.building}<p>El residente de cada obra (y su suplente mientras dure la suplencia) es el único que crea y envía sus requisiciones. ${esJefe() ? 'Para cambiar al residente usa <b>Cambiar residente</b> en la tarjeta; queda el historial. Toca la obra para editarla o asignar un suplente.' : esCoord() ? 'Toca una obra para asignar un suplente temporal.' : ''}</p></div>
        ${os.length ? `<div class="cards cards--amplias">${os.map((o, i) => {
          const rs = D.requisiciones.filter(r => r.obraId === o.id), cs = D.compras.filter(c => c.obraId === o.id && c.pago);
          const provs = DIR.filter(p => p.obras.some(x => norm(x) === norm(o.nombre)));
          const res = o.residente || {};
          const sup = o.suplentes.filter(s => s.hasta >= h);
          const mia = esResDe(o.id);
          return `<article class="card wcard ocard rv${mia ? ' is-mine' : ''}" style="--d:${100 + i * 60}"${esCoord() ? ` data-obra="${esc(o.id)}" tabindex="0"` : ''}>
            <div class="c-top"><span class="av">${esc((o.clave || iniciales(o.nombre)).slice(0, 5))}</span><div class="c-id"><span class="pname">${esc(o.nombre)}</span><span class="sub">${esc(o.direccion || 'Sin dirección')}</span></div>
              <span class="tag ${o.estatus === 'cerrada' ? 'tag--off' : 'tag--activo'}"><i></i>${o.estatus === 'cerrada' ? 'Cerrada' : 'Activa'}</span></div>
            <div class="stats4"><div><small>Requisiciones</small><b>${rs.length}</b></div><div><small>Semanas con requisición</small><b>${new Set(rs.map(wkKey)).size}</b></div><div><small>Pagado</small><b>${moneyK(cs.reduce((a, c) => a + c.pago.monto, 0))}</b></div></div>
            ${provs.length ? `<div class="o-provs"><small class="muted">Proveedores del directorio en esta obra</small><div class="l-tags">${provs.slice(0, 6).map(p => `<a class="chip-ro" href="#/p/${encodeURIComponent(p.id)}">${esc(api.nombreProveedor(p))}</a>`).join('')}${provs.length > 6 ? `<span class="more">+${provs.length - 6}</span>` : ''}</div></div>` : ''}
            <div class="c-bot"><span class="p-av">${esc(api.iniciales(res.nombre))}</span><div class="c-who"><b>${esc(res.nombre || 'Sin residente')}${mia && o.residenteId === yoId() ? ' · tú' : ''}</b><small>Residente de obra${res.telefono ? ' · ' + esc(res.telefono) : ''}${(() => { const a = o.historial.find(hh => hh.hasta); return a ? ' · antes: ' + esc(a.nombre) : ''; })()}</small></div>
              ${esJefe() ? `<button class="tbtn tbtn--sm o-cambiar" type="button" data-cambiar-res="${esc(o.id)}">${I.user}<span>Cambiar residente</span></button>` : ''}</div>
            ${sup.map(s => `<p class="o-sup">${I.user}<span>Suplente: <b>${esc(s.nombre)}</b> · ${esc(fDate(s.desde))} al ${esc(fDate(s.hasta))}${s.desde > h ? ' (programada)' : ''}${s.motivo ? ' · ' + esc(s.motivo) : ''}</span></p>`).join('')}
          </article>`;
        }).join('')}</div>` : `<div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">Sin obras</h2><p class="muted">${esJefe() ? 'Agrega la primera obra y asígnale su residente.' : 'Dirección o el admin técnico dan de alta las obras.'}</p>${esJefe() ? `<div class="empty-acts"><button class="btn btn--solid" type="button" data-act="nueva-obra">${I.plus}<span>Agregar obra</span></button></div>` : ''}</div>`}
      </section>`,
      bind(sec) {
        $$('[data-cambiar-res]', sec).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); drResidente(obra(b.dataset.cambiarRes)); }));
        $$('[data-obra]', sec).forEach(c => {
          c.addEventListener('click', e => { if (e.target.closest('a, button')) return; drObra(obra(c.dataset.obra)); });
          c.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === c) drObra(obra(c.dataset.obra)); });
        });
      }
    };
  }

  // Mantiene la lista "Obras" del directorio al día: agrega el nombre o lo renombra en todos los proveedores
  async function syncListaObras(anterior, nuevo) {
    try {
      await api.refresh();
      const ob = api.listas().obras || [];
      const tiene = v => ob.some(x => norm(x) === norm(v));
      if (anterior && norm(anterior) !== norm(nuevo) && tiene(anterior)) await api.Store.renombrarOpcion('obras', anterior, nuevo);
      else if (nuevo && !tiene(nuevo)) await api.Store.guardarLista('obras', [...ob, nuevo]);
      await api.refresh();
    } catch { /* la lista del directorio no es crítica para la obra */ }
  }

  // Jefes: todo. Coordinador: solo suplentes.
  function drObra(o0) {
    if (!esCoord()) { toast('Solo Dirección, el admin técnico y el coordinador editan obras.'); return; }
    const o = o0 ? obra(o0.id) : null;
    const nueva = !o, x = o || { nombre: '', clave: '', direccion: '', estatus: 'activa', residenteId: '', suplentes: [] };
    const jefe = esJefe(), dis = jefe ? '' : ' disabled';
    const personas = N.perfiles().filter(p => p.activo).sort((a, b) => (a.nombre || a.correo).localeCompare(b.nombre || b.correo, 'es'));
    const residentes = personas.filter(p => p.rol === 'residente' || p.id === x.residenteId);
    const nom = p => esc(p.nombre || p.correo);
    const h = today();
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead('Obras', nueva ? 'Agregar obra' : esc(x.nombre))}
      <div class="dr-b">
        <fieldset class="fs"><legend><span class="mono">1</span>Obra</legend><div class="fs-b"><div class="grid2">
          <label class="fld fld--wide"><span class="fld-l">Nombre <em>*</em></span><input class="in" name="nombre" value="${esc(x.nombre)}" required placeholder="Eje Central 469"${dis}></label>
          <label class="fld"><span class="fld-l">Clave para folios</span><input class="in" name="clave" value="${esc(x.clave)}" maxlength="8" placeholder="EC469"${dis}><span class="fld-h">Los folios quedan como EC469-S40.</span></label>
          <label class="fld"><span class="fld-l">Estatus</span><select class="in" name="estatus"${dis}><option value="activa"${x.estatus !== 'cerrada' ? ' selected' : ''}>Activa</option><option value="cerrada"${x.estatus === 'cerrada' ? ' selected' : ''}>Cerrada</option></select></label>
          <label class="fld fld--wide"><span class="fld-l">Dirección</span><input class="in" name="direccion" value="${esc(x.direccion)}"${dis}></label>
        </div></div></fieldset>
        ${nueva ? '' : `<fieldset class="fs"><legend><span class="mono">2</span>Residente de obra</legend><div class="fs-b">
          <div class="res-now"><span class="p-av">${esc(api.iniciales(x.residente.nombre))}</span><div><b>${esc(x.residente.nombre || 'Sin residente')}</b><small>Titular${(() => { const v = x.historial.find(hh => !hh.hasta); return v ? ' desde el ' + esc(fDate(v.desde)) : ''; })()}</small></div>
            ${jefe ? `<button type="button" class="tbtn tbtn--sm" data-cambiar>${I.user}<span>Cambiar residente</span></button>` : ''}</div>
          ${historialHTML(x)}
        </div></fieldset>`}
        ${!nueva ? '' : `<fieldset class="fs"><legend><span class="mono">2</span>Residente de obra</legend><div class="fs-b">
          <label class="fld"><span class="fld-l">Residente titular</span><select class="in" name="residente"${dis}><option value="">Sin asignar</option>${residentes.map(p => `<option value="${esc(p.id)}"${p.id === x.residenteId ? ' selected' : ''}>${nom(p)}</option>`).join('')}</select>
          <span class="fld-h">${residentes.length ? 'Solo aparecen usuarios con rol de residente.' : 'Todavía no hay usuarios con rol de residente: invítalos en <a class="link-u" href="#/usuarios">Usuarios</a>.'} Su celular para avisos se edita en Usuarios.</span></label>
        </div></fieldset>`}
        ${nueva ? '' : `<fieldset class="fs"><legend><span class="mono">3</span>Suplentes temporales</legend><div class="fs-b">
          <p class="fld-h">Por enfermedad o ausencia: el suplente puede crear y enviar requisiciones de esta obra solo entre las fechas indicadas. El acceso vence solo.</p>
          <ul class="sup-list">${x.suplentes.length ? x.suplentes.map(s => `<li class="${s.hasta < h ? 'is-off' : ''}"><span><b>${esc(s.nombre)}</b> · ${esc(fDate(s.desde))} al ${esc(fDate(s.hasta))}${s.hasta < h ? ' · vencida' : s.desde > h ? ' · programada' : ' · vigente'}${s.motivo ? `<small>${esc(s.motivo)}</small>` : ''}</span><button type="button" class="ibtn" data-sup-x="${esc(s.id)}" aria-label="Quitar suplencia">${I.trash}</button></li>`).join('') : '<li class="muted">Sin suplencias.</li>'}</ul>
          <div class="grid2 sup-add">
            <label class="fld fld--wide"><span class="fld-l">Suplente</span><select class="in" name="sperfil"><option value="">Elige a una persona…</option>${personas.filter(p => p.id !== x.residenteId).map(p => `<option value="${esc(p.id)}">${nom(p)}</option>`).join('')}</select></label>
            <label class="fld"><span class="fld-l">Desde</span><input class="in" type="date" name="sdesde" value="${esc(h)}"></label>
            <label class="fld"><span class="fld-l">Hasta</span><input class="in" type="date" name="shasta"></label>
            <label class="fld fld--wide"><span class="fld-l">Motivo</span><input class="in" name="smotivo" placeholder="Incapacidad, vacaciones…"></label>
          </div>
          <button type="button" class="tbtn tbtn--sm" data-sup-add>${I.plus}<span>Asignar suplente</span></button>
        </div></fieldset>`}
      </div>
      ${jefe ? drFoot('Guardar') : '<footer class="dr-f"><button type="button" class="btn" data-close><span>Cerrar</span></button></footer>'}
    </form>`, {}, panel => {
      const f = $('form', panel), err = () => $('[data-err]', panel);
      if (jefe) f.addEventListener('input', e => { if (!e.target.closest('.sup-add')) api.markDirty(); });
      const reabrir = async () => { await cargar(); api.rerender(); drObra(obra(x.id)); };
      const cam = $('[data-cambiar]', panel);
      if (cam) cam.addEventListener('click', () => drResidente(obra(x.id)));
      const add = $('[data-sup-add]', panel);
      if (add) add.addEventListener('click', async () => {
        const pid = f.sperfil.value, d1 = f.sdesde.value, d2 = f.shasta.value;
        if (!pid || !d1 || !d2) { toast('Elige a la persona y las fechas de la suplencia.'); return; }
        if (d2 < d1) { toast('La fecha final no puede ser antes de la inicial.'); return; }
        if (await hacer(() => R.agregarSuplente(x.id, pid, d1, d2, f.smotivo.value), 'Suplente asignado.')) reabrir();
      });
      $$('[data-sup-x]', panel).forEach(b => b.addEventListener('click', async () => {
        if (await hacer(() => R.quitarSuplente(b.dataset.supX), 'Suplencia quitada.')) reabrir();
      }));
      f.addEventListener('submit', async e => {
        e.preventDefault();
        if (!jefe) return;
        const nombre = f.nombre.value.trim();
        if (!nombre) { err().textContent = 'Escribe el nombre de la obra.'; f.nombre.classList.add('invalid'); return; }
        if (D.obras.some(y => y.id !== x.id && norm(y.nombre) === norm(nombre))) { err().textContent = 'Ya existe una obra con ese nombre.'; return; }
        const anterior = o ? o.nombre : '';
        ocupado(panel, true, 'Guardando…');
        try {
          await R.guardarObra({ id: o ? o.id : '', nombre, clave: f.clave.value.trim().replace(/\s+/g, ''), direccion: f.direccion.value.trim(), estatus: f.estatus.value, residenteId: nueva ? f.residente.value : x.residenteId });
        } catch (x2) { ocupado(panel, false, 'Guardar'); err().textContent = x2.message; return; }
        await syncListaObras(anterior, nombre);
        await cargar();
        api.closeDrawer(true); toast(nueva ? 'Obra agregada.' : 'Obra actualizada.'); api.rerender();
      });
    });
  }

  // Historial de residentes de una obra (v0.7: la base lo anota sola en cada cambio)
  function historialHTML(o) {
    const hs = o.historial.filter(hh => hh.hasta);
    if (!hs.length) return '';
    return `<div class="res-hist"><small class="muted">Residentes anteriores</small><ul>${hs.map(hh => `<li><b>${esc(hh.nombre)}</b><span>${esc(fDate(hh.desde))} al ${esc(fDate(hh.hasta))}${hh.nota ? ' · ' + esc(hh.nota) : ''}</span></li>`).join('')}</ul></div>`;
  }

  // Cambio de residente (jefes): cuenta desde hoy y queda en el historial
  function drResidente(o) {
    if (!esJefe()) { toast('Solo Dirección y el admin técnico cambian al residente.'); return; }
    if (!o) return;
    const cands = N.perfiles().filter(p => p.activo && p.rol === 'residente' && p.id !== o.residenteId)
      .sort((a, b) => (a.nombre || a.correo).localeCompare(b.nombre || b.correo, 'es'));
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead(esc(o.nombre), 'Cambiar residente')}
      <div class="dr-b">
        <fieldset class="fs"><legend><span class="mono">1</span>Residente actual</legend><div class="fs-b">
          <div class="res-now"><span class="p-av">${esc(api.iniciales(o.residente.nombre))}</span><div><b>${esc(o.residente.nombre || 'Sin residente')}</b><small>${(() => { const v = o.historial.find(hh => !hh.hasta); return v ? 'Titular desde el ' + esc(fDate(v.desde)) : 'Titular'; })()}</small></div></div>
          ${historialHTML(o)}
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Nuevo residente</legend><div class="fs-b">
          <label class="fld"><span class="fld-l">Residente <em>*</em></span><select class="in" name="nuevo" required><option value="">Elige a una persona…</option>${cands.map(p => `<option value="${esc(p.id)}">${esc(p.nombre || p.correo)}</option>`).join('')}${o.residenteId ? '<option value="-">Dejar la obra sin residente</option>' : ''}</select>
            <span class="fld-h">${cands.length ? 'Solo aparecen usuarios con rol de residente.' : 'No hay otros usuarios con rol de residente: invítalos en <a class="link-u" href="#/usuarios">Usuarios</a>.'}</span></label>
          <label class="fld"><span class="fld-l">Motivo (opcional)</span><input class="in" name="nota" placeholder="Cambio de obra, baja, rotación…"></label>
          <p class="fld-h">El cambio cuenta desde hoy. El nuevo residente ve y envía las requisiciones de la obra y recibe los avisos por correo; el anterior deja de verlas. Para una ausencia temporal mejor asigna un suplente.</p>
        </div></fieldset>
      </div>
      ${drFoot('Cambiar residente')}
    </form>`, {}, panel => {
      const f = $('form', panel), err = $('[data-err]', panel);
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        if (!f.nuevo.value) { err.textContent = 'Elige al nuevo residente.'; return; }
        ocupado(panel, true, 'Guardando…');
        try { await R.cambiarResidente(o.id, f.nuevo.value === '-' ? '' : f.nuevo.value, f.nota.value); }
        catch (x) { ocupado(panel, false, 'Cambiar residente'); err.textContent = x.message; return; }
        await cargar();
        api.closeDrawer(true);
        toast('Residente cambiado. Queda en el historial de la obra.');
        api.rerender();
      });
    });
  }

  function noEncontrado(t, txt, href, back) {
    return { title: 'No encontrado', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">${esc(t)}</h2><p class="muted">${esc(txt)}</p><a class="btn" href="${href}"><span>${esc(back)}</span>${api.ARR}</a></div></section>`, bind() { } };
  }

  /* =========================================================
     PDF (impresión) y Excel con el formato en papel
     ========================================================= */
  const conFormato = r => r.partidas.filter(p => p.aprobacion !== 'rechazada');
  const filasFormato = r => { const ps = conFormato(r), out = []; for (let i = 0; i < Math.max(30, ps.length); i++) out.push(ps[i] || null); return out; };
  const tituloFormato = r => `REQUISICIÓN DE MATERIALES ${String((obra(r.obraId) || {}).nombre || '').toUpperCase()}${r.tipo === 'extraordinaria' ? ' (EXTRAORDINARIA)' : ''}`;
  const COLS = ['#', 'INSUMO', 'UNIDAD', 'CANTIDAD', 'FECHA DE SUMINISTRO EN OBRA', 'OBSERVACIONES GENERALES (PRESENTACION, COLOR, SUMINISTRO EN 2 PARTES, ETC).', '¿DONDE SE EMPLEARÁ ESTE MATERIAL?'];
  const FIRMAS = ['NOMBRE Y FIRMA DE ENCARGADO DE OBRA', 'NOMBRE Y FIRMA CONTRATISTA O CABO DE OBRA'];

  function imprimir(r) {
    const proc = D.config.proceso;
    $('#print').innerHTML = `<div class="pf">
      <div class="pf-h"><div class="pf-logo">${api.logoSVG()}</div><div class="pf-t"><h1>${esc(tituloFormato(r))}</h1><p><span>SEMANA: ${r.semana}</span><span>CORTE: ${esc(corte(r))}</span></p></div></div>
      <table><colgroup><col style="width:4%"><col style="width:22%"><col style="width:7%"><col style="width:7%"><col style="width:8%"><col style="width:31%"><col style="width:21%"></colgroup>
        <thead><tr>${COLS.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${filasFormato(r).map((p, i) => `<tr><td>${i + 1}</td><td>${p ? esc(p.insumo) : ''}</td><td>${p ? esc(p.unidad) : ''}</td><td>${p ? qty(p.cantidad) : ''}</td><td>${p ? ddmmyy(suministro(r)) : ''}</td><td>${p ? esc(p.observaciones) : ''}</td><td>${p ? esc(p.destino) : ''}</td></tr>`).join('')}</tbody>
      </table>
      <div class="pf-firmas">${FIRMAS.map(t => `<div>${t}</div>`).join('')}</div>
      ${proc.length ? `<h2>PROCESO DE ENVIO DE REQUISICIONES:</h2><ol>${proc.map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
    </div>`;
    const t0 = document.title;
    document.title = `Requisicion ${r.folio}`;   // nombre sugerido del PDF
    document.body.classList.add('printing');
    const fin = () => { document.title = t0; document.body.classList.remove('printing'); removeEventListener('afterprint', fin); };
    addEventListener('afterprint', fin);
    setTimeout(() => print(), 60);
  }
  function excel(r) {
    const proc = D.config.proceso;
    const td = (v, s = '') => `<td style="border:.5pt solid #000;text-align:center;vertical-align:middle;font-size:9pt;${s}">${v}</td>`;
    const th = v => `<td style="border:.5pt solid #000;background:#D0CECE;font-weight:bold;text-align:center;vertical-align:middle;font-size:9pt;white-space:normal">${esc(v)}</td>`;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(r.folio)}</x:Name><x:WorksheetOptions><x:Print><x:ValidPrinterInfo/></x:Print></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body><table style="border-collapse:collapse;font-family:Calibri">
      <col width="32"><col width="250"><col width="70"><col width="74"><col width="84"><col width="330"><col width="230">
      <tr><td colspan="2" rowspan="2" style="font-size:20pt;font-weight:bold;color:#1d1d1b;letter-spacing:4pt">GALITHA</td><td colspan="5" style="text-align:center;font-weight:bold;font-size:13pt">${esc(tituloFormato(r))}</td></tr>
      <tr><td colspan="2" style="text-align:center;font-weight:bold;font-size:9pt">SEMANA: ${r.semana}</td><td colspan="3" style="text-align:center;font-weight:bold;font-size:9pt">CORTE: ${esc(corte(r))}</td></tr>
      <tr><td colspan="7"></td></tr>
      <tr style="height:44pt">${COLS.map(th).join('')}</tr>
      ${filasFormato(r).map((p, i) => `<tr>${td(i + 1)}${td(p ? esc(p.insumo) : '')}${td(p ? esc(p.unidad) : '')}${td(p ? p.cantidad : '')}${td(p ? ddmmyy(suministro(r)) : '', "mso-number-format:'\\@'")}${td(p ? esc(p.observaciones) : '')}${td(p ? esc(p.destino) : '')}</tr>`).join('')}
      <tr><td colspan="7" style="height:40pt"></td></tr>
      <tr><td></td><td colspan="2" style="border-top:.5pt solid #000;text-align:center;font-weight:bold;font-size:9pt">${FIRMAS[0]}</td><td colspan="2"></td><td colspan="2" style="border-top:.5pt solid #000;text-align:center;font-weight:bold;font-size:9pt">${FIRMAS[1]}</td></tr>
      <tr><td colspan="7"></td></tr>
      ${proc.length ? `<tr><td></td><td colspan="6" style="font-weight:bold;font-size:9pt">PROCESO DE ENVIO DE REQUISICIONES:</td></tr>${proc.map((t, i) => `<tr><td style="text-align:center;vertical-align:top;font-size:8pt">${i + 1}</td><td colspan="6" style="font-size:8pt;white-space:normal;vertical-align:top">${esc(t)}</td></tr>`).join('')}` : ''}
      </table></body></html>`;
    api.descargar(`Requisicion ${r.folio}.xls`, '﻿' + html, 'application/vnd.ms-excel');
    toast('Excel descargado. Si Excel avisa que el formato es de otra versión, ábrelo de todos modos.');
  }

  /* =========================================================
     GANCHOS PARA LA APP
     ========================================================= */
  // Ficha del proveedor: compras registradas con él
  function fichaProveedor(p) {
    const cs = D.compras.filter(c => { const d = enDirectorio(c); return d && d.id === p.id; }).sort((a, b) => wkKey(b) - wkKey(a));
    if (!cs.length) return '';
    const pag = cs.filter(c => c.pago).reduce((a, c) => a + c.pago.monto, 0);
    return `<section class="panel rv" style="--d:240">
      <header class="panel-h"><h2>Compras <span class="mono n">${pad(cs.length)}</span></h2><span class="muted small">Pagado: <b>${money(pag)}</b></span></header>
      <div class="panel-b"><ul class="tlist">${cs.slice(0, 8).map(c => `<li class="tline"><a class="tmail link-u" href="#/c/${esc(c.id)}">S${c.semana} · ${esc((obra(c.obraId) || {}).nombre || '')}${c.factura && c.factura.folio ? ' · ' + esc((c.factura.serie || '') + ' ' + c.factura.folio) : ''}</a><span class="tacts"><b class="tnum">${money(montoCompra(c))}</b>${st(compraEstado(c), true)}</span></li>`).join('')}</ul>
      ${cs.length > 8 ? `<p class="muted small" style="margin:10px 0 0">y ${cs.length - 8} más en <a class="link-u" href="#/compras">Compras y facturas</a>.</p>` : ''}</div>
    </section>`;
  }

  // Respaldo y datos: exportar y datos de la empresa
  function datosPanel() {
    const m = R.meta();
    const n = [D.obras.length, D.requisiciones.length, D.compras.length, D.compras.filter(c => c.factura && c.factura.uuid).length];
    const emp = D.config.empresa;
    return `<div class="d-grid d-grid--even r-datos">
      <div class="d-main">${api.panel('05', 'Requisiciones, obras y compras', `
        <ul class="imp-n"><li><b>${n[0]}</b><span>obras</span></li><li><b>${n[1]}</b><span>requisiciones</span></li><li><b>${n[2]}</b><span>compras</span></li><li><b>${n[3]}</b><span>facturas con XML</span></li></ul>
        ${api.dl([
          ['Último cambio', m.ultimoCambio ? esc(fDateT(m.ultimoCambio)) : '—'],
          ['Último respaldo', m.ultimoRespaldo ? esc(fDateT(m.ultimoRespaldo)) + ' <span class="muted">· desde este navegador</span>' : 'Nunca desde este navegador']
        ])}
        <p class="muted small">Viven en el servidor. El JSON es una copia de consulta de lo que tu rol puede ver; los archivos (PDF, XML y fotos) se quedan en el servidor.</p>
        <div class="acts">
          <button class="btn btn--solid" type="button" data-r-exp${R.vacio() ? ' disabled' : ''}>${I.down}<span>Exportar JSON de requisiciones</span></button>
        </div>`, '', 260)}</div>
      <div class="d-side">${api.panel('06', 'Datos de la empresa para las facturas', `
        <p class="muted small">Se usan para revisar que cada XML esté a nombre de la empresa y para imprimir el "Proceso de envío" en el formato.</p>
        ${api.dl([['Empresa', esc(emp.nombre || '—')], ['RFC', emp.rfc ? `<span class="mono">${esc(emp.rfc)}</span>` : '—'], ['Correo de requisiciones', esc(emp.correoRequisiciones || '—')], ['Proceso de envío', D.config.proceso.length ? D.config.proceso.length + ' puntos' : '—']])}
        ${esJefe() ? `<div class="acts"><button class="btn" type="button" data-r-cfg>${I.edit}<span>Editar</span></button></div>` : ''}`, '', 300)}</div>
    </div>`;
  }
  function datosBind(root) {
    const ex = $('[data-r-exp]', root);
    if (ex) ex.addEventListener('click', async () => {
      await cargar();
      const d = R.exportar();
      api.descargar(`galitha-requisiciones-${today()}.json`, JSON.stringify(d, null, 2), 'application/json');
      await R.marcarRespaldo(); toast(`Respaldo exportado: ${d.requisiciones.length} requisiciones y ${d.compras.length} compras.`); api.rerender();
    });
    const cfg = $('[data-r-cfg]', root);
    if (cfg) cfg.addEventListener('click', drConfig);
  }
  function drConfig() {
    const emp = D.config.empresa;
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead('Respaldo y datos', 'Datos de la empresa')}
      <div class="dr-b">
        <fieldset class="fs"><legend><span class="mono">1</span>Empresa que recibe las facturas</legend><div class="fs-b"><div class="grid2">
          <label class="fld fld--wide"><span class="fld-l">Razón social</span><input class="in" name="nombre" value="${esc(emp.nombre)}"></label>
          <label class="fld"><span class="fld-l">RFC</span><input class="in" name="rfc" value="${esc(emp.rfc)}" maxlength="13"></label>
          <label class="fld"><span class="fld-l">Correo de requisiciones</span><input class="in" name="correo" type="email" value="${esc(emp.correoRequisiciones)}"></label>
        </div></div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Proceso de envío de requisiciones</legend><div class="fs-b">
          <label class="fld"><span class="fld-l">Un punto por renglón (se imprime al pie del formato)</span><textarea class="in" name="proceso" rows="14">${esc(D.config.proceso.join('\n'))}</textarea></label>
        </div></fieldset>
      </div>
      ${drFoot('Guardar')}
    </form>`, { wide: true }, panel => {
      const f = $('form', panel);
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const rfc = f.rfc.value.trim().toUpperCase();
        if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) { $('[data-err]', panel).textContent = 'El RFC no tiene un formato válido.'; return; }
        ocupado(panel, true, 'Guardando…');
        try {
          await R.guardarConfig('empresa', { nombre: f.nombre.value.trim(), rfc, correoRequisiciones: f.correo.value.trim() });
          await R.guardarConfig('proceso', f.proceso.value.split('\n').map(s => s.trim()).filter(Boolean));
        } catch (x) { ocupado(panel, false, 'Guardar'); $('[data-err]', panel).textContent = x.message; return; }
        await cargar(); api.closeDrawer(true); toast('Datos de la empresa guardados.'); api.rerender();
      });
    });
  }
  // Los respaldos de requisiciones ya no se importan: los datos viven en el servidor
  function importarArchivo(data, nombreArchivo, out) {
    out.innerHTML = `<p class="warn">${I.alert}<span>"${esc(nombreArchivo)}" es un respaldo de requisiciones. Desde que viven en el servidor ya no se importan: se capturan directamente en la plataforma.</span></p>`;
  }

  let cargado = false;
  function chrome() {
    // Primera vez con sesión: carga para los contadores de la barra lateral
    if (!cargado && N.perfil) { cargado = true; cargar().then(chrome); return; }
    const hw = hoyWk();
    const n = esCoord()
      ? D.requisiciones.filter(r => r.estado === 'enviada').length
      : D.requisiciones.filter(r => r.anio === hw.anio && r.semana === hw.semana && visibleObra(r.obraId)).length;
    $$('[data-rcount="req"]').forEach(el => { el.textContent = n || ''; el.title = esCoord() ? 'Por revisar' : 'Esta semana'; });
    $$('[data-rcount="pend"]').forEach(el => { el.textContent = esCompras() ? D.compras.filter(c => c.factura && !c.pago).length || '' : ''; });
  }

  return {
    pages: { requisiciones: pageReqs, r: pageReq, compras: pageCompras, c: pageCompra, obras: pageObras },
    nav: { r: 'requisiciones', c: 'compras' },
    titulos: { requisiciones: 'Requisiciones', compras: 'Compras', obras: 'Obras' },
    acciones: {
      requisiciones: { label: 'Nueva requisición', act: 'nueva-req', puede: () => esCoord() || D.obras.some(o => esResDe(o.id)) },
      compras: { label: 'Nueva requisición', act: 'nueva-req', puede: () => esCoord() || D.obras.some(o => esResDe(o.id)) },
      obras: { label: 'Agregar obra', act: 'nueva-obra', puede: esJefe }
    },
    onAct(a) {
      if (a === 'nueva-req') drReq(null);
      if (a === 'nueva-obra' && esJefe()) drObra(null);
    },
    cargar, chrome, fichaProveedor, datosPanel, datosBind,
    importa: data => !!data && data.formato === R.FORMATO,
    importarArchivo
  };
});
