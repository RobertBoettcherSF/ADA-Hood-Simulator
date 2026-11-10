/// <reference lib="webworker" />

/** Parse a world file off the main thread. The result is posted back as structured data. */
self.onmessage = (event: MessageEvent<{ text: string }>) => {
  try {
    const world: unknown = JSON.parse(event.data.text);
    self.postMessage({ world });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The world file could not be read.' });
  }
};
