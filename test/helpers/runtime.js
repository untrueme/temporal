import { buildHandlersApp } from '../../src/handlersApp.js';
import { buildApi } from '../../src/api.js';
import { startWorker } from '../../src/worker.js';

export async function startRuntime() {
  const handlersApp = await buildHandlersApp();
  const handlersUrl = await handlersApp.listen({ port: 0, host: '127.0.0.1' });

  process.env.APP_URL = `${handlersUrl}/handlers`;
  process.env.SD_APP_URL = `${handlersUrl}/sd`;
  process.env.TRIP_APP_URL = `${handlersUrl}/trip`;

  const api = await buildApi();
  const apiUrl = await api.listen({ port: 0, host: '127.0.0.1' });

  const { worker, runPromise } = await startWorker();

  return {
    handlersApp,
    handlersUrl,
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
  await runtime.handlersApp.close();
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
