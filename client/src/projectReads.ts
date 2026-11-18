export function createProjectReads(ttl = 20_000) {
  const cache = new Map<string, { response: Promise<Response>; expires: number }>();
  return {
    clear: () => cache.clear(),
    async read(url: string, load: () => Promise<Response>) {
      const existing = cache.get(url);
      if (existing && existing.expires > Date.now()) return (await existing.response).clone();

      const entry = { response: Promise.resolve().then(load), expires: Date.now() + ttl };
      cache.set(url, entry);
      try {
        const response = await entry.response;
        if (!response.ok && cache.get(url) === entry) cache.delete(url);
        return response.clone();
      } catch (cause) {
        if (cache.get(url) === entry) cache.delete(url);
        throw cause;
      }
    },
  };
}
