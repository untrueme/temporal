import { LitElement, html, css } from 'https://unpkg.com/lit-element@3.3.3/lit-element.js?module';

// UI-демо для командировочного процесса (JSON + child workflows).
class TripWorkflowDemo extends LitElement {
  // Реактивные поля формы/состояния.
  static properties = {
    tripId: { type: String },
    budget: { type: Number },
    needTickets: { type: Boolean },
    needHotel: { type: Boolean },
    needPerDiem: { type: Boolean },
    endDelaySec: { type: Number },
    reportDelayMs: { type: Number },
    workflowId: { type: String },
    approvalNodeId: { type: String },
    approvalActor: { type: String },
    approvalDecision: { type: String },
    eventName: { type: String },
    output: { state: true },
    errorText: { state: true },
    busy: { state: true },
  };

  // Стили страницы демо.
  static styles = css`
    :host {
      display: block;
      width: 100%;
      min-height: 100vh;
      margin: 0;
      padding: 0;
      color: #38260c;
      font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
    }

    .shell {
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(168, 98, 10, 0.18);
      border-radius: 0;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.8);
      box-shadow: none;
      backdrop-filter: blur(6px);
    }

    header {
      padding: 18px 20px;
      background: linear-gradient(120deg, rgba(241, 174, 67, 0.32), rgba(255, 255, 255, 0.7));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    nav a {
      color: #895205;
      text-decoration: none;
      margin-right: 12px;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      padding: 18px;
      flex: 1;
      overflow: auto;
    }

    .panel {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(166, 95, 9, 0.2);
      border-radius: 14px;
      padding: 14px;
    }

    h1 {
      font-size: 1.3rem;
      margin: 0;
    }

    h2 {
      margin: 0 0 10px;
      font-size: 1rem;
    }

    label {
      display: block;
      margin: 8px 0 4px;
      font-size: 0.85rem;
      color: #6f5123;
      font-weight: 600;
    }

    input,
    select,
    button {
      width: 100%;
      font: inherit;
      border: 1px solid rgba(161, 99, 20, 0.24);
      border-radius: 10px;
      padding: 8px 10px;
      background: #fff;
    }

    .check {
      margin-top: 8px;
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 0.9rem;
    }

    .check input {
      width: auto;
    }

    button {
      margin-top: 10px;
      cursor: pointer;
      background: linear-gradient(120deg, #da8b1c, #b86d09);
      color: #fff;
      border: 0;
      font-weight: 700;
    }

    button.secondary {
      background: linear-gradient(120deg, #5d6778, #4f5969);
    }

    .status {
      padding: 0 18px 18px;
      font-size: 0.9rem;
      color: #835007;
    }

    .error {
      color: #a5283b;
      font-weight: 600;
    }

    pre {
      margin: 0;
      max-height: 420px;
      overflow: auto;
      font-size: 0.78rem;
      background: #261a0c;
      color: #ffe8c7;
      border-radius: 12px;
      padding: 12px;
      line-height: 1.4;
    }
  `;

  // Начальные значения формы.
  constructor() {
    super();
    this.tripId = 'demo-trip-001';
    this.budget = 1200;
    this.needTickets = true;
    this.needHotel = true;
    this.needPerDiem = false;
    this.endDelaySec = 10;
    this.reportDelayMs = 3000;
    this.workflowId = '';
    this.approvalNodeId = 'manager.approval';
    this.approvalActor = 'manager1';
    this.approvalDecision = 'approve';
    this.eventName = 'REPORT_SUBMITTED';
    this.output = null;
    this.errorText = '';
    this.busy = false;
  }

