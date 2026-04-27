import { Show } from "solid-js";
import VolumesSection from "./volumes-section";
import FiltersSection from "./filters-section";
import type { ScanTree } from "../types";

interface Props {
  tree: ScanTree | null;
  visible: boolean;
  onPick: () => void;
}

export default function Sidebar(props: Props) {
  return (
    <Show when={props.visible}>
      <aside style={shell}>
        <VolumesSection tree={props.tree} onPick={props.onPick} />
        <FiltersSection />
      </aside>
    </Show>
  );
}

const shell = {
  width: "200px",
  "min-width": "200px",
  background: "#0a0a0e",
  "border-right": "1px solid #1a1a22",
  display: "flex",
  "flex-direction": "column",
  overflow: "auto",
} as const;
