# Бизнес-процесс: согласование кандидата (Temporal + Fastify)

## Цель процесса
Процесс автоматизирует согласование кандидата на трудоустройство:
- рекрутерский этап,
- параллельные пред-проверки финансов и безопасности через дочерние workflow,
- согласования профильных функций,
- финальное решение и публикация оффера.

Процесс реализован как JSON DAG в `jsonDAGWorkflow` и запускается через API `POST /workflows/doc/start`.

## Участники и роли
- Рекрутеры: принимают первичное решение по кандидату (2 из 3).
- Финансисты: проверяют бюджет и компенсацию.
- Служба безопасности: проверяет риски.
- Директора: дают финальное управленческое согласование.
- Комитет по компенсациям: включается динамически при высоком окладе.

## Текущий маршрут (что именно мы организовали)
1. `candidate.intake`  
`handler.http`: регистрация и нормализация карточки кандидата.

2. `recruiter.approval`  
`approval.kofn` (2 из 3, `required=true`) + inline gate (`gate.recruiter.score`).

3. `finance.precheck`  
`child.start`: запускается child workflow `candidateFinanceCheck`.

4. `security.precheck`  
`child.start`: запускается child workflow `candidateSecurityCheck`.

5. `finance.approval`  
`approval.kofn` (1 из 2, `required=true`) + inline gate (`gate.finance.score`).

6. `security.approval`  
`approval.kofn` (1 из 2, `required=true`).

7. `director.approval`  
`approval.kofn` (1 из 2, `required=true`) после финансов и безопасности.

8. `comp.committee`  
`approval.kofn` (1 из 2, `required=true`), включается только при:
- `vars.requested_salary >= 150`
- `vars.finance_gate_status == PASS`

9. `notify`  
`handler.http`: финальное решение и публикация оффера.

## Ключевые правила процесса
1. Любой `decline` на обязательном шаге (`required=true`) завершает весь процесс со статусом `rejected`.
2. Для `decline` обязателен комментарий причины (`comment`).
3. `child.start` блокирует переход дальше до полного завершения дочернего workflow.
4. Dynamic step: `comp.committee` активируется при `cost >= 150`, иначе шаг `skipped`.
5. Gate-проверка внутри approval:
- если gate не пройден и шаг обязательный, процесс отклоняется.
6. `pre`-hook с `precheck` больше не является "автозавершением":
- если `precheck.validation != ok` или `actorAllowed=false` или `lockAcquired=false`, шаг падает.
7. Каждый шаг публикует собственные параметры в `vars` и `vars.steps.*` для следующих шагов.

## Детально: что делает `gate.recruiter.score`
`gate.recruiter.score` вызывается внутри шага `recruiter.approval` после достижения `k=2` по рекрутерам.

Вход:
- `stage` = `recruiter`
- `cost` = `vars.requested_salary`
- `approvalsRequired` = `2`
- `seniorityScore` = `vars.intake_score`

Расчет (демо-формула):
- `threshold` для recruiter = `66`
- `score = round(88 - cost/7 + approvalsRequired*5 + seniorityScore/10)`
- `status = PASS`, если `score >= threshold`, иначе `FAIL`

Выход (`result.data.gate`):
- `stage`
- `score`
- `threshold`
- `status`
- `approvalsRequired`
- `cost`
- `reason`

Если `status=FAIL` и шаг обязательный, весь workflow завершится `rejected`.

## Детально: как работают `precheck`
`precheck` отрабатывает в `pre`-hook каждого шага.

Поля, которые анализируются workflow-движком:
- `precheck.validation` (должно быть `ok`)
- `precheck.actorAllowed` (должно быть `true`)
- `precheck.lockAcquired` (должно быть `true`)

Если одно из условий не выполняется, шаг падает с ошибкой `precheck rejected`, и процесс переводится в `failed` (или `rejected`, если это последствие бизнес-решения).

`precheck` в handlers сейчас возвращает осмысленные проверки:
- `candidate_profile`: заполненность профиля кандидата
- `recruiter_gate`: лимит рекрутера по окладу
- `finance_precheck`: оценка финансовой реализуемости
- `security_precheck`: оценка риск-тега
- `final_gate`, `compensation_committee`, `publish_acl`: валидация финальных политик

## Параметры шага -> параметры следующих шагов
Сейчас включены 2 механизма:

1. `setVars` на каждом узле  
Шаг записывает выбранные поля в `vars.<key>`, которые читают следующие шаги.

2. Автоматический snapshot шага  
Каждый шаг сохраняется в:
- `state.stepParams[nodeId]`
- `vars.steps.<sanitized_node_id>`

Пример: для `finance.precheck` доступно:
- `vars.finance_precheck_validation`
- `vars.finance_affordability_score`
- `vars.finance_child_workflow_id`
- `vars.steps.finance_precheck.result.childWorkflowId`

### Примеры зависимости следующих шагов от параметров
- `finance.approval.guard` зависит от `vars.finance_precheck_validation == ok`
- `security.approval.guard` зависит от `vars.security_precheck_validation == ok`
- `comp.committee.guard` зависит от:
  - `vars.requested_salary >= 150`
  - `vars.finance_gate_status == PASS`
- `notify.pre.payload` получает:
  - `vars.candidate_name`
  - `vars.requested_salary`
  - `vars.director_approval_outcome`

