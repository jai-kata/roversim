import { describe, expect, it } from 'vitest';
import { compile } from '../src/lang';
import { compileError, compileErrorLine, inSetup, run, warningsOf } from './helpers';

// One test per friendly error. Messages are checked word for word because
// they are the product: a beginner reads exactly this sentence.

describe('spec: required friendly errors', () => {
  it('missing semicolon', () => {
    const src = `#include "Rover.h"

void setup() {
  forward(1)
  turnLeft();
}
void loop() {}`;
    expect(compileError(src)).toBe('Line 4 needs a ; at the end.');
    expect(compileErrorLine(src)).toBe(4);
  });

  it('missing semicolon before a closing brace', () => {
    expect(compileError('void setup() {\n  forward(1)\n}\nvoid loop() {}')).toBe('Line 2 needs a ; at the end.');
  });

  it('missing semicolon after a declaration', () => {
    expect(compileError('int steps = 3\nvoid setup() {}\nvoid loop() {}')).toBe('Line 1 needs a ; at the end.');
  });

  it('missing semicolon between two commands on one line', () => {
    expect(compileError(inSetup('forward(1) turnLeft();'))).toBe("Line 2 needs a ; before 'turnLeft'.");
  });

  it('unclosed brace (function never closed)', () => {
    const src = `void setup() {
  forward(1);

void loop() {
  turnLeft();
}`;
    expect(compileError(src)).toBe('The { on line 1 is never closed with a }.');
  });

  it('unclosed brace (inner if never closed)', () => {
    const src = `void setup() {
}

void loop() {
  if (distanceAhead() > 0) {
    forward(1);
}`;
    expect(compileError(src)).toBe('The { on line 5 is never closed with a }.');
  });

  it('unclosed brace at end of file', () => {
    expect(compileError('void setup() {\n}\nvoid loop() {\n  forward(1);\n')).toBe('The { on line 3 is never closed with a }.');
  });

  it('extra closing brace', () => {
    const src = `void setup() {
  forward(1);
  }
  turnLeft();
}
void loop() {}`;
    expect(compileError(src)).toBe("Line 3 has an extra } that doesn't match any {.");
  });

  it('extra closing brace at the end', () => {
    expect(compileError('void setup() {\n}\nvoid loop() {\n}\n}')).toBe("Line 5 has an extra } that doesn't match any {.");
  });

  it('unknown function with a suggestion', () => {
    expect(compileError(inSetup('foward(2);'))).toBe("Line 2: There's no command called 'foward'. Did you mean 'forward'?");
    expect(compileError(inSetup('turnLetf();'))).toBe("Line 2: There's no command called 'turnLetf'. Did you mean 'turnLeft'?");
  });

  it('unknown function suggests the student\'s own functions too', () => {
    const src = 'void dance() {}\nvoid setup() { danse(); }\nvoid loop() {}';
    expect(compileError(src)).toBe("Line 2: There's no command called 'danse'. Did you mean 'dance'?");
  });

  it('unknown function with nothing close', () => {
    expect(compileError(inSetup('fly(3);'))).toBe("Line 2: There's no command called 'fly'.");
    expect(compileError(inSetup('pinMode(3, 1);'))).toBe("Line 2: There's no command called 'pinMode'.");
  });

  it('wrong capitalization of a command', () => {
    expect(compileError(inSetup('TurnLeft();'))).toBe("Line 2: C++ cares about capital letters: 'TurnLeft' should be 'turnLeft'.");
    expect(compileError(inSetup('Forward(1);'))).toBe("Line 2: C++ cares about capital letters: 'Forward' should be 'forward'.");
  });

  it('wrong capitalization of a variable', () => {
    expect(compileError(inSetup('int steps = 2;\nforward(Steps);'))).toBe(
      "Line 3: C++ cares about capital letters: 'Steps' should be 'steps'.",
    );
  });

  it('wrong capitalization of Serial', () => {
    expect(compileError(inSetup('serial.println(1);'))).toBe("Line 2: C++ cares about capital letters: 'serial' should be 'Serial'.");
    expect(compileError(inSetup('Serial.Println(1);'))).toBe("Line 2: C++ cares about capital letters: 'Println' should be 'println'.");
  });

  it('wrong capitalization of setup/loop', () => {
    expect(compileError('void Setup() {}\nvoid loop() {}')).toBe("Line 1: C++ cares about capital letters: 'Setup' should be 'setup'.");
    expect(compileError('void setup() {}\nvoid Loop() {}')).toBe("Line 2: C++ cares about capital letters: 'Loop' should be 'loop'.");
  });

  it('undeclared variable', () => {
    expect(compileError(inSetup('forward(steps);'))).toBe("Line 2: You used 'steps' before creating it. Try: int steps = 3;");
  });

  it('variable used before the line that creates it', () => {
    expect(compileError(inSetup('forward(steps);\nint steps = 2;'))).toBe(
      "Line 2: You used 'steps' before creating it. Try: int steps = 3;",
    );
  });

  it('global declared below the function that uses it', () => {
    const src = 'void setup() {\n  forward(steps);\n}\nint steps = 2;\nvoid loop() {}';
    expect(compileError(src)).toBe("Line 2: You used 'steps' before creating it. Try: int steps = 3;");
  });

  it('variable from another function is not visible', () => {
    const src = 'void setup() {\n  int steps = 2;\n}\nvoid loop() {\n  forward(steps);\n}';
    expect(compileError(src)).toBe("Line 5: You used 'steps' before creating it. Try: int steps = 3;");
  });

  it('for-loop counter is not visible after the loop', () => {
    expect(compileError(inSetup('for (int i = 0; i < 2; i++) {}\nforward(i);'))).toBe(
      "Line 3: You used 'i' before creating it. Try: int i = 3;",
    );
  });

  it('variable declared twice in the same scope', () => {
    expect(compileError(inSetup('int steps = 2;\nint steps = 3;'))).toBe(
      "Line 3: You already created 'steps' on line 2. To change it, leave off the type, like steps = 5;",
    );
  });

  it('global declared twice', () => {
    expect(compileError('int n;\nint n;\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 2: You already created 'n' on line 1. To change it, leave off the type, like n = 5;",
    );
  });

  it('parameter redeclared in the function body', () => {
    expect(compileError('void go(int n) {\n  int n = 2;\n}\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 2: You already created 'n' on line 1. To change it, leave off the type, like n = 5;",
    );
  });

  it('same name in an inner block is allowed', () => {
    expect(compile(inSetup('int x = 1;\n{ int x = 2; }')).ok).toBe(true);
  });

  it('wrong number of arguments to built-ins', () => {
    expect(compileError(inSetup('forward();'))).toBe('Line 2: forward needs one number, like forward(2).');
    expect(compileError(inSetup('forward(1, 2);'))).toBe('Line 2: forward needs one number, like forward(2).');
    expect(compileError(inSetup('backward();'))).toBe('Line 2: backward needs one number, like backward(2).');
    expect(compileError(inSetup('turnLeft(2);'))).toBe("Line 2: turnLeft doesn't take a number. Write turnLeft(); to turn once.");
    expect(compileError(inSetup('turnRight(1);'))).toBe("Line 2: turnRight doesn't take a number. Write turnRight(); to turn once.");
    expect(compileError(inSetup('int d = distanceAhead(1);'))).toBe("Line 2: distanceAhead doesn't take a number. Write distanceAhead().");
    expect(compileError(inSetup('delay();'))).toBe('Line 2: delay needs one number of milliseconds, like delay(500).');
    expect(compileError(inSetup('Serial.begin();'))).toBe('Line 2: Serial.begin needs one number, like Serial.begin(9600).');
    expect(compileError(inSetup('Serial.print();'))).toBe('Line 2: Serial.print needs one thing to print, like Serial.print(x).');
    expect(compileError(inSetup('Serial.println("a", 2);'))).toBe('Line 2: Serial.println prints one thing at a time, like Serial.println(x).');
  });

  it('wrong number of arguments to student functions', () => {
    expect(compileError('void hop(int a, int b) {}\nvoid setup() { hop(1); }\nvoid loop() {}')).toBe(
      'Line 2: hop needs 2 values in its ( ), but got 1.',
    );
    expect(compileError('void hop(int a) {}\nvoid setup() { hop(); }\nvoid loop() {}')).toBe(
      'Line 2: hop needs 1 value in its ( ), but got 0.',
    );
    expect(compileError('void hop() {}\nvoid setup() { hop(3); }\nvoid loop() {}')).toBe(
      "Line 2: hop doesn't take any values. Write hop();",
    );
  });

  it('missing setup()', () => {
    const c = compile('void loop() {}');
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.error.message).toBe('Your code needs a void setup() { } part. It runs once at the start.');
      expect(c.error.line).toBeNull();
    }
  });

  it('missing loop()', () => {
    expect(compileError('void setup() {}')).toBe("Your code needs a void loop() { } part. It can be empty, but it has to be there.");
  });

  it('empty program', () => {
    expect(compileError('')).toBe('Your code needs a void setup() { } part. It runs once at the start.');
  });

  it('setup/loop with the wrong shape', () => {
    expect(compileError('int setup() { return 0; }\nvoid loop() {}')).toBe('Line 1: setup must be written exactly as void setup().');
    expect(compileError('void setup() {}\nvoid loop(int n) {}')).toBe('Line 2: loop must be written exactly as void loop().');
  });

  it('= inside an if condition is a warning, not an error', () => {
    const src = inSetup('int x = 1;\nif (x = 2) {\n  forward(1);\n}');
    expect(compile(src).ok).toBe(true);
    expect(warningsOf(src)).toEqual(['Line 3: Did you mean == ? A single = changes the variable.']);
  });

  it('= inside a while or for condition is a warning', () => {
    expect(warningsOf(inSetup('int x = 0;\nwhile (x = 0) { }'))).toEqual(['Line 3: Did you mean == ? A single = changes the variable.']);
    expect(warningsOf(inSetup('for (int i = 0; i = 3; i++) { }'))).toEqual(['Line 2: Did you mean == ? A single = changes the variable.']);
  });

  it('crash message names the line', () => {
    const src = `void setup() {
}

void loop() {
  forward(1);
  forward(10);
}`;
    const { result } = run(src);
    expect(result.status).toBe('crash');
    expect(result.error?.message).toBe('Crashed into a wall on line 6.');
  });
});

