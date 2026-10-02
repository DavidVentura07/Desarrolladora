/* =========================================================
   Datos de ejemplo para probar la página. Todos son ficticios:
   empresas, teléfonos, correos, RFC y ligas son inventados.
   Llevan la etiqueta "ejemplo" para encontrarlos y borrarlos.
   ========================================================= */
window.EJEMPLO = [
  {
    id: 'ejemplo-aceros-centro',
    nombreComercial: 'Aceros y Perfiles del Centro',
    razonSocial: 'Aceros y Perfiles del Centro, S.A. de C.V.',
    rfc: 'APC150312AB1',
    tipo: 'Materiales',
    categorias: ['Acero y estructura metálica', 'Obra negra y materiales básicos'],
    servicio: 'Varilla corrugada, malla electrosoldada, perfiles IPR y PTR. Corte y doblado en planta con entrega en obra.',
    etiquetas: ['ejemplo', 'entrega en obra'],
    cobertura: ['CDMX', 'Estado de México'],
    telefonos: [{ numero: '55 5550 0101', etiqueta: 'Oficina', whatsapp: false }],
    correo: 'ventas@aceros-ejemplo.com',
    sitioWeb: 'aceros-ejemplo.com',
    direccion: 'Av. Ejemplo 120, Col. Industrial, CDMX',
    estatus: 'activo',
    favorito: true,
    calificacion: { calidad: 5, puntualidad: 4, precio: 4 },
    condiciones: { creditoDias: 30, anticipoPct: 0, formasPago: ['Transferencia', 'Crédito'], factura: 'si', tiempoEntrega: '2 a 3 días hábiles' },
    sat: { constanciaFecha: '2026-08-10', opinionFecha: '2026-09-20', opinionResultado: 'positiva' },
    obras: ['Torre Ejemplo 01', 'Conjunto Ejemplo Norte'],
    archivos: [{ nombre: 'Catálogo de perfiles 2026', tipo: 'Catálogo', url: 'https://www.dropbox.com/scl/fi/ejemplo/catalogo-perfiles.pdf' }],
    notas: 'Piden la orden de compra por correo antes de programar entregas. Descuento por volumen arriba de 10 t.',
    contactos: [
      { nombre: 'Laura Méndez', puesto: 'Ejecutiva de ventas', area: 'Ventas', telefonos: [{ numero: '55 5550 0102', etiqueta: 'Celular', whatsapp: true }], correo: 'laura@aceros-ejemplo.com', medios: ['whatsapp', 'correo'], horario: 'L–V 9:00 a 18:00', fechaIngreso: '2026-03-04' },
      { nombre: 'Jorge Ramírez', puesto: 'Cobranza', area: 'Cobranza', telefonos: [{ numero: '55 5550 0103', etiqueta: 'Directo' }], correo: 'cobranza@aceros-ejemplo.com', medios: ['correo', 'llamada'], fechaIngreso: '2026-05-12' }
    ]
  },
  {
    id: 'ejemplo-concretos-atlas',
    nombreComercial: 'Concretos Atlas',
    razonSocial: 'Concretos Premezclados Atlas, S.A. de C.V.',
    rfc: 'CPA100820KX3',
    tipo: 'Materiales',
    categorias: ['Concreto premezclado'],
    servicio: 'Concreto premezclado f\'c 150 a 350, bombeo pluma y estacionaria.',
    etiquetas: ['ejemplo'],
    cobertura: ['Zona metropolitana'],
    telefonos: [{ numero: '55 5550 0201', etiqueta: 'Programación', whatsapp: true }],
    correo: 'programacion@concretos-ejemplo.com',
    estatus: 'activo',
    calificacion: { calidad: 4, puntualidad: 3, precio: 4 },
    condiciones: { creditoDias: 15, formasPago: ['Transferencia'], factura: 'si', tiempoEntrega: 'Programar con 48 h' },
    sat: { constanciaFecha: '2026-04-02', opinionFecha: '2026-06-15', opinionResultado: 'positiva' },
    obras: ['Torre Ejemplo 01'],
    notas: 'Confirmar colado un día antes antes de las 14:00.',
    contactos: [
      { nombre: 'Ricardo Salas', puesto: 'Asesor técnico comercial', area: 'Técnico', telefonos: [{ numero: '55 5550 0202', etiqueta: 'Celular', whatsapp: true }], medios: ['whatsapp', 'llamada'], fechaIngreso: '2026-02-18' }
    ]
  },
  {
    id: 'ejemplo-canceleria-reforma',
    nombreComercial: 'Cancelería Reforma',
    razonSocial: 'Ventanas y Cristales Reforma, S. de R.L. de C.V.',
    rfc: 'VCR180501QP7',
    tipo: 'Subcontratista / mano de obra',
    categorias: ['Cancelería y vidrio'],
    servicio: 'Fabricación e instalación de cancelería de aluminio, vidrio templado y fachadas.',
    etiquetas: ['ejemplo', 'acabados'],
    cobertura: ['CDMX'],
    telefonos: [{ numero: '55 5550 0301', etiqueta: 'Oficina' }],
    correo: 'proyectos@canceleria-ejemplo.com',
    estatus: 'evaluacion',
    calificacion: { calidad: 4, puntualidad: 0, precio: 3 },
    condiciones: { anticipoPct: 50, formasPago: ['Transferencia'], factura: 'si', tiempoEntrega: '4 a 6 semanas después de medidas' },
    notas: 'Primera cotización recibida para departamentos muestra. Pendiente visitar su taller.',
    contactos: [
      { nombre: 'Sofía Herrera', puesto: 'Coordinadora de proyectos', area: 'Técnico', telefonos: [{ numero: '55 5550 0302', etiqueta: 'Celular', whatsapp: true }], correo: 'sofia@canceleria-ejemplo.com', medios: ['correo', 'whatsapp'], fechaIngreso: '2026-09-02' }
    ]
  },
  {
    id: 'ejemplo-impermeabilizantes-valle',
    nombreComercial: 'Impermeabilizantes Técnicos del Valle',
    razonSocial: 'ITV Sistemas de Impermeabilización, S.A. de C.V.',
    rfc: 'ISI120715TT2',
    tipo: 'Subcontratista / mano de obra',
    categorias: ['Impermeabilización'],
    servicio: 'Sistemas prefabricados APP y acrílicos. Garantía por escrito de 5 a 10 años.',
    etiquetas: ['ejemplo', 'garantía'],
    telefonos: [{ numero: '55 5550 0401', etiqueta: 'Oficina' }, { numero: '55 5550 0402', etiqueta: 'Celular', whatsapp: true }],
    correo: 'contacto@itv-ejemplo.com',
    estatus: 'activo',
    calificacion: { calidad: 5, puntualidad: 5, precio: 3 },
    condiciones: { anticipoPct: 40, formasPago: ['Transferencia', 'Cheque'], factura: 'si' },
    sat: { constanciaFecha: '2026-09-01', opinionFecha: '2026-09-25', opinionResultado: 'positiva' },
    obras: ['Conjunto Ejemplo Norte', 'Casa Ejemplo Sur'],
    contactos: [
      { nombre: 'Martín Ochoa', puesto: 'Director', area: 'Dirección', telefonos: [{ numero: '55 5550 0402', etiqueta: 'Celular', whatsapp: true }], correo: 'martin@itv-ejemplo.com', medios: ['whatsapp'], fechaIngreso: '2025-11-20' }
    ]
  },
  {
    id: 'ejemplo-electricas-morales',
    nombreComercial: 'Instalaciones Eléctricas Morales',
    razonSocial: 'Andrés Morales Pineda',
    rfc: 'MOPA850101AB3',
    tipo: 'Subcontratista / mano de obra',
    categorias: ['Instalación eléctrica', 'Iluminación'],
    servicio: 'Instalación eléctrica residencial, acometidas y tableros. Trámite ante CFE.',
    etiquetas: ['ejemplo'],
    telefonos: [{ numero: '55 5550 0501', etiqueta: 'Celular', whatsapp: true }],
    estatus: 'no_recomendado',
    calificacion: { calidad: 3, puntualidad: 1, precio: 4 },
    condiciones: { anticipoPct: 60, formasPago: ['Efectivo', 'Transferencia'], factura: 'no' },
    obras: ['Casa Ejemplo Sur'],
    notas: 'Dejó la obra a medias dos semanas. No volver a contratar sin fianza.',
    contactos: [
      { nombre: 'Andrés Morales', puesto: 'Titular', area: 'Dirección', telefonos: [{ numero: '55 5550 0501', etiqueta: 'Celular', whatsapp: true }], medios: ['whatsapp', 'llamada'], fechaIngreso: '2025-06-10', activo: true }
    ]
  },
  {
    id: 'ejemplo-geosuelos',
    nombreComercial: 'GeoSuelos Laboratorio',
    razonSocial: 'GeoSuelos Ingeniería y Laboratorio, S.C.',
    rfc: 'GIL090303MN5',
    tipo: 'Servicios profesionales',
    categorias: ['Mecánica de suelos y laboratorio', 'Topografía'],
    servicio: 'Estudios de mecánica de suelos, control de calidad de concreto (cilindros) y levantamientos topográficos.',
    etiquetas: ['ejemplo'],
    cobertura: ['Centro del país'],
    telefonos: [{ numero: '222 555 0601', etiqueta: 'Oficina Puebla' }],
    correo: 'laboratorio@geosuelos-ejemplo.com',
    sitioWeb: 'https://geosuelos-ejemplo.com',
    estatus: 'activo',
    calificacion: { calidad: 4, puntualidad: 4, precio: 5 },
    condiciones: { creditoDias: 30, formasPago: ['Transferencia'], factura: 'si', tiempoEntrega: 'Reporte en 10 días hábiles' },
    sat: { constanciaFecha: '2026-01-15', opinionFecha: '2026-02-01', opinionResultado: 'positiva' },
    obras: ['Torre Ejemplo 01'],
    contactos: [
      { nombre: 'Ing. Paula Ríos', puesto: 'Gerente de laboratorio', area: 'Técnico', telefonos: [{ numero: '222 555 0602', etiqueta: 'Celular', whatsapp: true }], correo: 'paula@geosuelos-ejemplo.com', medios: ['correo'], horario: 'L–V 8:00 a 17:00', fechaIngreso: '2026-01-20' }
    ]
  }
];
