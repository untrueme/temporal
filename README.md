# Temporal + Fastify (Node.js, ES Modules)

Репозиторий с 3 workflow-кейсами на Temporal (чистый JS, ES modules) и Fastify API. Везде есть корреляция `docId/ticketId/tripId` и `nodeId` в логах. Никакого TypeScript.

## Отдельные README по workflow
- Документооборот: `/Users/untrue/Repo/chatgpt_code/temportal/docs/README-doc-workflow.md`
- Service Desk: `/Users/untrue/Repo/chatgpt_code/temportal/docs/README-service-desk-workflow.md`
- Командировки: `/Users/untrue/Repo/chatgpt_code/temportal/docs/README-trip-workflow.md`

## Demo UI
- UI раздается из API (тот же порт, по умолчанию `3007`).
- Главная страница: `http://localhost:3007/ui`
- Шаблоны документов: `http://localhost:3007/ui/doc-templates`
- Документооборот: `http://localhost:3007/ui/doc`
- Service Desk: `http://localhost:3007/ui/tickets`
- Командировки: `http://localhost:3007/ui/trip`
- Реализация UI: `lit-element` (через ESM import в браузере).

## Архитектура
- **Temporal Worker**: исполняет workflow и activities. Файл `src/worker.js`.
- **Fastify API**: старт workflow, сигналы, queries и встроенные handlers endpoints. Файл `src/api.js`.
- **Standalone Handlers App (optional)**: отдельный процесс с теми же handlers endpoint-ами. Файл `src/handlersApp.js`.
- **Utilities**: guard DSL, template rendering, DAG readiness, idempotency. Папка `src/utils`.

Handlers endpoints (в API и в optional standalone handlers app):
- `POST /handlers/:action` (документооборот)
- `POST /sd/:action` (service desk)
- `POST /trip/:action` (командировки)

Template endpoints:
- `GET /workflows/doc/templates`
- `GET /workflows/doc/templates/:docType`
- `PUT /workflows/doc/templates/:docType`

## Быстрый старт
0. Скопируйте `.env.example` → `.env` и при необходимости измените значения (дефолтный порт `3007`).
1. Убедитесь, что Temporal Server доступен на `localhost:7233`.
2. Установите зависимости:

```bash
npm install
```

3. Запустите воркер:

```bash
npm run worker
```

4. Запустите API (по умолчанию порт 3007):

```bash
npm run api
```

5. Откройте demo UI:

```bash
open http://localhost:3007/ui
```

## Переменные окружения
- `TEMPORAL_ADDRESS` (по умолчанию `localhost:7233`)
- `TEMPORAL_NAMESPACE` (по умолчанию `default`)
- `TASK_QUEUE` (по умолчанию `temportal`)
- `PORT` (API, по умолчанию `3007`)
- `API_BASE_URL` (опционально; base URL API для встроенных handlers, по умолчанию `http://localhost:${PORT}`)
- `APP_URL` (base URL для doc handlers, по умолчанию `${API_BASE_URL}/handlers`)
- `SD_APP_URL` (base URL для service desk handlers, по умолчанию `${API_BASE_URL}/sd`)
- `TRIP_APP_URL` (base URL для trip handlers, по умолчанию `${API_BASE_URL}/trip`)
- `HANDLERS_PORT` (только для standalone режима `npm run handlers`, по умолчанию `4001`)

Standalone handlers app (опционально):
```bash
npm run handlers
```
Если запускаете handlers отдельно, задайте `APP_URL`/`SD_APP_URL`/`TRIP_APP_URL` в API.

## Temporal UI
Запуск UI через Docker (если UI отдельно от сервера):

```bash
docker run --rm -p 8080:8080 \
  -e TEMPORAL_ADDRESS=host.docker.internal:7233 \
  temporalio/ui:latest
```

- Порт UI: `8080`
- Откройте `http://localhost:8080` и выберите namespace `default`.
- Ищите execution по `workflowId`: `doc-...`, `ticket-...`, `trip-...`.

## JSON DSL (общие правила)
**Node**:
- `id`: уникальный id узла
- `type`: тип узла
- `after`: список зависимостей (по умолчанию `[]`)
- `guard`: JSON-guard (опционально)
- `required`: обязательность шага для `approval.kofn` (по умолчанию `true`)

**Guard DSL (без eval)**
- Формат: `{ op, left, right }`
- `left/right`: литерал или `{ path: "doc.xxx" }` / `{ path: "vars.xxx" }`
- Поддерживаемые операции: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `exists`, `and`, `or`, `not`

**Template DSL**
- Поддержка `{{doc.x}}` и `{{vars.y}}` в строках/объектах/массивах.
- Если строка состоит только из `{{...}}`, возвращается значение исходного типа (не строка).

