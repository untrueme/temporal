// Название очереди задач Temporal, к которой слушает worker.
export const TASK_QUEUE = process.env.TASK_QUEUE || 'temportal';
// Адрес Temporal Frontend (host:port).
export const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
// Namespace Temporal, в котором создаются executions.
export const TEMPORAL_NAMESPACE = process.env.TEMPORAL_NAMESPACE || 'default';
