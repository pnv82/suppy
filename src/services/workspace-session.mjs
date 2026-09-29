// Host notifications identify the workspace through verified server appData.
export function createWorkspaceSession() {
  let data = null,
    generation = 0;
  const pending = new Set();
  function accept(next) {
    if (!next || (data && data.tenantId !== next.tenantId)) {
      generation++;
      for (const controller of pending) controller.abort();
      pending.clear();
    }
    data = next;
  }
  async function run(operation) {
    const current = generation,
      controller = new AbortController();
    pending.add(controller);
    try {
      const result = await operation(controller.signal);
      if (current !== generation || controller.signal.aborted)
        throw new DOMException("Workspace changed.", "AbortError");
      return result;
    } finally {
      pending.delete(controller);
    }
  }
  return {
    get data() {
      return data;
    },
    accept,
    run,
  };
}
