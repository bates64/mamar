#version 140

uniform sampler2D tex;
uniform mat4 projection;

in vec2 v_uv;
in vec4 v_color;

out vec4 color;

void main() {
    color = v_color * texture(tex, v_uv);
}
