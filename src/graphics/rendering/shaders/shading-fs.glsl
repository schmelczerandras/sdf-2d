#version 300 es

precision lowp float;

#define INTENSITY_INSIDE_RATIO {intensityInsideRatio}
#define SHADOW_TRACE_COUNT {shadowTraceCount}
#define FLOAT_LINEAR_ENABLED {floatLinearEnabled}

{macroDefinitions}

uniform float shadingNdcPixelSize;
uniform float distanceNdcPixelSize;
uniform vec2 squareToAspectRatioTimes2;
uniform vec3 ambientLight;

uniform sampler2D distanceTexture;
uniform sampler2D colorTexture;

in vec2 position;
in vec2 uvCoordinates;

vec4 getColor(vec2 target) {
    return texture(colorTexture, target);
}

float getDistance(vec2 target) {
  #if FLOAT_LINEAR_ENABLED
    return texture(distanceTexture, target)[0];
  #else
    return texture(distanceTexture, target)[0] / 8.0;
  #endif
}

float shadowTransparency(float startingDistance, float lightCenterDistance, vec2 direction) {
    float rayLength = startingDistance;
    for (int i = 0; i < SHADOW_TRACE_COUNT; i++) {
        rayLength += max(0.0, getDistance(uvCoordinates + direction * rayLength));
    }
    return min(1.0, pow(rayLength / lightCenterDistance, 0.3));
}

#ifdef CIRCLE_LIGHT_COUNT
#if CIRCLE_LIGHT_COUNT > 0
    uniform vec2 circleLightCenters[CIRCLE_LIGHT_COUNT];
    uniform float circleLightIntensities[CIRCLE_LIGHT_COUNT];
    uniform vec3 circleLightColors[CIRCLE_LIGHT_COUNT];

    vec3 colorInPosition(int lightIndex, out float lightCenterDistance) {
        lightCenterDistance = distance(circleLightCenters[lightIndex], position);
        return circleLightColors[lightIndex] / pow(
            lightCenterDistance / circleLightIntensities[lightIndex] + 1.0, 2.0
        );
    }
#endif
#endif

#ifdef FLASHLIGHT_COUNT
#if FLASHLIGHT_COUNT > 0
    uniform vec2 flashlightCenters[FLASHLIGHT_COUNT];
    uniform float flashlightIntensities[FLASHLIGHT_COUNT];
    uniform vec3 flashlightColors[FLASHLIGHT_COUNT];
    uniform vec2 flashlightDirections[FLASHLIGHT_COUNT];
    uniform float flashlightStartCutoffs[FLASHLIGHT_COUNT];

    float intensityInDirection(vec2 lightDirection, vec2 targetDirection) {
        return smoothstep(
            0.0,
            1.0,
            10.0 * max(0.0, dot(targetDirection, -lightDirection) - 0.9)
        );
    }

    vec3 colorInPosition(int lightIndex, vec2 positionDirection, out float lightCenterDistance) {
        lightCenterDistance = distance(flashlightCenters[lightIndex], position);
        return intensityInDirection(flashlightDirections[lightIndex], positionDirection) *
            flashlightColors[lightIndex] / pow(
                lightCenterDistance / flashlightIntensities[lightIndex] + 1.0, 2.0
            );
    }
#endif
#endif

out vec4 fragmentColor;
void main() {
    vec4 rgbaColorAtPosition = getColor(uvCoordinates);
    vec3 colorAtPosition = rgbaColorAtPosition.rgb;

    float startingDistance = getDistance(uvCoordinates);

    vec3 lighting = ambientLight;
    vec3 lightingInside = ambientLight;
    
    #ifdef CIRCLE_LIGHT_COUNT
    #if CIRCLE_LIGHT_COUNT > 0
    for (int i = 0; i < CIRCLE_LIGHT_COUNT; i++) {
        float lightCenterDistance;
        vec3 lightColorAtPosition = colorInPosition(i, lightCenterDistance);

        vec2 direction = normalize(circleLightCenters[i] - position) / squareToAspectRatioTimes2;
        lighting += lightColorAtPosition * shadowTransparency(
            startingDistance, 
            lightCenterDistance, 
            direction
        );
          
        lightingInside += lightColorAtPosition;
    }
    #endif
    #endif

    #ifdef FLASHLIGHT_COUNT
    #if FLASHLIGHT_COUNT > 0
    for (int i = 0; i < FLASHLIGHT_COUNT; i++) {
        vec2 originalDirection = normalize(flashlightCenters[i] - position);

        float lightCenterDistance;
        vec3 lightColorAtPosition = colorInPosition(
            i,
            originalDirection,
            lightCenterDistance
        );
        
        if (lightCenterDistance < flashlightStartCutoffs[i]) {
            continue;
        }

        vec2 direction = originalDirection / squareToAspectRatioTimes2;

        if (length(lightColorAtPosition) < 0.0) {
            continue;
        }

        lighting += lightColorAtPosition * shadowTransparency(
            startingDistance, 
            lightCenterDistance, 
            direction
        );

        lightingInside += lightColorAtPosition;
    }
    #endif
    #endif

    vec3 outsideColor = {backgroundColor}.rgb * lighting;
    vec3 insideColor = colorAtPosition * lightingInside * INTENSITY_INSIDE_RATIO;
    
    float edge = clamp(startingDistance / shadingNdcPixelSize, 0.0, 1.0);
    vec3 antialiasedColor = mix(insideColor, outsideColor, edge);
    fragmentColor = vec4(
        antialiasedColor,
        rgbaColorAtPosition.a
    );
}
