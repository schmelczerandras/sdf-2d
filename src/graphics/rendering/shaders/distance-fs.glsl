#version 300 es

precision lowp float;

#define FLOAT_LINEAR_ENABLED {floatLinearEnabled}

uniform float maxMinDistance;
uniform float distanceNdcPixelSize;
in vec2 position;

uniform sampler2D palette;

#define WEBGL2_IS_AVAILABLE

vec4 readFromPalette(int index) {
  return texture(palette, vec2((float(index) + 0.5) / {paletteSize}, 0.5));
}

{macroDefinitions}

{declarations}

layout(location = 0) out vec4 fragmentColor;
layout(location = 1) out float distanceValue;

void main() {
    float minDistance = maxMinDistance, objectMinDistance;
    vec4 color = {backgroundColor};
    vec4 objectColor;

    {functionCalls}

      #if FLOAT_LINEAR_ENABLED
        distanceValue = minDistance;
      #else
        distanceValue = minDistance * 8.0;
      #endif

    fragmentColor = color;
}
