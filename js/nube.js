/* =========================================================
   GALITHA · Conexión con Supabase e inicio de sesión
   Crea el cliente, muestra la pantalla de acceso, obtiene el
   perfil (rol) del usuario y expone window.Nube para el resto
   de la app. La seguridad real vive en la base de datos (RLS);
   aquí solo se decide qué botones mostrar.
   ========================================================= */
(() => {
  // Datos públicos del proyecto: la clave "publishable" está hecha para ir en la página
  const URL_PROYECTO = 'https://kxlyjgoolfbortqnhjrk.supabase.co';
  const CLAVE_PUBLICA = 'sb_publishable_7v_Lhykq2Qv8CqcyHJTPjg_DrPImqSS';

  const ROLES = {
    direccion: 'Dirección',
    admin: 'Admin técnico',
    compras: 'Compras y adquisiciones',
    coordinador: 'Coordinador de obra',
    residente: 'Residente de obra',
    consulta: 'Consulta (solo lectura)'
  };
  // Qué puede hacer cada rol en la interfaz (la base de datos lo vuelve a revisar)
  const PERMISOS = {
    directorio: ['direccion', 'admin', 'compras'],        // crear y editar proveedores, contactos y listas
    borrarProveedor: ['direccion', 'admin'],
    restaurar: ['direccion', 'admin'],                     // importar respaldos
    usuarios: ['direccion', 'admin']
  };

  // v0.17: cada petición tiene tiempo límite (con mala señal en obra se quedaba colgada) y las lecturas se reintentan una vez
  const LIMITE_MS = url => (/\/storage\/v1\/object\/|\/functions\/v1\//.test(url) ? 120e3 : 30e3);
  async function fetchConLimite(input, init = {}) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const metodo = String(init.method || (input && input.method) || 'GET').toUpperCase();
    const intentos = metodo === 'GET' || metodo === 'HEAD' ? 2 : 1;
    for (let i = 0; ; i++) {
      const ctl = new AbortController();
      let agotado = false;
      const t = setTimeout(() => { agotado = true; ctl.abort(); }, LIMITE_MS(url));
      if (init.signal) { if (init.signal.aborted) ctl.abort(); else init.signal.addEventListener('abort', () => ctl.abort(), { once: true }); }
      try { return await fetch(input, Object.assign({}, init, { signal: ctl.signal })); }
      catch (e) {
        if (i + 1 >= intentos) throw agotado ? new Error('Tiempo de espera agotado') : e;
        await new Promise(r => setTimeout(r, 1500));
      } finally { clearTimeout(t); }
    }
  }

  const sb = window.supabase.createClient(URL_PROYECTO, CLAVE_PUBLICA, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: { fetch: fetchConLimite }
  });

  // v0.17: Supabase entrega máximo 1,000 renglones por consulta; esto pide de 1,000 en 1,000 hasta traer todo.
  // hacer = () => consulta nueva (con un orden estable, p. ej. terminando en .order('id')). Devuelve { data, error } como una consulta normal.
  async function todo(hacer, paso = 1000) {
    const out = [];
    for (let i = 0; ; i += paso) {
      const r = await hacer().range(i, i + paso - 1);
      if (r.error) return { data: null, error: r.error };
      const filas = r.data || [];
      out.push(...filas);
      if (filas.length < paso) return { data: out, error: null };
    }
  }
  // ¿El error es de la red (sin señal, servidor que no responde) y no de permisos?
  const esDeRed = err => !navigator.onLine || /failed to fetch|network|load failed|tiempo de espera|aborterror|timeout|fetch|señal|sin conexión/i.test(String((err && (err.message || err)) || ''));

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let perfil = null;
  const perfiles = new Map();

  // Mensajes de Supabase en lenguaje de la oficina
  function traducir(err) {
    const m = String((err && (err.message || err.error_description || err)) || '');
    if (/galitha/i.test(m)) return m;                         // mensajes propios (candado de invitaciones, triggers)
    // v0.17: sesión vencida a media acción, señal débil y choques conocidos de la base, en palabras de la oficina
    if (/jwt/i.test(m)) return 'Tu sesión se renovó; vuelve a intentarlo.';
    if (/tiempo de espera|aborterror|timed? ?out/i.test(m)) return 'La señal está muy débil o el servidor no respondió. Vuelve a intentarlo.';
    if (/requisiciones_una_ordinaria/.test(m)) return 'Ya hay una requisición ordinaria de esta obra en esa semana. Lo que falte va en una extraordinaria.';
    if (/colados_folio/.test(m)) return 'Ya existe un colado con ese folio en la obra.';
    if (/factura_uuid_unico/.test(m)) return 'Esa factura (mismo UUID) ya está registrada en otra compra.';
    if (/compra_partidas_pkey/.test(m)) return 'Alguno de esos materiales ya está en otra compra. Recarga la página.';
    if (/caja_chica_partida_id_key/.test(m)) return 'Ese material ya está en caja chica. Recarga la página.';
    if (/pn_materiales_partida_id_key/.test(m)) return 'Ese material ya está en pago por notas. Recarga la página.';
    if (/pases_lista_obra_fecha/.test(m)) return 'Ya se pasó lista hoy en esta obra.';
    if (/duplicate key/i.test(m)) return 'Ese registro ya existe (quizá ya se había guardado). Recarga la página para verlo.';
    if (/violates foreign key/i.test(m)) return 'Está ligado a otros datos y no se puede quitar.';
    if (/row-level security|permission denied/i.test(m)) return 'Tu rol no tiene permiso para esta acción.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Se pidieron demasiados accesos seguidos. Espera unos minutos y vuelve a intentarlo.';
    if (/expired|invalid.*(otp|token)|token.*invalid/i.test(m)) return 'El código o la liga ya venció o no es correcto. Pide uno nuevo.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Sin conexión con el servidor. Revisa tu internet.';
    if (/signups not allowed|not allowed for otp/i.test(m)) return 'Este correo no tiene acceso a la plataforma. Pide una invitación al administrador.';
    return m || 'Ocurrió un error inesperado.';
  }

  async function cargarPerfiles() {
    const { data, error } = await sb.from('perfiles').select('id, nombre, correo, rol, activo, telefono');
    if (error) throw error;
    perfiles.clear();
    data.forEach(p => perfiles.set(p.id, p));
  }

  // Quita de la dirección los datos que deja Supabase al volver de la liga (?code=…, #error=…)
  function limpiarUrl() {
    const q = new URLSearchParams(location.search);
    const h = location.hash;
    const errorUrl = q.get('error_description') || (/[#&]error_description=([^&]+)/.exec(h) || [])[1];
    if (q.has('code') || q.has('error') || /^#(access_token|error)=/.test(h)) {
      history.replaceState(null, '', location.pathname + (/^#\//.test(h) ? h : '#/'));
    }
    return errorUrl ? decodeURIComponent(errorUrl.replace(/\+/g, ' ')) : '';
  }

  /* ---------- Pantalla de acceso ---------- */
  const MARCA = `<svg viewBox="0 0 190 190" fill="currentColor" aria-hidden="true"><rect width="95" height="24"/><rect y="35" width="95" height="24"/><rect y="71" width="95" height="24"/><path d="M0 113h78v77H47v-47H0z"/><rect y="159" width="32" height="31"/><path fill-rule="evenodd" d="M111 0h79v78h-79zM134 24v31h32V24z"/><rect x="95" y="95" width="95" height="24"/><rect x="95" y="130" width="95" height="24"/><rect x="95" y="167" width="95" height="23"/></svg>`;

  function pantallaAcceso(aviso) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.id = 'login';
      el.innerHTML = `
        <div class="lg-brand">
          <span class="lg-deco">${MARCA}</span>
          <div class="lg-mark">${MARCA}</div>
          <div>
            <p class="lg-eyebrow">Galitha · Plataforma interna</p>
            <h1>Proveedores,<br>requisiciones<br>y compras</h1>
          </div>
        </div>
        <div class="lg-side">
          <form class="lg-card" novalidate></form>
        </div>`;
      document.body.appendChild(el);
      document.body.classList.add('login-open');
      const card = el.querySelector('form');
      let correo = '';
      let espera = 0, reloj = null;

      const archivo = location.protocol === 'file:'
        ? '<p class="lg-note">Abriste la app desde un archivo de tu computadora. La <b>liga</b> del correo no puede regresar aquí; usa el <b>código</b>, o entra desde la dirección de GitHub Pages.</p>'
        : '';

      const pasoCorreo = msg => {
        card.innerHTML = `
          <h2>Iniciar sesión</h2>
          <p class="lg-sub">Escribe tu correo de Galitha. Te enviaremos un acceso; no necesitas contraseña.</p>
          <label class="fld"><span class="fld-l">Correo</span>
            <input class="in" name="correo" type="email" inputmode="email" autocomplete="email" value="${esc(correo)}" placeholder="nombre@galitha.com" required></label>
          <p class="lg-err" role="alert">${esc(msg || '')}</p>
          <button class="btn btn--solid lg-go" type="submit"><span>Enviarme acceso</span></button>
          ${archivo}`;
        card.dataset.paso = 'correo';
        setTimeout(() => card.querySelector('input').focus(), 50);
      };

      const pasoCodigo = msg => {
        card.innerHTML = `
          <h2>Revisa tu correo</h2>
          <p class="lg-sub">Enviamos un acceso a <b>${esc(correo)}</b>. <b>Abre la liga</b> desde este mismo navegador, o escribe aquí el <b>código</b> si el correo lo trae.</p>
          <label class="fld"><span class="fld-l">Código</span>
            <input class="in lg-code" name="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="000000"></label>
          <p class="lg-err" role="alert">${esc(msg || '')}</p>
          <button class="btn btn--solid lg-go" type="submit"><span>Entrar</span></button>
          <div class="lg-links">
            <button type="button" class="link-u" data-lg="otro">Usar otro correo</button>
            <button type="button" class="link-u" data-lg="reenviar" disabled>Reenviar</button>
          </div>
          <p class="lg-note">Si no llega en un par de minutos, revisa la carpeta de spam.</p>`;
        card.dataset.paso = 'codigo';
        const re = card.querySelector('[data-lg="reenviar"]');
        espera = 60; clearInterval(reloj);
        const tic = () => {
          re.disabled = espera > 0;
          re.textContent = espera > 0 ? `Reenviar (${espera} s)` : 'Reenviar';
          if (espera-- <= 0) clearInterval(reloj);
        };
        tic(); reloj = setInterval(tic, 1000);
        setTimeout(() => card.querySelector('input').focus(), 50);
      };

      const ocupado = (on, txt) => {
        const b = card.querySelector('.lg-go');
        if (!b) return;
        b.disabled = on;
        if (txt) b.querySelector('span').textContent = txt;
      };
      const error = msg => { const e = card.querySelector('.lg-err'); if (e) e.textContent = msg; };

      async function enviar() {
        const { error: err } = await sb.auth.signInWithOtp({
          email: correo,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: location.protocol === 'file:' ? undefined : location.origin + location.pathname
          }
        });
        if (err) throw err;
      }

      card.addEventListener('submit', async e => {
        e.preventDefault();
        if (card.dataset.paso === 'correo') {
          correo = card.querySelector('[name="correo"]').value.trim().toLowerCase();
          if (!MAIL_RE.test(correo)) { error('Escribe un correo válido.'); return; }
          ocupado(true, 'Enviando…');
          try { await enviar(); pasoCodigo(); }
          catch (err) { ocupado(false, 'Enviarme acceso'); error(traducir(err)); }
        } else {
          const token = card.querySelector('[name="codigo"]').value.replace(/\D/g, '');
          if (token.length < 6) { error('El código tiene 6 dígitos.'); return; }
          ocupado(true, 'Revisando…');
          const { error: err } = await sb.auth.verifyOtp({ email: correo, token, type: 'email' });
          if (err) { ocupado(false, 'Entrar'); error(traducir(err)); }
          // si todo sale bien, onAuthStateChange cierra la pantalla
        }
      });
      card.addEventListener('click', async e => {
        const b = e.target.closest('[data-lg]'); if (!b) return;
        if (b.dataset.lg === 'otro') { clearInterval(reloj); pasoCorreo(); }
        if (b.dataset.lg === 'reenviar') {
          try { await enviar(); pasoCodigo('Te enviamos un acceso nuevo.'); }
          catch (err) { error(traducir(err)); }
        }
      });

      // La sesión puede llegar por el código (aquí) o por la liga abierta en otra pestaña del mismo navegador
      const { data: { subscription } } = sb.auth.onAuthStateChange((ev, session) => {
        if (ev === 'SIGNED_IN' && session) {
          subscription.unsubscribe();
          clearInterval(reloj);
          resolve(session);
        }
      });

      pasoCorreo(aviso);
    });
  }

  function cerrarAcceso() {
    const el = document.getElementById('login');
    if (!el) return;
    document.body.classList.remove('login-open');
    el.classList.add('done');
    setTimeout(() => el.remove(), 900);
  }

  /* ---------- Arranque ---------- */
  async function iniciar() {
    const errorUrl = limpiarUrl();
    let { data: { session } } = await sb.auth.getSession();
    limpiarUrl();
    let aviso = errorUrl ? traducir(errorUrl) : '';

    for (;;) {
      if (!session) session = await pantallaAcceso(aviso);
      const { data, error } = await sb.rpc('mi_perfil');
      // v0.17: sin señal NO se cierra la sesión (si no, había que pedir otro código por correo); se ofrece reintentar
      if (error && esDeRed(error)) { await pantallaSinRed(); continue; }
      if (error) { aviso = traducir(error); await sb.auth.signOut(); session = null; continue; }
      if (!data || !data.id || !data.activo) {
        aviso = `El correo ${session.user.email} no tiene acceso a la plataforma. Pide una invitación al administrador.`;
        await sb.auth.signOut(); session = null; continue;
      }
      perfil = data;
      break;
    }
    try { await cargarPerfiles(); } catch { perfiles.set(perfil.id, perfil); }
    cerrarAcceso();

    // Si la sesión se cierra (en esta u otra pestaña, o no se pudo renovar), se avisa antes de volver a la pantalla de acceso
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') sesionCerrada(); });
    return perfil;
  }

  // v0.17: pantalla "Sin conexión" al abrir la app (conserva la sesión); sigue sola cuando regresa la señal
  function pantallaSinRed() {
    return new Promise(resolve => {
      document.getElementById('login')?.remove();
      const el = document.createElement('div');
      el.id = 'login';
      el.innerHTML = `
        <div class="lg-brand"><span class="lg-deco">${MARCA}</span><div class="lg-mark">${MARCA}</div>
          <div><p class="lg-eyebrow">Galitha · Plataforma interna</p><h1>Sin conexión</h1></div></div>
        <div class="lg-side"><form class="lg-card" novalidate>
          <h2>No hay conexión con el servidor</h2>
          <p class="lg-sub">Revisa la señal o el wifi. <b>Tu sesión sigue abierta</b>: no necesitas otro código.</p>
          <button class="btn btn--solid lg-go" type="submit"><span>Reintentar</span></button>
        </form></div>`;
      document.body.appendChild(el);
      document.body.classList.add('login-open');
      const listo = () => { window.removeEventListener('online', listo); el.remove(); document.body.classList.remove('login-open'); resolve(); };
      el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); listo(); });
      window.addEventListener('online', listo);
    });
  }

  // v0.17: la sesión se cerró sin que la persona lo pidiera: se avisa en vez de recargar de golpe (podía perder lo capturado)
  let saliendo = false;
  function sesionCerrada() {
    if (saliendo) { location.reload(); return; }
    if (document.getElementById('sesion-cerrada')) return;
    const el = document.createElement('div');
    el.id = 'sesion-cerrada';
    el.setAttribute('role', 'alertdialog');
    el.style.cssText = 'position:fixed;inset:0;z-index:400;display:grid;place-items:center;padding:16px;background:rgba(11,28,74,.55)';
    el.innerHTML = `<div style="max-width:420px;background:#fff;color:#101530;border-radius:24px;padding:26px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25)">
      <h2 style="margin:0 0 8px;font-size:20px">Tu sesión se cerró</h2>
      <p style="margin:0 0 18px;line-height:1.5">Puede ser que se cerró en otra pestaña o que pasó mucho tiempo sin conexión. Si estabas capturando algo, cópialo antes de continuar; después tendrás que entrar otra vez.</p>
      <button class="btn btn--solid" type="button"><span>Entrar otra vez</span></button></div>`;
    el.querySelector('button').addEventListener('click', () => location.reload());
    document.body.appendChild(el);
  }

  window.Nube = {
    sb, ROLES, traducir, iniciar, todo, esDeRed,
    get perfil() { return perfil; },
    puede(accion) { return !!perfil && (PERMISOS[accion] || []).includes(perfil.rol); },
    nombreDe(id) { const p = id && perfiles.get(id); return p ? (p.nombre || p.correo) : ''; },
    perfiles: () => [...perfiles.values()],
    async recargarPerfiles() { try { await cargarPerfiles(); } catch { /* se queda con la lista anterior */ } },
    async salir() { saliendo = true; await sb.auth.signOut(); location.reload(); }
  };
})();
