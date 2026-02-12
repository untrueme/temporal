import 'dotenv/config';
import Fastify from 'fastify';
import { Connection, Client } from '@temporalio/client';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import path from 'path';
import { TASK_QUEUE, TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE } from './config.js';
import { registerHandlersRoutes } from './handlersRoutes.js';
import {
  createDocTemplateRegistry,
  normalizeDocType,
  validateDocRoute,
} from './utils/docTemplates.js';

// Абсолютный путь до папки UI-страниц.
const UI_ROOT = fileURLToPath(new URL('./ui', import.meta.url));
// Абсолютный путь до папки статических ассетов UI.
const UI_ASSETS_ROOT = path.join(UI_ROOT, 'assets');

// Маршруты UI-страниц -> соответствующие HTML-файлы.
const PAGE_FILES = {
  '/ui': 'index.html',
  '/ui/': 'index.html',
  '/ui/index.html': 'index.html',
  '/ui/doc': 'doc.html',
  '/ui/doc/': 'doc.html',
  '/ui/doc-templates': 'doc-templates.html',
  '/ui/doc-templates/': 'doc-templates.html',
  '/ui/tickets': 'tickets.html',
  '/ui/tickets/': 'tickets.html',
  '/ui/trip': 'trip.html',
  '/ui/trip/': 'trip.html',
};

// Разрешенный whitelist файлов ассетов и их content-type.
const ASSET_FILES = {
  'ui.css': 'text/css; charset=utf-8',
  'doc-app.js': 'application/javascript; charset=utf-8',
  'doc-templates-app.js': 'application/javascript; charset=utf-8',
  'ticket-app.js': 'application/javascript; charset=utf-8',
  'trip-app.js': 'application/javascript; charset=utf-8',
};

// Строит конфиг URL-ов handlers app (doc/sd/trip).
function buildHandlersConfig() {
  // По умолчанию handlers встроены в API на том же порту.
  const apiPort = Number(process.env.PORT || 3007);
  // Явно задаваемый базовый URL API (удобно для прокси/докера).
  const apiBaseUrl =
    process.env.API_BASE_URL ||
    (Number.isFinite(apiPort) ? `http://localhost:${apiPort}` : 'http://localhost:3007');
  return {
    doc: process.env.APP_URL || `${apiBaseUrl}/handlers`,
    sd: process.env.SD_APP_URL || `${apiBaseUrl}/sd`,
    trip: process.env.TRIP_APP_URL || `${apiBaseUrl}/trip`,
    default: process.env.APP_URL || `${apiBaseUrl}/handlers`,
  };
}

// Базовая валидация входного DSL-маршрута.
function ensureRoute(route) {
  try {
    validateDocRoute(route);
  } catch (error) {
    const err = new Error(error?.message || 'route.nodes is required');
    err.statusCode = 400;
    throw err;
  }
}

// Для негативных решений требуем непустой комментарий причины.
function validateApprovalComment(decision, comment) {
  const normalized =
    decision === 'decline'
      ? 'reject'
      : decision === 'need_changes'
        ? 'needs_changes'
        : decision;
  const negative = normalized === 'reject' || normalized === 'needs_changes';
  if (!negative) return null;
  if (typeof comment === 'string' && comment.trim().length > 0) return null;
  const err = new Error('comment is required for decline or need_changes');
  err.statusCode = 400;
  return err;
}

// Для сигнала самоотказа обязателен непустой reason.
function validateSelfWithdrawReason(reason) {
  if (typeof reason === 'string' && reason.trim().length > 0) return null;
  const err = new Error('reason is required for self-withdraw');
  err.statusCode = 400;
  return err;
}

// Унифицирует извлечение текстового сообщения ошибки.
function toTextErrorMessage(error) {
  if (!error) return 'unknown temporal error';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  return String(error);
}

