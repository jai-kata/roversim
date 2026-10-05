# RoverSim

A website where beginners write Arduino-style C++ to drive a virtual rover
on a grid. The same code runs on the club's real rovers with `Rover.h`.

See `SPEC.md` for what it does and `design.md` for how it looks.

## Working on it

```
npm install
npm run dev      # local site at http://localhost:5173
npm test         # interpreter, error messages, and level tests
npm run try -- examples/square.ino   # run a sketch without the browser
```

Levels live in `src/levels/*.json`. Every level needs a `solution` that
passes all its map versions; `npm test` checks this.

## Publishing

Every push to `main` runs the tests and, if they pass, publishes the site
to GitHub Pages (`.github/workflows/deploy.yml`).
