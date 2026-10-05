# RoverSim

**Try it: https://jai-kata.github.io/roversim/**

RoverSim is a website for learning to code by driving a rover. You write
Arduino-style C++ on the left, press Run, and a rover drives around a
sheet of graph paper on the right. The same code is meant to run on the
BYTE Club's real Arduino rovers. The `Rover.h` library for that is coming
soon.

It's made for people who have never programmed before. Nothing to install
and no account needed. It's built for Chrome and Edge, including on school
laptops.

## How it works

Every program has two parts, just like on a real Arduino:

```cpp
#include "Rover.h"

void setup() {
  // runs once when the rover turns on
  forward(3);
}

void loop() {
  // runs over and over after setup()
}
```

The rover understands these commands:

| Command | What it does |
|---|---|
| `forward(n)` | Drive `n` cells forward |
| `backward(n)` | Drive `n` cells backward |
| `turnLeft()` / `turnRight()` | Turn a quarter turn in place |
| `distanceAhead()` | How many empty cells are in front of the rover (0 means a wall) |
| `delay(ms)` | Wait for `ms` milliseconds |
| `Serial.println(x)` | Print to the Serial Monitor |

You can also use `int` and `bool` variables, `if` / `else`, `while`, `for`,
and your own functions.

## The levels

1. **First steps**: code runs top to bottom.
2. **Turn the corner**: turning.
3. **Stairs forever**: `loop()` repeats, so 4 commands can climb 5 stairs.
4. **Same number twice**: variables.
5. **Square dance**: `for` loops.
6. **Unknown hallway**: `while` loops and the distance sensor. The hallway
   is a different length every time.
7. **Left or right?**: `if` / `else`. The way out changes sides.
8. **Sandbox**: no goal, just try stuff.

Some levels change the map every time you press Run. A level only counts
as done when your code works on every version of the map, because the real
world doesn't hold still either.

Your code and finished levels are saved in your browser.

## The controls

- **Run** (or Ctrl+Enter) runs your code. The line that's running is
  highlighted.
- **Step** runs one line at a time.
- **Stop** stops the run. **Reset** puts the rover back at the start.
- **Speed** goes from 0.25x to 4x.
- **Reset code** puts back the level's starting code. Ctrl+Z undoes it.

## When something goes wrong

RoverSim tells you what to fix in plain English and marks the line in red:

- `Line 4 needs a ; at the end.`
- `Line 5: There's no command called 'foward'. Did you mean 'forward'?`
- `Line 7: You used 'steps' before creating it. Try: int steps = 3;`
- `Crashed into a wall on line 6.`

A few things are different on the real rover. They're listed in
[bugs.txt](public/bugs.txt).

## For club officers

```
npm install
npm run dev      # local copy at http://localhost:5173
npm test         # checks the interpreter, every error message, and every level
npm run try -- examples/square.ino   # run a sketch without the browser
```

- The C++ interpreter is in `src/lang`. It's our own and handles only the
  subset above, so error messages can stay clear.
- Levels are JSON files in `src/levels`. Each needs a reference
  `solution`, and `npm test` checks that it passes every version of the map.
- Every push to `main` runs the tests and, if they pass, updates the
  website through GitHub Pages.
- What's new is in [changelog.txt](public/changelog.txt).

Made by BYTE Club officers at PNHS. Found a bug? Tell an officer.
