# Документооборот (Temporal JSON DAG)

## Назначение
Сложный пример согласования документа на 7 шагах с комбинацией:
- последовательных этапов,
- параллельных веток,
- `pre`/`post` обработчиков на каждом шаге.

`post`-обработчик отправляет слепок изменения в Kafka (в демо — эмуляция через handlers app лог).

## Endpoint'ы
- `POST /workflows/doc/start`
- `POST /workflows/doc/:id/approval`
- `POST /workflows/doc/:id/event` (для `DOC_UPDATE`)
- `GET /workflows/doc/:id/progress`
- `GET /workflows/doc/list` (список workflow для demo UI)

## DSL для pre/post
Каждый узел может иметь:
- `pre`: HTTP hook перед выполнением шага (по умолчанию required)
- `post`: HTTP hook после шага (по умолчанию best-effort)

Пример:
```json
{
  "id": "risk.assessment",
  "type": "handler.http",
  "action": "risk.assessment",
  "pre": {
    "app": "doc",
    "action": "pre.policy.check",
    "payload": { "check": "risk_rules" }
  },
  "post": {
    "app": "doc",
    "action": "kafka.snapshot",
    "payload": { "topic": "doc.history.snapshots", "step": "risk.assessment" }
  }
}
```

## Правило обязательности approval
- `required: true` (или отсутствие поля) -> `decline` останавливает весь workflow.
- `required: false` -> `decline` фиксируется в шаге, workflow продолжает жить.
- Для `decline` комментарий `comment` обязателен.

## Процессный gate после 2+ согласований
Если нужно после `k>=2` аппрувов выполнить дополнительную проверку, добавьте `gate` прямо в текущий `approval.kofn` шаг (а не `post` hook):

```json
{
  "id": "finance.approval",
  "type": "approval.kofn",
  "members": ["fin1", "fin2", "cfo"],
  "k": 2,
  "required": true,
  "gate": {
    "app": "doc",
    "action": "gate.finance.score",
    "payload": { "stage": "finance", "cost": "{{doc.cost}}", "approvalsRequired": 2 },
    "passWhen": { "op": "eq", "left": { "path": "result.data.gate.status" }, "right": "PASS" },
    "required": true
  }
}
```

Поведение:
- `passWhen=true` -> процесс идет дальше.
- `passWhen=false` и `required=true` -> весь workflow завершается как `rejected`.

