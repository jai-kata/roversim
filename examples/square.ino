#include "Rover.h"

// Drive a 2x2 square, printing each side.
int side = 2;

void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 4; i++) {
    forward(side);
    turnRight();
    Serial.print("side ");
    Serial.println(i + 1);
  }
}
