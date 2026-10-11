# Change Log

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
