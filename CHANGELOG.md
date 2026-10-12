# Change Log

## 0.3.2

- Previews follow the rest of the comma group:
  - a shape token such as `slide-up` plays with the group's `duration-*`, `delay-*`, easing, and spring tokens, and says which ones it applied;
  - a timing token's chart is followed by the group's motion with that value, so you can see what changing it does;
  - spring values in a group without `spring` are flagged as having no effect.

## 0.3.1

- Timing tokens get charts instead of a moving card, so differences are easy to see:
  - easing tokens show their progress curve over the default `ease-out` curve;
  - `duration-*` shows a millisecond bar next to the default 300ms;
  - `delay-*` splits the wait from the motion;
  - `spring`, `damping-*`, `stiffness-*`, and `mass-*` show the spring curve with its overshoot and settle time, over the default spring;
  - `play-*` shows one bar per play with the total time.
- Hovering an `animate` value with several comma groups shows a timeline with one row per group.

## 0.3.0

- Animated previews in completion details and hovers. Each preview plays the token's motion with the duration, easing, or spring from the installed library's `tokens.json`. Hovering a token in a longer string also previews the whole `animate` value.
- Setting `strxAnimation.preview.enable`. Previews are also hidden when `workbench.reduceMotion` is `on`.

## 0.2.1

- Link the react-native-strx documentation site, npm package, and GitHub repository from the README and extension manifest.

## 0.2.0

Supports `react-native-strx` 1.0.

- Read token metadata from the installed `react-native-strx/tokens.json`, with a bundled fallback, so completions match the library version.
- New tokens: `spring`, `damping-*`, `stiffness-*`, `mass-*`, `play-*`, and `play-infinite`. `repeat-*` is shown as legacy.
- Follow the v1 grammar: one preset, layout, transition, and easing per comma group, and commas as token boundaries.
- Find animate strings with a parser instead of a single-line regex: JSX attributes, `animate` object properties (such as `Strx.useTimeline` playables), arrays, ternaries, logical expressions, template literals, and `{ type: "preset" }` objects.
- Hover documentation for every token.
- Diagnostics for unknown or invalid tokens, with quick fixes.
- Suggest and accept presets registered with `definePreset`.
- Setting `strxAnimation.diagnostics.enable` and command **STRX Animation: Reload Token Metadata**.
- Removed the unsupported `contributes.completionProviders` manifest entry.

## 0.0.1

- Initial release.
