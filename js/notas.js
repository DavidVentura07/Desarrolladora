/* =========================================================
   Galitha · Pago por notas (v0.15, 2026-10-12)
   Para proveedores que dan el servicio en obra (acarreos, agregados…), dejan una nota y se les
   paga después juntando varias notas, por obra. Nunca facturan: sin cotización, factura ni XML.
   - Compras, desde una requisición revisada, manda materiales a "pago por notas" y elige el proveedor.
   - El residente (o quien captura en la obra) sube cada nota: foto, fecha, folio y qué se recibió.
     Un material puede tener varias notas.
   - Compras pone el importe de cada nota y registra un pago con varias notas de la misma obra
     y proveedor (con comprobante); el monto puede no coincidir con la suma (se marca en rojo).
   - Los pagos entran a Erogaciones en la semana del pago. Avisos: Edge Function "aviso-notas".
   Datos: store-req.js (pnMat, pnNotas, pnPagos). Reglas: supabase/17-pago-por-notas.sql.
   No se usa el nombre de ningún proveedor en el código: sale del directorio.
   ========================================================= */
(window.GALITHA_MODULOS = window.GALITHA_MODULOS || []).push(api => {
  const R = window.StoreReq;
  const N = window.Nube;
  const { esc, I, toast } = api;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : null; };
  Object.assign(I, Object.fromEntries(Object.entries({
    cam: api.ico('<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.5-2h6.6l1.5 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/><circle cx="12" cy="12.8" r="3.4"/>'),
    img: api.ico('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>')
  }).filter(([k]) => !I[k])));

  /* ---------- Fechas y dinero ---------- */
  const pad = n => String(n).padStart(2, '0');
  const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const toDate = s => { if (!s) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const m = s.split('-'); return new Date(+m[0], +m[1] - 1, +m[2]); } const d = new Date(s); return isNaN(d) ? null : d; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fDate = s => { const d = toDate(s); return d ? `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}` : '—'; };
  const fDateL = s => { const d = toDate(s); return d ? `${d.getDate()} de ${MES[d.getMonth()]} ${d.getFullYear()}` : 'sin fecha'; };
  const fDateT = s => { const d = toDate(s); if (!d) return '—'; let h = d.getHours(); const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; return `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)}, ${h}:${pad(d.getMinutes())} ${ap}`; };
  const dias = s => { const d = toDate(s); return d ? Math.max(0, Math.round((toDate(today()) - d) / 864e5)) : 0; };
  const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const money = n => MXN.format(+n || 0);
  const capital = s => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);
  // "6 viajes", "21 m3": la unidad en minúsculas y en plural cuando es una palabra
  const unidad = (u, q) => { const w = String(u || "").toLowerCase(); return +q !== 1 && /^[a-záéíóúñ]{4,}$/.test(w) && !/s$/.test(w) ? w + (/[aeiou]$/.test(w) ? "s" : "es") : w; };

  /* ---------- Datos y permisos (la base los vuelve a revisar) ---------- */
  let D = R.snapshot();
  async function cargar() {
    try { D = await R.cargar(); } catch (e) { toast('No se pudo cargar: ' + e.message); D = R.snapshot(); }
    return D;
  }
  async function hacer(fn, msgOk) {
    try { await fn(); } catch (e) { toast(e.message); await cargar(); return false; }
    await cargar();
    if (msgOk) toast(msgOk);
    return true;
  }
  const rol = () => (N.perfil || {}).rol;
  const yoId = () => (N.perfil || {}).id;
  const esJefe = () => ['direccion', 'admin'].includes(rol());
  const esOficina = () => esJefe() || rol() === 'compras';   // ponen importes, registran pagos, mandan materiales
  const obra = id => D.obras.find(o => o.id === id);
  const esResDe = id => {
    if (rol() === 'consulta') return false;
    const o = obra(id); if (!o) return false;
    if (o.residenteId && o.residenteId === yoId()) return true;
    const h = today();
    return (o.suplentes || []).some(s => s.perfilId === yoId() && s.desde <= h && h <= s.hasta);
  };
  const puedeSubir = obraId => esOficina() || rol() === 'coordinador' || esResDe(obraId);
  const verObra = id => esOficina() || rol() === 'coordinador' || esResDe(id);
  const mat = id => D.pnMat.find(m => m.id === id);
  const notasDe = m => D.pnNotas.filter(n => n.materialId === m.id);
  const provDe = n => (mat(n.materialId) || {}).proveedorId || '';
  const pago = id => D.pnPagos.find(g => g.id === id);

  /* ---------- Estado de la página ---------- */
  const UI = Object.assign({ obra: '', prov: '' }, (() => { try { return JSON.parse(sessionStorage.getItem('galitha.pn.ui')) || {}; } catch { return {}; } })());
  const saveUI = () => { try { sessionStorage.setItem('galitha.pn.ui', JSON.stringify(UI)); } catch { /* sin acceso */ } };
  let marcadas = new Set();   // notas marcadas para pagar (se reinicia al cambiar de obra o proveedor)

  const vacia = (titulo, h, p) => ({ title: titulo, html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">${h}</h2><p class="muted">${p}</p></div></section>`, bind() { } });

  // Resumen por obra (y proveedor) de lo que se ve
  function resumen(oid, prov) {
    const ms = D.pnMat.filter(m => m.obraId === oid && (!prov || m.proveedorId === prov));
    const ids = new Set(ms.map(m => m.id));
    const ns = D.pnNotas.filter(n => ids.has(n.materialId));
    const sinPagar = ns.filter(n => !n.pagoId);
    const porPagar = sinPagar.filter(n => n.importe != null), esperan = sinPagar.filter(n => n.importe == null);
    const pagos = D.pnPagos.filter(g => g.obraId === oid && (!prov || g.proveedorId === prov));
    return { ms, ns, sinPagar, porPagar, esperan, pagos, debe: porPagar.reduce((a, n) => a + n.importe, 0),
      antigua: sinPagar.map(n => n.fecha).filter(Boolean).sort()[0] || '' };
  }

  /* ---------- Página ---------- */
  async function pageNotas() {
    if (rol() === 'consulta') return vacia('Pago por notas', 'Sin acceso', 'La cuenta de consulta no ve pagos.');
    await api.refresh(); await cargar();
    if (!D.pnListo) return vacia('Pago por notas', 'Falta preparar el servidor', 'Para usar el pago por notas hay que correr <span class="mono">supabase/17-pago-por-notas.sql</span> en Supabase.');
    const obras = D.obras.filter(o => verObra(o.id) && (D.pnMat.some(m => m.obraId === o.id)));
    if (!obras.length) {
      return vacia('Pago por notas', 'Todavía no hay nada aquí', esOficina()
        ? 'En una requisición revisada, marca los materiales (acarreos, grava, arena…) y usa <b>Mandar a pago por notas</b>. Después el residente sube las notas del proveedor y tú les pones importe y las pagas juntas.'
        : 'Cuando compras mande materiales de tu requisición a pago por notas, aquí subirás la foto de cada nota del proveedor.');
    }
    if (!obras.some(o => o.id === UI.obra)) {
      // la obra con más que pagar primero
      UI.obra = obras.map(o => [o, resumen(o.id).debe + resumen(o.id).esperan.length]).sort((a, b) => b[1] - a[1])[0][0].id;
      UI.prov = ''; marcadas = new Set();
    }
    const o = obra(UI.obra);
    const provs = [...new Map(D.pnMat.filter(m => m.obraId === o.id).map(m => [m.proveedorId, m.proveedor])).entries()];
    if (!provs.some(([id]) => id === UI.prov)) { UI.prov = provs[0] ? provs[0][0] : ''; marcadas = new Set(); }
    saveUI();
    const nomProv = (provs.find(([id]) => id === UI.prov) || [])[1] || 'proveedor';
    const x = resumen(o.id, UI.prov);
    marcadas = new Set([...marcadas].filter(id => x.porPagar.some(n => n.id === id)));
    const of = esOficina();
    const ultimo = x.pagos[0];
    const sel = x.porPagar.filter(n => marcadas.has(n.id)), tsel = sel.reduce((a, n) => a + n.importe, 0);

    const barra = obras.length > 1 ? `<nav class="fz-obras rv" aria-label="Obra">${obras.map(ob => {
      const r = resumen(ob.id);
      const [c, t] = r.debe || r.esperan.length ? ['sun', `${money(r.debe)} por pagar${r.esperan.length ? ` · ${r.esperan.length} sin importe` : ''}`] : ['gris', 'Sin notas pendientes'];
      return `<button type="button" class="fz-ob${ob.id === o.id ? ' on' : ''}" data-pn-obra="${esc(ob.id)}"><b>${esc(ob.nombre)}</b><small><i class="e-${c}"></i>${esc(t)}</small></button>`;
    }).join('')}</nav>` : '';
    const tarjeta = (n, enPago) => {
      const m = mat(n.materialId) || {};
      const marc = enPago && of && marcadas.has(n.id);
      return `<div class="pn-nota${marc ? ' sel' : ''}${n.pagoId ? ' pagada' : ''}" data-nota="${esc(n.id)}">
        ${enPago && of ? `<button type="button" class="pn-chk" data-marca="${esc(n.id)}" aria-pressed="${marc}" aria-label="Marcar para pagar">${marc ? '✓' : ''}</button>` : ''}
        <div class="pn-top"><button type="button" class="pn-img" data-ver="${esc(n.id)}" aria-label="Ver la nota">${n.archivos[0] ? `<img alt="" data-ruta="${esc(n.archivos[0].ruta)}">` : ''}</button>
          <div><b>Nota ${esc(n.folio || 'sin folio')}</b><small>${esc(fDate(n.fecha))} · ${esc(capital(m.concepto || ''))}${n.recibido ? ' · ' + esc(n.recibido) : ''}</small></div></div>
        <div class="pn-imp">${n.importe == null
          ? (of ? `<input class="in" inputmode="decimal" placeholder="Importe $" data-imp="${esc(n.id)}" aria-label="Importe de la nota ${esc(n.folio)}"><button type="button" class="btn btn--solid btn--sm" data-guardar="${esc(n.id)}">${I.check}<span>Guardar</span></button>`
            : '<small>Importe</small><span class="st-tag">Por capturar</span>')
          : `<small>Importe</small><strong>${money(n.importe)}</strong>${of && !n.pagoId ? `<button type="button" class="ibtn" data-corregir="${esc(n.id)}" title="Corregir el importe" aria-label="Corregir el importe">${I.edit}</button>` : ''}`}</div>
      </div>`;
    };
    const materiales = x.ms.map(m => {
      const ns = notasDe(m), pag = ns.filter(n => n.pagoId).length;
      return `<div class="pn-wait"><span class="pn-dot">${I.truck}</span><div><b>${esc(capital(m.concepto))} · ${esc(String(m.cantidad))} ${esc(unidad(m.unidad, m.cantidad))}</b>
        <small>${ns.length ? `${ns.length} ${ns.length === 1 ? 'nota' : 'notas'}${pag ? ` (${pag} ${pag === 1 ? 'pagada' : 'pagadas'})` : ''}` : 'Sin notas todavía'} · semana ${m.semana}</small></div>
        ${puedeSubir(m.obraId) ? `<button type="button" class="btn btn--sm${esResDe(m.obraId) ? ' btn--solid' : ''}" data-subir="${esc(m.id)}">${I.cam}<span>Subir nota</span></button>` : ''}
        ${of && !ns.length ? `<button type="button" class="ibtn" data-quitar-mat="${esc(m.id)}" title="Quitar de pago por notas" aria-label="Quitar de pago por notas">${I.close}</button>` : ''}</div>`;
    }).join('');
    const historial = `<div class="fz-card"><h3>Pagos anteriores</h3>${x.pagos.length ? `<ul class="fz-mov pn-hist">${x.pagos.slice(0, 12).map(g => {
      const ns = D.pnNotas.filter(n => n.pagoId === g.id), suma = ns.reduce((a, n) => a + (n.importe || 0), 0), dif = Math.abs(suma - g.monto) >= 0.01;
      return `<li data-pago="${esc(g.id)}" tabindex="0"><span class="dot" style="background:var(--ok-bg);color:var(--ok)">${I.check}</span><div><b>${esc(fDate(g.fecha))}</b><small>${ns.length} ${ns.length === 1 ? 'nota' : 'notas'}${dif ? ' · <span class="pn-rojo">no coincide</span>' : ''}</small></div><span class="m">${money(g.monto)}</span></li>`;
    }).join('')}</ul>` : '<p class="muted small">Todavía no hay pagos.</p>'}</div>`;
    const panelPago = of ? `<div class="fz-card fz-envio"><b class="pn-ptit">Pago · ${esc(o.nombre)}</b>
        ${sel.length ? `<div class="pn-sum">${sel.map(n => `<div><span>Nota ${esc(n.folio || 's/f')} · ${esc(fDate(n.fecha))}</span><span>${money(n.importe)}</span></div>`).join('')}<div class="tot"><span>${sel.length} ${sel.length === 1 ? 'nota' : 'notas'}</span><span>${money(tsel)}</span></div></div>`
          : '<p class="muted small">Marca en "Por pagar" las notas que vas a pagar.</p>'}
        <button type="button" class="btn btn--solid" data-pagar${sel.length ? '' : ' disabled'}>${I.cash}<span>Registrar pago</span></button>
        <small>Un solo comprobante para las notas marcadas. Entra a Erogaciones en la semana del pago.</small></div>` : '';

    return {
      title: 'Pago por notas',
      html: `<section class="page">
        ${barra}
        <section class="hero">
          <div class="hero-main rv" style="--d:0"><div class="deco">${api.markSVG()}</div>
            <div><p class="h-eyebrow">${esc(o.nombre)} · ${esc(nomProv)}</p><h1>Pago<br>por notas</h1></div>
            <p class="h-sum"><span class="h-count"><b>${x.sinPagar.length}</b> ${x.sinPagar.length === 1 ? 'nota sin pagar' : 'notas sin pagar'}${x.antigua ? ` · la más antigua del <b>${esc(fDate(x.antigua))}</b> (${dias(x.antigua)} días)` : ''}</span>${ultimo ? `<span class="pill">Último pago: ${esc(fDate(ultimo.fecha))} · ${money(ultimo.monto)}</span>` : ''}</p>
          </div>
          <div class="sqs-h">
            <div class="sq sq--sun rv" style="--d:80"><p>Por pagar</p><div class="sq-row sq-row--col"><strong class="pn-monto">${money(x.debe)}</strong><small>${x.porPagar.length} ${x.porPagar.length === 1 ? 'nota con importe' : 'notas con importe'}</small></div></div>
            <div class="sq sq--bad rv" style="--d:120"><p>Esperan<br>importe</p><div class="sq-row sq-row--col"><strong>${x.esperan.length}</strong><small>${of ? 'revisa la foto y pon el importe' : 'compras las revisa'}</small></div></div>
          </div>
        </section>
        ${provs.length > 1 ? `<div class="fz-tools rv"><div class="seg fz-seg" role="group" aria-label="Proveedor">${provs.map(([id, nom]) => `<button type="button" aria-pressed="${id === UI.prov}" data-pn-prov="${esc(id)}">${esc(nom || 'Proveedor')}</button>`).join('')}</div><span class="fz-esp"></span><small class="muted">Cada proveedor se paga por separado</small></div>` : ''}
        <div class="fz-ab">
          <div>
            <div class="fz-sec" style="margin-top:0"><h2>Esperan importe</h2><small>${of ? 'Revisa la foto y pon cuánto vale la nota' : 'Compras revisa la foto y pone el importe'}</small></div>
            ${x.esperan.length ? `<div class="pn-grid">${x.esperan.map(n => tarjeta(n)).join('')}</div>` : '<p class="muted small">Ninguna.</p>'}
            <div class="fz-sec"><h2>Por pagar</h2><small>${of ? 'Marca las notas que se van a pagar' : 'Con importe, todavía sin pagar'}</small>${of && x.porPagar.length ? `<div class="r"><button type="button" class="tbtn tbtn--sm" data-todas>${marcadas.size === x.porPagar.length ? 'Desmarcar todas' : 'Marcar todas'}</button></div>` : ''}</div>
            ${x.porPagar.length ? `<div class="pn-grid">${x.porPagar.map(n => tarjeta(n, true)).join('')}</div>` : '<p class="muted small">Ninguna.</p>'}
            <div class="fz-sec"><h2>Materiales</h2><small>Puede llegar más de una nota por material</small></div>
            <div class="pn-grid pn-grid--lista">${materiales}</div>
          </div>
          <aside class="fz-side">${panelPago}${historial}</aside>
        </div>
      </section>`,
      bind(sec) {
        const on = (sel0, fn) => $$(sel0, sec).forEach(b => b.addEventListener('click', e => fn(b, e)));
        on('[data-pn-obra]', b => { UI.obra = b.dataset.pnObra; UI.prov = ''; marcadas = new Set(); saveUI(); api.rerender(); });
        on('[data-pn-prov]', b => { UI.prov = b.dataset.pnProv; marcadas = new Set(); saveUI(); api.rerender(); });
        on('[data-marca]', b => { const id = b.dataset.marca; if (marcadas.has(id)) marcadas.delete(id); else marcadas.add(id); api.rerender(); });
        on('[data-todas]', () => { marcadas = marcadas.size === x.porPagar.length ? new Set() : new Set(x.porPagar.map(n => n.id)); api.rerender(); });
        on('[data-ver]', b => drNota(D.pnNotas.find(n => n.id === b.dataset.ver)));
        on('[data-subir]', b => subirNota(b.dataset.subir));
        on('[data-pagar]', () => drPago(o, sel));
        on('[data-pago]', b => drVerPago(pago(b.dataset.pago)));
        $$('[data-pago]', sec).forEach(li => li.addEventListener('keydown', e => { if (e.key === 'Enter') drVerPago(pago(li.dataset.pago)); }));
        on('[data-guardar]', async b => {
          const inp = $(`[data-imp="${b.dataset.guardar}"]`, sec), v = num(inp.value);
          if (v == null || v < 0) { toast('Escribe el importe de la nota.'); inp.focus(); return; }
          b.disabled = true;
          if (await hacer(() => R.importeNota(b.dataset.guardar, v), 'Importe guardado.')) api.rerender(); else b.disabled = false;
        });
        $$('[data-imp]', sec).forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $(`[data-guardar="${inp.dataset.imp}"]`, sec).click(); } }));
        on('[data-corregir]', async b => {
          const n = D.pnNotas.find(z => z.id === b.dataset.corregir);
          const v = await api.preguntar({ titulo: 'Corregir el importe', texto: `Nota ${esc(n.folio || 'sin folio')} · ${esc(fDate(n.fecha))}`, etiqueta: 'Importe ($)', campo: 'numero', valor: String(n.importe), ok: 'Guardar', requerido: true });
          if (v == null) return;
          if (num(v) == null) { toast('Escribe un número.'); return; }
          if (await hacer(() => R.importeNota(n.id, num(v)), 'Importe corregido.')) api.rerender();
        });
        on('[data-quitar-mat]', async b => {
          const m = mat(b.dataset.quitarMat);
          if (!(await api.confirmar({ titulo: 'Quitar de pago por notas', texto: `<b>${esc(capital(m.concepto))}</b> regresa a "Autorizado" en su requisición, para comprarlo por otro camino.`, ok: 'Quitar', peligro: true }))) return;
          if (await hacer(() => R.quitarDeNotas(m.id), 'Quitado de pago por notas.')) api.rerender();
        });
        miniaturas(sec);
        chrome();   // el contador de la barra lateral con los datos recién cargados
      }
    };
  }

  // Las fotos son privadas: cada miniatura pide su liga temporal
  function miniaturas(root) {
    $$('img[data-ruta]', root).forEach(async im => {
      im.addEventListener('error', () => im.remove());   // si no carga, se queda el fondo (sin ícono roto)
      try { im.src = await R.urlArchivo(im.dataset.ruta); } catch (e) { im.remove(); }
    });
  }
  async function abrirArchivo(ruta) {
    const w = window.open('', '_blank');
    try { const url = await R.urlArchivo(ruta); if (w) w.location.href = url; else location.href = url; }
    catch (e) { if (w) w.close(); toast(e.message); }
  }
  const avisoTxt = av => (av ? `<p class="k-aviso">${av.para.every(p => p.canal === 'whatsapp') ? I.wa : I.mail}<span>Aviso · ${esc(av.para.map(p => `${p.nombre || p.correo || p.telefono}${p.canal === 'whatsapp' ? ' (WhatsApp)' : p.canal === 'correo' ? ' (correo)' : ''}`).join(', '))} · ${esc(fDateT(av.en))}</span></p>` : '');
  async function avisar(evento, id) {
    try {
      const d = await R.avisarNotas(evento, id);
      if (d && d.aviso) toast(`Aviso enviado a ${d.aviso.para.map(p => p.nombre || p.correo).join(', ')}.`);
    } catch (e) { toast('Quedó guardado, pero no salió el aviso: ' + e.message); }
  }

  /* ---------- Mandar materiales a pago por notas (compras, desde la requisición) ---------- */
  async function mandar(partidaIds) {
    if (!partidaIds.length) return;
    await api.refresh(); await cargar();
    const ps = D.requisiciones.flatMap(r => r.partidas.map(p => Object.assign({ r }, p))).filter(p => partidaIds.includes(p.id));
    if (!ps.length) return;
    const oid = ps[0].r.obraId;
    // Se sugiere el último proveedor usado en esa obra
    const ultimo = [...D.pnMat].reverse().find(m => m.obraId === oid && m.proveedorId);
    const provs = api.proveedores().filter(p => p.estatus !== 'no_recomendado').sort((a, b) => api.nombreProveedor(a).localeCompare(api.nombreProveedor(b), 'es'));
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(ps[0].r.folio)} · ${ps.length} ${ps.length === 1 ? 'material' : 'materiales'}</p><h2 id="dr-title">Mandar a pago por notas</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <p class="fld-h">Para proveedores que dan el servicio en obra, dejan una nota y se les paga después juntando varias notas. No lleva cotización, factura ni XML.</p>
        <ul class="pn-mats">${ps.map(p => `<li>${I.truck} ${esc(capital(p.insumo))}<span>${esc(String(p.cantidad))} ${esc(unidad(p.unidad, p.cantidad))}</span></li>`).join('')}</ul>
        <label class="fld" style="margin-top:16px"><span class="fld-l">Proveedor <em>*</em></span><select class="in" name="prov"><option value="">Elige…</option>${provs.map(p => `<option value="${esc(p.id)}"${ultimo && ultimo.proveedorId === p.id ? ' selected' : ''}>${esc(api.nombreProveedor(p))}</option>`).join('')}</select>
          <span class="fld-h">Cualquier proveedor del directorio.${ultimo ? ' Se sugiere el último que se usó en esta obra.' : ''}</span></label>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.send || I.check}<span>Mandar</span></button></footer>
    </form>`, {}, panel => {
      const f = $('form', panel);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        if (!f.prov.value) { $('[data-err]', panel).textContent = 'Elige el proveedor.'; return; }
        $('[data-ok]', panel).disabled = true;
        try { await R.mandarANotas(ps.map(p => p.id), f.prov.value); }
        catch (x) { $('[data-ok]', panel).disabled = false; $('[data-err]', panel).textContent = x.message; return; }
        await cargar(); api.closeDrawer(true);
        toast(`${ps.length === 1 ? 'Material mandado' : 'Materiales mandados'} a pago por notas. El residente ya puede subir las notas.`);
        api.rerender();
      });
    });
  }

  /* ---------- Subir (o corregir) una nota ---------- */
  async function subirNota(materialId, n0) {
    if (!n0) await cargar();
    const m = mat(materialId || (n0 && n0.materialId));
    if (!m) { toast('Ese material ya no está en pago por notas.'); return; }
    const n = n0 || { materialId: m.id, obraId: m.obraId, folio: '', fecha: today(), recibido: '', archivos: [] };
    let nuevos = [];
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(m.proveedor || 'Proveedor')} · ${esc(capital(m.concepto))}</p><h2 id="dr-title">${n0 ? 'Corregir nota' : 'Subir nota'}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <div class="fld"><span class="fld-l">Foto de la nota <em>*</em></span>
          <div class="pn-foto"><label>${I.cam}<span>Tomar foto</span><input type="file" accept="image/*" capture="environment" data-file hidden></label><label>${I.img}<span>Elegir de la galería</span><input type="file" accept="image/*,application/pdf" multiple data-file hidden></label></div>
          <div data-prev></div></div>
        <div class="grid2">
          <label class="fld"><span class="fld-l">Folio de la nota</span><input class="in" name="folio" value="${esc(n.folio)}" placeholder="El número que trae la nota"></label>
          <label class="fld"><span class="fld-l">Fecha del servicio <em>*</em></span><input class="in" name="fecha" type="date" value="${esc(n.fecha)}" max="${today()}"></label>
          <label class="fld fld--wide"><span class="fld-l">Qué se recibió</span><input class="in" name="recibido" value="${esc(n.recibido)}" placeholder="Ej. 2 viajes, 7 m³"><span class="fld-h">Como viene en la nota. El importe lo pone compras.</span></label>
        </div>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.check}<span>${n0 ? 'Guardar' : 'Subir nota'}</span></button></footer>
    </form>`, {}, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), prev = $('[data-prev]', panel);
      const pintar = () => {
        prev.innerHTML = [...n.archivos.map((a, i) => `<div class="pn-prev"><span class="pn-img">${/\.pdf$/i.test(a.nombre) ? '' : `<img alt="" data-ruta="${esc(a.ruta)}">`}</span><div><b>${esc(a.nombre)}</b><small>Ya guardada</small></div>${n.archivos.length + nuevos.length > 1 ? `<button type="button" class="ibtn" data-quita-v="${i}" aria-label="Quitar">${I.close}</button>` : ''}</div>`),
          ...nuevos.map((x, i) => `<div class="pn-prev"><span class="pn-img">${x.type.startsWith('image/') ? `<img alt="" src="${URL.createObjectURL(x)}">` : ''}</span><div><b>${esc(x.name)}</b><small>${Math.round(x.size / 1024)} KB</small></div><button type="button" class="ibtn" data-quita-n="${i}" aria-label="Quitar">${I.close}</button></div>`)].join('');
        miniaturas(prev);
      };
      pintar();
      $$('[data-file]', panel).forEach(inp => inp.addEventListener('change', () => { nuevos = [...nuevos, ...inp.files]; inp.value = ''; api.markDirty(); pintar(); }));
      prev.addEventListener('click', e => {
        const a = e.target.closest('[data-quita-n]'); if (a) { nuevos.splice(+a.dataset.quitaN, 1); pintar(); return; }
        const b = e.target.closest('[data-quita-v]'); if (b) { n.archivos = n.archivos.filter((_, i) => i !== +b.dataset.quitaV); pintar(); }
      });
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        if (!n.archivos.length && !nuevos.length) { err.textContent = 'Falta la foto de la nota.'; return; }
        if (!f.fecha.value) { err.textContent = 'Escribe la fecha del servicio.'; return; }
        $('[data-ok]', panel).disabled = true; $('[data-ok] span', panel).textContent = 'Subiendo…';
        let id;
        try { id = await R.guardarNota(Object.assign({}, n, { folio: f.folio.value.trim(), fecha: f.fecha.value, recibido: f.recibido.value.trim() }), nuevos); }
        catch (x) { $('[data-ok]', panel).disabled = false; $('[data-ok] span', panel).textContent = n0 ? 'Guardar' : 'Subir nota'; err.textContent = x.message; return; }
        await cargar(); api.closeDrawer(true);
        toast(n0 ? 'Nota corregida.' : 'Nota subida. Compras le pondrá el importe.');
        api.rerender();
        if (!n0) avisar('nota', id);
      });
    });
  }

  /* ---------- Ver una nota ---------- */
  function drNota(n) {
    if (!n) return;
    const m = mat(n.materialId) || {}, of = esOficina();
    const editable = !n.pagoId && (of || (n.importe == null && puedeSubir(n.obraId)));
    api.openPanel(`<div class="dr-form">
      <header class="dr-h"><div><p class="mono">${esc(m.proveedor || 'Proveedor')} · ${esc(capital(m.concepto || ''))}</p><h2 id="dr-title">Nota ${esc(n.folio || 'sin folio')}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <div class="pn-fotos">${n.archivos.map(a => /\.pdf$/i.test(a.nombre) ? `<button type="button" class="fchip" data-abrir="${esc(a.ruta)}">${I.file}<span>${esc(a.nombre)}</span></button>` : `<button type="button" class="pn-foto-g" data-abrir="${esc(a.ruta)}"><img alt="Foto de la nota" data-ruta="${esc(a.ruta)}"></button>`).join('')}</div>
        <dl class="dl">
          <div><dt>Fecha del servicio</dt><dd>${esc(fDateL(n.fecha))}</dd></div>
          ${n.recibido ? `<div><dt>Qué se recibió</dt><dd>${esc(n.recibido)}</dd></div>` : ''}
          <div><dt>Importe</dt><dd>${n.importe == null ? 'Por capturar (compras)' : `<b>${money(n.importe)}</b>${n.importePor ? ` · ${esc(n.importePor)}` : ''}`}</dd></div>
          <div><dt>Estado</dt><dd>${n.pagoId ? `Pagada el ${esc(fDate((pago(n.pagoId) || {}).fecha))}` : n.importe == null ? 'Espera importe' : 'Por pagar'}</dd></div>
          <div><dt>Subió</dt><dd>${esc(n.creadoPor || '—')} · ${esc(fDateT(n.creadoEn))}</dd></div>
        </dl>
        ${avisoTxt(n.avisos[0])}
      </div>
      <footer class="dr-f">${editable ? `<button type="button" class="btn btn--danger" data-borrar>${I.trash}<span>Quitar</span></button><button type="button" class="btn" data-editar>${I.edit}<span>Corregir</span></button>` : ''}<button type="button" class="btn btn--solid" data-close><span>Cerrar</span></button></footer>
    </div>`, {}, panel => {
      miniaturas(panel);
      $$('[data-abrir]', panel).forEach(b => b.addEventListener('click', () => abrirArchivo(b.dataset.abrir)));
      const ed = $('[data-editar]', panel); if (ed) ed.addEventListener('click', () => { api.closeDrawer(true); subirNota(n.materialId, JSON.parse(JSON.stringify(n))); });
      const bo = $('[data-borrar]', panel);
      if (bo) bo.addEventListener('click', async () => {
        if (!(await api.confirmar({ titulo: 'Quitar nota', texto: `Nota <b>${esc(n.folio || 'sin folio')}</b> del ${esc(fDate(n.fecha))}. No se puede deshacer.`, ok: 'Quitar', peligro: true }))) return;
        if (await hacer(() => R.borrarNota(n.id), 'Nota quitada.')) { api.closeDrawer(true); api.rerender(); }
      });
    });
  }

  /* ---------- Registrar un pago ---------- */
  function drPago(o, notas) {
    if (!notas.length) { toast('Marca las notas que vas a pagar.'); return; }
    const suma = notas.reduce((a, n) => a + n.importe, 0);
    const m0 = mat(notas[0].materialId) || {};
    let comp = [];
    api.openPanel(`<form class="dr-form" novalidate>
      <header class="dr-h"><div><p class="mono">${esc(m0.proveedor || 'Proveedor')} · ${esc(o.nombre)}</p><h2 id="dr-title">Registrar pago</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <ul class="pn-mats">${notas.map(n => `<li>Nota ${esc(n.folio || 's/f')} · ${esc(fDate(n.fecha))} · ${esc(capital((mat(n.materialId) || {}).concepto || ''))}<span>${money(n.importe)}</span></li>`).join('')}</ul>
        <div class="pn-total"><span>Suma de ${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}</span><span>${money(suma)}</span></div>
        <div class="grid2">
          <label class="fld"><span class="fld-l">Monto pagado <em>*</em></span><input class="in" name="monto" inputmode="decimal" value="${suma.toFixed(2)}"></label>
          <label class="fld"><span class="fld-l">Fecha del pago <em>*</em></span><input class="in" name="fecha" type="date" value="${today()}" max="${today()}"></label>
        </div>
        <div class="pn-dif" data-dif hidden></div>
        <div class="fld"><span class="fld-l">Comprobante de pago <em>*</em></span>
          <div class="pn-foto"><label>${I.file}<span>Subir PDF o foto</span><input type="file" accept="application/pdf,image/*" multiple data-file hidden></label><label>${I.cam}<span>Tomar foto</span><input type="file" accept="image/*" capture="environment" data-file hidden></label></div>
          <div data-prev></div></div>
        <label class="fld"><span class="fld-l">Nota (opcional)</span><input class="in" name="nota" placeholder="Transferencia, referencia, motivo de la diferencia…"></label>
        <p class="fld-h" data-sem></p>
      </div>
      <footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.cash}<span>Registrar pago</span></button></footer>
    </form>`, {}, panel => {
      const f = $('form', panel), err = $('[data-err]', panel), prev = $('[data-prev]', panel);
      const pintar = () => { prev.innerHTML = comp.map((x, i) => `<div class="pn-prev"><span class="pn-img">${x.type.startsWith('image/') ? `<img alt="" src="${URL.createObjectURL(x)}">` : ''}</span><div><b>${esc(x.name)}</b><small>${Math.round(x.size / 1024)} KB</small></div><button type="button" class="ibtn" data-quita="${i}" aria-label="Quitar">${I.close}</button></div>`).join(''); };
      const dif = () => {
        const v = num(f.monto.value), d = v == null ? 0 : v - suma, box = $('[data-dif]', panel);
        const hay = v != null && Math.abs(d) >= 0.01;
        box.hidden = !hay; f.monto.classList.toggle('pn-in-bad', hay);
        if (hay) box.innerHTML = `${I.alert}<span>El monto es <b>${money(Math.abs(d))} ${d < 0 ? 'menor' : 'mayor'}</b> que la suma de las notas. Se puede registrar así (descuento o ajuste) y quedará marcado en rojo.</span>`;
        $('[data-sem]', panel).textContent = `Las notas quedan pagadas y el pago entra a Erogaciones en la semana del ${fDateL(f.fecha.value)}. Se le avisa al residente.`;
      };
      dif();
      f.monto.addEventListener('input', dif); f.fecha.addEventListener('change', dif);
      $$('[data-file]', panel).forEach(inp => inp.addEventListener('change', () => { comp = [...comp, ...inp.files]; inp.value = ''; pintar(); }));
      prev.addEventListener('click', e => { const b = e.target.closest('[data-quita]'); if (b) { comp.splice(+b.dataset.quita, 1); pintar(); } });
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        const v = num(f.monto.value);
        if (!(v > 0)) { err.textContent = 'Escribe el monto pagado.'; return; }
        if (!f.fecha.value) { err.textContent = 'Escribe la fecha del pago.'; return; }
        if (!comp.length) { err.textContent = 'Falta el comprobante del pago.'; return; }
        $('[data-ok]', panel).disabled = true;
        let id;
        try { id = await R.registrarPagoNotas({ obraId: o.id, notas: notas.map(n => n.id), monto: v, fecha: f.fecha.value, nota: f.nota.value.trim() }, comp); }
        catch (x) { $('[data-ok]', panel).disabled = false; err.textContent = x.message; return; }
        marcadas = new Set();
        await cargar(); api.closeDrawer(true);
        toast('Pago registrado.');
        api.rerender();
        avisar('pago', id);
      });
    });
  }

  /* ---------- Ver un pago ---------- */
  function drVerPago(g) {
    if (!g) return;
    const ns = D.pnNotas.filter(n => n.pagoId === g.id), suma = ns.reduce((a, n) => a + (n.importe || 0), 0), d = g.monto - suma;
    api.openPanel(`<div class="dr-form">
      <header class="dr-h"><div><p class="mono">${esc(g.proveedor || 'Proveedor')} · ${esc((obra(g.obraId) || {}).nombre || '')}</p><h2 id="dr-title">Pago del ${esc(fDate(g.fecha))}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>
      <div class="dr-b">
        <ul class="pn-mats">${ns.map(n => `<li>Nota ${esc(n.folio || 's/f')} · ${esc(fDate(n.fecha))} · ${esc(capital((mat(n.materialId) || {}).concepto || ''))}<span>${money(n.importe)}</span></li>`).join('')}</ul>
        <div class="pn-total"><span>Pagado</span><span>${money(g.monto)}</span></div>
        ${Math.abs(d) >= 0.01 ? `<div class="pn-dif">${I.alert}<span>El pago fue <b>${money(Math.abs(d))} ${d < 0 ? 'menor' : 'mayor'}</b> que la suma de las notas (${money(suma)}).</span></div>` : ''}
        <dl class="dl">
          <div><dt>Fecha</dt><dd>${esc(fDateL(g.fecha))} · semana ${g.semana}</dd></div>
          ${g.nota ? `<div><dt>Nota</dt><dd>${esc(g.nota)}</dd></div>` : ''}
          <div><dt>Registró</dt><dd>${esc(g.creadoPor || '—')} · ${esc(fDateT(g.creadoEn))}</dd></div>
          <div><dt>Comprobante</dt><dd>${g.archivos.map(a => `<button type="button" class="fchip" data-abrir="${esc(a.ruta)}">${I.file}<span>${esc(a.nombre)}</span></button>`).join(' ') || '—'}</dd></div>
        </dl>
        ${avisoTxt(g.avisos[0])}
      </div>
      <footer class="dr-f">${esOficina() ? `<button type="button" class="btn btn--danger" data-quitar>${I.trash}<span>Quitar pago</span></button>${g.avisos.length ? '' : '<button type="button" class="btn" data-avisar><span>Avisar al residente</span></button>'}` : ''}<button type="button" class="btn btn--solid" data-close><span>Cerrar</span></button></footer>
    </div>`, {}, panel => {
      $$('[data-abrir]', panel).forEach(b => b.addEventListener('click', () => abrirArchivo(b.dataset.abrir)));
      const av = $('[data-avisar]', panel); if (av) av.addEventListener('click', async () => { av.disabled = true; await avisar('pago', g.id); await cargar(); api.closeDrawer(true); api.rerender(); });
      const q = $('[data-quitar]', panel);
      if (q) q.addEventListener('click', async () => {
        if (!(await api.confirmar({ titulo: 'Quitar pago', texto: `Pago de <b>${money(g.monto)}</b> del ${esc(fDate(g.fecha))}. Sus ${ns.length} ${ns.length === 1 ? 'nota regresa' : 'notas regresan'} a "Por pagar" y sale de Erogaciones.`, ok: 'Quitar pago', peligro: true }))) return;
        if (await hacer(() => R.borrarPagoNotas(g.id), 'Pago quitado.')) { api.closeDrawer(true); api.rerender(); }
      });
    });
  }

  /* ---------- Barra lateral: desplegable "Compras" y contador ---------- */
  const RUTAS_COMPRAS = ['compras', 'c', 'caja', 'notas', 'fiscal'];
  function marcarGrupo() {
    const r = (location.hash.match(/^#\/([^/]+)/) || [])[1] || '';
    $$('[data-cpgrp]').forEach(g => { const den = RUTAS_COMPRAS.includes(r); g.classList.toggle('en', den); g.classList.toggle('open', den); });
  }
  addEventListener('hashchange', marcarGrupo);
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-cpgrp-t]'); if (!t) return;
    e.preventDefault();
    const g = t.closest('[data-cpgrp]');
    if (g.classList.contains('en')) g.classList.toggle('open'); else location.hash = t.getAttribute('href');
  });
  setTimeout(marcarGrupo, 0);
  function chrome() {
    marcarGrupo();
    if (!N.perfil) return;
    const S = R.snapshot();   // lo que ya cargó cualquier página (requisiciones, compras o esta)
    const n = esOficina() ? (S.pnNotas || []).filter(x => !x.pagoId && x.importe == null).length : 0;
    $$('[data-ncount]').forEach(el => { el.textContent = n || ''; el.title = 'Notas que esperan importe'; });
  }

  window.PagoNotas = { puedeSubir, mandar, subirNota };
  return {
    pages: { notas: pageNotas },
    titulos: { notas: 'Pago por notas' },
    cargar, chrome
  };
});
