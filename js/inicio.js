/* =========================================================
   GALITHA · Inicio y bienvenida (v0.6)
   - Página #/inicio: logo, saludo y los renders del portafolio
     de galitha.com (copias reducidas en img/obras/).
   - Bienvenida a pantalla completa: la misma vista, una vez por
     sesión del navegador (como el preloader), después de entrar.
     "Entrar a la plataforma" lleva a Obras.
   - v0.7: "Inicio" (barra lateral, menú, logo) abre esta misma
     bienvenida a pantalla completa y al entrar regresa a la página
     donde estaba. La página #/inicio con barra lateral ya no se usa.
   ========================================================= */
(window.GALITHA_MODULOS = window.GALITHA_MODULOS || []).push(api => {
  const N = window.Nube;
  const R = window.StoreReq;
  const { esc, I, ARR, markSVG, logoSVG, reduced } = api;
  const $ = (s, c = document) => c.querySelector(s);
  const pad = n => String(n).padStart(2, '0');

  // Portafolio de galitha.com/portafolio: [nombre, colonia, archivo en img/obras/]
  // (Alfredo Chavero 174 no tiene render grande en la web; queda fuera)
  const P = [
    ['Eje Central 469', 'Colonia Narvarte', 'eje-central-469'],
    ['Pilares 44', 'Colonia del Valle', 'pilares-44'],
    ['Hacienda de las Palmas 1', 'Interlomas', 'hacienda-de-las-palmas-1'],
    ['Córdoba 229', 'Colonia Roma', 'cordoba-229'],
    ['Hacienda del Rocío 3', 'Interlomas', 'hacienda-del-rocio-3'],
    ['Moras 330', 'Colonia del Valle', 'moras-330'],
    ['Tlalpan 2347', 'Colonia Ciudad Jardín', 'tlalpan-2347'],
    ['Ámsterdam 291', 'Colonia Condesa', 'amsterdam-291'],
    ['San Lorenzo 260', 'Colonia del Valle', 'san-lorenzo-260'],
    ['Fco. del Paso y Troncoso 936', 'Colonia Tlazintla', 'fco-del-paso-936'],
    ['Calzada Federalismo', 'Guadalajara', 'calzada-federalismo'],
    ['Tlalpan 998', 'Colonia Nativitas', 'tlalpan-998'],
    ['Matías Romero 7', 'Colonia del Valle', 'matias-romero-7'],
    ['Thiers 121', 'Colonia Anzures', 'thiers-121'],
    ['Cda. de Progreso 7', 'Atizapán de Zaragoza', 'cda-de-progreso-7'],
    ['Tlaxcala 67', 'Colonia Roma', 'tlaxcala-67']
  ];
  const img = (i, min) => `img/obras/${P[i][2]}${min ? '-min' : ''}.jpg`;
  const DUR = 6000;   // tiempo de cada render
  const BANDS = 5;    // franjas con que entra cada render (como la cortina)
  const VISTO = 'galitha.bienvenida';

  I.home = api.ico('<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>');

  /* ---------- Contenido (compartido por la página y la bienvenida) ---------- */
  async function cifras() {
    let obras = 0;
    if (!api.proveedores().length) { try { await api.refresh(); } catch { /* sin conexión */ } }
    try {
      let D = R.snapshot();
      if (!D.obras.length) D = await R.cargar();
      obras = D.obras.filter(o => o.estatus !== 'cerrada').length;
    } catch { /* sin conexión: se muestra 0 */ }
    return { proyectos: P.length, obras, proveedores: api.proveedores().length };
  }

  function saludo() {
    const d = new Date(), h = d.getHours();
    const f = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    return (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches') + ' · ' + f;
  }

  function weHTML(c, { overlay }) {
    // Primer nombre, sin el título ("Arq. Paola Ruiz" → "Paola")
    const nombre = N.perfil ? (N.perfil.nombre ? api.sinTitulo(N.perfil.nombre) : (N.perfil.correo || '')).split(/[\s@]/)[0] : '';
    const btn = overlay
      ? `<button class="btn btn--solid" type="button" data-we-entrar>Entrar a la plataforma ${ARR}</button>`
      : `<a class="btn btn--solid" href="#/obras">Ir a obras ${ARR}</a>`;
    return `
      <div class="we-card">
        <div class="we-logo we-fx" style="--d:0">${logoSVG()}</div>
        <p class="we-app we-fx" style="--d:120">Plataforma interna</p>
        <div class="we-mid">
          <p class="we-hola we-fx" style="--d:250">${esc(saludo())}</p>
          <h1 class="we-h">
            <span><i style="transition-delay:.3s">Diseñamos y</i></span>
            <span><i style="transition-delay:.4s">construimos</i></span>
            <span><i style="transition-delay:.5s"><em>en equipo.</em></i></span>
          </h1>
          <p class="we-p we-fx" style="--d:700">Obras, requisiciones, compras y proveedores de Galitha, en un solo lugar.</p>
          <div class="we-cta we-fx" style="--d:850">${btn}</div>
          <div class="we-stats we-fx" style="--d:1000">
            <div><b data-cnt="${c.proyectos}">0</b><small>Proyectos</small></div>
            <div><b data-cnt="${c.obras}">0</b><small>${c.obras === 1 ? 'Obra activa' : 'Obras activas'}</small></div>
            <div><b data-cnt="${c.proveedores}">0</b><small>Proveedores</small></div>
          </div>
        </div>
        <div class="we-foot we-fx" style="--d:1100"><span>${nombre ? 'Hola, ' + esc(nombre) : ''}</span><span>v0.13 · en línea</span></div>
        <div class="we-ghost">${markSVG()}</div>
      </div>
      <div class="we-stage">
        <div class="we-top">
          <div class="we-nav">
            <button type="button" data-we-dir="-1" aria-label="Render anterior">${I.back}</button>
            <button type="button" data-we-dir="1" aria-label="Render siguiente">${I.arrow}</button>
          </div>
        </div>
        <div class="we-cap">
          <div>
            <div class="we-num"><b data-we-i>01</b> / ${pad(P.length)}</div>
            <p class="we-name"><span data-we-name></span></p>
            <p class="we-col"><span data-we-col></span></p>
          </div>
          <div class="we-thumbs"></div>
        </div>
      </div>`;
  }

  /* ---------- Carrusel de renders + entrada escalonada ---------- */
  function montar(root) {
    const stage = $('.we-stage', root), cap = $('.we-cap', stage), thumbs = $('.we-thumbs', stage);
    let cur = 0, timer = null, vivo = true;
    thumbs.style.setProperty('--dur', DUR + 'ms');

    const pintaThumbs = () => {
      const out = [];
      for (let k = -1; k <= 4; k++) out.push((cur + k + P.length) % P.length);
      thumbs.innerHTML = out.map(i => `<button type="button" data-we-go="${i}" class="${i === cur ? 'on' : ''}" aria-label="${esc(P[i][0])}"><img src="${img(i, true)}" alt=""></button>`).join('');
    };
    const mostrar = (i, primera) => {
      if (!vivo || !root.isConnected) return parar();
      cur = (i + P.length) % P.length;
      const s = document.createElement('div');
      s.className = 'we-slide';
      s.innerHTML = Array.from({ length: BANDS }, (_, k) =>
        `<i style="--k:${k};--t:${k * 100 / BANDS}%;--b:${100 - (k + 1) * 100 / BANDS}%"><img src="${img(cur)}" alt=""></i>`).join('');
      stage.insertBefore(s, $('.we-top', stage));
      cap.classList.add('swap');
      const n = cur;
      const im = $('img', s);
      // Entra cuando el render ya está cargado, para que no aparezca una franja vacía
      (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => {
        if (n !== cur) return s.remove();
        $('[data-we-i]', cap).textContent = pad(cur + 1);
        $('[data-we-name]', cap).textContent = P[cur][0];
        $('[data-we-col]', cap).textContent = P[cur][1];
        setTimeout(() => cap.classList.remove('swap'), primera ? 0 : 60);
        void s.offsetWidth;   // fija el estado inicial para que la transición corra
        s.classList.add('show');
        const viejas = [...stage.querySelectorAll('.we-slide')].filter(x => x !== s);
        setTimeout(() => viejas.forEach(v => v.remove()), 1500);
        pintaThumbs();
        new Image().src = img((cur + 1) % P.length);  // precarga el siguiente
        clearTimeout(timer);
        timer = setTimeout(() => mostrar(cur + 1), DUR);
      });
    };
    stage.addEventListener('click', e => {
      const b = e.target.closest('[data-we-dir]'); if (b) return mostrar(cur + +b.dataset.weDir);
      const t = e.target.closest('[data-we-go]'); if (t) mostrar(+t.dataset.weGo);
    });
    const contar = () => root.querySelectorAll('[data-cnt]').forEach(el => {
      const n = +el.dataset.cnt, t0 = performance.now();
      if (reduced) { el.textContent = n; return; }
      const step = t => { const k = Math.min(1, (t - t0) / 1200); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    function parar() { vivo = false; clearTimeout(timer); }
    function arrancar() {
      root.classList.add('go');
      mostrar(0, true);
      setTimeout(contar, reduced ? 0 : 900);
    }
    return { arrancar, parar };
  }

  /* ---------- Página Inicio ---------- */
  async function pageInicio() {
    await api.refresh();
    const c = await cifras();
    return {
      title: 'Inicio',
      html: `<section class="page page--inicio"><div class="we we--page">${weHTML(c, { overlay: false })}</div></section>`,
      bind(section) {
        const root = $('.we', section);
        // espera a que termine la cortina para que la entrada se vea
        setTimeout(() => montar(root).arrancar(), 60);
      }
    };
  }

  /* ---------- Bienvenida a pantalla completa (una vez por sesión) ---------- */
  const leer = () => { try { return sessionStorage.getItem(VISTO) === '1'; } catch { return false; } };
  const marcar = () => { try { sessionStorage.setItem(VISTO, '1'); } catch { /* sin almacenamiento */ } };
  const pendiente = () => !leer();

  // listo: promesa que se cumple cuando ya se puede abrir (preloader terminado)
  // volver: se abrió desde "Inicio"; al entrar se queda en la página donde estaba (v0.7)
  async function bienvenida(listo, { volver = false } = {}) {
    if (document.getElementById('welcome')) return;   // ya está abierta
    marcar();
    const box = document.createElement('div');
    box.id = 'welcome';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Bienvenida a la plataforma Galitha');
    box.innerHTML = `
      <div class="we-open"><i></i><i></i><i></i><i></i><i></i><div class="curtain-mark">${markSVG()}</div></div>
      <div class="we we--full"><div class="we-wait"></div></div>`;
    document.body.appendChild(box);
    document.body.classList.add('welcome-open');
    const open = $('.we-open', box);
    if (volver && !reduced) { open.classList.add('entra'); box.classList.add('entrando'); }   // las franjas cubren la página actual

    const c = await cifras();
    $('.we--full', box).innerHTML = weHTML(c, { overlay: true });
    const root = $('.we--full', box);
    const car = montar(root);
    await listo;
    await new Promise(r => setTimeout(r, reduced ? 0 : volver ? 480 : 700));
    open.classList.remove('entra'); box.classList.remove('entrando');
    open.classList.add('out');
    car.arrancar();

    let saliendo = false;
    const entrar = () => {
      if (saliendo) return; saliendo = true;
      car.parar();
      // Una liga directa (compra, requisición, proveedor) se respeta; si no, Obras
      if (!volver && !/^#\/(c|r|p)\//.test(location.hash) && location.hash !== '#/obras') location.hash = '#/obras';
      root.classList.add('leave');
      open.classList.remove('out');
      open.querySelector('.curtain-mark').innerHTML = markSVG();
      setTimeout(() => {
        box.classList.add('bye');
        document.body.classList.remove('welcome-open');
        setTimeout(() => box.remove(), 900);
      }, reduced ? 0 : volver ? 700 : 1200);
      removeEventListener('keydown', tecla);
    };
    const tecla = e => { if (e.key === 'Escape' || e.key === 'Enter') entrar(); };
    addEventListener('keydown', tecla);
    box.addEventListener('click', e => { if (e.target.closest('[data-we-entrar]')) entrar(); });
    const b = $('[data-we-entrar]', box); if (b) b.focus({ preventScroll: true });
  }

  return {
    pages: { inicio: pageInicio },
    titulos: { inicio: 'Inicio' },
    acciones: { inicio: { label: 'Inicio', act: 'inicio', puede: () => false } },
    bienvenida: { pendiente, abrir: bienvenida }
  };
});
