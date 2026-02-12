import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  CancellationScope,
  startChild,
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
    context = {},
    route,
    handlers = {},
  } = input;

  // Минимальная валидация route DSL.
  if (!route || !Array.isArray(route.nodes)) {
    throw new Error('route.nodes is required');
  }

  // Единый runtime-контекст переменных процесса.
  const mergedContext = {
    ...(context || {}),
  };
  // Контекст шаблонизации и guard-выражений.
  const ctx = {
    doc,
    context: mergedContext,
  };
  // Глобальное состояние workflow, доступное из query getProgress.
  const state = {
    processType,
    status: 'running',
    statusMessage: null,
    route,
    nodes: {},
    approvals: {},
    events: {},
    context: mergedContext,
    doc,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  // Канонические runtime-блоки в context: route/steps/document/documentHistory.
  if (!state.context || typeof state.context !== 'object' || Array.isArray(state.context)) {
    state.context = {};
  }
  if (!state.context.route || !Array.isArray(state.context.route?.nodes)) {
    state.context.route = route;
  }
  if (!state.context.steps || typeof state.context.steps !== 'object' || Array.isArray(state.context.steps)) {
    state.context.steps = {};
  }
  if (!Array.isArray(state.context.documentHistory)) {
    state.context.documentHistory = [];
  }
  if (!state.context.document || typeof state.context.document !== 'object' || Array.isArray(state.context.document)) {
    state.context.document = doc;
  }
  // Единый источник "документа" — context.document.
  state.doc = state.context.document;
  ctx.doc = state.context.document;
  ctx.context = state.context;

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
    state.context.steps[node.id] = {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      approval: null,
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
  const selfWithdrawSignal = defineSignal('selfWithdraw');
  // Счетчик сигналов для пробуждения основного цикла без polling.
  let signalCounter = 0;

  // terminalDecision/abortReason управляют общим завершением процесса.
  let terminalDecision = null;
  let abortReason = null;
  // Текущие запущенные node-задачи и их cancellation scope.
  const running = new Map();
  const runningScopes = new Map();
  // Запрос rewind по сценарию need_changes.
  let rewindRequest = null;
  // Ноды, которые отменяются/перезапускаются из-за rewind.
  const rewindingNodes = new Set();
  // Директивы возврата для конкретных approval-узлов.
  const needChangesRequests = {};

  // Безопасный JSON-clone для снапшотов истории.
  function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  if (state.context.documentHistory.length === 0) {
    state.context.documentHistory.push({
      at: new Date().toISOString(),
      source: 'start',
      patch: {},
      document: cloneJson(state.context.document),
    });
  }

  function toPublicApproval(approvalState) {
    if (!approvalState) return null;
    return {
      required: approvalState.required,
      approvedCount: Array.isArray(approvalState.approvedActors)
        ? approvalState.approvedActors.length
        : 0,
      approvedActors: approvalState.approvedActors || [],
      decision: approvalState.decision || null,
      decisionActor: approvalState.decisionActor || null,
      decisionComment: approvalState.decisionComment || null,
      updatedAt: approvalState.updatedAt || null,
    };
  }

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
      self_withdrawal: 'кандидат отозвал заявку самостоятельно',
      step_failed: 'шаг завершился с ошибкой',
      child_process_failed: 'дочерний процесс завершился ошибкой или отклонением',
      missing_required_docs_for_security: 'для проверки СБ не хватает обязательных документов',
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

    if (meta.reason === 'child_process_failed') {
      const childId = meta.childWorkflowId ? ` Дочерний workflow: ${meta.childWorkflowId}.` : '';
      const childStatus = meta.childStatus ? ` Статус child: ${meta.childStatus}.` : '';
      const childMessage = meta.error ? ` Причина: ${meta.error}.` : '';
      return `Процесс остановлен: дочерний процесс завершился неуспешно на ${nodeText}.${childId}${childStatus}${childMessage}`;
    }

    if (meta.reason === 'approval_decision' || meta.decision === 'reject') {
      const actor = meta.actor ? ` Участник: ${meta.actor}.` : '';
      const comment = meta.comment ? ` Причина: ${meta.comment}.` : '';
      return `Процесс отклонен: получено решение "decline" на ${nodeText}.${actor}${comment}`;
    }

    if (meta.reason === 'self_withdrawal' || status === 'withdrawn') {
      const actor = meta.actor ? ` Кто: ${meta.actor}.` : '';
      const comment = meta.comment ? ` Причина: ${meta.comment}.` : '';
      return `Процесс завершен самоотказом кандидата.${actor}${comment}`;
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

  // Рендерит и записывает setVars в единый context процесса.
  function applyRenderedContext(setVars, localCtx) {
    if (!setVars || typeof setVars !== 'object') return;
    for (const [key, val] of Object.entries(setVars)) {
      const resolved = renderTemplate(val, localCtx);
      state.context[key] = resolved;
      ctx.context[key] = resolved;
    }
  }

  // Применяет setVars шага в единый context (без дублирования step snapshots).
  function syncNodeContext(node, nodeState, extraCtx = {}, options = {}) {
    const { applyNodeContext = true } = options;
    if (applyNodeContext && node.setVars) {
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
      const localCtx = {
        ...ctx,
        node,
        result: nodeState.result,
        nodeState: snapshot,
        step: snapshot,
        approvals: state.approvals[node.id] || null,
        ...extraCtx,
      };
      applyRenderedContext(node.setVars, localCtx);
    }

    // Единый блок runtime шага в context.steps.
    const prevRewindReason = state.context.steps[node.id]?.rewindReason || null;
    state.context.steps[node.id] = {
      status: nodeState.status,
      startedAt: nodeState.startedAt,
      completedAt: nodeState.completedAt,
      result: nodeState.result,
      error: nodeState.error,
      approval: toPublicApproval(state.approvals[node.id] || null),
      rewindReason: nodeState.status === 'pending' ? prevRewindReason : null,
    };
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

  // Возвращает дефолтный шаг для возврата при need_changes.
  function defaultNeedChangesTarget(nodeId) {
    const allowed = allowedNeedChangesTargets(nodeId);
    const node = nodeById[nodeId];
    if (!node) return null;

    const explicitDefault = node?.needChanges?.defaultTarget || null;
    if (explicitDefault && allowed.includes(explicitDefault)) {
      return explicitDefault;
    }

    if (Array.isArray(node.after) && node.after.length > 0) {
      const directPrev = node.after[node.after.length - 1];
      if (allowed.includes(directPrev)) return directPrev;
    }

    const index = route.nodes.findIndex((it) => it.id === nodeId);
    if (index > 0 && allowed.includes(route.nodes[index - 1].id)) {
      return route.nodes[index - 1].id;
    }

    return allowed[0] || null;
  }

  // Собирает всех транзитивных предков узла.
  function collectAncestors(nodeId, acc = new Set()) {
    const node = nodeById[nodeId];
    if (!node) return acc;
    for (const depId of node.after || []) {
      if (!depId || acc.has(depId)) continue;
      acc.add(depId);
      collectAncestors(depId, acc);
    }
    return acc;
  }

  // Признак стартового автошага (корневой не-approval этап).
  function isInitialAutomaticNode(nodeId) {
    const node = nodeById[nodeId];
    if (!node) return false;
    const deps = node.after || [];
    return deps.length === 0 && node.type !== 'approval.kofn';
  }

  // Допустимые цели возврата по need_changes для текущего шага.
  function allowedNeedChangesTargets(nodeId) {
    const node = nodeById[nodeId];
    if (!node) return [];

    const ancestors = [...collectAncestors(nodeId)];
    let allowed = ancestors.filter((id) => Boolean(nodeById[id]));

    // Глобально запрещаем возврат на стартовые автошаги, если явно не разрешено.
    const allowInitial = node?.needChanges?.allowInitial === true;
    if (!allowInitial) {
      allowed = allowed.filter((id) => !isInitialAutomaticNode(id));
    }

    const cfg = node?.needChanges || {};
    if (Array.isArray(cfg.allowedTargets) && cfg.allowedTargets.length > 0) {
      const set = new Set(cfg.allowedTargets.filter((id) => Boolean(nodeById[id])));
      allowed = allowed.filter((id) => set.has(id));
    }
    if (Array.isArray(cfg.disallowTargets) && cfg.disallowTargets.length > 0) {
      const deny = new Set(cfg.disallowTargets);
      allowed = allowed.filter((id) => !deny.has(id));
    }

    return [...new Set(allowed)];
  }

  // Резолвит шаг возврата: явный -> дефолтный в рамках policy.
  function resolveNeedChangesTarget(nodeId, requestedTargetNodeId) {
    const allowed = allowedNeedChangesTargets(nodeId);
    const fallbackTarget = defaultNeedChangesTarget(nodeId);
    if (allowed.length === 0) {
      return fallbackTarget;
    }
    if (!requestedTargetNodeId) {
      return fallbackTarget;
    }
    if (allowed.includes(requestedTargetNodeId)) {
      return requestedTargetNodeId;
    }
    return fallbackTarget;
  }

  // Полностью сбрасывает runtime-состояние узла в pending.
  function resetNodeRuntime(nodeId, reason = 'need_changes_rewind') {
    const node = nodeById[nodeId];
    const nodeState = state.nodes[nodeId];
    if (!node || !nodeState) return;
    nodeState.status = 'pending';
    nodeState.startedAt = null;
    nodeState.completedAt = null;
    nodeState.result = null;
    nodeState.error = null;
    nodeState.hooks = {
      pre: null,
      post: null,
    };
    if (node.type === 'approval.kofn') {
      state.approvals[nodeId] = initApprovalState(approvalConfig[nodeId] || {});
    }
    state.context.steps[nodeId] = {
      status: nodeState.status,
      startedAt: nodeState.startedAt,
      completedAt: nodeState.completedAt,
      result: nodeState.result,
      error: nodeState.error,
      approval: toPublicApproval(state.approvals[nodeId] || null),
      rewindReason: reason,
    };
    syncNodeContext(node, nodeState, {}, { applyNodeContext: false });
  }

  // Ставит запрос на возврат процесса к указанному шагу.
  function requestNeedChangesRewind({
    nodeId,
    actor,
    comment,
    targetNodeId,
  }) {
    if (!targetNodeId || !nodeById[targetNodeId]) return;
    rewindRequest = {
      nodeId,
      actor,
      comment,
      targetNodeId,
      at: new Date().toISOString(),
    };
  }

  // Применяет запрос rewind: отменяет запущенные ветки и переводит узлы обратно в pending.
  function applyNeedChangesRewind() {
    if (!rewindRequest) return;
    const request = rewindRequest;
    rewindRequest = null;

    const resetSet = new Set([request.targetNodeId, ...collectDependents(request.targetNodeId)]);
    for (const nodeId of resetSet) {
      const scope = runningScopes.get(nodeId);
      if (scope) {
        rewindingNodes.add(nodeId);
        scope.cancel();
      }
    }
    for (const nodeId of resetSet) {
      let rewindReason = 'need_changes_downstream_reset';
      if (nodeId === request.nodeId) {
        rewindReason = 'need_changes_source_waiting';
      } else if (nodeId === request.targetNodeId) {
        rewindReason = 'need_changes_target_requested';
      }
      resetNodeRuntime(nodeId, rewindReason);
    }

    if (!Array.isArray(state.context.needChangesHistory)) {
      state.context.needChangesHistory = [];
    }
    state.context.needChangesHistory.push({
      ...request,
      nodeLabel: stepName(request.nodeId),
      targetLabel: stepName(request.targetNodeId),
    });
    state.context.lastNeedChanges = {
      ...request,
      nodeLabel: stepName(request.nodeId),
      targetLabel: stepName(request.targetNodeId),
    };
    state.status = 'running';
    state.statusMessage =
      `Запрошена доработка: возврат на шаг "${stepName(request.targetNodeId)}"` +
      ` после решения по шагу "${stepName(request.nodeId)}".`;
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
    const { nodeId, actor, decision, comment, returnToNodeId } = payload || {};
    if (!nodeId) return;

    const normalizedDecision = normalizeApprovalDecision(decision);
    const isNegativeDecision = normalizedDecision === 'reject' || normalizedDecision === 'needs_changes';
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
      if (isNegativeDecision && trimmedComment.length === 0) {
      state.lastSignalError = {
        type: 'approval_validation',
        message: 'comment is required for decline or need_changes',
        nodeId,
        actor,
        decision: normalizedDecision,
        at: new Date().toISOString(),
      };
      signalCounter += 1;
      return;
    }
    if (normalizedDecision === 'needs_changes') {
      const resolvedTarget = resolveNeedChangesTarget(nodeId, returnToNodeId);
      if (!resolvedTarget) {
        state.lastSignalError = {
          type: 'approval_validation',
          message: 'need_changes is not allowed for this step',
          nodeId,
          actor,
          decision: normalizedDecision,
          at: new Date().toISOString(),
        };
        signalCounter += 1;
        return;
      }
      needChangesRequests[nodeId] = {
        nodeId,
        actor,
        comment: trimmedComment,
        targetNodeId: resolvedTarget,
        at: new Date().toISOString(),
      };
    } else {
      delete needChangesRequests[nodeId];
    }
    if (!state.approvals[nodeId]) {
      state.approvals[nodeId] = initApprovalState(approvalConfig[nodeId] || {});
    }
    state.approvals[nodeId] = applyApproval(state.approvals[nodeId], {
      actor,
      decision: normalizedDecision,
      comment: trimmedComment,
    });

    if (normalizedDecision === 'reject') {
      if (isRequiredApprovalNode(nodeId)) {
        const status = 'rejected';
        abortWorkflow(status, {
          nodeId,
          actor,
          reason: 'approval_decision',
          decision: normalizedDecision,
          comment: trimmedComment,
        });
      }
    }

    // Обновляем канонический шаг в context.steps даже до завершения шага.
    const node = nodeById[nodeId];
    const nodeState = state.nodes[nodeId];
    if (node && nodeState) {
      state.context.steps[nodeId] = {
        ...(state.context.steps[nodeId] || {}),
        approval: toPublicApproval(state.approvals[nodeId] || null),
      };
      syncNodeContext(node, nodeState, {}, { applyNodeContext: false });
    }

    signalCounter += 1;
  });

  // Signal selfWithdraw: независимый терминальный сигнал самоотказа кандидата.
  setHandler(selfWithdrawSignal, (payload) => {
    const actor = String(payload?.actor || 'candidate').trim() || 'candidate';
    const reason = String(payload?.reason || '').trim();
    if (!reason) {
      state.lastSignalError = {
        type: 'self_withdraw_validation',
        message: 'reason is required for self-withdraw',
        actor,
        at: new Date().toISOString(),
      };
      signalCounter += 1;
      return;
    }
    abortWorkflow('withdrawn', {
      actor,
      reason: 'self_withdrawal',
      comment: reason,
    });
    signalCounter += 1;
  });

  // Signal processEvent: сохраняет события и поддерживает DOC_UPDATE(cost).
  setHandler(eventSignal, (payload) => {
    const { eventName, data } = payload || {};
    if (!eventName) return;
    if (eventName === 'DOC_UPDATE' && data && typeof data === 'object') {
      const patch = {};
      for (const [key, value] of Object.entries(data)) {
        state.context.document[key] = value;
        state.doc[key] = value;
        ctx.doc[key] = value;
        patch[key] = cloneJson(value);
      }

      if (Object.keys(patch).length > 0) {
        state.context.documentHistory.push({
          at: new Date().toISOString(),
          source: eventName,
          patch,
          document: cloneJson(state.context.document),
        });
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

  // Публичный state без legacy top-level route/nodes/approvals.
  function buildPublicState() {
    return {
      processType: state.processType,
      status: state.status,
      statusMessage: state.statusMessage,
      context: state.context,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      abort: state.abort || null,
      failure: state.failure || null,
      lastSignalError: state.lastSignalError || null,
    };
  }

  // Query прогресса процесса для API/UI.
  const getProgressQuery = defineQuery('getProgress');
  setHandler(getProgressQuery, () => buildPublicState());

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
            const onRejected =
              hook.onPrecheckRejected && typeof hook.onPrecheckRejected === 'object'
                ? hook.onPrecheckRejected
                : null;
            const shouldRequestNeedChanges =
              onRejected &&
              String(onRejected.type || '').toLowerCase() === 'need_changes';

            if (shouldRequestNeedChanges) {
              const requestedTarget = renderTemplate(
                onRejected.targetNodeId || onRejected.returnToNodeId || '',
                ctx
              );
              const resolvedTarget = resolveNeedChangesTarget(
                node.id,
                requestedTarget || defaultNeedChangesTarget(node.id)
              );
              const renderedComment = renderTemplate(
                onRejected.comment ||
                  `Автовозврат: precheck не пройден (${humanizeReasonCode(reasonCode)})`,
                {
                  ...ctx,
                  precheck,
                  reasonCode,
                  node,
                }
              );
              const directive = {
                nodeId: node.id,
                actor: onRejected.actor || 'Система precheck',
                comment: String(renderedComment || '').trim(),
                targetNodeId: resolvedTarget,
                at: new Date().toISOString(),
              };
              requestNeedChangesRewind(directive);
              const needChangesError = new Error(
                `precheck need_changes: ${reasonCode}; ${humanizeReasonCode(reasonCode)}`
              );
              needChangesError.code = 'PRECHECK_NEED_CHANGES';
              needChangesError.directive = directive;
              needChangesError.precheck = precheck;
              needChangesError.reasonCode = reasonCode;
              throw needChangesError;
            }

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
    let rewoundByRequest = false;

    if (abortReason) {
      markSkipped(nodeState, abortReason);
      syncNodeContext(node, nodeState, { abortReason }, { applyNodeContext: false });
      return;
    }

    if (node.guard && !evalGuard(ctx, node.guard)) {
      // Guard false => шаг пропускается как skipped.
      nodeState.status = 'skipped';
      nodeState.completedAt = new Date().toISOString();
      nodeState.result = { skipped: true, reason: 'guard_false' };
      syncNodeContext(node, nodeState, { guardMatched: false });
      nodeState.hooks.post = await executeNodeHook(node, nodeState, 'post', node.post, {
        stepStatus: 'skipped',
        stepOutcome: 'guard_false',
      });
      syncNodeContext(node, nodeState, { guardMatched: false }, { applyNodeContext: false });
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
              applyRenderedContext(gateCfg.setVars, gateCtx);
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

          if (outcome === 'rejected') {
            if (gateFailedRequired || isRequiredApprovalNode(node.id)) {
              abortWorkflow('rejected', {
                nodeId: node.id,
                outcome,
                reason: gateFailedRequired ? 'gate_condition_failed' : 'approval_decision',
                gate: gateInfo?.data?.gate || null,
              });
            }
          }

          if (outcome === 'needs_changes') {
            const fallbackTarget = defaultNeedChangesTarget(node.id);
            const directive = needChangesRequests[node.id] || {
              nodeId: node.id,
              actor: state.approvals[node.id].decisionActor || null,
              comment: state.approvals[node.id].decisionComment || null,
              targetNodeId: fallbackTarget,
              at: new Date().toISOString(),
            };
            nodeState.result.rewind = {
              targetNodeId: directive.targetNodeId,
              targetLabel: stepName(directive.targetNodeId),
            };
            stepExtraCtx.rewind = nodeState.result.rewind;
            requestNeedChangesRewind(directive);
            delete needChangesRequests[node.id];
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
          const childHandle = await startChild(workflowType, {
            args: [childInput],
            workflowId: childWorkflowId,
          });
          // Публикуем childWorkflowId сразу, чтобы UI мог открыть дочерний процесс до его завершения.
          nodeState.result = {
            childWorkflowId,
            childStatus: 'running',
          };
          stepExtraCtx = {
            child: {
              workflowId: childWorkflowId,
              status: 'running',
            },
          };
          syncNodeContext(node, nodeState, stepExtraCtx, { applyNodeContext: false });

          const result = await childHandle.result();
          const childStatus = String(result?.status || '').toLowerCase();
          const childFailed =
            childStatus === 'failed' ||
            childStatus === 'rejected' ||
            childStatus === 'needs_changes' ||
            childStatus === 'terminated' ||
            childStatus === 'timed_out' ||
            childStatus === 'canceled';
          nodeState.result = {
            result,
            childWorkflowId,
            childStatus: childStatus || 'completed',
            outcome: childFailed ? 'rejected' : 'approved',
          };
          stepExtraCtx = {
            child: {
              workflowId: childWorkflowId,
              result,
              status: childStatus || 'completed',
            },
          };

          const enforceChildSuccess = node.enforceChildSuccess !== false;
          const requiredNode = node.required !== false;
          if (childFailed && enforceChildSuccess && requiredNode) {
            abortWorkflow(childStatus === 'failed' ? 'failed' : 'rejected', {
              nodeId: node.id,
              reason: 'child_process_failed',
              childWorkflowId,
              childStatus,
              error:
                result?.statusMessage ||
                result?.failure?.error ||
                result?.abort?.message ||
                null,
            });
          }
          break;
        }
        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      if (nodeState.status === 'running') {
        nodeState.status = 'done';
      }

      // Когда шаг-цель допзапроса успешно пройден, снимаем активную подсветку перехода.
      if (state.context.lastNeedChanges?.targetNodeId === node.id && nodeState.status === 'done') {
        delete state.context.lastNeedChanges;
      }

      // Сохраняем параметры шага до post-hook, чтобы следующие шаги могли их использовать.
      syncNodeContext(node, nodeState, stepExtraCtx);

      // Затем post-hook.
      nodeState.hooks.post = await executeNodeHook(node, nodeState, 'post', node.post, {
        stepStatus: nodeState.status,
        stepOutcome: nodeState.result?.outcome || null,
      });
      // Обновляем snapshot после post-hook без повторного setVars.
      syncNodeContext(node, nodeState, stepExtraCtx, { applyNodeContext: false });
    } catch (err) {
      if (err?.code === 'PRECHECK_NEED_CHANGES') {
        resetNodeRuntime(node.id, 'precheck_need_changes');
        rewoundByRequest = true;
        return;
      }

      if (rewindingNodes.has(node.id)) {
        rewindingNodes.delete(node.id);
        rewoundByRequest = true;
        return;
      }

      if (abortReason) {
        markSkipped(nodeState, abortReason);
        nodeState.hooks.post = await executeNodeHook(node, nodeState, 'post', node.post, {
          stepStatus: nodeState.status,
          stepOutcome: abortReason,
        });
        syncNodeContext(node, nodeState, { abortReason }, { applyNodeContext: false });
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
      syncNodeContext(node, nodeState, {}, { applyNodeContext: false });
      return;
    } finally {
      if (rewoundByRequest) {
        return;
      }
      // Фиксируем время завершения шага в любом исходе.
      nodeState.completedAt = new Date().toISOString();
      syncNodeContext(node, nodeState, {}, { applyNodeContext: false });
    }
  }

  // Главный планировщик DAG: запускает ready-узлы, ждет завершение/сигналы.
  while (true) {
    if ((terminalDecision || abortReason) && running.size === 0) {
      break;
    }

    if (!abortReason && rewindRequest) {
      applyNeedChangesRewind();
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
            rewindingNodes.delete(node.id);
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
  if (state.status === 'completed') {
    state.statusMessage = buildStatusMessage('completed');
  } else if (!state.statusMessage) {
    state.statusMessage = buildStatusMessage(state.status, state.abort || {});
  }
  state.completedAt = new Date().toISOString();
  // Возвращаем только каноничный публичный state.
  return buildPublicState();
}
