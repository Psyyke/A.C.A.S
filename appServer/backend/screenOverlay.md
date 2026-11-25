# Screen overlay protocol

The existing loopback WebSocket accepts `screenOverlay` snapshots. Replies use
`{type:"screenOverlayStatus",msg:{supported,message,instanceId?,error?}}`.
Request capabilities with `{type:"screenOverlayCapabilities"}` only when overlay
support is needed. The capability response includes `offsets: true` when physical
pixel offsets are supported. Connections receive no unsolicited overlay status, preserving
legacy engine-list ordering. Animation `start` is Unix wall-clock milliseconds.
Shape IDs are stable within each connection and instance, and shape array order
is SVG back-to-front order within the markings and text layers. Text always renders above
arrows and square highlights, even when those arrive later.
Hidden snapshots hide without discarding the last
rendered shapes. Disconnects and two seconds without a snapshot destroy windows.

Snapshots use the existing 512 KiB WebSocket frame limit and permit 8192 shapes, eight animations
per shape, 16 keyframes per animation, and 16 concurrent windows. Shapes are
`arrow`, `rectangle`, or `text` on boards up to 69 by 69. File coordinates use
BoardDrawer's `String.fromCharCode(96 + file)` convention. Geometry must be
finite and the board must lie within the reported viewport. Only drawing
configuration and safe CSS properties/values are accepted; URLs, arbitrary CSS
and other content are never passed to the renderer. Unsupported shape types,
configuration/style fields and animation fields/options reject the snapshot
with an explicit status error instead of being silently dropped. Invalid snapshots hide/remove the
affected overlay. Text is inserted as text, not markup.
Optional shape-level `ariaLabel` and `title` are strings limited to 1024 characters
each. They are applied using SVG `aria-label` and a `title` child with `textContent`,
never markup. Stable IDs can be reused after a board replacement: changed
type/configuration/positions replace the old element.
Snapshots exceeding rendering limits receive an explicit status error. Frames
over the transport limit are rejected by WebSocket with close code 1009 before
the application can read the snapshot.

Chromium placement estimates the viewport origin from outer and inner sizes,
accounting for the different zoom behavior of outer-window and DOM coordinates;
Firefox uses `mozInnerScreenX/Y`. CSS coordinates are converted using reported
DPR and Electron display scaling. Mixed-DPI, browser zoom, unusual window
decorations, fullscreen, and boards crossing displays are best effort.
Optional `offset: {x, y}` values are whole physical pixels from -1000 to 1000.
Positive values move the overlay right and down. Values are converted to display
coordinates and rounded, so scaled displays can have a fraction of a pixel error.
Native Wayland is unsupported. Wayland sessions are conservatively rejected
unless Electron is explicitly started with the X11 ozone platform or hint.
The packaged and development renderers use the same
`userscript-components/UniversalBoardDrawer.js` source.

The local server defaults to software rendering for its Electron windows on all
platforms. You can enable GPU acceleration in local server settings and restart
the server to apply it. Electron cannot select this per window, so it affects
both the overlay and the control window. It does not affect the browser,
separately launched engines or the native AI server.

Software rendering is a workaround for intermittent dark external drawings.
GPU compositing is a possible cause, but this has not been confirmed on an
affected machine. A passing screenshot check alone cannot confirm the fix,
especially when opening a screenshot tool makes the issue disappear.

## Verification

`tests/screen-overlay-fixture.mjs` executes the current userscript drawer and
render lifecycle, Interface move/drop/Amazons helpers, metric text helpers and
arrow configuration. Those snapshots are validated and submitted to the actual
Electron server by the smoke test.

On Windows, run `$env:ACAS_SCREEN_OVERLAY_SMOKE='1'` followed by
`node --test tests\screen-overlay.test.mjs tests\screen-overlay-integration.test.mjs`
from the repository root. The smoke uses production startup without a test-only
rendering override. It checks default software composition, translucent arrow
and square color/alpha across repeated snapshots and hide/show cycles,
transparent background pixels, click-through configuration, real SVG content,
disconnect and stale cleanup.
It does not physically test mouse passthrough.
Set `ACAS_SCREEN_OVERLAY_GPU=1` as well to run the same check with GPU
acceleration enabled.

For an unpacked build, set `ACAS_SCREEN_OVERLAY_PACKAGED_DIR` to the fresh
`win-unpacked` directory and run `node --test tests\screen-overlay-packaged.test.mjs`.
That test compares packaged drawer bytes and verifies real producer snapshots
render through the packaged binary's WebSocket server.

Set `ACAS_SCREEN_OVERLAY_ALIGNMENT=1` and run
`node --test tests\screen-overlay-alignment.test.mjs` for the opt-in headful
Windows test. An isolated Chromium profile uses a test-only extension to set
actual browser zoom. UI Automation measures only its test board, and Win32
measures the Electron window. On the tested 100%-scaled monitor, errors at
100%, 125% and 80% browser zoom were respectively `(0,0,0,0)`,
`(0,0,0,-1)` and `(0,0,0,0)` pixels for x, y, width and height.
Other display scaling, mixed monitors, Firefox and other OS placement have not
been physically qualified.

The tested current producers retain their legitimate drawing styles. Future
types, configuration fields, CSS properties and animation options are not
automatically supported: validation deliberately uses allowlists to exclude
unsafe content. Extend the validator and focused parity tests when adding
new drawing capabilities.
