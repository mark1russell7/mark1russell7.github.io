/**
 * The fluid is a stable-fluids solver (Jos Stam, 1999) on a coarse grid. It operates on the CPU, so the cards can read the velocity directly.
 * The velocity is in cells for each second. The dye has three channels, red, green and blue, from 0 to approximately 1.
 */
export class Fluid {
  readonly nx: number;
  readonly ny: number;
  /** The size of one cell, in CSS pixels. */
  readonly cell: number;
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  private u: Float64Array;
  private v: Float64Array;
  private u0: Float64Array;
  private v0: Float64Array;
  private r0: Float64Array;
  private g0: Float64Array;
  private b0: Float64Array;
  private readonly p: Float64Array;
  private readonly div: Float64Array;
  private readonly curl: Float64Array;
  private readonly stride: number;

  constructor(width: number, height: number, cell: number) {
    this.cell = cell;
    this.nx = Math.max(8, Math.round(width / cell));
    this.ny = Math.max(8, Math.round(height / cell));
    this.stride = this.nx + 2;
    const size = this.stride * (this.ny + 2);
    this.u = new Float64Array(size);
    this.v = new Float64Array(size);
    this.u0 = new Float64Array(size);
    this.v0 = new Float64Array(size);
    this.r = new Float64Array(size);
    this.g = new Float64Array(size);
    this.b = new Float64Array(size);
    this.r0 = new Float64Array(size);
    this.g0 = new Float64Array(size);
    this.b0 = new Float64Array(size);
    this.p = new Float64Array(size);
    this.div = new Float64Array(size);
    this.curl = new Float64Array(size);
  }

  /** This method gives the index of the cell `i`, `j`. The cells of the boundary have `i` or `j` equal to 0 or to the size plus 1. */
  index(i: number, j: number): number {
    return i + this.stride * j;
  }