## Полный curl: старт сложного 7-шагового маршрута
```bash
curl -X POST http://localhost:3000/workflows/doc/start \
  -H 'content-type: application/json' \
  -d '{
    "docId": "doc-7step-001",
    "doc": {
      "title": "Master Service Agreement",
      "cost": 170,
      "owner": "procurement"
    },
    "route": {
      "nodes": [
        {
          "id": "intake.normalize",
          "type": "handler.http",
          "app": "doc",
          "action": "intake.normalize",
          "payload": {
            "title": "{{doc.title}}",
            "cost": "{{doc.cost}}"
          },
          "pre": {
            "app": "doc",
            "action": "pre.policy.check",
            "payload": { "check": "schema_and_acl", "step": "intake.normalize" }
          },
          "post": {
            "app": "doc",
            "action": "kafka.snapshot",
            "payload": { "topic": "doc.history.snapshots", "step": "intake.normalize" }
          }
        },
        {
          "id": "legal.approval",
          "type": "approval.kofn",
          "members": ["alice", "bob", "carol"],
          "k": 2,
          "required": true,
          "after": ["intake.normalize"],
          "pre": {
            "app": "doc",
            "action": "pre.policy.check",
            "payload": { "check": "legal_gate", "step": "legal.approval" }
          },
          "post": {
            "app": "doc",
            "action": "kafka.snapshot",
            "payload": { "topic": "doc.history.snapshots", "step": "legal.approval" }
          }
        },
        {
          "id": "risk.assessment",
          "type": "handler.http",
          "app": "doc",
          "action": "risk.assessment",
          "after": ["legal.approval"],
          "pre": {
            "app": "doc",
            "action": "pre.policy.check",
            "payload": { "check": "risk_rules", "step": "risk.assessment" }
          },
          "post": {
            "app": "doc",
            "action": "kafka.snapshot",
            "payload": { "topic": "doc.history.snapshots", "step": "risk.assessment" }
          }
        },
        {
          "id": "security.review",
          "type": "handler.http",
          "app": "doc",
          "action": "security.review",
          "after": ["legal.approval"],
          "pre": {
            "app": "doc",
            "action": "pre.policy.check",
            "payload": { "check": "security_classification", "step": "security.review" }
          },
          "post": {
            "app": "doc",
            "action": "kafka.snapshot",
            "payload": { "topic": "doc.history.snapshots", "step": "security.review" }
          }
        },
        {
          "id": "finance.approval",
          "type": "approval.kofn",
          "members": ["fin1", "fin2", "cfo"],
          "k": 2,
          "required": true,
          "after": ["risk.assessment"],
          "guard": { "op": "gte", "left": { "path": "doc.cost" }, "right": 150 },
          "pre": {
            "app": "doc",
            "action": "pre.policy.check",
            "payload": { "check": "budget_gate", "step": "finance.approval" }
          },
          "post": {
            "app": "doc",
            "action": "kafka.snapshot",
            "payload": { "topic": "doc.history.snapshots", "step": "finance.approval" }
          }
        },
        {
          "id": "director.approval",
          "type": "approval.kofn",
          "members": ["director1", "director2"],
          "k": 1,
          "required": true,
          "after": ["security.review", "finance.approval"],
          "pre": {
            "app": "doc",
            "action": "pre.policy.check",
            "payload": { "check": "final_gate", "step": "director.approval" }
          },
          "post": {
            "app": "doc",
            "action": "kafka.snapshot",
            "payload": { "topic": "doc.history.snapshots", "step": "director.approval" }
          }
        },
        {
          "id": "notify",
          "type": "handler.http",
          "app": "doc",
          "action": "notify.publish",
          "after": ["director.approval"],
          "pre": {
            "app": "doc",
            "action": "pre.policy.check",
            "payload": { "check": "publish_acl", "step": "notify" }
          },
          "post": {
            "app": "doc",
            "action": "kafka.snapshot",
            "payload": { "topic": "doc.history.snapshots", "step": "notify" }
          }
        }
      ]
    }
  }'
```

## Полный curl: approvals
```bash
curl -X POST http://localhost:3000/workflows/doc/doc-doc-7step-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "legal.approval", "actor": "alice", "decision": "accept" }'

curl -X POST http://localhost:3000/workflows/doc/doc-doc-7step-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "legal.approval", "actor": "bob", "decision": "accept" }'

curl -X POST http://localhost:3000/workflows/doc/doc-doc-7step-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "finance.approval", "actor": "fin1", "decision": "accept" }'

curl -X POST http://localhost:3000/workflows/doc/doc-doc-7step-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "finance.approval", "actor": "cfo", "decision": "accept" }'

curl -X POST http://localhost:3000/workflows/doc/doc-doc-7step-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "director.approval", "actor": "director1", "decision": "accept" }'
```

## Полный curl: decline (global stop)
```bash
curl -X POST http://localhost:3000/workflows/doc/doc-doc-7step-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "director.approval", "actor": "director1", "decision": "decline", "comment": "Need updated liability clause" }'
```

## Полный curl: progress/list
```bash
curl http://localhost:3000/workflows/doc/doc-doc-7step-001/progress
curl http://localhost:3000/workflows/doc/list
```

## Ожидаемое поведение
- Шаги `risk.assessment` и `security.review` выполняются параллельно после `legal.approval`.
- `finance.approval` включается только при `doc.cost >= 150`.
- Каждый шаг вызывает `pre.policy.check` до выполнения и `kafka.snapshot` после выполнения.
- Любой `decline` на обязательном approval шаге завершает процесс.
- Если workflow уже завершен, signal endpoint вернет контролируемую ошибку, UI покажет toast.

## Demo UI
- Page: `http://localhost:3000/ui/doc`
- В левой колонке: список запущенных doc-workflow и их статус.
