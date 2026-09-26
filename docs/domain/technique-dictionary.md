# SUP racing technique dictionary

Version **0.1.0**, editorial draft; not yet reviewed by a SUP coach. Machine-readable source of truth: [technique-issues.json](../../data/reference/technique-issues.json).

The research informs a controlled vocabulary for selecting observations, not an automatic diagnosis engine. The issue labels, evidence requirements, confounders and lightweight practice suggestions are product synthesis. No sample session has been assigned a fault.

## Research conclusions

A useful racing-stroke review distinguishes entry, connection, propulsion, release and recovery, then considers course control, side changes and turns. Clean blade engagement is a recurring coaching priority (S1, S2). Rotation, reach and top-hand action interact; no single watch metric isolates them (S3).

Exit timing is particularly easy to oversimplify. PSUPA provides a basic feet-level exit cue, while Larry Cain discusses effective individual variations and load/release tradeoffs. Therefore the dictionary flags observed drag or lifting, not merely a blade passing the feet (S4, S5). Cadence targets must also reflect the athlete and effort rather than a universal “higher is better” rule (S4).

Racing includes maintaining momentum through turns, with footwork and paddle placement timed together (S6). GPS may locate a turn, but cannot prove a footwork mistake. Similarly, wrist HR, speed changes and cadence can motivate questions; they cannot show blade immersion, posture or a causal technique fault. That evidence boundary is our conservative product design decision.

## Selectable issues

| SUP-ENTRY-01 | entry | Air catch | Side-view video showing entry relative to the board. |
| SUP-CATCH-01 | catch | Loading before the blade is buried | Side-view video and, where available, sound at entry. |
| SUP-SETUP-01 | setup | Overreaching that disrupts connection | Side/front video over several strokes; athlete report. |
| SUP-PULL-01 | pull | Early arm-dominant pull | Side video and coach review of load sequence. |
| SUP-PULL-02 | pull | Top hand drives forward too early | Side video; watch data cannot measure blade angle. |
| SUP-PULL-03 | pull | Rotation finishes before useful loading | Side/front video with a coach or experienced observer. |
| SUP-EXIT-01 | exit | Dragging or lifting water at exit | Side video including blade and board response. |
| SUP-RECOVERY-01 | recovery | Tense recovery | Athlete report plus front/side video where available. |
| SUP-TRACK-01 | tracking | Unintended sweeping on forward strokes | Front/rear video; GPS can only suggest broad course variation. |
| SUP-BALANCE-01 | balance | Balance corrections interrupt propulsion | Video or athlete report; timed events may corroborate. |
| SUP-SWITCH-01 | switch | Delayed connection after a side change | Video with identifiable switches. |
| SUP-TURN-01 | turn | Lost momentum through a buoy turn | Video and a known buoy/turn interval. |
| SUP-RHYTHM-01 | rhythm | Unsustainable rate–load combination | Athlete report and repeated comparable intervals; video for biomechanical attribution. |
| SUP-SIDE-01 | symmetry | Side-dependent loss of connection | Side-labelled video/observations; watch cadence alone cannot label the paddling side. |

Each JSON entry also includes an observable signature, cue, practice suggestion and alternative explanations. Practice suggestions are starting points for observation, not fixed training dosage. “Unsustainable rhythm” and “side-dependent connection” are contextual review categories; the source does not establish numeric diagnostic thresholds for them.

## Observation rules

- No evidence: do not assign an issue; use an empty observations list.
- Athlete report: label `athlete_reported`, preserve the exact context.
- Watch pattern: at most `hypothesis`, cite the interval/quality and alternatives. Do not automatically generate hypotheses from speed alone.
- Video/coach observation: label `observed`, cite the evidence and affected side/interval where known. “Observed” describes behavior, not proof that it caused a performance result.
- Pain fields remain symptom reports, not technique diagnoses. Do not infer medical causes or prescribe rehabilitation.
- Prefer one selected focus when presenting an observation. Never score the athlete against all dictionary entries by default.

## Maintenance

Keep IDs stable and retire rather than reuse them. Add a new issue only with a distinct observable behavior, evidence requirement, confounders and a source/review note. Version changes in the JSON; validate all observation IDs. Obtain coach review before describing the dictionary as validated. Avoid copying branded equipment recommendations into the app.

## Sources

Read on 2026-09-25 local time. Coaching resources differ in audience and level of evidence; they inform the vocabulary rather than validate automated detection.

- **S1: [Seychelle: The Catch — Fixing Your SUP Paddle Stroke](https://blackprojectsup.com/2019/06/29/catch-sup-paddle-stroke-technique/)** — Athlete-authored catch guidance on a commercial equipment site.
- **S2: [Larry Cain: Some Useful Technique Drills for SUP](https://larrycain.blogspot.com/2013/07/some-useful-technique-drills-for-sup_20.html)** — Coach-authored entry, connection and sequencing drills.
- **S3: [Larry Cain: Maintaining Positive Blade Angle as Long as Possible](https://larrycain.blogspot.com/2015/11/big-picture-approach-to-technique-part_18.html)** — Coach-authored explanation of reach, top-hand action and rotation.
- **S4: [Larry Cain: More Thoughts on SUP Technique — Part 2](https://larrycain.blogspot.com/2015/01/more-thoughts-on-sup-technique-part-2.html)** — Coach-authored discussion of individual variation and exit timing; small illustrative comparison, not universal validation.
- **S5: [PSUPA Fundamentals manual](https://www.psupa.com/wp-content/uploads/2019/04/fundamentals-1-2019-V1.03.pdf)** — Instructional association manual, pp. 17–18 PDF pages: tracking, recovery, switching and balance; not race-specific throughout.
- **S6: [Connor Baxter: Buoy Turn Tutorial](https://www.supconnect.com/article/buoy-turn-tutorial-with-connor-baxter)** — Athlete demonstration reported by Supconnect; race-turn guidance.
