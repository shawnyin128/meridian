/* A `?raw` import inlines the file's text at build time. */
declare module '*?raw' {
  const text: string
  export default text
}
