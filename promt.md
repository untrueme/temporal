# PROMPT FOR LLM: CONTINUE/MAINTAIN TEMPORAL + FASTIFY WORKFLOW DEMO

Ты работаешь с репозиторием Node.js (ESM, без TypeScript), где реализованы 3 бизнес-кейса на Temporal + Fastify + demo UI.
Твоя задача: продолжать разработку без регресса текущего поведения.

## 1) Общий контекст проекта

- Платформа: Node.js >= 18, `type: "module"`.
- Temporal SDK: `@temporalio/worker`, `@temporalio/client`, `@temporalio/workflow`.
- API: Fastify (`src/api.js`).
- Handlers endpoints встроены в API (`/handlers/*`, `/sd/*`, `/trip/*`).
- Отдельный запуск handlers-приложения опционален: `src/handlersApp.js`.
- Workflows:
  - `src/workflows/jsonDAGWorkflow.js` (универсальный JSON runner для document/trip)
  - `src/workflows/serviceDeskTicket.js` (service desk state machine)
  - child workflows: `src/workflows/childWorkflows.js`
- Activities:
  - HTTP вызовы в handlers endpoints: `src/activities/http.js`
- Utilities:
  - guards: `src/utils/guards.js`
  - templates: `src/utils/templates.js`
  - dag readiness: `src/utils/dag.js`
  - approvals + decision normalization: `src/utils/approvals.js`

## 2) Ключевые требования, уже реализованные

- Только JS/ESM, никакого TS.
- Guard DSL безопасный, без `eval`.
- Query handlers в workflow зарегистрированы через `defineQuery + setHandler`.
- Есть API endpoints для `start/signal/query`.
- Есть handlers endpoints, которые логируют payload и возвращают JSON.
- Temporal UI можно запускать в Docker.
- Unit + integration тесты есть (основной акцент на unit utilities и базовые integration).

## 3) Кейс 1 (Document Approval) — текущее фактическое поведение

### 3.1 Workflow-поведение

Файл: `src/workflows/jsonDAGWorkflow.js`

- Любой обязательный `approval.kofn` (`required !== false`) при негативном решении завершает весь workflow.
- Негативные решения: `decline` (нормализуется в `reject`), также совместимость с `reject/needs_changes` сохранена на backend.
- Для негативного решения обязателен `comment`:
  - проверяется в API (`src/api.js`),
  - дополнительно проверяется в signal handler workflow (защита от обхода API).
- При аборте:
  - статус процесса становится `rejected` (или `needs_changes` для legacy-кейса),
  - pending-узлы помечаются как `skipped` с `reason: workflow_aborted`,
  - running scopes cancel.

### 3.2 Dynamic extra-step по cost

- В route есть узел `extra.approval` c guard `doc.cost >= 150`.
- В workflow при `DOC_UPDATE` обновляется `doc.cost`.
- Если ранее guard-узел был `skipped` по `guard_false`, runner пытается ре-активировать его (`pending`) через `maybeReactivateGuardNodes()`, но только если downstream еще не стартовал.

### 3.3 Decisions и нормализация

Файл: `src/utils/approvals.js`

- `accept` -> `approve`
- `decline` -> `reject`
- `rejected` -> `reject`

Состояние approval хранит:
- `approvedActors` (уникальные актеры)
- `decision`
- `decisionActor`
- `decisionComment`

## 4) API контракт (важные endpoints)

Файл: `src/api.js`

### Document
- `POST /workflows/doc/start`
- `POST /workflows/doc/:id/approval`
- `POST /workflows/doc/:id/event` (например `DOC_UPDATE`)
- `GET /workflows/doc/:id/progress`

Валидация:
- Для decline/negative решения comment обязателен, иначе `400`.

### Service Desk
- `POST /tickets/start`
- `POST /tickets/:id/event`
- `GET /tickets/:id/state`

### Trip process
- `POST /process/start`
- `POST /process/:id/approval`
- `POST /process/:id/event`
- `GET /process/:id/progress`

