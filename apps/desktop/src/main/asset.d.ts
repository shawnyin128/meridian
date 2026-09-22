/* Ship icons as static assets. `resources` is electron-vite's public directory, so `?asset` returns an
   absolute runtime path pointing back into `resources/` rather than copying the file into out/. The
   packaging config must therefore ship `resources/` alongside `out/`. */
declare module '*.png?asset' {
  const path: string
  export default path
}
