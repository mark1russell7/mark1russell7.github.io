import type { Fluid } from "./fluid.ts";

const vertexSource = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const fragmentSource = `
precision mediump float;
uniform sampler2D uDye;
uniform vec2 uTexel;
uniform vec2 uRes;
uniform float uTime;
varying vec2 vUv;

// A cubic B-spline filter with four linear samples (Sigg and Hadwiger, GPU Gems 2). The coarse dye then has no blocks or diamonds.
vec4 spline(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) / 6.0;
}

vec3 dye(vec2 uv) {
  vec2 size = 1.0 / uTexel;
  vec2 p = uv * size - 0.5;
  vec2 f = fract(p);
  p -= f;
  vec4 xc = spline(f.x);
  vec4 yc = spline(f.y);
  vec4 c = p.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) * uTexel.xxyy;
  vec3 s0 = texture2D(uDye, o.xz).rgb;
  vec3 s1 = texture2D(uDye, o.yz).rgb;
  vec3 s2 = texture2D(uDye, o.xw).rgb;
  vec3 s3 = texture2D(uDye, o.yw).rgb;
  float sx = s.x / (s.x + s.y);
  float sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

float lum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }

void main() {
  vec2 uv = vUv;
  vec3 d = dye(uv);
  vec3 cx1 = dye(uv + vec2(uTexel.x, 0.0));
  vec3 cx0 = dye(uv - vec2(uTexel.x, 0.0));
  vec3 cy1 = dye(uv + vec2(0.0, uTexel.y));
  vec3 cy0 = dye(uv - vec2(0.0, uTexel.y));

  // The dye acts as a height field. Its slope gives a normal for a soft highlight.
  vec3 n = normalize(vec3((lum(cx0) - lum(cx1)) * 2.5, (lum(cy0) - lum(cy1)) * 2.5, 1.0));
  float spec = pow(max(dot(n, normalize(vec3(-0.4, -0.5, 0.75))), 0.0), 18.0);

  vec3 abyss = vec3(0.020, 0.105, 0.135);
  vec3 shallow = vec3(0.050, 0.235, 0.275);
  float depth = smoothstep(0.0, 1.0, 1.0 - uv.y * 0.85 + 0.08 * sin(uv.x * 4.0 + uTime * 0.07));
  vec3 water = mix(abyss, shallow, depth * 0.6);

  // Slow caustics: two crossed sine fields make a light net on the floor of the pool.
  vec2 p = uv * uRes / 150.0;
  float caustic = sin(p.x * 1.9 + uTime * 0.31 + sin(p.y * 1.5 + uTime * 0.17) * 1.7) * sin(p.y * 2.1 - uTime * 0.23 + sin(p.x * 1.2 - uTime * 0.11) * 1.5);
  water += vec3(0.020, 0.060, 0.058) * smoothstep(0.55, 1.0, caustic);

  vec3 glow = 1.0 - exp(-d * 2.4);
  vec3 color = water * (1.0 - glow * 0.35) + glow * 0.82 + spec * 0.10 * (0.25 + lum(glow));
  gl_FragColor = vec4(color, 1.0);
}`;

/** The water draws the dye of the fluid on a canvas with WebGL, with a soft highlight and slow caustics. */
export class Water {
  private readonly gl: WebGLRenderingContext;
  private readonly texture: WebGLTexture;
  private readonly bytes: Uint8Array;
  private readonly uniforms: { texel: WebGLUniformLocation | null; res: WebGLUniformLocation | null; time: WebGLUniformLocation | null };

  private constructor(gl: WebGLRenderingContext, program: WebGLProgram, private readonly fluid: Fluid) {
    this.gl = gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    if (!texture) throw new Error("WebGL did not create a texture");
    this.texture = texture;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bytes = new Uint8Array(fluid.nx * fluid.ny * 4);
    this.uniforms = {
      texel: gl.getUniformLocation(program, "uTexel"),
      res: gl.getUniformLocation(program, "uRes"),
      time: gl.getUniformLocation(program, "uTime"),
    };
  }

  /** This function makes the water for a canvas. It gives null when the browser has no WebGL. */
  static create(canvas: HTMLCanvasElement, fluid: Fluid): Water | null {
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);
    return new Water(gl, program, fluid);
  }

  /** This method draws one frame. The time is in seconds. */
  draw(time: number): void {
    const { gl, fluid, bytes } = this;
    const { nx, ny } = fluid;
    let o = 0;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = fluid.index(i, j);
        bytes[o] = Math.min(255, fluid.r[k]! * 200);
        bytes[o + 1] = Math.min(255, fluid.g[k]! * 200);
        bytes[o + 2] = Math.min(255, fluid.b[k]! * 200);
        bytes[o + 3] = 255;
        o += 4;
      }
    }
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nx, ny, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    gl.uniform2f(this.uniforms.texel, 1 / nx, 1 / ny);
    gl.uniform2f(this.uniforms.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(this.uniforms.time, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
