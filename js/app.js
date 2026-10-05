/* =========================================================
   GALITHA · Directorio de proveedores
   SPA por hash con cortina de transición (misma identidad que
   la propuesta del sitio), listado con filtros, ficha de
   proveedor, formularios en panel lateral y respaldo JSON.
   ========================================================= */
(() => {
  const C = window.CAT;
  const S = window.Store;
  const N = window.Nube;
  // Qué botones se muestran según el rol (la base de datos vuelve a revisar cada cambio)
  const puedeDir = () => N.puede('directorio');
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileMQ = matchMedia('(max-width: 900px)');

  const store = (area) => ({
    get(k, d) { try { const v = area.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { area.setItem(k, JSON.stringify(v)); } catch { /* preferencia no crítica */ } }
  });
  const prefs = store(localStorage);
  const session = store(sessionStorage);

  /* ---------- Utilidades de texto ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const digits = s => String(s == null ? '' : s).replace(/\D/g, '');
  const intl = n => { const d = digits(n); return d.length === 10 ? '52' + d : d; };
  const telHref = n => (digits(n) ? 'tel:+' + intl(n) : '');
  const waHref = n => (digits(n) ? 'https://wa.me/' + intl(n) : '');
  const mailHref = m => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m || '') ? 'mailto:' + m : '');
  // Solo ligas http(s); "empresa.com" se completa con https://
  const safeUrl = u => {
    const s = String(u || '').trim();
    if (/^https?:\/\/[^\s]+$/i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return 'https://' + s;
    return '';
  };
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const fmtTel = n => {
    const d = digits(n);
    if (d.length !== 10) return n;
    return /^(55|56|33|81)/.test(d) ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  };
  const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

  /* ---------- Fechas ---------- */
  const toDate = s => {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
    return isNaN(d) ? null : d;
  };
  const fmtDate = s => { const d = toDate(s); return d ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  const daysSince = s => {
    const d = toDate(s); if (!d) return null;
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(d); b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 864e5);
  };
  const ago = s => {
    const n = daysSince(s);
    if (n == null) return '—';
    if (n <= 0) return 'hoy';
    if (n === 1) return 'ayer';
    if (n < 31) return `hace ${n} días`;
    const m = Math.round(n / 30.4);
    return m < 12 ? `hace ${m} ${m === 1 ? 'mes' : 'meses'}` : `hace ${Math.round(m / 12)} ${Math.round(m / 12) === 1 ? 'año' : 'años'}`;
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  /* ---------- Logotipo (mismo vector que la propuesta) ---------- */
  const MARK = `
    <rect x="0" y="0" width="95" height="24" style="animation-delay:.05s"/>
    <rect x="0" y="35" width="95" height="24" style="animation-delay:.12s"/>
    <rect x="0" y="71" width="95" height="24" style="animation-delay:.19s"/>
    <path d="M0 113h78v77H47v-47H0z" style="animation-delay:.26s"/>
    <rect x="0" y="159" width="32" height="31" style="animation-delay:.33s"/>
    <path class="m2" fill-rule="evenodd" d="M111 0h79v78h-79zM134 24v31h32V24z" style="animation-delay:.4s"/>
    <rect class="m2" x="95" y="95" width="95" height="24" style="animation-delay:.47s"/>
    <rect class="m2" x="95" y="130" width="95" height="24" style="animation-delay:.54s"/>
    <rect class="m2" x="95" y="167" width="95" height="23" style="animation-delay:.61s"/>`;
  const WORD = `
    <path d="M395.1 105.2A58 58 0 1 0 408.7 156" fill="none" stroke="currentColor" stroke-width="14"/>
    <path d="M341 155h78" stroke="currentColor" stroke-width="14"/>
    <path id="lam" d="M440.5 209h14.1L499 96l45.4 113h14.1L506 84h-13z"/>
    <path d="M594 84h14v112h48v13h-62z"/>
    <rect x="688" y="84" width="14" height="125"/>
    <path d="M734 84h77v13h-31v112h-15V97h-31z"/>
    <path d="M843 84h14v54h61V84h14v125h-14v-58h-61v58h-14z"/>
    <use href="#lam" x="524"/>`;
  const markSVG = () => `<svg viewBox="0 0 190 190" fill="currentColor" aria-hidden="true">${MARK}</svg>`;
  const logoSVG = () => `<svg viewBox="45 40 1040 199" fill="currentColor" role="img" aria-label="Galitha"><g transform="translate(45 44)">${MARK}</g>${WORD}</svg>`;

  /* ---------- Íconos (trazo redondeado de 1.6 px, retícula de 24) ---------- */
  const ico = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const I = {
    search: ico('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>'),
    plus: ico('<path d="M12 4v16M4 12h16"/>'),
    phone: ico('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>'),
    wa: ico('<path d="M3.5 20.5l1.4-4.2A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9.2c.3 2.4 2.4 4.5 4.8 4.8l1.2-1.3 1.8.8v1.3c-3.9.3-8-3.8-7.7-7.7h1.3l.8 1.8z" stroke-width="1.2"/>'),
    mail: ico('<rect x="3" y="5" width="18" height="14"/><path d="M3 6l9 7 9-7"/>'),
    web: ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>'),
    map: ico('<path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.3"/>'),
    edit: ico('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
    trash: ico('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    star: ico('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>'),
    link: ico('<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>'),
    file: ico('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
    close: ico('<path d="M5 5l14 14M19 5L5 19"/>'),
    back: ico('<path d="M20 12H5M10 6l-6 6 6 6"/>'),
    list: ico('<path d="M3 6h18M3 12h18M3 18h18"/>'),
    grid: ico('<rect x="3.5" y="3.5" width="7" height="7"/><rect x="13.5" y="3.5" width="7" height="7"/><rect x="3.5" y="13.5" width="7" height="7"/><rect x="13.5" y="13.5" width="7" height="7"/>'),
    filter: ico('<path d="M3 5h18M6 12h12M10 19h4"/>'),
    down: ico('<path d="M12 3v13M6 11l6 6 6-6M4 21h16"/>'),
    up: ico('<path d="M12 17V4M6 9l6-6 6 6M4 21h16"/>'),
    user: ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'),
    alert: ico('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 17.5v.5"/>'),
    copy: ico('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
    users: ico('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>'),
    db: ico('<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>'),
    folder: ico('<path d="M3.5 6.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/>'),
    shield: ico('<path d="M12 3.5l7.5 3v5.5c0 4.5-3.2 7.6-7.5 8.5-4.3-.9-7.5-4-7.5-8.5V6.5z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>'),
    sort: ico('<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5"/>'),
    listas: ico('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>'),
    chevron: ico('<path d="M6 9l6 6 6-6"/>'),
    arrow: ico('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    cal: ico('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    logout: ico('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>'),
    // Vistas del listado
    vCompactas: ico('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
    vAmplias: ico('<rect x="3.5" y="4" width="7.5" height="16" rx="1.5"/><rect x="13" y="4" width="7.5" height="16" rx="1.5"/>'),
    vAncho: ico('<rect x="3.5" y="4" width="17" height="7" rx="1.5"/><rect x="3.5" y="13" width="17" height="7" rx="1.5"/>'),
    vTabla: ico('<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>')
  };
  const ARR = `<svg class="arr" viewBox="0 0 22 10" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M0 5h21M16.5 1l4.5 4-4.5 4"/></svg>`;

  /* ---------- Lecturas de un proveedor ---------- */
  const nombre = p => p.nombreComercial || p.razonSocial || 'Sin nombre';
  const estLabel = id => (C.estatus.find(e => e.id === id) || {}).label || id;
  const medioLabel = id => (C.medios.find(e => e.id === id) || {}).label || id;
  const principal = p => p.contactos.find(c => c.activo) || p.contactos[0] || null;
  const canales = p => {
    const c = principal(p);
    const tels = [...(c ? c.telefonos : []), ...p.telefonos];
    return { c, wa: tels.find(t => t.whatsapp), tel: tels[0], mail: (c && c.correo) || p.correo };
  };
  const iniciales = s => String(s || '?').replace(/^(ing|arq|lic|dr|dra)\.?\s+/i, '').split(/\s+/).filter(w => w.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  // Color del avatar según el tipo de proveedor (5 tonos)
  const tono = p => {
    const i = (LISTAS.tipos || []).indexOf(p.tipo);
    const n = i >= 0 ? i : [...(p.tipo || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    return 't' + (n % 5);
  };
  // Persona con sus botones de WhatsApp y llamada (tarjetas)
  const personaHTML = c => {
    const t = c.telefonos[0], wa = c.telefonos.find(x => x.whatsapp);
    const b = (href, icon, label, ext) => href ? `<a class="qbtn" href="${esc(href)}" ${ext ? 'target="_blank" rel="noopener"' : ''} title="${label}" aria-label="${label} — ${esc(c.nombre)}">${icon}</a>` : '';
    return `
      <div class="c-bot">
        <span class="p-av">${esc(iniciales(c.nombre))}</span>
        <div class="c-who${c.activo ? '' : ' is-off'}"><b>${esc(c.nombre || 'Sin nombre')}${c.activo ? '' : ' · ya no está'}</b><small>${esc([c.puesto, t && fmtTel(t.numero)].filter(Boolean).join(' · ') || c.correo || '—')}</small></div>
        <span class="quick">${b(wa && waHref(wa.numero), I.wa, 'WhatsApp', true)}${b(t && telHref(t.numero), I.phone, 'Llamar')}${b(mailHref(c.correo), I.mail, 'Correo')}</span>
      </div>`;
  };

  /* ---------- Piezas de interfaz ---------- */
  const tagEst = id => `<span class="tag tag--${esc(id)}"><i></i>${esc(estLabel(id))}</span>`;
  // Acciones rápidas del contacto principal; "max" limita cuántas caben (tarjetas compactas)
  const quick = (p, labels, max = 3) => {
    const { wa, tel, mail } = canales(p);
    const b = (href, icon, label, ext) => href
      ? `<a class="qbtn" href="${esc(href)}" ${ext ? 'target="_blank" rel="noopener"' : ''} title="${label}" aria-label="${label} — ${esc(nombre(p))}">${icon}${labels ? `<span>${label}</span>` : ''}</a>`
      : '';
    return [b(wa && waHref(wa.numero), I.wa, 'WhatsApp', true), b(tel && telHref(tel.numero), I.phone, 'Llamar'), b(mailHref(mail), I.mail, 'Correo')]
      .filter(Boolean).slice(0, max).join('');
  };
  const favBtn = p => !puedeDir() ? (p.favorito ? `<span class="fav on is-ro" title="Favorito" aria-label="Favorito">${I.star}</span>` : '') : `<button class="fav${p.favorito ? ' on' : ''}" data-fav="${esc(p.id)}" aria-pressed="${p.favorito}" aria-label="${p.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}" title="Favorito">${I.star}</button>`;

  /* =========================================================
     DATOS EN MEMORIA + CROMO (barra lateral)
     ========================================================= */
  let DATA = [];
  let LISTAS = {}; // opciones editables de los desplegables (Store.listas)
  async function refresh() { DATA = await S.list(); LISTAS = await S.listas(); chrome(); }
  // Cuántos proveedores usan cada opción de una lista (clave normalizada → número)
  function usos(k) {
    const m = new Map();
    DATA.forEach(p => new Set(S.valoresDe(p, k).filter(Boolean).map(norm)).forEach(v => m.set(v, (m.get(v) || 0) + 1)));
    return m;
  }

  function respaldoEstado() {
    const m = S.meta();
    if (!DATA.length && !m.ultimoRespaldo) return { cls: 'idle', label: 'Respaldo', text: 'Sin datos todavía' };
    const dias = daysSince(m.ultimoRespaldo);
    if (!m.pendiente) return { cls: 'ok', label: 'Respaldo al día', text: m.ultimoRespaldo ? ago(m.ultimoRespaldo) : '—' };
    if (dias == null || dias >= C.respaldoDias) return { cls: 'warn', label: 'Exporta un respaldo', text: m.ultimoRespaldo ? `último ${ago(m.ultimoRespaldo)}` : 'nunca se ha exportado' };
    return { cls: 'pend', label: 'Cambios sin respaldar', text: `último ${ago(m.ultimoRespaldo)}` };
  }
  function chrome() {
    $$('[data-count]').forEach(el => { el.textContent = DATA.length; });
    const r = respaldoEstado();
    $$('[data-backup]').forEach(el => {
      el.className = 'backup solo-jefes backup--' + r.cls;
      el.innerHTML = `<i></i><span><b>${esc(r.label)}</b><small class="mono">${esc(r.text)}</small></span>`;
    });
    $$('[data-backup-text]').forEach(el => { el.textContent = `${r.label} · ${r.text}`; });
    MODS.forEach(m => m.chrome && m.chrome());
  }

  /* =========================================================
     LISTADO
     ========================================================= */
  const FDEF = { q: '', tipo: '', cat: '', cob: '', estatus: '', fav: false, sort: 'nombre' };
  const F = Object.assign({}, FDEF, session.get('galitha.filtros', {}));
  delete F.minCal; delete F.sat; // filtros de calificación y SAT retirados el 2026-10-02
  if (F.sort === 'calificacion') F.sort = 'nombre';
  // Vistas del listado. "tarjetas" (v0.1) equivale a "compactas"
  const VISTAS = [
    { id: 'compactas', label: 'Compactas', ico: 'vCompactas' },
    { id: 'amplias', label: 'Amplias', ico: 'vAmplias' },
    { id: 'ancho', label: 'A lo ancho', ico: 'vAncho' },
    { id: 'tabla', label: 'Tabla', ico: 'vTabla' }
  ];
  let vista = prefs.get('galitha.vista', 'compactas');
  if (vista === 'tarjetas') vista = 'compactas';
  if (!VISTAS.some(v => v.id === vista)) vista = 'compactas';
  const saveF = () => session.set('galitha.filtros', F);
  const activeFilters = () => ['tipo', 'cat', 'cob', 'estatus', 'fav'].filter(k => F[k]).length;
  const tiene = (lista, v) => lista.some(x => norm(x) === norm(v));

  function haystack(p) {
    return norm([
      p.nombreComercial, p.razonSocial, p.rfc, p.tipo, p.servicio, p.correo, p.notas,
      ...p.categorias, ...p.cobertura, ...p.etiquetas, ...p.obras,
      ...p.telefonos.map(t => t.numero + ' ' + digits(t.numero)),
      ...p.contactos.flatMap(c => [c.nombre, c.puesto, c.area, c.correo, ...c.telefonos.map(t => digits(t.numero))])
    ].join(' '));
  }
  function filtrar() {
    const terms = norm(F.q).split(/\s+/).filter(Boolean);
    const list = DATA.filter(p => {
      if (F.tipo && norm(p.tipo) !== norm(F.tipo)) return false;
      if (F.cat && !tiene(p.categorias, F.cat)) return false;
      if (F.cob && !tiene(p.cobertura, F.cob)) return false;
      if (F.estatus && p.estatus !== F.estatus) return false;
      if (F.fav && !p.favorito) return false;
      if (terms.length) { const h = haystack(p); return terms.every(t => h.includes(t)); }
      return true;
    });
    const byName = (a, b) => nombre(a).localeCompare(nombre(b), 'es', { sensitivity: 'base' });
    const sorts = {
      nombre: byName,
      actualizado: (a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn),
      alta: (a, b) => b.creadoEn.localeCompare(a.creadoEn)
    };
    return list.sort(sorts[F.sort] || byName);
  }

  const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  // Pastilla con desplegable: muestra el nombre del filtro y, si hay uno elegido, su valor resaltado
  const psel = (key, label, options, cur, icon = '') =>
    `<label class="psel${cur ? ' on' : ''}" title="${label}">${icon}<span class="psel-k">${label}</span><select data-f="${key}" aria-label="${label}">${options}</select></label>`;
  const ESTCHIPS = [{ id: '', label: 'Todos' }, { id: 'activo', label: 'Activos' }, { id: 'evaluacion', label: 'En evaluación' }, { id: 'no_recomendado', label: 'No recomendados' }];
  // Opciones de una lista que usa al menos un proveedor, en el orden de la lista
  const enUso = k => { const u = usos(k); return LISTAS[k].filter(v => u.has(norm(v))); };

  function toolbarHTML() {
    // Si una opción filtrada se renombró o se quitó, el filtro se limpia
    [['tipo', 'tipos'], ['cat', 'categorias'], ['cob', 'cobertura']].forEach(([f, k]) => { if (F[f] && !tiene(enUso(k), F[f])) F[f] = ''; });
    saveF();
    // La primera opción lleva el nombre del filtro: sin filtro la pastilla dice "Tipo"; con filtro, "Tipo: Materiales"
    const lista = (f, k, label) => opt('', label, F[f]) + enUso(k).map(v => opt(v, v, F[f])).join('');
    return `
      <div class="tools-top rv" style="--d:160">
        <h2 class="h-sec">Tus proveedores</h2>
        <label class="search">${I.search}<input id="q" type="search" value="${esc(F.q)}" placeholder="Buscar por nombre, RFC, contacto, servicio, teléfono, zona o etiqueta" autocomplete="off" aria-label="Buscar proveedores"><kbd>/</kbd></label>
        <div class="views" role="group" aria-label="Vista">
          ${VISTAS.map(v => `<button type="button" class="v-${v.id}" data-view="${v.id}" aria-pressed="${vista === v.id}" title="Vista: ${v.label}">${I[v.ico]}<span>${v.label}</span></button>`).join('')}
        </div>
      </div>
      <div class="filterbar rv" style="--d:200">
        <div class="seg" role="group" aria-label="Estatus">
          ${ESTCHIPS.map(e => `<button type="button" data-est="${e.id}" aria-pressed="${F.estatus === e.id}">${e.label}</button>`).join('')}
        </div>
        <button type="button" class="favchip" data-favchip aria-pressed="${!!F.fav}" title="Solo favoritos">${I.star}<span>Favoritos</span></button>
        <i class="fb-sep" aria-hidden="true"></i>
        ${psel('tipo', 'Tipo', lista('tipo', 'tipos', 'Tipo'), F.tipo)}
        ${psel('cat', 'Categoría', lista('cat', 'categorias', 'Categoría'), F.cat)}
        ${psel('cob', 'Cobertura', lista('cob', 'cobertura', 'Cobertura'), F.cob)}
        ${psel('sort', 'Ordenar', opt('nombre', 'Nombre A–Z', F.sort) + opt('actualizado', 'Actualizados', F.sort) + opt('alta', 'Recién agregados', F.sort), '', I.sort)}
      </div>`;
  }

  // Piezas comunes de las tarjetas
  const pnameHTML = p => `<a class="pname" href="#/p/${encodeURIComponent(p.id)}">${esc(nombre(p))}</a>`;
  const avHTML = (p, cls = '') => `<span class="av ${tono(p)}${cls ? ' ' + cls : ''}" aria-hidden="true">${esc(iniciales(nombre(p)))}</span>`;
  const cobTxt = p => p.cobertura.join(', ');
  const coberturaHTML = p => p.cobertura.length ? `<span class="c-loc" title="Cobertura: ${esc(cobTxt(p))}">${I.map}<span>${esc(cobTxt(p))}</span></span>` : '';
  const obrasTxt = p => p.obras.length ? plural(p.obras.length, 'obra', 'obras') : '—';
  // Contacto principal con acciones (usa también los teléfonos generales si el contacto no tiene)
  const principalHTML = (p, max, conPuesto) => {
    const { c, tel } = canales(p);
    const linea = [conPuesto && c && c.puesto, tel && fmtTel(tel.numero)].filter(Boolean).join(' · ') || (c && c.correo) || p.correo || '—';
    return `
      <div class="c-bot">
        <span class="p-av" aria-hidden="true">${c ? esc(iniciales(c.nombre)) : '—'}</span>
        <div class="c-who"><b>${c ? esc(c.nombre || 'Sin nombre') : 'Sin contacto'}</b><small>${esc(linea)}</small></div>
        <span class="quick">${quick(p, false, max)}</span>
      </div>`;
  };

  // Contacto principal en columna (vista a lo ancho): datos arriba, acciones con texto abajo
  const personaLinea = p => {
    const { c, tel } = canales(p);
    return `
      <div class="l-person">
        <span class="p-av" aria-hidden="true">${c ? esc(iniciales(c.nombre)) : '—'}</span>
        <div class="c-who"><b>${c ? esc(c.nombre || 'Sin nombre') : 'Sin contacto'}</b>${c && c.puesto ? `<small>${esc(c.puesto)}</small>` : ''}<small>${esc(tel ? fmtTel(tel.numero) : (c && c.correo) || p.correo || '—')}</small></div>
      </div>
      <span class="quick">${quick(p, true)}</span>`;
  };

  function rowHTML(p, i) {
    const c = principal(p);
    const { tel } = canales(p);
    const cats = p.categorias.length ? esc(p.categorias[0]) + (p.categorias.length > 1 ? ` <span class="more mono">+${p.categorias.length - 1}</span>` : '') : '<span class="muted">—</span>';
    return `
      <tr class="row rv" style="--d:${Math.min(i, 18) * 28}" data-id="${esc(p.id)}">
        <td class="c-fav">${favBtn(p)}</td>
        <td class="c-name">${pnameHTML(p)}<span class="sub">${esc(p.tipo || p.razonSocial || '')}</span></td>
        <td class="c-cat">${cats}</td>
        <td class="c-con">${c ? `${esc(c.nombre)}<span class="sub">${esc(c.puesto || c.area || '')}</span>` : '<span class="muted">Sin contacto</span>'}</td>
        <td class="c-tel mono">${tel ? esc(fmtTel(tel.numero)) : '<span class="muted">—</span>'}</td>
        <td class="c-cob">${esc(cobTxt(p)) || '<span class="muted">—</span>'}</td>
        <td class="c-est">${tagEst(p.estatus)}</td>
        <td class="c-act"><span class="quick">${quick(p)}</span></td>
      </tr>`;
  }

  // Vista "Compactas": tarjetas chicas, cuatro por fila en escritorio
  function compactaHTML(p, i) {
    return `
      <article class="card rv" style="--d:${Math.min(i, 12) * 40}" data-id="${esc(p.id)}">
        ${favBtn(p)}
        <div class="c-top">${avHTML(p)}<div class="c-id">${pnameHTML(p)}<span class="sub">${esc(p.categorias[0] || p.tipo || 'Proveedor')}</span></div></div>
        <div class="c-mid">${tagEst(p.estatus)}${coberturaHTML(p)}</div>
        ${principalHTML(p, 2, false)}
      </article>`;
  }

  // Vista "Amplias": dos por fila con servicio, datos clave y todos los contactos
  function ampliaHTML(p, i) {
    const cs = [...p.contactos].sort((a, b) => b.activo - a.activo);
    const { tel } = canales(p);
    const cats = p.categorias.slice(0, 4).map(t => `<span>${esc(t)}</span>`).join('') + (p.categorias.length > 4 ? `<span>+${p.categorias.length - 4}</span>` : '');
    return `
      <article class="card wcard rv" style="--d:${Math.min(i, 10) * 50}" data-id="${esc(p.id)}">
        ${favBtn(p)}
        <div class="c-top">${avHTML(p)}<div class="c-id">${pnameHTML(p)}<span class="sub">${esc(p.tipo || 'Proveedor')}</span></div>${tagEst(p.estatus)}</div>
        ${p.servicio ? `<p class="w-serv">${esc(p.servicio)}</p>` : ''}
        ${cats ? `<div class="chips-ro">${cats}</div>` : ''}
        <div class="stats4">
          <div><small>Cobertura</small><b>${esc(cobTxt(p) || '—')}</b></div>
          <div><small>Teléfono</small><b>${esc(tel ? fmtTel(tel.numero) : '—')}</b></div>
          <div><small>Obras</small><b>${obrasTxt(p)}</b></div>
        </div>
        <div class="people">${cs.length ? cs.map(personaHTML).join('') : principalHTML(p, 3, true)}</div>
      </article>`;
  }

  // Vista "A lo ancho": una tarjeta por renglón, de lado a lado
  function anchoHTML(p, i) {
    const { c } = canales(p);
    const otros = p.contactos.filter(x => x !== c).length;
    const cat = p.categorias.length ? esc(p.categorias[0]) + (p.categorias.length > 1 ? ` <span class="more">+${p.categorias.length - 1}</span>` : '') : '';
    return `
      <article class="card lcard rv" style="--d:${Math.min(i, 14) * 35}" data-id="${esc(p.id)}">
        <div class="l-id">${avHTML(p)}<div class="c-id">${pnameHTML(p)}<span class="sub">${esc(p.tipo || 'Proveedor')}</span><div class="tags">${tagEst(p.estatus)}${favBtn(p)}</div></div></div>
        <div class="l-mid">
          <p class="w-serv${p.servicio ? '' : ' muted'}">${esc(p.servicio || 'Sin descripción del servicio.')}</p>
          <div class="l-facts">
            ${p.cobertura.length ? `<span><small>Cobertura</small>${esc(cobTxt(p))}</span>` : ''}
            ${cat ? `<span><small>Categoría</small>${cat}</span>` : ''}
            <span><small>Obras</small>${obrasTxt(p)}</span>
            <span><small>Actualizado</small>${esc(ago(p.actualizadoEn))}</span>
            ${p.etiquetas.length ? `<span class="l-tags">${p.etiquetas.slice(0, 3).map(t => `<span class="chip-ro">#${esc(t)}</span>`).join('')}</span>` : ''}
          </div>
        </div>
        <div class="l-con">${personaLinea(p)}${otros ? `<p class="l-more">+${otros} ${otros === 1 ? 'contacto más' : 'contactos más'}</p>` : ''}</div>
      </article>`;
  }

  function renderResults(animate = true) {
    const box = $('#results'); if (!box || !DATA.length) return;
    const list = filtrar();
    const nf = activeFilters() + (F.q ? 1 : 0);
    const v = vista === 'tabla' && mobileMQ.matches ? 'compactas' : vista; // en celular la tabla se muestra como tarjetas
    const head = `<p class="count mono">Mostrando <b>${list.length}</b> de ${DATA.length}${nf ? ` · filtrado <button type="button" class="link-u clear-f" data-act="limpiar">Limpiar filtros</button>` : ''}</p>`;
    if (!list.length) {
      box.innerHTML = head + `
        <div class="empty empty--sm">
          <div class="empty-mark">${markSVG()}</div>
          <h3 class="h3">Sin resultados</h3>
          <p class="muted">Ningún proveedor coincide con la búsqueda o los filtros.</p>
          <button class="btn" data-act="limpiar"><span>Limpiar búsqueda y filtros</span>${ARR}</button>
        </div>`;
    } else if (v === 'tabla') {
      box.innerHTML = head + `
        <div class="tablewrap rv"><table class="tbl">
          <thead><tr><th class="c-fav"><span class="sr">Favorito</span></th><th>Proveedor</th><th class="c-cat">Categoría</th><th>Contacto principal</th><th class="c-tel">Teléfono</th><th class="c-cob">Cobertura</th><th>Estatus</th><th class="c-act"><span class="sr">Acciones</span></th></tr></thead>
          <tbody>${list.map(rowHTML).join('')}</tbody>
        </table></div>`;
    } else {
      const tpl = { compactas: compactaHTML, amplias: ampliaHTML, ancho: anchoHTML }[v];
      box.innerHTML = head + `<div class="cards cards--${v}">${list.map(tpl).join('')}</div>`;
    }
    if (animate) reveal(box); else $$('.rv', box).forEach(e => e.classList.add('is-in'));
    // Sincroniza chips y pastillas de filtro
    $$('[data-est]').forEach(b => b.setAttribute('aria-pressed', b.dataset.est === F.estatus));
    $$('[data-favchip]').forEach(b => b.setAttribute('aria-pressed', !!F.fav));
    $$('.psel [data-f]').forEach(s => { if (s.dataset.f !== 'sort') s.closest('.psel').classList.toggle('on', !!s.value); });
  }

  function emptyAllHTML() {
    return `
      <div class="empty rv" style="--d:120">
        <div class="empty-mark">${markSVG()}</div>
        <p class="eyebrow">Directorio vacío</p>
        <h2 class="h2">Aún no hay proveedores</h2>
        <p class="muted">${puedeDir() ? 'Agrega el primero o importa un respaldo JSON.' : 'Todavía no se ha registrado ningún proveedor.'}</p>
        ${puedeDir() ? `<div class="empty-acts">
          <button class="btn btn--solid" data-act="nuevo"><span>Agregar proveedor</span>${ARR}</button>
          <a class="btn" href="#/datos"><span>Importar respaldo</span>${ARR}</a>
        </div>` : ''}
      </div>`;
  }

  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  function heroHTML() {
    const total = DATA.length;
    const cuenta = est => DATA.filter(p => p.estatus === est).length;
    const personas = DATA.flatMap(p => p.contactos).filter(c => c.activo);
    const favs = DATA.filter(p => p.favorito).length;
    const cats = new Set(DATA.flatMap(p => p.categorias)).size;
    return `
      <div class="hero">
        <div class="hero-main rv">
          <span class="deco" aria-hidden="true">${markSVG()}</span>
          <div>
            <p class="h-eyebrow">Galitha · Plataforma interna</p>
            <h1>Directorio de<br>proveedores</h1>
          </div>
          <div class="h-sum">
            <span class="h-count"><b>${total}</b> ${total === 1 ? 'proveedor' : 'proveedores'} · <span class="sun"><b>${cuenta('activo')}</b> ${cuenta('activo') === 1 ? 'activo' : 'activos'}</span></span>
            <span class="pill"><b>${cuenta('evaluacion')}</b> en evaluación</span>
            <span class="pill"><b>${cuenta('no_recomendado')}</b> ${cuenta('no_recomendado') === 1 ? 'no recomendado' : 'no recomendados'}</span>
            <span class="pill pill--cats"><b>${cats}</b> ${cats === 1 ? 'categoría' : 'categorías'}</span>
          </div>
        </div>
        <div class="sqs-h">
          <div class="sq sq--sun rv" style="--d:80">
            <p>Favoritos</p>
            <div class="sq-row"><strong>${favs}</strong>${favs ? `<button class="sq-go" type="button" data-ver-fav aria-label="Ver favoritos" title="Ver favoritos">${I.arrow}</button>` : '<small>Marca con la estrella a los que más usas</small>'}</div>
          </div>
          <div class="sq rv" style="--d:140">
            <p>Contactos activos</p>
            <div class="sq-row"><strong>${personas.length}</strong><span class="avs" aria-hidden="true">${personas.slice(0, 3).map(c => `<i>${esc(iniciales(c.nombre))}</i>`).join('')}${personas.length > 3 ? `<i>+${personas.length - 3}</i>` : ''}</span></div>
          </div>
        </div>
      </div>`;
  }

  async function pageLista() {
    await refresh();
    const total = DATA.length;
    const html = `
      <section class="page">
        ${total ? heroHTML() + toolbarHTML() : `
        <header class="page-head rv">
          <div><p class="eyebrow">Directorio · Galitha</p><h1 class="title">Proveedores</h1></div>
        </header>`}
        <div id="results">${total ? '' : emptyAllHTML()}</div>
      </section>`;
    return {
      title: 'Proveedores',
      html,
      bind(root) {
        if (!total) return;
        renderResults();
        const q = $('#q', root);
        let t;
        q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { F.q = q.value; saveF(); renderResults(false); }, 120); });
        $$('[data-f]', root).forEach(el => el.addEventListener('change', () => {
          const k = el.dataset.f;
          F[k] = el.type === 'checkbox' ? el.checked : el.value;
          saveF(); renderResults(false);
        }));
        $$('[data-est]', root).forEach(b => b.addEventListener('click', () => { F.estatus = b.dataset.est; saveF(); renderResults(false); }));
        $('[data-favchip]', root).addEventListener('click', () => { F.fav = !F.fav; saveF(); renderResults(false); });
        $$('[data-view]', root).forEach(b => b.addEventListener('click', () => {
          vista = b.dataset.view; prefs.set('galitha.vista', vista);
          $$('[data-view]', root).forEach(x => x.setAttribute('aria-pressed', x === b));
          renderResults();
        }));
        const verFav = $('[data-ver-fav]', root);
        if (verFav) verFav.addEventListener('click', () => {
          F.fav = true; saveF();
          renderResults(false);
          $('.tools-top', root).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        });
      }
    };
  }

  /* =========================================================
     FICHA DEL PROVEEDOR
     ========================================================= */
  const panel = (n, title, body, extra = '', d = 0) => `
    <section class="panel rv" style="--d:${d}">
      <header class="panel-h"><span class="mono">${n}</span><h2>${title}</h2>${extra}</header>
      <div class="panel-b">${body}</div>
    </section>`;
  const dl = rows => {
    const r = rows.filter(([, v]) => v);
    return r.length ? `<dl class="dl">${r.map(([k, v]) => `<div><dt class="mono">${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '';
  };
  const nada = txt => `<p class="none muted">${txt}</p>`;
  const telLine = t => `
    <li class="tline">
      <span class="tnum mono">${esc(fmtTel(t.numero))}</span>
      ${t.etiqueta ? `<span class="tlab">${esc(t.etiqueta)}</span>` : ''}
      <span class="tacts">
        ${t.whatsapp ? `<a class="qbtn" href="${esc(waHref(t.numero))}" target="_blank" rel="noopener" title="WhatsApp">${I.wa}</a>` : ''}
        <a class="qbtn" href="${esc(telHref(t.numero))}" title="Llamar">${I.phone}</a>
        <button class="qbtn" data-copy="${esc(t.numero)}" title="Copiar">${I.copy}</button>
      </span>
    </li>`;
  const mailLine = m => `
    <li class="tline">
      <span class="tmail">${esc(m)}</span>
      <span class="tacts">
        ${mailHref(m) ? `<a class="qbtn" href="${esc(mailHref(m))}" title="Escribir correo">${I.mail}</a>` : ''}
        <button class="qbtn" data-copy="${esc(m)}" title="Copiar">${I.copy}</button>
      </span>
    </li>`;

  function contactoHTML(p, c) {
    const lines = [...c.telefonos.map(telLine), c.correo ? mailLine(c.correo) : ''].join('');
    return `
      <article class="contact${c.activo ? '' : ' is-off'}">
        <div class="ct-top">
          <div class="ct-av mono">${esc((c.nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</div>
          <div class="ct-id">
            <h3>${esc(c.nombre || 'Sin nombre')}${c.activo ? '' : ' <span class="tag tag--off">Ya no está</span>'}</h3>
            <p class="sub">${esc([c.puesto, c.area].filter(Boolean).join(' · ') || 'Sin puesto')}</p>
          </div>
          <div class="ct-btns"${puedeDir() ? '' : ' hidden'}>
            <button class="ibtn" data-act="editar-contacto" data-cid="${esc(c.id)}" title="Editar contacto" aria-label="Editar a ${esc(c.nombre)}">${I.edit}</button>
            <button class="ibtn" data-act="borrar-contacto" data-cid="${esc(c.id)}" title="Eliminar contacto" aria-label="Eliminar a ${esc(c.nombre)}">${I.trash}</button>
          </div>
        </div>
        ${lines ? `<ul class="tlist">${lines}</ul>` : ''}
        <div class="ct-meta">
          ${c.medios.length ? `<span><em class="mono">Prefiere</em>${c.medios.map(m => `<b class="medio medio--${m}">${esc(medioLabel(m))}</b>`).join('')}</span>` : ''}
          ${c.horario ? `<span><em class="mono">Horario</em>${esc(c.horario)}</span>` : ''}
          <span><em class="mono">Alta</em>${esc(fmtDate(c.fechaIngreso))}</span>
        </div>
        ${c.notas ? `<p class="ct-notes">${esc(c.notas)}</p>` : ''}
      </article>`;
  }

  async function pageDetalle({ id }) {
    await refresh();
    for (const m of MODS) if (m.cargar) await m.cargar(); // compras con este proveedor
    const p = DATA.find(x => x.id === id);
    if (!p) {
      return {
        title: 'No encontrado',
        html: `<section class="page"><div class="empty rv"><div class="empty-mark">${markSVG()}</div><h2 class="h2">Proveedor no encontrado</h2><p class="muted">Puede que se haya eliminado o que la liga sea de otro equipo.</p><a class="btn" href="#/"><span>Volver al directorio</span>${ARR}</a></div></section>`
      };
    }
    const web = safeUrl(p.sitioWeb);
    const maps = safeUrl(p.mapsUrl) || (p.direccion ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.direccion) : '');

    const html = `
      <section class="page detail">
        <a class="back rv" href="#/">${I.back}<span>Proveedores</span></a>
        <header class="d-hero rv" style="--d:40">
          <div class="d-top">
            ${avHTML(p, 'av--xl')}
            <div class="d-title">
              <div class="d-tags">${tagEst(p.estatus)}${p.etiquetas.map(t => `<span class="chip-ro">#${esc(t)}</span>`).join('')}</div>
              <h1 class="title title--d">${esc(nombre(p))}</h1>
              <p class="d-sub"><span>${esc(p.tipo || 'Proveedor')}</span>${p.razonSocial && p.razonSocial !== p.nombreComercial ? `<span>${esc(p.razonSocial)}</span>` : ''}${p.rfc ? `<span class="mono">RFC ${esc(p.rfc)}</span>` : ''}</p>
            </div>
            <div class="d-actions">
              ${favBtn(p)}
              ${puedeDir() ? `<button class="btn btn--solid" data-act="editar">${I.edit}<span>Editar</span></button>` : ''}
              ${N.puede('borrarProveedor') ? `<button class="ibtn ibtn--line" data-act="borrar" title="Eliminar proveedor" aria-label="Eliminar proveedor">${I.trash}</button>` : ''}
            </div>
          </div>
          <div class="quickbar">${quick(p, true)}${web ? `<a class="qbtn" href="${esc(web)}" target="_blank" rel="noopener">${I.web}<span>Sitio web</span></a>` : ''}${maps ? `<a class="qbtn" href="${esc(maps)}" target="_blank" rel="noopener">${I.map}<span>Mapa</span></a>` : ''}</div>
        </header>

        <div class="d-grid">
          <div class="d-main">
            ${panel('01', 'Servicio que nos provee', `
              ${p.servicio ? `<p class="lead-s">${esc(p.servicio)}</p>` : nada('Sin descripción del servicio.')}
              ${p.categorias.length ? `<div class="chips-ro">${p.categorias.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
              ${p.cobertura.length ? `<div class="d-cob">${I.map}<span class="mono">Cobertura</span>${p.cobertura.map(z => `<span class="chip-ro">${esc(z)}</span>`).join('')}</div>` : ''}`, '', 140)}

            ${panel('02', `Contactos <span class="mono n">${pad(p.contactos.length)}</span>`,
              p.contactos.length ? `<div class="contacts">${p.contactos.map(c => contactoHTML(p, c)).join('')}</div>` : nada('Todavía no hay contactos registrados para este proveedor.'),
              puedeDir() ? `<button class="tbtn tbtn--sm" data-act="nuevo-contacto">${I.plus}<span>Agregar contacto</span></button>` : '', 180)}

            ${panel('03', 'Obras en las que ha participado', p.obras.length ? `<ul class="obras">${p.obras.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : nada('Sin obras registradas.'), '', 220)}
            ${MODS.map(m => (m.fichaProveedor ? m.fichaProveedor(p) : '')).join('')}
          </div>

          <aside class="d-side">
            ${panel('04', 'Datos de contacto generales', `
              ${p.telefonos.length || p.correo ? `<ul class="tlist">${p.telefonos.map(telLine).join('')}${p.correo ? mailLine(p.correo) : ''}</ul>` : ''}
              ${dl([
                ['Sitio web', web ? `<a class="link-u" href="${esc(web)}" target="_blank" rel="noopener">${esc(host(web))}</a>` : ''],
                ['Dirección', esc(p.direccion) + (maps ? ` <a class="link-u small" href="${esc(maps)}" target="_blank" rel="noopener">Ver mapa</a>` : '')]
              ]) || (!p.telefonos.length && !p.correo ? nada('Sin datos generales.') : '')}`, '', 160)}

            ${panel('05', 'Notas', p.notas ? `<p class="notes">${esc(p.notas)}</p>` : nada('Sin notas.'), '', 200)}

            ${panel('06', 'Registro', dl([
              ['Alta', `${esc(fmtDate(p.creadoEn))} <span class="muted">· ${esc(p.creadoPor)}</span>`],
              ['Última edición', `${esc(fmtDate(p.actualizadoEn))} <span class="muted">· ${esc(ago(p.actualizadoEn))}</span>`],
              ['ID', `<span class="mono small">${esc(p.id)}</span>`]
            ]), '', 320)}
          </aside>
        </div>
      </section>`;

    return {
      title: nombre(p),
      html,
      bind(root) {
        root.addEventListener('click', async e => {
          const b = e.target.closest('[data-act]'); if (!b) return;
          const act = b.dataset.act;
          if (act === 'editar') formProveedor(p);
          if (act === 'nuevo-contacto') formContacto(p);
          if (act === 'editar-contacto') formContacto(p, p.contactos.find(c => c.id === b.dataset.cid));
          if (act === 'borrar-contacto') {
            const c = p.contactos.find(x => x.id === b.dataset.cid);
            if (await confirmar({ titulo: 'Eliminar contacto', texto: `Se eliminará a <b>${esc(c.nombre || 'este contacto')}</b> de ${esc(nombre(p))}. Si solo dejó de trabajar ahí, puedes editarlo y marcarlo como "ya no está".`, ok: 'Eliminar', peligro: true })) {
              try { await S.removeContacto(p.id, c.id); toast('Contacto eliminado.'); rerender(); } catch (err) { toast(err.message); }
            }
          }
          if (act === 'borrar') {
            if (await confirmar({ titulo: 'Eliminar proveedor', texto: `Se eliminará <b>${esc(nombre(p))}</b> con sus ${p.contactos.length} contacto(s) <b>para todos los usuarios</b>. Esta acción no se puede deshacer, salvo que tengas un respaldo JSON.`, ok: 'Eliminar proveedor', peligro: true, escribir: 'ELIMINAR' })) {
              try { await S.remove(p.id); toast('Proveedor eliminado.'); location.hash = '#/'; } catch (err) { toast(err.message); }
            }
          }
        });
      }
    };
  }

  /* =========================================================
     RESPALDO Y DATOS
     ========================================================= */
  let pendienteImport = null;

  async function pageDatos() {
    if (!(N.perfil && ['direccion', 'admin'].includes(N.perfil.rol))) {
      return { title: 'Respaldo y datos', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${markSVG()}</div><h2 class="h2">Sin acceso</h2><p class="muted">Solo Dirección y el admin técnico hacen respaldos e importan datos.</p><a class="btn" href="#/"><span>Volver</span>${ARR}</a></div></section>` };
    }
    await refresh();
    for (const m of MODS) if (m.cargar) await m.cargar();
    const m = S.meta();
    const r = respaldoEstado();
    const contactos = DATA.reduce((n, p) => n + p.contactos.length, 0);
    const html = `
      <section class="page">
        <header class="page-head rv">
          <div>
            <p class="eyebrow">Datos · Respaldo</p>
            <h1 class="title">Respaldo y datos</h1>
          </div>
        </header>

        <div class="note note--info rv" style="--d:60">
          ${I.db}
          <p>El directorio vive <b>en el servidor de la plataforma</b>: todos los que tienen acceso ven la misma información, desde cualquier computadora o celular. El plan gratuito del servidor no guarda copias automáticas, así que conviene <b>exportar un respaldo JSON</b> cada semana y guardarlo en Dropbox o Drive.</p>
        </div>

        <div class="d-grid d-grid--even">
          <div class="d-main">
            ${panel('01', 'Estado', `
              <div class="bk-state backup--${r.cls}"><i></i><div><b>${esc(r.label)}</b><span class="mono">${esc(r.text)}</span></div></div>
              ${dl([
                ['Proveedores', pad(DATA.length)],
                ['Contactos', pad(contactos)],
                ['Último cambio', m.ultimoCambio ? `${esc(fmtDate(m.ultimoCambio))} · ${esc(ago(m.ultimoCambio))}` : '—'],
                ['Último respaldo', m.ultimoRespaldo ? `${esc(fmtDate(m.ultimoRespaldo))} · ${esc(ago(m.ultimoRespaldo))} <span class="muted">· desde este navegador</span>` : 'Nunca desde este navegador'],
                ['Formato', `JSON · esquema v${S.SCHEMA}`]
              ])}`, '', 100)}

            ${panel('02', 'Exportar', `
              <p class="muted">Descarga una copia completa. El JSON incluye proveedores y listas de opciones, y sirve para restaurar o mover los datos; el CSV es para abrirlo en Excel (solo lectura).</p>
              <div class="acts">
                <button class="btn btn--solid" data-act="export-json"${DATA.length ? '' : ' disabled'}>${I.down}<span>Exportar JSON</span></button>
                <button class="btn" data-act="export-csv"${DATA.length ? '' : ' disabled'}>${I.down}<span>Exportar CSV</span></button>
              </div>`, '', 140)}
          </div>

          <div class="d-side">
            ${!puedeDir() ? '' : panel('03', 'Importar', `
              <label class="drop" id="drop">
                <input type="file" accept=".json,application/json" id="file" hidden>
                ${I.up}
                <b>Arrastra aquí un archivo JSON</b>
                <span class="muted">o haz clic para elegirlo</span>
              </label>
              <p class="muted small" style="margin:10px 0 0">Acepta respaldos del directorio y de requisiciones y compras.</p>
              <div id="import-res"></div>`, '', 180)}

          </div>
        </div>
        ${MODS.map(m => (m.datosPanel ? m.datosPanel() : '')).join('')}
      </section>`;

    return {
      title: 'Respaldo y datos',
      html,
      bind(root) {
        pendienteImport = null;
        MODS.forEach(m => m.datosBind && m.datosBind(root));
        const file = $('#file', root), drop = $('#drop', root);
        if (file) file.addEventListener('change', () => file.files[0] && leerArchivo(file.files[0]));
        if (drop) ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
        if (drop) ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
        if (drop) drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) leerArchivo(f); });

        root.addEventListener('click', async e => {
          const b = e.target.closest('[data-act]'); if (!b) return;
          const act = b.dataset.act;
          if (act === 'export-json') exportarJSON();
          if (act === 'export-csv') exportarCSV();
          if (act === 'importar') {
            if (!pendienteImport) return;
            const modo = b.dataset.modo;
            if (modo === 'reemplazar' && !(await confirmar({ titulo: 'Reemplazar todo', texto: `Los <b>${DATA.length}</b> proveedores del servidor se borrarán y quedarán solo los <b>${pendienteImport.total}</b> del archivo, <b>para todos los usuarios</b>.`, ok: 'Reemplazar', peligro: true, escribir: 'REEMPLAZAR' }))) return;
            try {
              await S.importar(pendienteImport.incoming, modo, pendienteImport.listas);
              toast(modo === 'reemplazar' ? 'Datos reemplazados.' : 'Importación completada.');
              pendienteImport = null; rerender();
            } catch (err) { toast('No se pudo guardar: ' + err.message); }
          }
          if (act === 'cancelar-import') { pendienteImport = null; $('#import-res').innerHTML = ''; file.value = ''; }
        });
      }
    };
  }

  function leerArchivo(f) {
    const out = $('#import-res');
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); }
      catch { out.innerHTML = `<p class="warn">${I.alert}El archivo no es un JSON válido.</p>`; return; }
      const mod = MODS.find(m => m.importa && m.importa(data));
      if (mod) { pendienteImport = null; mod.importarArchivo(data, f.name, out); return; }
      const a = S.analizar(data);
      if (!a.ok) { out.innerHTML = `<p class="warn">${I.alert}${esc(a.error)}</p>`; return; }
      pendienteImport = a;
      out.innerHTML = `
        <div class="imp">
          <p class="mono imp-f">${esc(f.name)}${a.exportadoEn ? ` · exportado ${esc(fmtDate(a.exportadoEn))}` : ''}</p>
          ${a.otraApp ? `<p class="warn">${I.alert}Este archivo parece venir de otra aplicación. Revisa el resultado.</p>` : ''}
          ${a.listas ? '<p class="muted small">Incluye listas de opciones: al combinar se suman a las tuyas; al reemplazar, sustituyen a las tuyas.</p>' : ''}
          <ul class="imp-n">
            <li><b>${a.total}</b><span>en el archivo</span></li>
            <li><b>${a.nuevos}</b><span>nuevos</span></li>
            <li><b>${a.actualizados}</b><span>más recientes que los tuyos</span></li>
            <li><b>${a.iguales}</b><span>sin cambios</span></li>
            ${a.anteriores ? `<li><b>${a.anteriores}</b><span>más viejos (se conserva tu versión)</span></li>` : ''}
          </ul>
          <div class="acts">
            <button class="btn btn--solid" data-act="importar" data-modo="combinar"><span>Combinar</span>${ARR}</button>
            ${N.puede('restaurar') ? '<button class="btn btn--danger" data-act="importar" data-modo="reemplazar"><span>Reemplazar todo</span></button>' : ''}
            <button class="link-u mono" data-act="cancelar-import">Cancelar</button>
          </div>
          <p class="muted small"><b>Combinar</b> agrega los nuevos y, si un proveedor existe en ambos lados, conserva la versión editada más recientemente. ${N.puede('restaurar') ? '<b>Reemplazar</b> borra lo actual y deja solo lo del archivo.' : ''}</p>
        </div>`;
    };
    reader.onerror = () => { out.innerHTML = `<p class="warn">${I.alert}No se pudo leer el archivo.</p>`; };
    reader.readAsText(f);
  }

  function descargar(nombreArchivo, contenido, tipo) {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function exportarJSON() {
    const data = await S.exportar();
    descargar(`galitha-proveedores-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    await S.marcarRespaldo();
    toast(`Respaldo exportado: ${data.proveedores.length} proveedores.`);
    rerender();
  }
  async function exportarCSV() {
    const cols = ['Nombre comercial', 'Razón social', 'RFC', 'Tipo', 'Categorías', 'Servicio', 'Estatus', 'Favorito',
      'Teléfonos', 'Correo', 'Sitio web', 'Dirección', 'Cobertura', 'Contactos', 'Obras', 'Etiquetas', 'Notas', 'Alta', 'Última edición'];
    const tels = ts => ts.map(t => `${t.numero}${t.etiqueta ? ` (${t.etiqueta})` : ''}${t.whatsapp ? ' [WA]' : ''}`).join('; ');
    const rows = DATA.map(p => [
      p.nombreComercial, p.razonSocial, p.rfc, p.tipo, p.categorias.join('; '), p.servicio, estLabel(p.estatus), p.favorito ? 'Sí' : '',
      tels(p.telefonos), p.correo, p.sitioWeb, p.direccion, p.cobertura.join('; '),
      p.contactos.map(c => [c.nombre, c.puesto, tels(c.telefonos), c.correo, c.medios.map(medioLabel).join('/'), c.activo ? '' : 'ya no está'].filter(Boolean).join(' – ')).join(' | '),
      p.obras.join('; '), p.etiquetas.join('; '), p.notas,
      p.creadoEn.slice(0, 10), p.actualizadoEn.slice(0, 10)
    ]);
    const cell = v => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // evita que Excel lo interprete como fórmula
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = '﻿' + [cols, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
    descargar(`galitha-proveedores-${today()}.csv`, csv, 'text/csv;charset=utf-8');
    toast('CSV exportado.');
  }


  /* =========================================================
     FORMULARIOS (panel lateral)
     ========================================================= */
  const field = (label, input, opts = {}) =>
    `<label class="fld${opts.wide ? ' fld--wide' : ''}${opts.cls ? ' ' + opts.cls : ''}"><span class="fld-l">${label}${opts.req ? ' <em>*</em>' : ''}</span>${input}${opts.hint ? `<small class="fld-h">${opts.hint}</small>` : ''}</label>`;
  const inp = (name, value, attrs = '') => `<input class="in" name="${name}" value="${esc(value == null ? '' : value)}" ${attrs}>`;
  const area = (name, value, rows = 3, attrs = '') => `<textarea class="in" name="${name}" rows="${rows}" ${attrs}>${esc(value || '')}</textarea>`;
  const select = (name, value, options, empty) =>
    `<select class="in" name="${name}">${empty ? `<option value="">${empty}</option>` : ''}${options.map(o => typeof o === 'string' ? opt(o, o, value) : opt(o.id, o.label, value)).join('')}</select>`;
  const fset = (n, title, body) => `<fieldset class="fs"><legend><span class="mono">${n}</span>${title}</legend><div class="fs-b">${body}</div></fieldset>`;

  const toggles = (name, options, selected) => `<div class="toggles" data-toggles="${name}">${options.map(o => {
    const id = typeof o === 'string' ? o : o.id, label = typeof o === 'string' ? o : o.label;
    return `<label class="chk chk--pill"><input type="checkbox" name="${name}" value="${esc(id)}"${selected.includes(id) ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  }).join('')}</div>`;
  const radios = (name, options, value) => `<div class="toggles" role="radiogroup">${options.map(o =>
    `<label class="chk chk--pill chk--radio chk--${esc(o.id)}"><input type="radio" name="${name}" value="${esc(o.id)}"${o.id === value ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;

  // Campo cuyas opciones vienen de una lista editable: lleva el botón "Editar lista" junto a la etiqueta
  const fieldLista = (label, k, input, opts = {}) => `
    <div class="fld${opts.wide ? ' fld--wide' : ''}">
      <div class="fld-top"><span class="fld-l">${label}</span><button type="button" class="lnk-lista" data-editar-lista="${k}" title="Agregar, renombrar o quitar opciones">${I.listas}<span>Editar lista</span></button></div>
      ${input}${opts.hint ? `<small class="fld-h">${opts.hint}</small>` : ''}
    </div>`;

  // Selección múltiple con menú desplegable (categorías, cobertura, etiquetas, obras)
  const chipHTML = v => `<span class="chip" data-v="${esc(v)}">${esc(v)}<button type="button" data-chip-x aria-label="Quitar ${esc(v)}">×</button></span>`;
  const chips = (name, k, values, placeholder) => `
      <div class="chips" data-chips="${name}" data-lista="${k}">
        ${values.map(chipHTML).join('')}
        <input class="chip-in" placeholder="${esc(placeholder)}" autocomplete="off" role="combobox" aria-expanded="false" aria-label="${esc(placeholder)}">
        <div class="chip-menu" role="listbox" hidden></div>
      </div>`;

  // Selección única con opción para agregar una nueva (tipo de proveedor, área del contacto)
  const NUEVA = '__nueva__';
  const selectListaOpts = (k, value, empty) => {
    const ops = [...(LISTAS[k] || [])];
    if (value && !tiene(ops, value)) ops.push(value);
    return `<option value="">${esc(empty)}</option>${ops.map(o => opt(o, o, value)).join('')}<option value="${NUEVA}">＋ Agregar nueva opción…</option>`;
  };
  const selectLista = (name, k, value, empty) => `
    <div class="sel-lista">
      <select class="in" name="${name}" data-lista="${k}" data-empty="${esc(empty)}" data-prev="${esc(value || '')}">${selectListaOpts(k, value, empty)}</select>
      <div class="sel-add" hidden>
        <input class="in" placeholder="Nombre de la nueva opción" maxlength="120" aria-label="Nueva opción">
        <button type="button" class="btn btn--solid" data-sel-ok>Agregar</button>
        <button type="button" class="ibtn" data-sel-no aria-label="Cancelar">${I.close}</button>
      </div>
    </div>`;
  const sinNueva = v => (v === NUEVA ? '' : v);

  const telRow = (t = {}) => `
    <div class="rep-row" data-row>
      <input class="in" name="t-num" type="tel" inputmode="tel" value="${esc(t.numero || '')}" placeholder="55 1234 5678" aria-label="Número">
      <input class="in" name="t-et" value="${esc(t.etiqueta || '')}" placeholder="Etiqueta" list="dl-etiq-tel" aria-label="Etiqueta">
      <label class="chk chk--wa"><input type="checkbox" name="t-wa"${t.whatsapp ? ' checked' : ''}><span>${I.wa}WhatsApp</span></label>
      <button type="button" class="ibtn" data-rm aria-label="Quitar teléfono">${I.close}</button>
    </div>`;
  const dlEtiqTel = () => (LISTAS.etiquetasTel || []).map(s => `<option value="${esc(s)}">`).join('');
  const telRep = tels => `
    <div class="rep" data-rep="tel">
      ${(tels.length ? tels : [{}]).map(telRow).join('')}
      <datalist id="dl-etiq-tel">${dlEtiqTel()}</datalist>
    </div>
    <button type="button" class="tbtn tbtn--sm" data-add="tel">${I.plus}<span>Agregar teléfono</span></button>`;

  // Lectura de componentes
  const readTels = root => $$('[data-rep="tel"] [data-row]', root).map(r => ({
    numero: $('[name="t-num"]', r).value.trim(), etiqueta: $('[name="t-et"]', r).value.trim(), whatsapp: $('[name="t-wa"]', r).checked
  })).filter(t => t.numero);
  const readChips = (root, name) => {
    const box = $(`[data-chips="${name}"]`, root);
    const pending = $('.chip-in', box).value.trim();
    const vals = $$('.chip', box).map(c => c.dataset.v);
    return pending && !tiene(vals, pending) ? [...vals, canonico(box.dataset.lista, pending)] : vals;
  };
  const readChecks = (root, name) => $$(`input[name="${name}"]:checked`, root).map(i => i.value);
  const val = (root, name) => { const el = $(`[name="${name}"]`, root); return el ? el.value.trim() : ''; };
  const radio = (root, name) => { const el = $(`[name="${name}"]:checked`, root); return el ? el.value : ''; };
  // Si lo escrito ya existe en la lista (aunque cambien mayúsculas o acentos) se usa la versión de la lista
  const canonico = (k, v) => (LISTAS[k] || []).find(x => norm(x) === norm(v)) || v;

  /* ---------- Menú de la selección múltiple ---------- */
  function pintarMenu(box) {
    const input = $('.chip-in', box), menu = $('.chip-menu', box);
    const texto = input.value.trim(), q = norm(texto);
    const elegidos = new Set($$('.chip', box).map(c => norm(c.dataset.v)));
    const ops = (LISTAS[box.dataset.lista] || []).filter(v => !q || norm(v).includes(q));
    const exacto = ops.some(v => norm(v) === q);
    menu.innerHTML =
      ops.map(v => `<button type="button" class="cm-opt" role="option" data-cm="${esc(v)}" aria-selected="${elegidos.has(norm(v))}"><i></i><span>${esc(v)}</span></button>`).join('') +
      (q && !exacto ? `<button type="button" class="cm-opt cm-new" role="option" data-cm-new>${I.plus}<span>Agregar “${esc(texto)}” a la lista</span></button>` : '') +
      (!ops.length && !q ? '<p class="cm-empty">La lista está vacía: escribe para agregar la primera opción.</p>' : '');
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function cerrarMenu(box) {
    const menu = $('.chip-menu', box);
    if (!menu || menu.hidden) return false;
    menu.hidden = true;
    $('.chip-in', box).setAttribute('aria-expanded', 'false');
    return true;
  }
  function toggleChip(box, v) {
    const ya = $$('.chip', box).find(c => norm(c.dataset.v) === norm(v));
    if (ya) ya.remove();
    else $('.chip-in', box).insertAdjacentHTML('beforebegin', chipHTML(canonico(box.dataset.lista, v)));
    markDirty();
  }

  /* ---------- Selección única: agregar opción nueva ---------- */
  function refrescarSelect(sel, value) {
    sel.innerHTML = selectListaOpts(sel.dataset.lista, value, sel.dataset.empty);
    sel.value = value || '';
    sel.dataset.prev = sel.value;
  }
  function cerrarSelAdd(wrap, restaurar) {
    const sel = $('select', wrap), add = $('.sel-add', wrap);
    if (restaurar) sel.value = sel.dataset.prev || '';
    add.hidden = true;
    $('input', add).value = '';
  }
  async function agregarSelAdd(wrap) {
    const sel = $('select', wrap), k = sel.dataset.lista, input = $('.sel-add input', wrap);
    const v = input.value.trim();
    if (!v) { input.focus(); return; }
    const existe = (LISTAS[k] || []).find(x => norm(x) === norm(v));
    if (!existe) { await S.guardarLista(k, [...LISTAS[k], v]); LISTAS = await S.listas(); toast(`Se agregó “${v}” a la lista.`); }
    refrescarSelect(sel, existe || v);
    cerrarSelAdd(wrap, false);
    markDirty();
    sel.focus();
  }

  /* ---------- Aplicar al formulario abierto lo que se cambió en el editor de listas ---------- */
  function aplicarCambiosForm(root, k, cambios) {
    const mapear = v => {
      for (const c of cambios) if (c.de != null && v && norm(v) === norm(c.de)) v = c.a;
      return v;
    };
    $$(`.chips[data-lista="${k}"]`, root).forEach(box => {
      const vistos = new Set();
      $$('.chip', box).forEach(ch => {
        const nv = mapear(ch.dataset.v);
        if (!nv || vistos.has(norm(nv))) { ch.remove(); return; }
        vistos.add(norm(nv));
        if (nv !== ch.dataset.v) ch.outerHTML = chipHTML(nv);
      });
    });
    $$(`select[data-lista="${k}"]`, root).forEach(sel => refrescarSelect(sel, mapear(sinNueva(sel.value)) || ''));
    if (k === 'etiquetasTel') {
      const dl = $('#dl-etiq-tel', root); if (dl) dl.innerHTML = dlEtiqTel();
      $$('[name="t-et"]', root).forEach(i => { i.value = mapear(i.value) || ''; });
    }
  }

  function bindFormWidgets(root) {
    root.addEventListener('click', async e => {
      const add = e.target.closest('[data-add]');
      if (add) {
        const rep = $(`[data-rep="${add.dataset.add}"]`, root);
        rep.insertAdjacentHTML('beforeend', telRow());
        const rows = $$('[data-row]', rep);
        $('input', rows[rows.length - 1]).focus();
        markDirty();
      }
      const rm = e.target.closest('[data-rm]');
      if (rm) { rm.closest('[data-row]').remove(); markDirty(); }
      const x = e.target.closest('[data-chip-x]');
      if (x) { const box = x.closest('[data-chips]'); x.parentElement.remove(); markDirty(); if (box && !$('.chip-menu', box).hidden) pintarMenu(box); }
      // Menú de selección múltiple
      const op = e.target.closest('[data-cm]');
      if (op) { const box = op.closest('[data-chips]'); toggleChip(box, op.dataset.cm); $('.chip-in', box).value = ''; pintarMenu(box); }
      const nueva = e.target.closest('[data-cm-new]');
      if (nueva) { const box = nueva.closest('[data-chips]'), input = $('.chip-in', box); toggleChip(box, input.value.trim()); input.value = ''; pintarMenu(box); }
      const chipsBox = e.target.closest('[data-chips]');
      if (chipsBox && !e.target.closest('button')) $('.chip-in', chipsBox).focus();
      // Selección única: agregar opción
      if (e.target.closest('[data-sel-ok]')) agregarSelAdd(e.target.closest('.sel-lista'));
      if (e.target.closest('[data-sel-no]')) cerrarSelAdd(e.target.closest('.sel-lista'), true);
      // Editar la lista completa sin salir del formulario
      const ed = e.target.closest('[data-editar-lista]');
      if (ed) {
        const k = ed.dataset.editarLista;
        const cambios = await abrirEditorLista(k);
        if (cambios.length) aplicarCambiosForm(root, k, cambios);
        $$(`.chips[data-lista="${k}"]`, root).forEach(cerrarMenu);
      }
    });
    // El menú no debe robar el foco del campo de texto
    root.addEventListener('mousedown', e => { if (e.target.closest('.chip-menu')) e.preventDefault(); });

    $$('.chip-in', root).forEach(input => {
      const box = input.closest('[data-chips]');
      let act = -1; // opción resaltada con el teclado
      const marcar = () => $$('.cm-opt', box).forEach((b, i) => b.classList.toggle('act', i === act));
      input.addEventListener('focus', () => { act = -1; pintarMenu(box); });
      input.addEventListener('input', () => { act = -1; pintarMenu(box); });
      input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) cerrarMenu(box); }, 120));
      input.addEventListener('keydown', e => {
        const opts = $$('.cm-opt', box);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if ($('.chip-menu', box).hidden) pintarMenu(box);
          act = (act + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % Math.max(opts.length, 1);
          marcar(); if (opts[act]) opts[act].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          if (act >= 0 && opts[act]) { opts[act].click(); act = -1; return; }
          const v = input.value.trim();
          if (v) { if (!$$('.chip', box).some(c => norm(c.dataset.v) === norm(v))) toggleChip(box, v); input.value = ''; pintarMenu(box); }
        } else if (e.key === 'Escape') {
          if (cerrarMenu(box)) e.stopPropagation(); // con el menú abierto, Escape solo lo cierra (no cierra el panel)
        } else if (e.key === 'Backspace' && !input.value) {
          const prev = $$('.chip', box).pop();
          if (prev) { prev.remove(); markDirty(); pintarMenu(box); }
        }
      });
    });

    $$('.sel-lista', root).forEach(wrap => {
      const sel = $('select', wrap), input = $('.sel-add input', wrap);
      sel.addEventListener('change', () => {
        if (sel.value === NUEVA) { $('.sel-add', wrap).hidden = false; input.focus(); }
        else { sel.dataset.prev = sel.value; cerrarSelAdd(wrap, false); }
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); agregarSelAdd(wrap); }
        if (e.key === 'Escape') { e.stopPropagation(); cerrarSelAdd(wrap, true); sel.focus(); }
      });
    });
    root.addEventListener('input', e => { if (!e.target.closest('.sel-add')) markDirty(); });
    root.addEventListener('change', markDirty);
  }

  /* ---------- Panel lateral ---------- */
  const drawer = $('#drawer');
  const drPanel = $('.dr-panel', drawer);
  let dirty = false, lastFocus = null;
  function markDirty() { dirty = true; }

  function openDrawer(title, sub, body, onSubmit) {
    lastFocus = document.activeElement;
    drPanel.classList.remove('wide');
    drPanel.innerHTML = `
      <form class="dr-form" novalidate>
        <header class="dr-h">
          <div><p class="mono">${sub}</p><h2 id="dr-title">${title}</h2></div>
          <button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button>
        </header>
        <div class="dr-b">${body}</div>
        <footer class="dr-f">
          <p class="dr-err" role="alert"></p>
          <button type="button" class="btn" data-close><span>Cancelar</span></button>
          <button type="submit" class="btn btn--solid"><span>Guardar</span>${ARR}</button>
        </footer>
      </form>`;
    const form = $('form', drPanel);
    bindFormWidgets(form);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const err = $('.dr-err', form);
      err.textContent = '';
      $$('.invalid', form).forEach(x => x.classList.remove('invalid'));
      try {
        const msg = await onSubmit(form);
        if (msg) { err.textContent = msg; const bad = $('.invalid', form); if (bad) bad.focus(); return; }
        dirty = false; closeDrawer(true);
      } catch (ex) { err.textContent = 'No se pudo guardar: ' + ex.message; }
    });
    dirty = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
    drPanel.scrollTop = 0;
    setTimeout(() => { const f = $('.dr-b .in', form); if (f && !mobileMQ.matches) f.focus(); }, reduced ? 0 : 450);
  }
  // Panel con contenido libre (módulos): el módulo pone su propio pie y botones
  function openPanel(html, { wide = false } = {}, bind) {
    lastFocus = document.activeElement;
    drPanel.classList.toggle('wide', wide);
    drPanel.innerHTML = html;
    dirty = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
    drPanel.scrollTop = 0;
    if (bind) bind(drPanel);
    setTimeout(() => { const f = $('.dr-b .in:not([type=file]):not([disabled])', drPanel); if (f && !mobileMQ.matches) f.focus(); }, reduced ? 0 : 450);
  }
  async function closeDrawer(force) {
    if (!document.body.classList.contains('drawer-open')) return;
    if (!force && dirty && !(await confirmar({ titulo: 'Descartar cambios', texto: 'Hay cambios sin guardar en el formulario.', ok: 'Descartar', peligro: true }))) return;
    dirty = false;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(); });

  function duplicados(p) {
    const n = norm(p.nombreComercial).replace(/[^a-z0-9]/g, '');
    const tels = new Set(p.telefonos.map(t => digits(t.numero).slice(-10)).filter(d => d.length >= 8));
    return DATA.filter(o => o.id !== p.id).map(o => {
      const why = [];
      if (p.rfc && o.rfc === p.rfc) why.push('mismo RFC');
      if (n && norm(o.nombreComercial).replace(/[^a-z0-9]/g, '') === n) why.push('mismo nombre');
      if (o.telefonos.some(t => tels.has(digits(t.numero).slice(-10)))) why.push('mismo teléfono');
      return why.length ? { o, why } : null;
    }).filter(Boolean);
  }

  function formProveedor(prev) {
    const nuevo = !prev;
    const p = prev || S.nuevoProveedor();

    const body = `
      ${fset('01', 'Identificación', `
        <div class="grid2">
          ${field('Nombre comercial', inp('nombreComercial', p.nombreComercial, 'required maxlength="160" autocomplete="off"'), { req: true, wide: true })}
          ${field('Razón social', inp('razonSocial', p.razonSocial, 'maxlength="200" autocomplete="off"'))}
          ${field('RFC', inp('rfc', p.rfc, 'maxlength="13" autocomplete="off"'), { hint: '12 caracteres (empresa) o 13 (persona física)' })}
          ${fieldLista('Tipo de proveedor', 'tipos', selectLista('tipo', 'tipos', p.tipo, 'Selecciona…'))}
          <div class="fld"><span class="fld-l">Estatus</span>${radios('estatus', C.estatus, p.estatus)}</div>
          <label class="chk chk--pill fld--wide"><input type="checkbox" name="favorito"${p.favorito ? ' checked' : ''}><span>${I.star}Marcar como favorito</span></label>
        </div>
        <div class="dupes" aria-live="polite"></div>`)}

      ${fset('02', 'Servicio', `
        ${fieldLista('Categorías', 'categorias', chips('categorias', 'categorias', p.categorias, 'Busca o escribe una categoría…'), { wide: true, hint: 'Elige de la lista o escribe una nueva y presiona Enter.' })}
        ${field('¿Qué servicio o productos nos provee?', area('servicio', p.servicio, 3, 'maxlength="1000"'), { wide: true })}
        ${fieldLista('Zona de cobertura', 'cobertura', chips('cobertura', 'cobertura', p.cobertura, 'Busca o escribe una zona…'), { wide: true, hint: 'Puede atender varias zonas: estados, alcaldías o “cerca de obra”.' })}
        ${fieldLista('Etiquetas', 'etiquetas', chips('etiquetas', 'etiquetas', p.etiquetas, 'Ej. urgente, garantía…'), { wide: true })}`)}

      ${fset('03', 'Datos de contacto generales', `
        <div class="fld fld--wide"><span class="fld-l">Teléfonos</span>${telRep(p.telefonos)}</div>
        <div class="grid2">
          ${field('Correo general', inp('correo', p.correo, 'type="email" maxlength="160" autocomplete="off"'))}
          ${field('Sitio web', inp('sitioWeb', p.sitioWeb, 'maxlength="200" placeholder="empresa.com" autocomplete="off"'))}
        </div>
        ${field('Dirección', area('direccion', p.direccion, 2, 'maxlength="300"'), { wide: true })}
        ${field('Liga de Google Maps', inp('mapsUrl', p.mapsUrl, 'type="url" maxlength="500" placeholder="Opcional: si no, se busca la dirección"'), { wide: true })}`)}

      ${nuevo ? fset('04', 'Contacto principal <span class="opt">opcional</span>', `
        <div class="grid2">
          ${field('Nombre', inp('c-nombre', '', 'maxlength="120" autocomplete="off"'))}
          ${field('Puesto', inp('c-puesto', '', 'maxlength="120" autocomplete="off"'))}
          ${field('Teléfono', inp('c-tel', '', 'type="tel" inputmode="tel" placeholder="55 1234 5678"'))}
          ${field('Correo', inp('c-correo', '', 'type="email" maxlength="160" autocomplete="off"'))}
        </div>
        <label class="chk chk--wa"><input type="checkbox" name="c-wa" checked><span>${I.wa}El teléfono tiene WhatsApp</span></label>
        <div class="fld fld--wide"><span class="fld-l">Medio de contacto preferido</span>${toggles('c-medios', C.medios, [])}</div>
        <p class="fld-h">Podrás agregar más contactos desde la ficha del proveedor.</p>`) : ''}

      ${fset(nuevo ? '05' : '04', 'Obras', `
        ${fieldLista('Obras en las que ha participado', 'obras', chips('obras', 'obras', p.obras, 'Busca o escribe una obra…'), { wide: true })}`)}

      ${fset(nuevo ? '06' : '05', 'Notas', area('notas', p.notas, 5, 'maxlength="4000" placeholder="Acuerdos, experiencias, advertencias…"'))}`;

    openDrawer(nuevo ? 'Nuevo proveedor' : 'Editar proveedor', nuevo ? 'Alta' : esc(nombre(p)), body, async form => {
      const bad = (name, msg) => { const el = $(`[name="${name}"]`, form); if (el) el.classList.add('invalid'); return msg; };
      const data = Object.assign({}, p, {
        nombreComercial: val(form, 'nombreComercial'),
        razonSocial: val(form, 'razonSocial'),
        rfc: val(form, 'rfc').toUpperCase().replace(/[\s-]/g, ''),
        tipo: sinNueva(val(form, 'tipo')),
        estatus: radio(form, 'estatus') || 'activo',
        favorito: $('[name="favorito"]', form).checked,
        categorias: readChips(form, 'categorias'),
        servicio: val(form, 'servicio'),
        cobertura: readChips(form, 'cobertura'),
        etiquetas: readChips(form, 'etiquetas'),
        telefonos: readTels(form),
        correo: val(form, 'correo'),
        sitioWeb: val(form, 'sitioWeb'),
        direccion: val(form, 'direccion'),
        mapsUrl: val(form, 'mapsUrl'),
        // calificacion, condiciones, sat y archivos ya no se editan: se conservan tal como estaban en el registro
        obras: readChips(form, 'obras'),
        notas: val(form, 'notas')
      });

      if (!data.nombreComercial) return bad('nombreComercial', 'Escribe el nombre comercial del proveedor.');
      if (data.rfc && !RFC_RE.test(data.rfc)) return bad('rfc', 'El RFC no tiene un formato válido (ej. ABC150312XY1).');
      if (data.correo && !mailHref(data.correo)) return bad('correo', 'Revisa el correo general.');
      if (data.sitioWeb && !safeUrl(data.sitioWeb)) return bad('sitioWeb', 'Revisa la dirección del sitio web.');
      if (data.mapsUrl && !/^https?:\/\//i.test(data.mapsUrl)) return bad('mapsUrl', 'Revisa la liga de Google Maps: debe empezar con https://');

      if (nuevo) {
        const cn = val(form, 'c-nombre');
        const ct = val(form, 'c-tel');
        const cc = val(form, 'c-correo');
        if (cc && !mailHref(cc)) return bad('c-correo', 'Revisa el correo del contacto.');
        if (cn || ct || cc) {
          data.contactos = [Object.assign(S.nuevoContacto(), {
            nombre: cn || 'Contacto', puesto: val(form, 'c-puesto'), correo: cc,
            telefonos: ct ? [{ numero: ct, etiqueta: 'Celular', whatsapp: $('[name="c-wa"]', form).checked }] : [],
            medios: readChecks(form, 'c-medios'), fechaIngreso: today()
          })];
        }
      }

      const dup = duplicados(data);
      const box = $('.dupes', form);
      if (dup.length && !box.dataset.ok) {
        box.dataset.ok = '1';
        box.innerHTML = `<p class="warn">${I.alert}<span>Posible duplicado: ${dup.map(d => `<a href="#/p/${encodeURIComponent(d.o.id)}" class="link-u" data-close>${esc(nombre(d.o))}</a> (${d.why.join(', ')})`).join('; ')}. Si es correcto, vuelve a presionar Guardar.</span></p>`;
        box.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        return 'Revisa el aviso de posible duplicado.';
      }

      // Al editar, los contactos se toman de lo guardado (una lista editada mientras el panel estaba abierto pudo cambiarlos)
      if (!nuevo) delete data.contactos;
      const saved = await S.save(data);
      toast(nuevo ? 'Proveedor agregado.' : 'Cambios guardados.');
      if (nuevo) location.hash = '#/p/' + encodeURIComponent(saved.id);
      else rerender();
    });
  }

  function formContacto(p, prev) {
    const nuevo = !prev;
    const c = prev || S.nuevoContacto();
    const body = `
      ${fset('01', 'Persona', `
        <div class="grid2">
          ${field('Nombre', inp('nombre', c.nombre, 'required maxlength="120" autocomplete="off"'), { req: true, wide: true })}
          ${field('Puesto', inp('puesto', c.puesto, 'maxlength="120" autocomplete="off"'))}
          ${fieldLista('Área', 'areas', selectLista('area', 'areas', c.area, 'Sin área'))}
          ${field('Fecha de alta del contacto', inp('fechaIngreso', c.fechaIngreso, 'type="date"'), { hint: 'Fecha en que se registró en el directorio' })}
          <label class="chk chk--pill"><input type="checkbox" name="activo"${c.activo ? ' checked' : ''}><span>Sigue trabajando en la empresa</span></label>
        </div>`)}
      ${fset('02', 'Medios de contacto', `
        <div class="fld fld--wide"><span class="fld-l">Teléfonos</span>${telRep(c.telefonos)}</div>
        ${field('Correo', inp('correo', c.correo, 'type="email" maxlength="160" autocomplete="off"'), { wide: true })}
        <div class="fld fld--wide"><span class="fld-l">Medio preferido</span>${toggles('medios', C.medios, c.medios)}</div>
        ${field('Horario de atención', inp('horario', c.horario, 'maxlength="120" placeholder="L–V 9:00 a 18:00"'), { wide: true })}`)}
      ${fset('03', 'Notas', area('notas', c.notas, 4, 'maxlength="2000"'))}`;

    openDrawer(nuevo ? 'Nuevo contacto' : 'Editar contacto', esc(nombre(p)), body, async form => {
      const data = Object.assign({}, c, {
        nombre: val(form, 'nombre'), puesto: val(form, 'puesto'), area: sinNueva(val(form, 'area')),
        fechaIngreso: val(form, 'fechaIngreso') || today(), activo: $('[name="activo"]', form).checked,
        telefonos: readTels(form), correo: val(form, 'correo'), medios: readChecks(form, 'medios'),
        horario: val(form, 'horario'), notas: val(form, 'notas')
      });
      if (!data.nombre) { $('[name="nombre"]', form).classList.add('invalid'); return 'Escribe el nombre del contacto.'; }
      if (data.correo && !mailHref(data.correo)) { $('[name="correo"]', form).classList.add('invalid'); return 'Revisa el correo.'; }
      await S.saveContacto(p.id, data);
      toast(nuevo ? 'Contacto agregado.' : 'Contacto actualizado.');
      rerender();
    });
  }

  /* =========================================================
     LISTAS EDITABLES (opciones de los desplegables)
     ========================================================= */
  const LISTAS_DEF = [
    { k: 'tipos', titulo: 'Tipos de proveedor', ayuda: 'Cada proveedor tiene un solo tipo.' },
    { k: 'categorias', titulo: 'Categorías', ayuda: 'Rubros o especialidades. Un proveedor puede tener varias.' },
    { k: 'cobertura', titulo: 'Zonas de cobertura', ayuda: 'Estados, alcaldías, municipios o referencias locales, por ejemplo “Cerca de obra San Lorenzo”.' },
    { k: 'etiquetas', titulo: 'Etiquetas', ayuda: 'Marcas libres para encontrar proveedores: urgente, garantía, entrega en obra…' },
    { k: 'obras', titulo: 'Obras', ayuda: 'Obras en las que han participado los proveedores.' },
    { k: 'areas', titulo: 'Áreas de los contactos', ayuda: 'Ventas, cobranza, técnico… Se elige en cada contacto.' },
    { k: 'etiquetasTel', titulo: 'Etiquetas de teléfono', ayuda: 'Oficina, celular, directo… Se sugieren al capturar un teléfono.' }
  ];
  const defLista = k => LISTAS_DEF.find(d => d.k === k) || { titulo: k, ayuda: '' };

  function editorListaHTML(k) {
    const u = usos(k), vals = LISTAS[k] || [];
    return `
      <ul class="le-list">${vals.length ? vals.map(v => {
        const n = u.get(norm(v)) || 0;
        return `
          <li class="le-row" data-v="${esc(v)}">
            <input class="le-in" value="${esc(v)}" maxlength="120" aria-label="Nombre de la opción ${esc(v)}" title="Escribe para renombrar">
            <span class="le-n${n ? '' : ' cero'}" title="${n ? plural(n, 'proveedor la usa', 'proveedores la usan') : 'Ningún proveedor la usa'}">${n}</span>
            <button type="button" class="ibtn le-del" data-le-del aria-label="Quitar ${esc(v)}" title="Quitar">${I.trash}</button>
          </li>`;
      }).join('') : '<li class="le-empty">Sin opciones todavía.</li>'}</ul>
      <div class="le-add">
        <input class="in" placeholder="Nueva opción…" maxlength="120" aria-label="Nueva opción">
        <button type="button" class="btn btn--solid" data-le-add>${I.plus}<span>Agregar</span></button>
      </div>
      <div class="le-foot">
        <span>${plural(vals.length, 'opción', 'opciones')} · el número indica cuántos proveedores la usan</span>
        ${vals.length > 1 ? '<button type="button" class="link-u" data-le-sort>Ordenar A–Z</button>' : ''}
      </div>`;
  }

  // Editor de una lista: agregar, renombrar (se propaga a los proveedores), quitar y ordenar.
  // onCambio recibe { de, a } por cada renombre o baja, para actualizar un formulario abierto.
  function bindEditorLista(wrap, k, onCambio = () => {}) {
    const pintar = () => { wrap.innerHTML = editorListaHTML(k); };
    const recargar = async () => { await refresh(); pintar(); };
    const agregar = async () => {
      const input = $('.le-add input', wrap), v = input.value.trim();
      if (!v) { input.focus(); return; }
      if (tiene(LISTAS[k], v)) { toast(`“${v}” ya está en la lista.`); input.select(); return; }
      await S.guardarLista(k, [...LISTAS[k], v]);
      await recargar();
      toast(`Se agregó “${v}”.`);
      $('.le-add input', wrap).focus();
    };
    wrap.addEventListener('click', async e => {
      if (e.target.closest('[data-le-add]')) { agregar(); return; }
      if (e.target.closest('[data-le-sort]')) {
        await S.guardarLista(k, [...LISTAS[k]].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })));
        await recargar(); return;
      }
      const row = e.target.closest('.le-row'); if (!row) return;
      const v = row.dataset.v;
      if (e.target.closest('[data-le-del]')) {
        const n = usos(k).get(norm(v)) || 0;
        if (!n) { await S.quitarOpcion(k, v); await recargar(); onCambio({ de: v, a: '' }); toast(`Se quitó “${v}”.`); return; }
        // En uso: se confirma en el mismo renglón
        row.classList.add('is-confirm');
        row.innerHTML = `
          <p class="le-warn">${I.alert}<span>“${esc(v)}” se quitará de ${plural(n, 'proveedor', 'proveedores')}.</span></p>
          <button type="button" class="btn btn--danger-solid" data-le-ok>Quitar</button>
          <button type="button" class="btn" data-le-no>Cancelar</button>`;
        $('[data-le-no]', row).focus();
        return;
      }
      if (e.target.closest('[data-le-ok]')) {
        const r = await S.quitarOpcion(k, v);
        await recargar(); onCambio({ de: v, a: '' });
        toast(`Se quitó “${v}” de ${plural(r.proveedores, 'proveedor', 'proveedores')}.`);
        return;
      }
      if (e.target.closest('[data-le-no]')) pintar();
    });
    wrap.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.closest('.le-add')) { e.preventDefault(); agregar(); }
      else if (e.target.classList.contains('le-in')) { e.preventDefault(); e.target.blur(); }
    });
    // Renombrar al salir del campo (o con Enter)
    wrap.addEventListener('change', e => {
      const input = e.target.closest('.le-in'); if (!input) return;
      e.stopPropagation();
      const de = input.closest('.le-row').dataset.v, a = input.value.trim();
      if (!a || a === de) { input.value = de; return; }
      wrap.pendiente = (async () => {
        const r = await S.renombrarOpcion(k, de, a);
        await recargar(); onCambio({ de, a });
        toast(r.unido ? `Se unió “${de}” con “${a}”.` : r.proveedores ? `“${a}”: se actualizó en ${plural(r.proveedores, 'proveedor', 'proveedores')}.` : `Se renombró a “${a}”.`);
      })();
    });
    pintar();
  }

  // Ventana para editar una lista desde el formulario; devuelve los cambios hechos
  function abrirEditorLista(k) {
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const box = $('.md-box', modal);
      const d = defLista(k), cambios = [];
      box.classList.add('md-box--lista');
      box.innerHTML = `
        <div class="md-lh">
          <div><p class="mono md-k">Editar lista</p><h2 id="md-title">${esc(d.titulo)}</h2></div>
          <button type="button" class="ibtn" data-md-x aria-label="Cerrar">${I.close}</button>
        </div>
        <p class="md-t">${esc(d.ayuda)} Al renombrar o quitar una opción, el cambio se aplica a todos los proveedores.</p>
        <div class="le-wrap"></div>
        <div class="md-a"><button type="button" class="btn btn--solid" data-md-x><span>Listo</span></button></div>`;
      const wrap = $('.le-wrap', box);
      bindEditorLista(wrap, k, c => cambios.push(c));
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      setTimeout(() => { const i = $('.le-add input', box); if (i) i.focus(); }, 60);
      const done = async () => {
        box.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey, true);
        // Si había un renombre a medio escribir, se guarda antes de cerrar
        if (box.contains(document.activeElement)) document.activeElement.blur();
        await new Promise(r => setTimeout(r, 0));
        if (wrap.pendiente) await wrap.pendiente;
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        box.classList.remove('md-box--lista');
        if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
        resolve(cambios);
      };
      const onClick = e => { if (e.target.closest('[data-md-x]')) done(); };
      const onKey = e => { if (e.key === 'Escape' && !box.querySelector('.is-confirm')) { e.stopPropagation(); e.preventDefault(); done(); } };
      box.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  async function pageListas() {
    await refresh();
    const html = `
      <section class="page">
        <header class="page-head rv">
          <div><p class="eyebrow">Configuración</p><h1 class="title">Listas y opciones</h1></div>
        </header>
        <div class="note note--info rv" style="--d:60">
          ${I.listas}
          <p>${puedeDir() ? '' : '<b>Solo consulta:</b> tu rol puede ver estas listas, pero no modificarlas. '}Aquí se definen las opciones de los desplegables del formulario, a la medida de la oficina. Puedes <b>agregar</b>, <b>renombrar</b> (escribe sobre el nombre; se actualiza en todos los proveedores) y <b>quitar</b> opciones. También puedes hacerlo desde el formulario con el botón <b>Editar lista</b>. Las listas se guardan en el respaldo JSON.</p>
        </div>
        <div class="le-grid">${LISTAS_DEF.map((d, i) => `
          <section class="panel rv" style="--d:${100 + i * 40}">
            <header class="panel-h"><h2>${esc(d.titulo)}</h2></header>
            <div class="panel-b"><p class="fld-h le-help">${esc(d.ayuda)}</p><div class="le-wrap" data-le-wrap="${d.k}"></div></div>
          </section>`).join('')}
        </div>
      </section>`;
    return {
      title: 'Listas y opciones',
      html,
      bind(root) {
        if (puedeDir()) { $$('[data-le-wrap]', root).forEach(w => bindEditorLista(w, w.dataset.leWrap)); return; }
        $$('[data-le-wrap]', root).forEach(w => {
          const vals = LISTAS[w.dataset.leWrap] || [];
          w.innerHTML = vals.length ? `<div class="chips-ro">${vals.map(v => `<span>${esc(v)}</span>`).join('')}</div>` : '<p class="none muted">Sin opciones.</p>';
        });
      }
    };
  }

  /* =========================================================
     DIÁLOGO DE CONFIRMACIÓN + AVISOS
     ========================================================= */
  const modal = $('#modal');
  function confirmar({ titulo, texto, ok = 'Confirmar', peligro = false, escribir = '' }) {
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const box = $('.md-box', modal);
      box.innerHTML = `
        <p class="mono md-k">${peligro ? 'Confirmar acción' : 'Confirmar'}</p>
        <h2 id="md-title">${esc(titulo)}</h2>
        <p class="md-t">${texto}</p>
        ${escribir ? `<label class="fld"><span class="fld-l">Escribe <b>${escribir}</b> para continuar</span><input class="in md-in" autocomplete="off"></label>` : ''}
        <div class="md-a">
          <button class="btn" data-r="0"><span>Cancelar</span></button>
          <button class="btn ${peligro ? 'btn--danger-solid' : 'btn--solid'}" data-r="1"${escribir ? ' disabled' : ''}><span>${esc(ok)}</span></button>
        </div>`;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      const okBtn = $('[data-r="1"]', box);
      const input = $('.md-in', box);
      if (input) { input.addEventListener('input', () => { okBtn.disabled = input.value.trim().toUpperCase() !== escribir; }); setTimeout(() => input.focus(), 50); }
      else setTimeout(() => $('[data-r="0"]', box).focus(), 50);
      const done = r => {
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        box.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey, true);
        if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
        resolve(r);
      };
      const onClick = e => { const b = e.target.closest('[data-r]'); if (b && !b.disabled) done(b.dataset.r === '1'); };
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); done(false); }
        if (e.key === 'Enter' && input && !okBtn.disabled) { e.preventDefault(); done(true); }
      };
      box.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  // Pide un dato en una ventana: devuelve el texto (o null si se cancela)
  function preguntar({ titulo, texto = '', etiqueta = '', campo = 'texto', valor = '', ok = 'Guardar', requerido = false, peligro = false }) {
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const box = $('.md-box', modal);
      const input = campo === 'area'
        ? `<textarea class="in md-in" rows="4">${esc(valor)}</textarea>`
        : `<input class="in md-in" ${campo === 'numero' ? 'type="number" min="0" step="0.01" inputmode="decimal"' : campo === 'fecha' ? 'type="date"' : ''} value="${esc(valor)}" autocomplete="off">`;
      box.innerHTML = `
        <p class="mono md-k">${peligro ? 'Confirmar acción' : 'Dato'}</p>
        <h2 id="md-title">${esc(titulo)}</h2>
        ${texto ? `<p class="md-t">${texto}</p>` : ''}
        <label class="fld">${etiqueta ? `<span class="fld-l">${esc(etiqueta)}</span>` : ''}${input}</label>
        <div class="md-a">
          <button class="btn" data-r="0"><span>Cancelar</span></button>
          <button class="btn ${peligro ? 'btn--danger-solid' : 'btn--solid'}" data-r="1"${requerido && !valor ? ' disabled' : ''}><span>${esc(ok)}</span></button>
        </div>`;
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
      const okBtn = $('[data-r="1"]', box), inp = $('.md-in', box);
      if (requerido) inp.addEventListener('input', () => { okBtn.disabled = !inp.value.trim(); });
      setTimeout(() => { inp.focus(); if (inp.select) inp.select(); }, 50);
      const done = r => {
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        box.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey, true);
        if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
        resolve(r ? inp.value.trim() : null);
      };
      const onClick = e => { const b = e.target.closest('[data-r]'); if (b && !b.disabled) done(b.dataset.r === '1'); };
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); done(false); }
        if (e.key === 'Enter' && campo !== 'area' && !okBtn.disabled) { e.preventDefault(); done(true); }
      };
      box.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  let toastT;
  function toast(msg) {
    const t = $('.toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3400);
  }

  /* =========================================================
     ROUTER + CORTINA
     ========================================================= */
  const curtain = $('#curtain');
  let current = null, busy = false;

  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [page = '', id = ''] = raw.split('/');
    let dec = id; try { dec = decodeURIComponent(id); } catch { /* id inválido */ }
    return { page, id: dec, key: raw };
  }
  const pages = { '': pageLista, p: pageDetalle, datos: pageDatos, listas: pageListas };
  // Ruta → elemento activo del menú, título móvil y acción principal (botón de la barra superior y "+" del celular)
  const NAV = { p: '' };
  const TITULOS = { datos: 'Respaldo', listas: 'Listas' };
  const ACCIONES = { '': { label: 'Nuevo proveedor', act: 'nuevo' } };

  /* ---------- Módulos (requisiciones, compras…) ----------
     Cada módulo se carga antes que app.js y se anota en window.GALITHA_MODULOS
     como una función que recibe esta API y devuelve sus páginas y ganchos. */
  const API = {
    esc, norm, digits, pad, ico, I, ARR, markSVG, logoSVG, today, mobileMQ, reduced,
    toast, confirmar, preguntar, rerender: () => rerender(), iniciales, openPanel, closeDrawer, markDirty, descargar, panel, dl,
    refresh: () => refresh(), proveedores: () => DATA, listas: () => LISTAS, nombreProveedor: nombre, Store: S
  };
  const MODS = (window.GALITHA_MODULOS || []).map(f => f(API)).filter(Boolean);
  MODS.forEach(m => {
    Object.assign(pages, m.pages || {}); Object.assign(NAV, m.nav || {});
    Object.assign(TITULOS, m.titulos || {}); Object.assign(ACCIONES, m.acciones || {});
  });
  function accionPrincipal(route) {
    const a = ACCIONES[route] || ACCIONES[''];
    const oculto = (a.act === 'nuevo' && !puedeDir()) || (a.puede && !a.puede());
    $$('[data-main-act]').forEach(b => {
      b.hidden = oculto;
      b.dataset.act = a.act;
      b.setAttribute('aria-label', a.label);
      const t = $('[data-main-label]', b); if (t) t.textContent = a.label;
    });
  }

  function reveal(root) {
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.rv:not(.is-in)', root).forEach(e => e.classList.add('is-in'))));
  }
  async function render(r, keepScroll) {
    const fn = pages[r.page] || pageLista;
    const out = await fn(r);
    const view = $('#view');
    const y = scrollY;
    view.innerHTML = out.html;
    document.title = `${out.title} · Galitha`;
    const route = r.page in NAV ? NAV[r.page] : (pages[r.page] ? r.page : '');
    $$('.side-nav a, #menu nav a, .tabbar a').forEach(a => a.classList.toggle('active', a.dataset.route === route));
    $('.top-title').textContent = TITULOS[route] || 'Proveedores';
    document.body.dataset.page = r.page === 'p' ? 'ficha' : (route || 'lista');
    accionPrincipal(route);
    if (out.bind) out.bind(view.firstElementChild);
    if (keepScroll) { scrollTo(0, y); $$('.rv', view).forEach(e => e.classList.add('is-in')); }
    else { scrollTo(0, 0); reveal(view); }
  }
  function rerender() { return render(parse(), true); }

  async function go() {
    const r = parse();
    if (busy || r.key === current) return;
    const first = current === null;
    current = r.key;
    toggleMenu(false);
    if (document.body.classList.contains('drawer-open')) { dirty = false; closeDrawer(true); }
    if (first || reduced) { await render(r); if (!first) $('#view').focus({ preventScroll: true }); return; }
    busy = true;
    curtain.classList.remove('out'); curtain.classList.add('in');
    await wait(880);   // franjas cerradas (~0.62 s) + isotipo armado (~0.86 s)
    try { await render(r); } finally {
      curtain.classList.add('out');
      $('#view').focus({ preventScroll: true });
      await wait(660);
      curtain.classList.remove('in', 'out');
      busy = false;
    }
    if (parse().key !== current) go();
  }
  addEventListener('hashchange', go);

  /* ---------- Menú móvil ---------- */
  const burger = $('.nav-burger');
  function toggleMenu(force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    $('#menu').setAttribute('aria-hidden', !open);
  }
  burger.addEventListener('click', () => toggleMenu());
  $('#menu').addEventListener('click', e => { if (e.target.closest('a') && e.target.closest('a').getAttribute('href') === '#/' + current) toggleMenu(false); });

  /* ---------- Clics globales ---------- */
  document.addEventListener('click', async e => {
    const fav = e.target.closest('[data-fav]');
    if (fav) {
      e.preventDefault(); e.stopPropagation();
      const p = await S.get(fav.dataset.fav); if (!p) return;
      p.favorito = !p.favorito;
      try { await S.save(p); } catch (err) { toast(err.message); return; }
      toast(p.favorito ? 'Agregado a favoritos.' : 'Quitado de favoritos.');
      await refresh();
      rerender(); // también actualiza el contador de favoritos del listado
      return;
    }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Copiado: ' + copy.dataset.copy); }
      catch { toast('No se pudo copiar.'); }
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act && !act.closest('.detail')) {
      const a = act.dataset.act;
      if (a === 'nuevo' && puedeDir()) { await refresh(); formProveedor(); }
      MODS.forEach(m => m.onAct && m.onAct(a, act));
      if (a === 'limpiar') {
        Object.assign(F, FDEF, { sort: F.sort }); saveF();
        const q = $('#q'); if (q) q.value = '';
        $$('[data-f]').forEach(el => { if (el.type === 'checkbox') el.checked = false; else if (el.dataset.f !== 'sort') el.value = ''; });
        renderResults(false);
      }
    }
    // Fila o tarjeta completa abre la ficha
    const row = e.target.closest('[data-id]');
    if (row && !e.target.closest('a, button, input, label')) location.hash = '#/p/' + encodeURIComponent(row.dataset.id);
  });

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (e.key === 'Escape') {
      if (document.body.classList.contains('modal-open')) return;
      if (document.body.classList.contains('drawer-open')) { closeDrawer(); return; }
      if (document.body.classList.contains('menu-open')) toggleMenu(false);
    }
    if (e.key === '/' && !typing && !document.body.classList.contains('drawer-open')) {
      const q = $('#q'); if (q) { e.preventDefault(); q.focus(); q.select(); }
    }
  });

  let wasMobile = mobileMQ.matches;
  mobileMQ.addEventListener('change', () => {
    if (wasMobile !== mobileMQ.matches) { wasMobile = mobileMQ.matches; renderResults(false); if (!mobileMQ.matches) toggleMenu(false); }
  });

  // Si otra pestaña modifica los datos, se refleja aquí al volver
  addEventListener('storage', e => { if (e.key && e.key.startsWith('galitha.directorio') && !document.body.classList.contains('drawer-open')) rerender(); });

  /* =========================================================
     ARRANQUE
     ========================================================= */
  $$('.side-logo, .top-logo').forEach(el => { el.innerHTML = logoSVG(); });
  $('.loader-mark').innerHTML = markSVG();
  $('.curtain-mark').innerHTML = markSVG();
  $$('[data-ico]').forEach(el => { el.innerHTML = I[el.dataset.ico] || ''; });
  // Fecha de hoy en la barra superior ("Viernes, 2 de octubre de 2026"); se actualiza si la página queda abierta de un día a otro
  const pintarFecha = () => {
    const f = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $$('[data-fecha]').forEach(el => { el.textContent = f.charAt(0).toUpperCase() + f.slice(1); });
  };
  pintarFecha();
  setInterval(pintarFecha, 60 * 1000);

  // Usuario en sesión (barra lateral y menú del celular)
  function pintarUsuario() {
    const p = N.perfil;
    const html = `
      <span class="me-av" aria-hidden="true">${esc(iniciales(p.nombre || p.correo))}</span>
      <span class="me-id"><b>${esc(p.nombre || p.correo)}</b><small>${esc(N.ROLES[p.rol] || p.rol)}</small></span>
      <button type="button" class="ibtn me-out" data-salir title="Cerrar sesión" aria-label="Cerrar sesión">${I.logout}</button>`;
    $$('[data-yo]').forEach(el => { el.innerHTML = html; });
    document.body.dataset.rol = p.rol;
  }
  document.addEventListener('click', async e => {
    if (!e.target.closest('[data-salir]')) return;
    if (await confirmar({ titulo: 'Cerrar sesión', texto: 'Para volver a entrar te enviaremos un acceso nuevo a tu correo.', ok: 'Cerrar sesión' })) N.salir();
  });

  if (!location.hash) history.replaceState(null, '', '#/');
  const primera = !session.get('galitha.visto', false) && !reduced;
  N.iniciar().then(() => { pintarUsuario(); go(); });

  const loader = $('#loader');
  const finish = () => {
    loader.classList.add('done');
    document.body.classList.remove('is-loading');
    document.body.classList.add('ready');
    session.set('galitha.visto', true);
    setTimeout(() => loader.remove(), 1300);
  };
  if (!primera) { loader.classList.add('skip'); finish(); }
  else {
    const count = $('.loader-count'), t0 = performance.now();
    (function c(now) {
      const k = Math.min(1, (now - t0) / 1200);
      count.textContent = String(Math.round(k * 100)).padStart(3, '0');
      if (k < 1) requestAnimationFrame(c);
    })(t0);
    setTimeout(finish, 1450);
  }
})();