## 5) Doc UI — текущее состояние (самое важное)

Файл: `src/ui/assets/doc-app.js`

### 5.1 Управление сигналом approval

- Пользователь не вводит `nodeId` руками.
- Узел выбирается кликом по графу.
- В форме `Approval Signal` отображаются:
  - `workflowId`
  - `actor` (select)
  - decision-кнопки: только `accept` и `decline`
  - `comment` (обязателен только при `decline`)
- Отправка disabled, если:
  - нет `workflowId`,
  - нет `actor`,
  - узел не доступен,
  - для decline пустой comment.

### 5.2 Фильтрация actor

- Для выбранного approval-узла из списка actors исключаются уже проголосовавшие (`approvedActors`).
- Один и тот же actor не должен голосовать дважды в одном узле.

### 5.3 Граф D3

- Горизонтальный layout.
- Контейнер графа скроллится по X.
- Ноды пронумерованы (бейдж 1..N).
- Коннекторы со стрелками консистентного цвета.
- Стрелка к final узлу должна быть видна.
- Убраны декоративные mini-кнопки в карточках (`+`, `↗`, `x`).
- Убран цветной квадрат в карточке.
- Убраны `+`-кнопки/узлы на ребрах.
- Добавлены тени карточкам и контейнеру графа.

### 5.4 Состояния и цвета

- Done -> зеленый.
- Rejected -> красный.
- Skipped/optional -> серый.
- Final красный при любом отказе в процессе, зеленый при успешном завершении.

### 5.5 Логика доступности шага

- Нельзя выбрать следующий approval-узел, пока не выполнены зависимости.
- Недоступные узлы имеют курсор `not-allowed`.
- Выделяется активный узел.

### 5.6 Extra узел

- На графе extra узел показан всегда.
- По смыслу required только если `cost >= 150`.
- При меньшей сумме считается optional/skipped.

## 6) Layout панелей UI

- Блоки `Start Workflow`, `Approval Signal`, `Output` находятся в одной строке и имеют `flex: 1`.
- Инпуты/кнопки унифицированы по высоте и размерам.
- На мобильном допускается переход в колонку.

## 7) README/документация

- Основной README: `README.md`.
- Отдельный README для case 1: `docs/README-doc-workflow.md`.
- В curl примерах для doc-approval используется:
  - `accept` для согласования,
  - `decline` + обязательный `comment` для отказа.

## 8) Тесты

- Unit тесты есть, в т.ч. approvals:
  - `test/unit/approvals.test.js`
- Проверяется:
  - уникальность актеров,
  - decline -> rejected,
  - accept -> approve,
  - сохранение `decisionActor`/`decisionComment`.

## 9) Ограничения для будущих изменений

Не ломать:
- ESM-only и no TypeScript.
- Поведение stop-on-decline для required-step.
- Обязательный comment при decline.
- Выбор node через граф (не вручную).
- Фильтрацию actors по уже проголосовавшим.
- Горизонтальный скроллящийся граф с нумерацией и стрелками.
- Равномерный layout 3 control-панелей (`flex: 1`).

## 10) Что делать, если вносишь изменения

- Сохраняй обратную совместимость API где возможно.
- После правок прогоняй минимум:
  - `node --check src/ui/assets/doc-app.js`
  - `npm test -- test/unit/approvals.test.js`
- Если меняешь workflow query/signal, проверь регистрацию handler'ов через `defineQuery/defineSignal + setHandler`.

## 11) Быстрый handoff summary

Система уже реализует:
- Temporal workflows + Fastify API + встроенные handlers endpoints (опционально standalone handlers app),
- document flow с глобальным stop на отказе в required approval,
- dynamic extra-step по `cost` и `DOC_UPDATE`,
- D3 demo UI с горизонтальным графом и выбором шага кликом,
- decision-поток для пользователя в формате `accept/decline`.

Продолжай разработку, не нарушая перечисленных правил и UX-поведения.
