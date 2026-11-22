// ReactDOM comes from dist/vendor/react-dom.production.min.js (UMD,
// window.ReactDOM), loaded by the page before app.js.
const D = (window as unknown as { ReactDOM: typeof import('react-dom/client') }).ReactDOM;
export const { createRoot } = D;
