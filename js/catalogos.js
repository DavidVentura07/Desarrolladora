/* =========================================================
   GALITHA · Directorio de proveedores — Catálogos
   tipos, categorias, cobertura, areas y etiquetasTel son solo
   los VALORES INICIALES de las listas editables: la primera
   vez se copian a la capa de datos y desde ahí el usuario los
   cambia en "Listas y opciones" (se guardan en el respaldo).
   Estatus y medios son fijos porque la app depende de ellos.
   ========================================================= */
window.CAT = {
  cobertura: ['CDMX', 'Estado de México'],

  tipos: [
    'Materiales',
    'Subcontratista / mano de obra',
    'Servicios profesionales',
    'Renta de maquinaria y equipo',
    'Fletes y acarreos',
    'Mobiliario y equipamiento',
    'Otro'
  ],

  categorias: [
    'Obra negra y materiales básicos',
    'Concreto premezclado',
    'Acero y estructura metálica',
    'Cimbra',
    'Demoliciones y movimiento de tierras',
    'Herrería',
    'Cancelería y vidrio',
    'Carpintería',
    'Impermeabilización',
    'Yeso y tablaroca',
    'Pintura',
    'Pisos y recubrimientos',
    'Muebles de baño y cocina',
    'Instalación eléctrica',
    'Instalación hidrosanitaria',
    'Gas',
    'Aire acondicionado y ventilación',
    'Elevadores',
    'Iluminación',
    'Jardinería y paisajismo',
    'Topografía',
    'Mecánica de suelos y laboratorio',
    'Proyecto arquitectónico',
    'Ingenierías (estructural, instalaciones)',
    'Trámites y gestoría',
    'Seguridad e higiene',
    'Limpieza de obra',
    'Renta de maquinaria',
    'Fletes'
  ],

  estatus: [
    { id: 'activo', label: 'Activo' },
    { id: 'evaluacion', label: 'En evaluación' },
    { id: 'no_recomendado', label: 'No recomendado' }
  ],

  medios: [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'correo', label: 'Correo' },
    { id: 'llamada', label: 'Llamada' }
  ],

  criterios: [
    { id: 'calidad', label: 'Calidad' },
    { id: 'puntualidad', label: 'Puntualidad' },
    { id: 'precio', label: 'Precio' }
  ],

  formasPago: ['Transferencia', 'Efectivo', 'Cheque', 'Tarjeta', 'Crédito'],

  areas: ['Ventas', 'Cobranza', 'Técnico', 'Dirección', 'Administración', 'Operación / obra'],

  etiquetasTel: ['Oficina', 'Celular', 'Directo', 'Ventas', 'Cobranza'],

  tiposArchivo: ['Catálogo', 'Cotización', 'Ficha técnica', 'Contrato', 'Documento fiscal', 'Otro'],

  /* Antigüedad sugerida de los documentos del SAT antes de pedir uno nuevo (días).
     Es una práctica común, no una regla oficial: ajústala a la política de la oficina. */
  sat: { constanciaDias: 90, opinionDias: 30 },

  /* Días sin exportar antes de que el aviso de respaldo se ponga en alerta */
  respaldoDias: 7
};