## Что проверяется в процессе
1. Корректность переходов по DAG зависимостям (`after`).
2. Условия guard (`cost >= 150`) и динамическая активация шага.
3. Уникальность голосов акторов на approval-шаге.
4. Наличие обязательного комментария при отклонении.
5. Результат gate-операций (`PASS`/`FAIL`) как часть бизнес-решения.
6. Полное завершение child workflows перед продолжением.
7. Корректная финализация процесса (`completed`/`rejected`/`failed`).
8. Корректное сохранение параметров в `vars` и `vars.steps.*`.
9. Корректное падение шага при неуспешном `precheck`.

## API для проверки
- Старт процесса: `POST /workflows/doc/start`
- Согласование шага: `POST /workflows/doc/:id/approval`
- Изменение данных документа: `POST /workflows/doc/:id/event` (`DOC_UPDATE`)
- Запрос состояния: `GET /workflows/doc/:id/progress`
- Список запусков: `GET /workflows/doc/list`

## Набор кейсов и ожидаемое поведение
| Кейc | Что делаем | Ожидаемый результат | Как проверить |
| --- | --- | --- | --- |
| C1 Happy path (cost < 150) | Проходим все обязательные этапы, без отказов | `comp.committee` -> `skipped`, `notify` -> `done`, статус `completed` | `GET /progress`, UI graph |
| C2 Happy path (cost >= 150) | Проходим все этапы, включая комитет | `comp.committee` -> `done`, `notify` -> `done`, статус `completed` | `GET /progress`, UI graph |
| C3 Decline на рекрутерах | Отправляем `decline` в `recruiter.approval` | Процесс сразу `rejected`, остальные pending шаги становятся skipped | `GET /progress`, статус workflow |
| C4 Decline без comment | Отправляем `decline` без комментария | API возвращает `400` | HTTP ответ `POST /approval` |
| C5 Gate fail на рекрутерах | Gate возвращает `FAIL` | Процесс `rejected` | `nodes.recruiter.approval.result.gate` |
| C6 Child workflows запущены | После рекрутеров запускаем процесс | В state видны `childWorkflowId` в `finance.precheck` и `security.precheck` | `GET /progress`, левое дерево в UI |
| C7 Блокировка до child completion | Идем дальше сразу после рекрутеров | `finance.approval`/`security.approval` не стартуют до done child шагов | `GET /progress` |
| C8 Dynamic step toggle | Меняем `cost` через `DOC_UPDATE` | При переходе через порог шаг `comp.committee` активируется/деактивируется корректно | `POST /event` + `GET /progress` |
| C9 Actor uniqueness | Один и тот же актер голосует повторно | Повторный голос не должен влиять как новый approve | `approvals[nodeId].approvedActors` |
| C10 Visibility/UI tree | Запускаем процесс с child | В левой панели workflow отображаются дочерние execution в древе | UI `/ui/doc` |

## Как проверить вручную (быстрый сценарий)
1. Запустить `worker` и `api`.
2. Открыть `/ui/doc`.
3. Запустить процесс кандидата.
4. Пройти `Согласование рекрутеров` двумя разными участниками.
5. Нажать `Обновить прогресс`, убедиться что появились дочерние workflow.
6. Пройти финансы, безопасность, директора.
7. Проверить:
- при `cost < 150`: комитет пропущен,
- при `cost >= 150`: комитет обязателен.
8. Отправить `decline` с комментарием на обязательном шаге и проверить мгновенный `rejected`.

## Рекомендуемые дополнительные параметры (имеет смысл добавить)
Ниже параметры, которые усилят процесс и сделают его более управляемым.

### SLA и эскалации
- `approvalSlaMs`: дедлайн согласования шага.
- `slaAction`: что делать по SLA (`escalate`/`reject`/`notify`).
- `slaRequired`: обязателен ли SLA для шага.
- `escalationHandler`: endpoint действия эскалации.

### Политики и риск
- `riskLevel`: уровень риска кандидата.
- `maxCompensation`: лимит компенсации.
- `budgetCenter`: центр затрат.
- `legalEntity`: юрлицо найма.

### Управление ролями
- `membersByRole`: динамический состав участников по ролям.
- `delegation`: правила делегирования согласований.
- `quorumPolicy`: отдельная политика кворума (кроме `k`).

### Надежность исполнения
- `childTimeoutMs`: таймаут на child workflow.
- `retryPolicy`: настраиваемые retry activity/hook/gate.
- `onHookFailure`: поведение при ошибке `pre/post` (`fail`/`warn`).

## Пример расширенного блока SLA для approval (предложение)
```json
{
  "id": "finance.approval",
  "type": "approval.kofn",
  "members": ["Финансист 1", "Финансист 2"],
  "k": 1,
  "required": true,
  "approvalSlaMs": 300000,
  "slaAction": "reject",
  "escalationHandler": {
    "app": "doc",
    "action": "candidate.sla.escalate",
    "payload": { "step": "finance.approval" }
  }
}
```

## Где это реализовано в коде
- Маршрут и UI-поведение: `src/ui/assets/doc-app.js`
- Исполнение DAG и approval/gate: `src/workflows/jsonDAGWorkflow.js`
- Child workflows: `src/workflows/childWorkflows.js`
- API endpoints: `src/api.js`
- Реализация `gate.*` и `precheck`: `src/handlersRoutes.js`
- HTTP activities: `src/activities/http.js`