  // Генерирует пример JSON-route с таймерами/child/even.wait.
  get route() {
    const endDate = new Date(Date.now() + Number(this.endDelaySec) * 1000).toISOString();
    return {
      nodes: [
        { id: 'manager.approval', type: 'approval.kofn', members: ['manager1'], k: 1, required: true },
        {
          id: 'finance.approval',
          type: 'approval.kofn',
          members: ['finance1'],
          k: 1,
          required: false,
          guard: { op: 'gt', left: { path: 'doc.budget' }, right: 1000 },
        },
        {
          id: 'child.ticket',
          type: 'child.start',
          workflowType: 'ticketPurchase',
          input: { baseUrl: '{{vars.tripHandlers}}', tripId: '{{doc.tripId}}' },
          guard: { op: 'eq', left: { path: 'doc.needTickets' }, right: true },
          after: ['manager.approval', 'finance.approval'],
        },
        {
          id: 'child.hotel',
          type: 'child.start',
          workflowType: 'hotelBooking',
          input: { baseUrl: '{{vars.tripHandlers}}', tripId: '{{doc.tripId}}' },
          guard: { op: 'eq', left: { path: 'doc.needHotel' }, right: true },
          after: ['manager.approval', 'finance.approval'],
        },
        {
          id: 'child.perdiem',
          type: 'child.start',
          workflowType: 'perDiemPayout',
          input: { baseUrl: '{{vars.tripHandlers}}', tripId: '{{doc.tripId}}' },
          guard: { op: 'eq', left: { path: 'doc.needPerDiem' }, right: true },
          after: ['manager.approval', 'finance.approval'],
        },
        {
          id: 'wait.endDate',
          type: 'timer.until',
          at: endDate,
          after: ['child.ticket', 'child.hotel', 'child.perdiem'],
        },
        { id: 'notify.report', type: 'handler.http', app: 'trip', action: 'report.request', after: ['wait.endDate'] },
        {
          id: 'report.wait',
          type: 'event.wait',
          eventName: 'REPORT_SUBMITTED',
          setVars: { reportSubmitted: true },
          after: ['notify.report'],
        },
        { id: 'report.delay', type: 'timer.delay', ms: Number(this.reportDelayMs), after: ['notify.report'] },
        {
          id: 'report.escalate',
          type: 'handler.http',
          app: 'trip',
          action: 'report.escalate',
          guard: { op: 'ne', left: { path: 'vars.reportSubmitted' }, right: true },
          after: ['report.delay'],
        },
        { id: 'trip.close', type: 'handler.http', app: 'trip', action: 'trip.close', after: ['report.wait'] },
      ],
    };
  }

