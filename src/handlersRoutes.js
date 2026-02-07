// Синтетическое вычисление, общее для demo-обработчиков.
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

// Регистрирует в Fastify все endpoint-ы handlers: doc/sd/trip.
export function registerHandlersRoutes(app) {
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

    // Gate-операции: вычисляем score и отдаем PASS/FAIL как часть бизнес-процесса.
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
}
