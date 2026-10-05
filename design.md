# RoverSim — Design

SPEC.md says what the site does. This file says how it looks and sounds.
If they conflict on layout, visuals, or copy, this file wins. If they
conflict on behavior, SPEC.md wins.

## The feel in one sentence
It should look like a BYTE Club officer built it over a few weekends,
using plain HTML and an engineering notebook for inspiration. It should
not look like a startup product or an AI-generated page.

## The rule that overrides everything else
**Unfinished in polish, never unfinished in function.** The site can look
plain, use default browser controls, and admit it's still at v0.4. But
every button must work, every error must be clear, and nothing should
look broken. Beginners who think the tool is broken stop trusting their
own code.

## Concept: the engineering notebook
Robotics teams keep engineering notebooks: graph paper, pencil sketches,
cross-hatched shading, highlighter on the important line, red pen for
mistakes. That vocabulary is where every visual choice comes from.

- The simulator grid is graph paper.
- The rover, walls, and goal look sketched in pencil.
- The line currently running is highlighted like a highlighter pen.
- Errors are red pen.
- Everything outside the simulator stays as plain as default HTML.

**Spend the boldness in one place:** the sketched simulator. Keep
everything else quiet.

## References (look at these before building)

| Reference | Take this | Don't take this |
|---|---|---|
| Hack Club Sprig editor — https://sprig.hackclub.com/ (built with teenagers) | Code-left, game-right split; resizable panes; plain help text; feels made by students for students | Its colors and branding |
| p5.js Web Editor — https://editor.p5js.org/ | A tiny toolbar with play/stop and nothing else; output right next to code | Its pink accent |
| Brutalist Web Design — https://brutalist-web.design/ | Links are underlined, buttons look like buttons, use the operating system's own controls, fast loading, decoration only when it helps | Pages that are deliberately ugly or hard to read |
| J. R. Carpenter, "A Handmade Web" — https://elmcip.net/node/10581 | The idea that hand-coded pages can be provisional and one-of-a-kind; honesty about being a work in progress | Experimental layouts that break conventions |
| tilde.club — http://tilde.club/ | What unstyled, hand-written HTML pages look like by default | Retro gimmicks (GIFs, marquees, visitor counters) |
| FRC/VEX team engineering notebooks (image search "robotics engineering notebook page") | Graph paper, hatching for solid areas, pencil labels, highlighter | Scanned paper textures or fake coffee stains |
| Arduino IDE Serial Monitor | The output panel imitates it, so students recognize it later on the real rover | — |

## Color
Six colors total. Don't add more.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#ffffff` | Page and editor background. Plain white, not cream. |
| `--ink` | `#000000` | Text, borders, rover outline. Pure black, not near-black. |
| `--pencil` | `#6b6b6b` | Secondary text, line numbers, hatching, checkpoint labels |
| `--graph` | `#cfe0f1` | Minor graph-paper lines |
| `--graph-major` | `#9cbfe2` | Grid lines between rover cells |
| `--highlighter` | `#fff176` | Currently executing line, rover trail after success |
| `--redpen` | `#d32f2f` | Errors, crash marks, error-line gutter marker |

Links use the browser's default blue and purple. Do not override them.

## Type
- **UI text:** `Arial, Helvetica, sans-serif`, 14px, line-height 1.4.
  It's what a student would actually type first, and it needs no download
  on a locked-down school network.
- **Code and Serial Monitor:** `Consolas, "Courier New", monospace`, 14px.
- **Level title:** 18px bold Arial. Nothing on the site is larger.
- No webfonts. No handwriting fonts (they look like Comic Sans cosplay).
- Sentence case everywhere. No all-caps labels. No italic or colored
  accent words inside a sentence.

## Layout

```
+---------------------------------------------------------------------------+
| RoverSim v0.4                               Level: [3. Stairs forever  v] |
+---------------------------------------------------------------------------+
| 3. Stairs forever                                                         |
| loop() runs over and over. Get to the top using 4 commands or fewer.      |
| > Hint                                                                    |
+--------------------------------------+------------------------------------+
|  1  #include "Rover.h"               |                                    |
|  2                                   |   graph paper grid                 |
|  3  void setup() {                   |   sketched rover, walls, goal      |
|  4  }                                |                                    |
|  5                                   |                                    |
|  6  void loop() {                    +------------------------------------+
|  7    forward(1);   <- highlighter   | [Run] [Step] [Stop] [Reset]  Speed |
|  8    turnLeft();                    +------------------------------------+
|  9  }                                | Serial Monitor                     |
|                                      | Line 8 needs a ; at the end.       |
+--------------------------------------+------------------------------------+
| Made by BYTE Club officers at PNHS. Found a bug? Tell an officer.         |
| Known bugs (2)                                                            |
+---------------------------------------------------------------------------+
```

- Everything is left-aligned. Nothing is centered except the canvas
  inside its own box.
- Editor about 55% width, right column about 45%. Panes are separated by
  1px `--ink` borders. Add a draggable divider if it's cheap; skip it if not.
- Must fit on a 1366×768 screen without page scrolling. Below 900px wide,
  stack: instructions, editor, simulator, controls, Serial Monitor.
- Border radius: 0 on panels. Leave native controls with their default radius.
- No shadows anywhere.
- Spacing: 8px base. Use 8, 16, and 24 only.

## Components

**Header.** "RoverSim" in bold 16px, then "v0.4" in `--pencil` as a link
to `changelog.txt` (a real plain-text file). Level picker on the right is a
native `<select>`. No logo, no nav menu, no tagline.

**Instructions.** Level number and title, then at most two sentences:
what the concept is, then the task. The hint uses a native
`<details><summary>Hint</summary>`.

