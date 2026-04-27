import { createSignal } from "solid-js";

const [selectedId, setSelectedId] = createSignal<number | null>(null);

export function selectionStore() {
  return {
    selectedId,
    select(id: number | null) { setSelectedId(id); },
  };
}
