#version 140

uniform sampler2D tex;
uniform mat4 projection;

in vec2 v_uv;

out vec4 color;

void main() {
    color = texture(tex, v_uv);
}
