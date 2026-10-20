/**
 * The color the window paints before the renderer's first frame: the document background `--desktop`
 * of the light or the dark theme in renderer/shell/tokens.css.
 */
export function windowBackground(dark: boolean): string {
  return dark ? '#040b14' : '#eaeaea'
}
