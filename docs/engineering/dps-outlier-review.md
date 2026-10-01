# Review: very large distance-per-stroke estimates

Completed 2026-10-01 for the Next item asking to review reported values around 55 m/stroke. This is a diagnosis and filtering recommendation; runtime DPS eligibility has not changed. Source FIT/ZIP bytes, stored records and original stroke totals remain unchanged.

## Finding

The current chart divides distance travelled over the trailing 30 seconds by cadence integrated over the same supported seconds. Zero cadence contributes distance but no estimated strokes. A tiny positive denominator can therefore produce an enormous ratio even at modest speed and with 100% channel coverage. Coverage checks sample availability, not stroke-count adequacy. A denominator such as 0.3 is a cadence-integral estimate, not an observed fraction of a physical stroke.

The reported class of outlier was reproduced through a read-only audit of the existing `local` tenant. Private per-session results and candidate-policy sensitivity remain in the ignored local artifact `data/storage/dps-outlier-review-2026-10-01.json`; they are not fixtures or public repository data. This audit does not cover other tenants or independently validate actual paddle strokes.

The calculation matches the documented estimand. It does not establish that the GPS or cadence readings are erroneous: drift, gliding, cadence detection delay and missed strokes can all produce this pattern. The immediate weakness is displaying a small-denominator ratio as a useful stroke-distance estimate.

## Reproduce without private data

Run `node scripts/review-dps-outliers.mjs`. The synthetic examples use full one-second support:

| Scenario | Distance | Integrated strokes | Current displayed DPS |
|---|---:|---:|---:|
| 30 seconds at 2 m/s and 30 spm | 60 m | 15 | 4 m/stroke |
| 30 seconds at 0.5 m/s; zero cadence for 29 seconds, then 18 spm for one second | 15 m | 0.3 | 50 m/stroke |
| Same movement with all-zero cadence | 15 m | 0 | Unavailable |
| Same movement with missing cadence | Unavailable | Unavailable | Unavailable |
| Same movement with continuous 1 spm | 15 m | 0.5 | 30 m/stroke |

The last case shows why requiring a positive current cadence alone is insufficient. A 100% coverage gate also admits it. Lengthening the averaging window delays the problem and mixes more activity; it does not directly measure denominator support.

## Recommended next implementation

1. **Introduce a minimum estimated-stroke support gate for displayed short-window DPS.** Start evaluation with **3 integrated strokes**, retaining the existing 90% chart coverage rule. Below that, return a null displayed value and a reason such as `insufficient_estimated_strokes`; preserve the raw ratio, distance, integrated strokes and coverage in detailed evidence. This is a provisional display-stability threshold, not a validated count or a physiological limit. The local sensitivity check found it removed the extreme short-window tail with less loss of available values than stronger gates; this is retrospective evidence, not a universal guarantee.
2. **Expose positive-cadence duration and zero-cadence distance as support information.** Optionally assess a positive-cadence fraction gate (for example, 50% of matched seconds). It would suppress more glide-dominated windows, including some useful intermittent paddling. Do not silently adopt 80–100% positive cadence: that materially changes the eligible activity. Keep the ratio's distance and stroke support matched.
3. **Separate data rejection from weak support.** Existing null endpoints, timestamp/gap/pause rules, distance resets and the 8 m/s distance-jump guard already exclude obvious unsupported edges. Recorded speed's 0–6 m/s sanity filter is channel-specific and is not applied to distance/cadence DPS. Add an explicit inconsistency flag for review if recorded and distance-implied speeds disagree; do not automatically label all displacement with zero recorded speed as a GPS error. Validate any new cross-channel threshold before rejection.
4. **Keep scopes explicit.** Apply the support diagnostic to custom/selected intervals and the chart, not just a rendering cap. Whole-session matched DPS and FIT distance/total-strokes DPS are separate estimands; retain their input totals and source. A display gate must reach UI details and model evidence consistently and must not erase underlying measurements or change speed/HR/cadence calculations as a side effect.

Do not cap every value at an arbitrary number of metres, silently replace it with a median, remove zero-cadence distance from the existing ratio, or change cadence multipliers/fractional fields. Those approaches can hide evidence or change the quantity being measured. A separate paddling-only estimate would need its own name, support and authorization under the suspended metrics plan.

## Acceptance checks for a filter

Use synthetic cases at either side of the estimated-stroke threshold, unequal sampling intervals, fractional boundary clipping, glide-to-paddle and paddle-to-glide transitions, true zero distance, all-zero versus missing cadence, rejected distance jumps, pauses and long gaps. Preserve nulls and original totals. Show reasons in existing details without adding a permanent UI row. Verify chart/interval/model agreement, current-method cache invalidation, and desktop/phone keyboard flows. Compare lost coverage and remaining outliers across independently reviewed sessions before describing a threshold as validated.

The reproducible diagnostic passes with current code. Existing regression tests cover matched support, zero/missing channels, pauses and gaps; no new filter has been released by this review.
