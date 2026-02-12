// Валидное имя типа документа: латиница/цифры/_/-
const DOC_TYPE_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function candidateHiringRoute() {
  return {
    nodes: [
      {
        id: 'candidate.intake',
        type: 'handler.http',
        label: 'Регистрация кандидата',
        app: 'doc',
        action: 'candidate.intake',
        pre: {
          app: 'doc',
          action: 'pre.policy.check',
          payload: {
            check: 'candidate_profile',
            step: 'candidate.intake',
            candidateName: '{{doc.title}}',
            salary: '{{doc.cost}}',
            position: '{{doc.position}}',
            grade: '{{doc.grade}}',
            location: '{{doc.location}}',
            documents: '{{doc.documents}}',
          },
        },
        post: {
          app: 'doc',
          action: 'kafka.snapshot',
          payload: {
            topic: 'candidate.history.snapshots',
            stage: 'candidate.intake',
            candidateId: '{{doc.candidateId}}',
          },
        },
        payload: {
          candidateName: '{{doc.title}}',
          salary: '{{doc.cost}}',
          candidateId: '{{doc.candidateId}}',
          position: '{{doc.position}}',
          grade: '{{doc.grade}}',
          location: '{{doc.location}}',
          employmentType: '{{doc.employmentType}}',
          source: '{{doc.source}}',
          documents: '{{doc.documents}}',
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
        post: {
          app: 'doc',
          action: 'kafka.snapshot',
          payload: {
            topic: 'candidate.history.snapshots',
            stage: 'recruiter.approval',
            candidateId: '{{doc.candidateId}}',
            decision: '{{context.steps.recruiter.approval.result.outcome}}',
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
        post: {
          app: 'doc',
          action: 'kafka.snapshot',
          payload: {
            topic: 'candidate.history.snapshots',
            stage: 'finance.group',
            candidateId: '{{doc.candidateId}}',
          },
        },
      },
      {
        id: 'security.precheck',
        type: 'child.start',
        label: 'Проверка СБ (дочерний процесс)',
        workflowType: 'candidateSecurityCheck',
        after: ['recruiter.approval'],
        needChanges: {
          defaultTarget: 'recruiter.approval',
          allowedTargets: ['recruiter.approval'],
        },
        pre: {
          app: 'doc',
          action: 'pre.policy.check',
          payload: {
            check: 'security_precheck',
            step: 'security.precheck',
            candidateName: '{{doc.title}}',
            salary: '{{doc.cost}}',
            documents: '{{doc.documents}}',
            requiredDocuments: '{{doc.securityRequiredDocuments}}',
            riskTag: '{{doc.riskTag}}',
          },
          onPrecheckRejected: {
            type: 'need_changes',
            targetNodeId: 'recruiter.approval',
            actor: 'Система precheck СБ',
            comment:
              'Автовозврат на рекрутеров: для передачи в СБ нужно минимум 2 документа (passport и consent).',
          },
        },
        input: {
          baseUrl: '{{context.docHandlers}}',
          docId: '{{doc.candidateId}}',
          payload: {
            candidateName: '{{doc.title}}',
            salary: '{{doc.cost}}',
            documents: '{{doc.documents}}',
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
        needChanges: {
          defaultTarget: 'security.precheck',
          allowedTargets: ['security.precheck', 'recruiter.approval'],
        },
        post: {
          app: 'doc',
          action: 'kafka.snapshot',
          payload: {
            topic: 'candidate.history.snapshots',
            stage: 'security.approval',
            candidateId: '{{doc.candidateId}}',
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
        after: ['finance.group', 'security.approval'],
        needChanges: {
          defaultTarget: 'security.approval',
          disallowTargets: ['recruiter.approval'],
        },
        post: {
          app: 'doc',
          action: 'kafka.snapshot',
          payload: {
            topic: 'candidate.history.snapshots',
            stage: 'director.approval',
            candidateId: '{{doc.candidateId}}',
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
        guard: {
          op: 'gte',
          left: { path: 'doc.cost' },
          right: 150,
        },
        needChanges: {
          defaultTarget: 'director.approval',
          disallowTargets: ['recruiter.approval'],
        },
        pre: {
          app: 'doc',
          action: 'pre.policy.check',
          payload: {
            check: 'compensation_committee',
            step: 'comp.committee',
            salary: '{{doc.cost}}',
          },
        },
        post: {
          app: 'doc',
          action: 'kafka.snapshot',
          payload: {
            topic: 'candidate.history.snapshots',
            stage: 'comp.committee',
            candidateId: '{{doc.candidateId}}',
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
            topic: 'candidate.history.snapshots',
            stage: 'notify',
            candidateId: '{{doc.candidateId}}',
          },
        },
        payload: {
          candidateName: '{{doc.title}}',
          salary: '{{doc.cost}}',
        },
      },
    ],
  };
}

function contractorFastTrackRoute() {
  return {
    nodes: [
      {
        id: 'contractor.intake',
        type: 'handler.http',
        label: 'Регистрация подрядчика',
        app: 'doc',
        action: 'candidate.intake',
        payload: {
          candidateName: '{{doc.title}}',
          salary: '{{doc.cost}}',
          candidateId: '{{doc.candidateId}}',
          employmentType: 'contractor',
        },
      },
      {
        id: 'recruiter.fast',
        type: 'approval.kofn',
        label: 'Быстрое согласование рекрутера',
        members: ['Анна', 'Борис'],
        k: 1,
        required: true,
        after: ['contractor.intake'],
      },
      {
        id: 'security.fast',
        type: 'approval.kofn',
        label: 'Проверка СБ',
        members: ['СБ 1'],
        k: 1,
        required: true,
        after: ['recruiter.fast'],
      },
      {
        id: 'finance.fast',
        type: 'approval.kofn',
        label: 'Согласование финансов',
        members: ['Финансы 1', 'Финансы 2'],
        k: 1,
        required: false,
        after: ['security.fast'],
        guard: {
          op: 'gte',
          left: { path: 'doc.cost' },
          right: 120,
        },
      },
      {
        id: 'notify.fast',
        type: 'handler.http',
        label: 'Публикация результата',
        app: 'doc',
        action: 'candidate.offer.publish',
        after: ['finance.fast'],
        payload: {
          candidateName: '{{doc.title}}',
          salary: '{{doc.cost}}',
        },
      },
    ],
  };
}

function defaultTemplates() {
  return [
    {
      docType: 'candidate_hiring',
      name: 'Найм кандидата (полный)',
      description: 'Полный процесс найма: рекрутеры, финансы, СБ, директор, комитет.',
      route: candidateHiringRoute(),
    },
    {
      docType: 'contractor_fasttrack',
      name: 'Подрядчик (быстрый)',
      description: 'Укороченный путь согласования для подрядчиков.',
      route: contractorFastTrackRoute(),
    },
  ];
}

export function normalizeDocType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return '';
  if (!DOC_TYPE_RE.test(normalized)) return '';
  return normalized;
}

export function validateDocRoute(route) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) {
    throw new Error('route must be an object');
  }
  if (!Array.isArray(route.nodes)) {
    throw new Error('route.nodes is required');
  }
  if (route.nodes.length === 0) {
    throw new Error('route.nodes must not be empty');
  }

  const ids = new Set();
  for (const node of route.nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error('every route node must be an object');
    }
    if (typeof node.id !== 'string' || node.id.trim().length === 0) {
      throw new Error('every route node must have non-empty id');
    }
    if (ids.has(node.id)) {
      throw new Error(`duplicated node id: ${node.id}`);
    }
    ids.add(node.id);
  }
}

export function createDocTemplateRegistry(seedTemplates = defaultTemplates()) {
  const templates = new Map();

  for (const template of seedTemplates) {
    const docType = normalizeDocType(template.docType);
    if (!docType) continue;
    try {
      validateDocRoute(template.route);
    } catch {
      continue;
    }
    const now = new Date().toISOString();
    templates.set(docType, {
      docType,
      name: template.name || docType,
      description: template.description || '',
      route: cloneJson(template.route),
      updatedAt: now,
    });
  }

  return {
    list() {
      return [...templates.values()]
        .map((item) => ({
          docType: item.docType,
          name: item.name,
          description: item.description,
          nodeCount: item.route?.nodes?.length || 0,
          updatedAt: item.updatedAt,
        }))
        .sort((a, b) => a.docType.localeCompare(b.docType));
    },
    get(docType) {
      const key = normalizeDocType(docType);
      if (!key || !templates.has(key)) return null;
      return cloneJson(templates.get(key));
    },
    upsert({ docType, name, description, route }) {
      const key = normalizeDocType(docType);
      if (!key) {
        throw new Error('invalid docType: expected [a-z0-9_-], 2-64 chars');
      }
      validateDocRoute(route);
      const now = new Date().toISOString();
      const existing = templates.get(key);
      const next = {
        docType: key,
        name: String(name || existing?.name || key).trim() || key,
        description: String(description || existing?.description || '').trim(),
        route: cloneJson(route),
        updatedAt: now,
      };
      templates.set(key, next);
      return cloneJson(next);
    },
  };
}

