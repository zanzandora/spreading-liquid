# Spreading Liquid with Three.js — Authentic mofu-dev Architecture

> 100% faithful, physically accurate reconstruction of the interactive cosmetics liquid spreading demo from [Spreading Liquid with Three.js (mofu-dev.com)](https://mofu-dev.com/en/blog/fluid-foundation/?via=dailydev#liquid-spreading-demo) by Misaki Nakano.

---

## 1. Physical Architecture & Core Mechanics

The simulation strictly adheres to the author's original WebGL pipeline:
1. **Eulerian Navier-Stokes Solver (`FluidSimulation.js`)**:
   - Reconstructed from [`mnmxmx/fluid-three`](https://github.com/mnmxmx/fluid-three).
   - Generates the continuous local velocity vector field $\vec{u}$ using 2nd-order BFECC advection and 32 Jacobi Poisson projection steps.
   - Viscous dissipation prevents residual swirling so velocity naturally decays like a thick viscous emulsion.
2. **Dynamic Height Map Transport with Velocity Thresholding (`height.frag`)**:
   - Semi-Lagrangian backtrace: `backtraceUv(uv, flow, fboSize, dt)`.
   - **Velocity Thresholding (`velocityThreshold`)**: Evaluates `smoothstep(velocityThreshold.x, velocityThreshold.y, length(flow))` to keep distant regions stationary while allowing active core shearing.
   - **Mass Transfer (`removed` & `added`)**:
     $$\text{removed} = \min(h_{\text{prev}}, \text{strength} \times 0.3 \times h_{\text{prev}})$$
     $$\text{added} = \min(h_{\text{source}}, \text{sourceStrength} \times 0.3 \times h_{\text{source}})$$
     Naturally scoops troughs under the cursor and accumulates ridges along the flanks and front bow wave without artificial geometric carving.
3. **Historical Alpha Trace Map (`alpha.frag`)**:
   - Double-buffered FBO tracking peak history:
     $$\text{maximum} = \max(\text{current}, \text{previousMaximum})$$
     $$\text{FragColor} = (\text{maximum}, \text{maximum} \times 0.5 + \text{current} \times 0.5, 0.0, 0.0)$$
   - Leaves a soft, translucent wetting footprint where liquid has passed.
4. **Analytical Normal & Matcap Shading (`render.frag`)**:
   - Surface normals derived via finite-difference cross product on 32-bit floating-point textures:
     $$\vec{n} = -\text{normalize}\left(\text{cross}(\mathbf{p}_x - \mathbf{p}, \mathbf{p}_y - \mathbf{p})\right)$$
   - Samples procedural sky-blue Matcap via $\vec{n}_{zx} \cdot 0.5 + 0.5$.
   - Composited smoothly over pure white background (`#ffffff`).

---

## 2. Technical Specifications

- **FBO Format**: 32-bit floating point (`type: THREE.FloatType`) with `THREE.LinearFilter` for sub-texel interpolation and banding-free normal derivatives.
- **FBO Separation**: Dedicated FBOs for `heightMap` and `alphaMap`.
- **Canvas Container**: Centered square container (520x520) with thin gray border and pill-shaped `Reset` button.

---

## 3. Getting Started

```bash
# Clone the repository
git clone https://github.com/zanzandora/spreading-liquid.git
cd spreading-liquid

# Install dependencies
pnpm install

# Start Vite dev server
pnpm run dev

# Build for production
pnpm run build
```

Open your browser at **`http://localhost:3000`**.

---

## 4. Credits
- [Misaki Nakano (mofu-dev)](https://mofu-dev.com/en/blog/fluid-foundation/) for the original concept and algorithms.
- [mnmxmx/fluid-three](https://github.com/mnmxmx/fluid-three) for the WebGL Stable Fluids reference.
