// Everything a sketch can use, for the Commands dropdown. A test checks
// that every robot and Serial command is listed and every example compiles.

export interface Entry {
  code: string;
  text: string;
  top?: boolean; // goes outside setup(), like a function definition
}

export interface Section {
  title: string;
  entries: Entry[];
}

export const REFERENCE: Section[] = [
  {
    title: 'Rover commands',
    entries: [
      { code: 'forward(2);', text: 'Drive 2 cells forward.' },
      { code: 'backward(2);', text: 'Drive 2 cells backward.' },
      { code: 'turnLeft();', text: 'Turn a quarter turn left, without moving.' },
      { code: 'turnRight();', text: 'Turn a quarter turn right, without moving.' },
      { code: 'int d = distanceAhead();', text: 'How many empty cells are in front of the rover. 0 means a wall is right there.' },
      { code: 'delay(500);', text: 'Wait 500 milliseconds. 1000 is one second.' },
    ],
  },
  {
    title: 'Serial Monitor',
    entries: [
      { code: 'Serial.begin(9600);', text: 'Turn on the Serial Monitor. Put it at the top of setup().' },
      { code: 'Serial.print(d);', text: 'Show a number, a variable, or "text in quotes".' },
      { code: 'Serial.println(d);', text: 'Same as print, then start a new line.' },
    ],
  },
  {
    title: 'Variables',
    entries: [
      { code: 'int steps = 3;', text: 'A whole number with a name. Change it later with steps = 5;' },
      { code: 'bool goingUp = true;', text: 'true or false. Flip it with goingUp = !goingUp;' },
      { code: 'const int SIZE = 4;', text: "A number that can't change." },
      { code: 'int count = 0;', text: 'Made outside every function, a variable keeps its value between loop() runs.', top: true },
    ],
  },
  {
    title: 'Making decisions and repeating',
    entries: [
      { code: 'if (distanceAhead() > 0) {\n  forward(1);\n} else {\n  turnRight();\n}', text: 'Do the first part only when the ( ) is true, otherwise the else part.' },
      { code: 'if (d == 0) {\n  turnRight();\n} else if (d > 3) {\n  forward(3);\n} else {\n  forward(1);\n}', text: 'else if checks another ( ) when the first one was false. The first true one wins.' },
      { code: 'while (distanceAhead() > 0) {\n  forward(1);\n}', text: 'Repeat as long as the ( ) is true.' },
      { code: 'for (int i = 0; i < 4; i++) {\n  turnRight();\n}', text: 'Repeat a set number of times. i counts 0, 1, 2, 3.' },
      { code: 'void loop() { }', text: 'loop() runs again and again after setup() finishes.', top: true },
    ],
  },
  {
    title: 'Your own functions',
    entries: [
      { code: 'void hop(int n) {\n  forward(n);\n  turnLeft();\n}', text: 'A new command. Use it with hop(2);', top: true },
      { code: 'int twice(int n) {\n  return n * 2;\n}', text: 'A function that gives back a number: forward(twice(3));', top: true },
      { code: 'bool wallAhead() {\n  return distanceAhead() == 0;\n}', text: 'A function that gives back true or false: if (wallAhead()) { ... }', top: true },
    ],
  },
  {
    title: 'Math and comparing',
    entries: [
      { code: 'int a = 7 + 2 - 1 * 3;', text: '+ - * work like in math class.' },
      { code: 'int half = 7 / 2;', text: '/ throws away the remainder, so 7 / 2 is 3. 7 % 2 is the remainder, 1.' },
      { code: 'steps++;\nsteps += 2;', text: '++ adds 1, -- takes 1 away. += -= *= /= change a variable by an amount.' },
      { code: 'bool same = steps == 3;', text: '== equal, != not equal, < > <= >= smaller and bigger.' },
      { code: 'bool both = steps > 1 && steps < 9;', text: '&& means and, || means or, ! means not.' },
      { code: '// a note for people', text: 'A comment. The rover skips everything after //.' },
    ],
  },
];

// The Commands dropdown's contents.
export function renderReference(into: HTMLElement): void {
  for (const section of REFERENCE) {
    const h = document.createElement('h2');
    h.textContent = section.title;
    const list = document.createElement('dl');
    for (const e of section.entries) {
      const dt = document.createElement('dt');
      const code = document.createElement('code');
      code.textContent = e.code;
      dt.append(code);
      const dd = document.createElement('dd');
      dd.textContent = e.text;
      list.append(dt, dd);
    }
    into.append(h, list);
  }
}
