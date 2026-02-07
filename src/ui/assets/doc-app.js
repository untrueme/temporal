import { LitElement, html, css } from 'https://unpkg.com/lit-element@3.3.3/lit-element.js?module';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

// UI-демо для document approval workflow (Lit + D3 граф маршрута).
class DocWorkflowDemo extends LitElement {
  // Реактивные свойства компонента.
  static properties = {
    docId: { type: String },
    title: { type: String },
    cost: { type: Number },
    workflowId: { type: String },
    actor: { type: String },
    decision: { type: String },
    comment: { type: String },
    nodeId: { type: String },
    selectedNodeId: { type: String },
    output: { state: true },
    workflowItems: { state: true },
    toasts: { state: true },
    errorText: { state: true },
    busy: { state: true },
  };

  // Стили интерфейса демо-приложения.
  static styles = css`
    :host {
      display: block;
      width: 100%;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      color: #0f1f39;
      font-family: 'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif;
    }

    .shell {
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(26, 58, 120, 0.18);
      border-radius: 0;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.84);
      backdrop-filter: blur(6px);
      box-shadow: none;
    }

    header {
      padding: 16px 18px;
      background: linear-gradient(120deg, rgba(102, 121, 255, 0.26), rgba(255, 255, 255, 0.72));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    nav a {
      color: #1f3577;
      text-decoration: none;
      margin-right: 10px;
      font-weight: 600;
      font-size: 0.9rem;
    }

    h1 {
      margin: 0;
      font-size: 1.2rem;
      line-height: 1.2;
    }

    .subtitle {
      margin-top: 4px;
      font-size: 0.84rem;
      color: #3e4f7e;
    }

    .grid {
      display: grid;
      gap: 12px;
      padding: 14px;
      flex: 1;
      overflow: auto;
    }

    .control-row {
      display: flex;
      gap: 12px;
      align-items: stretch;
      min-width: 0;
      flex: 1;
    }

    .control-row > .panel {
      flex: 1 1 0;
      min-width: 0;
    }

    .panel {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(40, 67, 132, 0.17);
      border-radius: 14px;
      padding: 10px;
      display: grid;
      gap: 7px;
      align-content: start;
      min-width: 0;
    }

    .panel.graph {
      grid-column: 1 / -1;
      padding: 10px;
    }

    .workspace-row {
      grid-column: 1 / -1;
      display: flex;
      gap: 12px;
      align-items: stretch;
      min-width: 0;
    }

    .workflows-panel {
      width: 280px;
      min-width: 250px;
      max-width: 320px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .workflows-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 370px;
      overflow: auto;
      padding-right: 2px;
    }

    .wf-item {
      width: 100%;
      text-align: left;
      height: auto;
      min-height: 56px;
      padding: 8px 10px;
      display: grid;
      gap: 4px;
      border: 1px solid rgba(142, 157, 193, 0.38);
      border-radius: 10px;
      background: #f7f9ff;
      color: #1b2a4f;
      cursor: pointer;
    }

    .wf-item:hover {
      border-color: rgba(90, 113, 170, 0.55);
      background: #f0f4ff;
    }

    .wf-item.active {
      border-color: #2f56d1;
      box-shadow: 0 0 0 1px rgba(47, 86, 209, 0.14);
      background: #eaf0ff;
    }

    .wf-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .wf-id {
      font-size: 0.76rem;
      font-weight: 700;
      color: #2a3962;
      word-break: break-word;
      line-height: 1.2;
    }

    .wf-time {
      font-size: 0.72rem;
      color: #5b6889;
      line-height: 1.1;
    }

    .wf-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 84px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      border: 1px solid transparent;
    }

    .wf-status.running {
      background: #e6efff;
      color: #285ac6;
      border-color: #b9cdfa;
    }

    .wf-status.completed {
      background: #e2f8ea;
      color: #1f8248;
      border-color: #a7e2be;
    }

    .wf-status.rejected,
    .wf-status.failed,
    .wf-status.terminated,
    .wf-status.canceled,
    .wf-status.timed_out {
      background: #fae4e4;
      color: #9a3232;
      border-color: #efb7b7;
    }

    .wf-status.continued_as_new,
    .wf-status.unknown,
    .wf-status.not_found {
      background: #eef2fb;
      color: #5a6788;
      border-color: #d0d8ec;
    }

    h2 {
      margin: 0;
      font-size: 0.97rem;
    }

    label {
      font-size: 0.75rem;
      color: #4a587a;
      font-weight: 700;
      margin-top: 2px;
    }

    input,
    select,
    button {
      width: 100%;
      min-width: 0;
      height: 38px;
      font: inherit;
      border: 1px solid rgba(38, 67, 136, 0.28);
      border-radius: 10px;
      padding: 0 10px;
      background: #fff;
      color: #15254a;
    }

    button {
      cursor: pointer;
      border: 0;
      font-weight: 700;
      background: linear-gradient(120deg, #4c65e0, #3252d6);
      color: #fff;
    }

    button.secondary {
      background: linear-gradient(120deg, #566284, #475676);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.56;
    }

    .inline {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }

    .decision-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      min-width: 0;
    }

    .decision-btn {
      height: 38px;
      border-radius: 10px;
      border: 1px solid rgba(36, 60, 118, 0.32);
      background: #f4f7ff;
      color: #223058;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0 6px;
    }

    .decision-btn.active.accept {
      background: #dff8e9;
      border-color: #27a95e;
      color: #1f7e47;
    }

    .decision-btn.active.decline {
      background: #fbe4e4;
      border-color: #d44b4b;
      color: #922929;
    }

    .graph-shell {
      border-radius: 12px;
      border: 1px dashed rgba(62, 86, 140, 0.32);
      background: #f8f9ff;
      padding: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: thin;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 10px 24px rgba(36, 58, 102, 0.08);
    }

    #graph {
      min-height: 540px;
      width: max-content;
    }

    #graph svg {
      display: block;
      max-width: none;
      height: auto;
      cursor: grab;
      touch-action: none;
    }

    #graph svg:active {
      cursor: grabbing;
    }

    .legend {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin: 0 0 8px;
      font-size: 0.78rem;
      color: #46527a;
    }

    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .legend i {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      background: #c2c8d8;
    }

    .legend .ok i {
      background: #2fca6a;
    }

    .legend .err i {
      background: #e45454;
    }

    .legend .skip i {
      background: #8f9cb7;
    }

    .hint {
      font-size: 0.78rem;
      color: #5d6a8d;
      line-height: 1.35;
    }

    pre {
      margin: 0;
      max-height: 360px;
      overflow: auto;
      font-size: 0.73rem;
      background: #0f1729;
      color: #d8e4ff;
      border-radius: 10px;
      padding: 10px;
      line-height: 1.35;
    }

    .status {
      padding: 0 14px 14px;
      font-size: 0.84rem;
      color: #32508f;
    }

    .error {
      color: #a5283b;
      font-weight: 700;
    }

    .toast-stack {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 50;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: min(420px, calc(100vw - 24px));
    }

    .toast {
      border-radius: 12px;
      border: 1px solid rgba(159, 48, 48, 0.26);
      background: #fff1f1;
      color: #7f2525;
      box-shadow: 0 10px 30px rgba(37, 45, 72, 0.2);
      padding: 10px 12px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.83rem;
      line-height: 1.3;
    }

    .toast .x {
      border: 0;
      background: transparent;
      color: inherit;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1;
      height: auto;
      width: auto;
      padding: 0;
      margin: 0;
      cursor: pointer;
    }

    @media (max-width: 700px) {
      .workspace-row {
        flex-direction: column;
      }

      .workflows-panel {
        width: 100%;
        max-width: none;
      }

      .control-row {
        flex-direction: column;
      }

      .decision-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  // Инициализация дефолтных значений формы/состояния UI.
  constructor() {
    super();
    this.docId = 'demo-doc-001';
    this.title = 'Contract approval';
    this.cost = 120;
    this.workflowId = '';
    this.actor = '';
    this.decision = 'accept';
    this.comment = '';
    this.nodeId = 'legal.approval';
    this.selectedNodeId = 'legal.approval';
    this.output = null;
    this.workflowItems = [];
    this.toasts = [];
    this.errorText = '';
    this.busy = false;
    this.graphTransform = { x: 0, y: 0, k: 1 };
  }

  // При монтировании подгружаем список уже запущенных workflow.
  connectedCallback() {
    super.connectedCallback();
    this.refreshWorkflowList({ silent: true });
  }

  // Доступные варианты decision (сокращены до accept/decline).
  get decisions() {
    return [
      { value: 'accept', label: 'Accept' },
      { value: 'decline', label: 'Decline' },
    ];
  }

  // Для decline комментарий обязателен.
  get requiresComment() {
    return this.decision === 'decline';
  }

  // Демо-маршрут документа с pre/post hooks и динамическим guard.
  get route() {
    return {
      nodes: [
        {
          id: 'intake.normalize',
          type: 'handler.http',
          label: 'Normalize draft',
          app: 'doc',
          action: 'intake.normalize',
          payload: {
            title: '{{doc.title}}',
            cost: '{{doc.cost}}',
          },
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'schema_and_acl',
              step: 'intake.normalize',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'intake.normalize',
              title: '{{doc.title}}',
              cost: '{{doc.cost}}',
            },
          },
        },
        {
          id: 'legal.approval',
          type: 'approval.kofn',
          label: 'Legal approval',
          members: ['alice', 'bob', 'carol'],
          k: 2,
          required: true,
          after: ['intake.normalize'],
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'legal_gate',
              step: 'legal.approval',
            },
          },
          gate: {
            app: 'doc',
            action: 'gate.legal.score',
            payload: {
              stage: 'legal',
              cost: '{{doc.cost}}',
              approvalsRequired: 2,
            },
            passWhen: {
              op: 'eq',
              left: { path: 'result.data.gate.status' },
              right: 'PASS',
            },
            required: true,
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'legal.approval',
            },
          },
        },
        {
          id: 'security.approval',
          type: 'approval.kofn',
          label: 'Security approval',
          members: ['sec1', 'sec2'],
          k: 1,
          required: true,
          after: ['legal.approval'],
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'security_gate',
              step: 'security.approval',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'security.approval',
            },
          },
        },
        {
          id: 'procurement.approval',
          type: 'approval.kofn',
          label: 'Procurement approval',
          members: ['proc1', 'proc2'],
          k: 1,
          required: true,
          after: ['legal.approval'],
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'procurement_gate',
              step: 'procurement.approval',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'procurement.approval',
            },
          },
        },
        {
          id: 'finance.approval',
          type: 'approval.kofn',
          label: 'Finance approval',
          members: ['fin1', 'fin2', 'cfo'],
          k: 2,
          required: true,
          after: ['security.approval', 'procurement.approval'],
          guard: { op: 'gte', left: { path: 'doc.cost' }, right: 150 },
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'budget_gate',
              step: 'finance.approval',
            },
          },
          gate: {
            app: 'doc',
            action: 'gate.finance.score',
            payload: {
              stage: 'finance',
              cost: '{{doc.cost}}',
              approvalsRequired: 2,
            },
            passWhen: {
              op: 'eq',
              left: { path: 'result.data.gate.status' },
              right: 'PASS',
            },
            required: true,
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'finance.approval',
            },
          },
        },
        {
          id: 'director.approval',
          type: 'approval.kofn',
          label: 'Director approval',
          members: ['director1', 'director2'],
          k: 1,
          required: true,
          after: ['finance.approval'],
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'final_gate',
              step: 'director.approval',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'director.approval',
            },
          },
        },
        {
          id: 'notify',
          type: 'handler.http',
          label: 'Publish + notify',
          app: 'doc',
          action: 'notify.publish',
          after: ['director.approval'],
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'publish_acl',
              step: 'notify',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'notify',
            },
          },
        },
      ],
    };
  }

  // Активный маршрут: из execution state (если есть), иначе локальный шаблон.
  get activeRoute() {
    const route = this.output?.route;
    if (route && Array.isArray(route.nodes) && route.nodes.length > 0) {
      return route;
    }
    return this.route;
  }

  // Список только approval-узлов для панели сигналов.
  get approvalNodes() {
    return this.activeRoute.nodes.filter((node) => node.type === 'approval.kofn');
  }

  // Текущий выбранный approval-узел.
  get selectedNode() {
    return this.approvalNodes.find((node) => node.id === this.selectedNodeId) || null;
  }

  // Доступные акторы: исключаем уже проголосовавших на выбранном узле.
  get availableActors() {
    const node = this.selectedNode;
    if (!node) return [];
    const approved = this.output?.approvals?.[node.id]?.approvedActors || [];
    return (node.members || []).filter((member) => !approved.includes(member));
  }

  // Быстрый map nodeId -> nodeConfig.
  get nodeById() {
    return new Map(this.activeRoute.nodes.map((node) => [node.id, node]));
  }

  // Возвращает зависимости узла (after[]).
  depsFor(nodeId) {
    const node = this.nodeById.get(nodeId);
    return node?.after || [];
  }

  // Локальная проверка guard на основе текущей суммы cost.
  guardActive(node) {
    if (!node?.guard) return true;
    const left = Number(this.cost);
    const right = Number(node.guard.right);
    switch (node.guard.op) {
      case 'gte':
        return left >= right;
      case 'gt':
        return left > right;
      case 'lte':
        return left <= right;
      case 'lt':
        return left < right;
      case 'eq':
        return left === right;
      case 'neq':
        return left !== right;
      default:
        return left >= right;
    }
  }

  // Узел обязателен "прямо сейчас" (учитывая guard).
  isRequiredNow(node) {
    if (!node) return false;
    if (node.guard && !this.guardActive(node)) return false;
    return node.required !== false;
  }

  // doneish-статус узла в текущем output.
  doneish(nodeId) {
    const nodeState = this.output?.nodes?.[nodeId];
    if (!nodeState) return false;
    return nodeState.status === 'done' || nodeState.status === 'skipped';
  }

  // Можно ли выбрать узел для отправки approval сейчас.
  isSelectable(nodeId) {
    const node = this.nodeById.get(nodeId);
    if (!node || node.type !== 'approval.kofn') return false;
    const deps = this.depsFor(node.id);

    if (!this.output) {
      return deps.length === 0;
    }

    const state = this.output.nodes?.[node.id];
    if (state && (state.status === 'done' || state.status === 'skipped')) {
      return false;
    }

    if (node.guard && !this.guardActive(node)) {
      return false;
    }

    return deps.every((dep) => this.doneish(dep));
  }

  // Поддерживает корректный selectedNode/actor при смене прогресса.
  ensureSelection() {
    const currentSelectable = this.selectedNodeId && this.isSelectable(this.selectedNodeId);
    if (currentSelectable) {
      if (!this.availableActors.includes(this.actor)) {
        this.actor = this.availableActors[0] || '';
      }
      this.nodeId = this.selectedNodeId;
      return;
    }

    const next = this.approvalNodes.find((node) => this.isSelectable(node.id));
    if (next) {
      this.selectedNodeId = next.id;
      this.nodeId = next.id;
      this.actor = this.availableActors[0] || '';
      return;
    }

    this.selectedNodeId = this.approvalNodes[0]?.id || '';
    this.nodeId = this.selectedNodeId;
    this.actor = this.availableActors[0] || '';
  }

  // Выбор узла кликом по карточке в графе (только если узел доступен).
  selectNode(nodeId) {
    if (!this.isSelectable(nodeId)) return;
    this.selectedNodeId = nodeId;
    this.nodeId = nodeId;
    this.actor = this.availableActors[0] || '';
  }

  // Унифицированный HTTP helper для API-запросов из UI.
  async request(path, init = {}) {
    const response = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      const message = payload?.message || payload?.error || `${response.status} ${response.statusText}`;
      const error = new Error(message);
      error.statusCode = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  // Добавляет toast-уведомление об ошибке/событии.
  showToast(message) {
    const toast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message,
    };
    this.toasts = [...this.toasts, toast].slice(-4);
    globalThis.setTimeout(() => {
      this.dismissToast(toast.id);
    }, 5200);
  }

  // Закрывает toast по id.
  dismissToast(id) {
    this.toasts = this.toasts.filter((item) => item.id !== id);
  }

  // Распознает транзиентные ошибки query progress.
  isProgressQueryError(error) {
    const msg = String(error?.payload?.message || error?.message || '').toLowerCase();
    return (
      msg.includes('failed to query workflow') ||
      msg.includes('did not register a handler for getprogress') ||
      msg.includes('progress query is not available')
    );
  }

  // Promise-обертка для ожидания в retry-циклах.
  sleep(ms) {
    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, ms);
    });
  }

  // Нормализует технические ошибки API в понятные тексты для UI.
  formatErrorMessage(error) {
    const msg = error?.payload?.message || error?.message || String(error);
    const normalized = msg.toLowerCase();

    if (normalized.includes('workflow execution already completed')) {
      return 'Workflow is already completed. Select a running workflow from the list on the left.';
    }
    if (normalized.includes('workflow not found')) {
      return 'Workflow not found. Refresh the list and choose an existing workflow.';
    }
    if (normalized.includes('comment is required for decline')) {
      return 'Comment is required for decline decision.';
    }
    if (
      normalized.includes('failed to query workflow') ||
      normalized.includes('did not register a handler for getprogress') ||
      normalized.includes('progress query is not available')
    ) {
      return 'Workflow progress is temporarily unavailable. Wait 1-2 seconds and query again.';
    }
    return msg;
  }

  // Обертка выполнения action с единым busy/error handling.
  async run(task) {
    this.busy = true;
    this.errorText = '';
    try {
      await task();
    } catch (err) {
      const message = this.formatErrorMessage(err);
      this.errorText = message;
      this.showToast(message);
    } finally {
      this.busy = false;
    }
  }

  // Перечитывает список workflow из API.
  async refreshWorkflowList({ silent = false } = {}) {
    try {
      const data = await this.request('/workflows/doc/list?limit=50');
      this.workflowItems = Array.isArray(data?.items) ? data.items : [];
    } catch (error) {
      if (!silent) {
        const message = this.formatErrorMessage(error);
        this.showToast(message);
      }
    }
  }

  // Загружает progress выбранного workflow с retry для query handler race.
  async loadProgress(workflowId) {
    const id = workflowId || this.workflowId || `doc-${this.docId}`;
    const maxAttempts = 5;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const data = await this.request(`/workflows/doc/${id}/progress`);
        this.workflowId = id;
        this.output = data;
        if (data?.doc?.cost !== undefined) {
          this.cost = Number(data.doc.cost);
        }
        this.ensureSelection();
        this.drawGraph();
        return;
      } catch (error) {
        lastError = error;
        if (!this.isProgressQueryError(error) || attempt === maxAttempts) {
          break;
        }
        await this.sleep(150 * attempt);
      }
    }

    throw lastError || new Error('Failed to query workflow progress');
  }

  // Стартует новый document workflow из формы.
  async startWorkflow() {
    await this.run(async () => {
      const payload = {
        docId: this.docId,
        doc: { title: this.title, cost: Number(this.cost) },
        route: this.route,
      };
      const data = await this.request('/workflows/doc/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      this.workflowId = data.workflowId;
      await this.loadProgress(data.workflowId);
      await this.refreshWorkflowList({ silent: true });
    });
  }

  // Отправляет approval signal в выбранный workflow/узел.
  async sendApproval() {
    await this.run(async () => {
      const workflowId = this.workflowId || `doc-${this.docId}`;
      await this.request(`/workflows/doc/${workflowId}/approval`, {
        method: 'POST',
        body: JSON.stringify({
          nodeId: this.nodeId,
          actor: this.actor,
          decision: this.decision,
          comment: this.comment,
        }),
      });
      this.comment = '';
      await this.loadProgress(workflowId);
      await this.refreshWorkflowList({ silent: true });
    });
  }

  // Запрашивает текущий progress execution.
  async queryProgress() {
    await this.run(async () => {
      await this.loadProgress();
      await this.refreshWorkflowList({ silent: true });
    });
  }

  // Отправляет событие DOC_UPDATE для изменения суммы документа.
  async updateCost() {
    await this.run(async () => {
      const workflowId = this.workflowId || `doc-${this.docId}`;
      await this.request(`/workflows/doc/${workflowId}/event`, {
        method: 'POST',
        body: JSON.stringify({
          eventName: 'DOC_UPDATE',
          data: { cost: Number(this.cost) },
        }),
      });
      await this.loadProgress(workflowId);
      await this.refreshWorkflowList({ silent: true });
    });
  }

  // CSS-класс бейджа статуса workflow в левой панели.
  workflowStatusClass(status) {
    const normalized = String(status || 'unknown')
      .toLowerCase()
      .replace('workflow_execution_status_', '');
    return normalized.replaceAll(' ', '_');
  }

  // Человекочитаемый label статуса workflow.
  workflowStatusLabel(status) {
    const normalized = String(status || 'unknown')
      .toLowerCase()
      .replace('workflow_execution_status_', '');
    return normalized.replaceAll('_', ' ');
  }

  // Форматирует ISO-дату/время для списка executions.
  formatDateTime(value) {
    if (!value) return 'n/a';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'n/a';
    return d.toLocaleString();
  }

  // Выбор workflow из левой панели.
  async pickWorkflow(workflowId) {
    if (!workflowId) return;
    this.workflowId = workflowId;
    await this.queryProgress();
  }

  // Признак, что в процессе есть отказ/ошибка (для подсветки финала красным).
  hasRejection() {
    const status = String(this.output?.status || '').toLowerCase();
    if (
      status === 'rejected' ||
      status === 'needs_changes' ||
      status === 'failed' ||
      status === 'terminated' ||
      status === 'canceled' ||
      status === 'timed_out'
    ) {
      return true;
    }
    if (!this.output?.nodes) return false;
    return Object.values(this.output.nodes).some((nodeState) => {
      const outcome = nodeState?.result?.outcome;
      return outcome === 'rejected' || outcome === 'needs_changes';
    });
  }

  // Нормализация статуса узла в удобные UI-состояния.
  resolveNodeStatus(nodeId) {
    const nodeState = this.output?.nodes?.[nodeId];
    if (!nodeState) return 'idle';
    const outcome = nodeState?.result?.outcome;
    if (outcome === 'rejected' || outcome === 'needs_changes') return 'rejected';
    if (nodeState.status === 'failed') return 'rejected';
    if (nodeState.status === 'running') return 'running';
    if (nodeState.status === 'done') return 'done';
    if (nodeState.status === 'skipped') return 'skipped';
    return 'idle';
  }

  // Цвет узла в графе по его статусу.
  nodeColor(nodeId, isFinal = false) {
    if (isFinal) {
      if (this.hasRejection()) return '#e45454';
      if (String(this.output?.status || '').toLowerCase() === 'completed') return '#2fca6a';
      const finalStatus = this.resolveNodeStatus(nodeId);
      if (finalStatus === 'running') return '#4e7bff';
      const done = this.output?.nodes?.[nodeId]?.status === 'done';
      return done ? '#2fca6a' : '#c2c8d8';
    }

    const status = this.resolveNodeStatus(nodeId);
    if (status === 'done') return '#2fca6a';
    if (status === 'rejected') return '#e45454';
    if (status === 'running') return '#4e7bff';
    if (status === 'skipped') return '#8f9cb7';
    return '#c2c8d8';
  }

  // Цвет ребра графа в зависимости от статусов связанных узлов.
  edgeColor(fromId, toId) {
    const fromStatus = this.resolveNodeStatus(fromId);
    const toStatus = this.resolveNodeStatus(toId);
    if (fromStatus === 'rejected' || toStatus === 'rejected') return '#d64646';
    if (fromStatus === 'done' && (toStatus === 'done' || toStatus === 'running')) return '#3fbc6f';
    if (fromStatus === 'skipped') return '#8f9cb7';
    return '#8d97b7';
  }

  // Координаты карточки узла на горизонтальном графе.
  layoutFor(nodeId) {
    const order = this.activeRoute.nodes.map((node) => node.id);
    const index = order.indexOf(nodeId);
    const cardW = 320;
    const cardH = 112;
    const colGap = 132;
    const laneGap = 170;
    const startX = 38;
    const startY = 34;
    const map = {
      'intake.normalize': { col: 0, row: 1 },
      'legal.approval': { col: 1, row: 1 },
      'security.approval': { col: 2, row: 0 },
      'procurement.approval': { col: 2, row: 2 },
      'finance.approval': { col: 3, row: 1 },
      'director.approval': { col: 4, row: 1 },
      notify: { col: 5, row: 1, terminal: true },
    };
    const slot = map[nodeId] || { col: Math.max(0, index), row: 1, terminal: false };
    const w = slot.terminal ? 174 : cardW;
    const h = slot.terminal ? 126 : cardH;
    const x = startX + slot.col * (cardW + colGap);
    const y = startY + slot.row * laneGap;
    return { x, y, w, h, order: index + 1, terminal: Boolean(slot.terminal) };
  }

  // Рисует D3-граф маршрута и текущего прогресса.
  drawGraph() {
    const container = this.renderRoot?.querySelector('#graph');
    if (!container) return;
    container.innerHTML = '';

    if (!this.workflowId && !this.output) {
      const empty = document.createElement('div');
      empty.className = 'hint';
      empty.textContent = 'Start workflow or query progress to render the graph.';
      container.appendChild(empty);
      return;
    }

    const nodes = this.activeRoute.nodes;
    const positions = new Map(nodes.map((node) => [node.id, { node, ...this.layoutFor(node.id) }]));
    const rightMost = Math.max(...[...positions.values()].map((item) => item.x + item.w));
    const bottomMost = Math.max(...[...positions.values()].map((item) => item.y + item.h));
    const width = Math.max(1680, rightMost + 120);
    const height = Math.max(540, bottomMost + 70);

    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img');

    const defs = svg.append('defs');
    const viewport = svg.append('g').attr('class', 'graph-viewport');
    const markerByColor = new Map();
    const markerIdForColor = (color) => {
      if (markerByColor.has(color)) return markerByColor.get(color);
      const markerId = `flow-arrow-${markerByColor.size}`;
      const marker = defs
        .append('marker')
        .attr('id', markerId)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 9)
        .attr('refY', 5)
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .attr('orient', 'auto-start-reverse');
      marker.append('path').attr('d', 'M 0 0 L 10 5 L 0 10 z').attr('fill', color);
      markerByColor.set(color, markerId);
      return markerId;
    };

    const pattern = defs
      .append('pattern')
      .attr('id', 'dot-grid')
      .attr('width', 26)
      .attr('height', 26)
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('circle').attr('cx', 2).attr('cy', 2).attr('r', 1.4).attr('fill', '#d2d9ea');
    viewport.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#dot-grid)');

    const cardShadow = defs
      .append('filter')
      .attr('id', 'card-shadow')
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '160%')
      .attr('height', '160%');
    cardShadow
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 8)
      .attr('stdDeviation', 6)
      .attr('flood-color', '#243b69')
      .attr('flood-opacity', 0.14);

    const linkGroup = viewport.append('g').attr('fill', 'none').attr('stroke-width', 3.2);
    for (const node of nodes) {
      for (const depId of node.after || []) {
        const from = positions.get(depId);
        const to = positions.get(node.id);
        if (!from || !to) continue;

        const x1 = from.x + from.w + 4;
        const y1 = from.y + from.h / 2;
        const x2 = to.terminal ? to.x + 10 : to.x - 16;
        const y2 = to.y + to.h / 2;
        const bend = Math.max(78, Math.abs(x2 - x1) * 0.44);
        const path = `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;

