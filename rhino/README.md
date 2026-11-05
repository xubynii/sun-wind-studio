# Sun & Wind Link (Rhino 7 and 8)

A Rhino panel that sets up your model for Sun & Wind Studio and keeps the tool in step with it while you design. It does three things:

1. **Layers.** It creates the layers the studies read, or maps the layers you already have onto them.
2. **Check.** It looks for problems that would make the analysis wrong.
3. **Live link.** It serves the model to the tool in your browser, which re-imports it within a second or two of every change.

## Run it

| Rhino | How |
| --- | --- |
| Rhino 8 | Type `RunPythonScript` and pick `sw_link.py`. The `#! python3` line runs it in Python 3. You can also open the file in the Script Editor and press Run. |
| Rhino 7 | Type `RunPythonScript` and pick `sw_link.py`. It runs in IronPython 2.7. |

To make it a one-word command, open Options › Aliases and add an alias:

- **Alias:** `SWLink`
- **Command:** `! _-RunPythonScript "C:\Users\sinnie\OneDrive\Desktop\sun-wind-studio\rhino\sw_link.py"`

Keep `sw_link.py` in the tool's `rhino/` folder. From there it can also serve the tool itself, which is the most reliable way to connect (see below).

## 1 · Layers

**Create SW layers** adds this tree. Each layer gets its part colour from the tool.

| Layer | Sent as | Use it for |
| --- | --- | --- |
| `SW Tower` | Tower massing, parts sorted by shape | A tower you haven't split into parts |
| `SW Tower::Floor plates` | Floor plates | Slabs, one per level. They set the storeys and plate outlines. |
| `SW Tower::Ground floor` | Ground floor | The ground-floor plate. Its top sets the ground level. |
| `SW Tower::Facade` | Façade | Opaque cladding and spandrels, kept out of the solid |
| `SW Tower::Windows` | Windows | Glazing. With the façade it sets each face's window-to-wall ratio, and it sets sills and heads. |
| `SW Tower::Roof` | Roof | |
| `SW Tower::Ceilings` | Ceilings | They set the ceiling heights used by the daylight study |
| `SW Tower::Structure` | Structure | Columns and beams, kept out of the solid |
| `SW Tower::Core` | Core | It sets the core share |
| `SW Tower::Stairs` | Stairs | Kept out of the solid |
| `SW Tower::Massing volume` | Massing volume | Closed solids that make up the mass |
| `SW Shading` | Shading devices (Design development) | Fins, louvres, overhangs, canopies |
| `SW PV` | PV surfaces (Design development) | |
| `SW Context` | Site context | Neighbours, plazas, streets. Sublayers are fine. |
| `SW Terrain` | Terrain | The ground surface. The ground at the tower becomes 0 m. |

**Your own layers.** The table lists every layer that has objects. Each one gets a drop-down, and choosing a target there stores it:

- in the document (`sw.map`);
- as layer user text (`sw.target`), so a saved .3dm still carries the mapping into the tool.

Sublayers follow their parent unless you set them. **Auto-map by name** maps layers whose names make the target clear, such as `A-GLAZ` → windows, `A-SLAB` → floor plates and `Lobby` → ground floor. **Ignore** keeps a layer out for good. Unmapped layers are never sent, and the check lists them.

**Selected objects to … › Move** puts the selected objects on a Sun & Wind layer. It creates the layer if needed, and you can undo it.

## 2 · Check

**Check model** looks at exactly what will be sent:

- **Units:** everything is sent in metres. It also warns when the tower is 1000× too big or too small.
- **Unmapped layers:** layers with visible objects that won't be sent.
- **Skipped objects:** curves, text and points on sent layers.
- **Closed volumes:** tower volumes that aren't closed.
- **Floor plates:** how many levels and the typical floor-to-floor height. It warns when there are fewer than three levels or a plate is thicker than 1.5 m.
- **Ground level:** the tool reads model z = 0 as the ground. **Fix** moves every sent object so the ground floor sits at 0, as one undo step.
- **Distance from the origin.**
- **Model size:** more than 1.5 million triangles slows live updates.

Double-click a line, or press **Select objects**, to select the objects it's about.

## 3 · Live link

1. Press **Start link**. The panel serves the model at `http://127.0.0.1:8797` (you can change the port).
2. Press **Open the tool**. This opens the copy of the tool that Rhino itself serves at `http://127.0.0.1:8797/?link`, which connects on its own.
3. Model as usual. Every add, delete, move, layer change, block edit or units change is picked up. After half a second of quiet it is meshed and sent, and the tool re-imports it.

**What happens on each update:**

- Each object carries its role and part, so the tool doesn't guess from layer names, and the parts review applies without stopping you.
- The context the link sent last time is replaced, not added again.
- Where you placed the tower on the site is kept between updates. Untick this under **Live link to Rhino** in the tool's Model tab.

**Connecting from another copy of the tool.** Any copy can connect: open **Live link to Rhino** in its Model tab and press **Connect**. Browsers may block a hosted page (such as the claude.ai artifact) from reaching your own computer. If that copy can't connect, use the copy Rhino serves, or use **Export JSON…** and load the file with **Choose a .3dm file**.

**Mesh quality.** *Fast meshes* is right for flat-faced towers. *Smooth meshes* suits curved façades but makes updates heavier.

**Privacy.** The server only listens on 127.0.0.1, so nothing outside your computer can reach it. It also refuses web pages from any site other than:

- the tool's own copies (localhost, the GitHub Pages site and the claude.ai artifact);
- a copy opened from disk.

**Closing the panel stops the link.**

## What is sent

`GET /sw/rev` returns the following:

```json
{"rev": 12, "doc": "Tower.3dm", "objects": 340, "version": "1.0"}
```

`GET /sw/model` returns the following:

```json
{"swlink": "1.0", "rev": 12, "doc": "Tower.3dm", "units": "m", "sourceUnits": "Millimeters", "scale": 0.001,
 "meshes": [{"layer": "A-GLAZ", "role": "massing", "part": "window", "kind": "polysurface", "id": "…", "v": [x,y,z,…], "f": [a,b,c,…]}]}
```

- **role** is one of `massing`, `shading`, `pv`, `context` or `terrain`.
- **part** is one of `floor`, `ground`, `facade`, `window`, `roof`, `ceiling`, `structure`, `core`, `stair`, `mass`, or `null` (sort by shape).

Vertices are in metres and faces are triangles. Polysurfaces, extrusions, surfaces, meshes, SubDs and blocks (including nested blocks) are sent. Hidden objects and objects on hidden layers are not.

## Tested

Both runtimes were tested on a millimetre model with a tower on non-standard layers, a block of context buildings and a stray layer:

- Rhino 8.x (Python 3.9)
- Rhino 7 (IronPython 2.7.12)

**Steps tested:** Create layers, Auto-map, Check, Fix, Move, the server, the CORS allow and deny rules, files served intact, and a new revision on an edit (none on a rebuild with no change). The browser side was tested headless: connect, import, re-sync after an edit, a copy on another origin, and no Rhino running.
