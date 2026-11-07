# Spreading Liquid with Three.js — mofu-dev Demo

> Faithful reconstruction of the interactive **#liquid-spreading-demo** from [Spreading Liquid with Three.js (mofu-dev.com)](https://mofu-dev.com/en/blog/fluid-foundation/?via=dailydev#liquid-spreading-demo) by Misaki Nakano, powered by Three.js and custom GLSL GPGPU simulations.

---

## 1. Features & Interactions

1. **Minimalist Frame**:
   - Pure white backdrop (`#ffffff`).
   - Centered square container with a subtle 1px border.
   - Precision crosshair cursor (`cursor: crosshair`).
2. **Glossy 3D Droplet**:
   - Initial sky-blue hemispherical droplet resting in the center.
   - Sharp top-right specular reflection highlight and ambient subsurface bounce.
3. **Viscous Liquid Spreading**:
   - Dragging across the droplet shears and spreads the substance like thick cosmetics cream or viscous paint.
   - Flow lines and bulging ridges catch dynamic specular light.
   - Preserves a translucent wetting footprint (`alphaMap`) where liquid has passed.
4. **Instant Reset**:
   - Pill-shaped `Reset` button at the bottom of the container.
   - Restores the original spherical droplet immediately.

---

## 2. Technical Architecture & Shader Pipeline

1. **Navier-Stokes Solver (`FluidSimulation.js`)**:
   - **BFECC Advection**: 2nd-order Back and Forth Error Compensation for sharp, low-dissipation flow advection.
   - **Poisson Pressure Solver**: 32 Jacobi iterations to project velocity into an incompressible, divergence-free vector field.
   - **Viscous Damping**: Natural momentum decay so the fluid settles after dragging stops.
2. **Height Map Advection (`height.frag`)**:
   - Semi-Lagrangian backtrace (`backtraceUv`) to compute advected thickness.
   - Velocity thresholding to dynamically subtract sheared liquid (`removed`) and deposit upstream fluid (`added`).
3. **Historical Alpha Map (`alpha.frag`)**:
   - Tracks historical maximums to maintain a soft 50% opacity wetting trail even after liquid thins out.
4. **Dynamic Normal & Matcap Shading (`render.frag`)**:
   - Analytical surface normals computed on GPU via cross-product of spatial height gradients:  
     `normal = -normalize(cross(positionX - position, positionY - position))`
   - Samples procedural sky-blue Matcap using `normal.zx * 0.5 + 0.5` and composites smoothly over `#ffffff`.

---

## 3. Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm (or npm / yarn)

### Installation & Run

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

## 4. Credits & Acknowledgments
- [Misaki Nakano (mofu-dev)](https://mofu-dev.com/en/blog/fluid-foundation/) for the original concept, height-map spreading algorithm, and Matcap approach.
- [mnmxmx/fluid-three](https://github.com/mnmxmx/fluid-three) for the WebGL Navier-Stokes Stable Fluids reference.
