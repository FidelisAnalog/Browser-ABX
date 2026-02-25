# Staircase Result Interpretation — Literature & Design

## References

- Levitt, H. (1971). Transformed up-down methods in psychoacoustics. *JASA*, 49(2B), 467-477.
- Kaernbach, C. (1991). Simple adaptive testing with the weighted up-down method. *Perception & Psychophysics*, 49, 227-229.
- Leek, M.R. (2001). Adaptive procedures in psychophysical research. *Perception & Psychophysics*, 63(8), 1279-1292.
- Klippel Listening Test: http://www.klippel-listeningtest.de/?page=how
- Grassi, M. & Soranzo, A. (2009). PSYCHOACOUSTICS toolbox. *Frontiers in Psychology*, 5, 712.

## Threshold Estimation (from literature)

**Levitt 1971**: Threshold = mean of reversal levels. Alternatively, median can be used.
Discard initial reversals obtained during the coarse step-size phase.

**Kaernbach 1991**: Recommends averaging *all levels* (not just reversals) starting
from the trial after the 4th reversal. Also recommends including the "post-final level"
(the level that would have been presented next). Uses up to 16 reversals. Halves step
size after reversal 2, then again after reversal 4.

**Klippel**: Uses median of 3 turning points. That's it. Fast and simple.

**Leek 2001**: Recommends 12-16 total reversals. At least 4 with large step size,
remainder with small step size. Threshold computed from small-step reversals only.

## Standard Error

SE = SD / sqrt(N), where N = number of usable reversals and SD = standard deviation
of those reversal levels. This is standard statistics — the standard error of the mean.

SE gives the precision of the threshold estimate. A smaller SE means the reversals
were tightly clustered (good convergence). A larger SE means they were spread out
(poor convergence or too few reversals).

## Floor and Ceiling

No formal statistical test exists in the literature for floor/ceiling detection. It is
an observed condition:

- **Floor**: Staircase descended to level 1 and stayed there. All differences were
  suprathreshold. The listener's true threshold is at or below the smallest tested level.
  With 1u1d at the floor, if the listener keeps answering correctly, direction stays
  'down', no reversals accumulate, and the test runs to maxTrials.

- **Ceiling**: Staircase ascended to the maximum level and stayed there. At the ceiling,
  if the listener's responses become random (can't hear the difference), reversals
  accumulate quickly due to chance direction changes. The test terminates naturally.

Floor is the problematic case — it can stall without reversals. Ceiling self-resolves
because random responses at the boundary generate rapid reversals.

## Proposed Interpretation Criteria

Three cases, determined by floor/ceiling status and the data:

### Normal convergence (no floor/ceiling)

> "Threshold at {optionName} (level {jndLevel}). SE = {se} ({N} reversals used).
>  Differences below this level are not reliably detectable."

Report the threshold in terms of the option name so the user knows what it means
in their domain (e.g., "128kbps", "-6dB distortion"). Include SE and reversal count
as statistical context.

### Floor

> "Threshold at or below {optionName[1]} (level 1). All differences were detected.
>  SE = {se} ({N} reversals). Consider adding finer levels to resolve the threshold."

If there are no usable reversals (stall case), omit SE:

> "Threshold at or below {optionName[1]} (level 1). All differences were detected
>  across {totalTrials} trials. No reversals occurred — the threshold is below the
>  tested range. Add finer levels to resolve it."

### Ceiling

> "Threshold at or above {optionName[max]} (level {nLevels}). The listener could not
>  reliably identify the reference even at the largest difference. SE = {se}
>  ({N} reversals)."

## What We Don't Do

- No made-up heuristics (e.g., "SD > 0.5 * JND = unreliable"). The literature
  doesn't define such thresholds.
- No subjective quality labels ("good convergence", "poor convergence"). Report
  the numbers and let the reader interpret.
- SE and reversal count are always shown. They are standard metadata for evaluating
  any staircase result.

## Threshold Convergence Point vs "Reliable Detection"

The 1u1d rule converges on the 50% correct threshold — the level where the listener
is at chance for a 2AFC task. This is the JND by definition, but the interpretation
must not say the listener "can reliably detect differences" at this level. At the
convergence point they are guessing. Levels below the JND (closer to reference) yield
worse-than-chance performance; levels above (larger differences) yield better-than-chance.

The correct framing is: "Threshold at level N" — the boundary between detectable and
not detectable. Avoid implying the listener performs well at the threshold level itself.

For 1u2d (70.7%) and 1u3d (79.4%), the convergence point is above chance, so the
listener does perform above chance at the threshold. But even then, "reliably detect"
overstates it — the threshold is where performance drops to that specific percentage,
not where it is strong.

## SE as Context, Not Judgment

SE is reported alongside the result so that someone knowledgeable can assess
reliability. We don't label SE values as "good" or "bad" because the acceptable
SE depends on the application — a clinical audiometry threshold needs tighter
precision than a casual codec comparison. The numbers are there; the user decides
what they mean for their use case.
