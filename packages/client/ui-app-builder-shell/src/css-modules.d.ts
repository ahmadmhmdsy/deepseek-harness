/**
 * Type declaration for CSS Modules imports (`*.module.css`). The build-time
 * CSS Modules tool rewrites class names; this file gives TS the shape every
 * component in this package relies on without per-file stub interfaces.
 */

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