// Маппинг внутренних/Temporal ошибок в стабильные API-коды.
function mapTemporalError(error) {
  const text = toTextErrorMessage(error);
  const lower = text.toLowerCase();

  if (lower.includes('already completed')) {
    return {
      statusCode: 409,
      code: 'workflow_execution_completed',
      message: 'workflow execution already completed',
    };
  }

  if (lower.includes('not found')) {
    return {
      statusCode: 404,
      code: 'workflow_not_found',
      message: 'workflow not found',
    };
  }

  if (
    lower.includes('did not register a handler for getprogress') ||
    lower.includes('failed to query workflow')
  ) {
    return {
      statusCode: 409,
      code: 'progress_query_unavailable',
      message: 'progress query is not available for this workflow run',
    };
  }

  return {
    statusCode: 500,
    code: 'temporal_error',
    message: text,
  };
}

// Отправляет клиенту структурированную ошибку Temporal.
function sendTemporalError(reply, error) {
  const mapped = mapTemporalError(error);
  reply.code(mapped.statusCode).send({
    statusCode: mapped.statusCode,
    code: mapped.code,
    error: 'Temporal Error',
    message: mapped.message,
  });
}

// Отдает UI HTML-файл по имени.
async function sendPage(reply, fileName) {
  const filePath = path.join(UI_ROOT, fileName);
  const body = await readFile(filePath, 'utf8');
  reply.header('content-type', 'text/html; charset=utf-8').send(body);
}

