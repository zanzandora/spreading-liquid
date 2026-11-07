# Spreading Liquid with Three.js — 2.5D Viscoplastic Paste Demo

> Faithful, physically grounded reconstruction of the interactive cosmetic foundation spreading demo from [Spreading Liquid with Three.js (mofu-dev.com)](https://mofu-dev.com/en/blog/fluid-foundation/?via=dailydev#liquid-spreading-demo) by Misaki Nakano.

---

## 1. Physical Insights: Why 2D Navier-Stokes Fails vs. 2.5D Viscoplastic Paste

Standard Eulerian 2D Navier-Stokes solvers (divergence-free $\nabla_{2D} \cdot \vec{u} = 0$, Poisson pressure projection, and vorticity confinement) are designed for low-viscosity fluids (smoke, water dye, ink). When applied to viscous cosmetic cream:
- **Global Dipole Distortion**: The 2D incompressibility condition forces fluid across the entire canvas to circulate in wide dipole vortices, warping untouched regions and hitting canvas boundaries.
- **Inability to Form Troughs and Ridges**: Pure coordinate advection $h(\mathbf{u} - \vec{v}\Delta t)$ is a smooth diffeomorphism that merely stretches and flattens a convex dome without ever creating new local minima (grooves under the brush) or local maxima (plowed ridges on the flanks).

**Cosmetic cream is a Bingham viscoplastic paste** in creeping Stokes flow (zero inertia):
1. **Stationary Outside Brush**: When not in contact with the applicator, the cream remains perfectly motionless.
2. **2.5D Deformation & Mass Redistribution**: The applicator carves a trough ($h$ decreases) and plows cream outward to form bulging ridges along the flanks and front bow wave.

---

## 2. Technical Architecture & Shader Pipeline

The entire system is powered by a high-performance **2.5D Local Heightfield Smearing & Plowing** pipeline using Three.js GPGPU Ping-Pong render targets:

```
[Pointer Drag Input (UV)]
          │
          ▼
[Step B: heightSmearFrag] ──> PingPongRenderTarget (512x512 HalfFloat)
  ├── sdSegment (no gaps)
  ├── Local Smear Advection
  ├── Trough Carving (scooped)
  ├── Mexican-Hat Ridge Plowing (deposited)
  └── Head Ripples under Cursor
          │
          ▼
[Step C: liquidRenderFrag] ──> Screen Canvas
  ├── 4-tap Gradient Surface Normal
  ├── Calibrated uNormalScale
  ├── Procedural MatCap View-Space Lookup
  └── Beer-Lambert Thin-Film Fade onto #ffffff
```

### Step A: True Hemispherical Dome Initialization (`initDropFrag`)
$$h(x, y) = \sqrt{\max\left(0.0, R^2 - \|\mathbf{p} - \mathbf{c}\|^2\right)}$$
Produces the true 3D dome geometry and antialiased contact rim matching the video's initial state.

### Step B: Local Smear Advection & Plowing (`heightSmearFrag`)
- **Continuous Capsule Distance (`sdSegment`)**: Prevents stroke fragmentation during rapid drags.
- **Local Smear Advection**: Only coordinates inside the brush carry thickness forward.
- **Mass-Conserving Plowing**:
  - Center ($d < 0.78 R$): Scoops out a trough.
  - Flanks ($0.7 R < d < 1.35 R$) & Bow Wave: Mounds the scooped volume into sharp ridges.
- **Concentric Head Ripples**: Generates subtle tactile ridges directly under the cursor.

### Step C: Analytical Normal Reconstruction & Matcap Shading (`liquidRenderFrag`)
- Computes analytical surface normal via finite-difference gradient:
  $$\vec{n} = \text{normalize}\left( -\nabla h \cdot u_{\text{NormalScale}}, 1.0 \right)$$
- Looks up the sky-blue glossy MatCap texture via view-space normal mapping:
  $$\text{UV}_{\text{Matcap}} = \vec{n}_{xy} \cdot 0.492 + 0.5$$
- Smoothly blends with pure white (`#ffffff`) using thin-film thickness attenuation.

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

## 4. Credits & Acknowledgments
- [Misaki Nakano (mofu-dev)](https://mofu-dev.com/en/blog/fluid-foundation/) for the original creative concept and Matcap inspiration.
