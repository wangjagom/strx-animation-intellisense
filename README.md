# STRX Animation IntelliSense

Autocomplete, hover docs, and diagnostics for [`react-native-strx`](https://wangjagom.github.io/react-native-strx/) `animate` tokens in VS Code.

[Documentation](https://wangjagom.github.io/react-native-strx/) · [npm](https://www.npmjs.com/package/react-native-strx) · [GitHub](https://github.com/wangjagom/react-native-strx)

## Features

- **Completions** for presets, `from:` / `to:` / `exit:` keyframe utilities, `transition-*`, `layout-*`, easing, `spring`, and timing tokens such as `duration-*`, `delay-*`, `play-*`, `damping-*`, `stiffness-*`, and `mass-*`. Suggestions follow the library's grammar: one preset, layout token, transition token, and easing per comma group.
- **Hover docs** for every token, including each preset's start and end values and default motion.
- **Animated previews** in completion details and hovers: a small card plays the token's motion with its real duration, easing, or spring. Hovering a token in a longer string also previews the whole `animate` value. Timing tokens are shown on a sample slide, and `transition-*` / `layout-*` tokens on a style or size change.
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
| `strxAnimation.preview.enable`     | `true`  | Show animated previews in completion details and hovers. They are also hidden when `workbench.reduceMotion` is `on`, and stay still when the OS asks for reduced motion. |

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

## Releasing

Pushing a version tag runs `.github/workflows/release.yml`: it checks the tag matches `package.json`, runs the tests, publishes to the Visual Studio Marketplace (and to Open VSX when an `OVSX_PAT` secret exists), and creates a GitHub release with the `.vsix` attached.

```sh
# after bumping "version" in package.json and CHANGELOG.md on main
git tag v0.3.0
git push origin v0.3.0
```

Repository secrets: `VSCE_PAT` (Azure DevOps token with the Marketplace **Manage** scope for the `strx` publisher) and, optionally, `OVSX_PAT` (an [open-vsx.org](https://open-vsx.org) access token).
