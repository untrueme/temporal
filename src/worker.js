import { Worker, NativeConnection } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { TASK_QUEUE, TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE } from './config.js';
import { callHttpHandler } from './activities/http.js';

// Создает и запускает Temporal worker в текущем процессе.
export async function startWorker() {
  // Путь к bundle-файлу с экспортами workflow-функций.
  const workflowsPath = fileURLToPath(new URL('./workflows/index.js', import.meta.url));
  // Подключение к Temporal Frontend.
  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

  // Сборка worker с очередью, namespace и набором activities.
  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath,
    activities: {
      callHttpHandler,
    },
  });

  // Запускаем event loop worker-а.
  const runPromise = worker.run();
  // Возвращаем и инстанс, и Promise его жизненного цикла.
  return { worker, runPromise };
}

// CLI-режим: запуск worker как отдельного процесса.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { runPromise } = await startWorker();
  await runPromise;
}
