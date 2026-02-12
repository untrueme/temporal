import 'dotenv/config';
import Fastify from 'fastify';
import { fileURLToPath } from 'url';
import { registerHandlersRoutes } from './handlersRoutes.js';

// Это базовый порт handlers-приложения по умолчанию.
const DEFAULT_HANDLERS_PORT = 4001;
// Это хост, на котором слушает HTTP-сервер внутри контейнера/локально.
const DEFAULT_HOST = '0.0.0.0';
// Это ограничение, до какого порта мы пробуем подняться при конфликте.
const MAX_PORT_ATTEMPTS = 20;

export async function buildHandlersApp() {
  // Создаем экземпляр Fastify с включенными логами.
  const app = Fastify({ logger: true });
  // Регистрируем shared handlers endpoint-ы (doc/sd/trip).
  registerHandlersRoutes(app);

  // Возвращаем собранный Fastify app.
  return app;
}

// Эта функция поднимает handlers app и при занятом порте пробует следующий.
async function listenWithPortFallback(app, startPort, host = DEFAULT_HOST) {
  // Преобразуем стартовый порт к числу.
  const firstPort = Number(startPort);
  // Валидируем числовое значение порта.
  if (!Number.isFinite(firstPort) || firstPort <= 0) {
    // Если порт неверный, прерываем запуск.
    throw new Error(`Invalid HANDLERS_PORT: ${startPort}`);
  }

  // Пробуем ограниченное количество последовательных портов.
  for (let offset = 0; offset <= MAX_PORT_ATTEMPTS; offset += 1) {
    // Текущий кандидат порта.
    const port = firstPort + offset;
    try {
      // Пытаемся поднять HTTP сервер.
      await app.listen({ port, host });
      // Логируем фактический порт запуска.
      app.log.info({ port, host }, 'Handlers app started');

      // Если поднялись не на стартовом порту, подсказываем env для API.
      if (port !== firstPort) {
        app.log.warn(
          {
            port,
            hint:
              `Start API with APP_URL=http://localhost:${port}/handlers ` +
              `SD_APP_URL=http://localhost:${port}/sd TRIP_APP_URL=http://localhost:${port}/trip`,
          },
          'Default port was busy, handlers app started on another port'
        );
      }

      // Возвращаем порт успешного запуска.
      return port;
    } catch (error) {
      // Если ошибка не EADDRINUSE, пробрасываем ее как критическую.
      if (error?.code !== 'EADDRINUSE') {
        throw error;
      }
      // Логируем конфликт порта и продолжаем попытки.
      app.log.warn({ port }, 'Port is busy, trying next port');
    }
  }

  // Если все попытки исчерпаны, завершаем ошибкой.
  throw new Error(
    `Unable to start handlers app: ports ${firstPort}-${firstPort + MAX_PORT_ATTEMPTS} are busy`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Собираем Fastify приложение.
  const app = await buildHandlersApp();
  // Берем желаемый порт из env или используем дефолт.
  const port = Number(process.env.HANDLERS_PORT || DEFAULT_HANDLERS_PORT);
  // Поднимаем сервер с fallback на следующий свободный порт.
  await listenWithPortFallback(app, port, DEFAULT_HOST);
}