        const color = this.edgeColor(depId, node.id);
        const markerId = markerIdForColor(color);
        linkGroup
          .append('path')
          .attr('d', path)
          .attr('stroke', color)
          .attr('stroke-linecap', 'round')
          .attr('marker-end', `url(#${markerId})`);
      }
    }

    const nodeGroup = viewport.append('g');
    for (const node of nodes) {
      const { x, y, w, h, terminal } = positions.get(node.id);
      const isFinal = node.id === 'notify';
      const isApproval = node.type === 'approval.kofn';
      const selectable = this.isSelectable(node.id);
      const selected = node.id === this.selectedNodeId;
      const color = this.nodeColor(node.id, isFinal);
      const stroke = selected ? '#0f244a' : '#d7deef';
      const strokeWidth = selected ? 2.5 : 1.6;
      const cardOpacity = isApproval && !selectable ? 0.78 : 1;
      const nodeStatus = this.resolveNodeStatus(node.id);

      if (terminal) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const rx = w / 2;
        const ry = h / 2;

        nodeGroup
          .append('ellipse')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('rx', rx)
          .attr('ry', ry)
          .attr('fill', '#ffffff')
          .attr('stroke', color)
          .attr('stroke-width', 4)
          .attr('filter', 'url(#card-shadow)')
          .style('pointer-events', 'none');

        nodeGroup
          .append('circle')
          .attr('cx', x + 24)
          .attr('cy', y + 22)
          .attr('r', 14)
          .attr('fill', '#f4f7fc')
          .attr('stroke', '#d8dfef')
          .attr('stroke-width', 1.3)
          .style('pointer-events', 'none');

        nodeGroup
          .append('text')
          .attr('x', x + 24)
          .attr('y', y + 27)
          .attr('text-anchor', 'middle')
          .attr('font-size', 13)
          .attr('font-weight', 700)
          .attr('fill', '#1a2846')
          .style('pointer-events', 'none')
          .text(String(positions.get(node.id).order));

        nodeGroup
          .append('text')
          .attr('x', cx)
          .attr('y', cy - 8)
          .attr('text-anchor', 'middle')
          .attr('font-size', 15)
          .attr('font-weight', 800)
          .attr('fill', '#131f3f')
          .style('pointer-events', 'none')
          .text('Final');

        const finalCompleted =
          String(this.output?.status || '').toLowerCase() === 'completed' ||
          nodeStatus === 'done';

        nodeGroup
          .append('text')
          .attr('x', cx)
          .attr('y', cy + 15)
          .attr('text-anchor', 'middle')
          .attr('font-size', 13)
          .attr('font-weight', 700)
          .attr('fill', color)
          .style('pointer-events', 'none')
          .text(finalCompleted ? 'completed' : this.hasRejection() ? 'rejected' : 'waiting');

        continue;
      }

      nodeGroup
        .append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', w)
        .attr('height', h)
        .attr('rx', 18)
        .attr('fill', '#ffffff')
        .attr('stroke', stroke)
        .attr('stroke-width', strokeWidth)
        .attr('filter', 'url(#card-shadow)')
        .style('cursor', isApproval ? (selectable ? 'pointer' : 'not-allowed') : 'default')
        .style('opacity', cardOpacity)
        .on('click', () => {
          if (isApproval) {
            this.selectNode(node.id);
          }
        });

      nodeGroup
        .append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', w)
        .attr('height', 6)
        .attr('rx', 18)
        .attr('fill', color)
        .style('pointer-events', 'none');

      nodeGroup
        .append('line')
        .attr('x1', x)
        .attr('y1', y + 40)
        .attr('x2', x + w)
        .attr('y2', y + 40)
        .attr('stroke', '#ebeff8')
        .attr('stroke-width', 1.5)
        .style('pointer-events', 'none');

      nodeGroup
        .append('circle')
        .attr('cx', x + 30)
        .attr('cy', y + 26)
        .attr('r', 15)
        .attr('fill', '#f4f7fc')
        .attr('stroke', '#d8dfef')
        .attr('stroke-width', 1.4)
        .style('pointer-events', 'none');

      nodeGroup
        .append('text')
        .attr('x', x + 30)
        .attr('y', y + 31)
        .attr('text-anchor', 'middle')
        .attr('font-size', 13)
        .attr('font-weight', 700)
        .attr('fill', '#1a2846')
        .style('pointer-events', 'none')
        .text(String(positions.get(node.id).order));

      nodeGroup
        .append('text')
        .attr('x', x + 56)
        .attr('y', y + 28)
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#5f6f95')
        .style('pointer-events', 'none')
        .text(node.id);

      const titleRaw = node.label || node.id;
      const titleText = titleRaw.length > 24 ? `${titleRaw.slice(0, 22)}...` : titleRaw;
      nodeGroup
        .append('text')
        .attr('x', x + 56)
        .attr('y', y + 64)
        .attr('font-size', 16)
        .attr('font-weight', 700)
        .attr('fill', '#111f3d')
        .style('pointer-events', 'none')
        .text(titleText);

      const actorText = isApproval
        ? (this.output?.approvals?.[node.id]?.approvedActors?.[0] || 'awaiting')
        : 'system';
      const actorPillWidth = Math.max(92, Math.min(170, actorText.length * 7 + 42));
      nodeGroup
        .append('rect')
        .attr('x', x + 56)
        .attr('y', y + 74)
        .attr('width', actorPillWidth)
        .attr('height', 24)
        .attr('rx', 12)
        .attr('fill', '#f4f7fd')
        .attr('stroke', '#dee5f4')
        .attr('stroke-width', 1.1)
        .style('pointer-events', 'none');
      nodeGroup
        .append('text')
        .attr('x', x + 69)
        .attr('y', y + 89)
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .attr('fill', '#243252')
        .style('pointer-events', 'none')
        .text(actorText);

      const approved = this.output?.approvals?.[node.id]?.approvedActors?.length || 0;
      const required = node.k || 0;
      const isRequired = this.isRequiredNow(node);
      const badgeText = isApproval ? `${approved}/${required}` : 'system';
      const badgeFill = isFinal ? '#1d2a47' : '#121a30';
      nodeGroup
        .append('rect')
        .attr('x', x + w - 92)
        .attr('y', y + h - 34)
        .attr('width', 78)
        .attr('height', 24)
        .attr('rx', 11)
        .attr('fill', badgeFill)
        .style('pointer-events', 'none');
      nodeGroup
        .append('text')
        .attr('x', x + w - 53)
        .attr('y', y + h - 18)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .attr('fill', '#f4f7ff')
        .style('pointer-events', 'none')
        .text(badgeText);

      if (isApproval && node.gate) {
        const gateStatus = this.output?.nodes?.[node.id]?.result?.gate?.status || 'WAIT';
        const gateFill = gateStatus === 'PASS' ? '#1b7f45' : gateStatus === 'FAIL' ? '#ad3232' : '#28334f';
        nodeGroup
          .append('rect')
          .attr('x', x + w - 178)
          .attr('y', y + h - 34)
          .attr('width', 76)
          .attr('height', 24)
          .attr('rx', 11)
          .attr('fill', gateFill)
          .style('pointer-events', 'none');
        nodeGroup
          .append('text')
          .attr('x', x + w - 140)
          .attr('y', y + h - 18)
          .attr('text-anchor', 'middle')
          .attr('font-size', 11)
          .attr('font-weight', 700)
          .attr('fill', '#f4f7ff')
          .style('pointer-events', 'none')
          .text('gate');
      }

      if (node.guard) {
        const txt = isRequired ? 'required' : 'optional';
        const txtColor = isRequired ? '#c0670f' : '#6f7b99';
        nodeGroup
          .append('text')
          .attr('x', x + 56)
          .attr('y', y + h - 14)
          .attr('font-size', 12)
          .attr('font-weight', 700)
          .attr('fill', txtColor)
          .style('pointer-events', 'none')
          .text(`guard: ${txt}`);
      }
    }

    const saved = this.graphTransform || { x: 0, y: 0, k: 1 };
    const savedTransform = d3.zoomIdentity.translate(saved.x || 0, saved.y || 0).scale(saved.k || 1);
    const zoomBehavior = d3
      .zoom()
      .scaleExtent([0.45, 2.8])
      .on('zoom', (event) => {
        viewport.attr('transform', event.transform);
        this.graphTransform = {
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        };
      });

    svg.call(zoomBehavior).on('dblclick.zoom', null);
    svg.call(zoomBehavior.transform, savedTransform);
  }

  // Шаблон блока с легендой и контейнером графа.
  renderGraph() {
    return html`
      <div class="legend">
        <span class="ok"><i></i>done</span>
        <span class="err"><i></i>rejected</span>
        <span class="skip"><i></i>skipped/optional</span>
        <span>wheel: zoom, drag: pan</span>
      </div>
      <div class="graph-shell">
        <div id="graph"></div>
      </div>
    `;
  }

  // Перерисовка графа при изменении ключевых reactive-полей.
  updated(changedProps) {
    if (changedProps.has('output') || changedProps.has('workflowId') || changedProps.has('cost') || changedProps.has('selectedNodeId')) {
      this.ensureSelection();
      this.drawGraph();
    }
  }

  // Основной шаблон страницы.
  render() {
    const actorOptions = this.availableActors;
    const approvalAvailable = this.selectedNode && this.isSelectable(this.selectedNode.id);
    const commentValid = !this.requiresComment || this.comment.trim().length > 0;

    return html`
      <div class="shell">
        <header>
          <div>
            <h1>Document Approval Demo</h1>
            <div class="subtitle">Process flow with inline gate checks: intake -> legal(k=2 + gate) -> parallel -> finance(k=2 + gate) -> director -> publish</div>
          </div>
          <nav>
            <a href="/ui">Home</a>
            <a href="/ui/tickets">Service Desk</a>
            <a href="/ui/trip">Trip</a>
          </nav>
        </header>

        <section class="grid">
          <section class="panel graph">
            <h2>Route Graph</h2>
            ${this.renderGraph()}
          </section>

          <div class="workspace-row">
            <section class="panel workflows-panel">
              <h2>Document Workflows</h2>
              <button class="secondary" ?disabled=${this.busy} @click=${() => this.refreshWorkflowList()}>Refresh list</button>
              <div class="workflows-list">
                ${this.workflowItems.length === 0
                  ? html`<div class="hint">No workflows in this API session.</div>`
                  : this.workflowItems.map(
                      (item) => html`
                        <button
                          class="wf-item ${this.workflowId === item.workflowId ? 'active' : ''}"
                          @click=${() => this.pickWorkflow(item.workflowId)}
                        >
                          <div class="wf-item-top">
                            <span class="wf-id">${item.workflowId}</span>
                            <span class="wf-status ${this.workflowStatusClass(item.status)}">${this.workflowStatusLabel(item.status)}</span>
                          </div>
                          <div class="wf-time">start: ${this.formatDateTime(item.startTime)}</div>
                        </button>
                      `
                    )}
              </div>
            </section>

            <div class="control-row">
              <section class="panel">
                <h2>Start Workflow</h2>
                <label>docId</label>
                <input .value=${this.docId} @input=${(e) => (this.docId = e.target.value)} />
                <label>title</label>
                <input .value=${this.title} @input=${(e) => (this.title = e.target.value)} />
                <div class="inline">
                  <div>
                    <label>cost</label>
                    <input type="number" .value=${String(this.cost)} @input=${(e) => (this.cost = Number(e.target.value || 0))} />
                  </div>
                  <div>
                    <label>update cost</label>
                    <button class="secondary" ?disabled=${this.busy || !this.workflowId} @click=${this.updateCost}>Apply</button>
                  </div>
                </div>
                <button ?disabled=${this.busy} @click=${this.startWorkflow}>Start doc workflow</button>
                <button class="secondary" ?disabled=${this.busy || !this.workflowId} @click=${this.queryProgress}>Query progress</button>
              </section>

              <section class="panel">
                <h2>Approval Signal</h2>
                <label>workflowId</label>
                <input .value=${this.workflowId} @input=${(e) => (this.workflowId = e.target.value)} placeholder="doc-..." />
                <div class="hint">Selected step: ${this.selectedNode?.label || 'none'} (choose by graph click)</div>
                <label>actor</label>
                <select .value=${this.actor} @change=${(e) => (this.actor = e.target.value)} ?disabled=${!approvalAvailable || actorOptions.length === 0}>
                  ${actorOptions.length === 0
                    ? html`<option value="">no actors left</option>`
                    : actorOptions.map((member) => html`<option value=${member}>${member}</option>`)}
                </select>
                <label>decision</label>
                <div class="decision-row">
                  ${this.decisions.map(
                    (item) => html`
                      <button
                        class="decision-btn ${item.value} ${this.decision === item.value ? 'active' : ''}"
                        type="button"
                        ?disabled=${!approvalAvailable}
                        @click=${() => {
                          this.decision = item.value;
                          if (item.value === 'accept') {
                            this.comment = '';
                          }
                        }}
                      >
                        ${item.label}
                      </button>
                    `
                  )}
                </div>
                <label>comment (required for decline)</label>
                <input
                  .value=${this.comment}
                  @input=${(e) => (this.comment = e.target.value)}
                  placeholder="reason for decline"
                  ?disabled=${!approvalAvailable || !this.requiresComment}
                />
                <button ?disabled=${this.busy || !approvalAvailable || !this.actor || !this.workflowId || !commentValid} @click=${this.sendApproval}>
                  Send approval
                </button>
              </section>

              <section class="panel">
                <h2>Output</h2>
                <pre>${JSON.stringify(this.output || { hint: 'Use start/query actions' }, null, 2)}</pre>
              </section>
            </div>
          </div>
        </section>

        <div class="status">
          ${this.errorText ? html`<div class="error">${this.errorText}</div>` : html`<div>State: ${this.busy ? 'busy' : 'idle'}</div>`}
        </div>
      </div>

      <div class="toast-stack">
        ${this.toasts.map(
          (toast) => html`
            <div class="toast">
              <div>${toast.message}</div>
              <button class="x" type="button" @click=${() => this.dismissToast(toast.id)}>x</button>
            </div>
          `
        )}
      </div>
    `;
  }
}

customElements.define('doc-workflow-demo', DocWorkflowDemo);
