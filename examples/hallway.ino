#include "Rover.h"

void setup() {
  Serial.begin(9600);
}

void loop() {
  while (distanceAhead() > 0) {
    forward(1);
  }
  Serial.println(distanceAhead());
  turnRight();
}
