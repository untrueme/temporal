import Fastify from 'fastify';
import { fileURLToPath } from 'url';

// Это базовый порт handlers-приложения по умолчанию.
const DEFAULT_HANDLERS_PORT = 4001;
// Это хост, на котором слушает HTTP-сервер внутри контейнера/локально.
const DEFAULT_HOST = '0.0.0.0';
// Это ограничение, до какого порта мы пробуем подняться при конфликте.
const MAX_PORT_ATTEMPTS = 20;

function syntheticCompute(payload) {
  // Берем числовую сумму из payload, если она есть.
  const base = typeof payload?.amount === 'number' ? payload.amount : 10;
  // Возвращаем синтетический результат вычисления для демо.
  return {
    // Условный "score" для имитации обработки.
    score: Math.round(base * 1.7),
    // Время вычисления результата.
    timestamp: new Date().toISOString(),
  };
}

export async function buildHandlersApp() {
  // Создаем экземпляр Fastify с включенными логами.
  const app = Fastify({ logger: true });

  // Роут для документного кейса (универсальный обработчик по action).
  app.post('/handlers/:action', async (req, reply) => {
    // Читаем action из URL-параметра.
    const { action } = req.params;
    // Берем входной JSON или пустой объект.
    const payload = req.body || {};
    // Формируем базовый успешный ответ.
    let result = {
      // Флаг успешной обработки.
      ok: true,
      // Имя действия.
      action,
      // Синтетическое вычисление.
      computed: syntheticCompute(payload),
      // Эхо входных данных для отладки.
      received: payload,
    };

    // Gate-операции: вычисляем score и отдаём PASS/FAIL как часть бизнес-процесса.
    if (action.startsWith('gate.')) {
      const stage = String(payload.stage || action.replace('gate.', '') || 'generic');
      const cost = Number(payload.cost ?? 0);
      const approvalsRequired = Number(payload.approvalsRequired ?? 2);
      const threshold = stage.includes('finance') ? 70 : 60;
      const score = Math.max(0, Math.round(92 - cost / 6 + approvalsRequired * 4));
      const status = score >= threshold ? 'PASS' : 'FAIL';

      result = {
        ...result,
        gate: {
          stage,
          score,
          threshold,
          status,
          reason: status === 'PASS' ? 'risk acceptable' : 'risk too high',
        },
      };
    }

    // Для pre.* шагов добавляем имитацию policy pre-check.
    if (action.startsWith('pre.')) {
      // Это демонстрационный pre-процессор перед исполнением шага.
      result = {
        // Сохраняем базовые поля результата.
        ...result,
        // Добавляем подробности pre-check.
        precheck: {
          // Версия условной политики.
          policyVersion: 'v1',
          // Признак, что актор допущен.
          actorAllowed: true,
          // Признак, что блокировка на изменение получена.
          lockAcquired: true,
          // Статус валидации.
          validation: 'ok',
        },
      };
    }

    // Для kafka.snapshot имитируем публикацию снапшота в Kafka.
    if (action === 'kafka.snapshot' || action.startsWith('kafka.snapshot')) {
      // Это демонстрационный post-процессор для истории изменений.
      result = {
        // Сохраняем базовые поля результата.
        ...result,
        // Добавляем блок метаданных "Kafka".
        kafka: {
          // Топик берется из payload или используется дефолтный.
          topic: payload.topic || 'doc.history.snapshots',
          // Ключ сообщения формируем из docId/workflowId.
          key: payload.docId || payload.workflowId || 'unknown',
          // Фиксированный partition для демо.
          partition: 0,
          // Имитация смещения (offset).
          offset: Date.now(),
          // Время публикации.
          publishedAt: new Date().toISOString(),
        },
      };
      // Пишем диагностический лог "публикации" снапшота.
      console.log('[kafka] snapshot published', {
        // Топик публикации.
        topic: result.kafka.topic,
        // Ключ публикации.
        key: result.kafka.key,
        // Узел workflow, где сработал post-hook.
        nodeId: payload.nodeId,
        // Фаза hook-а (pre/post).
        phase: payload.phase,
        // Итоговый статус шага.
        stepStatus: payload.stepStatus,
      });
    }

    // Логируем входящий документный запрос для корреляции.
    console.log('[handlers] doc', {
      // Имя действия.
      action,
      // Идентификатор документа.
      docId: payload.docId,
      // Идентификатор узла DAG.
      nodeId: payload.nodeId,
      // Фаза pre/post.
      phase: payload.phase,
    });
    // Отдаем JSON-ответ клиенту.
    reply.send(result);
  });

  // Роут для service desk кейса.
  app.post('/sd/:action', async (req, reply) => {
    // Читаем action из URL.
    const { action } = req.params;
    // Читаем JSON-тело.
    const payload = req.body || {};
    // Формируем стандартный ответ.
    const result = {
      // Флаг успеха.
      ok: true,
      // Имя действия.
      action,
      // Синтетические вычисления.
      computed: syntheticCompute(payload),
      // Эхо payload.
      received: payload,
    };
    // Логируем вызов service desk обработчика.
    console.log('[handlers] sd', {
      // Action.
      action,
      // Корреляция по тикету.
      ticketId: payload.ticketId,
      // Корреляция по nodeId.
      nodeId: payload.nodeId,
    });
    // Возвращаем JSON.
    reply.send(result);
  });

  // Роут для travel/process кейса.
  app.post('/trip/:action', async (req, reply) => {
    // Извлекаем action из URL.
    const { action } = req.params;
    // Извлекаем тело запроса.
    const payload = req.body || {};
    // Собираем итоговый результат.
    const result = {
      // Признак успешного ответа.
      ok: true,
      // Action запроса.
      action,
      // Синтетическая обработка.
      computed: syntheticCompute(payload),
      // Эхо входа.
      received: payload,
    };
    // Логируем вызов trip обработчика.
    console.log('[handlers] trip', {
      // Имя действия.
      action,
      // Корреляция по tripId.
      tripId: payload.tripId,
      // Корреляция по nodeId.
      nodeId: payload.nodeId,
    });
    // Отправляем ответ.
    reply.send(result);
  });

  // Возвращаем собранный Fastify app.
  return app;
}

