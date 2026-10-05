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
    residente: 'Residente de obra'
  };
  // Qué puede hacer cada rol en la interfaz (la base de datos lo vuelve a revisar)
  const PERMISOS = {
    directorio: ['direccion', 'admin', 'compras'],        // crear y editar proveedores, contactos y listas
    borrarProveedor: ['direccion', 'admin'],
    restaurar: ['direccion', 'admin'],                     // importar respaldos
    usuarios: ['direccion', 'admin']
  };

  const sb = window.supabase.createClient(URL_PROYECTO, CLAVE_PUBLICA, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let perfil = null;
  const perfiles = new Map();

  // Mensajes de Supabase en lenguaje de la oficina
  function traducir(err) {
    const m = String((err && (err.message || err.error_description || err)) || '');
    if (/galitha/i.test(m)) return m;                         // mensajes propios (candado de invitaciones, triggers)
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

    // Si la sesión se cierra (en esta u otra pestaña), se vuelve a la pantalla de acceso
    sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.reload(); });
    return perfil;
  }

  window.Nube = {
    sb, ROLES, traducir, iniciar,
    get perfil() { return perfil; },
    puede(accion) { return !!perfil && (PERMISOS[accion] || []).includes(perfil.rol); },
    nombreDe(id) { const p = id && perfiles.get(id); return p ? (p.nombre || p.correo) : ''; },
    perfiles: () => [...perfiles.values()],
    async recargarPerfiles() { try { await cargarPerfiles(); } catch { /* se queda con la lista anterior */ } },
    async salir() { await sb.auth.signOut(); location.reload(); }
  };
})();
