// Статус "doneish": узел либо выполнен, либо осознанно пропущен.
export function doneish(status) {
  return status === 'done' || status === 'skipped';
}

// Проверяет, что все зависимости узла уже в doneish-состоянии.
export function depsDone(node, stateMap) {
  const deps = node.after || [];
  return deps.every((depId) => doneish(stateMap[depId]?.status));
}

// Возвращает список узлов, готовых к запуску на текущем тике раннера.
export function readyNodes(nodes, stateMap) {
  return nodes.filter((node) => stateMap[node.id]?.status === 'pending' && depsDone(node, stateMap));
}
