/**
 * Colour schemes offered by the symbology widget.
 *
 * These are not eyeballed. Every scheme below was checked with the data-viz
 * validator against the map's own dark surface (#1a1a19) before being listed,
 * and the results are recorded per scheme so the next person doesn't have to
 * re-derive them. Two rules come out of that and are enforced in code:
 *
 *  - CATEGORICAL hues are assigned in fixed slot order and never cycled. Past
 *    the last slot, values fold into "Other" rather than repeating a hue --
 *    a repeated colour means two categories are indistinguishable on the map.
 *    Only the first three slots clear the all-pairs colour-blindness floor,
 *    which is why the widget always shows a labelled swatch beside every
 *    class: the label is what makes four or more legal.
 *
 *  - SEQUENTIAL ramps are one hue, light to dark, and stop short of the very
 *    dark steps. A step darker than roughly #256abf disappears into dark
 *    satellite imagery, so the ramps here are trimmed to stay visible on the
 *    basemap rather than running the full range.
 *
 * Users can still recolour any individual class by hand; these are the
 * starting points.
 */

// Fixed slot order. Checked dark on #1a1a19: adjacent pairs clear the CVD and
// normal-vision floors; all-pairs clears through slot 3.
const CATEGORICAL_SLOTS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
];

// Beyond this many categories the map stops being readable by colour, so the
// widget folds the remainder into a single "Other" class.
export const MAX_UNIQUE_CLASSES = CATEGORICAL_SLOTS.length;

// The number of categories that survive the strictest (all-pairs) check.
// Past this the labelled swatch list carries the identity, not the hue alone.
export const CVD_SAFE_UNIQUE_CLASSES = 3;

export const CATEGORICAL_SCHEMES = [
  { id: "default", name: "Colorblind-safe", colors: CATEGORICAL_SLOTS },
];

// Single-hue ramps, light -> dark. Both pass the ordinal checks on #1a1a19:
// monotone lightness, visible step gaps, and a dark end that still clears the
// surface (blue 3.23:1).
export const SEQUENTIAL_SCHEMES = [
  { id: "blue", name: "Blues", colors: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf"] },
  { id: "orange", name: "Oranges", colors: ["#fbe0cd", "#f6bf9c", "#ef9d6b", "#e57c3f", "#c25f22"] },
];

// Deliberately no diverging scheme: its neutral midpoint has to read as
// "nothing", and every neutral that does so on a dark basemap is either
// invisible (1.48:1 for the standard gray) or bright enough to read as a real
// value. Add one only with a validated midpoint.

export const DEFAULT_SIMPLE_COLOR = "#3987e5";
export const DEFAULT_OTHER_COLOR = "#8a8a86";

/**
 * Picks `count` colours out of a scheme.
 *
 * Categorical takes the first `count` slots in order -- never cycled, because
 * two categories sharing a hue are worse than one folded into "Other".
 * Sequential resamples the ramp so N classes span its full range evenly.
 */
export function sampleScheme(scheme, count, { reverse = false } = {}) {
  if (!scheme || count <= 0) return [];
  const { colors } = scheme;
  const isCategorical = CATEGORICAL_SCHEMES.some((s) => s.id === scheme.id);

  let out;
  if (isCategorical) {
    out = colors.slice(0, count);
  } else if (count === 1) {
    out = [colors[colors.length - 1]];
  } else {
    // Even spread across the ramp, endpoints included.
    out = Array.from({ length: count }, (_, i) =>
      colors[Math.round((i * (colors.length - 1)) / (count - 1))]
    );
  }
  return reverse ? [...out].reverse() : out;
}

export function findScheme(id) {
  return (
    CATEGORICAL_SCHEMES.find((s) => s.id === id) ||
    SEQUENTIAL_SCHEMES.find((s) => s.id === id) ||
    null
  );
}
