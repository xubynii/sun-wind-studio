# Sun & Wind Studio

Sun, wind, daylight, natural-ventilation and energy studies on a supertall tower in Vancouver, in two phases:

- **Massing** — site impact: new shadow on neighbours and plazas, sunlight taken from neighbours, direct sun per face, pedestrian wind comfort, downwash, wind with height, and a form-only massing efficiency rating.
- **Design development** — façade zones (window size, glass, shading devices, PV, operable openings), daylight against LEED v4.1 EQ Daylight (sDA proxy, ASE), natural ventilation against ASHRAE 62.1 / CIBSE AM10 / ASHRAE 55 adaptive, floor-plan views of sun, daylight factor, annual sun exposure and air paths, and a monthly energy model (TEUI, TEDI, GHGI against Vancouver targets).

Upload a Rhino `.3dm` (or `.obj` / `.json`) massing or generate one; results are indicative early-design readings, not compliance analyses.

## Run locally

The page loads three.js and jsPDF from cdnjs and the Rhino importer fetches a WebAssembly file, so serve the folder rather than opening `index.html` from disk:

```
python -m http.server 8000
```

then open http://localhost:8000/. PDF downloads use the claude.ai artifact runtime and are inert when served locally.

## Files

| File | Role |
| --- | --- |
| `index.html` | page, styles and layout |
| `core.js` | massing engine, 3D viewport, site model, floor slicing (shared with the Supertall Massing Lab) |
| `study.js` | sun, shadow, façade zones, daylight, wind, ventilation, floor plans, review panel, report builder |
| `energy.js` | massing efficiency and the monthly energy model |
| `io.js` | Rhino / OBJ / JSON import with layer roles |
| `climate.js` | Vancouver climate normals |
| `report.js` | PDF reports (jsPDF) |
| `site.json`, `rhino3dm.*` | downtown Vancouver site model and the Rhino loader |
