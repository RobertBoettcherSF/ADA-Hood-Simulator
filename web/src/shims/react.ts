// React comes from dist/vendor/react.production.min.js (a UMD build that
// sets window.React), loaded by the page before app.js.
const R = (window as unknown as { React: typeof import('react') }).React;
export default R;
export const { createElement, Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState } = R;