**DAG readiness**
- Узел готов, когда все `after` имеют статус `done` или `skipped`.
- Узел со `guard=false` становится `skipped`.

**Типы узлов**
- `handler.http`: вызывает handlers app через Activity
  - поля: `app` (`doc|trip`), `action`, `payload`
- `approval.kofn`: ожидание K-of-N approvals
  - поля: `members`, `k` (по умолчанию 2-of-N, если участников > 1), `required`
  - поддерживает inline gate: поле `gate` (`app`, `action`, `payload`, `passWhen`, `required`)
  - если `gate.passWhen=false` и `gate.required=true`, workflow завершается со статусом `rejected`
- `timer.delay`: `ms` или `delayMs` или `seconds`
- `timer.until`: `at` (ISO дата или ms)
- `event.wait`: `eventName`, `setVars`
- `child.start`: `workflowType`, `input`

**Важно:** API возвращает `workflowId` вида `doc-<docId>`, `ticket-<ticketId>`, `trip-<tripId>`. Используйте его для сигналов и запросов состояния.
Для `approval.kofn`: `decline` в `required=true` останавливает workflow; `need_changes` не завершает workflow и возвращает процесс на доработку.

## Кейc 1 — Документооборот / согласование (JSON DAG)
Подробный сложный пример на 7 шагов (sequential + parallel + `pre`/`post` hooks + Kafka snapshot post-hook) см. `docs/README-doc-workflow.md`.

**Пример маршрута (legal + conditional finance):**

```json
{
  "nodes": [
    { "id": "legal.review", "type": "handler.http", "app": "doc", "action": "legal.review" },
    { "id": "legal.approval", "type": "approval.kofn", "members": ["alice", "bob", "carol"], "k": 2, "required": true, "after": ["legal.review"] },
    { "id": "finance.check", "type": "handler.http", "app": "doc", "action": "finance.check",
      "guard": { "op": "gt", "left": { "path": "doc.cost" }, "right": 100 } },
    { "id": "finance.approval", "type": "approval.kofn", "members": ["fin1", "fin2"], "k": 1, "required": false,
      "after": ["finance.check"],
      "guard": { "op": "gt", "left": { "path": "doc.cost" }, "right": 100 } },
    { "id": "notify", "type": "handler.http", "app": "doc", "action": "notify", "after": ["legal.approval", "finance.approval"] }
  ]
}
```

**Запуск:**

```bash
curl -X POST http://localhost:3007/workflows/doc/start \
  -H 'content-type: application/json' \
  -d '{
    "docId": "001",
    "doc": { "cost": 150, "title": "NDA" },
    "route": {
      "nodes": [
        { "id": "legal.review", "type": "handler.http", "app": "doc", "action": "legal.review" },
        { "id": "legal.approval", "type": "approval.kofn", "members": ["alice", "bob", "carol"], "k": 2, "required": true, "after": ["legal.review"] },
        { "id": "finance.check", "type": "handler.http", "app": "doc", "action": "finance.check",
          "guard": { "op": "gt", "left": { "path": "doc.cost" }, "right": 100 } },
        { "id": "finance.approval", "type": "approval.kofn", "members": ["fin1", "fin2"], "k": 1, "required": false,
          "after": ["finance.check"],
          "guard": { "op": "gt", "left": { "path": "doc.cost" }, "right": 100 } },
        { "id": "notify", "type": "handler.http", "app": "doc", "action": "notify", "after": ["legal.approval", "finance.approval"] }
      ]
    }
  }'
```

**Запуск по типу документа (без передачи route):**

```bash
curl -X POST http://localhost:3007/workflows/doc/start \
  -H 'content-type: application/json' \
  -d '{
    "docType": "candidate_hiring",
    "docId": "001-typed",
    "doc": { "cost": 150, "title": "NDA", "candidateId": "001-typed", "documents": ["passport", "consent"] }
  }'
```

Шаблоны доступны через:
- `GET /workflows/doc/templates`
- `GET /workflows/doc/templates/:docType`
- `PUT /workflows/doc/templates/:docType`

**Approval (2-of-N):**

```bash
curl -X POST http://localhost:3007/workflows/doc/doc-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "legal.approval", "actor": "alice", "decision": "accept" }'

curl -X POST http://localhost:3007/workflows/doc/doc-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "legal.approval", "actor": "bob", "decision": "accept" }'
```

**Decline (глобальный stop):**

```bash
curl -X POST http://localhost:3007/workflows/doc/doc-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "legal.approval", "actor": "bob", "decision": "decline", "comment": "Missing legal clause 4.2" }'
```

При `decline` на `required=true` workflow завершается со статусом `rejected`; для `decline` нужен `comment`.

**Need changes (возврат на доработку, workflow продолжает работу):**

