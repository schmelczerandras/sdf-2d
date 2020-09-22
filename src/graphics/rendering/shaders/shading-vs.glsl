#version 300 es

precision lowp float;

{macroDefinitions}

uniform mat3 modelTransform;
in vec4 vertexPosition;

out vec2 position;
out vec2 uvCoordinates;

uniform vec2 squareToAspectRatio;

#ifdef CIRCLE_LIGHT_COUNT
#if CIRCLE_LIGHT_COUNT > 0
    uniform vec2 circleLightCenters[CIRCLE_LIGHT_COUNT];
    out vec2[CIRCLE_LIGHT_COUNT] circleLightDirections;
#endif
#endif

#ifdef FLASHLIGHT_COUNT
#if FLASHLIGHT_COUNT > 0
    uniform vec2 flashlightCenters[FLASHLIGHT_COUNT];
    out vec2[FLASHLIGHT_COUNT] flashlightActualDirections;
#endif
#endif

void main() {
    vec3 vertexPosition2D = vec3(vertexPosition.xy, 1.0) * modelTransform;
    gl_Position = vec4(vertexPosition2D.xy, 0.0, 1.0);
    position = vertexPosition2D.xy * squareToAspectRatio;

    uvCoordinates = (vertexPosition2D * mat3(
        0.5, 0.0, 0.5,
        0.0, 0.5, 0.5,
        0.0, 0.0, 1.0
    )).xy;

    #ifdef CIRCLE_LIGHT_COUNT
    #if CIRCLE_LIGHT_COUNT > 0
        for (int i = 0; i < CIRCLE_LIGHT_COUNT; i++) {
            circleLightDirections[i] = circleLightCenters[i] - position;
        }
    #endif
    #endif

    #ifdef FLASHLIGHT_COUNT
    #if FLASHLIGHT_COUNT > 0
        for (int i = 0; i < FLASHLIGHT_COUNT; i++) {
            flashlightActualDirections[i] = flashlightCenters[i] - position;
        }
    #endif
    #endif
}
