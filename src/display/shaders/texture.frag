#version 140

in vec2 vertex_uv;
out vec4 color;

uniform sampler2D tex;

void main() {
    color = texture(tex, vertex_uv);
}
