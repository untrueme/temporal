import { buildApi } from '../../src/api.js';
import { startWorker } from '../../src/worker.js';

export async function startRuntime() {
  const api = await buildApi();
  const apiUrl = await api.listen({ port: 0, host: '127.0.0.1' });

  // В тестах направляем activities обратно в тот же API-процесс.
  process.env.APP_URL = `${apiUrl}/handlers`;
  process.env.SD_APP_URL = `${apiUrl}/sd`;
  process.env.TRIP_APP_URL = `${apiUrl}/trip`;

  const { worker, runPromise } = await startWorker();

  return {
    api,
    apiUrl,
    worker,
    runPromise,
  };
}

export async function stopRuntime(runtime) {
  if (!runtime) return;
  await runtime.worker.shutdown();
  await runtime.runPromise;
  await runtime.api.close();
}

export async function poll(fn, { timeoutMs = 5000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (lastError) throw lastError;
  throw new Error('poll timeout');
}
