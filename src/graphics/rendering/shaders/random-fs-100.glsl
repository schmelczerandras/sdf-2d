#version 100

#ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
#else
  precision mediump float;
#endif

varying vec2 uvCoordinates;

uniform float scale;
uniform float amplitude;

// source: https://www.shadertoy.com/view/XdXGW8
vec2 random2(vec2 st){
    st = vec2(
        dot(st, vec2(127.1,311.7)),
        dot(st, vec2(269.5,183.3))
    );
    return -1.0 + 2.0 * fract(sin(st) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(
            dot(random2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(random2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x
        ),
        mix(
            dot(random2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(random2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x
        ), 
        u.y
    );
}


void main() {
    gl_FragColor = vec4(vec3(noise(uvCoordinates * scale) * 0.5 * amplitude + 0.5), 1.0);
}
