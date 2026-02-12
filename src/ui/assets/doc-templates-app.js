import { LitElement, html, css } from 'https://unpkg.com/lit-element@3.3.3/lit-element.js?module';

class DocTemplatesDemo extends LitElement {
  static properties = {
    templates: { state: true },
    selectedDocType: { type: String },
    docType: { type: String },
    templateName: { type: String },
    templateDescription: { type: String },
    routeDraft: { state: true },
    editorNodeId: { type: String },
    editorStepJson: { type: String },
    editorErrorText: { state: true },
    busy: { state: true },
    errorText: { state: true },
    toasts: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      width: 100%;
      min-height: 100vh;
      font-family: 'Space Grotesk', 'Avenir Next', 'Segoe UI', sans-serif;
      color: #10203c;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      background: rgba(255, 255, 255, 0.84);
      border: 1px solid rgba(26, 58, 120, 0.16);
    }

    header {
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      background: linear-gradient(120deg, rgba(102, 121, 255, 0.26), rgba(255, 255, 255, 0.72));
    }

    h1 {
      margin: 0;
      font-size: 1.14rem;
    }

    .subtitle {
      margin-top: 4px;
      color: #40517d;
      font-size: 0.84rem;
    }

    nav a {
      color: #1f3577;
      text-decoration: none;
      margin-left: 10px;
      font-weight: 600;
      font-size: 0.9rem;
    }

    .grid {
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(240px, 24%) minmax(0, 1fr);
      gap: 12px;
      padding: 12px;
      overflow: hidden;
    }

    .panel {
      min-height: 0;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(40, 67, 132, 0.17);
      border-radius: 14px;
      padding: 10px;
      display: grid;
      gap: 8px;
      align-content: start;
    }

    .templates-list {
      min-height: 0;
      overflow: auto;
      display: grid;
      gap: 8px;
      padding-right: 2px;
    }

    .template-item {
      text-align: left;
      border: 1px solid rgba(31, 56, 112, 0.2);
      border-radius: 10px;
      background: #f7f9ff;
      padding: 10px;
      cursor: pointer;
    }

    .template-item.active {
      border-color: #3b5de8;
      box-shadow: inset 0 0 0 1px rgba(59, 93, 232, 0.24);
      background: #edf2ff;
    }

    .template-id {
      font-size: 0.84rem;
      font-weight: 700;
      color: #1f3470;
    }

    .template-meta {
      margin-top: 4px;
      font-size: 0.76rem;
      color: #51608a;
    }

    .editor-scroll {
      min-height: 0;
      overflow: auto;
      padding-right: 2px;
      display: grid;
      gap: 8px;
      align-content: start;
    }

    label {
      font-size: 0.74rem;
      color: #30436e;
      font-weight: 700;
      margin-top: 2px;
    }

    input,
    select,
    textarea,
    button {
      width: 100%;
      border-radius: 9px;
      border: 1px solid rgba(44, 65, 110, 0.22);
      background: #fff;
      color: #15284d;
      font-family: inherit;
    }

    input,
    select,
    button {
      height: 34px;
      padding: 0 10px;
      font-size: 0.82rem;
    }

    textarea {
      min-height: 120px;
      resize: vertical;
      padding: 10px;
      font-size: 0.76rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    .inline-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 8px;
      align-items: center;
    }

    .secondary {
      background: #f3f6ff;
      color: #273c67;
      font-weight: 700;
    }

    .primary {
      background: linear-gradient(120deg, #4c65e0, #3252d6);
      color: #fff;
      border: 0;
      font-weight: 700;
    }

    .danger {
      background: #fff5f5;
      color: #933131;
      border-color: rgba(147, 49, 49, 0.24);
      font-weight: 700;
      width: auto;
      padding: 0 12px;
    }

    .step-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-height: 120px;
      overflow: auto;
      padding-right: 2px;
    }

