# Командировка (JSON DSL + Child Workflows)

## Назначение
Workflow командировки: approvals, child workflows, ожидание `endDate`, контроль отчета и эскалация.

## Endpoint'ы
- `POST /process/start`
- `POST /process/:id/approval`
- `POST /process/:id/event`
- `GET /process/:id/progress`

## Полный curl: старт процесса
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

## Полный curl: approval + event + progress
```bash
curl -X POST http://localhost:3007/process/trip-001/approval \
  -H 'content-type: application/json' \
  -d '{ "nodeId": "manager.approval", "actor": "manager1", "decision": "approve" }'

curl -X POST http://localhost:3007/process/trip-001/event \
  -H 'content-type: application/json' \
  -d '{ "eventName": "REPORT_SUBMITTED", "data": { "by": "traveler" } }'

curl http://localhost:3007/process/trip-001/progress
```

## Demo UI
- Page: `http://localhost:3007/ui/trip`
- UI runs on the same host/port as API.
