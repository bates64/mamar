#version 140

uniform sampler2D tex;
uniform mat4 projection;

in vec2 position;
in vec2 uv;
in vec4 color;
in float z;

out vec2 v_uv;
out vec4 v_color;

void main() {
    gl_Position = projection * vec4(position, z + 1.0, 1.0);
    v_uv = uv;
    v_color = color;
}
