# STRX Animation IntelliSense

IntelliSense support for `react-native-strx` animation tokens in VS Code.

This extension provides autocomplete suggestions for `animate=""` attributes used by STRX animation components.

## Features

- Autocomplete for STRX animation preset tokens
- Suggestions inside `animate=""`, `animate=''`, and template string attributes
- Supports animation tokens such as `fade-in`, `slide-up`, `scale-in`, and `bounce`
- Supports transition tokens such as `transition-all`, `duration-300`, and `ease-in-out`
- Supports modifier-style tokens such as `from:`, `to:`, and `exit:`
- Works with JavaScript, TypeScript, JSX, and TSX files

## Example

```tsx
import { Strx } from "react-native-strx";

export function Example() {
  return (
    <Strx.View animate="fade-in slide-up transition-all duration-300 ease-out">
      <Strx.Text animate="from:opacity- to:opacity- duration-500">
        Hello STRX
      </Strx.Text>
    </Strx.View>
  );
}
```

## Related

- [react-native-strx](https://github.com/wangjagom/react-native-strx)
