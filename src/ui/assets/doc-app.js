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

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .shell {
      width: 100%;
      height: 100vh;
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
      min-height: 0;
      overflow: hidden;
    }

    .control-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      align-items: stretch;
      min-width: 0;
    }

    .control-row > .panel {
      min-width: 0;
      min-height: 0;
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
      min-height: 0;
    }

    .panel.graph {
      padding: 10px;
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .panel.result {
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      align-content: stretch;
    }

    .panel.graph .graph-shell {
      flex: 1;
      min-height: 0;
    }

    .workspace-row {
      display: grid;
      grid-template-columns: minmax(280px, 22%) minmax(0, 1fr) minmax(340px, 32%);
      grid-template-rows: minmax(0, 1fr);
      gap: 12px;
      align-items: stretch;
      min-width: 0;
      min-height: 0;
      flex: 1;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
    }

    .main-pane {
      order: 2;
      min-width: 0;
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 12px;
      overflow: hidden;
    }

    .workflows-panel {
      order: 1;
      width: auto;
      min-width: 0;
      max-width: none;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
      max-height: 100%;
      overflow: hidden;
    }

    .result-pane {
      order: 3;
      min-width: 0;
      min-height: 0;
      height: 100%;
      max-height: 100%;
      overflow: hidden;
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
      cursor: pointer;
    }

    .wf-child:hover {
      border-color: rgba(90, 113, 170, 0.52);
      background: #edf3ff;
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

    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .panel-head .head-note {
      font-size: 0.74rem;
      color: #4d5b80;
      font-weight: 700;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

    .inline > div {
      min-width: 0;
      display: grid;
      gap: 6px;
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
      position: relative;
      border-radius: 12px;
      border: 1px dashed rgba(62, 86, 140, 0.32);
      background: #f8f9ff;
      padding: 8px;
      overflow: hidden;
      overscroll-behavior: contain;
      min-height: 140px;
      height: 100%;
      max-height: 100%;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 10px 24px rgba(36, 58, 102, 0.08);
    }

    #graph {
      height: 100%;
      width: 100%;
      min-height: 0;
      min-width: 0;
    }

    .graph-tooltip {
      position: absolute;
      z-index: 20;
      pointer-events: none;
      max-width: 320px;
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid rgba(66, 86, 138, 0.25);
      background: rgba(22, 34, 62, 0.95);
      color: #edf2ff;
      font-size: 0.74rem;
      line-height: 1.35;
      box-shadow: 0 10px 28px rgba(17, 28, 56, 0.3);
      opacity: 0;
      transform: translateY(-3px);
      transition: opacity 80ms ease;
      white-space: normal;
      word-break: break-word;
    }

    #graph svg {
      display: block;
      width: 100%;
      height: 100%;
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

    .graph-info {
      display: grid;
      gap: 8px;
      margin: 0 0 8px;
    }

    .rules-box {
      border: 1px solid rgba(57, 83, 143, 0.24);
      background: linear-gradient(160deg, rgba(239, 245, 255, 0.86), rgba(247, 250, 255, 0.86));
      border-radius: 10px;
      padding: 8px 10px;
      display: grid;
      gap: 6px;
      color: #21325c;
    }

    .rules-title {
      font-size: 0.78rem;
      font-weight: 800;
      color: #233566;
    }

    .rules-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px 10px;
      font-size: 0.74rem;
      line-height: 1.3;
    }

    .rule-item {
      white-space: normal;
    }

    .hint {
      font-size: 0.78rem;
      color: #5d6a8d;
      line-height: 1.35;
    }

    pre {
      margin: 0;
      max-height: none;
      max-width: 100%;
      overflow: auto;
      font-size: 0.73rem;
      background: #0f1729;
      color: #d8e4ff;
      border-radius: 10px;
      padding: 10px;
      line-height: 1.35;
      flex: 1;
      min-height: 0;
    }

    .result-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding-right: 2px;
      display: flex;
      flex-direction: column;
      gap: 8px;
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

    .reason-box {
      border-radius: 12px;
      border: 1px solid #e6b2b2;
      background: #fff3f3;
      color: #6f1f1f;
      padding: 10px 12px;
      display: grid;
      gap: 6px;
    }

    .reason-box.warn {
      border-color: #f0cc8f;
      background: #fff8ec;
      color: #7b521b;
    }

    .reason-title {
      font-size: 0.86rem;
      font-weight: 800;
      line-height: 1.2;
    }

    .reason-message {
      font-size: 0.8rem;
      line-height: 1.35;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .reason-meta {
      font-size: 0.76rem;
      line-height: 1.3;
      opacity: 0.95;
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
        grid-template-columns: 1fr;
      }

      .workflows-panel {
        width: 100%;
        max-width: none;
        min-width: 0;
      }

      .control-row {
        grid-template-columns: 1fr;
      }

      .decision-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .rules-grid {
        grid-template-columns: 1fr;
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
    this.graphTransform = null;
    this.lastReasonToastKey = '';
    this.navigationStack = [];
    this.childParentMap = {};
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
              candidateName: '{{doc.title}}',
              salary: '{{doc.cost}}',
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
        },
        {
          id: 'finance.group',
          type: 'child.start',
          label: 'Финансовая группа (скоринг + 2-of-N)',
          workflowType: 'candidateFinanceCheck',
          after: ['recruiter.approval'],
          input: {
            baseUrl: '{{context.docHandlers}}',
            docId: '{{doc.candidateId}}',
            payload: {
              candidateName: '{{doc.title}}',
              salary: '{{doc.cost}}',
            },
          },
          setVars: {
            finance_child_workflow_id: '{{result.childWorkflowId}}',
          },
        },
        {
          id: 'security.precheck',
          type: 'child.start',
          label: 'Проверка безопасности (дочерний)',
          workflowType: 'candidateSecurityCheck',
          after: ['recruiter.approval'],
          input: {
            baseUrl: '{{context.docHandlers}}',
            docId: '{{doc.candidateId}}',
            payload: {
              candidateName: '{{doc.title}}',
              salary: '{{doc.cost}}',
            },
          },
          setVars: {
            security_child_workflow_id: '{{result.childWorkflowId}}',
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
        },
        {
          id: 'director.approval',
          type: 'approval.kofn',
          label: 'Согласование директора',
          members: ['Директор 1', 'Директор 2'],
          k: 1,
          required: true,
          after: ['finance.group', 'security.approval'],
        },
        {
          id: 'comp.committee',
          type: 'approval.kofn',
          label: 'Комитет по компенсациям',
          members: ['HRBP', 'CFO'],
          k: 1,
          required: true,
          after: ['director.approval'],
          guard: {
            op: 'gte',
            left: { path: 'doc.cost' },
            right: 150,
          },
        },
        {
          id: 'notify',
          type: 'handler.http',
          label: 'Финальное решение и оффер',
          app: 'doc',
          action: 'candidate.offer.publish',
          after: ['comp.committee'],
          payload: {
            candidateName: '{{doc.title}}',
            salary: '{{doc.cost}}',
          },
        },
      ],
    };
  }

  // Активный маршрут: из execution state (если есть), иначе локальный шаблон.
  get activeRoute() {
    const route = this.output?.context?.route;
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
    const approved = this.getStepState(node.id)?.approval?.approvedActors || [];
    return (node.members || []).filter((member) => !approved.includes(member));
  }

  // Быстрый map nodeId -> nodeConfig.
  get nodeById() {
    return new Map(this.activeRoute.nodes.map((node) => [node.id, node]));
  }

  // Каноничные runtime-состояния шагов.
  get stepStates() {
    return this.output?.context?.steps || {};
  }

  // Безопасный доступ к runtime-состоянию шага.
  getStepState(nodeId) {
    return this.stepStates?.[nodeId] || null;
  }

  // Возвращает зависимости узла (after[]).
  depsFor(nodeId) {
    const node = this.nodeById.get(nodeId);
    return node?.after || [];
  }

  // Локальная проверка guard на основе текущей суммы cost.
  guardActive(node) {
    if (!node?.guard) return true;
    const runtimeContext = this.output?.context || {};
    const ctx = {
      doc: {
        ...(this.output?.context?.document || {}),
        cost: Number(this.cost),
      },
      context: runtimeContext,
      vars: runtimeContext,
    };

    const getPath = (obj, path) => {
      const parts = String(path || '').split('.');
      let cur = obj;
      for (const part of parts) {
        if (cur == null) return undefined;
        cur = cur[part];
      }
      return cur;
    };

    const resolveOperand = (operand) => {
      if (
        operand &&
        typeof operand === 'object' &&
        Object.prototype.hasOwnProperty.call(operand, 'path')
      ) {
        return getPath(ctx, operand.path);
      }
      return operand;
    };

    const evalExpr = (guard) => {
      if (!guard) return true;
      const op = guard.op || guard.operator;
      if (op === 'and') {
        const list = guard.guards || [];
        return list.every((g) => evalExpr(g));
      }
      if (op === 'or') {
        const list = guard.guards || [];
        return list.some((g) => evalExpr(g));
      }
      if (op === 'not') {
        return !evalExpr(guard.guard);
      }

      const left = resolveOperand(guard.left);
      const right = resolveOperand(guard.right);
      switch (op) {
        case 'eq':
          return left === right;
        case 'ne':
        case 'neq':
          return left !== right;
        case 'gt':
          return left > right;
        case 'gte':
          return left >= right;
        case 'lt':
          return left < right;
        case 'lte':
          return left <= right;
        case 'exists':
          return left !== undefined && left !== null;
        case 'in':
          return Array.isArray(right) ? right.includes(left) : false;
        default:
          return false;
      }
    };

    return evalExpr(node.guard);
  }

  // Каноничный, упрощенный view результата для панели "Результат".
  get outputForDisplay() {
    if (!this.output) return null;
    const view = {
      processType: this.output.processType,
      status: this.output.status,
      statusMessage: this.output.statusMessage || null,
      startedAt: this.output.startedAt || null,
      completedAt: this.output.completedAt || null,
      context: this.output.context || {},
    };
    if (this.output.abort) view.abort = this.output.abort;
    if (this.output.failure) view.failure = this.output.failure;
    if (this.output.lastSignalError) view.lastSignalError = this.output.lastSignalError;
    return view;
  }

  // Узел обязателен "прямо сейчас" (учитывая guard).
  isRequiredNow(node) {
    if (!node) return false;
    if (node.guard && !this.guardActive(node)) return false;
    return node.required !== false;
  }

  // doneish-статус узла в текущем output.
  doneish(nodeId) {
    const nodeState = this.getStepState(nodeId);
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

    const state = this.getStepState(node.id);
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

  // Выбирает первый доступный approval-узел в текущем маршруте.
  focusFirstSelectableApproval() {
    const next = this.approvalNodes.find((node) => this.isSelectable(node.id));
    if (!next) return false;
    this.selectedNodeId = next.id;
    this.nodeId = next.id;
    this.actor = this.availableActors[0] || '';
    return true;
  }

  // Ждет, пока выбранный шаг сменит статус после отправки сигнала.
  async waitForNodeCompletion(workflowId, nodeId, { timeoutMs = 3400, intervalMs = 220 } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await this.loadProgress(workflowId);
      const status = this.getStepState(nodeId)?.status;
      if (status === 'done' || status === 'skipped' || status === 'failed') {
        return true;
      }
      const workflowStatus = String(this.output?.status || '').toLowerCase();
      if (workflowStatus && workflowStatus !== 'running') {
        return true;
      }
      await this.sleep(intervalMs);
    }
    return false;
  }

  // После старта процесса ждет автошаги и переводит на первый интерактивный узел.
  async waitForFirstInteractiveStep(workflowId, { timeoutMs = 7000, intervalMs = 260 } = {}) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      await this.loadProgress(workflowId);
      if (this.focusFirstSelectableApproval()) {
        return true;
      }
      const workflowStatus = String(this.output?.status || '').toLowerCase();
      if (workflowStatus && workflowStatus !== 'running') {
        return false;
      }
      await this.sleep(intervalMs);
    }
    return false;
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
    const previousWorkflowId = this.workflowId;
    const maxAttempts = 5;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const data = await this.request(`/workflows/doc/${id}/progress`);
        if (previousWorkflowId && previousWorkflowId !== id) {
          this.graphTransform = null;
        }
        this.workflowId = id;
        this.output = data;
        this.cacheWorkflowChildren(id, data);
        const nextCost = data?.context?.document?.cost ?? data?.doc?.cost;
        if (nextCost !== undefined) {
          this.cost = Number(nextCost);
        }
        this.ensureSelection();
        this.drawGraph();
        this.maybeNotifyFailure(data);
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
      this.navigationStack = [];
      this.workflowId = data.workflowId;
      const movedToInteractive = await this.waitForFirstInteractiveStep(data.workflowId);
      if (!movedToInteractive) {
        await this.loadProgress(data.workflowId);
      }
      this.focusFirstSelectableApproval();
      await this.refreshWorkflowList({ silent: true });
    });
  }

  // Отправляет approval signal в выбранный workflow/узел.
  async sendApproval() {
    await this.run(async () => {
      const workflowId = this.workflowId || `doc-${this.docId}`;
      const nodeId = this.nodeId;
      await this.request(`/workflows/doc/${workflowId}/approval`, {
        method: 'POST',
        body: JSON.stringify({
          nodeId,
          actor: this.actor,
          decision: this.decision,
          comment: this.comment,
        }),
      });
      this.comment = '';
      const settled = await this.waitForNodeCompletion(workflowId, nodeId);
      if (!settled) {
        await this.loadProgress(workflowId);
      }
      this.focusFirstSelectableApproval();
      await this.refreshWorkflowList({ silent: true });
    });
  }

  // Запрашивает текущий progress execution.
  async queryProgress() {
    await this.run(async () => {
      await this.loadProgress();
      this.focusFirstSelectableApproval();
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
      this.focusFirstSelectableApproval();
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
    const nodes = progress?.context?.steps || {};
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
    const nextChildParentMap = { ...this.childParentMap };
    for (const child of children) {
      if (child?.workflowId) {
        nextChildParentMap[child.workflowId] = workflowId;
      }
    }
    this.childParentMap = nextChildParentMap;
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
  async pickWorkflow(workflowId, options = {}) {
    if (!workflowId) return;
    const {
      preserveStack = false,
      parentWorkflowId = null,
      resetToRoot = true,
    } = options;
    if (parentWorkflowId) {
      const tail = this.navigationStack[this.navigationStack.length - 1];
      if (tail !== parentWorkflowId) {
        this.navigationStack = [...this.navigationStack, parentWorkflowId];
      }
    } else if (!preserveStack && resetToRoot) {
      this.navigationStack = [];
    }
    this.workflowId = workflowId;
    await this.queryProgress();
  }

  // Возврат из дочернего процесса к родительскому.
  async goBackToParentWorkflow() {
    if (this.navigationStack.length === 0) return;
    const parentWorkflowId = this.navigationStack[this.navigationStack.length - 1];
    this.navigationStack = this.navigationStack.slice(0, -1);
    await this.pickWorkflow(parentWorkflowId, { preserveStack: true, resetToRoot: false });
  }

  // Извлекает child workflow id для узла child.start.
  childWorkflowIdForNode(nodeId) {
    const nodeState = this.getStepState(nodeId);
    const explicitId =
      nodeState?.result?.childWorkflowId ||
      nodeState?.result?.child?.workflowId ||
      null;
    if (explicitId) return explicitId;

    const fromTree = (this.workflowChildren?.[this.workflowId] || []).find((child) => {
      return child.parentNodeId === nodeId;
    });
    if (fromTree?.workflowId) return fromTree.workflowId;

    // Child workflowId формируется детерминированно в engine: <parentWorkflowId>-<nodeId>.
    if (this.workflowId && nodeId) {
      return `${this.workflowId}-${nodeId}`;
    }
    return null;
  }

  // Drill-down в дочерний процесс по узлу маршрута.
  async drillIntoChildWorkflow(nodeId) {
    await this.run(async () => {
      const childWorkflowId = this.childWorkflowIdForNode(nodeId);
      if (!childWorkflowId) {
        throw new Error('Дочерний workflow еще не создан или не завершил запуск');
      }
      const parentWorkflowId = this.workflowId;
      const tail = this.navigationStack[this.navigationStack.length - 1];
      if (tail !== parentWorkflowId) {
        this.navigationStack = [...this.navigationStack, parentWorkflowId];
      }
      this.workflowId = childWorkflowId;
      await this.loadProgress(childWorkflowId);
      this.focusFirstSelectableApproval();
      await this.refreshWorkflowList({ silent: true });
    });
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
    const stepStates = this.output?.context?.steps || {};
    if (!stepStates || typeof stepStates !== 'object') return false;
    return Object.values(stepStates).some((nodeState) => {
      const outcome = nodeState?.result?.outcome;
      const childStatus = String(
        nodeState?.result?.childStatus || nodeState?.result?.result?.status || ''
      ).toLowerCase();
      return (
        outcome === 'rejected' ||
        outcome === 'needs_changes' ||
        childStatus === 'rejected' ||
        childStatus === 'failed' ||
        childStatus === 'needs_changes' ||
        childStatus === 'terminated' ||
        childStatus === 'timed_out' ||
        childStatus === 'canceled'
      );
    });
  }

  // Нормализация статуса узла в удобные UI-состояния.
  resolveNodeStatus(nodeId) {
    const nodeState = this.getStepState(nodeId);
    if (!nodeState) return 'idle';
    const outcome = nodeState?.result?.outcome;
    const childStatus = String(
      nodeState?.result?.childStatus || nodeState?.result?.result?.status || ''
    ).toLowerCase();
    if (
      childStatus === 'failed' ||
      childStatus === 'rejected' ||
      childStatus === 'needs_changes' ||
      childStatus === 'terminated' ||
      childStatus === 'timed_out' ||
      childStatus === 'canceled'
    ) {
      return 'rejected';
    }
    if (childStatus === 'running') return 'running';
    if (outcome === 'rejected' || outcome === 'needs_changes') return 'rejected';
    if (nodeState.status === 'failed') return 'rejected';
    if (nodeState.status === 'running') return 'running';
    if (nodeState.status === 'done') return 'done';
    if (nodeState.status === 'skipped') return 'skipped';
    return 'idle';
  }

  // Человекочитаемая расшифровка reasonCode.
  reasonCodeLabel(reasonCode) {
    const code = String(reasonCode || '').trim().toLowerCase();
    if (!code) return '';
    const map = {
      approval_decision: 'отрицательное решение согласующего',
      gate_condition_failed: 'не пройдено gate-условие',
      step_failed: 'ошибка выполнения шага',
      child_process_failed: 'дочерний процесс завершился неуспешно',
      profile_incomplete: 'не заполнены обязательные поля профиля кандидата',
      salary_above_recruiter_limit: 'ожидаемый оклад выше лимита рекрутера',
      budget_not_feasible: 'финансовая модель не подтверждает бюджет',
      risk_too_high: 'риск по проверке безопасности слишком высокий',
    };
    return map[code] || code.replaceAll('_', ' ');
  }

  // Собирает понятную причину отказа/ошибки из progress-state.
  resolveFailureInfo(progress = this.output) {
    if (!progress) return null;
    const status = String(progress.status || '').toLowerCase();
    const abort = progress.abort || {};
    const failure = progress.failure || {};
    const signalError = progress.lastSignalError || null;

    if (signalError) {
      return {
        key: `signal-${signalError.type}-${signalError.at || ''}`,
        tone: 'warn',
        title: 'Сигнал не принят',
        message: signalError.message || 'Ошибка валидации сигнала',
        nodeLabel: signalError.nodeId || null,
        reasonText: null,
        technicalError: null,
        actor: signalError.actor || null,
        comment: null,
      };
    }

    const terminalFailed =
      status === 'rejected' ||
      status === 'failed' ||
      status === 'needs_changes' ||
      status === 'terminated' ||
      status === 'timed_out' ||
      status === 'canceled';
    if (!terminalFailed) return null;

    const failedNodeEntry = Object.entries(progress?.context?.steps || {}).find(([, nodeState]) => {
      return nodeState?.status === 'failed';
    });
    const failedNodeId = failedNodeEntry?.[0] || abort.nodeId || failure.nodeId || progress.failedNodeId || null;
    const failedNodeLabel =
      abort.nodeLabel ||
      failure.nodeLabel ||
      progress.failedNodeLabel ||
      this.nodeById.get(failedNodeId)?.label ||
      failedNodeId ||
      null;
    const reasonCode = abort.reason || failure.reasonCode || progress.reasonCode || null;
    const reasonText = abort.reasonText || failure.reasonText || this.reasonCodeLabel(reasonCode);
    const failedNodeMessage =
      failedNodeEntry?.[1]?.error?.message ||
      failedNodeEntry?.[1]?.error?.technicalMessage ||
      null;
    const message =
      abort.message ||
      progress.statusMessage ||
      failure.error ||
      abort.error ||
      failedNodeMessage ||
      'Процесс остановлен без детального сообщения.';
    const technicalError =
      abort.technicalError || failure.technicalError || failedNodeEntry?.[1]?.error?.technicalMessage || null;

    return {
      key: `${status}-${reasonCode || ''}-${failedNodeId || ''}-${message}`,
      tone: 'error',
      title: status === 'failed' ? 'Причина остановки процесса' : 'Причина отклонения процесса',
      message,
      nodeLabel: failedNodeLabel,
      reasonText,
      technicalError,
      actor: abort.actor || null,
      comment: abort.comment || null,
    };
  }

  // Один раз показывает причину в toast после получения progress.
  maybeNotifyFailure(progress) {
    const info = this.resolveFailureInfo(progress);
    if (!info || info.tone === 'warn') return;
    if (info.key === this.lastReasonToastKey) return;
    this.lastReasonToastKey = info.key;
    this.showToast(`${info.title}: ${info.message}`);
  }

  // Рендерит заметный блок причины над JSON-выводом.
  renderFailureInfo() {
    const info = this.resolveFailureInfo();
    if (!info) return html``;
    const toneClass = info.tone === 'warn' ? 'warn' : '';
    return html`
      <div class="reason-box ${toneClass}">
        <div class="reason-title">${info.title}</div>
        <div class="reason-message">${info.message}</div>
        ${info.nodeLabel ? html`<div class="reason-meta">Шаг: ${info.nodeLabel}</div>` : ''}
        ${info.reasonText ? html`<div class="reason-meta">Код причины: ${info.reasonText}</div>` : ''}
        ${info.actor ? html`<div class="reason-meta">Кто отклонил: ${info.actor}</div>` : ''}
        ${info.comment ? html`<div class="reason-meta">Комментарий: ${info.comment}</div>` : ''}
        ${info.technicalError ? html`<div class="reason-meta">Техническая деталь: ${info.technicalError}</div>` : ''}
      </div>
    `;
  }

  // Цвет узла в графе по его статусу.
  nodeColor(nodeId, isFinal = false) {
    if (isFinal) {
      if (this.hasRejection()) return '#e45454';
      if (String(this.output?.status || '').toLowerCase() === 'completed') return '#2fca6a';
      const finalStatus = this.resolveNodeStatus(nodeId);
      if (finalStatus === 'running') return '#4e7bff';
      const done = this.getStepState(nodeId)?.status === 'done';
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

  // Координаты карточек на вертикальном графе.
  layoutFor(nodeId) {
    const order = this.activeRoute.nodes.map((node) => node.id);
    const index = order.indexOf(nodeId);
    const cardW = 360;
    const cardH = 146;
    const colGap = 168;
    const laneGap = 212;
    const startX = 40;
    const startY = 24;
    const map = {
      'candidate.intake': { col: 1, row: 0 },
      'recruiter.approval': { col: 1, row: 1 },
      'finance.group': { col: 0, row: 2 },
      'security.precheck': { col: 2, row: 2 },
      'security.approval': { col: 2, row: 3 },
      'director.approval': { col: 1, row: 4 },
      'comp.committee': { col: 1, row: 5 },
      'finance.child.scoring': { col: 1, row: 0 },
      'finance.child.approval': { col: 1, row: 1 },
      'finance.child.finalize': { col: 1, row: 2 },
      notify: { col: 1, row: 6, terminal: true },
    };
    const slot = map[nodeId] || { col: Math.max(0, index), row: 1, terminal: false };
    const w = slot.terminal ? 212 : cardW;
    const h = slot.terminal ? 136 : cardH;
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
    const worldWidth = Math.max(1360, rightMost + 120);
    const worldHeight = Math.max(1080, bottomMost + 120);
    const graphShell = this.renderRoot?.querySelector('.graph-shell');
    const viewportWidth = Math.max(820, (graphShell?.clientWidth || 960) - 16);
    const viewportHeight = Math.max(420, (graphShell?.clientHeight || 520) - 16);

    let tooltip = graphShell?.querySelector('.graph-tooltip');
    if (!tooltip && graphShell) {
      tooltip = document.createElement('div');
      tooltip.className = 'graph-tooltip';
      graphShell.appendChild(tooltip);
    }
    if (tooltip) {
      tooltip.style.opacity = '0';
      tooltip.innerHTML = '';
    }

    const escapeHtml = (value) => {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    };
    const nodeStatusLabel = (status) => {
      if (status === 'done') return 'выполнено';
      if (status === 'running') return 'в работе';
      if (status === 'rejected') return 'отклонено';
      if (status === 'skipped') return 'пропущено';
      return 'ожидание';
    };
    const showTooltip = (event, lines) => {
      if (!tooltip || !graphShell) return;
      const safe = lines.filter(Boolean).map((line) => `<div>${escapeHtml(line)}</div>`).join('');
      tooltip.innerHTML = safe;
      tooltip.style.opacity = '1';
      const shellRect = graphShell.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const px = event.clientX - shellRect.left + 12;
      const py = event.clientY - shellRect.top + 12;
      const maxX = shellRect.width - tooltipRect.width - 8;
      const maxY = shellRect.height - tooltipRect.height - 8;
      tooltip.style.left = `${Math.max(8, Math.min(maxX, px))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(maxY, py))}px`;
    };
    const hideTooltip = () => {
      if (!tooltip) return;
      tooltip.style.opacity = '0';
    };

    const svg = d3
      .select(container)
      .append('svg')
      .attr('width', viewportWidth)
      .attr('height', viewportHeight)
      .attr('role', 'img');

    const defs = svg.append('defs');
    const content = svg.append('g').attr('class', 'graph-content');
    const bgLayer = content.append('g').attr('class', 'graph-bg');
    const viewport = content.append('g').attr('class', 'graph-viewport');

    const pattern = defs
      .append('pattern')
      .attr('id', 'dot-grid')
      .attr('width', 26)
      .attr('height', 26)
      .attr('patternUnits', 'userSpaceOnUse');
    pattern.append('circle').attr('cx', 2).attr('cy', 2).attr('r', 1.4).attr('fill', '#d2d9ea');
    const bgPadding = Math.max(worldWidth, worldHeight) * 1.8;
    bgLayer
      .append('rect')
      .attr('x', -bgPadding)
      .attr('y', -bgPadding)
      .attr('width', worldWidth + bgPadding * 2)
      .attr('height', worldHeight + bgPadding * 2)
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
      const isChildGroup = node.type === 'child.start';
      const childNodeState = this.getStepState(node.id);
      const childStepStarted = Boolean(childNodeState && childNodeState.status !== 'pending');
      const childWorkflowId = this.childWorkflowIdForNode(node.id);
      const canOpenChild = Boolean(isChildGroup && childStepStarted && childWorkflowId);
      const selectable = this.isSelectable(node.id);
      const selected = node.id === this.selectedNodeId;
      const color = this.nodeColor(node.id, isFinal);
      const stroke = selected ? '#0f244a' : '#d7deef';
      const strokeWidth = selected ? 2.5 : 1.6;
      const cardOpacity = isApproval && !selectable ? 0.78 : 1;
      const nodeStatus = this.resolveNodeStatus(node.id);
      const approvalInfo = this.getStepState(node.id)?.approval || null;
      const gateStatus = this.getStepState(node.id)?.result?.gate?.status || 'WAIT';
      const gateReason = this.getStepState(node.id)?.result?.gate?.data?.gate?.reason || null;
      const tooltipLines = [
        `${node.label || node.id}`,
        `Тип: ${
          node.type === 'approval.kofn'
            ? 'Согласование'
            : node.type === 'child.start'
              ? 'Дочерний процесс'
              : 'Автошаг'
        }`,
        `Статус: ${nodeStatusLabel(nodeStatus)}`,
        isApproval ? `Проголосовало: ${(approvalInfo?.approvedActors || []).length}/${node.k || 0}` : null,
        isApproval && node.gate ? `Контроль после голосования: ${gateStatus}` : null,
        isApproval && node.gate && gateReason ? `Причина: ${gateReason}` : null,
        isChildGroup
          ? (canOpenChild ? 'Двойной клик: открыть дочерний процесс' : 'Дочерний процесс еще не готов к открытию')
          : null,
        node.guard ? `Условный шаг: ${this.isRequiredNow(node) ? 'обязателен' : 'опционален'}` : null,
      ];

      if (terminal) {
        const finalCompleted =
          String(this.output?.status || '').toLowerCase() === 'completed' ||
          nodeStatus === 'done';
        const finalStatusText = finalCompleted
          ? 'завершено'
          : this.hasRejection()
            ? 'отклонено'
            : 'ожидание';

        nodeGroup
          .append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', w)
          .attr('height', h)
          .attr('rx', 18)
          .attr('fill', '#ffffff')
          .attr('stroke', '#d7deef')
          .attr('stroke-width', 1.8)
          .attr('filter', 'url(#card-shadow)')
          .style('pointer-events', 'none');

        nodeGroup
          .append('line')
          .attr('x1', x + 12)
          .attr('y1', y + 4)
          .attr('x2', x + w - 12)
          .attr('y2', y + 4)
          .attr('stroke', color)
          .attr('stroke-width', 6)
          .attr('stroke-linecap', 'round')
          .style('pointer-events', 'none');

        nodeGroup
          .append('line')
          .attr('x1', x)
          .attr('y1', y + 44)
          .attr('x2', x + w)
          .attr('y2', y + 44)
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
          .attr('y', y + 31)
          .attr('font-size', 12)
          .attr('font-weight', 700)
          .attr('fill', '#5f6f95')
          .style('pointer-events', 'none')
          .text('Финальный шаг');

        nodeGroup
          .append('text')
          .attr('x', x + 56)
          .attr('y', y + 78)
          .attr('font-size', 18)
          .attr('font-weight', 800)
          .attr('fill', '#111f3d')
          .style('pointer-events', 'none')
          .text('Финал');

        nodeGroup
          .append('rect')
          .attr('x', x + w - 112)
          .attr('y', y + h - 36)
          .attr('width', 96)
          .attr('height', 24)
          .attr('rx', 11)
          .attr('fill', '#121a30')
          .style('pointer-events', 'none');

        nodeGroup
          .append('text')
          .attr('x', x + w - 64)
          .attr('y', y + h - 20)
          .attr('text-anchor', 'middle')
          .attr('font-size', 11)
          .attr('font-weight', 700)
          .attr('fill', '#f4f7ff')
          .style('pointer-events', 'none')
          .text(finalStatusText);

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
        .style(
          'cursor',
          isApproval
            ? (selectable ? 'pointer' : 'not-allowed')
            : isChildGroup
              ? (canOpenChild ? 'zoom-in' : 'default')
              : 'default'
        )
        .style('opacity', cardOpacity)
        .on('click', () => {
          if (isApproval) {
            this.selectNode(node.id);
          }
        })
        .on('mouseenter', (event) => showTooltip(event, tooltipLines))
        .on('mousemove', (event) => showTooltip(event, tooltipLines))
        .on('mouseleave', hideTooltip)
        .on('dblclick', () => {
          if (canOpenChild) {
            this.drillIntoChildWorkflow(node.id);
          } else if (isChildGroup) {
            this.showToast('Дочерний процесс еще не создан. Обновите прогресс через 1-2 секунды.');
          }
        });

      nodeGroup
        .append('line')
        .attr('x1', x + 12)
        .attr('y1', y + 4)
        .attr('x2', x + w - 12)
        .attr('y2', y + 4)
        .attr('stroke', color)
        .attr('stroke-width', 6)
        .attr('stroke-linecap', 'round')
        .style('pointer-events', 'none');

      nodeGroup
        .append('line')
        .attr('x1', x)
        .attr('y1', y + 44)
        .attr('x2', x + w)
        .attr('y2', y + 44)
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
        .attr('y', y + 31)
        .attr('font-size', 12)
        .attr('font-weight', 700)
        .attr('fill', '#5f6f95')
        .style('pointer-events', 'none')
        .text(typeLabel);

      const titleRaw = node.label || node.id;
      const titleText = titleRaw.length > 40 ? `${titleRaw.slice(0, 38)}...` : titleRaw;
      nodeGroup
        .append('text')
        .attr('x', x + 56)
        .attr('y', y + 78)
        .attr('font-size', 16)
        .attr('font-weight', 700)
        .attr('fill', '#111f3d')
        .style('pointer-events', 'none')
        .text(titleText);

      const actorText = isApproval
        ? (this.getStepState(node.id)?.approval?.approvedActors?.[0] || 'ожидается')
        : 'автоматически';
      const actorPillWidth = Math.max(92, Math.min(170, actorText.length * 7 + 42));
      nodeGroup
        .append('rect')
        .attr('x', x + 56)
        .attr('y', y + 92)
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
        .attr('y', y + 107)
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .attr('fill', '#243252')
        .style('pointer-events', 'none')
        .text(actorText);

      const approved = this.getStepState(node.id)?.approval?.approvedActors?.length || 0;
      const required = node.k || 0;
      const badgeText = isApproval ? `${approved}/${required}` : 'авто';
      const badgeFill = isFinal ? '#1d2a47' : '#121a30';
      nodeGroup
        .append('rect')
        .attr('x', x + w - 92)
        .attr('y', y + h - 36)
        .attr('width', 78)
        .attr('height', 24)
        .attr('rx', 11)
        .attr('fill', badgeFill)
        .style('pointer-events', 'none');
      nodeGroup
        .append('text')
        .attr('x', x + w - 53)
        .attr('y', y + h - 20)
        .attr('text-anchor', 'middle')
        .attr('font-size', 11)
        .attr('font-weight', 700)
        .attr('fill', '#f4f7ff')
        .style('pointer-events', 'none')
        .text(badgeText);

      if (isApproval && node.gate) {
        const gateFill = gateStatus === 'PASS' ? '#1b7f45' : gateStatus === 'FAIL' ? '#ad3232' : '#28334f';
        nodeGroup
          .append('rect')
          .attr('x', x + w - 198)
          .attr('y', y + h - 36)
          .attr('width', 96)
          .attr('height', 24)
          .attr('rx', 11)
          .attr('fill', gateFill)
          .style('pointer-events', 'none');
        nodeGroup
          .append('text')
          .attr('x', x + w - 150)
          .attr('y', y + h - 20)
          .attr('text-anchor', 'middle')
          .attr('font-size', 11)
          .attr('font-weight', 700)
          .attr('fill', '#f4f7ff')
          .style('pointer-events', 'none')
          .text('контроль');
      }
    }

    const fitScale = Math.min(
      (viewportWidth - 30) / worldWidth,
      (viewportHeight - 30) / worldHeight,
      1
    );
    const fitX = Math.round((viewportWidth - worldWidth * fitScale) / 2);
    const fitY = Math.round((viewportHeight - worldHeight * fitScale) / 2);
    const defaultTransform = d3.zoomIdentity.translate(fitX, fitY).scale(fitScale);

    const hasSaved =
      this.graphTransform &&
      Number.isFinite(this.graphTransform.x) &&
      Number.isFinite(this.graphTransform.y) &&
      Number.isFinite(this.graphTransform.k);
    const savedTransform = hasSaved
      ? d3.zoomIdentity
          .translate(this.graphTransform.x, this.graphTransform.y)
          .scale(Math.max(0.45, Math.min(2.8, this.graphTransform.k)))
      : defaultTransform;

    const clampTransform = (transform) => {
      const k = Math.max(0.45, Math.min(2.8, transform.k || 1));
      const margin = 22;
      const minX = viewportWidth - worldWidth * k - margin;
      const maxX = margin;
      const minY = viewportHeight - worldHeight * k - margin;
      const maxY = margin;

      let x = Number(transform.x || 0);
      let y = Number(transform.y || 0);
      if (minX > maxX) {
        x = (minX + maxX) / 2;
      } else {
        x = Math.max(minX, Math.min(maxX, x));
      }
      if (minY > maxY) {
        y = (minY + maxY) / 2;
      } else {
        y = Math.max(minY, Math.min(maxY, y));
      }
      return d3.zoomIdentity.translate(x, y).scale(k);
    };

    const applyVisualTransform = (transform) => {
      content.attr('transform', transform.toString());
    };

    const zoomBehavior = d3
      .zoom()
      .scaleExtent([0.45, 2.8])
      .filter((event) => {
        // Разрешаем zoom колесом/трекпадом и pan перетаскиванием.
        if (event.type === 'wheel') return true;
        return !event.button || event.type === 'mousedown';
      })
      .constrain((transform) => clampTransform(transform))
      .extent([
        [0, 0],
        [viewportWidth, viewportHeight],
      ])
      .translateExtent([
        [-worldWidth * 0.5, -worldHeight * 0.5],
        [worldWidth * 1.5, worldHeight * 1.5],
      ])
      .on('zoom', (event) => {
        const transform = clampTransform(event.transform);
        applyVisualTransform(transform);
        this.graphTransform = {
          x: transform.x,
          y: transform.y,
          k: transform.k,
        };
      });

    svg.call(zoomBehavior).on('dblclick.zoom', null);
    svg.call(zoomBehavior.transform, clampTransform(savedTransform));
  }

  // Шаблон блока с легендой и контейнером графа.
  renderGraph() {
    const currentCost = Number(this.cost || 0);
    const committeeRule = currentCost >= 150 ? 'обязательно' : 'пропускается';
    const recruiterPrecheck = currentCost > 260 ? 'не пройдет' : 'пройдет';
    return html`
      <div class="graph-info">
        <div class="legend">
          <span class="ok"><i></i>выполнено</span>
          <span class="err"><i></i>отклонено</span>
          <span class="skip"><i></i>пропущено/опционально</span>
          <span>колесо: зум | перетаскивание: панорама</span>
          <span>наведите на шаг: подсказка</span>
        </div>
        <div class="rules-box">
          <div class="rules-title">Ограничения сценария для тестирования</div>
          <div class="rules-grid">
            <div class="rule-item">sum < 150: комитет по компенсациям пропускается</div>
            <div class="rule-item">sum >= 150: комитет становится обязательным</div>
            <div class="rule-item">sum > 260: precheck рекрутера блокирует процесс</div>
            <div class="rule-item">decline на обязательном шаге: процесс сразу отклоняется</div>
            <div class="rule-item">финансы и безопасность: идут параллельно</div>
            <div class="rule-item">следующий шаг активируется после завершения зависимостей</div>
            <div class="rule-item">двойной клик по узлу child: открыть дочерний процесс</div>
          </div>
          <div class="hint">
            Текущая сумма: <b>${currentCost}</b> | Комитет: <b>${committeeRule}</b> | Precheck рекрутера: <b>${recruiterPrecheck}</b>
          </div>
        </div>
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
    const navPath = [...this.navigationStack, this.workflowId].filter(Boolean).join(' -> ');

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
                                            <div
                                              class="wf-child"
                                              title="Открыть дочерний workflow"
                                              @click=${() =>
                                                this.pickWorkflow(child.workflowId, {
                                                  parentWorkflowId: item.workflowId,
                                                  preserveStack: true,
                                                  resetToRoot: false,
                                                })}
                                            >
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
                <div class="panel-head">
                  <h2>Граф маршрута</h2>
                  <div class="head-note">контекст: ${navPath || 'не выбран'}</div>
                  ${this.navigationStack.length > 0
                    ? html`
                        <button
                          class="secondary"
                          style="width:auto;padding:0 12px;"
                          ?disabled=${this.busy}
                          @click=${() => this.goBackToParentWorkflow()}
                        >
                          Вернуться к родительскому
                        </button>
                      `
                    : ''}
                </div>
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
              </div>
            </div>

            <section class="panel result result-pane">
              <h2>Результат</h2>
              <div class="result-scroll">
                ${this.renderFailureInfo()}
                <pre>${JSON.stringify(this.outputForDisplay || { hint: 'Запустите процесс или обновите прогресс' }, null, 2)}</pre>
              </div>
            </section>
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
