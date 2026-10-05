# RoverSim — MVP Spec

## Goal
A static website where complete beginners write Arduino-style C++ to drive a
virtual rover on a grid. The same code must run unchanged on our real Arduino
rovers (L298N motor driver) by including `Rover.h`. Audience: high school
students who have never programmed. Clarity of feedback matters more than
C++ completeness.

## Hard constraints
- Static site only (no backend). Deploy to GitHub Pages.
- Must work in Chrome and Edge on school-managed Windows laptops. No installs, no logins.
- Stack: Vite + TypeScript, CodeMirror 6 (C++ mode), HTML canvas. No other frameworks.
- Do NOT use JSCPP, emscripten, or any real C++ compiler. Write our own
  tokenizer, recursive-descent parser, and tree-walking interpreter for the
  subset below. Reason: we need line-by-line highlighting, pausing for
  animation, and plain-English errors.
- Every built-in robot command must be implementable on real hardware (see Rover.h).
  No sim-only commands like `atGoal()`.

## Supported C++ subset
- Program structure: `void setup()` and `void loop()` are required. `setup()`
  runs once, then `loop()` runs repeatedly. Optional `#include "Rover.h"` and
  `#include <Arduino.h>` lines are accepted and ignored.
- Comments: `//` and `/* */`.
- Types: `int`, `bool` (with `true`/`false`). Declarations with or without initializer.
- Operators: `+ - * / %` (integer division), `== != < > <= >=`, `&& || !`,
  `=`, `+=`, `-=`, `++`, `--` (prefix and postfix), parentheses.
- Statements: blocks, `if` / `else if` / `else`, `while`, `for (init; cond; update)`,
  `return`, expression statements.
- User-defined functions: `void` or `int` return type, `int`/`bool` parameters,
  must be defined before use OR anywhere at top level (support both).
- Scoping: block scope, function locals, globals.
- Strings: string literals allowed ONLY as arguments to `Serial.print` / `Serial.println`.
- Out of scope (give a friendly "not supported in RoverSim yet" error):
  arrays, pointers, classes/structs, float/double, char, `#define` in student
  code, `switch`, `do-while`, `break`/`continue`.

## Built-in functions (sim behavior)
| Function | Sim behavior |
|---|---|
| `forward(int cells)` | Move N cells in current heading, animated one cell at a time |
| `backward(int cells)` | Move N cells opposite heading |
| `turnLeft()` / `turnRight()` | Rotate 90°, animated |
| `distanceAhead()` → int | Number of empty cells before the next wall/edge in current heading (0 = wall directly ahead) |
| `delay(int ms)` | Pause the animation for ms (scaled by speed slider) |
| `Serial.begin(int)` | No-op |
| `Serial.print(x)` / `Serial.println(x)` | Write to the output panel |

Negative or zero values for `forward`/`backward` are a friendly runtime error.

## Interpreter design
- Pipeline: tokenizer → parser → AST (every node has a line number) →
  interpreter implemented as a generator (`function*`) that yields events:
  `{type:'line', line}` before each statement and `{type:'move'|'turn'|'print'|'delay', ...}`
  for built-ins.
- A runner consumes the generator and awaits animations, so the editor highlights
  the executing line in sync with the rover.
- Safety limits: 20,000 statements executed without any robot movement → stop
  with "Your loop runs forever without moving the robot." Call depth > 100 →
  "A function keeps calling itself."
- Program ends when: the rover reaches the goal (after required checkpoints),
  the rover crashes, the user presses Stop, or `loop()` completes 500 times.
- Note shown to students in level 3: "On the real rover, loop() never stops by
  itself. The simulator stops when you reach the goal."

## Friendly errors (top priority, test every one)
Show: line number, plain-English message, and highlight the line in red. Never
show raw parser internals. Required cases:
- Missing semicolon → "Line 4 needs a ; at the end."
- Unclosed brace → "The { on line 3 is never closed with a }."
- Extra closing brace
- Unknown function, with Levenshtein suggestion → "There's no command called 'foward'. Did you mean 'forward'?"
- Wrong capitalization → "C++ cares about capital letters: 'TurnLeft' should be 'turnLeft'."
- Undeclared variable → "You used 'steps' before creating it. Try: int steps = 3;"
- Variable declared twice in the same scope
- Wrong number of arguments → "forward needs one number, like forward(2)."
- Missing setup() or loop()
- `=` inside an if/while condition → warning (not error): "Did you mean == ? A single = changes the variable."
- Unsupported feature (see subset)
- Crash: "The rover hit a wall at line 6."

## Simulator
- Canvas grid, origin top-left, headings N/E/S/W. Rover drawn as a simple rover
  shape with a clear front. Draw a fading trail of visited cells. Show walls,
  goal tile, and numbered checkpoint tiles.
- Crash animation: small bump toward the wall, then stop.
- Controls: Run, Step (one statement), Stop, Reset, speed slider (0.25x–4x).
- Layout: editor left, simulator top-right, output/error panel bottom-right,
  level instructions above the editor. Must be usable on a 1366×768 laptop screen.