  /**
   * This method adds velocity and dye in a disc with a soft edge. The position and the radius are in CSS pixels.
   * The velocity is in CSS pixels for each second.
   */
  splat(x: number, y: number, vx: number, vy: number, radius: number, color: readonly [number, number, number] | null, amount = 1): void {
    const cx = x / this.cell + 0.5;
    const cy = y / this.cell + 0.5;
    const rc = Math.max(1, radius / this.cell);
    const i0 = Math.max(1, Math.floor(cx - rc * 2));
    const i1 = Math.min(this.nx, Math.ceil(cx + rc * 2));
    const j0 = Math.max(1, Math.floor(cy - rc * 2));
    const j1 = Math.min(this.ny, Math.ceil(cy + rc * 2));
    const du = vx / this.cell;
    const dv = vy / this.cell;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i - cx;
        const dy = j - cy;
        const w = Math.exp(-(dx * dx + dy * dy) / (rc * rc));
        if (w < 0.01) continue;
        const k = this.index(i, j);
        this.u[k]! += du * w;
        this.v[k]! += dv * w;
        if (color) {
          this.r[k] = Math.min(1.4, this.r[k]! + color[0] * w * amount);
          this.g[k] = Math.min(1.4, this.g[k]! + color[1] * w * amount);
          this.b[k] = Math.min(1.4, this.b[k]! + color[2] * w * amount);
        }
      }
    }
  }

  /** This method sets the velocity in a rectangle to the velocity of a moving solid. The units are CSS pixels. */
  solid(left: number, top: number, width: number, height: number, vx: number, vy: number, strength: number): void {
    const i0 = Math.max(1, Math.round(left / this.cell) + 1);
    const i1 = Math.min(this.nx, Math.round((left + width) / this.cell));
    const j0 = Math.max(1, Math.round(top / this.cell) + 1);
    const j1 = Math.min(this.ny, Math.round((top + height) / this.cell));
    const du = vx / this.cell;
    const dv = vy / this.cell;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = this.index(i, j);
        this.u[k]! += (du - this.u[k]!) * strength;
        this.v[k]! += (dv - this.v[k]!) * strength;
      }
    }
  }

  /** This method gives the velocity at a point, in CSS pixels for each second. It writes the result to `out`. */
  sample(x: number, y: number, out: { x: number; y: number }): void {
    out.x = this.interpolate(this.u, x / this.cell + 0.5, y / this.cell + 0.5) * this.cell;
    out.y = this.interpolate(this.v, x / this.cell + 0.5, y / this.cell + 0.5) * this.cell;
  }

  /** This method moves the fluid forward by `dt` seconds. */
  step(dt: number, options: { vorticity: number; velocityDecay: number; dyeDecay: number; iterations: number; smooth: number }): void {
    this.confine(dt, options.vorticity);
    this.advect(dt);
    this.bound(this.u, 1);
    this.bound(this.v, 2);
    this.project(options.iterations);
    this.smooth(options.smooth);
    const velocityKeep = Math.exp(-options.velocityDecay * dt);
    const dyeKeep = Math.exp(-options.dyeDecay * dt);
    for (let k = 0; k < this.u.length; k++) {
      this.u[k]! *= velocityKeep;
      this.v[k]! *= velocityKeep;
      this.r[k]! *= dyeKeep;
      this.g[k]! *= dyeKeep;
      this.b[k]! *= dyeKeep;
    }
  }

  private interpolate(field: Float64Array, x: number, y: number): number {
    const fx = Math.min(this.nx + 0.5, Math.max(0.5, x));
    const fy = Math.min(this.ny + 0.5, Math.max(0.5, y));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const s = fx - i;
    const t = fy - j;
    const k = this.index(i, j);
    return (1 - t) * ((1 - s) * field[k]! + s * field[k + 1]!) + t * ((1 - s) * field[k + this.stride]! + s * field[k + this.stride + 1]!);
  }

  /**
   * Semi-Lagrangian advection: each cell takes the values from the point that the velocity carries to it.
   * One pass moves the velocity and the three channels of the dye, because they use the same point and the same weights.
   */
  private advect(dt: number): void {
    const { u, v, r, g, b, u0, v0, r0, g0, b0, stride, nx, ny } = this;
    const maxX = nx + 0.5;
    const maxY = ny + 0.5;
    for (let j = 1; j <= ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = i + stride * j;
        let x = i - dt * u[k]!;
        let y = j - dt * v[k]!;
        x = x < 0.5 ? 0.5 : x > maxX ? maxX : x;
        y = y < 0.5 ? 0.5 : y > maxY ? maxY : y;
        const i0 = x | 0;
        const j0 = y | 0;
        const s = x - i0;
        const t = y - j0;
        const k0 = i0 + stride * j0;
        const k1 = k0 + 1;
        const k2 = k0 + stride;
        const k3 = k2 + 1;
        const w0 = (1 - s) * (1 - t);
        const w1 = s * (1 - t);
        const w2 = (1 - s) * t;
        const w3 = s * t;
        u0[k] = w0 * u[k0]! + w1 * u[k1]! + w2 * u[k2]! + w3 * u[k3]!;
        v0[k] = w0 * v[k0]! + w1 * v[k1]! + w2 * v[k2]! + w3 * v[k3]!;
        r0[k] = w0 * r[k0]! + w1 * r[k1]! + w2 * r[k2]! + w3 * r[k3]!;
        g0[k] = w0 * g[k0]! + w1 * g[k1]! + w2 * g[k2]! + w3 * g[k3]!;
        b0[k] = w0 * b[k0]! + w1 * b[k1]! + w2 * b[k2]! + w3 * b[k3]!;
      }
    }
    [this.u, this.u0] = [u0, u];
    [this.v, this.v0] = [v0, v];
    [this.r, this.r0] = [r0, r];
    [this.g, this.g0] = [g0, g];
    [this.b, this.b0] = [b0, b];
  }

  /**
   * This method blends each velocity with the mean of its four neighbors. The blend removes the checkerboard noise of a grid
   * that keeps the pressure and the velocity in the same cells.
   */
  private smooth(amount: number): void {
    if (amount <= 0) return;
    const { u, v, stride, nx, ny } = this;
    const keep = 1 - amount;
    const mix = amount * 0.25;
    for (let j = 1; j <= ny; j++) {
      for (let k = 1 + stride * j, end = k + nx; k < end; k++) {
        u[k] = keep * u[k]! + mix * (u[k - 1]! + u[k + 1]! + u[k - stride]! + u[k + stride]!);
        v[k] = keep * v[k]! + mix * (v[k - 1]! + v[k + 1]! + v[k - stride]! + v[k + stride]!);
      }
    }
  }

  /** Vorticity confinement adds back the small swirls that the coarse grid loses. */
  private confine(dt: number, strength: number): void {
    if (strength <= 0) return;
    const { u, v, curl, stride, nx, ny } = this;
    for (let j = 1; j <= ny; j++) {
      for (let k = 1 + stride * j, end = k + nx; k < end; k++) {
        curl[k] = (v[k + 1]! - v[k - 1]! - (u[k + stride]! - u[k - stride]!)) * 0.5;
      }
    }
    const scale = dt * strength;
    for (let j = 2; j < ny; j++) {
      for (let k = 2 + stride * j, end = k + nx - 2; k < end; k++) {
        const gx = (Math.abs(curl[k + 1]!) - Math.abs(curl[k - 1]!)) * 0.5;
        const gy = (Math.abs(curl[k + stride]!) - Math.abs(curl[k - stride]!)) * 0.5;
        const f = (scale * curl[k]!) / (Math.sqrt(gx * gx + gy * gy) + 1e-5);
        u[k]! += gy * f;
        v[k]! -= gx * f;
      }
    }
  }

  /** The projection removes the divergence, so the fluid does not compress. A Gauss-Seidel solver calculates the pressure. */
  private project(iterations: number): void {
    const { u, v, p, div, stride, nx, ny } = this;
    for (let j = 1; j <= ny; j++) {
      for (let k = 1 + stride * j, end = k + nx; k < end; k++) {
        div[k] = -0.5 * (u[k + 1]! - u[k - 1]! + v[k + stride]! - v[k - stride]!);
        p[k] = 0;
      }
    }
    this.bound(div, 0);
    this.bound(p, 0);
    for (let n = 0; n < iterations; n++) {
      for (let j = 1; j <= ny; j++) {
        for (let k = 1 + stride * j, end = k + nx; k < end; k++) {
          p[k] = (div[k]! + p[k - 1]! + p[k + 1]! + p[k - stride]! + p[k + stride]!) * 0.25;
        }
      }
      this.bound(p, 0);
    }
    for (let j = 1; j <= ny; j++) {
      for (let k = 1 + stride * j, end = k + nx; k < end; k++) {
        u[k]! -= 0.5 * (p[k + 1]! - p[k - 1]!);
        v[k]! -= 0.5 * (p[k + stride]! - p[k - stride]!);
      }
    }
    this.bound(u, 1);
    this.bound(v, 2);
  }

  /** The walls reflect the normal velocity. Mode 1 is the horizontal velocity, mode 2 is the vertical velocity, and mode 0 copies the value. */
  private bound(field: Float64Array, mode: 0 | 1 | 2): void {
    const { nx, ny } = this;
    for (let j = 1; j <= ny; j++) {
      field[this.index(0, j)] = mode === 1 ? -field[this.index(1, j)]! : field[this.index(1, j)]!;
      field[this.index(nx + 1, j)] = mode === 1 ? -field[this.index(nx, j)]! : field[this.index(nx, j)]!;
    }
    for (let i = 1; i <= nx; i++) {
      field[this.index(i, 0)] = mode === 2 ? -field[this.index(i, 1)]! : field[this.index(i, 1)]!;
      field[this.index(i, ny + 1)] = mode === 2 ? -field[this.index(i, ny)]! : field[this.index(i, ny)]!;
    }
  }
}
