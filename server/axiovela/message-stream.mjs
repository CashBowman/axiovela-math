// One cumulative UI snapshot, assembled from ordered provider message IDs.
export function messageStream() {
  const items = new Map();
  return {
    delta(id, text) {
      items.set(id, (items.get(id) || "") + (text || ""));
      return this.text();
    },
    complete(id, text) {
      if (text) items.set(id, text);
      return this.text();
    },
    text() {
      return [...items.values()].filter(Boolean).join("\n\n");
    },
  };
}
