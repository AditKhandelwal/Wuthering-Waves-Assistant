// Vercel's Edge runtime supports importing a precompiled WebAssembly.Module
// via a "?module" suffix (https://vercel.com/docs/functions/wasm) -- no
// built-in TS types exist for that import form, so this declares it.
declare module "*.wasm?module" {
  const value: WebAssembly.Module;
  export default value;
}
