/* The worker script of pdf.js sends out the static resource, and `?url` allows the packager to output it separately and return the address. */
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}
