/* PNGs ship through Vite's asset pipeline, and the import returns the bundled file's URL. */
declare module '*.png' {
  const url: string
  export default url
}
