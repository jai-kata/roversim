# RoverSim

**Try it: https://jai-kata.github.io/roversim/**

RoverSim is a website for learning to code by driving a rover. You write
Arduino-style C++ on the left, press Run, and a rover drives around a
sheet of graph paper on the right. The same code is meant to run on the
BYTE Club's real Arduino rovers. The `Rover.h` library for that is coming
soon.

The first levels are made for people who have never programmed before. The
later ones get hard enough to make people who already code think. Nothing
to install and no account needed. It's built for Chrome and Edge, including on school
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

Levels 1 to 7 are for people who have never coded. Between them they teach
every piece of C++ the later levels need:

1. **First steps**: what a command looks like (`;`, `( )`, `{ }`, comments),
   driving, and turning. The starting code points out each part.
2. **Stairs forever**: `loop()` repeats, so 4 commands can climb 5 stairs.
3. **Growing stairs**: variables, changing them with `++`, and why they go
   outside `loop()`. Printing to the Serial Monitor.
4. **Spiral out**: `for` loops and math with the counter.
5. **Halfway back**: `while` loops, the distance sensor, counting, `/` and
   `%`, comparing, and `backward`. The hallway is a different length every
   time.
6. **Bumpy road**: your own functions, with a number passed in, and `const`.
7. **Which way?**: `if` / `else if` / `else`, `bool`, functions that give
   back a value, and looking sideways. The way out changes every time.

Levels 8 to 14 use all of that on harder problems:

8. **Count the doors**: count doors while driving and take the third.
9. **Snail shell**: math inside a loop. A whole spiral in 2 commands.
10. **Dead center**: measure a room of any size and park in the middle.
11. **Mow the lawn**: a lawn of any size in 4 commands, remembering which
    way you're going.
12. **Maze runner**: one piece of code that gets through any maze.
13. **Treasure map**: keep track of where the rover is to find the X.
14. **The island**: everything at once. Hard on purpose.

15. **Sandbox**: no goal, just try stuff.

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
- **Commands** lists everything you can write, with an example of each. It
  opens by itself the first time you reach level 8.

## When something goes wrong

RoverSim tells you what to fix in plain English and marks the line in red:

- `Line 4 needs a ; at the end.`
- `Line 5: There's no command called 'foward'. Did you mean 'forward'?`
- `Line 7: You used 'steps' before creating it. Try: int steps = 3;`
- `Crashed into a wall on line 6.`

A few things are different on the real rover. They're listed in
[bugs.txt](bugs.txt).

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
- What's new is in [changelog.txt](changelog.txt). Neither it nor
  bugs.txt is published on the website.

Made by BYTE Club officers at PNHS. Found a bug? Tell an officer.
