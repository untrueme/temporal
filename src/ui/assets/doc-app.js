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
    workflowChildren: { state: true },
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
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      flex: 1;
      overflow: hidden;
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
      padding: 10px;
    }

    .workspace-row {
      display: flex;
      gap: 12px;
      align-items: stretch;
      min-width: 0;
      min-height: 0;
      flex: 1;
    }

    .main-pane {
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: hidden;
    }

    .workflows-panel {
      width: 320px;
      min-width: 300px;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
    }

    .workflows-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding-right: 2px;
    }

    .wf-tree {
      display: grid;
      gap: 6px;
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

    .wf-children {
      margin-left: 16px;
      border-left: 2px solid rgba(95, 117, 170, 0.25);
      padding-left: 10px;
      display: grid;
      gap: 6px;
    }

    .wf-child {
      min-height: 32px;
      border: 1px solid rgba(142, 157, 193, 0.34);
      border-radius: 9px;
      background: #f6f8fe;
      padding: 6px 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.74rem;
      color: #2a3a60;
    }

    .wf-child-main {
      min-width: 0;
      display: grid;
      gap: 2px;
    }

    .wf-child-id {
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 198px;
    }

    .wf-child-node {
      font-size: 0.69rem;
      color: #60709a;
    }

    .wf-children-empty {
      font-size: 0.72rem;
      color: #67779f;
      padding: 3px 0 2px;
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

    .wf-status.done {
      background: #e2f8ea;
      color: #1f8248;
      border-color: #a7e2be;
    }

    .wf-status.skipped,
    .wf-status.pending {
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
      overflow: auto;
      overscroll-behavior: contain;
      height: clamp(360px, 52vh, 620px);
      max-height: 620px;
      scrollbar-width: thin;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 10px 24px rgba(36, 58, 102, 0.08);
    }

    #graph {
      min-height: 100%;
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
        min-width: 0;
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
    this.docId = 'cand-001';
    this.title = 'Иван Петров';
    this.cost = 140;
    this.workflowId = '';
    this.actor = '';
    this.decision = 'accept';
    this.comment = '';
    this.nodeId = 'recruiter.approval';
    this.selectedNodeId = 'recruiter.approval';
    this.output = null;
    this.workflowItems = [];
    this.workflowChildren = {};
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
      { value: 'accept', label: 'Принять' },
      { value: 'decline', label: 'Отклонить' },
    ];
  }

  // Для decline комментарий обязателен.
  get requiresComment() {
    return this.decision === 'decline';
  }

  // Демо-маршрут согласования кандидата (с child workflow и динамическим шагом).
  get route() {
    return {
      nodes: [
        {
          id: 'candidate.intake',
          type: 'handler.http',
          label: 'Регистрация кандидата',
          app: 'doc',
          action: 'candidate.intake',
          payload: {
            candidateName: '{{doc.title}}',
            salary: '{{doc.cost}}',
            candidateId: '{{doc.candidateId}}',
          },
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'candidate_profile',
              step: 'candidate.intake',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'candidate.intake',
              candidateName: '{{doc.title}}',
              salary: '{{doc.cost}}',
            },
          },
        },
        {
          id: 'recruiter.approval',
          type: 'approval.kofn',
          label: 'Согласование рекрутеров',
          members: ['Анна', 'Борис', 'Ирина'],
          k: 2,
          required: true,
          after: ['candidate.intake'],
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'recruiter_gate',
              step: 'recruiter.approval',
            },
          },
          gate: {
            app: 'doc',
            action: 'gate.recruiter.score',
            payload: {
              stage: 'recruiter',
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
              step: 'recruiter.approval',
            },
          },
        },
        {
          id: 'finance.precheck',
          type: 'child.start',
          label: 'Финансовый скоринг (дочерний)',
          workflowType: 'candidateFinanceCheck',
          after: ['recruiter.approval'],
          input: {
            baseUrl: '{{vars.docHandlers}}',
            docId: '{{doc.candidateId}}',
            payload: {
              candidateName: '{{doc.title}}',
              salary: '{{doc.cost}}',
            },
          },
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'finance_precheck',
              step: 'finance.precheck',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'finance.precheck',
            },
          },
        },
        {
          id: 'security.precheck',
          type: 'child.start',
          label: 'Проверка безопасности (дочерний)',
          workflowType: 'candidateSecurityCheck',
          after: ['recruiter.approval'],
          input: {
            baseUrl: '{{vars.docHandlers}}',
            docId: '{{doc.candidateId}}',
            payload: {
              candidateName: '{{doc.title}}',
              salary: '{{doc.cost}}',
            },
          },
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'security_precheck',
              step: 'security.precheck',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'security.precheck',
            },
          },
        },
        {
          id: 'finance.approval',
          type: 'approval.kofn',
          label: 'Согласование финансистов',
          members: ['Финансист 1', 'Финансист 2'],
          k: 1,
          required: true,
          after: ['finance.precheck'],
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
          id: 'security.approval',
          type: 'approval.kofn',
          label: 'Согласование службы безопасности',
          members: ['СБ 1', 'СБ 2'],
          k: 1,
          required: true,
          after: ['security.precheck'],
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
          id: 'director.approval',
          type: 'approval.kofn',
          label: 'Согласование директора',
          members: ['Директор 1', 'Директор 2'],
          k: 1,
          required: true,
          after: ['finance.approval', 'security.approval'],
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
          id: 'comp.committee',
          type: 'approval.kofn',
          label: 'Комитет по компенсациям',
          members: ['HRBP', 'CFO'],
          k: 1,
          required: true,
          after: ['director.approval'],
          guard: { op: 'gte', left: { path: 'doc.cost' }, right: 150 },
          pre: {
            app: 'doc',
            action: 'pre.policy.check',
            payload: {
              check: 'compensation_committee',
              step: 'comp.committee',
            },
          },
          post: {
            app: 'doc',
            action: 'kafka.snapshot',
            payload: {
              topic: 'doc.history.snapshots',
              step: 'comp.committee',
            },
          },
        },
        {
          id: 'notify',
          type: 'handler.http',
          label: 'Финальное решение и оффер',
          app: 'doc',
          action: 'candidate.offer.publish',
          after: ['comp.committee'],
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
      return 'Workflow уже завершен. Выберите активный процесс в списке слева.';
    }
    if (normalized.includes('workflow not found')) {
      return 'Workflow не найден. Обновите список и выберите существующий запуск.';
    }
    if (normalized.includes('comment is required for decline')) {
      return 'Для решения "Отклонить" нужно указать комментарий с причиной.';
    }
    if (
      normalized.includes('failed to query workflow') ||
      normalized.includes('did not register a handler for getprogress') ||
      normalized.includes('progress query is not available')
    ) {
      return 'Прогресс временно недоступен. Подождите 1-2 секунды и повторите запрос.';
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
      await this.hydrateWorkflowChildren(this.workflowItems);
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
        this.cacheWorkflowChildren(id, data);
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
        doc: { title: this.title, cost: Number(this.cost), candidateId: this.docId },
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

  // Извлекает дочерние workflow из node result.
  extractChildWorkflows(progress) {
    const nodes = progress?.nodes || {};
    const children = [];
    const seen = new Set();

    for (const [nodeId, nodeState] of Object.entries(nodes)) {
      const candidateIds = [];
      if (nodeState?.result?.childWorkflowId) {
        candidateIds.push(nodeState.result.childWorkflowId);
      }
      if (nodeState?.result?.child?.workflowId) {
        candidateIds.push(nodeState.result.child.workflowId);
      }
      if (Array.isArray(nodeState?.result?.children)) {
        for (const child of nodeState.result.children) {
          if (child?.workflowId) {
            candidateIds.push(child.workflowId);
          }
        }
      }

      for (const childWorkflowId of candidateIds) {
        if (!childWorkflowId || seen.has(childWorkflowId)) continue;
        seen.add(childWorkflowId);
        children.push({
          workflowId: childWorkflowId,
          parentNodeId: nodeId,
          status: nodeState?.status || 'unknown',
        });
      }
    }

    return children;
  }

  // Обновляет кэш дерева parent -> children.
  cacheWorkflowChildren(workflowId, progress) {
    if (!workflowId) return;
    const children = this.extractChildWorkflows(progress);
    this.workflowChildren = {
      ...this.workflowChildren,
      [workflowId]: children,
    };
  }

  // Фоново наполняет дерево для workflow из списка.
  async hydrateWorkflowChildren(items) {
    const targets = (items || []).slice(0, 8).filter((item) => {
      return !Object.prototype.hasOwnProperty.call(this.workflowChildren, item.workflowId);
    });

    for (const item of targets) {
      try {
        const progress = await this.request(`/workflows/doc/${item.workflowId}/progress`);
        this.cacheWorkflowChildren(item.workflowId, progress);
      } catch {
        // Для completed/старых раннов query может быть недоступен.
      }
    }
  }

  // Нормализует статус child execution в класс бейджа.
  childStatusClass(status) {
    const normalized = String(status || 'unknown').toLowerCase();
    if (normalized === 'done') return 'done';
    if (normalized === 'running') return 'running';
    if (normalized === 'failed') return 'failed';
    if (normalized === 'skipped') return 'skipped';
    if (normalized === 'pending') return 'pending';
    return 'unknown';
  }

  // Человекочитаемый label child execution.
  childStatusLabel(status) {
    const normalized = String(status || 'unknown').toLowerCase();
    if (normalized === 'done') return 'выполнено';
    if (normalized === 'running') return 'в работе';
    if (normalized === 'failed') return 'ошибка';
    if (normalized === 'skipped') return 'пропущено';
    if (normalized === 'pending') return 'ожидание';
    return 'неизвестно';
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
    const colGap = 124;
    const laneGap = 178;
    const startX = 48;
    const startY = 30;
    const map = {
      'candidate.intake': { col: 1, row: 0 },
      'recruiter.approval': { col: 1, row: 1 },
      'finance.precheck': { col: 0, row: 2 },
      'security.precheck': { col: 2, row: 2 },
      'finance.approval': { col: 0, row: 3 },
      'security.approval': { col: 2, row: 3 },
      'director.approval': { col: 1, row: 4 },
      'comp.committee': { col: 1, row: 5 },
      notify: { col: 1, row: 6, terminal: true },
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
      empty.textContent = 'Запустите workflow или нажмите "Обновить прогресс", чтобы построить граф.';
      container.appendChild(empty);
      return;
    }

    const nodes = this.activeRoute.nodes;
    const positions = new Map(nodes.map((node) => [node.id, { node, ...this.layoutFor(node.id) }]));
    const rightMost = Math.max(...[...positions.values()].map((item) => item.x + item.w));
    const bottomMost = Math.max(...[...positions.values()].map((item) => item.y + item.h));
    const width = Math.max(1220, rightMost + 120);
    const height = Math.max(980, bottomMost + 80);

    const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', width)
      .attr('height', height)
      .attr('role', 'img');

    const defs = svg.append('defs');
    const bgLayer = svg.append('g').attr('class', 'graph-bg');
    const viewport = svg.append('g').attr('class', 'graph-viewport');

    const pattern = defs
      .append('pattern')
      .attr('id', 'dot-grid')
      .attr('width', 26)
      .attr('height', 26)
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('circle').attr('cx', 2).attr('cy', 2).attr('r', 1.4).attr('fill', '#d2d9ea');
    const bgPadding = Math.max(width, height) * 2;
    bgLayer
      .append('rect')
      .attr('x', -bgPadding)
      .attr('y', -bgPadding)
      .attr('width', width + bgPadding * 2)
      .attr('height', height + bgPadding * 2)
      .attr('fill', 'url(#dot-grid)');

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

    const linkGroup = viewport
      .append('g')
      .attr('fill', 'none')
      .attr('stroke-width', 2.8)
      .attr('stroke-linecap', 'round')
      .attr('stroke-linejoin', 'round');

    // Считаем структуру зависимостей: parent -> children.
    const childrenByParent = new Map();
    for (const node of nodes) {
      for (const depId of node.after || []) {
        if (!childrenByParent.has(depId)) {
          childrenByParent.set(depId, []);
        }
        childrenByParent.get(depId).push(node.id);
      }
    }

    // Для каждого parent вычисляем общую Y-линию ветвления (как в орг-чартах).
    const branchYByParent = new Map();
    for (const [parentId, childIds] of childrenByParent.entries()) {
      const from = positions.get(parentId);
      if (!from) continue;
      const sourceY = from.y + from.h + 4;
      const targetYs = childIds
        .map((childId) => positions.get(childId))
        .filter(Boolean)
        .map((to) => (to.terminal ? to.y + 8 : to.y - 10));
      const minTargetY = targetYs.length > 0 ? Math.min(...targetYs) : sourceY + 56;
      const branchY = Math.max(sourceY + 18, Math.min(minTargetY - 26, sourceY + 58));
      branchYByParent.set(parentId, branchY);
    }

    // Генератор ортогональной связи с мягкими скруглениями.
    const buildOrthogonalPath = (x1, y1, x2, y2, branchY) => {
      const radius = 14;
      if (Math.abs(x1 - x2) < 1.5) {
        return `M${x1},${y1} V${y2}`;
      }
      const dir = x2 > x1 ? 1 : -1;
      const firstTurnY = Math.max(y1 + 6, branchY - radius);
      const secondTurnY = branchY + radius;
      return [
        `M${x1},${y1}`,
        `V${firstTurnY}`,
        `Q${x1},${branchY} ${x1 + dir * radius},${branchY}`,
        `H${x2 - dir * radius}`,
        `Q${x2},${branchY} ${x2},${secondTurnY}`,
        `V${y2}`,
      ].join(' ');
    };

    for (const node of nodes) {
      for (const depId of node.after || []) {
        const from = positions.get(depId);
        const to = positions.get(node.id);
        if (!from || !to) continue;

        const source = {
          x: from.x + from.w / 2,
          y: from.y + from.h + 4,
        };
        const target = {
          x: to.x + to.w / 2,
          y: to.terminal ? to.y + 8 : to.y - 10,
        };
        const branchY = branchYByParent.get(depId) ?? source.y + 44;
        const path = buildOrthogonalPath(source.x, source.y, target.x, target.y, branchY);

        const color = this.edgeColor(depId, node.id);
        linkGroup
          .append('path')
          .attr('d', path)
          .attr('stroke', color);
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
          .text('Финал');

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
          .text(finalCompleted ? 'завершено' : this.hasRejection() ? 'отклонено' : 'ожидание');

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

      const typeLabel =
        node.type === 'approval.kofn'
          ? 'Согласование'
          : node.type === 'child.start'
            ? 'Дочерний процесс'
            : 'Автошаг';
      nodeGroup
        .append('text')
        .attr('x', x + 56)
        .attr('y', y + 28)
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#5f6f95')
        .style('pointer-events', 'none')
        .text(typeLabel);

      const titleRaw = node.label || node.id;
      const titleText = titleRaw.length > 30 ? `${titleRaw.slice(0, 28)}...` : titleRaw;
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
        ? (this.output?.approvals?.[node.id]?.approvedActors?.[0] || 'ожидается')
        : 'автоматически';
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
      const badgeText = isApproval ? `${approved}/${required}` : 'авто';
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
        const txt = isRequired ? 'обязательный' : 'опциональный';
        const txtColor = isRequired ? '#c0670f' : '#6f7b99';
        nodeGroup
          .append('text')
          .attr('x', x + 56)
          .attr('y', y + h - 14)
          .attr('font-size', 12)
          .attr('font-weight', 700)
          .attr('fill', txtColor)
          .style('pointer-events', 'none')
          .text(`условие: ${txt}`);
      }
    }

    const saved = this.graphTransform || { x: 0, y: 0, k: 1 };
    const normalizedTransform = {
      x: Math.max(-width, Math.min(width, Number(saved.x) || 0)),
      y: Math.max(-height, Math.min(height, Number(saved.y) || 0)),
      k: Math.max(0.45, Math.min(2.8, Number(saved.k) || 1)),
    };
    const savedTransform = d3.zoomIdentity
      .translate(normalizedTransform.x, normalizedTransform.y)
      .scale(normalizedTransform.k);
    const applyVisualTransform = (transform) => {
      const k = transform.k || 1;
      const tx = (transform.x || 0) / k;
      const ty = (transform.y || 0) / k;

      // Масштаб меняет реальный размер SVG, чтобы внутренний скролл учитывал zoom.
      svg.attr('width', Math.round(width * k)).attr('height', Math.round(height * k));
      viewport.attr('transform', `translate(${tx},${ty})`);
      bgLayer.attr('transform', `translate(${tx},${ty})`);
    };
    const zoomBehavior = d3
      .zoom()
      .scaleExtent([0.45, 2.8])
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [-width * 0.6, -height * 0.6],
        [width * 1.6, height * 1.6],
      ])
      .on('zoom', (event) => {
        applyVisualTransform(event.transform);
        this.graphTransform = {
          x: event.transform.x,
          y: event.transform.y,
          k: event.transform.k,
        };
      });

    svg.call(zoomBehavior).on('dblclick.zoom', null);
    applyVisualTransform(savedTransform);
    svg.call(zoomBehavior.transform, savedTransform);
  }

  // Шаблон блока с легендой и контейнером графа.
  renderGraph() {
    return html`
      <div class="legend">
        <span class="ok"><i></i>выполнено</span>
        <span class="err"><i></i>отклонено</span>
        <span class="skip"><i></i>пропущено/опционально</span>
        <span>колесо: зум, перетаскивание: панорама</span>
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
            <h1>Демо: Согласование кандидата</h1>
            <div class="subtitle">
              Подбор и согласование: рекрутеры -> параллельно финансы и безопасность -> директор -> (опционально) комитет по компенсациям -> оффер
            </div>
          </div>
          <nav>
            <a href="/ui">Home</a>
            <a href="/ui/tickets">Service Desk</a>
            <a href="/ui/trip">Trip</a>
          </nav>
        </header>

        <section class="grid">
          <div class="workspace-row">
            <section class="panel workflows-panel">
              <h2>Запущенные процессы</h2>
              <button class="secondary" ?disabled=${this.busy} @click=${() => this.refreshWorkflowList()}>Обновить список</button>
              <div class="workflows-list">
                ${this.workflowItems.length === 0
                  ? html`<div class="hint">В этой сессии пока нет запусков.</div>`
                  : this.workflowItems.map(
                      (item) => {
                        const hasChildren = Object.prototype.hasOwnProperty.call(
                          this.workflowChildren,
                          item.workflowId
                        );
                        const children = hasChildren ? this.workflowChildren[item.workflowId] : [];
                        const showChildren = hasChildren && (children.length > 0 || this.workflowId === item.workflowId);

                        return html`
                          <div class="wf-tree">
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
                            ${showChildren
                              ? html`
                                  <div class="wf-children">
                                    ${children.length === 0
                                      ? html`<div class="wf-children-empty">дочерние workflow отсутствуют</div>`
                                      : children.map(
                                          (child) => html`
                                            <div class="wf-child">
                                              <div class="wf-child-main">
                                                <div class="wf-child-id">${child.workflowId}</div>
                                                <div class="wf-child-node">узел: ${child.parentNodeId}</div>
                                              </div>
                                              <span class="wf-status ${this.childStatusClass(child.status)}"
                                                >${this.childStatusLabel(child.status)}</span
                                              >
                                            </div>
                                          `
                                        )}
                                  </div>
                                `
                              : ''}
                          </div>
                        `;
                      }
                    )}
              </div>
            </section>

            <div class="main-pane">
              <section class="panel graph">
                <h2>Граф маршрута</h2>
                ${this.renderGraph()}
              </section>

              <div class="control-row">
                <section class="panel">
                  <h2>Запуск процесса</h2>
                  <label>id кандидата</label>
                  <input .value=${this.docId} @input=${(e) => (this.docId = e.target.value)} />
                  <label>ФИО кандидата</label>
                  <input .value=${this.title} @input=${(e) => (this.title = e.target.value)} />
                  <div class="inline">
                    <div>
                      <label>Оклад (условные единицы)</label>
                      <input type="number" .value=${String(this.cost)} @input=${(e) => (this.cost = Number(e.target.value || 0))} />
                    </div>
                    <div>
                      <label>Изменить оклад</label>
                      <button class="secondary" ?disabled=${this.busy || !this.workflowId} @click=${this.updateCost}>Применить</button>
                    </div>
                  </div>
                  <button ?disabled=${this.busy} @click=${this.startWorkflow}>Запустить согласование</button>
                  <button class="secondary" ?disabled=${this.busy || !this.workflowId} @click=${this.queryProgress}>Обновить прогресс</button>
                </section>

                <section class="panel">
                  <h2>Сигнал согласования</h2>
                  <label>workflowId</label>
                  <input .value=${this.workflowId} @input=${(e) => (this.workflowId = e.target.value)} placeholder="doc-..." />
                  <div class="hint">Выбранный шаг: ${this.selectedNode?.label || 'не выбран'} (выбор кликом по графу)</div>
                  <label>Участник</label>
                  <select .value=${this.actor} @change=${(e) => (this.actor = e.target.value)} ?disabled=${!approvalAvailable || actorOptions.length === 0}>
                    ${actorOptions.length === 0
                      ? html`<option value="">нет доступных участников</option>`
                      : actorOptions.map((member) => html`<option value=${member}>${member}</option>`)}
                  </select>
                  <label>Решение</label>
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
                  <label>Комментарий (обязателен при отклонении)</label>
                  <input
                    .value=${this.comment}
                    @input=${(e) => (this.comment = e.target.value)}
                    placeholder="укажите причину отклонения"
                    ?disabled=${!approvalAvailable || !this.requiresComment}
                  />
                  <button ?disabled=${this.busy || !approvalAvailable || !this.actor || !this.workflowId || !commentValid} @click=${this.sendApproval}>
                    Отправить решение
                  </button>
                </section>

                <section class="panel">
                  <h2>Результат</h2>
                  <pre>${JSON.stringify(this.output || { hint: 'Запустите процесс или обновите прогресс' }, null, 2)}</pre>
                </section>
              </div>
            </div>
          </div>
        </section>

        <div class="status">
          ${this.errorText ? html`<div class="error">${this.errorText}</div>` : html`<div>Состояние: ${this.busy ? 'занято' : 'ожидание'}</div>`}
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