## Levels (JSON files in /src/levels)
Schema:
```json
{
  "id": 1,
  "title": "First Steps",
  "concept": "Sequence",
  "instructions": "short plain-English explanation + task",
  "starterCode": "...",
  "grid": { "w": 8, "h": 8 },
  "variants": [
    { "start": {"x":1,"y":6,"dir":"N"}, "goal": {"x":1,"y":3},
      "walls": [[0,0]], "checkpoints": [] }
  ],
  "maxCommands": null,
  "requires": [],
  "hint": "...",
  "solution": "..."
}
```
- `variants`: on Run, pick one at random to display. When the displayed run
  succeeds, silently test the program against ALL variants. If any variant fails, show:
  "It worked this time, but the map changes. Can your code handle any version?"
  A level only counts as complete if every variant passes.
- `maxCommands`: max number of robot-command call sites in the source (not executions).
- `requires`: AST checks, any of `variable`, `for`, `while`, `if`, `function`.

MVP levels:
1. **First Steps** (sequence): goal straight ahead 3 cells.
2. **Turn the Corner** (sequence + turns): L-shaped path.
3. **Stairs Forever** (`loop()` repeats): 5-step staircase, `maxCommands: 4`.
4. **Same Number Twice** (variables): U-shaped path with equal legs, `requires: ["variable"]`.
5. **Square Dance** (`for`): visit 4 corner checkpoints of a 3×3 square in order, `requires: ["for"]`, `maxCommands: 2`.
6. **Unknown Hallway** (`while` + sensor): hallway of length 3, 5, or 7 (3 variants), `requires: ["while"]`.
7. **Left or Right?** (`if`/`else`): hallway ends with an opening either left or right (2 variants). Solvable by turning left, checking `distanceAhead()`, and turning around if blocked.
8. **Sandbox**: 10×10 open grid with a few walls, no goal.

Each level includes a reference solution. Tests verify the solution passes all variants.

## Persistence
Save each level's code and completion status in localStorage (wrapped in
try/catch; the app must work if storage is unavailable). "Reset code" button per level.

## Hardware library: write this file exactly as /hardware/Rover.h
```cpp
#ifndef ROVER_H
#define ROVER_H
#include <Arduino.h>

// ---- Wiring (L298N). Change to match your rover. ----
#define ENA 5    // left motor speed (PWM)
#define IN1 7
#define IN2 8
#define ENB 6    // right motor speed (PWM)
#define IN3 9
#define IN4 11
#define TRIG_PIN A5   // HC-SR04 ultrasonic
#define ECHO_PIN A4

// ---- Calibration: tune these on the real floor ----
#define DRIVE_SPEED 180   // 0-255
#define TURN_SPEED  180
#define MS_PER_CELL 600   // ms to drive one grid cell
#define MS_PER_TURN 420   // ms for a 90-degree pivot
#define CELL_CM     30    // one grid cell in cm
#define PAUSE_MS    150

inline void roverInit() {
  static bool ready = false;
  if (ready) return;
  int pins[] = {ENA, IN1, IN2, ENB, IN3, IN4, TRIG_PIN};
  for (int p : pins) pinMode(p, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  ready = true;
}

inline void setMotor(int en, int a, int b, int speed) {
  if (speed > 0)      { digitalWrite(a, HIGH); digitalWrite(b, LOW); }
  else if (speed < 0) { digitalWrite(a, LOW);  digitalWrite(b, HIGH); speed = -speed; }
  else                { digitalWrite(a, LOW);  digitalWrite(b, LOW); }
  analogWrite(en, speed);
}

inline void drive(int left, int right, unsigned long ms) {
  roverInit();
  setMotor(ENA, IN1, IN2, left);
  setMotor(ENB, IN3, IN4, right);
  delay(ms);
  setMotor(ENA, IN1, IN2, 0);
  setMotor(ENB, IN3, IN4, 0);
  delay(PAUSE_MS);
}

inline void forward(int cells)  { if (cells > 0) drive(DRIVE_SPEED, DRIVE_SPEED, (unsigned long)cells * MS_PER_CELL); }
inline void backward(int cells) { if (cells > 0) drive(-DRIVE_SPEED, -DRIVE_SPEED, (unsigned long)cells * MS_PER_CELL); }
inline void turnLeft()  { drive(-TURN_SPEED, TURN_SPEED, MS_PER_TURN); }
inline void turnRight() { drive(TURN_SPEED, -TURN_SPEED, MS_PER_TURN); }

inline int distanceAhead() {
  roverInit();
  digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long us = pulseIn(ECHO_PIN, HIGH, 30000);
  if (us == 0) return 99;          // nothing detected
  return (int)((us / 58) / CELL_CM);
}
#endif
```
Also create /hardware/README.md explaining: put Rover.h in the same folder
as the sketch, add `#include "Rover.h"` at the top, swap the IN pins if a
motor spins backward, and tune MS_PER_CELL / MS_PER_TURN with a tape measure.
Include /hardware/example/example.ino (level 5 solution).

## Testing
- Vitest unit tests for tokenizer, parser, interpreter, and every friendly-error case.
- Each level's reference solution must pass all variants (automated test).
- Each level's starter code must parse without errors.

## Build phases (stop after each for review)
1. Tokenizer, parser, interpreter (headless) + tests for the full subset and all friendly errors.
2. Grid simulator + runner with line highlighting, Run/Step/Stop/Reset, speed slider. Level 1 only.
3. All 8 levels, variants, `requires` / `maxCommands` checks, localStorage, level select.
4. Rover.h, hardware README, example sketch, GitHub Pages deploy config.

## Definition of done
A student who has never coded can open the site, finish levels 1–4 in one
45-minute meeting with officer help, and every error they hit tells them
what to fix in one sentence.