# Tools review: 3D generation and rendering frameworks

Reviewed 2026-10-14 for Fairway. The game is vanilla three.js r186 with no
build step. It is played on a Mac (this machine: Apple M1, 8 GB) with a
Garmin R10. The question for each tool: does it make the courses or the game
better, at a licence the project can live with?

## 3D generation (image or text to mesh)

| Tool | What it makes | Licence | Runs on | Verdict |
|---|---|---|---|---|
| **TRELLIS.2** (Microsoft) | image → PBR GLB (base colour, roughness, metallic, opacity), 4B params, up to 1536³ | MIT | NVIDIA, ≥24 GB VRAM, Linux only | **Best fit for hero landmarks**, run on a rented GPU or its Hugging Face demo, never in the game |
| **Hunyuan3D-2** (Tencent) | image (or text via its API server) → mesh + texture; 6 GB shape, 16 GB with texture | Tencent Hunyuan 3D 2.0 Community License: **not licensed in the EU, UK or South Korea**; >1M MAU needs a separate licence | CUDA; macOS listed | **Rejected**: the territorial exclusion clashes with French courses (Paris, Cassis) and with sharing the game |
| **stable-fast-3d** (Stability AI) | single image → UV-unwrapped GLB in about a second; ~6 GB | Stability AI Community License: free under US $1M annual revenue | CUDA; Apple MPS experimental (recommends ≥32 GB unified memory, else CPU) | **Usable for props** (benches, carts, signs) on CPU here; quality below TRELLIS.2 |
| **Meshy** (MCP server) | text or image → textured mesh, remesh, rigging | Commercial API, prepaid credits (text-to-3D preview 5–20 credits, texture 10–15) | Cloud | **Optional**: fastest route from a prompt, but costs credits per asset; needs `MESHY_API_KEY` |

### How a generated asset would enter Fairway

1. Generate from a reference photo (TRELLIS.2 for landmarks such as the
   Basilica or the Piasa; stable-fast-3d for small props).
2. Clean it in Blender with the existing pipeline (`tools/blender/`):
   decimate to a budget (landmarks ≤40k triangles, props ≤3k), bake to 1k
   textures, export GLB with Draco off (three.js loads it as is).
3. Place it as a `far` landmark or course prop, and add its licence to
   `docs/SOURCES.md`.

**Decision:** the course landmarks stay hand-modelled for now. They are
built from published dimensions and the photographs you sent, read
correctly at golf distances, and cost a few hundred triangles each.
Generated meshes earn their place only for a hero object seen up close. The
first candidate is the Piasa mural bluff behind the Confluence's
amphitheatre hole. That needs a GPU this Mac does not have, so it waits on
your call: a rented GPU for TRELLIS.2, or Meshy credits.

## Rendering frameworks

| Tool | What it is | Verdict |
|---|---|---|
| **react-three-fiber** (pmndrs) | React renderer for three.js | **Not adopted.** It would need React and a build step, and a rewrite of ~20k lines of working scene code, for no frame-rate or visual gain. Fairway's UI is light DOM plus GSAP; the scene is imperative by nature (physics-driven ball, camera rig). |
| **@react-three/postprocessing** | React bindings for the `postprocessing` library | **Not adopted as is.** The underlying vanilla **`postprocessing`** library (merged effect passes, SMAA, better bloom, N8AO ambient occlusion) is the part worth having. It is a candidate to replace the current UnrealBloom pass if profiling shows headroom on the R10 laptop. |
| **threejs-skills** (cloudai-x and similar) | Claude Code skill files: three.js API references and patterns | **Useful to the developer, not the game.** Worth installing for future sessions on this repo; it changes nothing at runtime. |

## Already in use from this review's neighbourhood

- Poly Haven: CC0 HDRIs (sky light), scanned tree and ground textures.
- Blender, via `tools/blender/`, for tree and detail processing.
- Copernicus Sentinel-2 L2A for ground colour (`tools/fetch-sat.py`).

Sources: github.com/microsoft/TRELLIS.2, github.com/Tencent-Hunyuan/Hunyuan3D-2
(LICENSE), github.com/Stability-AI/stable-fast-3d (README, LICENSE.md),
docs.meshy.ai/api/pricing, github.com/cloudai-x/threejs-skills.
