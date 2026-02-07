import { LitElement, html, css } from 'https://unpkg.com/lit-element@3.3.3/lit-element.js?module';

// UI-демо для service desk workflow (один тикет = один workflow).
class TicketWorkflowDemo extends LitElement {
  // Реактивные поля формы/состояния.
  static properties = {
    ticketId: { type: String },
    title: { type: String },
    firstResponseMs: { type: Number },
    resolveMs: { type: Number },
    autoCloseMs: { type: Number },
    workflowId: { type: String },
    actor: { type: String },
    eventType: { type: String },
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
      color: #173126;
      font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
    }

    .shell {
      width: 100%;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(29, 105, 78, 0.15);
      border-radius: 0;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.78);
      box-shadow: none;
      backdrop-filter: blur(6px);
    }

    header {
      padding: 18px 20px;
      background: linear-gradient(120deg, rgba(23, 170, 127, 0.24), rgba(255, 255, 255, 0.72));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    nav a {
      color: #145d46;
      text-decoration: none;
      margin-right: 12px;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 16px;
      padding: 18px;
      flex: 1;
      overflow: auto;
    }

    .panel {
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(17, 125, 94, 0.16);
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
      color: #385f50;
      font-weight: 600;
    }

    input,
    select,
    button {
      width: 100%;
      font: inherit;
      border: 1px solid rgba(21, 122, 92, 0.24);
      border-radius: 10px;
      padding: 8px 10px;
      background: #fff;
    }

    button {
      margin-top: 10px;
      cursor: pointer;
      background: linear-gradient(120deg, #0f9a71, #0a7f5c);
      color: #fff;
      border: 0;
      font-weight: 700;
    }

    button.secondary {
      background: linear-gradient(120deg, #55667b, #48566b);
    }

    .status {
      padding: 0 18px 18px;
      font-size: 0.9rem;
      color: #1f6d50;
    }

    .error {
      color: #a5283b;
      font-weight: 600;
    }

    pre {
      margin: 0;
      max-height: 380px;
      overflow: auto;
      font-size: 0.78rem;
      background: #10211c;
      color: #d7fce6;
      border-radius: 12px;
      padding: 12px;
      line-height: 1.4;
    }
  `;

  // Начальные значения формы.
  constructor() {
    super();
    this.ticketId = 'demo-ticket-100';
    this.title = 'VPN issue';
    this.firstResponseMs = 5000;
    this.resolveMs = 20000;
    this.autoCloseMs = 5000;
    this.workflowId = '';
    this.actor = 'dispatcher';
    this.eventType = 'ASSIGN';
    this.output = null;
    this.errorText = '';
    this.busy = false;
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

  // Запускает новый ticket workflow.
  async startWorkflow() {
    await this.run(async () => {
      const data = await this.request('/tickets/start', {
        method: 'POST',
        body: JSON.stringify({
          ticketId: this.ticketId,
          ticket: { title: this.title },
          policy: {
            firstResponseMs: Number(this.firstResponseMs),
            resolveMs: Number(this.resolveMs),
            autoCloseMs: Number(this.autoCloseMs),
          },
        }),
      });
      this.workflowId = data.workflowId;
      this.output = data;
    });
  }

  // Отправляет событие ticketEvent в запущенный workflow.
  async sendEvent() {
    await this.run(async () => {
      const workflowId = this.workflowId || `ticket-${this.ticketId}`;
      const data = await this.request(`/tickets/${workflowId}/event`, {
        method: 'POST',
        body: JSON.stringify({
          type: this.eventType,
          actor: this.actor,
          data: {},
        }),
      });
      this.output = data;
    });
  }

  // Запрашивает текущее состояние тикета через query getState.
  async queryState() {
    await this.run(async () => {
      const workflowId = this.workflowId || `ticket-${this.ticketId}`;
      const data = await this.request(`/tickets/${workflowId}/state`);
      this.output = data;
    });
  }

  // Основной шаблон UI.
  render() {
    return html`
      <div class="shell">
        <header>
          <div>
            <h1>Service Desk Ticket Demo</h1>
            <div>Signal-driven status flow with SLA timers</div>
          </div>
          <nav>
            <a href="/ui">Home</a>
            <a href="/ui/doc">Document</a>
            <a href="/ui/trip">Trip</a>
          </nav>
        </header>

        <section class="grid">
          <section class="panel">
            <h2>Start Ticket Workflow</h2>
            <label>ticketId</label>
            <input .value=${this.ticketId} @input=${(e) => (this.ticketId = e.target.value)} />
            <label>title</label>
            <input .value=${this.title} @input=${(e) => (this.title = e.target.value)} />
            <label>firstResponseMs</label>
            <input type="number" .value=${String(this.firstResponseMs)} @input=${(e) => (this.firstResponseMs = Number(e.target.value || 0))} />
            <label>resolveMs</label>
            <input type="number" .value=${String(this.resolveMs)} @input=${(e) => (this.resolveMs = Number(e.target.value || 0))} />
            <label>autoCloseMs</label>
            <input type="number" .value=${String(this.autoCloseMs)} @input=${(e) => (this.autoCloseMs = Number(e.target.value || 0))} />
            <button ?disabled=${this.busy} @click=${this.startWorkflow}>Start ticket workflow</button>
          </section>

          <section class="panel">
            <h2>Send Ticket Event</h2>
            <label>workflowId</label>
            <input .value=${this.workflowId} @input=${(e) => (this.workflowId = e.target.value)} placeholder="ticket-..." />
            <label>actor</label>
            <input .value=${this.actor} @input=${(e) => (this.actor = e.target.value)} />
            <label>eventType</label>
            <select .value=${this.eventType} @change=${(e) => (this.eventType = e.target.value)}>
              <option value="ASSIGN">ASSIGN</option>
              <option value="AGENT_RESPONDED">AGENT_RESPONDED</option>
              <option value="CUSTOMER_REPLIED">CUSTOMER_REPLIED</option>
              <option value="RESOLVE">RESOLVE</option>
              <option value="REOPEN">REOPEN</option>
              <option value="CLOSE">CLOSE</option>
              <option value="COMMENT">COMMENT</option>
            </select>
            <button ?disabled=${this.busy} @click=${this.sendEvent}>Send event</button>
            <button class="secondary" ?disabled=${this.busy} @click=${this.queryState}>Query state</button>
          </section>

          <section class="panel">
            <h2>Output</h2>
            <pre>${JSON.stringify(this.output || { hint: 'Use start/event/query buttons' }, null, 2)}</pre>
          </section>
        </section>

        <div class="status">
          ${this.errorText ? html`<div class="error">${this.errorText}</div>` : html`<div>State: ${this.busy ? 'busy' : 'idle'}</div>`}
        </div>
      </div>
    `;
  }
}

customElements.define('ticket-workflow-demo', TicketWorkflowDemo);