  // Унифицированный helper HTTP-запросов к API.
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
      throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload)}`);
    }
    return payload;
  }

  // Обертка выполнения действий с единым busy/error handling.
  async run(task) {
    this.busy = true;
    this.errorText = '';
    try {
      await task();
    } catch (err) {
      this.errorText = err.message || String(err);
    } finally {
      this.busy = false;
    }
  }

  // Старт process workflow для trip.
  async startWorkflow() {
    await this.run(async () => {
      const data = await this.request('/process/start', {
        method: 'POST',
        body: JSON.stringify({
          tripId: this.tripId,
          doc: {
            tripId: this.tripId,
            budget: Number(this.budget),
            needTickets: this.needTickets,
            needHotel: this.needHotel,
            needPerDiem: this.needPerDiem,
          },
          vars: { reportSubmitted: false },
          route: this.route,
        }),
      });
      this.workflowId = data.workflowId;
      this.output = data;
    });
  }

  // Отправляет approval signal в выбранный approval-node.
  async sendApproval() {
    await this.run(async () => {
      const workflowId = this.workflowId || `trip-${this.tripId}`;
      const data = await this.request(`/process/${workflowId}/approval`, {
        method: 'POST',
        body: JSON.stringify({
          nodeId: this.approvalNodeId,
          actor: this.approvalActor,
          decision: this.approvalDecision,
        }),
      });
      this.output = data;
    });
  }

  // Отправляет process event (например REPORT_SUBMITTED).
  async sendEvent() {
    await this.run(async () => {
      const workflowId = this.workflowId || `trip-${this.tripId}`;
      const data = await this.request(`/process/${workflowId}/event`, {
        method: 'POST',
        body: JSON.stringify({
          eventName: this.eventName,
          data: { by: 'traveler' },
        }),
      });
      this.output = data;
    });
  }

  // Query прогресса trip workflow.
  async queryProgress() {
    await this.run(async () => {
      const workflowId = this.workflowId || `trip-${this.tripId}`;
      const data = await this.request(`/process/${workflowId}/progress`);
      this.output = data;
    });
  }

  // Основной шаблон UI.
  render() {
    return html`
      <div class="shell">
        <header>
          <div>
            <h1>Trip Process Demo</h1>
            <div>Approvals, child workflows, report event, and escalation timer</div>
          </div>
          <nav>
            <a href="/ui">Home</a>
            <a href="/ui/doc">Document</a>
            <a href="/ui/tickets">Service Desk</a>
          </nav>
        </header>

        <section class="grid">
          <section class="panel">
            <h2>Start Trip Workflow</h2>
            <label>tripId</label>
            <input .value=${this.tripId} @input=${(e) => (this.tripId = e.target.value)} />
            <label>budget</label>
            <input type="number" .value=${String(this.budget)} @input=${(e) => (this.budget = Number(e.target.value || 0))} />
            <label>endDelaySec</label>
            <input type="number" .value=${String(this.endDelaySec)} @input=${(e) => (this.endDelaySec = Number(e.target.value || 0))} />
            <label>reportDelayMs</label>
            <input type="number" .value=${String(this.reportDelayMs)} @input=${(e) => (this.reportDelayMs = Number(e.target.value || 0))} />
            <div class="check"><input type="checkbox" .checked=${this.needTickets} @change=${(e) => (this.needTickets = e.target.checked)} /> needTickets</div>
            <div class="check"><input type="checkbox" .checked=${this.needHotel} @change=${(e) => (this.needHotel = e.target.checked)} /> needHotel</div>
            <div class="check"><input type="checkbox" .checked=${this.needPerDiem} @change=${(e) => (this.needPerDiem = e.target.checked)} /> needPerDiem</div>
            <button ?disabled=${this.busy} @click=${this.startWorkflow}>Start trip workflow</button>
          </section>

          <section class="panel">
            <h2>Signals and Query</h2>
            <label>workflowId</label>
            <input .value=${this.workflowId} @input=${(e) => (this.workflowId = e.target.value)} placeholder="trip-..." />
            <label>approval nodeId</label>
            <input .value=${this.approvalNodeId} @input=${(e) => (this.approvalNodeId = e.target.value)} />
            <label>approval actor</label>
            <input .value=${this.approvalActor} @input=${(e) => (this.approvalActor = e.target.value)} />
            <label>approval decision</label>
            <select .value=${this.approvalDecision} @change=${(e) => (this.approvalDecision = e.target.value)}>
              <option value="approve">approve</option>
              <option value="decline">decline</option>
              <option value="reject">reject</option>
            </select>
            <button ?disabled=${this.busy} @click=${this.sendApproval}>Send approval</button>

            <label>eventName</label>
            <select .value=${this.eventName} @change=${(e) => (this.eventName = e.target.value)}>
              <option value="REPORT_SUBMITTED">REPORT_SUBMITTED</option>
            </select>
            <button ?disabled=${this.busy} @click=${this.sendEvent}>Send event</button>
            <button class="secondary" ?disabled=${this.busy} @click=${this.queryProgress}>Query progress</button>
          </section>

          <section class="panel">
            <h2>Output</h2>
            <pre>${JSON.stringify(this.output || { hint: 'Use start/signal/query buttons' }, null, 2)}</pre>
          </section>
        </section>

        <div class="status">
          ${this.errorText ? html`<div class="error">${this.errorText}</div>` : html`<div>State: ${this.busy ? 'busy' : 'idle'}</div>`}
        </div>
      </div>
    `;
  }
}

customElements.define('trip-workflow-demo', TripWorkflowDemo);