describe('unsupported features', () => {
  it.each([
    ['int a[3];', "Line 2: Arrays (like int a[5]) aren't supported in RoverSim yet."],
    ['int* p;', "Line 2: Pointers aren't supported in RoverSim yet."],
    ['int x = 1;\nint y = *x;', "Line 3: Pointers aren't supported in RoverSim yet."],
    ['float speed = 1;', "Line 2: Decimal numbers (float) aren't supported in RoverSim yet. Use int."],
    ['double d;', "Line 2: Decimal numbers (double) aren't supported in RoverSim yet. Use int."],
    ['char c;', `Line 2: char isn't supported in RoverSim yet. For text, put it in quotes inside Serial.print("...").`],
    ['String s;', `Line 2: String isn't supported in RoverSim yet. For text, put it in quotes inside Serial.print("...").`],
    ['switch (1) { }', "Line 2: switch isn't supported in RoverSim yet. Use if / else if instead."],
    ['do { forward(1); } while (true);', "Line 2: do-while loops aren't supported in RoverSim yet. Use a while loop instead."],
    ['while (true) { break; }', "Line 2: break isn't supported in RoverSim yet. Put the stop condition in your while ( ) instead."],
    ['while (true) { continue; }', "Line 2: continue isn't supported in RoverSim yet. Use an if instead."],
    ['forward(2.5);', "Line 2: Decimal numbers like 2.5 aren't supported in RoverSim yet. Use whole numbers."],
  ])('%s', (body, message) => {
    expect(compileError(inSetup(body))).toBe(message);
  });

  it('class and struct', () => {
    expect(compileError('class Rover {};\nvoid setup() {}\nvoid loop() {}')).toBe("Line 1: Classes aren't supported in RoverSim yet.");
    expect(compileError('struct Pos { int x; };\nvoid setup() {}\nvoid loop() {}')).toBe("Line 1: Structs aren't supported in RoverSim yet.");
  });

  it('#define in student code', () => {
    expect(compileError('#define STEPS 3\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 1: #define isn't supported in RoverSim yet. Use a variable instead, like int speed = 3;",
    );
  });

  it('includes', () => {
    expect(compile('#include "Rover.h"\n#include <Arduino.h>\nvoid setup() {}\nvoid loop() {}').ok).toBe(true);
    expect(compileError('#include <Rover.h>\nvoid setup() {}\nvoid loop() {}')).toBe(
      'Line 1: Write #include "Rover.h" with quotes, because Rover.h sits next to your sketch.',
    );
  });

  it('default parameter values', () => {
    expect(compileError('void hop(int n = 2) {}\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 1: Default values in ( ) aren't supported in RoverSim yet.",
    );
  });

  it('commas inside for ( )', () => {
    expect(compileError(inSetup('int j = 0;\nfor (int i = 0; i < 3; i++, j++) {}'))).toBe(
      "Line 3: Commas inside for ( ) aren't supported in RoverSim yet.",
    );
  });
});

describe('other syntax mistakes', () => {
  it.each([
    ['if x > 2 { }', 'Line 2: The condition after if needs to be inside ( ), like if (x > 2).'],
    ['while true { }', 'Line 2: The condition after while needs to be inside ( ), like while (x > 2).'],
    ['if () { }', 'Line 2: The ( ) after if needs a condition inside, like if (x > 2).'],
    ['int x = 1;\nif (x > 2 { }', 'Line 3 is missing a ).'],
    ['forward(1;', 'Line 2 is missing a ).'],
    ['forward(1));', 'Line 2 has an extra ).'],
    ['forward 2;', 'Line 2: forward needs ( ) around its number, like forward(2);'],
    ['int x 5;', "Line 2: To give 'x' a value, use =, like int x = 5;"],
    ['int = 5;', "Line 2: After 'int' you need a name, like int steps = 3;"],
    ['int if = 5;', "Line 2: 'if' is a special word in C++, so it can't be used as a name."],
    ['int x = ;', "Line 2 is missing a value after '='."],
    ['int x = 2 + ;', "Line 2 is missing a value after '+'."],
    ['else { }', 'Line 2 has an else without an if right before it.'],
    ['void x;', "Line 2: Variables can't be void. Use int or bool."],
    ['5 = x;', 'Line 2: The left side of = must be a variable name.'],
    ['forward(1)++;', 'Line 2: ++ only works on a variable, like steps++;'],
    ['for (int i = 0, i < 3, i++) { }', 'Line 2: The for needs two ; inside the ( ), like for (int i = 0; i < 4; i++)'],
    ['for (int i = 0 i < 3; i++) { }', 'Line 2: The for needs two ; inside the ( ), like for (int i = 0; i < 4; i++)'],
    ['for (int i = 0; i < 3 i++) { }', 'Line 2: The for needs two ; inside the ( ), like for (int i = 0; i < 4; i++)'],
    ['for (int i = 0; i < 3; i++;) { }', 'Line 2: The for ( ) only needs two ;. Remove the last one.'],
    ['const int n;', 'Line 2: A const needs a value right away, like const int n = 3;'],
    ['if (true)', 'Line 2: The if needs something to do after the ( ), like { forward(1); }'],
  ])('%s', (body, message) => {
    expect(compileError(inSetup(body))).toBe(message);
  });

  it('a function started inside another function', () => {
    // Balanced braces overall, so this gets past the brace check.
    const src = 'void setup() {\n  forward(1);\nvoid loop() {\n}\n}';
    expect(compileError(src)).toBe("Line 3: void loop() starts a new function, but the function above it isn't closed with a } yet.");
  });

  it('code outside any function', () => {
    expect(compileError('forward(1);\nvoid setup() {}\nvoid loop() {}')).toBe(
      'Line 1: Commands need to go inside setup() or loop(), between the { }.',
    );
  });

  it('function without a return type', () => {
    expect(compileError('setup() {\n}\nvoid loop() {}')).toBe('Line 1: Functions need a type in front, like void setup().');
  });

  it('function without a body', () => {
    expect(compileError('void setup()\nvoid loop() {}')).toBe('Line 1: setup() needs { } after the ( ), like void setup() { }.');
  });

  it('unclosed ( across lines', () => {
    expect(compileError(inSetup('forward(1\n;'))).toBe('The ( on line 2 is never closed with a ).');
    expect(compileError(inSetup('forward((1 +\n2;'))).toBe('The ( on line 2 is never closed with a ).');
  });

  it('code that ends in the middle of a statement', () => {
    expect(compileError('void setup() {}\nvoid loop() {}\nint x =')).toBe("Line 3 is missing a value after '='.");
    expect(compileError('void setup() {}\nvoid loop() {}\nint')).toBe("Line 3: After 'int' you need a name, like int steps = 3;");
  });
});

describe('other checker errors', () => {
  it('command used without ( )', () => {
    expect(compileError(inSetup('turnLeft;'))).toBe('Line 2: turnLeft is a command, so it needs ( ) after it, like turnLeft();');
    expect(compileError('void hop(int n) {}\nvoid setup() { hop; }\nvoid loop() {}')).toBe(
      'Line 2: hop is a command, so it needs ( ) after it, like hop(1);',
    );
  });

  it('variable used like a command', () => {
    expect(compileError(inSetup('int steps = 2;\nsteps();'))).toBe("Line 3: 'steps' is a variable, not a command.");
  });

  it('void command used as a value', () => {
    expect(compileError(inSetup('int x = turnLeft();'))).toBe("Line 2: turnLeft() doesn't give back a value, so it can't be used here.");
    expect(compileError(inSetup('forward(forward(1));'))).toBe("Line 2: forward() doesn't give back a value, so it can't be used here.");
  });

  it('text outside Serial.print', () => {
    expect(compileError(inSetup('int x = "hi";'))).toBe('Line 2: Text in quotes can only go inside Serial.print( ) or Serial.println( ).');
    expect(compileError(inSetup('Serial.println("a" + 1);'))).toBe('Line 2: Text in quotes can only go inside Serial.print( ) or Serial.println( ).');
  });

  it('unknown Serial command', () => {
    expect(compileError(inSetup('Serial.prnt(1);'))).toBe("Line 2: Serial doesn't have a command called 'prnt'. Did you mean 'print'?");
  });

  it('dot on something other than Serial', () => {
    expect(compileError(inSetup('rover.forward(1);'))).toBe('Line 2: The dot (.) only works with Serial, like Serial.println(x);');
  });

  it('Serial used alone', () => {
    expect(compileError(inSetup('Serial.println;'))).toBe('Line 2: Serial.println needs ( ) after it, like Serial.println(x);');
  });

  it('changing a const', () => {
    expect(compileError(inSetup('const int n = 2;\nn = 3;'))).toBe("Line 3: 'n' is const, so it can't be changed.");
    expect(compileError(inSetup('const int n = 2;\nn++;'))).toBe("Line 3: 'n' is const, so it can't be changed.");
  });

  it('++ on a bool', () => {
    expect(compileError(inSetup('bool b = true;\nb++;'))).toBe("Line 3: ++ only works on int variables, and 'b' is a bool.");
  });

  it('function named like a built-in', () => {
    expect(compileError('void forward(int n) {}\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 1: 'forward' is already a built-in command. Pick a different name for your function.",
    );
  });

  it('variable named like a command', () => {
    expect(compileError(inSetup('int forward = 2;'))).toBe(
      "Line 2: 'forward' is already a command name. Pick a different name for this variable.",
    );
  });

  it('two functions with the same name', () => {
    expect(compileError('void hop() {}\nvoid hop() {}\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 2: There's already a function called 'hop' on line 1. Give this one a different name.",
    );
    expect(compileError('void hop() {}\nvoid hop(int n) {}\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 2: There's already a function called 'hop' on line 1. Give this one a different name.",
    );
  });

  it('prototype without a body', () => {
    expect(compileError('void hop();\nvoid setup() {}\nvoid loop() {}')).toBe(
      "Line 1: 'hop' is declared here but never written. Add its { } part.",
    );
  });

  it('return with a value in a void function', () => {
    expect(compileError('void setup() {\n  return 5;\n}\nvoid loop() {}')).toBe(
      "Line 2: setup is a void function, so its return can't give back a value. Just write return;",
    );
  });

  it('return without a value in an int function', () => {
    expect(compileError('int f() {\n  return;\n}\nvoid setup() {}\nvoid loop() {}')).toBe(
      'Line 2: f has to give back a value, like return 0;',
    );
  });

  it('robot command in a global initializer', () => {
    expect(compileError('int d = distanceAhead();\nvoid setup() {}\nvoid loop() {}')).toBe(
      'Line 1: A variable outside any function can only start with a plain value, like int steps = 3;',
    );
  });
});

describe('warnings', () => {
  it('; right after if/while/for', () => {
    expect(warningsOf(inSetup('if (true); { forward(1); }'))).toEqual([
      "Line 2: The ; right after if ( ) ends the if, so the lines below aren't part of it. Remove that ;.",
    ]);
    expect(warningsOf(inSetup('int i = 0;\nwhile (i < 3); { i++; }'))).toEqual([
      "Line 3: The ; right after while ( ) ends the while, so the lines below aren't part of it. Remove that ;.",
    ]);
  });

  it('== used as a statement', () => {
    expect(warningsOf(inSetup('int x = 1;\nx == 2;'))).toEqual([
      "Line 3: This line compares two things but doesn't change anything. Did you mean = ?",
    ]);
  });

  it('Serial.print without Serial.begin', () => {
    expect(warningsOf(inSetup('Serial.println(1);'))).toEqual([
      'Line 2: On the real rover, Serial.print only shows up if setup() has Serial.begin(9600);',
    ]);
    expect(warningsOf(inSetup('Serial.begin(9600);\nSerial.println(1);'))).toEqual([]);
  });

  it('clean code has no warnings', () => {
    expect(warningsOf(inSetup('int x = 1;\nif (x == 1) { forward(1); }'))).toEqual([]);
  });
});

describe('error positions', () => {
  it('points at the exact token for the underline', () => {
    const src = inSetup('  foward(2);');
    const c = compile(src);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(src.slice(c.error.from, c.error.to)).toBe('foward');
  });

  it('never reports internals for strange input', () => {
    for (const junk of ['}{', ')(', 'void', 'void setup(', '((((', 'int x = (', 'void setup() { if', '"', '/*', '+++']) {
      const c = compile(junk);
      expect(c.ok).toBe(false);
      if (!c.ok) {
        expect(c.error.message).not.toMatch(/undefined|null|internal|token|Error|NaN|\[object/);
      }
    }
  });
});