**Editor (CodeMirror 6).** White background, black text, line numbers in
`--pencil`. Syntax colors stay muted: keywords bold black, numbers and
strings dark blue `#1a4d8f`, comments `--pencil`. That's the whole theme.
Executing line gets a `--highlighter` background, full width, no
animation. Error line gets a 3px `--redpen` left gutter bar plus a red
wavy underline under the exact token.

**Simulator canvas.** See "The sketched simulator" below.

**Controls.** Native `<button>` elements: Run, Step, Stop, Reset. Only set
`font: inherit` and `padding: 4px 10px`. Run is not a different color.
Speed is a native `<input type="range">` labeled "Speed". Ctrl+Enter runs
the code; show that once in the hint text, not as a tooltip.

**Serial Monitor.** Titled exactly "Serial Monitor". Monospace, white
background, 1px border, scrolls. Prints `Serial.println` output, errors
(in `--redpen`), and result messages. Clears on Run.

**Footer.** One plain line plus a "Known bugs" link to `bugs.txt` with the
real current count. Keep that file honest.

## The sketched simulator
This is the one place to put effort.

- **Paper:** white canvas, minor lines in `--graph` every quarter cell,
  cell lines in `--graph-major`. Like real graph paper.
- **Walls:** cells cross-hatched with diagonal `--pencil` strokes, with a
  slightly wobbly outline. No solid fills.
- **Goal:** a hand-drawn X with a circle around it, in `--ink`.
- **Checkpoints:** circled numbers in `--pencil`, like notebook annotations.
- **Rover:** top-down rectangle body, two wheel bars on the sides, a small
  triangle at the front showing heading. Black 2px strokes, no fill.
- **Wobble:** write a ~40-line helper that draws lines as 2–3 slightly
  offset passes with small random jitter. Seed the randomness per shape so
  the drawing stays the same every frame. A re-randomized wobble flickers
  and looks broken.
- **Trail:** thin `--pencil` line through visited cell centers. On success
  it turns `--highlighter`, drawn thick, under the rover.
- **Crash:** a quick 3-frame bump toward the wall, then a small `--redpen`
  scribble on the wall edge. The rover stays where it stopped.

## Motion
- The rover moves cell by cell at constant speed, linear easing. Turns
  rotate 90° linearly. Speed slider scales both.
- No page-load animation. No hover transitions. No fade-ins. No toasts.
- On success: trail turns highlighter yellow and Serial Monitor prints the
  result. No confetti, no modal, no sound.
- Respect `prefers-reduced-motion`: jump the rover between cells instead
  of animating.

## Voice and copy
Written by older students for newer students. Short, direct, a little dry.
Plain verbs. No emoji. At most one exclamation point on the whole screen.

| Situation | Write this | Not this |
|---|---|---|
| Success | Made it. You used 4 commands. | 🎉 Amazing job, coder! You crushed it! |
| Success, but a variant fails | It worked this time, but the map changes. Can your code handle any version? | Almost there! Keep going! |
| Crash | Crashed into a wall on line 6. | Oops! Something went wrong. |
| Syntax error | Line 4 needs a ; at the end. | Unexpected token at 4:12 |
| Sandbox instructions | Free drive. No goal here, just try stuff. | Unleash your creativity in our open playground! |
| Empty Serial Monitor | Nothing printed yet. | (leave it blank) |

Buttons say exactly what they do: Run, Step, Stop, Reset. Not "Execute",
"Launch", or "Go".

## Allowed "work in progress" signals
Use exactly these. Don't invent more.

1. "v0.4" next to the name, linking to a real changelog.
2. "Known bugs (n)" in the footer, linking to a real list.
3. The sandbox titled "Sandbox (more levels coming)".
4. Native, barely styled browser controls throughout.

Never put WIP signals in error messages, instructions, or controls.

## Things that make it look AI-generated (do not use)
- Gradients, glows, glassmorphism, drop shadows
- Rounded cards with soft gray shadows; one radius on everything
- Icon libraries (Lucide, Heroicons, Font Awesome) or emoji in the UI
- A hero section, landing page, "Welcome to RoverSim", or a tagline
- Inter, Poppins, or any Google Font
- Tailwind's default look (gray-50 background, indigo/violet buttons)
- Dark theme with a neon accent; a dark mode toggle
- Cream background with a serif headline and a terracotta accent
- All-caps eyebrow labels, text joined with middle dots, "→" on buttons
- Tooltips, toasts, modals, skeleton loaders, confetti
- Purple anything
- Perfectly centered, perfectly symmetrical layouts

## Accessibility floor (non-negotiable)
- Keep the browser's default focus outlines.
- Text contrast at least 4.5:1. `--pencil` on white passes; don't go lighter.
- Every control reachable by keyboard; Ctrl+Enter runs.
- Errors use text, not only color.
- Canvas has an `aria-label` that updates with rover position and result.

## Implementation notes
- One CSS file, CSS variables for the tokens above, no CSS framework.
  If it's growing past ~200 lines, something is over-designed.
- Scale the canvas by `devicePixelRatio` so lines stay sharp.
- No favicon is fine. If you add one, make it a hand-drawn 16×16 pixel
  rover, not an emoji.

## Review before calling it done
Screenshot the main screen at 1366×768 and check:
1. Could this screenshot be a startup's landing page? If yes, remove things.
2. Is anything not from the color table? Remove it.
3. Is the sketched simulator the only thing that draws the eye? It should be.
4. Read every visible string out loud. Does it sound like a student or
   like marketing? Rewrite the marketing ones.
5. Does anything look broken rather than plain? Fix it.
