// Activity для вызова внешнего HTTP handler из workflow.
export async function callHttpHandler({ baseUrl, action, payload = {}, correlation = {} }) {
  // Без baseUrl вызывать нечего, поэтому сразу валидируем вход.
  if (!baseUrl) {
    throw new Error('callHttpHandler: baseUrl is required');
  }

  // Собираем конечный URL: <base>/<action>.
  const url = `${baseUrl.replace(/\/$/, '')}/${action}`;
  // Объединяем полезную нагрузку и поля корреляции.
  const body = {
    ...payload,
    ...correlation,
  };

  // Отдельно формируем сокращенную корреляцию для логов.
  const correlationInfo = {
    docId: correlation.docId,
    ticketId: correlation.ticketId,
    tripId: correlation.tripId,
    nodeId: correlation.nodeId,
  };

  // Пишем диагностический лог вызова activity.
  console.log('[activity] http', { url, ...correlationInfo });

  // Делаем POST-запрос в handlers app.
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Читаем ответ как текст (вдруг не JSON).
  const text = await res.text();
  let data;
  try {
    // Пытаемся распарсить JSON.
    data = JSON.parse(text);
  } catch {
    // Если не JSON, возвращаем raw-значение.
    data = { raw: text };
  }

  // Любой не-2xx ответ поднимаем как ошибку activity.
  if (!res.ok) {
    const error = new Error(`Handler error ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  // Возвращаем нормализованный payload.
  return {
    status: res.status,
    data,
  };
}
