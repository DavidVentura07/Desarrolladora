/* =========================================================
   GALITHA · Requisiciones de obra, obras y compras — Datos
   v0.5: guarda en Supabase (obras, obra_suplentes, requisiciones,
   partidas, compras, compra_partidas, compra_documentos, config)
   y los archivos en la carpeta privada "documentos".
   La interfaz lee una copia en memoria (snapshot) con la misma
   forma que la versión local y escribe con operaciones por
   registro. Quién puede hacer qué lo decide la base de datos.
   ========================================================= */
(() => {
  const FORMATO = 'galitha.requisiciones';
  const VERSION = 2;
  const BUCKET = 'documentos';
  const RESPALDO_KEY = 'galitha.requisiciones.respaldo';

  const sb = () => window.Nube.sb;
  const now = () => new Date().toISOString();
  const str = v => (v == null ? '' : String(v)).trim();
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = () => {
    try { return crypto.randomUUID(); }
    catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  };
  const quien = id => (id ? window.Nube.nombreDe(id) || 'Usuario' : '');
  const fecha = v => (v ? String(v).slice(0, 10) : '');

  function ok({ data, error }) {
    if (error) throw new Error(window.Nube.traducir(error));
    return data;
  }

  /* ---------- Base de datos → forma que usa la interfaz ---------- */
  const deObra = o => ({
    id: o.id, nombre: str(o.nombre), clave: str(o.clave), direccion: str(o.direccion),
    estatus: o.estatus === 'cerrada' ? 'cerrada' : 'activa',
    residenteId: o.residente_id || '',
    residente: (() => {
      const p = o.residente_id && window.Nube.perfiles().find(x => x.id === o.residente_id);
      return { nombre: p ? (p.nombre || p.correo) : '', correo: p ? p.correo : '', telefono: p ? p.telefono || '' : '' };
    })(),
    suplentes: arr(o.obra_suplentes).map(s => ({ id: s.id, perfilId: s.perfil_id, nombre: quien(s.perfil_id), desde: s.desde, hasta: s.hasta, motivo: str(s.motivo) }))
      .sort((a, b) => b.desde.localeCompare(a.desde)),
    actualizadoEn: o.actualizado_en
  });

  const dePartida = p => ({
    id: p.id, orden: p.orden || 0, insumo: str(p.insumo), unidad: str(p.unidad), cantidad: num(p.cantidad),
    observaciones: str(p.observaciones), destino: str(p.destino), fechaSuministro: fecha(p.fecha_suministro),
    aprobacion: p.aprobacion || 'pendiente', motivoRechazo: str(p.motivo_rechazo),
    revisadaPor: quien(p.revisada_por), revisadaEn: p.revisada_en || '', compraId: ''
  });

  const deRequisicion = r => ({
    id: r.id, obraId: r.obra_id, anio: r.anio, semana: r.semana, tipo: r.tipo, folio: str(r.folio),
    fechaSuministro: fecha(r.fecha_suministro), nota: str(r.nota),
    estado: r.estado, comentarioRevision: str(r.comentario_revision),
    creadaPorId: r.creada_por || '', creadaPor: quien(r.creada_por), creadaEn: r.creada_en || '',
    enviadaEn: r.enviada_en || '', enviadaPor: quien(r.enviada_por),
    devueltaEn: r.devuelta_en || '', devueltaPor: quien(r.devuelta_por),
    revisadaEn: r.revisada_en || '', revisadaPor: quien(r.revisada_por),
    partidas: arr(r.partidas).map(dePartida).sort((a, b) => a.orden - b.orden),
    actualizadoEn: r.actualizado_en
  });

  // Un documento de la compra (el más reciente de cada tipo)
  const deDocumento = d => {
    const ar = arr(d.archivos);
    const base = {
      docId: d.id, archivos: ar, archivo: ar.length ? ar[0].nombre : '', fecha: fecha(d.fecha) || fecha(d.subido_en),
      monto: num(d.monto), referencia: str(d.referencia), nota: str(d.nota), subidoPor: quien(d.subido_por), subidoEn: d.subido_en
    };
    if (d.tipo === 'factura') {
      const x = obj(d.datos);
      const pdf = ar.find(a => /\.pdf$/i.test(a.nombre)), xml = ar.find(a => /\.xml$/i.test(a.nombre));
      return Object.assign({}, base, {
        serie: str(x.serie), folio: str(x.folio), fecha: str(x.fecha) || base.fecha, subtotal: num(x.subtotal), total: num(x.total),
        uuid: str(x.uuid).toUpperCase(), emisorRfc: str(x.emisorRfc), emisorNombre: str(x.emisorNombre),
        receptorRfc: str(x.receptorRfc), receptorNombre: str(x.receptorNombre), metodoPago: str(x.metodoPago), formaPago: str(x.formaPago),
        version: str(x.version), conceptos: arr(x.conceptos), cargadaEn: base.fecha,
        pdfArchivo: pdf || null, xmlArchivo: xml || null
      });
    }
    if (d.tipo === 'pago') return Object.assign(base, { aviso: obj(d.datos).aviso || null });
    if (d.tipo === 'remision') return Object.assign(base, { recibio: str(obj(d.datos).recibio) || base.subidoPor });
    return base;
  };

  function deCompra(c) {
    const docs = arr(c.compra_documentos).slice().sort((a, b) => String(a.subido_en).localeCompare(String(b.subido_en)));
    const ultimo = t => { const d = docs.filter(x => x.tipo === t).pop(); return d ? deDocumento(d) : null; };
    const prov = obj(c.proveedor);
    return {
      id: c.id, obraId: c.obra_id, anio: c.anio, semana: c.semana, requisicionId: '',
      proveedor: { nombre: str(prov.nombre), rfc: str(prov.rfc).toUpperCase(), razonSocial: str(prov.razonSocial), id: c.proveedor_id || '' },
      partidas: arr(c.compra_partidas).map(x => x.partida_id),
      fechaEntrega: fecha(c.fecha_entrega), entregas: obj(c.entregas), notas: str(c.notas),
      cotizacion: ultimo('cotizacion'), factura: ultimo('factura'), pago: ultimo('pago'), remision: ultimo('remision'),
      documentos: docs.map(d => Object.assign(deDocumento(d), { tipo: d.tipo })),
      creadaPor: quien(c.creada_por), actualizadoEn: c.actualizado_en
    };
  }

  /* ---------- Estado en memoria ---------- */
  let db = { obras: [], requisiciones: [], compras: [], config: { empresa: { nombre: '', rfc: '', correoRequisiciones: '' }, proceso: [] } };

  async function cargar() {
    const [, obras, reqs, compras, config] = await Promise.all([
      window.Nube.recargarPerfiles(),   // nombres de residentes, suplentes y de quién hizo cada cosa
      sb().from('obras').select('*, obra_suplentes(*)').order('nombre'),
      sb().from('requisiciones').select('*, partidas(*)').order('anio', { ascending: false }).order('semana', { ascending: false }),
      sb().from('compras').select('*, compra_partidas(partida_id), compra_documentos(*)'),
      sb().from('config').select('clave, valor')
    ]);
    const d = {
      obras: ok(obras).map(deObra),
      requisiciones: ok(reqs).map(deRequisicion),
      compras: ok(compras).map(deCompra),
      config: { empresa: { nombre: '', rfc: '', correoRequisiciones: '' }, proceso: [] }
    };
    ok(config).forEach(c => {
      if (c.clave === 'empresa') { const e = obj(c.valor); d.config.empresa = { nombre: str(e.nombre), rfc: str(e.rfc).toUpperCase(), correoRequisiciones: str(e.correoRequisiciones) }; }
      if (c.clave === 'proceso') d.config.proceso = arr(c.valor).map(str).filter(Boolean);
    });
    // Liga material ↔ compra y compra ↔ requisición
    const porPartida = new Map();
    d.compras.forEach(c => c.partidas.forEach(pid => porPartida.set(pid, c)));
    d.requisiciones.forEach(r => r.partidas.forEach(p => {
      const c = porPartida.get(p.id);
      if (c) { p.compraId = c.id; if (!c.requisicionId) c.requisicionId = r.id; }
    }));
    db = d;
    return clone(db);
  }

  /* ---------- Archivos ---------- */
  const nombreSeguro = n => str(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'archivo';

  // Las fotos del celular pesan 3–5 MB: se reducen a 1600 px y JPEG (≈300 KB) antes de subirlas
  async function comprimir(file) {
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size < 400 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch { return file; }
  }

  const TIPOS = { pdf: 'application/pdf', xml: 'text/xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
  async function subirArchivo(obraId, compraId, file) {
    const f = await comprimir(file);
    if (f.size > 10 * 1024 * 1024) throw new Error(`"${file.name}" pesa más de 10 MB.`);
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const tipo = f.type || TIPOS[ext] || 'application/octet-stream';
    const ruta = `${obraId}/${compraId}/${Date.now().toString(36)}-${nombreSeguro(f.name)}`;
    ok(await sb().storage.from(BUCKET).upload(ruta, f, { contentType: tipo === 'application/xml' ? 'text/xml' : tipo, upsert: false }));
    return { ruta, nombre: f.name, tipo, bytes: f.size };
  }
  async function borrarArchivos(rutas) {
    if (rutas.length) await sb().storage.from(BUCKET).remove(rutas);
  }

  const find = (k, id) => db[k].find(x => x.id === id);

  /* ---------- API pública ---------- */
  window.StoreReq = {
    FORMATO, VERSION, uid, now,
    cargar,
    snapshot() { return clone(db); },
    vacio: () => !db.obras.length && !db.requisiciones.length && !db.compras.length,

    /* Obras */
    async guardarObra(o) {
      const fila = { nombre: str(o.nombre), clave: str(o.clave).toUpperCase(), direccion: str(o.direccion), estatus: o.estatus === 'cerrada' ? 'cerrada' : 'activa', residente_id: o.residenteId || null };
      if (o.id && find('obras', o.id)) ok(await sb().from('obras').update(fila).eq('id', o.id).select('id'));
      else { o.id = o.id || uid(); ok(await sb().from('obras').insert(Object.assign({ id: o.id }, fila)).select('id')); }
      return o.id;
    },
    async agregarSuplente(obraId, perfilId, desde, hasta, motivo) {
      ok(await sb().from('obra_suplentes').insert({ obra_id: obraId, perfil_id: perfilId, desde, hasta, motivo: str(motivo) }).select('id'));
    },
    async quitarSuplente(id) {
      const filas = ok(await sb().from('obra_suplentes').delete().eq('id', id).select('id'));
      if (!filas.length) throw new Error('Tu rol no puede quitar suplencias.');
    },

    /* Requisiciones: r = { id?, obraId, anio, semana, tipo, folio, fechaSuministro, nota }, partidas = [{ id?, insumo, … }] */
    async guardarRequisicion(r, partidas) {
      const nueva = !(r.id && find('requisiciones', r.id));
      const fila = { tipo: r.tipo === 'extraordinaria' ? 'extraordinaria' : 'ordinaria', folio: str(r.folio), fecha_suministro: r.fechaSuministro || null, nota: str(r.nota) };
      if (nueva) {
        r.id = r.id || uid();
        ok(await sb().from('requisiciones').insert(Object.assign({ id: r.id, obra_id: r.obraId, anio: r.anio, semana: r.semana }, fila)).select('id'));
      } else {
        ok(await sb().from('requisiciones').update(fila).eq('id', r.id).select('id'));
      }
      const antes = nueva ? [] : find('requisiciones', r.id).partidas;
      const quedan = new Set(partidas.filter(p => p.id).map(p => p.id));
      const quitar = antes.filter(p => !quedan.has(p.id)).map(p => p.id);
      if (quitar.length) ok(await sb().from('partidas').delete().in('id', quitar).select('id'));
      const aFila = (p, i) => ({
        orden: i, insumo: str(p.insumo), unidad: str(p.unidad), cantidad: num(p.cantidad), observaciones: str(p.observaciones),
        destino: str(p.destino), fecha_suministro: p.fechaSuministro || null
      });
      const nuevas = [];
      for (let i = 0; i < partidas.length; i++) {
        const p = partidas[i], f = aFila(p, i), prev = p.id && antes.find(x => x.id === p.id);
        if (!prev) { nuevas.push(Object.assign({ id: p.id || uid(), requisicion_id: r.id }, f)); continue; }
        const igual = prev.orden === i && prev.insumo === f.insumo && prev.unidad === f.unidad && prev.cantidad === f.cantidad
          && prev.observaciones === f.observaciones && prev.destino === f.destino && (prev.fechaSuministro || null) === f.fecha_suministro;
        if (!igual) ok(await sb().from('partidas').update(f).eq('id', p.id).select('id'));
      }
      if (nuevas.length) ok(await sb().from('partidas').insert(nuevas).select('id'));
      return r.id;
    },
    async cambiarEstado(id, estado, comentario) {
      const f = { estado };
      if (comentario != null) f.comentario_revision = str(comentario);
      const filas = ok(await sb().from('requisiciones').update(f).eq('id', id).select('id'));
      if (!filas.length) throw new Error('No tienes permiso para cambiar esta requisición.');
    },
    async borrarRequisicion(id) {
      const filas = ok(await sb().from('requisiciones').delete().eq('id', id).select('id'));
      if (!filas.length) throw new Error('Solo se pueden borrar requisiciones en borrador.');
    },
    async revisarPartida(id, aprobacion, motivo) {
      const filas = ok(await sb().from('partidas').update({ aprobacion, motivo_rechazo: aprobacion === 'rechazada' ? str(motivo) : '' }).eq('id', id).select('id'));
      if (!filas.length) throw new Error('No tienes permiso para revisar este material.');
    },

    /* Compras */
    async crearCompra(c) {
      const id = uid();
      ok(await sb().from('compras').insert({
        id, obra_id: c.obraId, anio: c.anio, semana: c.semana, proveedor_id: c.proveedor.id || null,
        proveedor: { nombre: str(c.proveedor.nombre), rfc: str(c.proveedor.rfc), razonSocial: str(c.proveedor.razonSocial) },
        fecha_entrega: c.fechaEntrega || null, entregas: {}
      }).select('id'));
      try {
        ok(await sb().from('compra_partidas').insert(c.partidas.map(pid => ({ partida_id: pid, compra_id: id }))).select('partida_id'));
      } catch (e) {
        await sb().from('compras').delete().eq('id', id);
        throw e;
      }
      return id;
    },
    async actualizarCompra(id, patch) {
      const f = {};
      if ('fechaEntrega' in patch) f.fecha_entrega = patch.fechaEntrega || null;
      if ('entregas' in patch) f.entregas = patch.entregas;
      if ('proveedor' in patch) f.proveedor = { nombre: str(patch.proveedor.nombre), rfc: str(patch.proveedor.rfc), razonSocial: str(patch.proveedor.razonSocial) };
      const filas = ok(await sb().from('compras').update(f).eq('id', id).select('id'));
      if (!filas.length) throw new Error('Tu rol no puede modificar esta compra.');
    },
    async borrarCompra(id) {
      const c = find('compras', id);
      const filas = ok(await sb().from('compras').delete().eq('id', id).select('id'));
      if (!filas.length) throw new Error('Solo Dirección y el admin técnico pueden borrar compras.');
      if (c) await borrarArchivos(c.documentos.flatMap(d => d.archivos.map(a => a.ruta)));
    },

    // Sube los archivos y registra el documento; si el registro falla, borra lo subido
    async agregarDocumento(compraId, tipo, { archivos = [], fecha: f, monto, referencia, nota, datos } = {}) {
      const c = find('compras', compraId);
      if (!c) throw new Error('No se encontró la compra.');
      const subidos = [];
      try {
        for (const a of archivos) subidos.push(await subirArchivo(c.obraId, compraId, a));
        ok(await sb().from('compra_documentos').insert({
          compra_id: compraId, tipo, archivos: subidos.map(({ ruta, nombre }) => ({ ruta, nombre })),
          fecha: f || null, monto: monto == null || monto === '' ? null : num(monto), referencia: str(referencia), nota: str(nota), datos: datos || {}
        }).select('id'));
      } catch (e) {
        await borrarArchivos(subidos.map(s => s.ruta)).catch(() => {});
        throw e;
      }
    },
    async quitarDocumento(docId) {
      const d = db.compras.flatMap(c => c.documentos).find(x => x.docId === docId);
      const filas = ok(await sb().from('compra_documentos').delete().eq('id', docId).select('id'));
      if (!filas.length) throw new Error('Tu rol no puede quitar este documento.');
      if (d) await borrarArchivos(d.archivos.map(a => a.ruta)).catch(() => {});
    },
    // Correo automático al residente (y suplentes vigentes) con el pago: Edge Function "aviso-pago"
    async avisarPago(compraId) {
      const { data, error } = await sb().functions.invoke('aviso-pago', { body: { compra_id: compraId } });
      if (error) {
        let msg = '';
        try { msg = (await error.context.json()).error; } catch (e) { /* sin cuerpo */ }
        throw new Error(msg || 'No se pudo enviar el correo (¿está publicada la función "aviso-pago" en Supabase?).');
      }
      const c = find('compras', compraId);
      if (c && c.pago) c.pago.aviso = data.aviso;
      return data;
    },
    // Liga temporal (1 hora) para ver o descargar un archivo privado
    async urlArchivo(ruta) {
      const d = ok(await sb().storage.from(BUCKET).createSignedUrl(ruta, 3600));
      return d.signedUrl;
    },

    /* Configuración de la empresa */
    async guardarConfig(clave, valor) {
      ok(await sb().from('config').upsert({ clave, valor }).select('clave'));
    },

    /* Respaldo (solo lectura: lo que el usuario puede ver) */
    exportar() { return Object.assign({ formato: FORMATO, version: VERSION, exportadoEn: now() }, clone(db)); },
    async marcarRespaldo() { try { localStorage.setItem(RESPALDO_KEY, now()); } catch { /* no crítico */ } },
    meta() {
      let ultimoRespaldo = ''; try { ultimoRespaldo = localStorage.getItem(RESPALDO_KEY) || ''; } catch { /* sin acceso */ }
      const ultimoCambio = [...db.obras, ...db.requisiciones, ...db.compras].reduce((m, x) => (x.actualizadoEn > m ? x.actualizadoEn : m), '');
      return { ultimoCambio, ultimoRespaldo, pendiente: !!ultimoCambio && ultimoCambio > ultimoRespaldo, bytes: 0 };
    }
  };
})();
