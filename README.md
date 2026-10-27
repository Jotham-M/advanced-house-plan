# Planform — House planner

A lightweight, browser-based house-plan sketcher. It runs locally with plain HTML, CSS, and JavaScript; no build step or external service is required.

## Run

Open `index.html` in a current desktop or mobile browser. Plans are automatically saved in that browser's local storage.

## Features

- Generate modern urban or rural/country room layouts from a target per-floor area, bedroom count, and bathroom count. Urban layouts use a compact footprint and open-plan living/dining space; rural layouts include a veranda.
- Create multi-storey homes or apartment-building concepts with up to 30 storeys. Select individual floors for 2D editing; the 3D isometric and front/side elevations show the full building.
- Add flat, gable, or hip roofs to the isometric model and front/side elevations. Automatic mode chooses flat roofs for urban and tall-building designs and gable roofs for rural homes.
- Draw walls and rooms on a snap grid; add labels, doors, and windows; rename rooms by double-clicking; erase individual drawing items.
- View the same room geometry as a 2D plan, top view, front/side elevations, and an isometric 3D projection with the selected roof.
- Undo and redo edits with the toolbar or Ctrl/Cmd+Z and Ctrl/Cmd+Y.
- Zoom and fit the drawing; print the current view or export a styled SVG.
- Download and reopen JSON project backups; edits are also saved automatically in the current browser.
- View conceptual floor-area, wall-length, brick, and concrete estimates.

## Notes

Generated plans are conceptual arrangements for early visualization. Storeys repeat the generated floor layout as a starting point and can be edited independently. Material quantities are rough estimates, and the app does not check building codes, structure, accessibility, utilities, site conditions, or permit requirements. Plans must be reviewed by qualified local professionals before construction.

Local browser storage is specific to the browser and device. Use **Save** to download a portable JSON backup.
