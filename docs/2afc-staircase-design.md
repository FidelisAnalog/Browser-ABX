# 2AFC Adaptive Staircase for JND — Design Notes

## Overview
Implement a 2AFC (two-alternative forced choice) test with adaptive staircase for determining JND (Just Noticeable Difference). The listener hears two stimuli and identifies which is the reference (or which is different). The staircase adjusts difficulty based on responses, converging on the listener's detection threshold.

## Decided

### Test structure
- **Two-interval presentation**: listener switches between two buttons (like existing AB tests), with full transport controls, unlimited listening, own pace
- **No inter-stimulus gap**: seamless switching maximizes sensitivity for detecting small differences. Goal is "can they detect it at all" not "can they detect it in a casual listening scenario"
- **Pre-rendered files**: config author provides a set of audio files at different quality/difference levels, ordered from most similar to reference (hardest) to most different (easiest)

### Options/levels
- **Minimum: 5 levels** (including reference)
- **Maximum: high cap** (just to prevent breakage, not a practical concern)
- **Reference is always the first option** (index 0)
- Staircase traverses levels 1 through N-1

### Staircase parameters — all configurable with defaults

| Parameter | Default | Range | Notes |
|-----------|---------|-------|-------|
| rule | 1-up/1-down | 1u1d, 1u2d, 1u3d | 1u1d = Yaniger-style, faster. 1u2d = 70.7% target. 1u3d = 79.4% target |
| reversals | 6 | 3-12 | Yaniger used 6, Klippel uses 3, academic standard is 8-12 |
| maxTrials | 30 | 15-50 | Safety cap, shouldn't normally be reached |
| initialStep | 2 | 1-N | Index positions to move during coarse phase |
| finalStep | 1 | 1-N | Index positions to move during fine phase |
| stepReductionAfter | 2 | 1-reversals | Switch from initialStep to finalStep after this many reversals |
| startLevel | max (easiest) | any valid index | Start at highest index (most different from reference) |
| interleave | false | true/false | Run 2 independent staircase tracks, randomly alternated |

### Interaction
- Same as existing AB tests: two buttons, free switching, full transport controls
- Between trials: staircase algorithm picks the next level
- Submit answer, get next trial automatically

### No interleaving by default
Interleaving (2 independent staircase tracks, randomly alternated, JND averaged across both) is supported as a config option but off by default. It roughly doubles trial count for a benefit that mainly matters in controlled lab settings, not practical self-testing.

## Research references

### Klippel listening test (klippel.de)
- Weighted up-down method (Kaernbach 1991)
- Only **3 turning points** needed for termination
- JND = **median** of the 3 turning point values (robust to outliers)
- Asymmetric steps: correct → smaller step down, incorrect → larger step up
- ~8-10 trials typical

### Yaniger "Testing One, Two, Three" (Linear Audio Vol 2)
- Paired Forced Choice: 1-up/1-down staircase
- Terminates after **6 reversals**
- ~15 trials in his op-amp buffer case study
- Threshold estimated from where the staircase oscillates
- Practical, designed for individual designers/experimenters, not lab studies

### Academic standard (Levitt 1971)
- 1-up/2-down targets 70.7% correct
- 8-12 reversals, discard first 2-4, average the rest
- 40-60 trials — too many for practical use, causes listener fatigue

### Bayesian alternative (QUEST)
- Uses ALL trial data, not just reversals — more efficient per trial
- JavaScript library exists (jsQUEST, MIT license)
- ~15 trials gives ~4-5 dB SE precision
- More complex, harder to explain to users
- Considered but not chosen — staircase is simpler and well-understood

## Open — config YAML structure
- How to specify the ordered list of levels
- How staircase parameters appear in YAML
- Which parameters are optional vs. required

## Open — results/statistics
- What to display as the JND result
- Staircase plot (delta over trials)?
- Confidence/validity indicators
- Share URL encoding
- How to compute JND from reversal values (mean vs. median)

## Open — floor/ceiling behavior
- What to report when listener can't distinguish even the most different pair
- What to report when listener nails even the most similar pair

## Open — question framing
- "Which interval contained the reference?" vs. "Which interval was different?"
- Label buttons as "1" and "2"? Or "A" and "B"?
