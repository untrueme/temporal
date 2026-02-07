import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  CancellationScope,
  executeChild,
  workflowInfo,
} from '@temporalio/workflow';
import { evalGuard } from '../utils/guards.js';
import { renderTemplate } from '../utils/templates.js';
import { readyNodes, doneish } from '../utils/dag.js';
import {
  initApprovalState,
  applyApproval,
  approvalSatisfied,
  approvalOutcome,
  normalizeApprovalDecision,
} from '../utils/approvals.js';

// Activity-прокси для вызова handlers app из workflow.
const { callHttpHandler } = proxyActivities({
  startToCloseTimeout: '30s',
  retry: {
    maximumAttempts: 3,
  },
});

// Универсальный JSON DAG workflow runner (doc/trip/произвольный процесс).
export async function jsonDAGWorkflow(input) {
  // Нормализация входных данных процесса.
  const {
    processType,
    docId,
    ticketId,
    tripId,
    doc = {},
    vars = {},
    route,
    handlers = {},
  } = input;

  // Минимальная валидация route DSL.
  if (!route || !Array.isArray(route.nodes)) {
    throw new Error('route.nodes is required');
  }

  // Контекст шаблонизации и guard-выражений.
  const ctx = { doc, vars };
  // Глобальное состояние workflow, доступное из query getProgress.
  const state = {
    processType,
    status: 'running',
    statusMessage: null,
    route,
    nodes: {},
    stepParams: {},
    approvals: {},
    events: {},
    vars,
    doc,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  // Шина параметров шагов для использования в последующих guards/templates.
  if (!state.vars.steps || typeof state.vars.steps !== 'object' || Array.isArray(state.vars.steps)) {
    state.vars.steps = {};
  }
  ctx.vars = state.vars;

  // Индексы для быстрого доступа к node-конфигам и зависимостям.
  const approvalConfig = {};
  const nodeById = {};
  const dependentsById = {};

  // Инициализируем runtime-state каждого узла DAG.
  for (const node of route.nodes) {
    nodeById[node.id] = node;
    for (const dep of node.after || []) {
      if (!dependentsById[dep]) dependentsById[dep] = [];
      dependentsById[dep].push(node.id);
    }
    state.nodes[node.id] = {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      hooks: {
        pre: null,
        post: null,
      },
    };
    if (node.type === 'approval.kofn') {
      // Для approval узлов фиксируем K и список участников.
      approvalConfig[node.id] = {
        required: node.k ?? (node.members && node.members.length > 1 ? 2 : 1),
        members: node.members || [],
      };
    }
  }

  const approvalSignal = defineSignal('approval');
  const eventSignal = defineSignal('processEvent');
  // Счетчик сигналов для пробуждения основного цикла без polling.
  let signalCounter = 0;

  // terminalDecision/abortReason управляют общим завершением процесса.
  let terminalDecision = null;
  let abortReason = null;
  // Текущие запущенные node-задачи и их cancellation scope.
  const running = new Map();
  const runningScopes = new Map();

  // Проверяет, обязателен ли approval-узел для текущего маршрута.
  function isRequiredApprovalNode(nodeId) {
    const node = nodeById[nodeId];
    if (!node || node.type !== 'approval.kofn') return false;
    return node.required !== false;
  }

  // Возвращает человекочитаемое имя шага.
  function stepName(nodeId) {
    const node = nodeById[nodeId];
    if (!node) return nodeId || 'unknown-step';
    return node.label || node.id;
  }

  // Формирует понятную причину остановки процесса.
  function humanizeReasonCode(reason) {
    const code = String(reason || '').trim().toLowerCase();
    if (!code) return '';
    const map = {
      profile_incomplete: 'не заполнены обязательные поля профиля кандидата',
      salary_above_recruiter_limit: 'ожидаемый оклад выше лимита рекрутера',
      budget_not_feasible: 'финансовая модель не подтверждает бюджет',
      risk_too_high: 'риск по проверке безопасности слишком высокий',
      within_recruiter_limit: 'оклад находится в допустимом диапазоне',
      budget_feasible: 'бюджет подтвержден',
      risk_acceptable: 'уровень риска приемлем',
      final_gate_passed: 'финальный precheck пройден',
      committee_allowed: 'порог комитета компенсаций выполнен',
      publish_allowed: 'публикация разрешена политикой',
      gate_condition_failed: 'не пройдено gate-условие',
      approval_decision: 'получено отрицательное решение согласующего',
      step_failed: 'шаг завершился с ошибкой',
    };
    if (map[code]) return map[code];
    return code.replace(/[_\-]+/g, ' ');
  }

  // Убирает технические префиксы и превращает причины в человекочитаемые.
  function formatErrorMessage(errorText) {
    if (!errorText) return '';
    const raw = String(errorText);
    const withoutHookPrefix = raw.replace(/^\[(pre|post)\s+hook\s+failed\]\s*/i, '');
    const precheckMatch = withoutHookPrefix.match(/precheck rejected:\s*([^;.\n]+)(?:[;.\n]|$)/i);
    if (precheckMatch) {
      const reasonCode = String(precheckMatch[1] || '').trim();
      const reason = humanizeReasonCode(reasonCode);
      return `Precheck не пройден: ${reason || reasonCode}`;
    }
    return withoutHookPrefix;
  }

  function buildStatusMessage(status, meta = {}) {
    const nodeText = meta.nodeId ? `шаг "${stepName(meta.nodeId)}"` : 'процесс';

    if (status === 'completed') {
      return 'Процесс успешно завершен.';
    }

    if (meta.reason === 'gate_condition_failed') {
      const gate = meta.gate || meta.gateResult?.gate || null;
      const gateReason = gate?.reason ? ` Причина: ${humanizeReasonCode(gate.reason)}.` : '';
      const gateText =
        gate && typeof gate === 'object'
          ? ` Gate: status=${gate.status ?? 'unknown'}, score=${gate.score ?? 'n/a'}, threshold=${gate.threshold ?? 'n/a'}.${gateReason}`
          : '';
      return `Процесс отклонен: не пройдено gate-условие на ${nodeText}.${gateText}`;
    }

    if (meta.reason === 'approval_decision' || meta.decision === 'reject') {
      const actor = meta.actor ? ` Участник: ${meta.actor}.` : '';
      const comment = meta.comment ? ` Причина: ${meta.comment}.` : '';
      return `Процесс отклонен: получено решение "decline" на ${nodeText}.${actor}${comment}`;
    }

    if (status === 'failed') {
      const normalizedError = formatErrorMessage(meta.error);
      const error = normalizedError ? ` Ошибка: ${normalizedError}.` : '';
      return `Процесс остановлен с ошибкой на ${nodeText}.${error}`;
    }

    if (status === 'rejected') {
      const comment = meta.comment ? ` Причина: ${meta.comment}.` : '';
      return `Процесс отклонен на ${nodeText}.${comment}`;
    }

    if (status === 'needs_changes') {
      const comment = meta.comment ? ` Комментарий: ${meta.comment}.` : '';
      return `Процесс возвращен на доработку на ${nodeText}.${comment}`;
    }

    return `Процесс завершен со статусом "${status}" на ${nodeText}.`;
  }

  // Переводит pending/running-узел в skipped при глобальном abort.
  function markSkipped(nodeState, status) {
    nodeState.status = 'skipped';
    nodeState.completedAt = new Date().toISOString();
    nodeState.result = {
      skipped: true,
      reason: 'workflow_aborted',
      status,
    };
  }

  // Преобразует nodeId в безопасный ключ для vars.steps.
  function toVarKey(nodeId) {
    return String(nodeId || '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  // Рендерит и записывает setVars в общий vars-контекст.
  function applyRenderedVars(setVars, localCtx) {
    if (!setVars || typeof setVars !== 'object') return;
    for (const [key, val] of Object.entries(setVars)) {
      const resolved = renderTemplate(val, localCtx);
      state.vars[key] = resolved;
      ctx.vars[key] = resolved;
    }
  }

  // Фиксирует output шага в state.stepParams и vars.steps.<stepKey>.
  function persistStepOutputs(node, nodeState, extraCtx = {}, options = {}) {
    const { applyNodeVars = true } = options;
    const stepKey = toVarKey(node.id);
    const snapshot = {
      nodeId: node.id,
      type: node.type,
      status: nodeState.status,
      startedAt: nodeState.startedAt,
      completedAt: nodeState.completedAt,
      result: nodeState.result,
      error: nodeState.error,
      hooks: nodeState.hooks,
    };

    state.stepParams[node.id] = snapshot;
    state.vars.steps[stepKey] = snapshot;
    ctx.vars.steps = state.vars.steps;

    if (applyNodeVars && node.setVars) {
      const localCtx = {
        ...ctx,
        node,
        result: nodeState.result,
        nodeState: snapshot,
        step: snapshot,
        approvals: state.approvals[node.id] || null,
        ...extraCtx,
      };
      applyRenderedVars(node.setVars, localCtx);
    }
  }

  // Глобально останавливает процесс: отменяет running и скипает pending.
  function abortWorkflow(status, meta = {}) {
    if (abortReason) return;
    abortReason = status;
    terminalDecision = status;
    state.status = status;
    state.finalDecision = status;
    state.reasonCode = meta.reason || null;
    state.failedNodeId = meta.nodeId || null;
    state.failedNodeLabel = meta.nodeId ? stepName(meta.nodeId) : null;
    const message = buildStatusMessage(status, meta);
    state.abort = {
      ...meta,
      status,
      at: new Date().toISOString(),
      reasonText: meta.reason ? humanizeReasonCode(meta.reason) : null,
      nodeLabel: meta.nodeId ? stepName(meta.nodeId) : null,
      error: meta.error ? formatErrorMessage(meta.error) : meta.error,
      message,
    };
    state.failure = {
      status,
      reasonCode: meta.reason || null,
      reasonText: meta.reason ? humanizeReasonCode(meta.reason) : null,
      nodeId: meta.nodeId || null,
      nodeLabel: meta.nodeId ? stepName(meta.nodeId) : null,
      error: meta.error ? formatErrorMessage(meta.error) : meta.error || null,
      technicalError: meta.technicalError || null,
      at: state.abort.at,
    };
    state.statusMessage = message;

    for (const nodeState of Object.values(state.nodes)) {
      if (nodeState.status === 'pending') {
        markSkipped(nodeState, status);
      }
    }

    for (const scope of runningScopes.values()) {
      scope.cancel();
    }
  }

  // Возвращает транзитивно всех потомков узла (для динамической активации guard).
  function collectDependents(nodeId) {
    const result = new Set();
    const queue = [...(dependentsById[nodeId] || [])];
    while (queue.length > 0) {
      const current = queue.shift();
      if (result.has(current)) continue;
      result.add(current);
      const next = dependentsById[current] || [];
      queue.push(...next);
    }
    return [...result];
  }

  // Реактивирует ранее skipped(guard_false) узлы, если guard стал true.
  function maybeReactivateGuardNodes() {
    for (const node of route.nodes) {
      if (!node.guard) continue;
      const nodeState = state.nodes[node.id];
      if (!nodeState || nodeState.status !== 'skipped') continue;
      if (nodeState.result?.reason !== 'guard_false') continue;
      if (!evalGuard(ctx, node.guard)) continue;

      const downstream = collectDependents(node.id);
      const downstreamStarted = downstream.some((depId) => {
        const depState = state.nodes[depId];
        return depState && depState.status !== 'pending';
      });
      if (downstreamStarted) continue;

      nodeState.status = 'pending';
      nodeState.startedAt = null;
      nodeState.completedAt = null;
      nodeState.result = null;
      nodeState.error = null;
    }
  }

  // Signal approval: накапливает голоса и умеет fail-fast по decline required-шага.
  setHandler(approvalSignal, (payload) => {
    const { nodeId, actor, decision, comment } = payload || {};
    if (!nodeId) return;

    const normalizedDecision = normalizeApprovalDecision(decision);
    const isNegativeDecision = normalizedDecision === 'reject' || normalizedDecision === 'needs_changes';
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    if (isNegativeDecision && trimmedComment.length === 0) {
      state.lastSignalError = {
        type: 'approval_validation',
        message: 'comment is required for decline',
        nodeId,
        actor,
        decision: normalizedDecision,
        at: new Date().toISOString(),
      };
      signalCounter += 1;
      return;
    }
    if (!state.approvals[nodeId]) {
      state.approvals[nodeId] = initApprovalState(approvalConfig[nodeId] || {});
    }
    state.approvals[nodeId] = applyApproval(state.approvals[nodeId], {
      actor,
      decision: normalizedDecision,
      comment: trimmedComment,
    });

    if (isNegativeDecision) {
      if (isRequiredApprovalNode(nodeId)) {
        const status = normalizedDecision === 'needs_changes' ? 'needs_changes' : 'rejected';
        abortWorkflow(status, {
          nodeId,
          actor,
          reason: 'approval_decision',
          decision: normalizedDecision,
          comment: trimmedComment,
        });
      }
    }

    signalCounter += 1;
  });

  // Signal processEvent: сохраняет события и поддерживает DOC_UPDATE(cost).
  setHandler(eventSignal, (payload) => {
    const { eventName, data } = payload || {};
    if (!eventName) return;
    if (eventName === 'DOC_UPDATE' && data && typeof data === 'object') {
      if (Object.prototype.hasOwnProperty.call(data, 'cost')) {
        state.doc.cost = data.cost;
        ctx.doc.cost = data.cost;
        maybeReactivateGuardNodes();
      }
    }
    if (!state.events[eventName]) {
      state.events[eventName] = [];
    }
    state.events[eventName].push({
      data,
      receivedAt: new Date().toISOString(),
    });
    signalCounter += 1;
  });

  // Query прогресса процесса для API/UI.
  const getProgressQuery = defineQuery('getProgress');
  setHandler(getProgressQuery, () => state);

  // Резолвит базовый URL handlers app по типу процесса/узла.
  function resolveBaseUrl(appName, node) {
    if (appName && handlers[appName]) return handlers[appName];
    if (node?.app && handlers[node.app]) return handlers[node.app];
    if (handlers.default) return handlers.default;
    if (processType === 'trip' && handlers.trip) return handlers.trip;
    if (processType === 'doc' && handlers.doc) return handlers.doc;
    if (processType === 'sd' && handlers.sd) return handlers.sd;
    return handlers.doc || handlers.trip || handlers.sd;
  }

  // Унифицированный pre/post hook executor для каждого DAG шага.
  async function executeNodeHook(node, nodeState, phase, hookConfig, extra = {}) {
    if (!hookConfig) return null;
    const hook = typeof hookConfig === 'string' ? { action: hookConfig } : hookConfig;
    const actionTpl = hook.action || `${phase}.${node.id}`;
    const action = renderTemplate(actionTpl, ctx);
    const hookRequired = hook.required ?? (phase === 'pre');
    const appName = hook.app || node.app || (processType === 'trip' ? 'trip' : processType === 'sd' ? 'sd' : 'doc');
    const baseUrl = resolveBaseUrl(appName, node);
    const renderedPayload = renderTemplate(hook.payload || {}, {
      ...ctx,
      node,
      hook: {
        phase,
        ...extra,
      },
      process: {
        processType,
        docId,
        ticketId,
        tripId,
        workflowId: workflowInfo().workflowId,
      },
    });
    const payload =
      renderedPayload && typeof renderedPayload === 'object' && !Array.isArray(renderedPayload)
        ? renderedPayload
        : { value: renderedPayload };

    const correlation = {
      docId,
      ticketId,
      tripId,
      nodeId: node.id,
      phase,
    };

    try {
      // Обязательные hook-ошибки прерывают шаг; optional возвращают soft-error.
      const result = await callHttpHandler({
        baseUrl,
        action,
        payload: {
          ...payload,
          nodeId: node.id,
          phase,
          processType,
          docId,
          ticketId,
          tripId,
          workflowId: workflowInfo().workflowId,
          stepStatus: extra.stepStatus ?? nodeState.status,
          stepOutcome: extra.stepOutcome ?? null,
        },
        correlation,
      });

      // Для pre-hook дополнительно валидируем бизнес-результат precheck.
      if (phase === 'pre' && hook.enforcePrecheck !== false) {
        const precheck = result?.data?.precheck;
        if (precheck && typeof precheck === 'object') {
          const validation = String(precheck.validation || 'ok').toLowerCase();
          const actorAllowed = precheck.actorAllowed !== false;
          const lockAcquired = precheck.lockAcquired !== false;
          const isValid = validation === 'ok' && actorAllowed && lockAcquired;
          if (!isValid) {
            const reasonCode = precheck.reason || precheck.message || validation;
            throw new Error(`precheck rejected: ${reasonCode}; ${humanizeReasonCode(reasonCode)}`);
          }
        }
      }

      return {
        ok: true,
        phase,
        action,
        app: appName,
        result,
      };
    } catch (error) {
      const hookError = {
        ok: false,
        phase,
        action,
        app: appName,
        error: {
          message: error?.message || String(error),
        },
      };
      if (hookRequired) {
        throw new Error(`[${phase} hook failed] ${hookError.error.message}`);
      }
      return hookError;
    }
  }

  // Исполняет конкретный node согласно его type в DSL.
  async function runNode(node) {
    const nodeState = state.nodes[node.id];
    if (!nodeState || nodeState.status !== 'pending') return;

    if (abortReason) {
      markSkipped(nodeState, abortReason);
      persistStepOutputs(node, nodeState, { abortReason }, { applyNodeVars: false });
      return;
    }

    if (node.guard && !evalGuard(ctx, node.guard)) {
      // Guard false => шаг пропускается как skipped.
      nodeState.status = 'skipped';
      nodeState.completedAt = new Date().toISOString();
      nodeState.result = { skipped: true, reason: 'guard_false' };
      persistStepOutputs(node, nodeState, { guardMatched: false });
      nodeState.hooks.post = await executeNodeHook(node, nodeState, 'post', node.post, {
        stepStatus: 'skipped',
        stepOutcome: 'guard_false',
      });
      persistStepOutputs(node, nodeState, { guardMatched: false }, { applyNodeVars: false });
      return;
    }

    nodeState.status = 'running';
    nodeState.startedAt = new Date().toISOString();

    try {
      let stepExtraCtx = {};
      // Сначала pre-hook.
      nodeState.hooks.pre = await executeNodeHook(node, nodeState, 'pre', node.pre, {
        stepStatus: 'running',
      });

      // Основная бизнес-логика шага.
      switch (node.type) {
        case 'handler.http': {
          const payload = renderTemplate(node.payload || {}, ctx);
          const action = renderTemplate(node.action || node.id, ctx);
          const baseUrl = resolveBaseUrl(node.app, node);
          const correlation = {
            docId,
            ticketId,
            tripId,
            nodeId: node.id,
          };
          const result = await callHttpHandler({
            baseUrl,
            action,
            payload: { ...payload, nodeId: node.id },
            correlation,
          });
          nodeState.result = result;
          break;
        }
        case 'gate.http': {
          // Процессный gate-шаг: вызывает внешнюю операцию и проверяет passWhen.
          const payload = renderTemplate(node.payload || {}, ctx);
          const action = renderTemplate(node.action || node.id, ctx);
          const baseUrl = resolveBaseUrl(node.app, node);
          const correlation = {
            docId,
            ticketId,
            tripId,
            nodeId: node.id,
          };

          const result = await callHttpHandler({
            baseUrl,
            action,
            payload: { ...payload, nodeId: node.id },
            correlation,
          });

          const passWhen = node.passWhen || {
            op: 'eq',
            left: { path: 'result.data.ok' },
            right: true,
          };
          const gateCtx = {
            ...ctx,
            result,
            gate: result?.data?.gate ?? null,
          };
          const passed = evalGuard(gateCtx, passWhen);

          nodeState.result = {
            ...result,
            passed,
            outcome: passed ? 'approved' : 'rejected',
          };
          stepExtraCtx = {
            gate: result?.data?.gate ?? null,
            gatePassed: passed,
          };

          if (!passed && node.required !== false) {
            abortWorkflow('rejected', {
              nodeId: node.id,
              reason: 'gate_condition_failed',
              gateResult: result?.data || null,
            });
          }
          break;
        }
        case 'approval.kofn': {
          if (!state.approvals[node.id]) {
            state.approvals[node.id] = initApprovalState(approvalConfig[node.id] || {});
          }
          await condition(() => Boolean(abortReason) || approvalSatisfied(state.approvals[node.id]));
          let outcome = approvalOutcome(state.approvals[node.id]);
          let gateInfo = null;
          let gateFailedRequired = false;

          if (abortReason && outcome === 'pending') {
            markSkipped(nodeState, abortReason);
            break;
          }

          if (outcome === 'approved' && node.gate) {
            const gateCfg = typeof node.gate === 'string' ? { action: node.gate } : node.gate;
            const action = renderTemplate(gateCfg.action || `gate.${node.id}`, ctx);
            const baseUrl = resolveBaseUrl(gateCfg.app || node.app, node);
            const gatePayload = renderTemplate(gateCfg.payload || {}, {
              ...ctx,
              approval: {
                nodeId: node.id,
                approvedActors: state.approvals[node.id].approvedActors,
                required: state.approvals[node.id].required,
                outcome,
              },
            });
            const correlation = {
              docId,
              ticketId,
              tripId,
              nodeId: node.id,
              phase: 'gate',
            };

            const gateResult = await callHttpHandler({
              baseUrl,
              action,
              payload: { ...gatePayload, nodeId: node.id, phase: 'gate' },
              correlation,
            });
            const passWhen = gateCfg.passWhen || {
              op: 'or',
              guards: [
                { op: 'eq', left: { path: 'result.data.gate.status' }, right: 'PASS' },
                { op: 'eq', left: { path: 'result.data.ok' }, right: true },
              ],
            };
            const gateCtx = {
              ...ctx,
              result: gateResult,
              gate: gateResult?.data?.gate ?? null,
            };
            const passed = evalGuard(gateCtx, passWhen);
            const gateRequired = gateCfg.required !== false;

            gateInfo = {
              ...gateResult,
              passed,
              status: gateResult?.data?.gate?.status || (passed ? 'PASS' : 'FAIL'),
            };

            if (gateCfg.setVars) {
              applyRenderedVars(gateCfg.setVars, gateCtx);
            }

            if (!passed && gateRequired) {
              gateFailedRequired = true;
              outcome = 'rejected';
            }
          }

          nodeState.result = {
            outcome,
            approvedActors: state.approvals[node.id].approvedActors,
            required: state.approvals[node.id].required,
            members: state.approvals[node.id].members,
            decisionActor: state.approvals[node.id].decisionActor,
            decisionComment: state.approvals[node.id].decisionComment,
            gate: gateInfo,
          };
          stepExtraCtx = {
            approval: state.approvals[node.id],
            gate: gateInfo?.data?.gate || null,
          };

          if (outcome === 'rejected' || outcome === 'needs_changes') {
            if (gateFailedRequired || isRequiredApprovalNode(node.id)) {
              abortWorkflow(outcome, {
                nodeId: node.id,
                outcome,
                reason: gateFailedRequired ? 'gate_condition_failed' : 'approval_decision',
                gate: gateInfo?.data?.gate || null,
              });
            }
          }
          break;
        }
        case 'event.wait': {
          // Ждем событие конкретного типа через signal processEvent.
          const eventName = node.eventName || node.name;
          await condition(() => Boolean(abortReason) || (state.events[eventName] || []).length > 0);

          if (abortReason && (state.events[eventName] || []).length === 0) {
            markSkipped(nodeState, abortReason);
            break;
          }

          const evt = state.events[eventName].shift();
          stepExtraCtx = { event: evt?.data || {} };
          nodeState.result = { eventName, event: evt };
          break;
        }
        case 'timer.delay': {
          // Простой relative delay.
          const ms = node.ms ?? node.delayMs ?? (node.seconds ? node.seconds * 1000 : 0);
          const aborted = await condition(() => Boolean(abortReason), ms);
          if (aborted) {
            markSkipped(nodeState, abortReason);
            break;
          }
          nodeState.result = { delayMs: ms };
          break;
        }
        case 'timer.until': {
          // Delay до абсолютной даты/времени.
          const atValue = renderTemplate(node.at || node.until, ctx);
          const targetMs = typeof atValue === 'number' ? atValue : Date.parse(atValue);
          const delayMs = Math.max(0, targetMs - Date.now());
          const aborted = await condition(() => Boolean(abortReason), delayMs);
          if (aborted) {
            markSkipped(nodeState, abortReason);
            break;
          }
          nodeState.result = { at: new Date(targetMs).toISOString(), delayMs };
          break;
        }
        case 'child.start': {
          // Запуск child workflow и ожидание результата.
          const childInput = renderTemplate(node.input || {}, ctx);
          const workflowType = node.workflowType;
          if (!workflowType) {
            throw new Error(`child.start requires workflowType for node ${node.id}`);
          }
          const childWorkflowId = `${workflowInfo().workflowId}-${node.id}`;
          const result = await executeChild(workflowType, {
            args: [childInput],
            workflowId: childWorkflowId,
          });
          nodeState.result = { result, childWorkflowId };
          stepExtraCtx = { child: { workflowId: childWorkflowId, result } };
          break;
        }
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      if (nodeState.status === 'running') {
        nodeState.status = 'done';
      }

      // Сохраняем параметры шага до post-hook, чтобы следующие шаги могли их использовать.
      persistStepOutputs(node, nodeState, stepExtraCtx);

      // Затем post-hook.
      nodeState.hooks.post = await executeNodeHook(node, nodeState, 'post', node.post, {
        stepStatus: nodeState.status,
        stepOutcome: nodeState.result?.outcome || null,
      });
      // Обновляем snapshot после post-hook без повторного setVars.
      persistStepOutputs(node, nodeState, stepExtraCtx, { applyNodeVars: false });
    } catch (err) {
      if (abortReason) {
        markSkipped(nodeState, abortReason);
        nodeState.hooks.post = await executeNodeHook(node, nodeState, 'post', node.post, {
          stepStatus: nodeState.status,
          stepOutcome: abortReason,
        });
        persistStepOutputs(node, nodeState, { abortReason }, { applyNodeVars: false });
        return;
      }

      nodeState.status = 'failed';
      const technicalError = err?.message || String(err);
      const userFacingError = formatErrorMessage(technicalError);
      nodeState.error = {
        message: userFacingError,
        technicalMessage: technicalError,
      };
      // Fail-fast для всего процесса: отменяем остальные ветки.
      abortWorkflow('failed', {
        nodeId: node.id,
        reason: 'step_failed',
        error: userFacingError,
        technicalError,
      });

      nodeState.hooks.post = await executeNodeHook(node, nodeState, 'post', node.post, {
        stepStatus: 'failed',
        stepOutcome: 'failed',
      });
      persistStepOutputs(node, nodeState, {}, { applyNodeVars: false });
      return;
    } finally {
      // Фиксируем время завершения шага в любом исходе.
      nodeState.completedAt = new Date().toISOString();
      persistStepOutputs(node, nodeState, {}, { applyNodeVars: false });
    }
  }

  // Главный планировщик DAG: запускает ready-узлы, ждет завершение/сигналы.
  while (true) {
    if ((terminalDecision || abortReason) && running.size === 0) {
      break;
    }

    const ready = abortReason ? [] : readyNodes(route.nodes, state.nodes);
    for (const node of ready) {
      if (!running.has(node.id)) {
        // Каждый узел исполняем в собственном cancellable scope.
        const scope = new CancellationScope({ cancellable: true });
        runningScopes.set(node.id, scope);
        const task = scope.run(() => runNode(node))
          .catch(() => undefined)
          .finally(() => {
            running.delete(node.id);
            runningScopes.delete(node.id);
          });
        running.set(node.id, task);
      }
    }

    const allDone = Object.values(state.nodes).every((nodeState) => doneish(nodeState.status));
    if (allDone) {
      break;
    }

    if (running.size === 0) {
      if (abortReason || terminalDecision) {
        break;
      }
      // Если нечего запускать и нечего ждать — это deadlock в маршруте.
      throw new Error('Deadlock: no running nodes and workflow not complete');
    }

    const race = Promise.race([...running.values()]);
    const lastSignal = signalCounter;
    await Promise.race([
      race,
      condition(() => signalCounter !== lastSignal),
    ]);
  }

  if (state.status === 'running') {
    // Нормальное завершение процесса.
    state.status = abortReason || terminalDecision || 'completed';
  }
  if (!state.statusMessage) {
    state.statusMessage = buildStatusMessage(state.status, state.abort || {});
  }
  state.completedAt = new Date().toISOString();
  // Возвращаем полный state как результат workflow.
  return state;
}
