# React frontend

This MVP is a real React application. Because this sandbox has no package-registry
network access, it is built with the available TypeScript JSX compiler and a
locally vendored React/ReactDOM UMD runtime. No CDN is required.

- Edit `frontend/src/app.jsx` and `web/styles.css`.
- Run `node scripts/build_frontend.js` at the repository root.
- The compiled page is `web/app.js`, served by FastAPI.

For the full cinematic motion/R3F/GSAP production upgrade described in
`docs/TRUSTLAB_WEB_BUILD_SPEC.md`, migrate the components into a Vite React
application after installing dependencies from a networked development machine.
The working API and ML/game engine do not depend on this presentation layer.