// Эта функция поднимает handlers app и при занятом порте пробует следующий.
async function listenWithPortFallback(app, startPort, host = DEFAULT_HOST) {
  // Преобразуем стартовый порт к числу.
  const firstPort = Number(startPort);
  // Валидируем числовое значение порта.
  if (!Number.isFinite(firstPort) || firstPort <= 0) {
    // Если порт неверный, прерываем запуск.
    throw new Error(`Invalid HANDLERS_PORT: ${startPort}`);
  }

  // Пробуем ограниченное количество последовательных портов.
  for (let offset = 0; offset <= MAX_PORT_ATTEMPTS; offset += 1) {
    // Текущий кандидат порта.
    const port = firstPort + offset;
    try {
      // Пытаемся поднять HTTP сервер.
      await app.listen({ port, host });
      // Логируем фактический порт запуска.
      app.log.info({ port, host }, 'Handlers app started');

      // Если поднялись не на стартовом порту, подсказываем env для API.
      if (port !== firstPort) {
        app.log.warn(
          {
            port,
            hint:
              `Start API with APP_URL=http://localhost:${port}/handlers ` +
              `SD_APP_URL=http://localhost:${port}/sd TRIP_APP_URL=http://localhost:${port}/trip`,
          },
          'Default port was busy, handlers app started on another port'
        );
      }

      // Возвращаем порт успешного запуска.
      return port;
    } catch (error) {
      // Если ошибка не EADDRINUSE, пробрасываем ее как критическую.
      if (error?.code !== 'EADDRINUSE') {
        throw error;
      }
      // Логируем конфликт порта и продолжаем попытки.
      app.log.warn({ port }, 'Port is busy, trying next port');
    }
  }

  // Если все попытки исчерпаны, завершаем ошибкой.
  throw new Error(
    `Unable to start handlers app: ports ${firstPort}-${firstPort + MAX_PORT_ATTEMPTS} are busy`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Собираем Fastify приложение.
  const app = await buildHandlersApp();
  // Берем желаемый порт из env или используем дефолт.
  const port = Number(process.env.HANDLERS_PORT || DEFAULT_HANDLERS_PORT);
  // Поднимаем сервер с fallback на следующий свободный порт.
  await listenWithPortFallback(app, port, DEFAULT_HOST);
}
