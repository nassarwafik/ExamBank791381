# Mesh asset provenance — Phase 21D-B

This record covers every file in `public/mesh-assets/`. Each library asset is listed in the code-owned catalog
`src/meshModels/meshAssetCatalog.ts`, which pins its SHA-256 and byte length. The catalog integrity test
(`src/meshModels/meshAssetCatalog.21db.test.ts`) fails if a file, hash, length, part list or provenance field drifts. A file is
never replaced in place: any change becomes a new version and gets a new content-addressed file name.

## Source

| Item | Value |
|---|---|
| Work | BodyParts3D 4.0, The Database Center for Life Science (DBCLS), Japan |
| Project page | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/ |
| Download page | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html |
| Archive used | `partof_BP3D_4.0_obj_99.zip` (PART-OF tree, OBJ, 99% polygon reduction), https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/partof_BP3D_4.0_obj_99.zip |
| Archive SHA-256 | `9fbc713fffeee924a5a657d9813d84d7eb957bded63adb854931dd5e3eb61c97` (62 MB, 1,258 files) |
| Retrieved | 2026-10-10 |
| Licensor's licence page | https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html ("Last updated: 2025/02/27"): Creative Commons Attribution 4.0 International |
| Required attribution (verbatim) | BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International |
| Notice inside the source OBJ files | Each OBJ header carries an older Creative Commons Attribution-Share Alike 2.1 Japan notice |

## Licence of the derived files

The licensor's current page licenses BodyParts3D under CC BY 4.0. The OBJ files themselves still carry the older CC BY-SA 2.1 JP
notice. To honour both texts, ExamBank publishes its derived GLB files under **CC BY-SA 4.0**
(https://creativecommons.org/licenses/by-sa/4.0/):

- CC BY 4.0 allows any licence for adaptations.
- CC BY-SA 2.1 JP allows adaptations under a later version of a licence with the same elements.

The same statement appears in three places:

- the `asset.copyright` field of every GLB: "Derived from BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0 (source
  notice CC BY-SA 2.1 JP); this file CC BY-SA 4.0";
- `public/mesh-assets/NOTICE.txt`, served next to the files;
- the provenance panel of the viewer ("مصدر النموذج وترخيصه"). The panel shows the source with a link, the verbatim attribution
  with a link to the licensor's licence page, the derived-file licence, ExamBank's modifications and the educational limitations.

ShareAlike applies to the model files and their adaptations. It does not extend to the application code that displays them: the
files are separate works, loaded as data.

## Conversion

`scripts/convert-bodyparts3d-21db.mts` performs the conversion deterministically. Run it as:

```
BP3D_ZIP=/path/to/partof_BP3D_4.0_obj_99.zip node --experimental-strip-types scripts/convert-bodyparts3d-21db.mts
```

The script refuses any archive except the one recorded above, so the same archive always produces the same output bytes. It:

1. Reads the listed element meshes (FJ file ids).
2. Converts millimetres to metres, and Z-up / −Y-anterior to glTF Y-up / +Z-anterior.
3. Centres each model.
4. Merges the elements of each labelled part.
5. Optionally clips a vessel and simplifies. The quadric edge-collapse simplifier `src/meshModels/meshSimplify.ts` keeps original
   source vertices only; it invents no new geometry.
6. Writes one named node per part with an educational material.
7. Validates the result with the same GLB authority (`inspectGlbAsset`) that the server and the browser use.

`docs/mesh-assets/bodyparts3d-21db-manifest.json` records, for every part, each source element (FJ file id, FMA concept id, English
name) and the triangle counts before and after simplification.

## Assets

| Catalog id | Version | File (SHA-256) | Bytes | Triangles | Parts |
|---|---|---|---|---|---|
| `human-heart-bp3d` | 1 | `61e01bcfb305f44ce5a81d7a403f193a3b7e66c022a4f694fb5304b7c1c219d7.glb` | 2,001,400 | 99,207 (not simplified) | 14 |
| `human-brain-bp3d` | 1 | `6de4ff20027acf242675d73e99da45b5e285abb7e7e6b79dc40e4ad6a30ccf5c.glb` | 2,531,732 | 118,856 (from 237,720; ratio 0.5) | 10 |

### Human heart (`human-heart-bp3d` v1)

**Parts:**

| Part | Source elements |
|---|---|
| Right atrium | Wall of right atrium |
| Left atrium | Wall of left atrium |
| Right ventricle | Cavity of right ventricle |
| Left ventricle | Cavity of left ventricle |
| Aorta | Ascending aorta + arch of aorta |
| Pulmonary trunk | Pulmonary trunk |
| Superior vena cava | Superior vena cava |
| Inferior vena cava | Inferior vena cava, clipped at 1,165 mm |
| Coronary arteries | 54 elements: right and left coronary trunks and their branches |
| Cardiac veins | Coronary sinus, great, small and marginal cardiac veins |
| Valves | Leaflets / cusps of the tricuspid, mitral, aortic and pulmonary valves |

**Educational limitations** (also shown to teachers and students in the viewer):

- A single adult heart from BodyParts3D. It is not a diagnostic or measurement tool, and it does not represent variation between
  individuals.
- The archive used provides no ventricular myocardium (muscle wall) surface. The ventricles are therefore represented by their
  cavity surfaces, and some posterior coronary branches float slightly off that surface. No geometry was fabricated to hide this.
- Not shown:
  - the pulmonary veins (their openings are visible on the left atrium);
  - the papillary muscles, which were left out because, without the ventricular wall, they protrude through the cavity surfaces;
  - the chordae tendineae.
- The inferior vena cava is clipped just below the heart.
- The colours follow a teaching convention, not real tissue colour: red for vessels carrying oxygenated blood, blue for vessels
  carrying deoxygenated blood (including the pulmonary trunk).

### Human brain (`human-brain-bp3d` v1)

**Parts.** Lobes are grouped from BodyParts3D gyri:

| Part | Source elements |
|---|---|
| Frontal lobe | Superior, middle and inferior frontal gyri + precentral gyrus |
| Parietal lobe | Postcentral gyrus, superior parietal lobule, supramarginal and angular gyri |
| Temporal lobe | Middle and inferior temporal gyri + fusiform gyrus |
| Occipital lobe | Occipital lobe |
| Insula | Insula |
| Cerebellum | Cerebellum |
| Midbrain | Midbrain |
| Pons | Pons |
| Medulla oblongata | Medulla oblongata |
| White matter | White matter of the cerebral hemispheres |

Each structure has a left and a right element.

**Educational limitations:**

- A single adult brain from BodyParts3D. It is not a diagnostic tool.
- Not included: the superior temporal gyrus, the orbital gyri and the medial surface (including the cingulate gyrus). White matter
  and the insula are therefore visible in places.
- The lobe colours are an educational code, not tissue colour.
- Simplification to about 50 % makes the detail of the sulci approximate.
- Not shown: cranial nerves, meninges, vessels and ventricles.

## Not used, and why

The BodyParts3D lungs are not included. The source provides bronchial trees and vessels but no lobe surfaces, so a recognisable lobe
model could not be built without fabricating geometry. The brain was chosen as the second model instead.
