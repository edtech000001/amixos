import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { checkRequiredFields } from './draft';
import { geocodeAddress } from '../geocoding';
import { buildCrewSuggestions } from '../crewFinder';
import { fetchCrewFinderData, type CrewFinderTarget } from '../crewFinderData';
import { lineItemsHash, PAY_METHOD_KEYS, type ActionDraft, type AssistantClientAction, type AssistantContext, type JobDraft, type JobUpdateDraft, type DraftCrewMember, type InvoiceEditDraft, type InvoiceLineOp, type JobItemOp } from './types';

// Tool surface for the Ami loop. All executors run on ctx.db — the caller's
// RLS-scoped client — so cross-business access is structurally impossible.
// Definitions use strict schemas + prescriptive "call this when…" text.

// ── Definitions (fixed order — part of the cached prompt prefix) ───────────

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  // NOTE: no `strict` and no nullable type-unions — the API's schema compiler
  // caps union-typed parameters at 16 per request, which strict-nullable
  // schemas blow past. Optional = omitted from `required`; the executors and
  // buildDraft() defensively validate every input anyway.
  {
    name: 'query_jobs',
    description:
      'Busca trabajos del negocio. Devuelve total_count (el TOTAL exacto que cumple los filtros — úsalo para "¿cuántos trabajos…?") y hasta `limit` filas de detalle. Usa crew_member para filtrar por persona asignada ("¿cuántos trabajos tiene Elmer?" → crew_member="Elmer", responde con total_count). Usa created_from/created_to para "¿qué agregué ayer?" (fecha de creación) y date_from/date_to para fecha agendada. Llama con include_assignments=true y sin filtros (recientes primero) para ver la cuadrilla de los últimos trabajos cuando el usuario diga "la misma cuadrilla de siempre". Por defecto busca en TODOS (incluye archivados; cada fila trae archived). Usa archived="only" para "¿qué trabajos archivé?" o archived="exclude" para solo los activos.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'scheduled_date >= YYYY-MM-DD' },
        date_to: { type: 'string', description: 'scheduled_date <= YYYY-MM-DD' },
        created_from: { type: 'string', description: 'created_at >= YYYY-MM-DD (fecha en que se agregó)' },
        created_to: { type: 'string', description: 'created_at <= YYYY-MM-DD (inclusive)' },
        status: { type: 'string', description: 'proposal|sent|accepted|scheduled|in_progress|completed|invoiced' },
        client_id: { type: 'string' },
        search: { type: 'string', description: 'texto a buscar en el título' },
        crew_member: { type: 'string', description: 'nombre (parcial) de un empleado — solo trabajos donde está asignado en la cuadrilla; las filas incluyen la cuadrilla completa' },
        crew_lead_only: { type: 'boolean', description: 'con crew_member: solo trabajos donde esa persona es el líder' },
        include_assignments: { type: 'boolean', description: 'incluir nombres de cuadrilla/líder' },
        archived: { type: 'string', enum: ['include', 'only', 'exclude'], description: 'archivados: include (default) | only | exclude' },
        limit: { type: 'integer', description: 'máx 100, default 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_clients',
    description:
      'Busca clientes por nombre o empresa. Devuelve total_count (el total exacto — úsalo para "¿cuántos clientes tengo?"; omite search para contar todos). Llama SIEMPRE antes de proponer un trabajo con nombre de cliente; si no hay coincidencia, propone con client_resolved=false conservando client_name.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'nombre, apellido o empresa (parcial); omite para listar/contar todos' },
        limit: { type: 'integer', description: 'máx 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_employees',
    description:
      'Busca empleados (el roster ya está en el contexto; usa esto solo para refrescar o desambiguar nombres repetidos).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        limit: { type: 'integer', description: 'máx 25' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'query_timesheets',
    description:
      'Consulta registros de horas trabajadas (checadas). Usa esto para "¿trabajó X ayer?", "¿cuántas horas hizo X esta semana?".',
    input_schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'string' },
        employee_name: { type: 'string', description: 'si no tienes el id' },
        date_from: { type: 'string', description: 'work_date >= YYYY-MM-DD' },
        date_to: { type: 'string', description: 'work_date <= YYYY-MM-DD' },
        limit: { type: 'integer', description: 'máx 31' },
      },
      required: ['date_from', 'date_to'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_crew',
    description:
      'Clasifica a los empleados por CERCANÍA y DISPONIBILIDAD — la misma lógica del botón "Sugerir cuadrilla" del formulario. Úsala para "¿quién está más cerca de X?", "¿quién anda por Colorado?", "¿quién está libre el martes?". La ubicación de cada empleado se toma de su trabajo actual/más próximo con pin en el mapa, o de su casa geocodificada. Da place (ciudad, estado o dirección — se geocodifica), job_search (título parcial de un trabajo — usa su pin o el del cliente) o client_id (para un trabajo nuevo), y date para disponibilidad. Solo date = lista de todos con free_on_date. Para "líderes", filtra los resultados por el rol del roster.',
    input_schema: {
      type: 'object',
      properties: {
        place: { type: 'string', description: 'lugar libre: "Colorado", "Fort Morgan CO", una dirección' },
        job_search: { type: 'string', description: 'título (parcial) de un trabajo existente — usa sus coordenadas' },
        client_id: { type: 'string', description: 'para un trabajo NUEVO: id del cliente (de query_clients) — usa la ubicación del cliente' },
        date: { type: 'string', description: 'YYYY-MM-DD — para marcar quién está libre ese día' },
        limit: { type: 'integer', description: 'máx 25, default 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_job',
    description:
      'Genera el BORRADOR de un trabajo nuevo (o la versión corregida de un borrador pendiente). NO crea el trabajo — el usuario debe presionar Confirmar. Llama solo cuando tengas título y suficientes datos; los ids de crew/drivers deben venir del roster o de query_employees, y client_id de query_clients. Omite los campos que no apliquen.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed'] },
        priority: { type: 'string', description: 'low | normal | high | urgent' },
        scheduled_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string' },
        all_day: { type: 'boolean', description: 'default true; false solo si el usuario dio horas de inicio/fin' },
        time_start: { type: 'string', description: 'HH:MM 24h' },
        time_end: { type: 'string' },
        total_hours: { type: 'number' },
        client_id: { type: 'string' },
        client_name: { type: 'string' },
        client_resolved: { type: 'boolean' },
        crew: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              employee_id: { type: 'string' },
              worker_name: { type: 'string' },
              is_lead: { type: 'boolean' },
            },
            required: ['worker_name'],
            additionalProperties: false,
          },
        },
        driver_employee_ids: { type: 'array', items: { type: 'string' } },
        driver_hours: { type: 'number' },
        custom_fields: {
          type: 'array',
          description: 'valores de campos personalizados (field_key de las plantillas, valor como texto)',
          items: {
            type: 'object',
            properties: {
              field_key: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['field_key', 'value'],
            additionalProperties: false,
          },
        },
        internal_notes: { type: 'string' },
        worker_notes: { type: 'string' },
      },
      required: ['title', 'status', 'client_resolved'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_job',
    description:
      'Genera el BORRADOR de un CAMBIO a un trabajo EXISTENTE: renombrarlo (new_title), cambiar descripción, prioridad, cliente, horas, notas, dirección o campos personalizados, reprogramar fecha/horario, cambiar la cuadrilla, cambiar el estado o archivar/desarchivar. NO aplica el cambio — el usuario confirma (botón o "sí" por voz). Primero usa query_jobs para encontrar el job_id exacto (y query_clients para client_id). Incluye SOLO los campos que cambian; manda "" para borrar un texto. Para cambiar la cuadrilla, manda la lista COMPLETA de crew que debe quedar (reemplaza la actual); los ids deben venir del roster. Varios cambios al mismo trabajo van en UNA sola llamada.',
    input_schema: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'id exacto del trabajo (de query_jobs)' },
        new_title: { type: 'string', description: 'nuevo nombre del trabajo' },
        description: { type: 'string', description: 'nueva descripción ("" = borrar)' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
        client_id: { type: 'string', description: 'id del nuevo cliente (de query_clients); "" = quitar el cliente' },
        total_hours: { type: 'number', description: 'horas totales del trabajo' },
        internal_notes: { type: 'string', description: 'notas internas COMPLETAS como deben quedar ("" = borrar); para agregar, incluye el texto anterior' },
        worker_notes: { type: 'string', description: 'notas para la cuadrilla COMPLETAS como deben quedar ("" = borrar)' },
        job_address: { type: 'string', description: 'calle y número' },
        job_city: { type: 'string' },
        job_state: { type: 'string' },
        line_items: {
          type: 'array',
          description: 'cambios a las partidas/precios del trabajo (índices de get_job). Con index = editar (solo lo que cambia) o remove=true; sin index = partida nueva',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit_price: { type: 'number' },
              remove: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        custom_fields: {
          type: 'array',
          description: 'campos personalizados que cambian (field_key de las plantillas)',
          items: {
            type: 'object',
            properties: { field_key: { type: 'string' }, value: { type: 'string' } },
            required: ['field_key', 'value'],
            additionalProperties: false,
          },
        },
        scheduled_date: { type: 'string', description: 'YYYY-MM-DD — nueva fecha' },
        end_date: { type: 'string', description: 'YYYY-MM-DD — nueva fecha fin (multi-día)' },
        all_day: { type: 'boolean', description: 'false si el usuario da horas de inicio/fin' },
        time_start: { type: 'string', description: 'HH:MM 24h' },
        time_end: { type: 'string', description: 'HH:MM 24h' },
        status: { type: 'string', enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], description: 'nuevo estado ("márcalo completado", "empezamos", "cancélalo")' },
        archived: { type: 'boolean', description: 'true = archivar, false = desarchivar' },
        crew: {
          type: 'array',
          description: 'lista COMPLETA de la cuadrilla que debe quedar (reemplaza la actual)',
          items: {
            type: 'object',
            properties: {
              employee_id: { type: 'string' },
              worker_name: { type: 'string' },
              is_lead: { type: 'boolean' },
            },
            required: ['worker_name'],
            additionalProperties: false,
          },
        },
      },
      required: ['job_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_job',
    description: 'Lee un trabajo con sus partidas/precios (índice, descripción, cantidad, precio unitario) y su total. Úsala antes de cambiar partidas con update_job.line_items.',
    input_schema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_invoice',
    description: 'Lee una factura con sus líneas (índice, descripción, cantidad, precio, si está excluida, trabajo de origen), su estado y totales. Úsala SIEMPRE antes de edit_invoice para tener los índices.',
    input_schema: {
      type: 'object',
      properties: { invoice_id: { type: 'string' } },
      required: ['invoice_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'edit_invoice',
    description: 'Genera el BORRADOR de cambios a las líneas de una factura NO ENVIADA (estado draft): cambiar nombre, cantidad o precio de una línea, excluirla/incluirla, quitarla, agregar una línea, moverla a otra factura sin enviar del mismo cliente, o activar/desactivar cargos adicionales (add-ons) de una línea. Los índices y los add-ons disponibles vienen de get_invoice. Varios cambios a la misma factura van en UNA llamada; mover, add-ons y cambio de cliente van solos (sin otros cambios). El usuario confirma (botón o "sí").',
    input_schema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer' },
              description: { type: 'string', description: 'nuevo nombre de la línea' },
              qty: { type: 'number' },
              rate: { type: 'number', description: 'precio por unidad' },
              excluded: { type: 'boolean', description: 'true = excluir temporalmente de la factura' },
              remove: { type: 'boolean' },
            },
            required: ['index'],
            additionalProperties: false,
          },
        },
        add_lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: { description: { type: 'string' }, qty: { type: 'number' }, rate: { type: 'number' } },
            required: ['description', 'qty', 'rate'],
            additionalProperties: false,
          },
        },
        move: {
          type: 'object',
          description: 'mover UNA línea a otra factura sin enviar del mismo cliente (id de query_invoices)',
          properties: { index: { type: 'integer' }, to_invoice_id: { type: 'string' } },
          required: ['index', 'to_invoice_id'],
          additionalProperties: false,
        },
        client_id: {
          type: 'string',
          description: 'facturar a OTRO cliente (id de query_clients); los trabajos de la factura pasan a ese cliente también',
        },
        addons: {
          type: 'object',
          description: 'activar/desactivar add-ons de UNA línea (nombres o ids de addons_available de get_invoice); el precio se recalcula al confirmar',
          properties: {
            index: { type: 'integer' },
            turn_on: { type: 'array', items: { type: 'string' } },
            turn_off: { type: 'array', items: { type: 'string' } },
          },
          required: ['index'],
          additionalProperties: false,
        },
      },
      required: ['invoice_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'invoice_jobs',
    description: 'BORRADOR para FACTURAR trabajos terminados (status completed, sin factura): crea una factura nueva por cliente con las partidas de cada trabajo, o los agrega a una factura sin enviar existente (to_invoice_id, de query_invoices). Ids de query_jobs. El usuario confirma.',
    input_schema: {
      type: 'object',
      properties: {
        job_ids: { type: 'array', items: { type: 'string' } },
        to_invoice_id: { type: 'string', description: 'opcional: agregar a esta factura sin enviar en vez de crear una nueva' },
      },
      required: ['job_ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'record_payment',
    description: 'BORRADOR para REGISTRAR UN PAGO recibido en una factura ("García me pagó $500 con cheque"). Si la factura queda cubierta pasa a pagada sola. Busca la factura con query_invoices (unpaid=true, client_search). El usuario confirma.',
    input_schema: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string' },
        amount: { type: 'number' },
        method: { type: 'string', enum: ['check', 'cash', 'card', 'transfer', 'zelle', 'cashapp', 'venmo', 'paypal', 'moneyOrder', 'other'] },
        paid_on: { type: 'string', description: 'YYYY-MM-DD, default hoy' },
      },
      required: ['invoice_id', 'amount', 'method'],
      additionalProperties: false,
    },
  },
  {
    name: 'quick_quote',
    description: 'BORRADOR de una COTIZACIÓN RÁPIDA / trabajo posible ("apunta un posible para García: reparación, $800"). Queda en Trabajos → Posibles. client_id de query_clients (opcional). El usuario confirma.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        title: { type: 'string' },
        price: { type: 'number' },
        notes: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_client_note',
    description: 'BORRADOR para ANOTAR en el historial de comunicación de un cliente ("anota que llamé a García y no contestó", "nota: quiere cotización en marzo"). client_id de query_clients. El usuario confirma.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        type: { type: 'string', enum: ['call', 'sms', 'email', 'in_person', 'whatsapp', 'note'] },
        outcome: { type: 'string', enum: ['connected', 'no_answer', 'sent', 'left_voicemail'] },
        note: { type: 'string' },
      },
      required: ['client_id', 'type'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_client',
    description: 'BORRADOR para CREAR UN CLIENTE nuevo. Antes busca con query_clients que no exista ya. Teléfono de EE.UU. de 10 dígitos. El usuario confirma.',
    input_schema: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        company: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string', description: 'código de 2 letras' },
        zip: { type: 'string' },
      },
      required: ['first_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_equipment',
    description: 'Busca equipo/vehículos del módulo Equipo (solo lectura): marca, modelo, año, VIN, millaje, placa y vencimientos (placa, seguro, garantía), préstamo, operador asignado, notas. Usa expiring_within_days para "¿qué se vence pronto?".',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'nombre, marca, modelo, placa, VIN o número de serie (parcial)' },
        assigned_to: { type: 'string', description: 'nombre del empleado asignado' },
        expiring_within_days: { type: 'integer', description: 'placa, seguro o garantía que vence en estos días (incluye vencidos)' },
        limit: { type: 'integer', description: 'máx 50, default 20' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'update_equipment',
    description: 'BORRADOR para CAMBIAR datos de un equipo/vehículo (id de query_equipment). Solo los campos que cambian; "" para borrar un texto. Fechas YYYY-MM-DD. El usuario confirma.',
    input_schema: {
      type: 'object',
      properties: {
        equipment_id: { type: 'string' },
        name: { type: 'string' }, equipment_type: { type: 'string' }, make: { type: 'string' }, model: { type: 'string' },
        year: { type: 'integer' }, color: { type: 'string' }, vin: { type: 'string' }, serial_number: { type: 'string' },
        mileage: { type: 'integer' }, plate_number: { type: 'string' }, plate_expiration: { type: 'string' },
        insurance_carrier: { type: 'string' }, insurance_policy_number: { type: 'string' }, insurance_agent: { type: 'string' },
        insurance_agent_phone: { type: 'string' }, insurance_expiration: { type: 'string' },
        purchase_date: { type: 'string' }, warranty_expiration: { type: 'string' }, location: { type: 'string' },
        paid_off: { type: 'boolean' }, loan_lender: { type: 'string' }, loan_amount: { type: 'number' }, value: { type: 'number' },
        assigned_employee_id: { type: 'string', description: 'id del roster; "" = sin asignar' },
        notes: { type: 'string', description: 'notas COMPLETAS como deben quedar' },
      },
      required: ['equipment_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'query_inventory',
    description: 'Busca artículos del inventario (solo lectura): cantidad en existencia, unidad, costo unitario, categoría, mínimo y si están bajos. low_stock_only=true para "¿qué se está acabando?".',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'nombre o SKU (parcial)' },
        category: { type: 'string' },
        low_stock_only: { type: 'boolean' },
        limit: { type: 'integer', description: 'máx 50, default 20' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'update_inventory',
    description: 'BORRADOR para AJUSTAR existencias o datos de un artículo del inventario (id de query_inventory): add/remove = sumar/restar unidades ("usamos 20", "llegaron 50"), set_quantity = conteo exacto ("hay 37"); y opcionalmente nombre, unidad, costo, categoría, SKU o mínimo. El usuario confirma.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        add: { type: 'integer' },
        remove: { type: 'integer' },
        set_quantity: { type: 'integer' },
        name: { type: 'string' }, unit: { type: 'string' }, unit_cost: { type: 'number' },
        category: { type: 'string' }, sku: { type: 'string' }, low_stock_threshold: { type: 'integer' },
      },
      required: ['item_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'business_report',
    description: 'Números del negocio para un periodo (lo mismo que la pantalla Reportes): ingresos cobrados (sin lo facturado por otra empresa), pendiente y vencido por cobrar, facturas, trabajos por estado, trabajos terminados, promedio por trabajo, clientes nuevos, ingresos por mes y por sucursal, mejores clientes, valor de inventario. Para "¿cuánto facturamos este mes?", "¿cómo vamos comparado con el mes pasado?" llama una vez por periodo y compara.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD inicio (incluido)' },
        to: { type: 'string', description: 'YYYY-MM-DD fin (incluido)' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'daily_briefing',
    description: 'Resumen del día (solo lectura) para "¿qué hay para hoy?" / "¿cómo va el día?": trabajos del día con su cuadrilla, trabajos sin cuadrilla, quién de la cuadrilla de hoy no ha marcado entrada, facturas vencidas, posibles viejos, equipo con placa/seguro/garantía vencido o por vencer (14 días) e inventario bajo. Resume en 2–3 frases con lo más urgente.',
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD (hoy, de la fecha del contexto)' } },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    name: 'undo_last',
    description: 'DESHACER el último cambio que confirmaste en esta conversación ("deshaz eso", "regrésalo como estaba"). Solo si el usuario lo pide claramente. La app lo revierte; di que lo estás deshaciendo.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'query_invoices',
    description:
      'Busca facturas del negocio (solo lectura). Devuelve total_count, sum_total y sum_balance (lo que falta cobrar) sobre TODAS las que cumplen los filtros, más hasta `limit` filas. Usa status="overdue" para "¿qué facturas están vencidas?", unpaid=true para "¿quién me debe?" (enviadas o vencidas con saldo), client_search para "¿cuánto me debe Bob?".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'total_loss'] },
        unpaid: { type: 'boolean', description: 'solo enviadas/vencidas con saldo pendiente' },
        client_search: { type: 'string', description: 'nombre o empresa del cliente (parcial)' },
        invoice_number: { type: 'string' },
        issued_from: { type: 'string', description: 'issue_date >= YYYY-MM-DD' },
        issued_to: { type: 'string', description: 'issue_date <= YYYY-MM-DD' },
        limit: { type: 'integer', description: 'máx 50, default 10' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'open_screen',
    description:
      'Abre una pantalla de la app para el usuario ("abre el trabajo 7 Tower", "llévame a facturas", "muéstrame el calendario"). Para job/invoice/client pasa el id exacto (de query_jobs / query_invoices / query_clients). Úsala solo cuando el usuario pida ver/abrir/ir a algo; la app navega cuando termine tu respuesta. Responde en una frase corta ("Te abro 7 Tower").',
    input_schema: {
      type: 'object',
      properties: {
        screen: {
          type: 'string',
          enum: ['home', 'jobs', 'invoices', 'clients', 'calendar', 'employees', 'reports', 'map', 'settings', 'notifications', 'payroll', 'job', 'invoice', 'client'],
        },
        id: { type: 'string', description: 'requerido para job / invoice / client' },
      },
      required: ['screen'],
      additionalProperties: false,
    },
  },
  {
    name: 'confirm_pending_draft',
    description:
      'Presiona Confirmar por el usuario sobre el borrador pendiente (<pending_draft>). Llama SOLO si en su ÚLTIMO mensaje el usuario dijo claramente que sí lo confirma ("sí", "confírmalo", "dale", "hazlo") refiriéndose a ese borrador, y no pidió cambios. Nunca por iniciativa propia. Después di que lo estás confirmando.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];

// ── Executors ───────────────────────────────────────────────────────────────

const clamp = (n: unknown, max: number, dflt: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : dflt;
  return Math.min(Math.max(v, 1), max);
};

type ToolInput = Record<string, any>;

export async function executeQueryJobs(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 100, 10);
  const crewTerm = typeof input.crew_member === 'string' ? input.crew_member.trim() : '';
  // A crew filter implies the caller cares about crews — return them.
  const withAssignments = !!input.include_assignments || !!crewTerm;
  let select = withAssignments
    ? 'id, title, status, priority, scheduled_date, total_hours, created_at, archived_at, clients(first_name, last_name, company), job_assignments(worker_name, is_lead), driver_employee_ids, driver_hours'
    : 'id, title, status, priority, scheduled_date, total_hours, created_at, archived_at, clients(first_name, last_name, company)';
  // The crew filter rides on a SEPARATE aliased inner-join embed so the plain
  // job_assignments embed still lists the FULL crew, not just the match.
  if (crewTerm) select += ', crew_match:job_assignments!inner(worker_name, is_lead)';
  // count:'exact' rides on the same query so the model always knows the REAL
  // total even when rows are truncated to `limit` ("¿cuántos trabajos tengo?").
  let q = ctx.db.from('jobs').select(select, { count: 'exact' }).eq('business_id', ctx.businessId);
  if (crewTerm) {
    q = q.ilike('crew_match.worker_name', `%${crewTerm}%`);
    if (input.crew_lead_only) q = q.eq('crew_match.is_lead', true);
  }
  if (input.archived === 'only') q = q.not('archived_at', 'is', null);
  else if (input.archived === 'exclude') q = q.is('archived_at', null);
  if (input.status) q = q.eq('status', input.status);
  if (input.client_id) q = q.eq('client_id', input.client_id);
  if (input.date_from) q = q.gte('scheduled_date', input.date_from);
  if (input.date_to) q = q.lte('scheduled_date', input.date_to);
  if (input.created_from) q = q.gte('created_at', `${input.created_from}T00:00:00`);
  if (input.created_to) q = q.lte('created_at', `${input.created_to}T23:59:59`);
  if (input.search) q = q.ilike('title', `%${input.search}%`);
  const { data, error, count } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  const jobs = (data ?? []).map((j: any) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    scheduled_date: j.scheduled_date,
    total_hours: j.total_hours,
    created_at: j.created_at,
    archived: !!j.archived_at,
    client: j.clients
      ? `${j.clients.first_name ?? ''} ${j.clients.last_name ?? ''}`.trim() + (j.clients.company ? ` (${j.clients.company})` : '')
      : null,
    ...(withAssignments
      ? {
          crew: (j.job_assignments ?? []).map((a: any) => `${a.worker_name}${a.is_lead ? ' (líder)' : ''}`),
          driver_employee_ids: j.driver_employee_ids ?? [],
          driver_hours: j.driver_hours,
        }
      : {}),
  }));
  return { total_count: count ?? jobs.length, showing: jobs.length, jobs };
}

export async function executeQueryClients(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 10, 5);
  const term = String(input.search ?? '').trim();
  let q = ctx.db
    .from('clients')
    .select('id, first_name, last_name, company, phone_cell, city', { count: 'exact' })
    .eq('business_id', ctx.businessId);
  if (term) {
    // Token-split OR match across name/company so "Bob Karlton" hits
    // first_name=Bob + last_name=Karlton.
    // Strip PostgREST grammar chars (, ( ) . \ ") so a search term can't
    // break out of the ilike filter and inject extra OR conditions; cap to 3.
    const tokens = term
      .split(/\s+/)
      .map(t => t.replace(/[,().\\"]/g, ''))
      .filter(Boolean)
      .slice(0, 3);
    if (tokens.length) {
      const ors = tokens
        .map(t => `first_name.ilike.%${t}%,last_name.ilike.%${t}%,company.ilike.%${t}%`)
        .join(',');
      q = q.or(ors);
    }
  }
  const { data, error, count } = await q.order('first_name').limit(limit);
  if (error) throw new Error(error.message);
  const clients = (data ?? []).map((c: any) => ({
    id: c.id,
    name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
    company: c.company,
    phone: c.phone_cell,
    city: c.city,
  }));
  return { total_count: count ?? clients.length, showing: clients.length, clients };
}

export async function executeQueryEmployees(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 25, 25);
  let q = ctx.db
    .from('employees')
    .select('id, first_name, last_name, role')
    .eq('business_id', ctx.businessId);
  if (input.search) {
    // Same sanitization as query_clients: strip PostgREST grammar chars and
    // cap to 3 tokens so the term can't inject extra filter conditions.
    const tokens = String(input.search)
      .trim()
      .split(/\s+/)
      .map(t => t.replace(/[,().\\"]/g, ''))
      .filter(Boolean)
      .slice(0, 3);
    if (tokens.length) {
      const ors = tokens
        .map(t => `first_name.ilike.%${t}%,last_name.ilike.%${t}%`)
        .join(',');
      q = q.or(ors);
    }
  }
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((e: any) => ({
    id: e.id,
    name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
    role: e.role,
  }));
}

export async function executeQueryTimesheets(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 31, 14);
  let employeeId: string | null = input.employee_id ?? null;
  if (!employeeId && input.employee_name) {
    const t = String(input.employee_name).trim().toLowerCase();
    const match = ctx.employees.find(e => e.name.toLowerCase().includes(t));
    if (match) employeeId = match.id;
  }
  let q = ctx.db
    .from('timesheets')
    .select('work_date, worker_name, clock_in, clock_out, hours_total, employee_id')
    .eq('business_id', ctx.businessId)
    .gte('work_date', input.date_from)
    .lte('work_date', input.date_to);
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q.order('work_date', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function executeSuggestCrew(ctx: AssistantContext, input: ToolInput) {
  const clientId = typeof input.client_id === 'string' ? input.client_id.trim() : '';
  // "Who's free on X?" wants the whole list, not the top 10.
  const dateOnly = !input.job_search && !input.place && !clientId;
  const limit = clamp(input.limit, 50, dateOnly ? 50 : 10);
  const jobSearch = typeof input.job_search === 'string' ? input.job_search.trim() : '';
  const place = typeof input.place === 'string' ? input.place.trim() : '';
  const date = typeof input.date === 'string' && YMD_RE.test(input.date) ? input.date : null;

  // Resolve the target point: an existing job's pin (or its client's), or a
  // geocoded freeform place. Date-only calls still rank by availability.
  let target: CrewFinderTarget = { jobId: null, lat: null, lng: null, scheduledDate: date, clientId: null };
  let targetLabel: string | null = null;
  if (jobSearch) {
    const { data, error } = await ctx.db
      .from('jobs')
      .select('id, title, scheduled_date, job_lat, job_lng, client_id')
      .eq('business_id', ctx.businessId)
      .ilike('title', `%${jobSearch}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const job = data?.[0];
    if (!job) return { error: `no encontré un trabajo que coincida con "${jobSearch}"` };
    target = {
      jobId: job.id,
      lat: job.job_lat,
      lng: job.job_lng,
      scheduledDate: date ?? job.scheduled_date ?? null,
      clientId: job.client_id ?? null,
    };
    targetLabel = job.title;
  } else if (place) {
    const geo = await geocodeAddress(place);
    if (!geo.ok) return { error: `no pude ubicar "${place}" en el mapa (${geo.reason})` };
    target = { jobId: null, lat: geo.lat, lng: geo.lng, scheduledDate: date, clientId: null };
    targetLabel = place;
  } else if (clientId) {
    // New job: rank from the client's location (crewFinderData falls back to
    // the client's coordinates when the target has none).
    target = { jobId: null, lat: null, lng: null, scheduledDate: date, clientId };
  } else if (!date) {
    return { error: 'da place, job_search, client_id o date' };
  }

  const data = await fetchCrewFinderData(ctx.db, ctx.businessId, target);
  const suggestions = buildCrewSuggestions(data);
  const roleById = new Map(ctx.employees.map(e => [e.id, e.role]));
  return {
    target: targetLabel,
    target_has_coords: data.targetHasCoords,
    date: target.scheduledDate,
    // Employees whose location can't be resolved rank last with distance null;
    // this count tells the model why ("sin dirección geocodificada").
    employees_without_location: data.needsGeocodeCount,
    suggestions: suggestions.slice(0, limit).map(s => ({
      employee_id: s.employeeId,
      name: s.name,
      role: roleById.get(s.employeeId) ?? null,
      distance_mi: s.distanceMi,
      location_basis: s.basis,
      free_on_date: s.isFreeOnDate,
      next_free_date: s.nextFreeDate,
      nearby_jobs_count: s.nearbyJobs.length,
    })),
  };
}

// ── propose_job — normalize into a JobDraft (no DB write) ──────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (v: unknown): string | undefined =>
  typeof v === 'string' && DATE_RE.test(v) ? v : undefined;
const asStr = (v: unknown): string | undefined => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : undefined;
};
const asNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

export function buildDraft(ctx: AssistantContext, input: ToolInput): JobDraft {
  const warnings: string[] = [];
  const employeeIds = new Set(ctx.employees.map(e => e.id));
  const templateKeys = new Set(ctx.fieldTemplates.map(f => f.field_key));

  // Crew: keep only rows with a name; drop unknown employee ids to manual names.
  const crew = (Array.isArray(input.crew) ? input.crew : [])
    .map((c: any) => {
      const name = asStr(c?.worker_name) ?? '';
      if (!name) return null;
      const id = asStr(c?.employee_id);
      if (id && !employeeIds.has(id)) {
        warnings.push(`Empleado no reconocido: ${name} (se agregará por nombre)`);
        return { worker_name: name, is_lead: !!c?.is_lead };
      }
      return id
        ? { employee_id: id, worker_name: name, is_lead: !!c?.is_lead }
        : { worker_name: name, is_lead: !!c?.is_lead };
    })
    .filter(Boolean) as JobDraft['crew'];
  // Single lead, and the lead must be a registered crew member.
  let leadSeen = false;
  for (const c of crew) {
    if (c.is_lead) {
      if (leadSeen || !c.employee_id) c.is_lead = false;
      else leadSeen = true;
    }
  }

  const drivers = (Array.isArray(input.driver_employee_ids) ? input.driver_employee_ids : [])
    .filter((id: unknown): id is string => typeof id === 'string' && employeeIds.has(id));

  const custom: Record<string, string> = {};
  const rawFields: { field_key?: unknown; value?: unknown }[] = Array.isArray(input.custom_fields)
    ? input.custom_fields
    : [];
  for (const f of rawFields) {
    const k = asStr(f?.field_key);
    if (!k) continue;
    if (!templateKeys.has(k)) {
      warnings.push(`Campo desconocido ignorado: ${k}`);
      continue;
    }
    custom[k] = String(f?.value ?? '');
  }

  const clientId = asStr(input.client_id);
  const clientName = asStr(input.client_name);
  const clientResolved = !!clientId && input.client_resolved !== false;
  if (clientName && !clientResolved) {
    warnings.push(`Cliente "${clientName}" sin coincidencia — el trabajo se creará sin cliente vinculado`);
  }

  let status: JobDraft['status'] =
    input.status === 'in_progress' || input.status === 'completed' ? input.status : 'scheduled';
  if (ctx.restrictedCreator && status !== 'completed') {
    status = 'completed';
    warnings.push('Tu rol registra trabajos como completados');
  }

  const allDay = input.all_day !== false;

  const draft: JobDraft = {
    job_id: randomUUID(),
    business_id: ctx.businessId,
    title: asStr(input.title) ?? 'Trabajo',
    description: asStr(input.description),
    status,
    priority: ['low', 'normal', 'high', 'urgent'].includes(input.priority) ? input.priority : undefined,
    scheduled_date: asDate(input.scheduled_date),
    end_date: asDate(input.end_date),
    all_day: allDay,
    time_start: allDay ? undefined : asStr(input.time_start),
    time_end: allDay ? undefined : asStr(input.time_end),
    total_hours: asNum(input.total_hours),
    client_id: clientResolved ? clientId : undefined,
    client_name: clientName,
    client_resolved: clientResolved,
    crew,
    driver_employee_ids: drivers,
    driver_hours: drivers.length ? asNum(input.driver_hours) : undefined,
    custom_fields: custom,
    internal_notes: asStr(input.internal_notes),
    worker_notes: asStr(input.worker_notes),
    warnings,
  };

  // Required-field check (same contract confirmDraft enforces) — surfaced as
  // warnings on the card AND fed back to the model so Ami asks for what's
  // missing instead of letting Confirmar fail.
  const es = ctx.locale !== 'en';
  const reqCheck = checkRequiredFields(ctx, draft);
  if (reqCheck.missing.length) {
    warnings.push(
      `${es ? 'Faltan campos requeridos' : 'Missing required fields'}: ${reqCheck.missing.join(', ')} — ${es ? 'no se podrá confirmar sin ellos' : "can't be confirmed without them"}`,
    );
  }
  if (reqCheck.unsupported.length) {
    warnings.push(
      es
        ? `Este negocio requiere ${reqCheck.unsupported.join(', ')}, que Ami aún no maneja — crea este trabajo en la pantalla Trabajos`
        : `This business requires ${reqCheck.unsupported.join(', ')}, which Ami can't fill yet — create this job from the Jobs screen`,
    );
  }
  return draft;
}

// Resolve a crew input list into DraftCrewMember[] (drop unknown ids to manual
// names, enforce a single registered lead) — shared shape with buildDraft.
function resolveCrew(ctx: AssistantContext, raw: unknown, warnings: string[]): DraftCrewMember[] {
  const employeeIds = new Set(ctx.employees.map(e => e.id));
  const crew = (Array.isArray(raw) ? raw : [])
    .map((c: any) => {
      const name = asStr(c?.worker_name) ?? '';
      if (!name) return null;
      const id = asStr(c?.employee_id);
      if (id && !employeeIds.has(id)) {
        warnings.push(`Empleado no reconocido: ${name} (se agregará por nombre)`);
        return { worker_name: name, is_lead: !!c?.is_lead };
      }
      return id ? { employee_id: id, worker_name: name, is_lead: !!c?.is_lead } : { worker_name: name, is_lead: !!c?.is_lead };
    })
    .filter(Boolean) as DraftCrewMember[];
  let leadSeen = false;
  for (const c of crew) {
    if (c.is_lead) {
      if (leadSeen || !c.employee_id) c.is_lead = false;
      else leadSeen = true;
    }
  }
  return crew;
}

/** Build a reschedule/edit draft for an EXISTING job. Fetches the target (so
 *  we validate it's in-business and snapshot current values), then attaches
 *  only the fields the model wants to change. Throws if the job isn't found. */
export async function buildJobUpdateDraft(ctx: AssistantContext, input: ToolInput): Promise<JobUpdateDraft> {
  const jobId = asStr(input.job_id);
  if (!jobId) throw new Error('Falta el job_id del trabajo a cambiar.');
  const { data: job, error } = await ctx.db
    .from('jobs')
    .select('id, title, scheduled_date, end_date, all_day, time_start, time_end, status, archived_at, description, priority, client_id, total_hours, internal_notes, worker_notes, job_address, job_city, job_state, custom_fields')
    .eq('business_id', ctx.businessId)
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error('No encontré ese trabajo en este negocio. Verifica con query_jobs.');
  const { data: asg } = await ctx.db
    .from('job_assignments')
    .select('worker_name, is_lead')
    .eq('job_id', jobId);
  const beforeCrew = (asg ?? []).map((a: any) => `${a.worker_name}${a.is_lead ? ' (líder)' : ''}`);

  const warnings: string[] = [];
  const draft: JobUpdateDraft = {
    kind: 'update',
    job_id: jobId,
    business_id: ctx.businessId,
    title: (job as any).title ?? 'Trabajo',
    before: {
      scheduled_date: (job as any).scheduled_date ?? null,
      end_date: (job as any).end_date ?? null,
      all_day: (job as any).all_day ?? true,
      time_start: (job as any).time_start ?? null,
      time_end: (job as any).time_end ?? null,
      crew: beforeCrew,
      status: (job as any).status ?? undefined,
      archived: !!(job as any).archived_at,
    },
    warnings,
  };

  const newDate = asDate(input.scheduled_date);
  const newEnd = asDate(input.end_date);
  if (newDate) draft.scheduled_date = newDate;
  if (newEnd) draft.end_date = newEnd;
  if (typeof input.all_day === 'boolean') draft.all_day = input.all_day;
  const ts = asStr(input.time_start);
  const te = asStr(input.time_end);
  if (ts) { draft.time_start = ts; if (draft.all_day === undefined) draft.all_day = false; }
  if (te) { draft.time_end = te; if (draft.all_day === undefined) draft.all_day = false; }
  if (Array.isArray(input.crew)) draft.crew = resolveCrew(ctx, input.crew, warnings);
  if (UPDATE_STATUSES.includes(input.status) && input.status !== draft.before.status) {
    if (draft.before.status === 'invoiced') warnings.push('Este trabajo ya está facturado — cambia su estado desde la factura.');
    else draft.status = input.status;
  }
  if (typeof input.archived === 'boolean' && input.archived !== draft.before.archived) draft.archived = input.archived;

  await addDetailChanges(ctx, job as Record<string, any>, input, draft);
  if (Array.isArray(input.line_items) && input.line_items.length) await addItemChanges(ctx, jobId, (job as any).status, input.line_items, draft);

  const hasChange = draft.details !== undefined || draft.item_ops !== undefined ||
    draft.scheduled_date !== undefined || draft.end_date !== undefined ||
    draft.all_day !== undefined || draft.time_start !== undefined ||
    draft.time_end !== undefined || draft.crew !== undefined ||
    draft.status !== undefined || draft.archived !== undefined;
  if (!hasChange) warnings.push('No indicaste ningún cambio.');
  return draft;
}

const DETAIL_LABELS: Record<string, { es: string; en: string }> = {
  title: { es: 'Nombre', en: 'Name' },
  description: { es: 'Descripción', en: 'Description' },
  priority: { es: 'Prioridad', en: 'Priority' },
  client_id: { es: 'Cliente', en: 'Client' },
  total_hours: { es: 'Horas totales', en: 'Total hours' },
  internal_notes: { es: 'Notas internas', en: 'Internal notes' },
  worker_notes: { es: 'Notas para la cuadrilla', en: 'Crew notes' },
  job_address: { es: 'Dirección', en: 'Address' },
  job_city: { es: 'Ciudad', en: 'City' },
  job_state: { es: 'Estado (lugar)', en: 'State' },
};
const PRIORITY_LABELS: Record<string, { es: string; en: string }> = {
  low: { es: 'Baja', en: 'Low' }, normal: { es: 'Normal', en: 'Normal' },
  high: { es: 'Alta', en: 'High' }, urgent: { es: 'Urgente', en: 'Urgent' },
};
const TEXT_DETAILS = ['description', 'internal_notes', 'worker_notes', 'job_address', 'job_city', 'job_state'] as const;

/** Fills draft.details / draft.detail_rows from update_job input — only
 *  fields that actually differ from the job's current values. */
async function addDetailChanges(ctx: AssistantContext, job: Record<string, any>, input: ToolInput, draft: JobUpdateDraft) {
  const d: NonNullable<JobUpdateDraft['details']> = {};
  const rows: { label: string; from: string; to: string }[] = [];
  const L = (k: string) => DETAIL_LABELS[k][ctx.locale];
  const show = (v: unknown) => (v == null || v === '' ? '—' : String(v).length > 80 ? `${String(v).slice(0, 77)}…` : String(v));
  // Clearing a field the business requires (Ajustes → Trabajos) is refused.
  const required = (k: string) => !!ctx.jobFieldRequired[k] && !ctx.jobFieldHidden[k];

  const title = asStr(input.new_title);
  if (title && title !== job.title) { d.title = title; rows.push({ label: L('title'), from: show(job.title), to: title }); }

  for (const k of TEXT_DETAILS) {
    if (typeof input[k] !== 'string') continue;
    const next = input[k].trim() || null;
    if (next === (job[k] ?? null)) continue;
    if (!next && required(k)) { draft.warnings.push(`${L(k)} es obligatorio en este negocio — no se puede borrar.`); continue; }
    d[k] = next;
    rows.push({ label: L(k), from: show(job[k]), to: show(next) });
  }

  if (['low', 'normal', 'high', 'urgent'].includes(input.priority) && input.priority !== (job.priority ?? 'normal')) {
    d.priority = input.priority;
    rows.push({ label: L('priority'), from: PRIORITY_LABELS[job.priority ?? 'normal']?.[ctx.locale] ?? '—', to: PRIORITY_LABELS[input.priority][ctx.locale] });
  }

  const hours = asNum(input.total_hours);
  if (hours !== undefined && hours !== (job.total_hours ?? null)) {
    d.total_hours = hours;
    rows.push({ label: L('total_hours'), from: show(job.total_hours), to: String(hours) });
  }

  if (typeof input.client_id === 'string' && (input.client_id.trim() || null) !== (job.client_id ?? null)) {
    const next = input.client_id.trim() || null;
    const name = async (id: string | null) => {
      if (!id) return null;
      const { data } = await ctx.db.from('clients').select('first_name, last_name, company').eq('business_id', ctx.businessId).eq('id', id).maybeSingle();
      return data ? ([data.first_name, data.last_name].filter(Boolean).join(' ') || data.company || '') : undefined;
    };
    const [fromName, toName] = await Promise.all([name(job.client_id ?? null), name(next)]);
    if (next && toName === undefined) draft.warnings.push('No encontré ese cliente — búscalo con query_clients.');
    else if (!next && required('client_id')) draft.warnings.push(`${L('client_id')} es obligatorio en este negocio — no se puede quitar.`);
    else { d.client_id = next; rows.push({ label: L('client_id'), from: show(fromName), to: show(toName) }); }
  }

  if (Array.isArray(input.custom_fields)) {
    const current = (job.custom_fields ?? {}) as Record<string, unknown>;
    for (const f of input.custom_fields as { field_key?: unknown; value?: unknown }[]) {
      const k = asStr(f?.field_key);
      const tpl = ctx.fieldTemplates.find(t => t.field_key === k);
      if (!k || !tpl) { if (k) draft.warnings.push(`Campo desconocido ignorado: ${k}`); continue; }
      const v = String(f?.value ?? '').trim();
      if (v === String(current[k] ?? '')) continue;
      if (!v && tpl.required) { draft.warnings.push(`${tpl.field_label} es obligatorio — no se puede borrar.`); continue; }
      (d.custom_fields ??= {})[k] = v;
      rows.push({ label: tpl.field_label, from: show(current[k]), to: show(v) });
    }
  }

  if (rows.length) { draft.details = d; draft.detail_rows = rows; }
}

const UPDATE_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];

export async function executeQueryInvoices(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 50, 10);
  // Client name → ids first (same token sanitizing as query_clients).
  let clientIds: string[] | null = null;
  const term = String(input.client_search ?? '').trim();
  if (term) {
    const tokens = term.split(/\s+/).map(t => t.replace(/[,().\\"]/g, '')).filter(Boolean).slice(0, 3);
    if (tokens.length) {
      const { data, error } = await ctx.db
        .from('clients')
        .select('id')
        .eq('business_id', ctx.businessId)
        .or(tokens.map(t => `first_name.ilike.%${t}%,last_name.ilike.%${t}%,company.ilike.%${t}%`).join(','))
        .limit(50);
      if (error) throw new Error(error.message);
      clientIds = (data ?? []).map((r: any) => r.id);
      if (!clientIds.length) return { total_count: 0, showing: 0, sum_total: 0, sum_balance: 0, invoices: [], note: `sin clientes que coincidan con "${term}"` };
    }
  }
  const filter = (q: any) => {
    q = q.eq('business_id', ctx.businessId);
    if (clientIds) q = q.in('client_id', clientIds);
    if (input.status) q = q.eq('status', input.status);
    if (input.unpaid) q = q.in('status', ['sent', 'overdue']);
    if (input.invoice_number) q = q.ilike('invoice_number', `%${String(input.invoice_number).replace(/[%,()]/g, '')}%`);
    if (asDate(input.issued_from)) q = q.gte('issue_date', input.issued_from);
    if (asDate(input.issued_to)) q = q.lte('issue_date', input.issued_to);
    return q;
  };
  const { data, error, count } = await filter(
    ctx.db.from('invoices').select('id, invoice_number, status, issue_date, due_date, total_amount, amount_paid, clients(first_name, last_name, company)', { count: 'exact' }),
  ).order('issue_date', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  // Sums over EVERY matching invoice, not just the shown rows (paged, 1000-row cap).
  let sumTotal = 0;
  let sumBalance = 0;
  for (let from = 0; ; from += 1000) {
    const { data: page, error: e2 } = await filter(ctx.db.from('invoices').select('total_amount, amount_paid'))
      .order('id').range(from, from + 999);
    if (e2) throw new Error(e2.message);
    for (const r of page ?? []) {
      const total = Number(r.total_amount) || 0;
      sumTotal += total;
      sumBalance += Math.max(0, total - (Number(r.amount_paid) || 0));
    }
    if (!page || page.length < 1000) break;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const invoices = (data ?? []).map((i: any) => {
    const total = Number(i.total_amount) || 0;
    return {
      id: i.id,
      invoice_number: i.invoice_number,
      status: i.status,
      issue_date: i.issue_date,
      due_date: i.due_date,
      total: round2(total),
      balance: round2(Math.max(0, total - (Number(i.amount_paid) || 0))),
      client: i.clients
        ? `${i.clients.first_name ?? ''} ${i.clients.last_name ?? ''}`.trim() + (i.clients.company ? ` (${i.clients.company})` : '')
        : null,
    };
  });
  return { total_count: count ?? invoices.length, showing: invoices.length, sum_total: round2(sumTotal), sum_balance: round2(sumBalance), invoices };
}

const SCREENS = ['home', 'jobs', 'invoices', 'clients', 'calendar', 'employees', 'reports', 'map', 'settings', 'notifications', 'payroll', 'job', 'invoice', 'client'] as const;
const ENTITY_TABLE: Record<string, string> = { job: 'jobs', invoice: 'invoices', client: 'clients' };

/** Validate an open_screen call. Detail screens must name a row in THIS
 *  business (RLS-scoped read), so a hallucinated id never reaches the app. */
export async function buildNavigateAction(ctx: AssistantContext, input: ToolInput): Promise<AssistantClientAction> {
  const screen = SCREENS.find(s => s === input.screen);
  if (!screen) throw new Error('pantalla desconocida');
  const table = ENTITY_TABLE[screen];
  if (!table) return { type: 'navigate', screen };
  const id = asStr(input.id);
  if (!id) throw new Error(`falta el id para abrir ${screen} — búscalo primero`);
  const { data } = await ctx.db.from(table).select('id').eq('business_id', ctx.businessId).eq('id', id).maybeSingle();
  if (!data) throw new Error(`no encontré ese ${screen} en este negocio`);
  return { type: 'navigate', screen, id };
}


// ── Line items: jobs (job_items) and unsent invoices (line_items) ───────────

const money = (n: unknown) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

async function readJobItems(ctx: AssistantContext, jobId: string) {
  const { data, error } = await ctx.db
    .from('job_items')
    .select('id, description, quantity, unit_price')
    .eq('job_id', jobId)
    .order('created_at')
    .order('id');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; description: string; quantity: number; unit_price: number }[];
}

export async function executeGetJob(ctx: AssistantContext, input: ToolInput) {
  const jobId = asStr(input.job_id);
  if (!jobId) throw new Error('Falta job_id.');
  const { data: job, error } = await ctx.db
    .from('jobs')
    .select('id, title, status, client_id, scheduled_date, total_amount, subtotal_amount, tax_rate, invoice_id, description')
    .eq('business_id', ctx.businessId)
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw new Error('No encontré ese trabajo.');
  const items = await readJobItems(ctx, jobId);
  return {
    ...job,
    line_items: items.map((it, index) => ({ index, description: it.description, quantity: it.quantity, unit_price: it.unit_price, amount: Number(it.quantity) * Number(it.unit_price) })),
  };
}

/** update_job.line_items → draft.item_ops + display rows. */
async function addItemChanges(ctx: AssistantContext, jobId: string, status: string | null, raw: any[], draft: JobUpdateDraft) {
  if (status === 'invoiced') {
    draft.warnings.push('Este trabajo ya está facturado — cambia los precios en la factura.');
    return;
  }
  const items = await readJobItems(ctx, jobId);
  const ops: JobItemOp[] = [];
  const rows = draft.detail_rows ?? [];
  const label = ctx.locale === 'en' ? 'Item' : 'Partida';
  const line = (d: string, q: number, p: number) => `${d} · ${q} × ${money(p)}`;
  for (const r of raw) {
    const idx = Number.isInteger(r?.index) ? r.index : null;
    if (idx === null) {
      const description = asStr(r?.description);
      const quantity = num(r?.quantity) ?? 1;
      const unit_price = num(r?.unit_price);
      if (!description || unit_price === undefined) { draft.warnings.push('Una partida nueva necesita descripción y precio.'); continue; }
      ops.push({ op: 'add', description, quantity, unit_price });
      rows.push({ label: `${label} +`, from: '—', to: line(description, quantity, unit_price) });
      continue;
    }
    const it = items[idx];
    if (!it) { draft.warnings.push(`No existe la partida #${idx}.`); continue; }
    const before = line(it.description, it.quantity, it.unit_price);
    if (r.remove === true) {
      ops.push({ op: 'remove', index: idx });
      rows.push({ label: `${label} ${idx + 1}`, from: before, to: ctx.locale === 'en' ? 'removed' : 'quitada' });
      continue;
    }
    const op: JobItemOp = { op: 'update', index: idx };
    const d = asStr(r.description); if (d && d !== it.description) op.description = d;
    const q = num(r.quantity); if (q !== undefined && q !== Number(it.quantity)) op.quantity = q;
    const p = num(r.unit_price); if (p !== undefined && p !== Number(it.unit_price)) op.unit_price = p;
    if (Object.keys(op).length === 2) continue;
    ops.push(op);
    rows.push({ label: `${label} ${idx + 1}`, from: before, to: line(op.description ?? it.description, op.quantity ?? it.quantity, op.unit_price ?? it.unit_price) });
  }
  if (!ops.length) return;
  draft.item_ops = ops;
  draft.items_hash = lineItemsHash(items);
  draft.detail_rows = rows;
}

async function readAddons(ctx: AssistantContext) {
  const { data, error } = await ctx.db
    .from('price_sheet_items')
    .select('id, name, pricing_mode, unit_label')
    .eq('business_id', ctx.businessId)
    .eq('active', true)
    .eq('is_addon', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string; pricing_mode: string; unit_label: string | null }[];
}

async function readInvoice(ctx: AssistantContext, invoiceId: string) {
  const { data, error } = await ctx.db
    .from('invoices')
    .select('id, invoice_number, status, client_id, line_items, subtotal_amount, tax_amount, total_amount, billed_through')
    .eq('business_id', ctx.businessId)
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No encontré esa factura.');
  return data as { id: string; invoice_number: string; status: string; client_id: string | null; line_items: any[] | null; subtotal_amount: number; tax_amount: number; total_amount: number; billed_through: unknown[] | null };
}

export async function executeGetInvoice(ctx: AssistantContext, input: ToolInput) {
  const inv = await readInvoice(ctx, asStr(input.invoice_id) ?? '');
  const lines = inv.line_items ?? [];
  const jobIds = [...new Set(lines.map(l => l?.job_id).filter(Boolean))] as string[];
  const titles: Record<string, string> = {};
  if (jobIds.length) {
    const { data } = await ctx.db.from('jobs').select('id, title').in('id', jobIds);
    for (const j of data ?? []) titles[(j as any).id] = (j as any).title;
  }
  const addons = await readAddons(ctx);
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    addons_available: addons.map(a => ({ id: a.id, name: a.name, pricing: a.pricing_mode === 'flat' ? 'flat' : 'per_unit', unit: a.unit_label })),
    editable: inv.status === 'draft',
    client_id: inv.client_id,
    subtotal: inv.subtotal_amount,
    tax: inv.tax_amount,
    total: inv.total_amount,
    lines: lines.map((l, index) => ({
      index,
      description: l?.description ?? '',
      qty: l?.qty,
      rate: l?.rate,
      amount: (Number(l?.qty) || 0) * (Number(l?.rate) || 0),
      excluded: !!l?.excluded,
      addon: !!l?.addon,
      // Per-unit / bundled add-ons already folded into this line's price.
      addon_note: l?.addonNote ?? null,
      job_id: l?.job_id ?? null,
      job_title: l?.job_id ? titles[l.job_id] ?? null : null,
    })),
  };
}

export async function buildInvoiceEditDraft(ctx: AssistantContext, input: ToolInput): Promise<InvoiceEditDraft> {
  const inv = await readInvoice(ctx, asStr(input.invoice_id) ?? '');
  if (inv.status !== 'draft') throw new Error('Esa factura ya fue enviada — solo puedo cambiar facturas sin enviar.');
  const lines = inv.line_items ?? [];
  const en = ctx.locale === 'en';
  const lbl = (i: number) => `${en ? 'Line' : 'Línea'} ${i + 1}`;
  const show = (l: any) => `${l?.description ?? ''} · ${l?.qty} × ${money(l?.rate)}`;
  const ops: InvoiceLineOp[] = [];
  const rows: InvoiceEditDraft['detail_rows'] = [];
  const warnings: string[] = [];

  if (asStr(input.client_id)) {
    if (input.move || input.addons || (input.changes?.length ?? 0) || (input.add_lines?.length ?? 0)) {
      throw new Error('El cambio de cliente va solo — haz los demás cambios en otra llamada.');
    }
    // Bill-through lines belong to the client the other business billed —
    // re-pointing them would mismatch the two invoices.
    if (lines.some(l => l?.passthrough) || (inv.billed_through ?? []).length) {
      throw new Error('Esta factura tiene líneas facturadas a través de otra empresa — cambia el cliente desde la pantalla de la factura.');
    }
    const clientName = async (id: string | null) => {
      if (!id) return null;
      const { data } = await ctx.db.from('clients').select('first_name, last_name, company').eq('business_id', ctx.businessId).eq('id', id).maybeSingle();
      return data ? ([data.first_name, data.last_name].filter(Boolean).join(' ') || data.company || '') : undefined;
    };
    const to = asStr(input.client_id)!;
    if (to === inv.client_id) throw new Error('La factura ya es de ese cliente.');
    const [fromName, toName] = await Promise.all([clientName(inv.client_id), clientName(to)]);
    if (toName === undefined) throw new Error('No encontré ese cliente — búscalo con query_clients.');
    ops.push({ op: 'client', client_id: to });
    rows.push({ label: en ? 'Client' : 'Cliente', from: fromName || '—', to: toName || '—' });
    const { count } = await ctx.db.from('jobs').select('id', { count: 'exact', head: true }).eq('invoice_id', inv.id);
    if (count) warnings.push(en ? `Its ${count} job(s) move to the new client too.` : `Sus ${count} trabajo(s) pasan al nuevo cliente también.`);
    warnings.push(en ? 'Line prices stay as they are — they are not re-priced for the new client.' : 'Los precios de las líneas no cambian — no se recalculan con los precios del nuevo cliente.');
  }

  if (input.addons) {
    if (input.move || asStr(input.client_id) || (input.changes?.length ?? 0) || (input.add_lines?.length ?? 0)) {
      throw new Error('Los add-ons van solos — haz los demás cambios en otra llamada.');
    }
    const idx = input.addons.index;
    const l = lines[idx];
    if (!Number.isInteger(idx) || !l) throw new Error(`No existe la línea #${idx}.`);
    if (l.addon) throw new Error('Esa línea ya es un add-on; elige la línea principal.');
    const all = await readAddons(ctx);
    const find = (key: unknown) => {
      const k = String(key ?? '').trim().toLowerCase();
      return all.find(a => a.id === key || a.name.trim().toLowerCase() === k);
    };
    const pick = (list: unknown, on: boolean) => (Array.isArray(list) ? list : []).flatMap(k => {
      const a = find(k);
      if (!a) { warnings.push(`No hay un add-on llamado "${k}" en la lista de precios.`); return []; }
      rows.push({ label: `${lbl(idx)} · ${a.name}`, from: on ? (en ? 'off' : 'no') : (en ? 'on' : 'sí'), to: on ? (en ? 'on' : 'sí') : (en ? 'off' : 'no') });
      return [a.id];
    });
    const on = pick(input.addons.turn_on, true);
    const off = pick(input.addons.turn_off, false);
    if (on.length || off.length) {
      ops.push({ op: 'addons', index: idx, on, off });
      warnings.push(en ? 'The line price is recalculated from the price sheet when you confirm.' : 'El precio de la línea se recalcula con la lista de precios al confirmar.');
    }
  }

  if (input.move) {
    if (asStr(input.client_id) || (input.changes?.length ?? 0) || (input.add_lines?.length ?? 0)) {
      throw new Error('Mover una línea va solo — haz los demás cambios en otra llamada.');
    }
    const idx = input.move.index;
    const l = lines[idx];
    if (!Number.isInteger(idx) || !l) throw new Error(`No existe la línea #${idx}.`);
    const to = await readInvoice(ctx, asStr(input.move.to_invoice_id) ?? '');
    if (to.id === inv.id) throw new Error('Es la misma factura.');
    if (to.status !== 'draft') throw new Error(`La factura ${to.invoice_number} ya fue enviada.`);
    if ((to.client_id ?? null) !== (inv.client_id ?? null)) throw new Error('Solo puedo mover líneas entre facturas del mismo cliente.');
    ops.push({ op: 'move', index: idx, to_invoice_id: to.id });
    const together = l.job_id ? lines.filter(x => x?.job_id === l.job_id).length : 1;
    rows.push({ label: lbl(idx), from: `${inv.invoice_number}: ${show(l)}`, to: to.invoice_number });
    if (together > 1) warnings.push(en ? `This job's ${together} lines move together.` : `Las ${together} líneas de este trabajo se mueven juntas.`);
  }

  for (const c of Array.isArray(input.changes) ? input.changes : []) {
    const idx = c?.index;
    const l = lines[idx];
    if (!Number.isInteger(idx) || !l) { warnings.push(`No existe la línea #${idx}.`); continue; }
    if (c.remove === true) {
      ops.push({ op: 'remove', index: idx });
      rows.push({ label: lbl(idx), from: show(l), to: en ? 'removed' : 'quitada' });
      continue;
    }
    if (typeof c.excluded === 'boolean' && c.excluded !== !!l.excluded) {
      ops.push({ op: 'exclude', index: idx, excluded: c.excluded });
      rows.push({ label: lbl(idx), from: show(l), to: c.excluded ? (en ? 'excluded' : 'excluida') : (en ? 'included' : 'incluida') });
    }
    const op: Extract<InvoiceLineOp, { op: 'update' }> = { op: 'update', index: idx };
    const d = asStr(c.description); if (d && d !== l.description) op.description = d;
    const q = num(c.qty); if (q !== undefined && q !== Number(l.qty)) op.qty = q;
    const r = num(c.rate); if (r !== undefined && r !== Number(l.rate)) op.rate = r;
    if (Object.keys(op).length === 2) continue;
    ops.push(op);
    rows.push({ label: lbl(idx), from: show(l), to: show({ description: op.description ?? l.description, qty: op.qty ?? l.qty, rate: op.rate ?? l.rate }) });
  }

  for (const a of Array.isArray(input.add_lines) ? input.add_lines : []) {
    const description = asStr(a?.description);
    const qty = num(a?.qty) ?? 1;
    const rate = num(a?.rate);
    if (!description || rate === undefined) { warnings.push('Una línea nueva necesita descripción y precio.'); continue; }
    ops.push({ op: 'add', description, qty, rate });
    rows.push({ label: en ? 'New line' : 'Línea nueva', from: '—', to: show({ description, qty, rate }) });
  }

  if (!ops.length) warnings.push('No indicaste ningún cambio.');
  return {
    kind: 'invoice_edit',
    job_id: inv.id,
    invoice_id: inv.id,
    business_id: ctx.businessId,
    title: `${en ? 'Invoice' : 'Factura'} ${inv.invoice_number}`,
    snapshot_hash: lineItemsHash(lines),
    ops,
    detail_rows: rows,
    warnings,
  };
}


// ── Actions the app carries out (invoice jobs, payment, quick quote, client
//    note, new client) + the read-only daily briefing ─────────────────────────

const draftKey = () => randomUUID();
const clientLabel = (c: { first_name?: string | null; last_name?: string | null; company?: string | null } | null) =>
  c ? ([c.first_name, c.last_name].filter(Boolean).join(' ') || c.company || '—') : '—';

async function readClient(ctx: AssistantContext, id: string) {
  const { data } = await ctx.db.from('clients').select('id, first_name, last_name, company')
    .eq('business_id', ctx.businessId).eq('id', id).maybeSingle();
  return data as { id: string; first_name: string | null; last_name: string | null; company: string | null } | null;
}

export async function buildActionDraft(ctx: AssistantContext, name: string, input: ToolInput): Promise<ActionDraft> {
  const en = ctx.locale === 'en';
  const base = { kind: 'action' as const, job_id: draftKey(), business_id: ctx.businessId, warnings: [] as string[] };

  if (name === 'invoice_jobs') {
    const ids = (Array.isArray(input.job_ids) ? input.job_ids : []).filter((x: unknown): x is string => typeof x === 'string');
    if (!ids.length) throw new Error('Faltan los trabajos (job_ids de query_jobs).');
    const { data: jobs, error } = await ctx.db.from('jobs').select('id, title, status, client_id, invoice_id, total_amount')
      .eq('business_id', ctx.businessId).in('id', ids);
    if (error) throw new Error(error.message);
    const found = (jobs ?? []) as { id: string; title: string; status: string; client_id: string | null; invoice_id: string | null; total_amount: number | null }[];
    const bad = found.filter(j => j.status !== 'completed' || j.invoice_id);
    if (bad.length) throw new Error(`Solo se facturan trabajos terminados y sin factura: ${bad.map(j => `"${j.title}" (${j.status})`).join(', ')}.`);
    if (found.length !== ids.length) throw new Error('Algún trabajo no existe en este negocio.');
    const rows = found.map(j => ({ label: en ? 'Job' : 'Trabajo', from: j.title, to: money(j.total_amount) }));
    let to: Awaited<ReturnType<typeof readInvoice>> | null = null;
    if (asStr(input.to_invoice_id)) {
      to = await readInvoice(ctx, input.to_invoice_id);
      if (to.status !== 'draft') throw new Error(`La factura ${to.invoice_number} ya fue enviada.`);
      if (found.some(j => (j.client_id ?? null) !== (to!.client_id ?? null))) base.warnings.push(en ? 'Some jobs belong to another client.' : 'Algún trabajo es de otro cliente.');
    } else if (new Set(found.map(j => j.client_id)).size > 1) {
      base.warnings.push(en ? 'Different clients — one invoice per client.' : 'Son de clientes distintos — se crea una factura por cliente.');
    }
    return {
      ...base, action: 'invoice_jobs',
      title: to ? `${en ? 'Add to invoice' : 'Agregar a la factura'} ${to.invoice_number}` : (en ? 'New invoice' : 'Factura nueva'),
      params: { job_ids: ids, ...(to ? { to_invoice_id: to.id } : {}) },
      detail_rows: rows,
    };
  }

  if (name === 'record_payment') {
    const inv = await readInvoice(ctx, asStr(input.invoice_id) ?? '');
    const amount = num(input.amount);
    if (!amount || amount <= 0) throw new Error('Monto inválido.');
    if (!['sent', 'overdue', 'draft', 'paid'].includes(inv.status)) throw new Error(`La factura está ${inv.status}.`);
    const method = PAY_METHOD_KEYS.includes(input.method) ? input.method : 'other';
    const { data: paidRow } = await ctx.db.from('invoices').select('amount_paid').eq('id', inv.id).maybeSingle();
    const balance = Number(inv.total_amount) - Number((paidRow as any)?.amount_paid ?? 0);
    if (amount > balance + 0.005) base.warnings.push(en ? `More than the balance (${money(balance)}).` : `Es más que el saldo (${money(balance)}).`);
    if (inv.status === 'draft') base.warnings.push(en ? 'This invoice has not been sent yet.' : 'Esta factura aún no se ha enviado.');
    return {
      ...base, action: 'payment',
      title: `${en ? 'Payment' : 'Pago'} · ${en ? 'Invoice' : 'Factura'} ${inv.invoice_number}`,
      params: { invoice_id: inv.id, amount, method, paid_on: asDate(input.paid_on) ?? new Date().toISOString().slice(0, 10) },
      detail_rows: [
        { label: en ? 'Amount' : 'Monto', from: '', to: money(amount) },
        { label: en ? 'Balance' : 'Saldo', from: money(balance), to: money(Math.max(0, balance - amount)) },
      ],
    };
  }

  if (name === 'quick_quote') {
    const title = asStr(input.title);
    if (!title) throw new Error('Falta qué es (title).');
    const clientId = asStr(input.client_id) ?? null;
    const client = clientId ? await readClient(ctx, clientId) : null;
    if (clientId && !client) throw new Error('No encontré ese cliente.');
    const price = num(input.price) ?? null;
    return {
      ...base, action: 'quick_quote', title: en ? 'Quick quote' : 'Cotización rápida',
      params: { client_id: clientId, title, price, notes: asStr(input.notes) ?? null },
      detail_rows: [
        { label: en ? 'Client' : 'Cliente', from: '', to: clientLabel(client) },
        { label: en ? 'What' : 'Qué', from: '', to: title },
        ...(price != null ? [{ label: en ? 'Price' : 'Precio', from: '', to: money(price) }] : []),
      ],
    };
  }

  if (name === 'log_client_note') {
    const client = await readClient(ctx, asStr(input.client_id) ?? '');
    if (!client) throw new Error('No encontré ese cliente.');
    const types = ['call', 'sms', 'email', 'in_person', 'whatsapp', 'note'];
    const outcomes = ['connected', 'no_answer', 'sent', 'left_voicemail'];
    const type = types.includes(input.type) ? input.type : 'note';
    const outcome = outcomes.includes(input.outcome) ? input.outcome : null;
    const note = asStr(input.note)?.slice(0, 2000) ?? null;
    if (type === 'note' && !note) throw new Error('Falta el texto de la nota.');
    return {
      ...base, action: 'client_note', title: `${en ? 'Note' : 'Nota'} · ${clientLabel(client)}`,
      params: { client_id: client.id, type, outcome, note },
      detail_rows: [{ label: en ? 'Log' : 'Registro', from: '', to: [type, outcome, note].filter(Boolean).join(' · ') }],
    };
  }

  if (name === 'create_client') {
    const first = asStr(input.first_name);
    if (!first) throw new Error('Falta el nombre.');
    const digits = String(input.phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (input.phone && digits.length !== 10) base.warnings.push(en ? 'Phone is not 10 digits — left out.' : 'El teléfono no tiene 10 dígitos — no se guarda.');
    const phone = digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : null;
    const email = asStr(input.email) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim()) ? input.email.trim() : null;
    if (input.email && !email) base.warnings.push(en ? 'Invalid email — left out.' : 'Correo inválido — no se guarda.');
    const params = {
      first_name: first, last_name: asStr(input.last_name) ?? null, company: asStr(input.company) ?? null,
      phone_cell: phone, email, address: asStr(input.address) ?? null, city: asStr(input.city) ?? null,
      state: asStr(input.state)?.toUpperCase().slice(0, 2) ?? null, zip_code: asStr(input.zip) ?? null,
    };
    const { data: dupes } = await ctx.db.from('clients').select('id').eq('business_id', ctx.businessId)
      .ilike('first_name', first).ilike('last_name', params.last_name ?? '%').limit(1);
    if (dupes?.length) base.warnings.push(en ? 'A client with this name already exists.' : 'Ya existe un cliente con ese nombre.');
    return {
      ...base, action: 'client_create', title: en ? 'New client' : 'Cliente nuevo', params,
      detail_rows: [
        { label: en ? 'Name' : 'Nombre', from: '', to: clientLabel(params) },
        ...(phone ? [{ label: en ? 'Phone' : 'Teléfono', from: '', to: phone }] : []),
        ...(email ? [{ label: 'Email', from: '', to: email }] : []),
        ...(params.address || params.city ? [{ label: en ? 'Address' : 'Dirección', from: '', to: [params.address, params.city, params.state, params.zip_code].filter(Boolean).join(', ') }] : []),
      ],
    };
  }
  throw new Error(`unknown action: ${name}`);
}

export async function executeDailyBriefing(ctx: AssistantContext, input: ToolInput) {
  const date = asDate(input.date);
  if (!date) throw new Error('Falta la fecha (YYYY-MM-DD).');
  const soon = new Date(new Date(`${date}T00:00:00`).getTime() + 14 * 86_400_000).toISOString().slice(0, 10);
  const [jobsRes, overdueRes, staleRes, sheetsRes, equipRes, lowRes] = await Promise.all([
    ctx.db.from('jobs').select('id, title, status, time_start, all_day, job_city, job_assignments(worker_name, employee_id, is_lead)')
      .eq('business_id', ctx.businessId).is('archived_at', null)
      .not('status', 'in', '("cancelled","declined","posible","proposal","sent")')
      .lte('scheduled_date', date)
      .or(`end_date.gte.${date},and(end_date.is.null,scheduled_date.eq.${date})`)
      .limit(100),
    ctx.db.from('invoices').select('id, total_amount, amount_paid', { count: 'exact' })
      .eq('business_id', ctx.businessId).in('status', ['sent', 'overdue']).lt('due_date', date).limit(500),
    ctx.db.from('jobs').select('id', { count: 'exact', head: true })
      .eq('business_id', ctx.businessId).eq('status', 'posible').is('archived_at', null)
      .lt('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
    ctx.db.from('timesheets').select('employee_id').eq('business_id', ctx.businessId).eq('work_date', date),
    ctx.db.from('equipment').select('name, plate_expiration, insurance_expiration, warranty_expiration')
      .eq('business_id', ctx.businessId)
      .or(`plate_expiration.lte.${soon},insurance_expiration.lte.${soon},warranty_expiration.lte.${soon}`)
      .limit(50),
    ctx.db.from('inventory_items').select('name, quantity, unit', { count: 'exact' })
      .eq('business_id', ctx.businessId).eq('is_low_stock', true).order('quantity').limit(10),
  ]);
  if (jobsRes.error) throw new Error(jobsRes.error.message);
  const jobs = (jobsRes.data ?? []) as any[];
  const clockedIn = new Set(((sheetsRes.data ?? []) as { employee_id: string | null }[]).map(r => r.employee_id).filter(Boolean));
  const crewToday = new Map<string, string>();
  for (const j of jobs) for (const a of j.job_assignments ?? []) if (a.employee_id) crewToday.set(a.employee_id, a.worker_name);
  const overdue = (overdueRes.data ?? []) as { total_amount: number; amount_paid: number | null }[];
  return {
    date,
    jobs: jobs.map(j => ({
      id: j.id, title: j.title, status: j.status, city: j.job_city,
      start: j.all_day ? null : j.time_start,
      crew: (j.job_assignments ?? []).map((a: any) => a.worker_name),
    })),
    jobs_without_crew: jobs.filter(j => !(j.job_assignments ?? []).length).map(j => j.title),
    // Only meaningful once the day has started; timesheets are per work_date.
    crew_not_clocked_in: [...crewToday].filter(([id]) => !clockedIn.has(id)).map(([, name]) => name),
    overdue_invoices: { count: overdueRes.count ?? overdue.length, balance: overdue.reduce((s, i) => s + Number(i.total_amount) - Number(i.amount_paid ?? 0), 0) },
    stale_possibles_30d: staleRes.count ?? 0,
    // Plate / insurance / warranty expired or due within 14 days, soonest first.
    equipment_expiring: ((equipRes.data ?? []) as Record<string, string | null>[]).flatMap(e =>
      (['plate_expiration', 'insurance_expiration', 'warranty_expiration'] as const)
        .filter(k => e[k] && e[k]! <= soon)
        .map(k => ({ equipment: e.name, what: k.replace('_expiration', ''), date: e[k], expired: e[k]! < date })),
    ).sort((a, b) => String(a.date).localeCompare(String(b.date))),
    low_stock: { count: lowRes.count ?? 0, items: (lowRes.data ?? []) },
  };
}


// ── Equipment module ───────────────────────────────────────────────────────

const EQUIP_COLS = 'id, name, equipment_type, make, model, year, color, vin, serial_number, mileage, plate_number, plate_expiration, insurance_carrier, insurance_policy_number, insurance_agent, insurance_agent_phone, insurance_expiration, purchase_date, warranty_expiration, location, paid_off, loan_lender, loan_amount, value, assigned_employee_id, notes';
const EQUIP_TEXT = ['name', 'equipment_type', 'make', 'model', 'color', 'vin', 'serial_number', 'plate_number', 'insurance_carrier', 'insurance_policy_number', 'insurance_agent', 'insurance_agent_phone', 'location', 'loan_lender', 'notes'];
const EQUIP_DATE = ['plate_expiration', 'insurance_expiration', 'purchase_date', 'warranty_expiration'];
const EQUIP_INT = ['year', 'mileage'];
const EQUIP_NUM = ['loan_amount', 'value'];
const EQUIP_LABELS: Record<string, [string, string]> = {
  name: ['Nombre', 'Name'], equipment_type: ['Tipo', 'Type'], make: ['Marca', 'Make'], model: ['Modelo', 'Model'], year: ['Año', 'Year'],
  color: ['Color', 'Color'], vin: ['VIN', 'VIN'], serial_number: ['No. de serie', 'Serial #'], mileage: ['Millaje', 'Mileage'],
  plate_number: ['Placa', 'Plate'], plate_expiration: ['Vence placa', 'Plate expires'], insurance_carrier: ['Aseguradora', 'Insurer'],
  insurance_policy_number: ['Póliza', 'Policy #'], insurance_agent: ['Agente', 'Agent'], insurance_agent_phone: ['Tel. agente', 'Agent phone'],
  insurance_expiration: ['Vence seguro', 'Insurance expires'], purchase_date: ['Compra', 'Purchased'], warranty_expiration: ['Vence garantía', 'Warranty expires'],
  location: ['Ubicación', 'Location'], paid_off: ['Pagado', 'Paid off'], loan_lender: ['Prestamista', 'Lender'], loan_amount: ['Préstamo', 'Loan'],
  value: ['Valor', 'Value'], assigned_employee_id: ['Asignado a', 'Assigned to'], notes: ['Notas', 'Notes'],
};

export async function executeQueryEquipment(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 50, 20);
  let q = ctx.db.from('equipment').select(EQUIP_COLS).eq('business_id', ctx.businessId);
  const term = String(input.search ?? '').replace(/[,().\\"%]/g, '').trim();
  if (term) q = q.or(['name', 'make', 'model', 'plate_number', 'vin', 'serial_number'].map(c => `${c}.ilike.%${term}%`).join(','));
  if (input.assigned_to) {
    const t = String(input.assigned_to).trim().toLowerCase();
    const ids = ctx.employees.filter(e => e.name.toLowerCase().includes(t)).map(e => e.id);
    if (!ids.length) return { total: 0, equipment: [], note: `nadie del roster coincide con "${input.assigned_to}"` };
    q = q.in('assigned_employee_id', ids);
  }
  const days = Number.isInteger(input.expiring_within_days) ? Math.max(0, input.expiring_within_days) : null;
  if (days !== null) {
    const until = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    q = q.or(EQUIP_DATE.filter(c => c !== 'purchase_date').map(c => `${c}.lte.${until}`).join(','));
  }
  const { data, error } = await q.order('name').limit(limit);
  if (error) throw new Error(error.message);
  const nameById = new Map(ctx.employees.map(e => [e.id, e.name]));
  return {
    equipment: (data ?? []).map((r: any) => ({ ...r, assigned_to: r.assigned_employee_id ? nameById.get(r.assigned_employee_id) ?? null : null })),
  };
}

export async function buildEquipmentDraft(ctx: AssistantContext, input: ToolInput): Promise<ActionDraft> {
  const id = asStr(input.equipment_id) ?? '';
  const { data: row, error } = await ctx.db.from('equipment').select(EQUIP_COLS).eq('business_id', ctx.businessId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('No encontré ese equipo — búscalo con query_equipment.');
  const cur = row as Record<string, any>;
  const en = ctx.locale === 'en';
  const warnings: string[] = [];
  const patch: Record<string, unknown> = {};
  for (const k of EQUIP_TEXT) if (typeof input[k] === 'string') patch[k] = input[k].trim() || null;
  for (const k of EQUIP_DATE) if (typeof input[k] === 'string') {
    if (input[k] === '') patch[k] = null;
    else if (asDate(input[k])) patch[k] = input[k];
    else warnings.push(`Fecha inválida para ${EQUIP_LABELS[k][0]}.`);
  }
  for (const k of EQUIP_INT) if (Number.isInteger(input[k]) && input[k] >= 0) patch[k] = input[k];
  for (const k of EQUIP_NUM) if (num(input[k]) !== undefined && input[k] >= 0) patch[k] = input[k];
  if (typeof input.paid_off === 'boolean') patch.paid_off = input.paid_off;
  if (typeof input.assigned_employee_id === 'string') {
    const e = input.assigned_employee_id.trim();
    if (e && !ctx.employees.some(x => x.id === e)) warnings.push('Ese empleado no está en el roster.');
    else patch.assigned_employee_id = e || null;
  }
  if (typeof patch.insurance_agent_phone === 'string') {
    const d = patch.insurance_agent_phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    patch.insurance_agent_phone = d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : patch.insurance_agent_phone;
  }
  if (patch.name === null) { delete patch.name; warnings.push('El nombre no puede quedar vacío.'); }
  // Same rule as the equipment form: paid off → no loan.
  if (patch.paid_off === true) { patch.loan_lender = null; patch.loan_amount = null; }
  for (const k of Object.keys(patch)) if ((patch[k] ?? null) === (cur[k] ?? null)) delete patch[k];
  if (!Object.keys(patch).length) throw new Error('No indicaste ningún cambio distinto a lo que ya tiene.');

  const nameById = new Map(ctx.employees.map(e => [e.id, e.name]));
  const show = (k: string, v: unknown) =>
    v == null || v === '' ? '—'
      : k === 'assigned_employee_id' ? nameById.get(String(v)) ?? '—'
        : k === 'paid_off' ? (v ? (en ? 'yes' : 'sí') : 'no')
          : EQUIP_NUM.includes(k) ? money(v)
            : String(v).length > 80 ? `${String(v).slice(0, 77)}…` : String(v);
  const before = Object.fromEntries(Object.keys(patch).map(k => [k, cur[k] ?? null]));
  return {
    kind: 'action', job_id: randomUUID(), business_id: ctx.businessId, warnings,
    action: 'equipment_update',
    title: `${en ? 'Equipment' : 'Equipo'} · ${cur.name}`,
    params: { equipment_id: id, patch, before },
    detail_rows: Object.keys(patch).map(k => ({ label: EQUIP_LABELS[k][en ? 1 : 0], from: show(k, cur[k]), to: show(k, patch[k]) })),
  };
}


// ── Inventory ──────────────────────────────────────────────────────────────

const INV_COLS = 'id, name, sku, quantity, unit, unit_cost, category, low_stock_threshold, is_low_stock';

export async function executeQueryInventory(ctx: AssistantContext, input: ToolInput) {
  const limit = clamp(input.limit, 50, 20);
  let q = ctx.db.from('inventory_items').select(INV_COLS).eq('business_id', ctx.businessId);
  const term = String(input.search ?? '').replace(/[,().\\"%]/g, '').trim();
  if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
  if (asStr(input.category)) q = q.ilike('category', `%${String(input.category).replace(/[%,()]/g, '')}%`);
  if (input.low_stock_only === true) q = q.eq('is_low_stock', true);
  const { data, error } = await q.order('name').limit(limit);
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
}

export async function buildInventoryDraft(ctx: AssistantContext, input: ToolInput): Promise<ActionDraft> {
  const id = asStr(input.item_id) ?? '';
  const { data: row, error } = await ctx.db.from('inventory_items').select(INV_COLS).eq('business_id', ctx.businessId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error('No encontré ese artículo — búscalo con query_inventory.');
  const cur = row as Record<string, any>;
  const en = ctx.locale === 'en';
  const warnings: string[] = [];
  const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined);

  const set = int(input.set_quantity);
  const delta = set !== undefined ? null : (int(input.add) ?? 0) - (int(input.remove) ?? 0) || null;
  if (set === undefined && delta !== null && cur.quantity + delta < 0) {
    warnings.push(en ? `Only ${cur.quantity} in stock — it will go to 0.` : `Solo hay ${cur.quantity} — quedará en 0.`);
  }
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'unit', 'category', 'sku']) if (typeof input[k] === 'string') patch[k] = input[k].trim() || null;
  if (patch.name === null) { delete patch.name; warnings.push('El nombre no puede quedar vacío.'); }
  if (patch.unit === null) delete patch.unit; // NOT NULL column
  if (num(input.unit_cost) !== undefined && input.unit_cost >= 0) patch.unit_cost = input.unit_cost;
  if (int(input.low_stock_threshold) !== undefined) patch.low_stock_threshold = input.low_stock_threshold;
  for (const k of Object.keys(patch)) if ((patch[k] ?? null) === (cur[k] ?? null)) delete patch[k];
  if (set === cur.quantity && !Object.keys(patch).length && !delta) throw new Error('Ya tiene esa cantidad.');
  if (set === undefined && !delta && !Object.keys(patch).length) throw new Error('No indicaste ningún cambio.');

  const L: Record<string, [string, string]> = {
    name: ['Nombre', 'Name'], unit: ['Unidad', 'Unit'], unit_cost: ['Costo', 'Cost'], category: ['Categoría', 'Category'],
    sku: ['SKU', 'SKU'], low_stock_threshold: ['Mínimo', 'Low-stock at'],
  };
  const show = (k: string, v: unknown) => (v == null || v === '' ? '—' : k === 'unit_cost' ? money(v) : String(v));
  const rows: ActionDraft['detail_rows'] = [];
  const unit = cur.unit ? ` ${cur.unit}` : '';
  if (set !== undefined && set !== cur.quantity) rows.push({ label: en ? 'In stock' : 'Existencia', from: `${cur.quantity}${unit}`, to: `${set}${unit}` });
  if (delta) rows.push({ label: en ? 'In stock' : 'Existencia', from: `${cur.quantity}${unit}`, to: `${Math.max(0, cur.quantity + delta)}${unit} (${delta > 0 ? '+' : ''}${delta})` });
  for (const k of Object.keys(patch)) rows.push({ label: L[k][en ? 1 : 0], from: show(k, cur[k]), to: show(k, patch[k]) });
  return {
    kind: 'action', job_id: randomUUID(), business_id: ctx.businessId, warnings,
    action: 'inventory_update',
    title: `${en ? 'Inventory' : 'Inventario'} · ${cur.name}`,
    params: {
      item_id: id, delta, set_quantity: set !== undefined && set !== cur.quantity ? set : null, patch,
      before: Object.fromEntries([...Object.keys(patch), ...(set !== undefined ? ['quantity'] : [])].map(k => [k, cur[k] ?? null])),
    },
    detail_rows: rows,
  };
}


// ── Reports ────────────────────────────────────────────────────────────────

/** Midnight of a YYYY-MM-DD in an IANA timezone, as a UTC instant. */
function zonedMidnight(ymd: string, tz: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`);
  // Offset of `tz` at that moment: render the instant there and diff.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess).reduce<Record<string, string>>((a, p) => ({ ...a, [p.type]: p.value }), {});
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

export async function executeBusinessReport(ctx: AssistantContext, input: ToolInput) {
  if (!ctx.canSeeReports) throw new Error('Tu rol no tiene acceso a reportes — díselo al usuario.');
  const from = asDate(input.from);
  const to = asDate(input.to);
  if (!from || !to || from > to) throw new Error('Periodo inválido (from/to YYYY-MM-DD).');
  const start = zonedMidnight(from, ctx.tz);
  const [ty, tm, td] = to.split('-').map(Number);
  const nextDay = new Date(Date.UTC(ty, tm - 1, td + 1)).toISOString().slice(0, 10);
  const end = new Date(zonedMidnight(nextDay, ctx.tz).getTime() - 1);
  const [fy, fm] = from.split('-').map(Number);
  const months = Math.min(24, (ty - fy) * 12 + (tm - fm) + 1);

  const [ov, top] = await Promise.all([
    ctx.db.rpc('reports_overview', {
      p_business_id: ctx.businessId,
      p_from: start.toISOString(),
      p_to: end.toISOString(),
      p_bucket_start: `${from.slice(0, 7)}-01`,
      p_bucket_months: months,
      p_tz: ctx.tz,
      p_include_inventory: true,
      p_location_id: null,
    }),
    ctx.db.rpc('dashboard_top_clients', { p_business_id: ctx.businessId, p_start: start.toISOString(), p_limit: 5, p_location_id: null }),
  ]);
  if (ov.error) throw new Error(ov.error.message);
  const o = (ov.data ?? {}) as Record<string, any>;
  const n = (k: string) => Number(o[k] ?? 0) || 0;
  // Same average-per-job rule as the Reports screen.
  const avgPerJob = n('pricedJobsCount') ? n('pricedJobsSum') / n('pricedJobsCount')
    : n('perJobCount') ? n('perJobSum') / n('perJobCount')
      : n('invoicesTotal') ? n('invoicesSum') / n('invoicesTotal') : 0;
  return {
    period: { from, to },
    // Invoices dated in the period that are paid (own share; bill-through excluded).
    paid_invoices_total: n('totalRevenue'),
    pending_to_collect: n('pendingRevenue'),
    overdue_to_collect: n('overdueRevenue'),
    invoices: { total: n('invoicesTotal'), paid: n('paidInvoicesCount'), by_status: o.invoiceStatus ?? [] },
    jobs: { total: n('jobsTotal'), completed: n('completedJobsCount'), by_status: o.jobStatus ?? [] },
    avg_per_job: Math.round(avgPerJob * 100) / 100,
    clients: { new: n('newClientsCount'), total: n('totalClientsCount') },
    monthly_revenue: o.monthlyRevenue ?? [],
    by_branch: o.byLocation ?? [],
    // Top clients from `from` until today (not capped at `to`).
    top_clients_since_from: ((top.data ?? []) as any[]).map(c => ({ name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company, total: Number(c.total) })),
    inventory: { items: n('inventoryItemsCount'), value: n('inventoryValue'), low_stock: n('lowStock'), out_of_stock: n('outOfStock') },
  };
}