// Небольшая задержка (используется в retry query progress).
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Создает и конфигурирует Fastify API + подключение к Temporal.
export async function buildApi() {
  // HTTP-сервер API.
  const app = Fastify({ logger: true });
  // Подключение к Temporal Frontend.
  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  // Клиент Temporal SDK в нужном namespace.
  const client = new Client({ connection, namespace: TEMPORAL_NAMESPACE });
  // In-memory fallback реестр doc-workflow id в рамках процесса API.
  const docWorkflowIds = new Set();
  // Реестр шаблонов маршрутов по типам документов.
  const docTemplateRegistry = createDocTemplateRegistry();

  // Корректно закрываем TCP-соединение с Temporal при остановке API.
  app.addHook('onClose', async () => {
    await connection.close();
  });

  // Корневой маршрут редиректит на UI.
  app.get('/', async (_, reply) => {
    return reply.redirect('/ui');
  });

  // Регистрируем встроенные handlers endpoint-ы (в одном процессе с API).
  registerHandlersRoutes(app);

  // Список доступных шаблонов document workflow по типу документа.
  app.get('/workflows/doc/templates', async (_, reply) => {
    reply.send({ items: docTemplateRegistry.list() });
  });

  // Получение конкретного шаблона document workflow по docType.
  app.get('/workflows/doc/templates/:docType', async (req, reply) => {
    const { docType } = req.params;
    const normalizedType = normalizeDocType(docType);
    if (!normalizedType) {
      reply.code(400).send({ error: 'invalid docType' });
      return;
    }
    const template = docTemplateRegistry.get(normalizedType);
    if (!template) {
      reply.code(404).send({ error: `template for docType "${normalizedType}" not found` });
      return;
    }
    reply.send(template);
  });

  // Обновление/создание шаблона document workflow по docType.
  app.put('/workflows/doc/templates/:docType', async (req, reply) => {
    try {
      const { docType } = req.params;
      const body = req.body || {};
      const normalizedType = normalizeDocType(docType);
      if (!normalizedType) {
        reply.code(400).send({ error: 'invalid docType' });
        return;
      }
      ensureRoute(body.route);
      const saved = docTemplateRegistry.upsert({
        docType: normalizedType,
        name: body.name,
        description: body.description,
        route: body.route,
      });
      reply.send({ ok: true, template: saved });
    } catch (error) {
      reply.code(error?.statusCode || 400).send({ error: error?.message || 'failed to save template' });
    }
  });

  // Регистрируем все UI-страницы.
  for (const [routePath, fileName] of Object.entries(PAGE_FILES)) {
    app.get(routePath, async (_, reply) => sendPage(reply, fileName));
  }

  // Роут отдачи статических ассетов UI.
  app.get('/ui/assets/:file', async (req, reply) => {
    const { file } = req.params;
    const contentType = ASSET_FILES[file];
    if (!contentType) {
      reply.code(404).send({ error: 'asset_not_found' });
      return;
    }
    const filePath = path.join(UI_ASSETS_ROOT, file);
    const body = await readFile(filePath, 'utf8');
    reply.header('content-type', contentType).send(body);
  });

  // Старт document workflow (case 1).
  app.post('/workflows/doc/start', async (req, reply) => {
    try {
      const body = req.body || {};
      const explicitDocTypeProvided = Object.prototype.hasOwnProperty.call(body, 'docType');
      const normalizedType = normalizeDocType(body.docType || 'candidate_hiring');
      if (explicitDocTypeProvided && !normalizedType) {
        reply.code(400).send({ error: 'invalid docType' });
        return;
      }
      const docType = normalizedType || 'candidate_hiring';

      let route = body.route;
      let templateMeta = null;
      if (route) {
        ensureRoute(route);
      } else {
        const template = docTemplateRegistry.get(docType);
        if (!template) {
          reply.code(404).send({ error: `template for docType "${docType}" not found` });
          return;
        }
        route = template.route;
        templateMeta = {
          name: template.name,
          updatedAt: template.updatedAt,
        };
      }

      // Если docId не передан, генерируем UUID.
      const docId = body.docId || globalThis.crypto.randomUUID();
      const handlers = buildHandlersConfig();

      // Входные данные для jsonDAGWorkflow.
      const context = {
        ...(body.context || {}),
        docHandlers: handlers.doc,
        docType,
        routeTemplateName: templateMeta?.name || null,
        routeTemplateUpdatedAt: templateMeta?.updatedAt || null,
      };
      const input = {
        processType: 'doc',
        docId,
        doc: body.doc || {},
        context,
        route,
        handlers,
      };

      // Создаем execution с workflowId вида doc-<docId>.
      const handle = await client.workflow.start('jsonDAGWorkflow', {
        args: [input],
        taskQueue: TASK_QUEUE,
        workflowId: `doc-${docId}`,
      });
      docWorkflowIds.add(handle.workflowId);
      reply.send({
        workflowId: handle.workflowId,
        runId: handle.firstExecutionRunId,
        docType,
        routeTemplateName: templateMeta?.name || null,
      });
    } catch (error) {
      sendTemporalError(reply, error);
    }
  });

  // Список doc-workflow executions для левой панели UI.
  app.get('/workflows/doc/list', async (req, reply) => {
    try {
      const limitRaw = Number(req.query?.limit ?? 50);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 50;
      // Для закрытых execution вытаскиваем бизнес-статус из результата workflow.
      const enrichWithBusinessStatus = async (items) => {
        return Promise.all(
          (items || []).map(async (item) => {
            const temporalStatus = String(item?.status || '').toLowerCase();
            if (temporalStatus !== 'completed') {
              return item;
            }
            try {
              const handle = client.workflow.getHandle(item.workflowId);
              const result = await handle.result();
              const businessStatus = String(result?.status || '').toLowerCase();
              if (!businessStatus || businessStatus === 'completed') {
                return {
                  ...item,
                  temporalStatus,
                  businessStatus: businessStatus || temporalStatus,
                };
              }
              return {
                ...item,
                temporalStatus,
                businessStatus,
                status: businessStatus,
                statusName: businessStatus.toUpperCase(),
              };
            } catch {
              return item;
            }
          })
        );
      };

      try {
        // Основной способ: visibility query по workflow type/id.
        const visibilityItems = [];
        for await (const wf of client.workflow.list({
          query: 'WorkflowType = "jsonDAGWorkflow" AND WorkflowId STARTS_WITH "doc-"',
          pageSize: limit,
        })) {
          visibilityItems.push({
            workflowId: wf.workflowId,
            runId: wf.runId,
            status: wf.status?.name?.toLowerCase() || 'unknown',
            statusName: wf.status?.name || 'UNKNOWN',
            startTime: wf.startTime ? wf.startTime.toISOString() : null,
            closeTime: wf.closeTime ? wf.closeTime.toISOString() : null,
          });
          if (visibilityItems.length >= limit) break;
        }

        if (visibilityItems.length > 0) {
          const enriched = await enrichWithBusinessStatus(visibilityItems);
          reply.send({ items: enriched });
          return;
        }
      } catch (visibilityError) {
        // Fallback: при проблемах visibility логируем и используем local registry.
        app.log.warn(
          { err: visibilityError },
          'Visibility listing failed, fallback to in-memory doc workflow registry'
        );
      }

      // Fallback-режим по локальному Set docWorkflowIds.
      const workflowIds = [...docWorkflowIds].slice(-limit).reverse();
      const fallbackItems = await Promise.all(
        workflowIds.map(async (workflowId) => {
          const handle = client.workflow.getHandle(workflowId);
          try {
            const description = await handle.describe();
            return {
              workflowId,
              runId: description.runId,
              status: description.status?.name?.toLowerCase() || 'unknown',
              statusName: description.status?.name || 'UNKNOWN',
              startTime: description.startTime ? description.startTime.toISOString() : null,
              closeTime: description.closeTime ? description.closeTime.toISOString() : null,
            };
          } catch (error) {
            const mapped = mapTemporalError(error);
            return {
              workflowId,
              runId: null,
              status: mapped.code === 'workflow_not_found' ? 'not_found' : 'unknown',
              statusName: mapped.code.toUpperCase(),
              startTime: null,
              closeTime: null,
              error: mapped.message,
            };
          }
        })
      );

      const enrichedFallback = await enrichWithBusinessStatus(fallbackItems);
      reply.send({ items: enrichedFallback });
    } catch (error) {
      sendTemporalError(reply, error);
    }
  });

  // Отправка approval-сигнала в document workflow.
  app.post('/workflows/doc/:id/approval', async (req, reply) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      // Валидация обязательного комментария для негативных решений.
      const validationError = validateApprovalComment(body.decision, body.comment);
      if (validationError) {
        reply.code(validationError.statusCode || 400).send({ error: validationError.message });
        return;
      }
      const handle = client.workflow.getHandle(id);
      await handle.signal('approval', {
        nodeId: body.nodeId,
        actor: body.actor,
        decision: body.decision,
        comment: body.comment,
        returnToNodeId: body.returnToNodeId,
      });
      docWorkflowIds.add(id);
      reply.send({ ok: true });
    } catch (error) {
      sendTemporalError(reply, error);
    }
  });

  // Отправка произвольного processEvent-сигнала в document workflow.
  app.post('/workflows/doc/:id/event', async (req, reply) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const handle = client.workflow.getHandle(id);
      await handle.signal('processEvent', {
        eventName: body.eventName,
        data: body.data || {},
      });
      docWorkflowIds.add(id);
      reply.send({ ok: true });
    } catch (error) {
      sendTemporalError(reply, error);
    }
  });

  // Независимый сигнал самоотказа кандидата: завершает процесс.
  app.post('/workflows/doc/:id/self-withdraw', async (req, reply) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const validationError = validateSelfWithdrawReason(body.reason);
      if (validationError) {
        reply.code(validationError.statusCode || 400).send({ error: validationError.message });
        return;
      }
      const handle = client.workflow.getHandle(id);
      await handle.signal('selfWithdraw', {
        actor: body.actor || 'candidate',
        reason: body.reason,
      });
      docWorkflowIds.add(id);
      reply.send({ ok: true });
    } catch (error) {
      sendTemporalError(reply, error);
    }
  });

  // Query прогресса document workflow по getProgress.
  app.get('/workflows/doc/:id/progress', async (req, reply) => {
    try {
      const { id } = req.params;
      const handle = client.workflow.getHandle(id);
      const maxAttempts = 5;
      let lastError = null;

      // Retry нужен, чтобы переждать короткое окно "query handler not registered yet".
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const progress = await handle.query('getProgress');
          docWorkflowIds.add(id);
          reply.send(progress);
          return;
        } catch (error) {
          const mapped = mapTemporalError(error);
          if (mapped.code !== 'progress_query_unavailable' || attempt === maxAttempts) {
            lastError = error;
            break;
          }
          // Небольшой backoff перед повтором.
          await sleep(120 * attempt);
        }
      }

      sendTemporalError(reply, lastError || new Error('progress query unavailable'));
    } catch (error) {
      sendTemporalError(reply, error);
    }
  });

  // Старт service desk workflow (case 2).
  app.post('/tickets/start', async (req, reply) => {
    const body = req.body || {};
    const ticketId = body.ticketId || globalThis.crypto.randomUUID();
    const handlers = buildHandlersConfig();

    const input = {
      ticketId,
      ticket: body.ticket || {},
      policy: body.policy || {},
      handlers,
    };

    const handle = await client.workflow.start('serviceDeskTicket', {
      args: [input],
      taskQueue: TASK_QUEUE,
      workflowId: `ticket-${ticketId}`,
    });

    reply.send({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId });
  });

  // Отправка signal ticketEvent в service desk execution.
  app.post('/tickets/:id/event', async (req, reply) => {
    const { id } = req.params;
    const body = req.body || {};
    const handle = client.workflow.getHandle(id);
    await handle.signal('ticketEvent', {
      type: body.type,
      data: body.data || {},
      actor: body.actor,
    });
    reply.send({ ok: true });
  });

  // Query текущего ticket state.
  app.get('/tickets/:id/state', async (req, reply) => {
    const { id } = req.params;
    const handle = client.workflow.getHandle(id);
    const state = await handle.query('getState');
    reply.send(state);
  });

  // Старт trip/process workflow (case 3).
  app.post('/process/start', async (req, reply) => {
    const body = req.body || {};
    ensureRoute(body.route);

    const tripId = body.tripId || globalThis.crypto.randomUUID();
    const handlers = buildHandlersConfig();

    const context = {
      ...(body.context || {}),
      tripHandlers: handlers.trip,
    };

    const input = {
      processType: 'trip',
      tripId,
      doc: body.doc || {},
      context,
      route: body.route,
      handlers,
    };

    const handle = await client.workflow.start('jsonDAGWorkflow', {
      args: [input],
      taskQueue: TASK_QUEUE,
      workflowId: `trip-${tripId}`,
    });

    reply.send({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId });
  });

  // Approval-сигнал для trip/process workflow.
  app.post('/process/:id/approval', async (req, reply) => {
    const { id } = req.params;
    const body = req.body || {};
    const validationError = validateApprovalComment(body.decision, body.comment);
    if (validationError) {
      reply.code(validationError.statusCode || 400).send({ error: validationError.message });
      return;
    }
    const handle = client.workflow.getHandle(id);
    await handle.signal('approval', {
      nodeId: body.nodeId,
      actor: body.actor,
      decision: body.decision,
      comment: body.comment,
    });
    reply.send({ ok: true });
  });

  // Event-сигнал для trip/process workflow.
  app.post('/process/:id/event', async (req, reply) => {
    const { id } = req.params;
    const body = req.body || {};
    const handle = client.workflow.getHandle(id);
    await handle.signal('processEvent', {
      eventName: body.eventName,
      data: body.data || {},
    });
    reply.send({ ok: true });
  });

  // Независимый сигнал самоотказа для process/trip workflow.
  app.post('/process/:id/self-withdraw', async (req, reply) => {
    const { id } = req.params;
    const body = req.body || {};
    const validationError = validateSelfWithdrawReason(body.reason);
    if (validationError) {
      reply.code(validationError.statusCode || 400).send({ error: validationError.message });
      return;
    }
    const handle = client.workflow.getHandle(id);
    await handle.signal('selfWithdraw', {
      actor: body.actor || 'candidate',
      reason: body.reason,
    });
    reply.send({ ok: true });
  });

  // Query прогресса trip/process workflow.
  app.get('/process/:id/progress', async (req, reply) => {
    const { id } = req.params;
    const handle = client.workflow.getHandle(id);
    const progress = await handle.query('getProgress');
    reply.send(progress);
  });

  // Возвращаем готовый Fastify app (для тестов и запуска).
  return app;
}

// CLI-режим запуска API как отдельного процесса.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await buildApi();
  const port = Number(process.env.PORT || 3007);
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`API listening on ${port}`);
}
