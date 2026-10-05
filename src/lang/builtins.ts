// Robot commands that exist both here and in hardware/Rover.h.
export interface BuiltinInfo {
  params: number;
  returns: 'void' | 'int';
  usage: string; // shown when the argument count is wrong
}

export const BUILTINS: Record<string, BuiltinInfo> = {
  forward: { params: 1, returns: 'void', usage: 'forward needs one number, like forward(2).' },
  backward: { params: 1, returns: 'void', usage: 'backward needs one number, like backward(2).' },
  turnLeft: { params: 0, returns: 'void', usage: "turnLeft doesn't take a number. Write turnLeft(); to turn once." },
  turnRight: { params: 0, returns: 'void', usage: "turnRight doesn't take a number. Write turnRight(); to turn once." },
  distanceAhead: { params: 0, returns: 'int', usage: "distanceAhead doesn't take a number. Write distanceAhead()." },
  delay: { params: 1, returns: 'void', usage: 'delay needs one number of milliseconds, like delay(500).' },
};

export const BUILTIN_EXAMPLES: Record<string, string> = {
  forward: 'forward(1);',
  backward: 'backward(1);',
  turnLeft: 'turnLeft();',
  turnRight: 'turnRight();',
  distanceAhead: 'distanceAhead()',
  delay: 'delay(500);',
};

export interface SerialMethodInfo {
  minArgs: number;
  maxArgs: number;
  usage: string;
}

export const SERIAL_METHODS: Record<string, SerialMethodInfo> = {
  begin: { minArgs: 1, maxArgs: 1, usage: 'Serial.begin needs one number, like Serial.begin(9600).' },
  print: { minArgs: 1, maxArgs: 1, usage: 'Serial.print needs one thing to print, like Serial.print(x).' },
  println: { minArgs: 0, maxArgs: 1, usage: 'Serial.println prints one thing at a time, like Serial.println(x).' },
};

// Names the Arduino itself uses, so student functions can't take them.
export const RESERVED_FUNCTION_NAMES = new Set(['main', 'Serial']);
