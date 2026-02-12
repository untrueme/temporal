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
      const seniorityScore = Number(payload.seniorityScore ?? 50);
      let threshold = 60;
      if (stage.includes('finance')) threshold = 72;
      if (stage.includes('recruiter')) threshold = 66;
      if (stage.includes('security')) threshold = 68;

      const score = Math.max(
        0,
        Math.min(100, Math.round(88 - cost / 7 + approvalsRequired * 5 + seniorityScore / 10))
      );
      const status = score >= threshold ? 'PASS' : 'FAIL';

      result = {
        ...result,
        gate: {
          stage,
          score,
          threshold,
          status,
          approvalsRequired,
          cost,
          reason: status === 'PASS' ? 'risk acceptable' : 'risk too high',
        },
      };
    }

    // Для pre.* шагов добавляем имитацию policy pre-check.
    if (action.startsWith('pre.')) {
      const check = String(payload.check || 'generic');
      const candidateName = String(payload.candidateName || payload.name || '');
      const salary = Number(payload.salary ?? payload.cost ?? 0);
      let validation = 'ok';
      let reason = 'passed';
      let nextParams = {};

      if (check === 'candidate_profile') {
        const nameOk = candidateName.trim().length >= 3;
        const salaryOk = salary > 0;
        validation = nameOk && salaryOk ? 'ok' : 'failed';
        reason = validation === 'ok' ? 'profile_complete' : 'profile_incomplete';
        nextParams = {
          candidateName,
          requestedSalary: salary,
        };
      } else if (check === 'recruiter_gate') {
        validation = salary <= 260 || salary === 0 ? 'ok' : 'failed';
        reason = validation === 'ok' ? 'within_recruiter_limit' : 'salary_above_recruiter_limit';
        nextParams = {
          recruiterSalaryLimit: 260,
          needsDirectorAttention: salary > 220,
        };
      } else if (check === 'finance_precheck') {
        const affordabilityScore = Math.max(0, Math.min(100, Math.round(94 - salary / 3)));
        validation = affordabilityScore >= 55 ? 'ok' : 'failed';
        reason = validation === 'ok' ? 'budget_feasible' : 'budget_not_feasible';
        nextParams = {
          affordabilityScore,
          budgetBand: salary >= 180 ? 'HIGH' : salary >= 120 ? 'MID' : 'LOW',
        };
      } else if (check === 'security_precheck') {
        const toCanonicalDoc = (value) => {
          const token = String(value || '').trim().toLowerCase();
          if (!token) return '';
          if (token === 'passport' || token === 'паспорт') return 'passport';
          if (
            token === 'consent' ||
            token === 'privacy_consent' ||
            token === 'согласие' ||
            token === 'согласие_на_обработку_данных'
          ) {
            return 'consent';
          }
          return token;
        };

        const normalizeDocs = (value) => {
          if (Array.isArray(value)) {
            return value
              .map((item) => {
                if (typeof item === 'string') return toCanonicalDoc(item);
                if (item && typeof item === 'object') {
                  return toCanonicalDoc(item.type || item.name || item.id || '');
                }
                return '';
              })
              .filter(Boolean);
          }
          return String(value || '')
            .split(',')
            .map((item) => toCanonicalDoc(item))
            .filter(Boolean);
        };

        const providedDocuments = normalizeDocs(
          payload.documents || payload.securityDocuments || []
        );
        const requiredDocuments = normalizeDocs(
          payload.requiredDocuments || ['passport', 'consent']
        );
        const missingDocuments = requiredDocuments.filter(
          (docType) => !providedDocuments.includes(docType)
        );
        const docsReady = missingDocuments.length === 0;

        const riskTag = String(payload.riskTag || '').toLowerCase();
        const riskScore = riskTag === 'high' ? 85 : riskTag === 'medium' ? 58 : 34;
        const riskOk = riskScore <= 70;
        validation = docsReady && riskOk ? 'ok' : 'failed';
        if (!docsReady) {
          reason = 'missing_required_docs_for_security';
        } else {
          reason = validation === 'ok' ? 'risk_acceptable' : 'risk_too_high';
        }
        nextParams = {
          riskScore,
          riskTag: riskTag || 'low',
          documentsProvided: providedDocuments,
          requiredDocuments,
          missingDocuments,
          documentsReady: docsReady,
        };
      } else if (check === 'final_gate') {
        validation = 'ok';
        reason = 'final_gate_passed';
      } else if (check === 'compensation_committee') {
        validation = 'ok';
        reason = 'committee_allowed';
      } else if (check === 'publish_acl') {
        validation = 'ok';
        reason = 'publish_allowed';
      }

      // Это демонстрационный pre-процессор перед исполнением шага.
      result = {
        // Сохраняем базовые поля результата.
        ...result,
        // Добавляем подробности pre-check.
        precheck: {
          // Версия условной политики.
          policyVersion: 'v1',
          // Признак, что актор допущен.
          actorAllowed: validation === 'ok',
          // Признак, что блокировка на изменение получена.
          lockAcquired: true,
          // Статус валидации.
          validation,
          // Причина решения precheck.
          reason,
          // Производные параметры, которые можно перенести в vars следующих шагов.
          nextParams,
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
