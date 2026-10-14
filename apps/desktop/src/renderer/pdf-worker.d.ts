/* pdf.js's worker script ships as a static asset; `?url` makes the bundler emit it as a separate file and return its URL. */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}
