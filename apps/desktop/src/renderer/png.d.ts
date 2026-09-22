/* PNG is sent out through Vite's resource pipeline, and the import returns the packaged address. */
declare module '*.png' {
  const url: string
  export default url
}
