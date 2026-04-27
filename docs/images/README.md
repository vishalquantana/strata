# Screenshots

The README references these images. Drop PNGs here with the matching names:

| File | Captures |
|---|---|
| `01-main.png` | The main treemap view (used as the README header). 1280×800 ish. |
| `02-welcome.png` | Welcome screen with the preset folder grid (Macintosh HD, Home, Documents, Downloads, Desktop, Library, Custom). |
| `03-scanning.png` | A scan in progress: ring + path + counters at the top, **Top folders** colored bar, **Biggest files found** list with the folder-icon reveal button, phase timeline at the bottom. |
| `04-treemap.png` | Treemap fully rendered, ideally drilled into a folder one or two levels deep. |
| `05-details.png` | Right-side details panel showing Reveal in Finder / Move to Trash. |

## How to capture

- **Window screenshot:** ⌘⇧4 then Space, click the Strata window. Saves to Desktop by default; rename and move into this folder.
- **Full screen:** ⌘⇧3.
- For the scanning screen, start a scan on `~/Downloads` or `/` and grab the screenshot during the Pass-2 phase when the snapshot list is populated (5-30 s in).

After dropping the files, commit:

```bash
git add docs/images/*.png
git commit -m "docs: add README screenshots"
git push
```
