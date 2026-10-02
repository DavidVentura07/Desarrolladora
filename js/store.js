/* =========================================================
   GALITHA · Directorio de proveedores — Capa de datos
   Hoy guarda en el navegador (localStorage). Toda la app pasa
   por aquí y todas las funciones devuelven promesas: para
   conectar un servidor con usuarios y permisos basta con
   cambiar el adaptador, no las pantallas.
   ========================================================= */
(() => {
  const APP = 'galitha-directorio-proveedores';
  const SCHEMA = 2; // v2 (2026-10-02): cobertura pasa a lista y el respaldo incluye las listas editables
  const KEY = 'galitha.directorio.datos';
  const META_KEY = 'galitha.directorio.meta';
  const LISTAS_KEY = 'galitha.directorio.listas';
  // Listas editables por el usuario (opciones de los desplegables)
  const LISTAS = ['tipos', 'categorias', 'cobertura', 'etiquetas', 'obras', 'areas', 'etiquetasTel'];
  const USUARIO = 'local'; // cuando existan cuentas, aquí irá el usuario en sesión

  const now = () => new Date().toISOString();
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const uid = () => {
    try { return crypto.randomUUID(); }
    catch { return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  };
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

  /* ---------- Adaptador: almacenamiento del navegador ---------- */
  const local = {
    read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    write(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
    size(k) { try { return (localStorage.getItem(k) || '').length; } catch { return 0; } }
  };
  const adapter = local;

  /* ---------- Forma de los registros (esquema v1) ---------- */
  function telefono(t = {}) {
    return { id: str(t.id) || uid(), numero: str(t.numero), etiqueta: str(t.etiqueta), whatsapp: !!t.whatsapp };
  }

  function contacto(c = {}) {
    const ts = now();
    return {
      id: str(c.id) || uid(),
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
      id: str(p.id) || uid(),
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
      calificacion: {
        calidad: int(cal.calidad, 0, 5) || 0,
        puntualidad: int(cal.puntualidad, 0, 5) || 0,
        precio: int(cal.precio, 0, 5) || 0
      },
      condiciones: {
        creditoDias: int(cond.creditoDias, 0, 365),
        anticipoPct: int(cond.anticipoPct, 0, 100),
        formasPago: uniq(cond.formasPago),
        factura: oneOf(cond.factura, ['si', 'no'], ''),
        tiempoEntrega: str(cond.tiempoEntrega)
      },
      sat: {
        constanciaFecha: date(sat.constanciaFecha),
        constanciaUrl: str(sat.constanciaUrl),
        opinionFecha: date(sat.opinionFecha),
        opinionResultado: oneOf(sat.opinionResultado, ['positiva', 'negativa'], ''),
        opinionUrl: str(sat.opinionUrl)
      },
      obras: uniq(p.obras),
      archivos: arr(p.archivos)
        .map(a => ({ id: str(a && a.id) || uid(), nombre: str(a && a.nombre), tipo: str(a && a.tipo), url: str(a && a.url) }))
        .filter(a => a.url),
      notas: str(p.notas),
      contactos: arr(p.contactos).filter(c => c && typeof c === 'object').map(contacto),
      creadoEn: str(p.creadoEn) || ts,
      creadoPor: str(p.creadoPor) || USUARIO,
      actualizadoEn: str(p.actualizadoEn) || str(p.creadoEn) || ts,
      actualizadoPor: str(p.actualizadoPor) || USUARIO
    };
  }

  /* ---------- Estado ---------- */
  let db = load();

  function load() {
    const d = adapter.read(KEY);
    const list = d && Array.isArray(d.proveedores) ? d.proveedores : [];
    return { schemaVersion: SCHEMA, proveedores: list.filter(x => x && typeof x === 'object').map(proveedor) };
  }
  function meta() { return Object.assign({ ultimoCambio: '', ultimoRespaldo: '', pendiente: false }, adapter.read(META_KEY) || {}); }
  function setMeta(patch) { try { adapter.write(META_KEY, Object.assign(meta(), patch)); } catch { /* sin espacio para metadatos: no es crítico */ } }

  // Escribe primero y solo si funciona actualiza la memoria (si el navegador se queda sin espacio, no se pierde nada)
  function commit(list) {
    const next = { schemaVersion: SCHEMA, proveedores: list };
    adapter.write(KEY, next);
    db = next;
    setMeta({ ultimoCambio: now(), pendiente: true });
  }

  function find(id) {
    const p = db.proveedores.find(x => x.id === id);
    if (!p) throw new Error('No se encontró el proveedor.');
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
  // Cambia (o quita, si "a" está vacío) un valor en un proveedor; devuelve si hubo cambios
  function reemplazar(p, k, de, a) {
    const m = key(de); let hubo = false;
    const uno = v => { if (v && key(v) === m) { hubo = true; return a; } return v; };
    if (k === 'tipos') p.tipo = uno(p.tipo);
    else if (k === 'areas') p.contactos.forEach(c => { c.area = uno(c.area); });
    else if (k === 'etiquetasTel') [p.telefonos, ...p.contactos.map(c => c.telefonos)].forEach(ts => ts.forEach(t => { t.etiqueta = uno(t.etiqueta); }));
    else p[k] = uniqCI(p[k].map(uno));
    return hubo;
  }
  const limpiarListas = o => Object.fromEntries(LISTAS.map(k => [k, uniqCI(o && o[k])]));
  let listas = (() => { const d = adapter.read(LISTAS_KEY); return d && typeof d === 'object' ? limpiarListas(d) : null; })();

  function escribirListas(next, marcar) {
    adapter.write(LISTAS_KEY, next);
    listas = next;
    if (marcar) setMeta({ ultimoCambio: now(), pendiente: true });
  }
  // Las listas siempre incluyen los valores en uso: si un proveedor (importado o de ejemplo) trae uno nuevo, se agrega al final
  function sincronizar() {
    const C = window.CAT || {};
    let cambio = !listas;
    const base = listas || limpiarListas({ tipos: C.tipos, categorias: C.categorias, cobertura: C.cobertura, areas: C.areas, etiquetasTel: C.etiquetasTel });
    const out = {};
    for (const k of LISTAS) {
      const cur = [...base[k]];
      const vistos = new Set(cur.map(key));
      for (const p of db.proveedores) for (const v of valoresDe(p, k)) {
        if (v && !vistos.has(key(v))) { cur.push(str(v)); vistos.add(key(v)); cambio = true; }
      }
      out[k] = cur;
    }
    if (cambio) { try { escribirListas(out, false); } catch { listas = out; } }
    return listas;
  }
  function validarLista(k) { if (!LISTAS.includes(k)) throw new Error('Lista desconocida: ' + k); }

  /* ---------- API pública ---------- */
  window.Store = {
    APP, SCHEMA,
    nuevoProveedor: () => proveedor({}),
    nuevoContacto: () => contacto({}),

    async list() { return clone(db.proveedores); },
    async get(id) { const p = db.proveedores.find(x => x.id === id); return p ? clone(p) : null; },

    async save(raw) {
      const ts = now();
      const prev = db.proveedores.find(x => x.id === raw.id);
      const p = proveedor(Object.assign({}, raw, {
        contactos: raw.contactos || (prev ? prev.contactos : []),
        creadoEn: prev ? prev.creadoEn : ts,
        creadoPor: prev ? prev.creadoPor : USUARIO,
        actualizadoEn: ts,
        actualizadoPor: USUARIO
      }));
      commit(prev ? db.proveedores.map(x => (x.id === p.id ? p : x)) : [...db.proveedores, p]);
      return clone(p);
    },

    async remove(id) {
      find(id);
      commit(db.proveedores.filter(x => x.id !== id));
    },

    async saveContacto(provId, raw) {
      const p = clone(find(provId));
      const ts = now();
      const prev = p.contactos.find(c => c.id === raw.id);
      const c = contacto(Object.assign({}, raw, { creadoEn: prev ? prev.creadoEn : ts, actualizadoEn: ts }));
      p.contactos = prev ? p.contactos.map(x => (x.id === c.id ? c : x)) : [...p.contactos, c];
      p.actualizadoEn = ts; p.actualizadoPor = USUARIO;
      commit(db.proveedores.map(x => (x.id === p.id ? proveedor(p) : x)));
      return clone(c);
    },

    async removeContacto(provId, contactoId) {
      const p = clone(find(provId));
      p.contactos = p.contactos.filter(c => c.id !== contactoId);
      p.actualizadoEn = now(); p.actualizadoPor = USUARIO;
      commit(db.proveedores.map(x => (x.id === p.id ? proveedor(p) : x)));
    },

    /* ---------- Listas editables ---------- */
    LISTAS: [...LISTAS],
    valoresDe,
    async listas() { return clone(sincronizar()); },

    // Guarda una lista completa (agregar, ordenar)
    async guardarLista(k, valores) {
      validarLista(k);
      escribirListas(Object.assign({}, sincronizar(), { [k]: uniqCI(valores) }), true);
    },

    // Renombra una opción en la lista y en todos los proveedores que la usan. Si el nuevo nombre ya existe, las une.
    async renombrarOpcion(k, de, a) {
      validarLista(k);
      a = str(a);
      if (!a) throw new Error('El nombre no puede quedar vacío.');
      const cur = sincronizar()[k];
      const existe = cur.some(v => key(v) === key(a) && key(v) !== key(de));
      const lista = existe ? cur.filter(v => key(v) !== key(de)) : cur.map(v => (key(v) === key(de) ? a : v));
      const ts = now();
      let n = 0;
      const next = db.proveedores.map(p => {
        const c = clone(p);
        if (!reemplazar(c, k, de, a)) return p;
        n++; c.actualizadoEn = ts; c.actualizadoPor = USUARIO;
        return proveedor(c);
      });
      if (n) commit(next);
      escribirListas(Object.assign({}, listas, { [k]: uniqCI(lista) }), true);
      return { proveedores: n, unido: existe };
    },

    // Quita una opción de la lista y de los proveedores que la usan
    async quitarOpcion(k, v) {
      validarLista(k);
      const ts = now();
      let n = 0;
      const next = db.proveedores.map(p => {
        const c = clone(p);
        if (!reemplazar(c, k, v, '')) return p;
        n++; c.actualizadoEn = ts; c.actualizadoPor = USUARIO;
        return proveedor(c);
      });
      if (n) commit(next);
      escribirListas(Object.assign({}, sincronizar(), { [k]: sincronizar()[k].filter(x => key(x) !== key(v)) }), true);
      return { proveedores: n };
    },

    /* ---------- Respaldo ---------- */
    async exportar() {
      return { app: APP, schemaVersion: SCHEMA, exportadoEn: now(), listas: clone(sincronizar()), proveedores: clone(db.proveedores) };
    },
    async marcarRespaldo() { setMeta({ ultimoRespaldo: now(), pendiente: false }); },

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
      let nuevos = 0, actualizados = 0, iguales = 0, anteriores = 0;
      for (const p of incoming) {
        const cur = db.proveedores.find(x => x.id === p.id);
        if (!cur) nuevos++;
        else if (JSON.stringify(cur) === JSON.stringify(p)) iguales++;
        else if (p.actualizadoEn >= cur.actualizadoEn) actualizados++;
        else anteriores++;
      }
      return {
        ok: true, incoming, total: incoming.length, nuevos, actualizados, iguales, anteriores,
        actuales: db.proveedores.length,
        exportadoEn: (data && data.exportadoEn) || '',
        listas: data && data.listas && typeof data.listas === 'object' ? limpiarListas(data.listas) : null,
        otraApp: !!(data && data.app && data.app !== APP)
      };
    },

    // modo 'combinar': agrega nuevos y conserva la versión más reciente de cada proveedor; las listas se suman
    // modo 'reemplazar': sustituye todo por el contenido del archivo (también las listas, si el archivo las trae)
    async importar(incoming, modo, listasArchivo) {
      listasArchivo = listasArchivo && typeof listasArchivo === 'object' ? limpiarListas(listasArchivo) : null;
      if (modo === 'reemplazar') {
        commit(incoming.map(proveedor));
        if (listasArchivo) escribirListas(listasArchivo, true);
      } else {
        const map = new Map(db.proveedores.map(p => [p.id, p]));
        for (const p of incoming) {
          const cur = map.get(p.id);
          if (!cur || p.actualizadoEn >= cur.actualizadoEn) map.set(p.id, proveedor(p));
        }
        commit([...map.values()]);
        if (listasArchivo) {
          const cur = sincronizar();
          escribirListas(Object.fromEntries(LISTAS.map(k => [k, uniqCI([...cur[k], ...listasArchivo[k]])])), true);
        }
      }
      sincronizar();
    },

    async borrarTodo() {
      commit([]);
      setMeta({ pendiente: false });
    },

    meta() { return Object.assign(meta(), { bytes: adapter.size(KEY) }); }
  };
})();