```bash
curl -X POST http://localhost:3007/workflows/doc/doc-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "legal.approval", "actor": "bob", "decision": "need_changes", "comment": "Не хватает документов по безопасности", "returnToNodeId": "legal.review" }'
```

`returnToNodeId` опционален. Если не указан, workflow возвращается на предыдущий шаг автоматически.

**Самоотказ кандидата (независимый сигнал, статус withdrawn):**

```bash
curl -X POST http://localhost:3007/workflows/doc/doc-001/self-withdraw \
  -H 'content-type: application/json' \
  -d '{ "actor": "candidate", "reason": "Не дождался решения, принял контроффер" }'
```

**Progress:**

```bash
curl http://localhost:3007/workflows/doc/doc-001/progress
```

## Кейc 2 — Service Desk (1 тикет = 1 workflow)
**Старт тикета:**

```bash
curl -X POST http://localhost:3007/tickets/start \
  -H 'content-type: application/json' \
  -d '{
    "ticketId": "100",
    "ticket": { "title": "VPN issue" },
    "policy": { "firstResponseMs": 5000, "resolveMs": 20000, "autoCloseMs": 5000 }
  }'
```

**События через signal:**

```bash
curl -X POST http://localhost:3007/tickets/ticket-100/event \
  -H 'content-type: application/json' \
  -d '{ "type": "ASSIGN", "actor": "dispatcher" }'

curl -X POST http://localhost:3007/tickets/ticket-100/event \
  -H 'content-type: application/json' \
  -d '{ "type": "AGENT_RESPONDED", "actor": "agent1" }'

curl -X POST http://localhost:3007/tickets/ticket-100/event \
  -H 'content-type: application/json' \
  -d '{ "type": "RESOLVE", "actor": "agent1" }'
```

**Состояние:**

```bash
curl http://localhost:3007/tickets/ticket-100/state
```

**SLA breach (демо):**
- Установите `firstResponseMs` на 200–500мс, пошлите `ASSIGN` и ничего не отвечайте — сработает `escalate`.

## Кейc 3 — Командировка (JSON DSL + child workflows)
**JSON пример процесса:**

```json
{
  "nodes": [
    { "id": "manager.approval", "type": "approval.kofn", "members": ["manager1"], "k": 1 },
    { "id": "finance.approval", "type": "approval.kofn", "members": ["finance1"], "k": 1,
      "guard": { "op": "gt", "left": { "path": "doc.budget" }, "right": 1000 } },

    { "id": "child.ticket", "type": "child.start", "workflowType": "ticketPurchase",
      "input": { "baseUrl": "{{vars.tripHandlers}}", "tripId": "{{doc.tripId}}" },
      "guard": { "op": "eq", "left": { "path": "doc.needTickets" }, "right": true },
      "after": ["manager.approval", "finance.approval"] },

    { "id": "child.hotel", "type": "child.start", "workflowType": "hotelBooking",
      "input": { "baseUrl": "{{vars.tripHandlers}}", "tripId": "{{doc.tripId}}" },
      "guard": { "op": "eq", "left": { "path": "doc.needHotel" }, "right": true },
      "after": ["manager.approval", "finance.approval"] },

    { "id": "child.perdiem", "type": "child.start", "workflowType": "perDiemPayout",
      "input": { "baseUrl": "{{vars.tripHandlers}}", "tripId": "{{doc.tripId}}" },
      "guard": { "op": "eq", "left": { "path": "doc.needPerDiem" }, "right": true },
      "after": ["manager.approval", "finance.approval"] },

    { "id": "wait.endDate", "type": "timer.until", "at": "2026-02-05T12:00:00.000Z",
      "after": ["child.ticket", "child.hotel", "child.perdiem"] },

    { "id": "notify.report", "type": "handler.http", "app": "trip", "action": "report.request",
      "after": ["wait.endDate"] },

    { "id": "report.wait", "type": "event.wait", "eventName": "REPORT_SUBMITTED",
      "setVars": { "reportSubmitted": true }, "after": ["notify.report"] },

    { "id": "report.delay", "type": "timer.delay", "ms": 259200000,
      "after": ["notify.report"] },

    { "id": "report.escalate", "type": "handler.http", "app": "trip", "action": "report.escalate",
      "guard": { "op": "ne", "left": { "path": "vars.reportSubmitted" }, "right": true },
      "after": ["report.delay"] },

    { "id": "trip.close", "type": "handler.http", "app": "trip", "action": "trip.close",
      "after": ["report.wait"] }
  ]
}
```

**Старт процесса:**

