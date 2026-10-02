/* =========================================================
   GALITHA · Requisiciones de obra, obras y compras — Datos
   Igual que store.js: hoy guarda en el navegador (localStorage)
   y es la única pieza que lo conoce. Cuando haya servidor, se
   reemplaza este adaptador sin tocar la interfaz.
   Formato del respaldo: { formato: "galitha.requisiciones", version, obras, requisiciones, compras, config }
   ========================================================= */
(() => {
  const KEY = 'galitha.requisiciones.datos';
  const META_KEY = 'galitha.requisiciones.meta';
  const FORMATO = 'galitha.requisiciones';
  const VERSION = 1;

  const now = () => new Date().toISOString();
  const str = v => (v == null ? '' : String(v)).trim();
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
  const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

  /* ---------- Forma de los registros ---------- */
  const persona = p => ({ nombre: str(p && p.nombre), correo: str(p && p.correo), telefono: str(p && p.telefono) });
  const obra = o => ({
    id: str(o.id) || uid(), nombre: str(o.nombre), clave: str(o.clave).toUpperCase(), direccion: str(o.direccion),
    estatus: o.estatus === 'cerrada' ? 'cerrada' : 'activa', residente: persona(o.residente), actualizadoEn: str(o.actualizadoEn)
  });
  const partida = p => ({
    id: str(p.id) || uid(), insumo: str(p.insumo), unidad: str(p.unidad), cantidad: num(p.cantidad),
    observaciones: str(p.observaciones), destino: str(p.destino), fechaSuministro: str(p.fechaSuministro), compraId: str(p.compraId)
  });
  const requisicion = r => ({
    id: str(r.id) || uid(), obraId: str(r.obraId), anio: num(r.anio), semana: num(r.semana),
    tipo: r.tipo === 'extraordinaria' ? 'extraordinaria' : 'ordinaria', folio: str(r.folio), fechaSuministro: str(r.fechaSuministro),
    creadaPor: str(r.creadaPor), enviadaEn: str(r.enviadaEn), autorizadaEn: str(r.autorizadaEn), autorizadaPor: str(r.autorizadaPor),
    nota: str(r.nota), partidas: arr(r.partidas).filter(obj).map(partida), actualizadoEn: str(r.actualizadoEn)
  });
  const concepto = k => ({ cantidad: num(k.cantidad), unidad: str(k.unidad), descripcion: str(k.descripcion), valorUnitario: num(k.valorUnitario), importe: num(k.importe) });
  const factura = f => !obj(f) ? null : Object.assign({}, f, {
    serie: str(f.serie), folio: str(f.folio), fecha: str(f.fecha), subtotal: num(f.subtotal), total: num(f.total), uuid: str(f.uuid).toUpperCase(),
    emisorRfc: str(f.emisorRfc), emisorNombre: str(f.emisorNombre), receptorRfc: str(f.receptorRfc), receptorNombre: str(f.receptorNombre),
    metodoPago: str(f.metodoPago), formaPago: str(f.formaPago), xml: str(f.xml), pdf: str(f.pdf), pdfNombre: str(f.pdfNombre),
    conceptos: arr(f.conceptos).filter(obj).map(concepto), ficticia: !!f.ficticia
  });
  const doc = (d, extra) => !obj(d) ? null : Object.assign({ archivo: str(d.archivo), fecha: str(d.fecha), nota: str(d.nota) }, extra(d));
  const compra = c => {
    const ent = obj(c.entregas) || {};
    return {
      id: str(c.id) || uid(), obraId: str(c.obraId), requisicionId: str(c.requisicionId), anio: num(c.anio), semana: num(c.semana),
      proveedor: { nombre: str(c.proveedor && c.proveedor.nombre), rfc: str(c.proveedor && c.proveedor.rfc).toUpperCase(), razonSocial: str(c.proveedor && c.proveedor.razonSocial), id: str(c.proveedor && c.proveedor.id) },
      partidas: arr(c.partidas).map(str).filter(Boolean),
      fechaEntrega: str(c.fechaEntrega),
      entregas: Object.fromEntries(Object.entries(ent).map(([k, v]) => [str(k), str(v)]).filter(([k, v]) => k && v)),
      cotizacion: doc(c.cotizacion, d => ({ monto: num(d.monto) })),
      factura: factura(c.factura),
      pago: doc(c.pago, d => ({ monto: num(d.monto), referencia: str(d.referencia) })),
      remision: doc(c.remision, d => ({ recibio: str(d.recibio) })),
      ficticia: !!c.ficticia, actualizadoEn: str(c.actualizadoEn)
    };
  };
  const config = c => {
    c = obj(c) || {};
    const e = obj(c.empresa) || {};
    return { empresa: { nombre: str(e.nombre), rfc: str(e.rfc).toUpperCase(), correoRequisiciones: str(e.correoRequisiciones) }, proceso: arr(c.proceso).map(str).filter(Boolean) };
  };
  // Acepta el formato propio y el del mockup (empresa y proceso sueltos)
  const datos = d => {
    d = obj(d) || {};
    return {
      obras: arr(d.obras).filter(obj).map(obra),
      requisiciones: arr(d.requisiciones).filter(obj).map(requisicion),
      compras: arr(d.compras).filter(obj).map(compra),
      config: config(d.config || { empresa: d.empresa, proceso: d.proceso })
    };
  };

  /* ---------- Estado ---------- */
  let db = datos(read(KEY));
  const meta = () => Object.assign({ ultimoCambio: '', ultimoRespaldo: '', pendiente: false }, read(META_KEY) || {});
  const setMeta = p => { try { localStorage.setItem(META_KEY, JSON.stringify(Object.assign(meta(), p))); } catch { /* no crítico */ } };
  function commit(next) {
    localStorage.setItem(KEY, JSON.stringify(next));   // si no hay espacio, lanza y no se pierde lo anterior
    db = next;
    setMeta({ ultimoCambio: now(), pendiente: true });
  }
  const vacio = () => !db.obras.length && !db.requisiciones.length && !db.compras.length;

  window.StoreReq = {
    FORMATO, VERSION, uid, now,
    // Copia de trabajo: la interfaz la modifica y la devuelve con guardar()
    snapshot() { return clone(db); },
    vacio,
    async guardar(d) { commit(datos(d)); },

    exportar() { return Object.assign({ formato: FORMATO, version: VERSION, exportadoEn: now() }, clone(db)); },
    async marcarRespaldo() { setMeta({ ultimoRespaldo: now(), pendiente: false }); },

    analizar(data) {
      if (!obj(data) || data.formato !== FORMATO) return { ok: false, error: 'El archivo no es un respaldo de requisiciones.' };
      const d = datos(data);
      return { ok: true, datos: d, exportadoEn: str(data.exportadoEn), obras: d.obras.length, requisiciones: d.requisiciones.length, compras: d.compras.length };
    },
    // Combinar: suma por id y gana el actualizadoEn más reciente. Reemplazar: deja solo lo del archivo.
    async importar(d, modo) {
      if (modo === 'reemplazar' || vacio()) { commit(datos(d)); return; }
      const mezcla = (a, b) => {
        const m = new Map(a.map(x => [x.id, x]));
        b.forEach(x => { const cur = m.get(x.id); if (!cur || (x.actualizadoEn || '') >= (cur.actualizadoEn || '')) m.set(x.id, x); });
        return [...m.values()];
      };
      const cfg = d.config.empresa.rfc || d.config.proceso.length ? d.config : db.config;
      commit(datos({ obras: mezcla(db.obras, d.obras), requisiciones: mezcla(db.requisiciones, d.requisiciones), compras: mezcla(db.compras, d.compras), config: cfg }));
    },
    async borrarTodo() { commit(datos({ config: db.config })); setMeta({ pendiente: false }); },
    meta() { return Object.assign(meta(), { bytes: (localStorage.getItem(KEY) || '').length }); }
  };
})();
