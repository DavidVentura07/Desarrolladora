/* =========================================================
   GALITHA · Directorio de proveedores — Capa de datos
   v0.4: guarda en Supabase (tablas proveedores, contactos y
   listas). Conserva la misma API con promesas que la versión
   local, así que las pantallas no cambian. Los permisos los
   revisa la base de datos (RLS); aquí solo se traducen errores.
   ========================================================= */
(() => {
  const APP = 'galitha-directorio-proveedores';
  const SCHEMA = 2; // formato del respaldo JSON (igual que v0.2–v0.3)
  const RESPALDO_KEY = 'galitha.directorio.respaldo'; // fecha del último JSON exportado en este navegador
  // Listas editables por el usuario (opciones de los desplegables)
  const LISTAS = ['tipos', 'categorias', 'cobertura', 'etiquetas', 'obras', 'areas', 'etiquetasTel'];

  const sb = () => window.Nube.sb;
  const now = () => new Date().toISOString();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const uid = () => {
    try { return crypto.randomUUID(); }
    catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const str = v => (v == null ? '' : String(v)).trim();
  const arr = v => (Array.isArray(v) ? v : []);
  const uniq = a => [...new Set(arr(a).map(str).filter(Boolean))];
  const int = (v, min, max) => {
    if (v === '' || v == null) return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  const date = v => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? str(v).slice(0, 10) : '');
  const oneOf = (v, list, d) => (list.includes(v) ? v : d);
  const clone = o => JSON.parse(JSON.stringify(o));
  // Comparación sin mayúsculas ni acentos ("cdmx" = "CDMX", "Area" = "Área")
  const key = v => str(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const uniqCI = a => { const seen = new Set(); return arr(a).map(str).filter(v => v && !seen.has(key(v)) && seen.add(key(v))); };
  // v1 guardaba la cobertura como texto ("CDMX y Estado de México"); v2 la guarda como lista
  const coberturaLista = v => uniqCI(Array.isArray(v) ? v : str(v).split(/\s*(?:,|;|\/|\s+y\s+)\s*/i));
  // Los ids deben ser UUID en la base de datos (los de ejemplo, "ejemplo-…", se cambian al importar)
  const idValido = v => (UUID_RE.test(str(v)) ? str(v) : uid());

  // Respuesta de Supabase → datos, o un error en lenguaje de la oficina
  function ok({ data, error }) {
    if (error) throw new Error(window.Nube.traducir(error));
    return data;
  }

  /* ---------- Forma de los registros (esquema v2) ---------- */
  function telefono(t = {}) {
    return { id: str(t.id) || uid(), numero: str(t.numero), etiqueta: str(t.etiqueta), whatsapp: !!t.whatsapp };
  }

  function contacto(c = {}) {
    const ts = now();
    return {
      id: idValido(c.id),
      nombre: str(c.nombre),
      puesto: str(c.puesto),
      area: str(c.area),
      telefonos: arr(c.telefonos).map(telefono).filter(t => t.numero),
      correo: str(c.correo),
      medios: uniq(c.medios).filter(m => ['whatsapp', 'correo', 'llamada'].includes(m)),
      horario: str(c.horario),
      fechaIngreso: date(c.fechaIngreso) || today(), // fecha en que se dio de alta el contacto
      activo: c.activo !== false,
      notas: str(c.notas),
      creadoEn: str(c.creadoEn) || ts,
      actualizadoEn: str(c.actualizadoEn) || str(c.creadoEn) || ts
    };
  }

  function proveedor(p = {}) {
    const ts = now();
    const cal = p.calificacion || {};
    const cond = p.condiciones || {};
    const sat = p.sat || {};
    return {
      id: idValido(p.id),
      nombreComercial: str(p.nombreComercial),
      razonSocial: str(p.razonSocial),
      rfc: str(p.rfc).toUpperCase().replace(/\s+/g, ''),
      tipo: str(p.tipo),
      categorias: uniq(p.categorias),
      servicio: str(p.servicio),
      etiquetas: uniq(p.etiquetas),
      cobertura: coberturaLista(p.cobertura),
      telefonos: arr(p.telefonos).map(telefono).filter(t => t.numero),
      correo: str(p.correo),
      sitioWeb: str(p.sitioWeb),
      direccion: str(p.direccion),
      mapsUrl: str(p.mapsUrl),
      estatus: oneOf(p.estatus, ['activo', 'evaluacion', 'no_recomendado'], 'activo'),
      favorito: !!p.favorito,
      // Retirados de la interfaz el 2026-10-02: se conservan tal como vienen
      calificacion: { calidad: int(cal.calidad, 0, 5) || 0, puntualidad: int(cal.puntualidad, 0, 5) || 0, precio: int(cal.precio, 0, 5) || 0 },
      condiciones: {
        creditoDias: int(cond.creditoDias, 0, 365), anticipoPct: int(cond.anticipoPct, 0, 100),
        formasPago: uniq(cond.formasPago), factura: oneOf(cond.factura, ['si', 'no'], ''), tiempoEntrega: str(cond.tiempoEntrega)
      },
      sat: {
        constanciaFecha: date(sat.constanciaFecha), constanciaUrl: str(sat.constanciaUrl),
        opinionFecha: date(sat.opinionFecha), opinionResultado: oneOf(sat.opinionResultado, ['positiva', 'negativa'], ''), opinionUrl: str(sat.opinionUrl)
      },
      obras: uniq(p.obras),
      archivos: arr(p.archivos)
        .map(a => ({ id: str(a && a.id) || uid(), nombre: str(a && a.nombre), tipo: str(a && a.tipo), url: str(a && a.url) }))
        .filter(a => a.url),
      notas: str(p.notas),
      contactos: arr(p.contactos).filter(c => c && typeof c === 'object').map(contacto),
      creadoEn: str(p.creadoEn) || ts,
      creadoPor: str(p.creadoPor),
      actualizadoEn: str(p.actualizadoEn) || str(p.creadoEn) || ts,
      actualizadoPor: str(p.actualizadoPor),
      // Marca de la base de datos para detectar si otra persona editó al mismo tiempo (no va al respaldo)
      _version: str(p._version)
    };
  }

  /* ---------- Traducción entre la app (camelCase) y la base de datos (snake_case) ---------- */
  const nombreUsuario = id => (id ? window.Nube.nombreDe(id) || 'Usuario' : 'Migración');

  function deFila(r) {
    const x = r.extra || {};
    return proveedor({
      id: r.id, nombreComercial: r.nombre_comercial, razonSocial: r.razon_social, rfc: r.rfc, tipo: r.tipo,
      categorias: r.categorias, servicio: r.servicio, etiquetas: r.etiquetas, cobertura: r.cobertura, telefonos: r.telefonos,
      correo: r.correo, sitioWeb: r.sitio_web, direccion: r.direccion, mapsUrl: r.maps_url, estatus: r.estatus,
      favorito: r.favorito, obras: r.obras, notas: r.notas,
      calificacion: x.calificacion, condiciones: x.condiciones, sat: x.sat, archivos: x.archivos,
      contactos: arr(r.contactos).map(c => ({
        id: c.id, nombre: c.nombre, puesto: c.puesto, area: c.area, telefonos: c.telefonos, correo: c.correo, medios: c.medios,
        horario: c.horario, fechaIngreso: c.fecha_ingreso, activo: c.activo, notas: c.notas, creadoEn: c.creado_en, actualizadoEn: c.actualizado_en
      })).sort((a, b) => str(a.creadoEn).localeCompare(str(b.creadoEn))),
      creadoEn: r.creado_en, creadoPor: nombreUsuario(r.creado_por),
      actualizadoEn: r.actualizado_en, actualizadoPor: nombreUsuario(r.actualizado_por || r.creado_por),
      _version: r.actualizado_en
    });
  }

  // conFechas: al importar se conservan las fechas originales de alta
  function aFila(p, conFechas) {
    const f = {
      id: p.id, nombre_comercial: p.nombreComercial, razon_social: p.razonSocial, rfc: p.rfc, tipo: p.tipo,
      categorias: p.categorias, servicio: p.servicio, etiquetas: p.etiquetas, cobertura: p.cobertura, telefonos: p.telefonos,
      correo: p.correo, sitio_web: p.sitioWeb, direccion: p.direccion, maps_url: p.mapsUrl, estatus: p.estatus,
      favorito: p.favorito, obras: p.obras, notas: p.notas,
      extra: { calificacion: p.calificacion, condiciones: p.condiciones, sat: p.sat, archivos: p.archivos }
    };
    if (conFechas) { f.creado_en = p.creadoEn; f.actualizado_en = p.actualizadoEn; }
    return f;
  }

  function aFilaContacto(provId, c, conFechas) {
    const f = {
      id: c.id, proveedor_id: provId, nombre: c.nombre, puesto: c.puesto, area: c.area, telefonos: c.telefonos, correo: c.correo,
      medios: c.medios, horario: c.horario, fecha_ingreso: c.fechaIngreso, activo: c.activo, notas: c.notas
    };
    if (conFechas) { f.creado_en = c.creadoEn; f.actualizado_en = c.actualizadoEn; }
    return f;
  }

  /* ---------- Estado en memoria (se recarga del servidor en cada list()) ---------- */
  let db = { proveedores: [] };
  let listasSrv = null; // listas tal como están guardadas en el servidor

  async function cargar() {
    const filas = ok(await sb().from('proveedores').select('*, contactos(*)').order('nombre_comercial'));
    db = { proveedores: filas.map(deFila) };
    return db.proveedores;
  }
  async function cargarListas() {
    const filas = ok(await sb().from('listas').select('clave, valores'));
    const o = Object.fromEntries(LISTAS.map(k => [k, []]));
    filas.forEach(f => { if (LISTAS.includes(f.clave)) o[f.clave] = uniqCI(f.valores); });
    listasSrv = o;
    return o;
  }

  function find(id) {
    const p = db.proveedores.find(x => x.id === id);
    if (!p) throw new Error('No se encontró el proveedor. Puede que otra persona lo haya eliminado.');
    return p;
  }

  /* ---------- Listas editables ---------- */
  // Valores que un proveedor usa de cada lista
  function valoresDe(p, k) {
    if (k === 'tipos') return [p.tipo];
    if (k === 'areas') return p.contactos.map(c => c.area);
    if (k === 'etiquetasTel') return [...p.telefonos, ...p.contactos.flatMap(c => c.telefonos)].map(t => t.etiqueta);
    return p[k] || [];
  }
  // Cambia (o quita, si "a" está vacío) un valor en un proveedor; devuelve qué cambió
  function reemplazar(p, k, de, a) {
    const m = key(de); let prov = false; const contactos = new Set();
    const uno = (v, cid) => { if (v && key(v) === m) { if (cid) contactos.add(cid); else prov = true; return a; } return v; };
    if (k === 'tipos') p.tipo = uno(p.tipo);
    else if (k === 'areas') p.contactos.forEach(c => { c.area = uno(c.area, c.id); });
    else if (k === 'etiquetasTel') {
      p.telefonos.forEach(t => { t.etiqueta = uno(t.etiqueta); });
      p.contactos.forEach(c => c.telefonos.forEach(t => { t.etiqueta = uno(t.etiqueta, c.id); }));
    } else p[k] = uniqCI(p[k].map(v => uno(v)));
    return { prov, contactos };
  }
  // Las listas siempre incluyen los valores en uso (si un proveedor trae uno nuevo, se muestra al final)
  function sincronizar() {
    const base = listasSrv || Object.fromEntries(LISTAS.map(k => [k, []]));
    const out = {};
    for (const k of LISTAS) {
      const cur = [...base[k]];
      const vistos = new Set(cur.map(key));
      for (const p of db.proveedores) for (const v of valoresDe(p, k)) {
        if (v && !vistos.has(key(v))) { cur.push(str(v)); vistos.add(key(v)); }
      }
      out[k] = cur;
    }
    return out;
  }
  async function escribirLista(k, valores) {
    ok(await sb().from('listas').update({ valores: uniqCI(valores) }).eq('clave', k).select('clave'));
    if (listasSrv) listasSrv[k] = uniqCI(valores);
  }
  // Agrega a las listas del servidor los valores nuevos que trae un proveedor
  async function agregarFaltantes(ps) {
    if (!window.Nube.puede('directorio')) return;
    if (!listasSrv) await cargarListas();
    for (const k of LISTAS) {
      const vistos = new Set(listasSrv[k].map(key));
      const nuevos = uniqCI(ps.flatMap(p => valoresDe(p, k))).filter(v => !vistos.has(key(v)));
      if (nuevos.length) await escribirLista(k, [...listasSrv[k], ...nuevos]);
    }
  }
  function validarLista(k) { if (!LISTAS.includes(k)) throw new Error('Lista desconocida: ' + k); permiso(); }
  function permiso() { if (!window.Nube.puede('directorio')) throw new Error('Tu rol puede consultar el directorio, pero no modificarlo.'); }

  // Aplica un cambio de opción a todos los proveedores (renombrar o quitar) y lo guarda de una vez
  async function propagar(k, de, a) {
    await cargar();
    const provs = [], contactos = [];
    db.proveedores.forEach(orig => {
      const p = clone(orig);
      const r = reemplazar(p, k, de, a);
      if (r.prov) provs.push(aFila(proveedor(p)));
      p.contactos.filter(c => r.contactos.has(c.id)).forEach(c => contactos.push(aFilaContacto(p.id, contacto(c))));
    });
    if (provs.length) ok(await sb().from('proveedores').upsert(provs).select('id'));
    if (contactos.length) ok(await sb().from('contactos').upsert(contactos).select('id'));
    await cargar();
    return new Set([...provs.map(f => f.id), ...contactos.map(f => f.proveedor_id)]).size;
  }

  /* ---------- Respaldo (fecha del último JSON exportado, por navegador) ---------- */
  const leerRespaldo = () => { try { return localStorage.getItem(RESPALDO_KEY) || ''; } catch { return ''; } };
  const ultimoCambio = () => db.proveedores.reduce((m, p) => (p.actualizadoEn > m ? p.actualizadoEn : m), '');
  const sinVersion = p => { const c = clone(p); delete c._version; return c; };

  /* ---------- API pública ---------- */
  window.Store = {
    APP, SCHEMA,
    nuevoProveedor: () => proveedor({}),
    nuevoContacto: () => contacto({}),

    async list() { await cargar(); return clone(db.proveedores); },
    async get(id) {
      const p = db.proveedores.find(x => x.id === id);
      return p ? clone(p) : null;
    },

    async save(raw) {
      permiso();
      const prev = db.proveedores.find(x => x.id === raw.id);
      const p = proveedor(Object.assign({}, raw, { contactos: raw.contactos || (prev ? prev.contactos : []) }));
      if (prev) {
        // Solo guarda si nadie lo cambió desde que se abrió el formulario (evita pisar el trabajo de otra persona)
        const filas = ok(await sb().from('proveedores').update(aFila(p)).eq('id', p.id).eq('actualizado_en', raw._version || prev._version).select('id'));
        if (!filas.length) throw new Error('Otra persona modificó este proveedor mientras lo editabas. Cierra el formulario y vuelve a abrirlo para ver la versión actual.');
      } else {
        ok(await sb().from('proveedores').insert(aFila(p)).select('id'));
        if (p.contactos.length) ok(await sb().from('contactos').insert(p.contactos.map(c => aFilaContacto(p.id, c))).select('id'));
      }
      await agregarFaltantes([p]);
      await cargar();
      return clone(find(p.id));
    },

    async remove(id) {
      find(id);
      const filas = ok(await sb().from('proveedores').delete().eq('id', id).select('id'));
      if (!filas.length) throw new Error('Tu rol no tiene permiso para eliminar proveedores.');
      await cargar();
    },

    async saveContacto(provId, raw) {
      permiso();
      const p = find(provId);
      const prev = p.contactos.find(c => c.id === raw.id);
      const c = contacto(raw);
      if (prev) ok(await sb().from('contactos').update(aFilaContacto(provId, c)).eq('id', c.id).select('id'));
      else ok(await sb().from('contactos').insert(aFilaContacto(provId, c)).select('id'));
      await agregarFaltantes([Object.assign({}, p, { contactos: [c] })]);
      await cargar();
      return clone(c);
    },

    async removeContacto(provId, contactoId) {
      permiso();
      find(provId);
      const filas = ok(await sb().from('contactos').delete().eq('id', contactoId).select('id'));
      if (!filas.length) throw new Error('Tu rol no tiene permiso para eliminar contactos.');
      await cargar();
    },

    /* ---------- Listas editables ---------- */
    LISTAS: [...LISTAS],
    valoresDe,
    async listas() { await cargarListas(); return clone(sincronizar()); },

    // Guarda una lista completa (agregar, ordenar)
    async guardarLista(k, valores) {
      validarLista(k);
      await escribirLista(k, valores);
    },

    // Renombra una opción en la lista y en todos los proveedores que la usan. Si el nuevo nombre ya existe, las une.
    async renombrarOpcion(k, de, a) {
      validarLista(k);
      a = str(a);
      if (!a) throw new Error('El nombre no puede quedar vacío.');
      await cargarListas();
      const cur = sincronizar()[k];
      const existe = cur.some(v => key(v) === key(a) && key(v) !== key(de));
      const lista = existe ? cur.filter(v => key(v) !== key(de)) : cur.map(v => (key(v) === key(de) ? a : v));
      const n = await propagar(k, de, a);
      await escribirLista(k, lista);
      return { proveedores: n, unido: existe };
    },

    // Quita una opción de la lista y de los proveedores que la usan
    async quitarOpcion(k, v) {
      validarLista(k);
      await cargarListas();
      const n = await propagar(k, v, '');
      await escribirLista(k, sincronizar()[k].filter(x => key(x) !== key(v)));
      return { proveedores: n };
    },

    /* ---------- Respaldo ---------- */
    async exportar() {
      await cargar(); await cargarListas();
      return { app: APP, schemaVersion: SCHEMA, exportadoEn: now(), listas: clone(sincronizar()), proveedores: db.proveedores.map(sinVersion) };
    },
    async marcarRespaldo() { try { localStorage.setItem(RESPALDO_KEY, now()); } catch { /* no crítico */ } },

    // Revisa un archivo antes de importarlo y dice qué pasaría
    analizar(data) {
      let list;
      if (Array.isArray(data)) list = data;
      else if (data && Array.isArray(data.proveedores)) list = data.proveedores;
      else return { ok: false, error: 'El archivo no contiene una lista de proveedores.' };
      if (data && data.schemaVersion > SCHEMA) {
        return { ok: false, error: `El archivo usa una versión más nueva del formato (v${data.schemaVersion}). Actualiza la página antes de importarlo.` };
      }
      const seen = new Set();
      const incoming = list.filter(x => x && typeof x === 'object').map(proveedor).filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id); return true;
      });
      const comparable = p => JSON.stringify(Object.assign(sinVersion(p), { creadoPor: '', actualizadoPor: '' }));
      let nuevos = 0, actualizados = 0, iguales = 0, anteriores = 0;
      for (const p of incoming) {
        const cur = db.proveedores.find(x => x.id === p.id);
        if (!cur) nuevos++;
        else if (comparable(cur) === comparable(p)) iguales++;
        else if (p.actualizadoEn >= cur.actualizadoEn) actualizados++;
        else anteriores++;
      }
      return {
        ok: true, incoming, total: incoming.length, nuevos, actualizados, iguales, anteriores,
        actuales: db.proveedores.length,
        exportadoEn: (data && data.exportadoEn) || '',
        listas: data && data.listas && typeof data.listas === 'object' ? Object.fromEntries(LISTAS.map(k => [k, uniqCI(data.listas[k])])) : null,
        otraApp: !!(data && data.app && data.app !== APP)
      };
    },

    // modo 'combinar': agrega nuevos y conserva la versión más reciente de cada proveedor; las listas se suman
    // modo 'reemplazar': borra todo y deja solo el contenido del archivo (también las listas, si el archivo las trae)
    async importar(incoming, modo, listasArchivo) {
      permiso();
      await cargar(); await cargarListas();
      let subir = incoming.map(proveedor);
      if (modo === 'reemplazar') {
        if (!window.Nube.puede('restaurar')) throw new Error('Solo Dirección y el admin técnico pueden reemplazar todo el directorio.');
        if (db.proveedores.length) ok(await sb().from('proveedores').delete().in('id', db.proveedores.map(p => p.id)).select('id'));
      } else {
        const actual = new Map(db.proveedores.map(p => [p.id, p]));
        subir = subir.filter(p => !actual.has(p.id) || p.actualizadoEn >= actual.get(p.id).actualizadoEn);
      }
      if (subir.length) {
        ok(await sb().from('proveedores').upsert(subir.map(p => aFila(p, true))).select('id'));
        const cs = subir.flatMap(p => p.contactos.map(c => aFilaContacto(p.id, c, true)));
        if (cs.length) ok(await sb().from('contactos').upsert(cs).select('id'));
      }
      if (listasArchivo) {
        for (const k of LISTAS) {
          const vals = modo === 'reemplazar' ? listasArchivo[k] : [...listasSrv[k], ...listasArchivo[k]];
          await escribirLista(k, vals);
        }
      }
      await cargar();
      await agregarFaltantes(db.proveedores);
    },

    meta() {
      const ultimoRespaldo = leerRespaldo(), cambio = ultimoCambio();
      return { ultimoCambio: cambio, ultimoRespaldo, pendiente: !!cambio && cambio > ultimoRespaldo, bytes: 0 };
    }
  };
})();
