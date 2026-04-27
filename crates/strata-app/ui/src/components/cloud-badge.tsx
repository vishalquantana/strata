import type { CloudProvider } from "../types";

/// Maps a CloudProvider to its display attributes: a single-letter glyph,
/// background colour, and full name for the tooltip. iCloud uses the cloud
/// glyph since it's the most recognisable mark; third-party providers use
/// their initial letter on a brand-coloured square.
function providerStyle(p: CloudProvider): {
  glyph: string;
  bg: string;
  fg: string;
  name: string;
} {
  switch (p) {
    case "icloud":
      return { glyph: "☁", bg: "#1d4ed8", fg: "#ffffff", name: "iCloud" };
    case "googledrive":
      return { glyph: "G", bg: "#0f9d58", fg: "#ffffff", name: "Google Drive" };
    case "onedrive":
      return { glyph: "△", bg: "#0078d4", fg: "#ffffff", name: "OneDrive" };
    case "dropbox":
      return { glyph: "▢", bg: "#0061ff", fg: "#ffffff", name: "Dropbox" };
    case "box":
      return { glyph: "B", bg: "#0061d5", fg: "#ffffff", name: "Box" };
  }
}

interface Props {
  provider: CloudProvider | null | undefined;
  dehydrated: boolean | undefined;
}

/// Tiny 22x22 badge rendered as the leftmost column of a row.
/// - Local file: faint grey dot.
/// - Provider, materialised: filled coloured square with glyph.
/// - Provider, dehydrated: outlined version + cloud glyph; tooltip explains
///   that the file takes ~0 B of local disk.
export default function CloudBadge(props: Props) {
  const provider = () => props.provider ?? null;
  const dehydrated = () => Boolean(props.dehydrated);

  const tip = () => {
    const p = provider();
    if (!p) return "Local file";
    const s = providerStyle(p);
    return dehydrated()
      ? `${s.name} · cloud-only (~0 B local)`
      : `${s.name} · stored locally`;
  };

  return (
    <span
      style={containerStyle(provider(), dehydrated())}
      title={tip()}
      aria-label={tip()}
    >
      {provider() === null ? (
        <span style={localDot} />
      ) : (
        <span>{providerStyle(provider()!).glyph}</span>
      )}
    </span>
  );
}

function containerStyle(
  p: CloudProvider | null,
  dehydrated: boolean,
): Record<string, string> {
  const base: Record<string, string> = {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    width: "22px",
    height: "22px",
    "border-radius": "5px",
    "font-size": "11px",
    "font-weight": "600",
    "font-family": "-apple-system, BlinkMacSystemFont, sans-serif",
    "flex-shrink": "0",
  };
  if (p === null) {
    base.background = "transparent";
    base.color = "#3f3f46";
    return base;
  }
  const s = providerStyle(p);
  if (dehydrated) {
    // Outlined / faded for cloud-only files. User can deprioritise these
    // since they don't consume local disk.
    base.background = "transparent";
    base.border = `1px dashed ${s.bg}`;
    base.color = s.bg;
  } else {
    base.background = s.bg;
    base.color = s.fg;
  }
  return base;
}

const localDot: Record<string, string> = {
  display: "block",
  width: "5px",
  height: "5px",
  "border-radius": "50%",
  background: "#3f3f46",
};