    .step-chip {
      width: auto;
      min-width: 88px;
      padding: 0 10px;
      border-radius: 16px;
      border: 1px solid rgba(36, 67, 132, 0.22);
      background: #f4f7ff;
      color: #203056;
      font-size: 0.76rem;
      font-weight: 600;
      height: 30px;
    }

    .step-chip.active {
      background: linear-gradient(120deg, #4c65e0, #3252d6);
      border-color: transparent;
      color: #fff;
    }

    .hint {
      font-size: 0.78rem;
      color: #556389;
    }

    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.8rem;
      color: #2e426f;
    }

    .checkbox-row input {
      width: 16px;
      height: 16px;
      min-height: 16px;
      border-radius: 4px;
      padding: 0;
      flex: 0 0 auto;
    }

    .error {
      padding: 8px 10px;
      border-radius: 8px;
      background: #fff2f2;
      color: #8c2e2e;
      border: 1px solid rgba(140, 46, 46, 0.2);
      font-size: 0.76rem;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .status {
      border-top: 1px solid rgba(44, 66, 111, 0.14);
      padding: 8px 12px;
      font-size: 0.8rem;
      color: #41527c;
      background: rgba(247, 250, 255, 0.76);
    }

    .toast-stack {
      position: fixed;
      right: 14px;
      bottom: 14px;
      z-index: 60;
      display: grid;
      gap: 8px;
      max-width: min(440px, calc(100vw - 24px));
    }

    .toast {
      border: 1px solid rgba(60, 88, 149, 0.24);
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 10px 28px rgba(31, 46, 84, 0.18);
      padding: 10px 12px;
      font-size: 0.82rem;
      line-height: 1.3;
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .toast button {
      width: auto;
      height: auto;
      min-height: 0;
      border: 0;
      background: transparent;
      padding: 0;
      margin: 0;
      color: inherit;
      font-size: 0.94rem;
      font-weight: 700;
      cursor: pointer;
    }

    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }

      .inline-row {
        grid-template-columns: 1fr;
      }
    }
  `;

  constructor() {
    super();
    this.templates = [];
    this.selectedDocType = '';
    this.docType = '';
    this.templateName = '';
    this.templateDescription = '';
    this.routeDraft = { nodes: [] };
    this.editorNodeId = '';
    this.editorStepJson = '';
    this.editorErrorText = '';
    this.busy = false;
    this.errorText = '';
    this.toasts = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this.refreshTemplates({ initial: true });
  }

  cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  get editorNodes() {
    return Array.isArray(this.routeDraft?.nodes) ? this.routeDraft.nodes : [];
  }

  get selectedEditorNode() {
    return this.editorNodes.find((node) => node.id === this.editorNodeId) || null;
  }

  ensureEditorSelection() {
    if (!this.editorNodes.length) {
      this.editorNodeId = '';
      this.editorStepJson = '';
      return;
    }
    if (!this.selectedEditorNode) {
      this.editorNodeId = this.editorNodes[0].id;
    }
    this.editorStepJson = JSON.stringify(this.selectedEditorNode, null, 2);
  }

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

  formatErrorMessage(error) {
    const msg = error?.payload?.message || error?.message || String(error);
    const normalized = String(msg).toLowerCase();
    if (normalized.includes('invalid doctype')) {
      return 'Некорректный тип документа. Разрешены латиница, цифры, "_" и "-".';
    }
    if (normalized.includes('route.nodes')) {
      return 'Некорректный маршрут: проверьте route.nodes.';
    }
    return msg;
  }

  async run(task) {
    this.busy = true;
    this.errorText = '';
    try {
      await task();
    } catch (error) {
      const message = this.formatErrorMessage(error);
      this.errorText = message;
      this.showToast(message);
    } finally {
      this.busy = false;
    }
  }

  showToast(message) {
    const toast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      message,
    };
    this.toasts = [...this.toasts, toast].slice(-4);
    globalThis.setTimeout(() => {
      this.dismissToast(toast.id);
    }, 4800);
  }

  dismissToast(id) {
    this.toasts = this.toasts.filter((item) => item.id !== id);
  }

  async refreshTemplates({ initial = false } = {}) {
    try {
      const data = await this.request('/workflows/doc/templates');
      this.templates = Array.isArray(data?.items) ? data.items : [];
      const nextType =
        this.templates.find((item) => item.docType === this.selectedDocType)?.docType ||
        this.templates[0]?.docType ||
        this.selectedDocType ||
        'candidate_hiring';
      await this.loadTemplate(nextType, { silent: initial });
    } catch (error) {
      if (!initial) throw error;
    }
  }

  async loadTemplate(docType, { silent = false } = {}) {
    const normalized = String(docType || '')
      .trim()
      .toLowerCase();
    if (!normalized) return;
    try {
      const template = await this.request(`/workflows/doc/templates/${encodeURIComponent(normalized)}`);
      this.selectedDocType = template.docType;
      this.docType = template.docType;
      this.templateName = template.name || template.docType;
      this.templateDescription = template.description || '';
      this.routeDraft = this.cloneJson(template.route || { nodes: [] });
      this.editorErrorText = '';
      this.ensureEditorSelection();
    } catch (error) {
      if (!silent) throw error;
    }
  }

  async pickTemplate(docType) {
    await this.run(async () => {
      await this.loadTemplate(docType);
    });
  }

  async saveTemplate() {
    await this.run(async () => {
      const docType = String(this.docType || '')
        .trim()
        .toLowerCase();
      if (!docType) {
        throw new Error('Укажите docType');
      }
      if (!Array.isArray(this.routeDraft?.nodes) || this.routeDraft.nodes.length === 0) {
        throw new Error('Добавьте хотя бы один шаг');
      }
      await this.request(`/workflows/doc/templates/${encodeURIComponent(docType)}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: this.templateName || docType,
          description: this.templateDescription || '',
          route: this.routeDraft,
        }),
      });
      await this.refreshTemplates();
      this.showToast(`Шаблон "${docType}" сохранен`);
    });
  }

  createBlankTemplate() {
    this.selectedDocType = '';
    this.docType = 'new_document_type';
    this.templateName = 'Новый шаблон';
    this.templateDescription = '';
    this.routeDraft = {
      nodes: [
        {
          id: 'step.intake',
          type: 'handler.http',
          label: 'Старт',
          app: 'doc',
          action: 'candidate.intake',
        },
      ],
    };
    this.editorNodeId = 'step.intake';
    this.editorStepJson = JSON.stringify(this.routeDraft.nodes[0], null, 2);
    this.editorErrorText = '';
  }

  selectEditorNode(nodeId) {
    this.editorNodeId = nodeId;
    this.ensureEditorSelection();
  }

  updateEditorNodeField(field, value) {
    const node = this.selectedEditorNode;
    if (!node) return;
    node[field] = value;
    if (field === 'id') {
      this.editorNodeId = String(value || '').trim();
    }
    this.editorStepJson = JSON.stringify(node, null, 2);
    this.requestUpdate();
  }

  updateEditorNodeCsvField(field, value) {
    const node = this.selectedEditorNode;
    if (!node) return;
    const items = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length === 0) {
      delete node[field];
    } else {
      node[field] = items;
    }
    this.editorStepJson = JSON.stringify(node, null, 2);
    this.requestUpdate();
  }

  addEditorNode() {
    const base = `step.${this.editorNodes.length + 1}`;
    let nextId = base;
    let n = 1;
    while (this.editorNodes.some((node) => node.id === nextId)) {
      n += 1;
      nextId = `${base}.${n}`;
    }
    const newNode = {
      id: nextId,
      type: 'approval.kofn',
      label: `Шаг ${this.editorNodes.length + 1}`,
      members: ['Участник 1', 'Участник 2'],
      k: 1,
      required: true,
      after: this.editorNodes.length ? [this.editorNodes[this.editorNodes.length - 1].id] : [],
    };
    this.routeDraft.nodes = [...this.editorNodes, newNode];
    this.editorNodeId = newNode.id;
    this.editorStepJson = JSON.stringify(newNode, null, 2);
    this.requestUpdate();
  }

  removeEditorNode() {
    const target = this.editorNodeId;
    if (!target) return;
    const nextNodes = this.editorNodes.filter((node) => node.id !== target);
    for (const node of nextNodes) {
      if (Array.isArray(node.after)) {
        node.after = node.after.filter((dep) => dep !== target);
      }
    }
    this.routeDraft.nodes = nextNodes;
    this.editorNodeId = nextNodes[0]?.id || '';
    this.editorStepJson = this.editorNodeId
      ? JSON.stringify(nextNodes.find((node) => node.id === this.editorNodeId), null, 2)
      : '';
    this.editorErrorText = '';
    this.requestUpdate();
  }

  applyEditorStepJson() {
    const text = String(this.editorStepJson || '').trim();
    if (!text) {
      this.editorErrorText = 'JSON шага пустой';
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Шаг должен быть JSON-объектом');
      }
      if (!parsed.id || !String(parsed.id).trim()) {
        throw new Error('Поле id обязательно');
      }
      const idx = this.editorNodes.findIndex((node) => node.id === this.editorNodeId);
      if (idx < 0) return;
      this.editorNodes[idx] = parsed;
      this.editorNodeId = parsed.id;
      this.editorErrorText = '';
      this.requestUpdate();
    } catch (error) {
      this.editorErrorText = error?.message || String(error);
    }
  }

  render() {
    const selectedNode = this.selectedEditorNode;
    const afterCsv = Array.isArray(selectedNode?.after) ? selectedNode.after.join(', ') : '';
    const membersCsv = Array.isArray(selectedNode?.members) ? selectedNode.members.join(', ') : '';

    return html`
      <div class="shell">
        <header>
          <div>
            <h1>Редактор шаблонов документов</h1>
            <div class="subtitle">Создание и редактирование JSON-шаблонов маршрутов по типам документов</div>
          </div>
          <nav>
            <a href="/ui">Home</a>
            <a href="/ui/doc">Document Demo</a>
            <a href="/ui/tickets">Service Desk</a>
            <a href="/ui/trip">Trip</a>
          </nav>
        </header>

        <section class="grid">
          <section class="panel">
            <label>Шаблоны</label>
            <div class="inline-row">
              <select .value=${this.selectedDocType} @change=${(e) => this.pickTemplate(e.target.value)}>
                ${this.templates.map((item) => html`<option value=${item.docType}>${item.docType}</option>`)}
              </select>
              <button class="secondary" type="button" ?disabled=${this.busy} @click=${() => this.run(() => this.refreshTemplates())}>
                Обновить
              </button>
              <button class="secondary" type="button" ?disabled=${this.busy} @click=${this.createBlankTemplate}>
                Новый
              </button>
            </div>
            <div class="templates-list">
              ${this.templates.length === 0
                ? html`<div class="hint">Шаблонов пока нет.</div>`
                : this.templates.map(
                    (item) => html`
                      <button
                        type="button"
                        class="template-item ${item.docType === this.selectedDocType ? 'active' : ''}"
                        @click=${() => this.pickTemplate(item.docType)}
                      >
                        <div class="template-id">${item.docType}</div>
                        <div class="template-meta">${item.name || 'без названия'}</div>
                        <div class="template-meta">шагов: ${item.nodeCount}</div>
                      </button>
                    `
                  )}
            </div>
          </section>

          <section class="panel editor-scroll">
            <label>Тип документа (docType)</label>
            <input .value=${this.docType} @input=${(e) => (this.docType = String(e.target.value || '').trim().toLowerCase())} />
            <label>Название шаблона</label>
            <input .value=${this.templateName} @input=${(e) => (this.templateName = e.target.value)} />
            <label>Описание шаблона</label>
            <input .value=${this.templateDescription} @input=${(e) => (this.templateDescription = e.target.value)} />
            <button class="primary" type="button" ?disabled=${this.busy} @click=${this.saveTemplate}>Сохранить шаблон</button>

            <label>Шаги маршрута</label>
            <div class="step-chip-list">
              ${this.editorNodes.map(
                (node, index) => html`
                  <button
                    type="button"
                    class="step-chip ${node.id === this.editorNodeId ? 'active' : ''}"
                    @click=${() => this.selectEditorNode(node.id)}
                  >
                    ${index + 1}. ${node.id}
                  </button>
                `
              )}
            </div>
            <div class="inline-row">
              <button class="secondary" type="button" ?disabled=${this.busy} @click=${this.addEditorNode}>Добавить шаг</button>
              <button class="danger" type="button" ?disabled=${this.busy || !this.editorNodeId} @click=${this.removeEditorNode}>
                Удалить шаг
              </button>
              <span class="hint">выбран: ${this.editorNodeId || '—'}</span>
            </div>

            ${selectedNode
              ? html`
                  <label>id шага</label>
                  <input .value=${selectedNode.id || ''} @input=${(e) => this.updateEditorNodeField('id', String(e.target.value || '').trim())} />
                  <label>Название шага</label>
                  <input .value=${selectedNode.label || ''} @input=${(e) => this.updateEditorNodeField('label', e.target.value)} />
                  <label>Тип шага</label>
                  <input
                    .value=${selectedNode.type || ''}
                    @input=${(e) => this.updateEditorNodeField('type', String(e.target.value || '').trim())}
                    placeholder="approval.kofn / handler.http / child.start / event.wait / timer.delay / timer.until"
                  />
                  <label>after (через запятую)</label>
                  <input .value=${afterCsv} @input=${(e) => this.updateEditorNodeCsvField('after', e.target.value)} />
                  <label>members (через запятую)</label>
                  <input .value=${membersCsv} @input=${(e) => this.updateEditorNodeCsvField('members', e.target.value)} />
                  <label>K (для approval.kofn)</label>
                  <input
                    type="number"
                    .value=${String(selectedNode.k ?? 1)}
                    @input=${(e) => this.updateEditorNodeField('k', Number(e.target.value || 1))}
                  />
                  <label class="checkbox-row">
                    <input
                      type="checkbox"
                      .checked=${selectedNode.required !== false}
                      @change=${(e) => this.updateEditorNodeField('required', Boolean(e.target.checked))}
                    />
                    обязательный шаг
                  </label>

                  <label>Полный JSON шага</label>
                  <textarea .value=${this.editorStepJson} @input=${(e) => (this.editorStepJson = e.target.value)}></textarea>
                  <button class="secondary" type="button" ?disabled=${this.busy} @click=${this.applyEditorStepJson}>Применить JSON шага</button>
                  ${this.editorErrorText ? html`<div class="error">${this.editorErrorText}</div>` : ''}
                `
              : html`<div class="hint">Добавьте шаг, чтобы начать редактирование.</div>`}

            <label>Route JSON (весь шаблон)</label>
            <textarea readonly .value=${JSON.stringify(this.routeDraft, null, 2)}></textarea>
          </section>
        </section>

        <div class="status">${this.errorText ? html`<span class="error">${this.errorText}</span>` : 'Готово'}</div>
      </div>

      <div class="toast-stack">
        ${this.toasts.map(
          (toast) => html`
            <div class="toast">
              <div>${toast.message}</div>
              <button type="button" @click=${() => this.dismissToast(toast.id)}>x</button>
            </div>
          `
        )}
      </div>
    `;
  }
}

customElements.define('doc-templates-demo', DocTemplatesDemo);
