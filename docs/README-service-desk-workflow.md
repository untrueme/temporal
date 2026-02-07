# Service Desk (1 ticket = 1 workflow)

## Назначение
Workflow тикета с event-driven переходами статусов и SLA-таймерами.

## Endpoint'ы
- `POST /tickets/start`
- `POST /tickets/:id/event`
- `GET /tickets/:id/state`

## Полный curl: старт тикета
```bash
curl -X POST http://localhost:3000/tickets/start \
  -H 'content-type: application/json' \
  -d '{
    "ticketId": "100",
    "ticket": { "title": "VPN issue" },
    "policy": { "firstResponseMs": 5000, "resolveMs": 20000, "autoCloseMs": 5000 }
  }'
```

## Полный curl: сценарий assign -> responded -> resolve
```bash
curl -X POST http://localhost:3000/tickets/ticket-100/event \
  -H 'content-type: application/json' \
  -d '{ "type": "ASSIGN", "actor": "dispatcher" }'

curl -X POST http://localhost:3000/tickets/ticket-100/event \
  -H 'content-type: application/json' \
  -d '{ "type": "AGENT_RESPONDED", "actor": "agent1" }'

curl -X POST http://localhost:3000/tickets/ticket-100/event \
  -H 'content-type: application/json' \
  -d '{ "type": "RESOLVE", "actor": "agent1" }'
```

## Полный curl: состояние
```bash
curl http://localhost:3000/tickets/ticket-100/state
```

## SLA breach demo
- Поставьте `firstResponseMs=200` на старте.
- Отправьте только `ASSIGN`.
- Через ~200мс в `state.flags.firstResponseBreached` будет `true`.

## Demo UI
- Page: `http://localhost:3000/ui/tickets`
- UI runs on the same host/port as API.
