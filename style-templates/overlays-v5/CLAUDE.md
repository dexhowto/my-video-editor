# Template instructions

Follow the root workspace guide and this template's DESIGN.md. Copy this template
into a video project before editing. DESIGN.md is self-contained: the markup
contract, every text slot and its copy limit, the timing conventions, the helper
APIs, and the exact verify/render commands are all written out there, so building
from this template should never require reading another video project.
Use the root HyperFrames skills. Lint, preview, and inspect rendered frames after
modifying a composition. All publishing requires the user's authorization.

This template (overlays-v5) is the overlays-project graphics-only pass (4K, transparent/alpha,
two-tier tier-1/tier-2 system) with the confirmed v3 "What We'll Cover" agenda
box-grid built in, plus the v4 `badgeDetails()` helper for evolving detail lines
on long-holding tier-2 badges, plus the v5 `chipScramble()` section-chip
decode and the v5 build-safety rules (stagger completion, seek safety, measure
once, 10-frame transition strips). Everything in `index.html` beyond the CSS system
and the `dissolveOut()` / `agendaBox()` / `badgeDetails()` / `chipScramble()` helpers is demo content: a fictional
"How to Free Up Storage on Windows 11" tutorial, written only so the template
renders as a believable video and every slot shows its realistic length and
tone. Replace all of it with the real script and retime every beat against the
project's own transcript word timestamps. Never reuse the demo copy or the demo
timestamps.

Two things this template does NOT ship and every real project must add by hand:
an `<audio id="narration" ...>` element as a sibling of `#canvas` inside `#root`
(without it the render produces no audio sidecar and the render queue stalls
after burning the full capture time), and real transcript anchors for every beat.
