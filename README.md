# STRX Animation IntelliSense

Autocomplete, hover docs, and diagnostics for [`react-native-strx`](https://github.com/wangjagom/react-native-strx) `animate` tokens in VS Code.

## Features

- **Completions** for presets, `from:` / `to:` / `exit:` keyframe utilities, `transition-*`, `layout-*`, easing, `spring`, and timing tokens such as `duration-*`, `delay-*`, `play-*`, `damping-*`, `stiffness-*`, and `mass-*`. Suggestions follow the library's grammar: one preset, layout token, transition token, and easing per comma group.
- **Hover docs** for every token, including each preset's start and end values and default motion.
- **Diagnostics** for unknown or invalid tokens, matching the warnings the library logs at runtime, with quick fixes such as `fade-inn` → `fade-in` and inserting a comma between two presets.
- **Custom presets** registered with `definePreset("name", …)` anywhere in the workspace are suggested and accepted.
- **Version-matched tokens**: when the project's installed `react-native-strx` ships `tokens.json` (1.0+), the extension reads its token list from there. Otherwise it uses a bundled snapshot.

Animate strings are found in:

```tsx
<Strx.View animate="fade-in layout-spring" />
<Strx.View animate={open ? "fade-in" : "fade-out"} />
<Strx.View animate={["fade-in", "slide-up duration-200"]} playback="serial" />
<Strx.View animate={`fade-in delay-${index * 50}`} />
<Strx.View animate={{ type: "bounce" }} />

Strx.useTimeline({
  playables: [{ target: "card", animate: "from:opacity-0 to:opacity-100" }],
});
```

Works in `.tsx`, `.jsx`, `.ts`, and `.js` files.

## Settings

| Setting                            | Default | Description                                               |
| ---------------------------------- | ------- | --------------------------------------------------------- |
| `strxAnimation.diagnostics.enable` | `true`  | Show warnings for unknown or invalid tokens.              |

## Commands

- **STRX Animation: Reload Token Metadata** — re-reads `tokens.json` after upgrading `react-native-strx` (also happens automatically when its `package.json` changes).

## Development

```sh
npm ci
npm run test:unit                       # grammar, scanner, completion, metadata
xvfb-run -a npm test                    # integration tests in VS Code (Linux CI)
npm run sync:tokens -- ../react-native-strx/tokens.json   # refresh the bundled snapshot
npm run package                         # build a .vsix
```