```bash
curl -X POST http://localhost:3007/process/start \
  -H 'content-type: application/json' \
  -d '{
    "tripId": "001",
    "doc": {
      "tripId": "001",
      "budget": 1200,
      "needTickets": true,
      "needHotel": true,
      "needPerDiem": false
    },
    "vars": { "reportSubmitted": false },
    "route": {
      "nodes": [
        { "id": "manager.approval", "type": "approval.kofn", "members": ["manager1"], "k": 1 },
        { "id": "finance.approval", "type": "approval.kofn", "members": ["finance1"], "k": 1,
          "guard": { "op": "gt", "left": { "path": "doc.budget" }, "right": 1000 } },
        { "id": "child.ticket", "type": "child.start", "workflowType": "ticketPurchase",
          "input": { "baseUrl": "{{vars.tripHandlers}}", "tripId": "{{doc.tripId}}" },
          "guard": { "op": "eq", "left": { "path": "doc.needTickets" }, "right": true },
          "after": ["manager.approval", "finance.approval"] },
        { "id": "child.hotel", "type": "child.start", "workflowType": "hotelBooking",
          "input": { "baseUrl": "{{vars.tripHandlers}}", "tripId": "{{doc.tripId}}" },
          "guard": { "op": "eq", "left": { "path": "doc.needHotel" }, "right": true },
          "after": ["manager.approval", "finance.approval"] },
        { "id": "child.perdiem", "type": "child.start", "workflowType": "perDiemPayout",
          "input": { "baseUrl": "{{vars.tripHandlers}}", "tripId": "{{doc.tripId}}" },
          "guard": { "op": "eq", "left": { "path": "doc.needPerDiem" }, "right": true },
          "after": ["manager.approval", "finance.approval"] },
        { "id": "wait.endDate", "type": "timer.until", "at": "2099-01-01T00:00:00.000Z",
          "after": ["child.ticket", "child.hotel", "child.perdiem"] },
        { "id": "notify.report", "type": "handler.http", "app": "trip", "action": "report.request",
          "after": ["wait.endDate"] },
        { "id": "report.wait", "type": "event.wait", "eventName": "REPORT_SUBMITTED",
          "setVars": { "reportSubmitted": true }, "after": ["notify.report"] },
        { "id": "report.delay", "type": "timer.delay", "ms": 3000,
          "after": ["notify.report"] },
        { "id": "report.escalate", "type": "handler.http", "app": "trip", "action": "report.escalate",
          "guard": { "op": "ne", "left": { "path": "vars.reportSubmitted" }, "right": true },
          "after": ["report.delay"] },
        { "id": "trip.close", "type": "handler.http", "app": "trip", "action": "trip.close",
          "after": ["report.wait"] }
      ]
    }
  }'
```

**Approval:**

```bash
curl -X POST http://localhost:3007/process/trip-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "manager.approval", "actor": "manager1", "decision": "approve" }'
```

**REPORT_SUBMITTED:**

```bash
curl -X POST http://localhost:3007/process/trip-001/event \
  -H 'content-type: application/json' \
  -d '{ "eventName": "REPORT_SUBMITTED", "data": { "by": "traveler" } }'
```

**Progress:**

```bash
curl http://localhost:3007/process/trip-001/progress
```

**Для тестов можно укоротить таймеры:**
- `endDate = now + 5s`
- `report.delay = 200ms`

## Тесты
### Unit
- `evalGuard`
- `template rendering`
- `depsDone / readyNodes`
- `approval.kofn aggregator`
- `idempotency`
- `service desk transitions`

### Integration
Требуется локальный Temporal Server на `localhost:7233`.

```bash
npm test
# или
npm run test:unit
npm run test:integration
```

## Optional: docker-compose (Temporal + UI)
Файл `docker-compose.yml` можно использовать, если нет локального Temporal.

```bash
docker compose up -d
```

## Таблица тестовых сценариев (Given/When/Then)
| Given | When | Then |
| --- | --- | --- |
| Doc cost=50 | 2 approvals legal | Finance skipped, notify done |
| Doc cost=150 | approvals legal + finance | Notify done |
| Ticket assigned | no agent response | firstResponse breach true |
| Ticket resolved | wait autoCloseMs | status CLOSED |
| Trip budget<=1000 | manager approval | finance approval skipped |
| Trip report not sent | wait report delay | report.escalate executed |

## Список тест-кейсов (конец README)
1. Документ `cost=50` → finance ветка пропущена → notify выполнен.
2. Документ `cost=150` → finance ветка выполнена → notify выполнен.
3. Approval.kofn: два разных актёра дают approve → статус approved.
4. Service Desk: ASSIGN без AGENT_RESPONDED до SLA → флаг breach true.
5. Service Desk: RESOLVE → autoClose → статус CLOSED.
6. Trip: budget<=1000 → finance.approval skipped.
7. Trip: child workflows ticket/perdiem выполнены.
8. Trip: report не отправлен → report.escalate выполнен.
9. Trip: REPORT_SUBMITTED → trip.close выполнен.
