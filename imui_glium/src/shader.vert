#version 140

uniform sampler2D tex;
uniform mat4 projection;

in vec2 position;
in vec2 uv;

out vec2 v_uv;

void main() {
    gl_Position = projection * vec4(position, 0.0, 1.0);
    v_uv = uv;
}
