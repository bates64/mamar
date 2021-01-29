#version 140

in vec2 position;
in vec2 uv;

out vec2 vertex_uv;

uniform mat4 matrix;
uniform mat4 transform;

void main() {
    vertex_uv = uv;
    gl_Position = matrix * transform * vec4(position, 0.0, 1.0);
}
