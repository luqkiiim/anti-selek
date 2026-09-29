# Enamel achievement pins

All 11 achievement families now use PNG artwork. First Serve is a single milestone; the other ten achievements have bronze, silver, and gold variants: Back in Business, A Familiar Face, Mix It Up, Finding Your Rhythm, On the Board, Down to the Wire, Clean Sweep, Raising the Bar, Good Together, and Making It Happen.

The six families that previously used SVG artwork now have tiered PNGs at their native 1254 × 1254 resolution: On the Board, Down to the Wire, Clean Sweep, Raising the Bar, Good Together, and Making It Happen. Their older SVG files remain in this directory for compatibility; the shared `BadgeIcon` component now selects PNGs for all families.

Most PNGs are 1254 × 1254. A Familiar Face and Finding Your Rhythm use 640 × 640 artwork. The legacy bronze Back in Business and Mix It Up PNGs have opaque white backgrounds; the badge style retains multiply blending so those exports remain usable on light surfaces.

Files are named by achievement ID and tier; First Serve has no tier suffix. `BadgeIcon` selects the earned tier, uses the bronze image in a muted style for locked badges, and provides responsive 72 px or 96 px image size hints. PNGs are served through Next Image at quality 90. Achievement calculations and unlock rules are unchanged.
