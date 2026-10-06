/* =========================================================
   GALITHA · Usuarios y permisos
   Solo Dirección y el admin técnico. Se invita a una persona con
   su correo y su rol (tabla invitaciones); al entrar por primera
   vez con el código, mi_perfil() le crea su perfil. Después aquí
   se cambia su rol, su celular o se le quita el acceso.
   ========================================================= */
(window.GALITHA_MODULOS = window.GALITHA_MODULOS || []).push(api => {
  const N = window.Nube;
  const sb = () => N.sb;
  const { esc, I, toast } = api;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const esJefe = () => N.perfil && ['direccion', 'admin'].includes(N.perfil.rol);
  const ok = ({ data, error }) => { if (error) throw new Error(N.traducir(error)); return data; };

  const ROLES = [
    { id: 'direccion', puede: 'Todo. Sube los comprobantes de pago y administra usuarios y obras (cambia residentes).' },
    { id: 'admin', puede: 'Todo, igual que Dirección, y además corrige requisiciones ya enviadas o revisadas: mantenimiento y soporte de la plataforma.' },
    { id: 'compras', puede: 'Edita el directorio; ve las requisiciones revisadas; registra cotizaciones, facturas, XML y comprobantes de pago.' },
    { id: 'coordinador', puede: 'Ve todas las obras; aprueba o rechaza cada material, devuelve requisiciones y asigna suplentes.' },
    { id: 'residente', puede: 'Solo su obra (o la que cubre como suplente): arma y envía requisiciones y sube la remisión al recibir.' }
  ];
  const rolLabel = r => N.ROLES[r] || r;
  const fecha = s => { const d = s ? new Date(s) : null; return d && !isNaN(d) ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };

  let PERFILES = [], INVITACIONES = [], OBRAS = [];
  async function cargar() {
    const [p, i, o] = await Promise.all([
      sb().from('perfiles').select('*').order('nombre'),
      sb().from('invitaciones').select('*').order('creada_en', { ascending: false }),
      sb().from('obras').select('id, nombre, residente_id, estatus')
    ]);
    PERFILES = ok(p); INVITACIONES = ok(i); OBRAS = ok(o);
  }
  const obrasDe = id => OBRAS.filter(o => o.residente_id === id && o.estatus !== 'cerrada').map(o => o.nombre);

  async function pageUsuarios() {
    if (!esJefe()) {
      return { title: 'Usuarios', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">Sin acceso</h2><p class="muted">Solo Dirección y el admin técnico administran los usuarios.</p><a class="btn" href="#/"><span>Volver</span>${api.ARR}</a></div></section>` };
    }
    await api.refresh();
    try { await cargar(); } catch (e) { toast(e.message); }
    const conPerfil = new Set(PERFILES.map(p => p.correo.toLowerCase()));
    const pendientes = INVITACIONES.filter(i => !conPerfil.has(i.correo));
    const activos = PERFILES.filter(p => p.activo), inactivos = PERFILES.filter(p => !p.activo);
    const cuenta = r => activos.filter(p => p.rol === r).length;

    const fila = (p, i) => {
      const obras = obrasDe(p.id), yo = p.id === N.perfil.id;
      return `<tr class="row rv${p.activo ? '' : ' is-off'}" style="--d:${Math.min(i, 14) * 30}" data-perfil="${esc(p.id)}" tabindex="0">
        <td class="pl"><div class="u-who"><span class="p-av">${esc(api.iniciales(p.nombre || p.correo))}</span><div><b>${esc(p.nombre || 'Sin nombre')}${yo ? ' <span class="muted">· tú</span>' : ''}</b><small>${esc(p.correo)}</small></div></div></td>
        <td><span class="tagx tagx--rol r-${esc(p.rol)}">${esc(rolLabel(p.rol))}</span></td>
        <td class="small">${obras.length ? esc(obras.join(', ')) : '<span class="muted">—</span>'}</td>
        <td class="mono small">${esc(p.telefono || '—')}</td>
        <td>${p.activo ? '<span class="tag tag--activo"><i></i>Activo</span>' : '<span class="tag tag--off"><i></i>Sin acceso</span>'}</td>
        <td class="pr small muted">${esc(fecha(p.creado_en))}</td>
      </tr>`;
    };

    return {
      title: 'Usuarios',
      html: `<section class="page">
        <header class="page-head rv"><div><p class="eyebrow">Configuración · solo Dirección y admin técnico</p><h1 class="title">Usuarios y permisos</h1></div></header>
        <div class="note note--info rv" style="--d:60">${I.shield}<p><b>Cómo entra alguien nuevo:</b> invítalo con su correo y su rol. Luego entra a la plataforma, escribe ese correo y recibe un código de 6 dígitos. Solo entran los correos invitados. Para quitarle el acceso a alguien, edítalo y desactívalo; su historial se conserva.</p></div>

        <div class="u-stats rv" style="--d:100">${ROLES.map(r => `<div><small>${esc(rolLabel(r.id))}</small><b>${cuenta(r.id)}</b></div>`).join('')}</div>

        ${pendientes.length ? `<section class="panel rv" style="--d:140">
          <header class="panel-h"><h2>Invitados que aún no entran <span class="n">${pendientes.length}</span></h2></header>
          <div class="panel-b panel-b--flush"><div class="tablewrap"><table class="tbl">
            <thead><tr><th class="pl">Persona</th><th>Rol</th><th>Celular</th><th>Invitado</th><th class="pr"></th></tr></thead>
            <tbody>${pendientes.map(i => `<tr class="row" data-inv="${esc(i.correo)}" tabindex="0">
              <td class="pl"><div class="u-who"><span class="p-av u-pend">${I.mail}</span><div><b>${esc(i.nombre || 'Sin nombre')}</b><small>${esc(i.correo)}</small></div></div></td>
              <td><span class="tagx tagx--rol r-${esc(i.rol)}">${esc(rolLabel(i.rol))}</span></td>
              <td class="mono small">${esc(i.telefono || '—')}</td>
              <td class="small muted">${esc(fecha(i.creada_en))}</td>
              <td class="pr"><button type="button" class="ibtn" data-cancelar="${esc(i.correo)}" title="Cancelar invitación" aria-label="Cancelar invitación de ${esc(i.correo)}">${I.trash}</button></td>
            </tr>`).join('')}</tbody>
          </table></div></div>
        </section>` : ''}

        <section class="panel rv" style="--d:180">
          <header class="panel-h"><h2>Con acceso <span class="n">${activos.length}</span></h2><button class="tbtn tbtn--sm" type="button" data-act="invitar">${I.plus}<span>Invitar</span></button></header>
          <div class="panel-b panel-b--flush"><div class="tablewrap"><table class="tbl">
            <thead><tr><th class="pl">Persona</th><th>Rol</th><th>Residente de</th><th>Celular</th><th>Estado</th><th class="pr">Desde</th></tr></thead>
            <tbody>${activos.map(fila).join('') || '<tr><td colspan="6" class="pl muted">Nadie todavía.</td></tr>'}</tbody>
          </table></div></div>
        </section>

        ${inactivos.length ? `<section class="panel rv" style="--d:220">
          <header class="panel-h"><h2>Sin acceso <span class="n">${inactivos.length}</span></h2></header>
          <div class="panel-b panel-b--flush"><div class="tablewrap"><table class="tbl"><tbody>${inactivos.map(fila).join('')}</tbody></table></div></div>
        </section>` : ''}

        <section class="panel rv" style="--d:260">
          <header class="panel-h"><h2>Qué puede hacer cada rol</h2></header>
          <div class="panel-b"><dl class="dl u-roles">${ROLES.map(r => `<div><dt>${esc(rolLabel(r.id))}</dt><dd>${esc(r.puede)}</dd></div>`).join('')}</dl>
          <p class="muted small">Estas reglas las revisa el servidor: aunque alguien manipule la página, no puede hacer lo que su rol no permite.</p></div>
        </section>
      </section>`,
      bind(sec) {
        $$('[data-perfil]', sec).forEach(tr => {
          const abrir = () => drPerfil(PERFILES.find(p => p.id === tr.dataset.perfil));
          tr.addEventListener('click', abrir);
          tr.addEventListener('keydown', e => { if (e.key === 'Enter') abrir(); });
        });
        $$('[data-inv]', sec).forEach(tr => tr.addEventListener('click', e => {
          if (e.target.closest('[data-cancelar]')) return;
          drInvitar(INVITACIONES.find(i => i.correo === tr.dataset.inv));
        }));
        $$('[data-cancelar]', sec).forEach(b => b.addEventListener('click', async () => {
          if (!(await api.confirmar({ titulo: 'Cancelar invitación', texto: `<b>${esc(b.dataset.cancelar)}</b> ya no podrá entrar a la plataforma.`, ok: 'Cancelar invitación', peligro: true }))) return;
          try { ok(await sb().from('invitaciones').delete().eq('correo', b.dataset.cancelar).select('correo')); toast('Invitación cancelada.'); api.rerender(); }
          catch (e) { toast(e.message); }
        }));
      }
    };
  }

  const drHead = (sub, title) => `<header class="dr-h"><div><p class="mono">${sub}</p><h2 id="dr-title">${title}</h2></div><button type="button" class="ibtn" data-close aria-label="Cerrar">${I.close}</button></header>`;
  const drFoot = okLabel => `<footer class="dr-f"><p class="dr-err" role="alert" data-err></p><button type="button" class="btn" data-close><span>Cancelar</span></button><button type="submit" class="btn btn--solid" data-ok>${I.check || ''}<span>${okLabel}</span></button></footer>`;
  const rolesSel = (cur, disabled) => `<div class="u-rolsel" role="radiogroup">${ROLES.map(r => `
    <label class="u-rol"><input type="radio" name="rol" value="${r.id}"${r.id === cur ? ' checked' : ''}${disabled ? ' disabled' : ''}><span><b>${esc(rolLabel(r.id))}</b><small>${esc(r.puede)}</small></span></label>`).join('')}</div>`;

  // Invitar (o editar una invitación pendiente)
  function drInvitar(inv) {
    const editar = !!inv, x = inv || { correo: '', nombre: '', rol: 'residente', telefono: '' };
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead('Usuarios', editar ? 'Editar invitación' : 'Invitar usuario')}
      <div class="dr-b">
        <fieldset class="fs"><legend><span class="mono">1</span>Persona</legend><div class="fs-b"><div class="grid2">
          <label class="fld fld--wide"><span class="fld-l">Correo <em>*</em></span><input class="in" name="correo" type="email" value="${esc(x.correo)}" placeholder="nombre@galitha.com" autocomplete="off"${editar ? ' disabled' : ''}>
            <span class="fld-h">De preferencia el de Galitha. A este correo le llegará el código para entrar.</span></label>
          <label class="fld"><span class="fld-l">Nombre <em>*</em></span><input class="in" name="nombre" value="${esc(x.nombre)}" placeholder="Ing. Carlos Vega" autocomplete="off"></label>
          <label class="fld"><span class="fld-l">Celular</span><input class="in" name="telefono" type="tel" value="${esc(x.telefono)}" placeholder="55 1234 5678"><span class="fld-h">Para avisos por WhatsApp.</span></label>
        </div></div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Rol</legend><div class="fs-b">${rolesSel(x.rol)}</div></fieldset>
        ${editar ? '' : '<p class="fld-h">Después de invitarlo, avísale que entre a la plataforma con ese correo. Si es residente, asígnale su obra en <b>Obras</b>.</p>'}
      </div>
      ${drFoot(editar ? 'Guardar' : 'Invitar')}
    </form>`, {}, panel => {
      const f = $('form', panel), err = $('[data-err]', panel);
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const correo = (editar ? x.correo : f.correo.value).trim().toLowerCase(), nombre = f.nombre.value.trim(), rol = (f.querySelector('[name="rol"]:checked') || {}).value;
        if (!MAIL_RE.test(correo)) { err.textContent = 'Escribe un correo válido.'; f.correo.classList.add('invalid'); return; }
        if (!nombre) { err.textContent = 'Escribe el nombre.'; f.nombre.classList.add('invalid'); return; }
        if (!editar && PERFILES.some(p => p.correo.toLowerCase() === correo)) { err.textContent = 'Esa persona ya tiene acceso. Búscala en la lista para cambiar su rol.'; return; }
        if (!editar && INVITACIONES.some(i => i.correo === correo)) { err.textContent = 'Ese correo ya está invitado.'; return; }
        const fila = { nombre, rol, telefono: f.telefono.value.trim() };
        try {
          if (editar) ok(await sb().from('invitaciones').update(fila).eq('correo', correo).select('correo'));
          else ok(await sb().from('invitaciones').insert(Object.assign({ correo }, fila)).select('correo'));
        } catch (x2) { err.textContent = x2.message; return; }
        api.closeDrawer(true);
        toast(editar ? 'Invitación actualizada.' : `Listo: ${nombre} ya puede entrar con ${correo}.`);
        api.rerender();
      });
    });
  }

  // Editar a alguien que ya entró: nombre, rol, celular y acceso
  function drPerfil(p) {
    if (!p) return;
    const yo = p.id === N.perfil.id;
    const obras = obrasDe(p.id);
    api.openPanel(`<form class="dr-form" novalidate>
      ${drHead(esc(p.correo), esc(p.nombre || 'Usuario'))}
      <div class="dr-b">
        <fieldset class="fs"><legend><span class="mono">1</span>Persona</legend><div class="fs-b"><div class="grid2">
          <label class="fld"><span class="fld-l">Nombre <em>*</em></span><input class="in" name="nombre" value="${esc(p.nombre)}"></label>
          <label class="fld"><span class="fld-l">Celular</span><input class="in" name="telefono" type="tel" value="${esc(p.telefono)}" placeholder="55 1234 5678"><span class="fld-h">Para avisos por WhatsApp.</span></label>
        </div></div></fieldset>
        <fieldset class="fs"><legend><span class="mono">2</span>Rol</legend><div class="fs-b">
          ${yo ? '<p class="fld-h">No puedes cambiar tu propio rol ni quitarte el acceso; pídeselo a otra persona de Dirección.</p>' : ''}
          ${obras.length && p.rol === 'residente' ? `<p class="fld-h">Es residente titular de: <b>${esc(obras.join(', '))}</b>. Si le cambias el rol, reasigna esas obras.</p>` : ''}
          ${rolesSel(p.rol, yo)}
        </div></fieldset>
        <fieldset class="fs"><legend><span class="mono">3</span>Acceso</legend><div class="fs-b">
          <label class="chk chk--pill"><input type="checkbox" name="activo"${p.activo ? ' checked' : ''}${yo ? ' disabled' : ''}><span>Puede entrar a la plataforma</span></label>
          <p class="fld-h">Si lo desactivas, ya no podrá ver ni cambiar nada desde ningún dispositivo. Su nombre se conserva en el historial.</p>
        </div></fieldset>
      </div>
      ${drFoot('Guardar')}
    </form>`, {}, panel => {
      const f = $('form', panel), err = $('[data-err]', panel);
      f.addEventListener('input', api.markDirty);
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const nombre = f.nombre.value.trim();
        if (!nombre) { err.textContent = 'Escribe el nombre.'; return; }
        const fila = { nombre, telefono: f.telefono.value.trim() };
        if (!yo) { fila.rol = (f.querySelector('[name="rol"]:checked') || {}).value || p.rol; fila.activo = f.activo.checked; }
        if (!yo && p.activo && !fila.activo && !(await api.confirmar({ titulo: 'Quitar acceso', texto: `<b>${esc(nombre)}</b> ya no podrá entrar a la plataforma.`, ok: 'Quitar acceso', peligro: true }))) return;
        try {
          const filas = ok(await sb().from('perfiles').update(fila).eq('id', p.id).select('id'));
          if (!filas.length) throw new Error('Tu rol no puede modificar usuarios.');
        } catch (x2) { err.textContent = x2.message; return; }
        await N.recargarPerfiles();
        api.closeDrawer(true); toast('Usuario actualizado.'); api.rerender();
      });
    });
  }

  /* ---------- Bitácora (v0.8): quién hizo qué y cuándo; solo jefes ---------- */
  const TABLAS = {
    requisiciones: 'Requisición', partidas: 'Material', compras: 'Compra', compra_partidas: 'Material en compra', compra_documentos: 'Documento',
    obras: 'Obra', obra_suplentes: 'Suplente', proveedores: 'Proveedor', contactos: 'Contacto', listas: 'Lista', perfiles: 'Usuario',
    invitaciones: 'Invitación', config: 'Configuración'
  };
  const ACC = { insert: 'Agregó', update: 'Cambió', delete: 'Borró' };
  const BF = { tabla: '', quien: '' };
  const corto = v => { const t = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); return t.length > 60 ? t.slice(0, 57) + '…' : t; };
  // Nombre legible del registro (folio, insumo, nombre, proveedor…)
  const nombreReg = c => { const x = c || {}; return x.folio || x.insumo || x.nombre_comercial || x.nombre || (x.proveedor && x.proveedor.nombre) || x.tipo || x.correo || x.clave || ''; };
  const OCULTOS = ['actualizado_en', 'actualizado_por', 'revisada_por', 'suministro_por', 'subido_por', 'creada_por'];
  function detalle(b) {
    if (b.accion !== 'update') return `<span class="muted">${esc(corto(nombreReg(b.cambios)))}</span>`;
    const xs = Object.entries(b.cambios || {}).filter(([k]) => !OCULTOS.includes(k));
    return `<div class="bit-cambios">${xs.slice(0, 6).map(([k, v]) => `<div><span>${esc(k.replace(/_/g, ' '))}:</span> ${esc(corto(v.antes))} → <b>${esc(corto(v.despues))}</b></div>`).join('')}${xs.length > 6 ? `<span>y ${xs.length - 6} cambios más</span>` : ''}</div>`;
  }
  const liga = b => ({ requisiciones: '#/r/', compras: '#/c/', proveedores: '#/p/' }[b.tabla] || '') ;

  async function pageBitacora() {
    if (!esJefe()) return { title: 'Bitácora', html: `<section class="page"><div class="empty rv"><div class="empty-mark">${api.markSVG()}</div><h2 class="h2">Sin acceso</h2><p class="muted">Solo Dirección y el admin técnico consultan la bitácora.</p></div></section>` };
    await N.recargarPerfiles();
    let filas = [];
    try {
      let q = sb().from('bitacora').select('*').order('en', { ascending: false }).limit(300);
      if (BF.tabla) q = q.eq('tabla', BF.tabla);
      if (BF.quien) q = q.eq('usuario', BF.quien);
      filas = ok(await q);
    } catch (e) { toast(e.message); }
    const gente = N.perfiles().slice().sort((a, b) => (a.nombre || a.correo).localeCompare(b.nombre || b.correo, 'es'));
    const cuando = s => new Date(s).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    return {
      title: 'Bitácora',
      html: `<section class="page">
        <header class="page-head rv"><div><p class="eyebrow">Solo Dirección y admin técnico</p><h1 class="title">Bitácora</h1></div></header>
        <div class="note note--info rv" style="--d:60">${I.shield}<p>Cada cambio en la plataforma queda registrado: quién, qué y cuándo. Nadie puede editarla ni borrarla. Se muestran los últimos 300 movimientos con los filtros elegidos.</p></div>
        <div class="filterbar rv" style="--d:100">
          <label class="psel${BF.tabla ? ' on' : ''}"><span class="sr">Qué</span><select data-bf="tabla"><option value="">Todo</option>${Object.entries(TABLAS).map(([k, l]) => `<option value="${k}"${BF.tabla === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
          <label class="psel${BF.quien ? ' on' : ''}"><span class="sr">Quién</span><select data-bf="quien"><option value="">Todas las personas</option>${gente.map(g => `<option value="${esc(g.id)}"${BF.quien === g.id ? ' selected' : ''}>${esc(g.nombre || g.correo)}</option>`).join('')}</select></label>
        </div>
        <section class="panel rv" style="--d:140">
          <header class="panel-h"><h2>Movimientos <span class="n">${filas.length}</span></h2></header>
          <div class="panel-b panel-b--flush"><div class="tablewrap"><table class="tbl">
            <thead><tr><th class="pl">Cuándo</th><th>Quién</th><th>Qué</th><th class="pr">Detalle</th></tr></thead>
            <tbody>${filas.map(b => {
              const l = liga(b), id = b.registro_id;
              return `<tr>
                <td class="pl small" style="white-space:nowrap">${esc(cuando(b.en))}</td>
                <td class="small"><b>${esc(N.nombreDe(b.usuario) || b.correo || 'Sistema')}</b></td>
                <td class="small"><span class="bit-acc ${esc(b.accion)}">${esc(ACC[b.accion] || b.accion)}</span> ${esc(TABLAS[b.tabla] || b.tabla)}${l && id && b.accion !== 'delete' ? ` · <a class="link-u" href="${l}${esc(id)}">ver</a>` : ''}</td>
                <td class="pr">${detalle(b)}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="4" class="pl muted">Sin movimientos con estos filtros.</td></tr>'}</tbody>
          </table></div></div>
        </section>
      </section>`,
      bind(sec) {
        $$('[data-bf]', sec).forEach(el => el.addEventListener('change', () => { BF[el.dataset.bf] = el.value; api.rerender(); }));
      }
    };
  }

  return {
    pages: { usuarios: pageUsuarios, bitacora: pageBitacora },
    titulos: { usuarios: 'Usuarios', bitacora: 'Bitácora' },
    acciones: { usuarios: { label: 'Invitar usuario', act: 'invitar', puede: esJefe }, bitacora: { label: 'Bitácora', act: 'bitacora', puede: () => false } },
    onAct(a) { if (a === 'invitar' && esJefe()) { cargar().then(() => drInvitar(null)).catch(e => toast(e.message)); } }
  };
});
