/**
 * Textbook diagrams for biology, drawn once and drawn properly.
 *
 * An organ or a cell is hard to draw freehand, for a model as much as for a
 * student, and a diagram that is roughly right teaches the wrong thing. The
 * common diagrams of the secondary biology syllabus are therefore drawn here,
 * and the assistant only chooses one and says which parts to label:
 *
 *   {"template": "heart", "labels": [{"part": "left_ventricle"}, ...]}
 *
 * Each template names its parts and where a label should point. English and
 * French names are built in, so a French answer gets French labels.
 *
 * Canvas as everywhere in figures: x 0-100 left to right, y 0-height top to
 * bottom.
 */

import type { FigureShape, LabelSide, Point } from "./ai-figure";

export type TemplatePart = { point: Point; en: string; fr: string; side?: LabelSide };

export type FigureTemplate = {
  title: { en: string; fr: string };
  height: number;
  aliases: string[];
  shapes: FigureShape[];
  parts: Record<string, TemplatePart>;
};

const dots = (points: Point[], r = 0.55, fill = "#1f2937"): FigureShape[] =>
  points.map(([cx, cy]) => ({ type: "circle", cx, cy, r, fill, stroke: "#1f2937" }));

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

const ANIMAL_CELL: FigureTemplate = {
  title: { en: "Animal cell", fr: "Cellule animale" },
  height: 70,
  aliases: ["animal-cell", "animal cell", "cell-animal", "human-cell", "cheek-cell"],
  shapes: [
    { type: "path", d: "M 14 30 C 12 14 34 6 52 7 C 72 8 90 16 89 34 C 88 52 74 64 52 64 C 30 64 16 50 14 30 Z", fill: "pink", stroke: "#be185d" },
    // rough endoplasmic reticulum wrapped around the nucleus
    { type: "path", d: "M 40 20 C 44 16 50 15 55 16 M 38 25 C 42 20 50 19 57 20 M 37 30 C 39 26 42 24 44 23", stroke: "#0369a1" },
    ...dots([[41, 19], [46, 16.8], [51, 16], [40, 24], [46, 20.6], [53, 20]], 0.45),
    { type: "circle", cx: 56, cy: 33, r: 11, fill: "purple" },
    { type: "circle", cx: 56, cy: 33, r: 3.6, fill: "darkgreen" },
    // mitochondria with their folded inner membrane
    { type: "ellipse", cx: 28, cy: 46, rx: 6.5, ry: 3.2, fill: "orange" },
    { type: "path", d: "M 23.5 46 L 25 44.2 L 26.5 47.6 L 28 44.2 L 29.5 47.6 L 31 44.2 L 32.5 46", stroke: "#c2410c" },
    { type: "ellipse", cx: 74, cy: 50, rx: 6, ry: 3, fill: "orange" },
    { type: "path", d: "M 69.8 50 L 71.2 48.3 L 72.6 51.6 L 74 48.3 L 75.4 51.6 L 76.8 48.3 L 78.2 50", stroke: "#c2410c" },
    // Golgi body: stacked curved sacs
    { type: "path", d: "M 70 18 C 74 16 79 17 81 20 M 69 21 C 73 19 78 20 80 23 M 68 24 C 72 22 77 23 79 26", stroke: "#a16207" },
    { type: "circle", cx: 82.5, cy: 22, r: 0.9, fill: "yellow" },
    { type: "circle", cx: 30, cy: 27, r: 4, fill: "lightblue" },
    ...dots([[36, 40], [40, 52], [48, 55], [62, 52], [66, 44], [22, 36], [34, 56], [80, 38]]),
  ],
  parts: {
    cell_membrane: { point: [14.2, 32], en: "Cell membrane", fr: "Membrane cellulaire" },
    cytoplasm: { point: [44, 58], en: "Cytoplasm", fr: "Cytoplasme" },
    nucleus: { point: [63, 27], en: "Nucleus", fr: "Noyau" },
    nuclear_membrane: { point: [66.5, 36], en: "Nuclear membrane", fr: "Membrane nucléaire" },
    nucleolus: { point: [56, 33], en: "Nucleolus", fr: "Nucléole" },
    mitochondrion: { point: [28, 46], en: "Mitochondrion", fr: "Mitochondrie" },
    ribosome: { point: [40, 52], en: "Ribosome", fr: "Ribosome" },
    endoplasmic_reticulum: { point: [44, 17], en: "Rough endoplasmic reticulum", fr: "Réticulum endoplasmique rugueux" },
    golgi_body: { point: [79, 20.5], en: "Golgi body", fr: "Appareil de Golgi" },
    vacuole: { point: [30, 27], en: "Small vacuole", fr: "Petite vacuole" },
  },
};

const PLANT_CELL: FigureTemplate = {
  title: { en: "Plant cell", fr: "Cellule végétale" },
  height: 80,
  aliases: ["plant-cell", "plant cell", "cell-plant", "palisade-cell"],
  shapes: [
    { type: "rect", x: 8, y: 6, w: 84, h: 68, r: 5, fill: "lightgreen", stroke: "#166534" },
    { type: "rect", x: 11, y: 9, w: 78, h: 62, r: 4, fill: "#f7fee7", stroke: "#15803d" },
    { type: "path", d: "M 22 22 C 30 16 58 16 66 22 C 72 28 72 52 66 58 C 58 64 30 64 22 58 C 16 52 16 28 22 22 Z", fill: "lightblue", stroke: "#0369a1" },
    { type: "ellipse", cx: 79, cy: 22, rx: 6.5, ry: 7.5, fill: "purple" },
    { type: "circle", cx: 79, cy: 22, r: 2.3, fill: "darkgreen" },
    ...([[16, 14], [48, 13], [78, 40], [79, 62], [16, 66], [40, 67]] as Point[]).flatMap(([cx, cy]): FigureShape[] => [
      { type: "ellipse", cx, cy, rx: 4.4, ry: 2.2, fill: "green", stroke: "#15803d" },
      { type: "path", d: `M ${cx - 2.6} ${cy} L ${cx + 2.6} ${cy} M ${cx - 1.8} ${cy - 0.9} L ${cx + 1.8} ${cy - 0.9} M ${cx - 1.8} ${cy + 0.9} L ${cx + 1.8} ${cy + 0.9}`, stroke: "#166534" },
    ]),
    { type: "ellipse", cx: 15.5, cy: 40, rx: 2.4, ry: 4.4, fill: "orange" },
  ],
  parts: {
    cell_wall: { point: [8.3, 30], en: "Cellulose cell wall", fr: "Paroi cellulosique" },
    cell_membrane: { point: [11.3, 52], en: "Cell membrane", fr: "Membrane cellulaire" },
    vacuole: { point: [52, 46], en: "Large permanent vacuole", fr: "Grande vacuole", side: "right" },
    tonoplast: { point: [67.2, 30], en: "Tonoplast", fr: "Tonoplaste" },
    cytoplasm: { point: [82, 50], en: "Cytoplasm", fr: "Cytoplasme" },
    nucleus: { point: [84, 18], en: "Nucleus", fr: "Noyau" },
    nucleolus: { point: [79, 22], en: "Nucleolus", fr: "Nucléole" },
    chloroplast: { point: [16, 14], en: "Chloroplast", fr: "Chloroplaste" },
    mitochondrion: { point: [15.5, 40], en: "Mitochondrion", fr: "Mitochondrie" },
  },
};

const BACTERIUM: FigureTemplate = {
  title: { en: "Bacterial cell", fr: "Cellule bactérienne" },
  height: 50,
  aliases: ["bacterium", "bacteria", "bacterial-cell", "prokaryote", "prokaryotic-cell"],
  shapes: [
    { type: "rect", x: 8, y: 8, w: 70, h: 32, r: 16, fill: "#fdf4ff", stroke: "#a21caf", dashed: true },
    { type: "rect", x: 11, y: 11, w: 64, h: 26, r: 13, fill: "yellow", stroke: "#a16207" },
    { type: "rect", x: 13, y: 13, w: 60, h: 22, r: 11, fill: "#fffbeb", stroke: "#ca8a04" },
    { type: "path", d: "M 30 22 C 33 18 37 26 40 22 C 43 18 47 27 50 23 C 53 19 56 27 58 24 C 55 29 49 28 45 28 C 40 29 34 29 30 26 C 28 25 28 23 30 22", stroke: "#1d4ed8" },
    { type: "circle", cx: 22, cy: 28, r: 2.2, stroke: "#b91c1c" },
    { type: "circle", cx: 64, cy: 18, r: 1.8, stroke: "#b91c1c" },
    ...dots([[20, 19], [26, 31], [36, 32], [55, 31], [62, 28], [44, 17], [67, 25]], 0.5),
    { type: "path", d: "M 78 24 C 82 18 85 30 89 24 C 92 19 94 28 97 24", stroke: "#374151" },
    { type: "path", d: "M 20 8.5 L 18 3 M 34 8 L 34 2.5 M 50 8 L 51 2.5 M 30 40 L 29 45.5 M 52 40 L 53 45.5", stroke: "#374151" },
  ],
  parts: {
    capsule: { point: [72, 39.5], en: "Capsule (slime layer)", fr: "Capsule", side: "right" },
    cell_wall: { point: [11.3, 18], en: "Cell wall", fr: "Paroi cellulaire" },
    cell_membrane: { point: [13.3, 30], en: "Cell membrane", fr: "Membrane cellulaire" },
    cytoplasm: { point: [58, 33], en: "Cytoplasm", fr: "Cytoplasme", side: "right" },
    nucleoid: { point: [46, 24], en: "Circular DNA (nucleoid)", fr: "ADN circulaire" },
    plasmid: { point: [64, 16.2], en: "Plasmid", fr: "Plasmide" },
    ribosome: { point: [26, 31], en: "Ribosome", fr: "Ribosome" },
    flagellum: { point: [89, 24], en: "Flagellum", fr: "Flagelle" },
    pili: { point: [34, 4], en: "Pili", fr: "Pili", side: "top" },
  },
};

// ---------------------------------------------------------------------------
// Plants
// ---------------------------------------------------------------------------

const FLOWER: FigureTemplate = {
  title: { en: "Half flower (longitudinal section)", fr: "Coupe longitudinale d'une fleur" },
  height: 96,
  aliases: ["flower", "flower-section", "half-flower", "flower-ls", "insect-pollinated-flower", "parts-of-a-flower"],
  shapes: [
    // stalk and receptacle
    { type: "rect", x: 47, y: 72, w: 6, h: 22, r: 2, fill: "green", stroke: "#15803d" },
    { type: "path", d: "M 38 70 C 40 64 60 64 62 70 C 60 76 40 76 38 70 Z", fill: "lightgreen", stroke: "#15803d" },
    // sepals
    { type: "path", d: "M 40 70 C 30 70 20 66 16 60 C 24 60 34 63 42 67 Z", fill: "green", stroke: "#166534" },
    { type: "path", d: "M 60 70 C 70 70 80 66 84 60 C 76 60 66 63 58 67 Z", fill: "green", stroke: "#166534" },
    // petals
    { type: "path", d: "M 42 66 C 30 56 18 38 14 18 C 26 22 38 40 45 62 Z", fill: "pink", stroke: "#be185d" },
    { type: "path", d: "M 58 66 C 70 56 82 38 86 18 C 74 22 62 40 55 62 Z", fill: "pink", stroke: "#be185d" },
    // nectaries
    { type: "ellipse", cx: 43.5, cy: 64.5, rx: 2, ry: 1.2, fill: "yellow" },
    { type: "ellipse", cx: 56.5, cy: 64.5, rx: 2, ry: 1.2, fill: "yellow" },
    // stamens: filament and anther
    { type: "path", d: "M 45 64 C 40 52 34 42 31 32", stroke: "#a16207" },
    { type: "path", d: "M 55 64 C 60 52 66 42 69 32", stroke: "#a16207" },
    { type: "ellipse", cx: 30.5, cy: 29.5, rx: 2, ry: 3.6, fill: "yellow", stroke: "#a16207" },
    { type: "ellipse", cx: 69.5, cy: 29.5, rx: 2, ry: 3.6, fill: "yellow", stroke: "#a16207" },
    // carpel: ovary with ovules, style, stigma
    { type: "path", d: "M 44 64 C 42 56 44 50 50 48 C 56 50 58 56 56 64 Z", fill: "lightgreen", stroke: "#166534" },
    { type: "circle", cx: 50, cy: 53, r: 1.4, fill: "white", stroke: "#166534" },
    { type: "circle", cx: 50, cy: 58, r: 1.4, fill: "white", stroke: "#166534" },
    { type: "rect", x: 49, y: 22, w: 2, h: 26, r: 1, fill: "lightgreen", stroke: "#166534" },
    { type: "path", d: "M 45 22 C 46 17 54 17 55 22 C 53 24 47 24 45 22 Z", fill: "orange", stroke: "#c2410c" },
  ],
  parts: {
    stigma: { point: [50, 20], en: "Stigma", fr: "Stigmate" },
    style: { point: [50, 36], en: "Style", fr: "Style" },
    ovary: { point: [54.5, 52], en: "Ovary", fr: "Ovaire" },
    ovule: { point: [50, 58], en: "Ovule", fr: "Ovule" },
    anther: { point: [69.5, 29.5], en: "Anther", fr: "Anthère" },
    filament: { point: [64, 46], en: "Filament", fr: "Filet" },
    petal: { point: [22, 34], en: "Petal", fr: "Pétale" },
    sepal: { point: [24, 64], en: "Sepal", fr: "Sépale" },
    nectary: { point: [43.5, 64.5], en: "Nectary", fr: "Nectaire" },
    receptacle: { point: [60, 72], en: "Receptacle", fr: "Réceptacle" },
    stalk: { point: [53, 86], en: "Flower stalk (pedicel)", fr: "Pédoncule" },
  },
};

const LEAF_SECTION: FigureTemplate = {
  title: { en: "Transverse section of a leaf", fr: "Coupe transversale d'une feuille" },
  height: 74,
  aliases: ["leaf", "leaf-section", "leaf-structure", "leaf-cross-section", "leaf-ts", "transverse-section-of-a-leaf"],
  shapes: [
    { type: "rect", x: 4, y: 6, w: 92, h: 1.6, fill: "yellow", stroke: "#a16207" },
    ...Array.from({ length: 12 }, (_, i): FigureShape => ({ type: "rect", x: 4 + i * 7.67, y: 7.6, w: 7.67, h: 5, fill: "white", stroke: "#475569" })),
    ...Array.from({ length: 18 }, (_, i): FigureShape => ({ type: "rect", x: 4.4 + i * 5.1, y: 13, w: 4.4, h: 16, r: 2, fill: "lightgreen", stroke: "#15803d" })),
    ...Array.from({ length: 18 }, (_, i): FigureShape[] => [
      { type: "circle", cx: 6.6 + i * 5.1, cy: 16, r: 0.8, fill: "green", stroke: "#15803d" },
      { type: "circle", cx: 6.6 + i * 5.1, cy: 20.5, r: 0.8, fill: "green", stroke: "#15803d" },
      { type: "circle", cx: 6.6 + i * 5.1, cy: 25, r: 0.8, fill: "green", stroke: "#15803d" },
    ]).flat(),
    // spongy mesophyll: loose round cells with air spaces between them
    ...([[8, 34], [16, 38], [24, 33], [30, 42], [12, 46], [22, 50], [70, 34], [78, 39], [86, 33], [92, 42], [74, 48], [84, 50], [62, 44], [8, 55], [92, 55]] as Point[]).map(
      ([cx, cy]): FigureShape => ({ type: "ellipse", cx, cy, rx: 3.6, ry: 3, fill: "#dcfce7", stroke: "#15803d" }),
    ),
    // vascular bundle (vein): xylem above, phloem below
    { type: "ellipse", cx: 46, cy: 44, rx: 13, ry: 10, fill: "#fefce8", stroke: "#a16207" },
    { type: "circle", cx: 41, cy: 41, r: 2.4, fill: "white", stroke: "#1d4ed8" },
    { type: "circle", cx: 46, cy: 40, r: 2.4, fill: "white", stroke: "#1d4ed8" },
    { type: "circle", cx: 51, cy: 41, r: 2.4, fill: "white", stroke: "#1d4ed8" },
    { type: "ellipse", cx: 46, cy: 48.5, rx: 7, ry: 2.6, fill: "orange", stroke: "#c2410c" },
    // lower epidermis with a stoma between two guard cells
    ...Array.from({ length: 12 }, (_, i): FigureShape | null =>
      i === 6 ? null : { type: "rect", x: 4 + i * 7.67, y: 59, w: 7.67, h: 5, fill: "white", stroke: "#475569" },
    ).filter((s): s is FigureShape => s !== null),
    { type: "ellipse", cx: 50.6, cy: 61.5, rx: 2.4, ry: 2.6, fill: "green", stroke: "#15803d" },
    { type: "ellipse", cx: 56.4, cy: 61.5, rx: 2.4, ry: 2.6, fill: "green", stroke: "#15803d" },
    { type: "rect", x: 4, y: 64, w: 92, h: 1.2, fill: "yellow", stroke: "#a16207" },
  ],
  parts: {
    cuticle: { point: [70, 6.8], en: "Waxy cuticle", fr: "Cuticule cireuse" },
    upper_epidermis: { point: [12, 10], en: "Upper epidermis", fr: "Épiderme supérieur" },
    palisade_mesophyll: { point: [14, 21], en: "Palisade mesophyll", fr: "Parenchyme palissadique" },
    spongy_mesophyll: { point: [16, 38], en: "Spongy mesophyll", fr: "Parenchyme lacuneux" },
    air_space: { point: [20, 42], en: "Air space", fr: "Espace aérien" },
    xylem: { point: [51, 41], en: "Xylem", fr: "Xylème" },
    phloem: { point: [46, 48.5], en: "Phloem", fr: "Phloème" },
    vascular_bundle: { point: [58, 46], en: "Vascular bundle (vein)", fr: "Faisceau conducteur (nervure)" },
    lower_epidermis: { point: [80, 61.5], en: "Lower epidermis", fr: "Épiderme inférieur" },
    guard_cell: { point: [56.4, 61.5], en: "Guard cell", fr: "Cellule de garde" },
    stoma: { point: [53.5, 63], en: "Stoma", fr: "Stomate" },
  },
};

// ---------------------------------------------------------------------------
// Human biology
// ---------------------------------------------------------------------------

const HEART: FigureTemplate = {
  title: { en: "Section through the human heart", fr: "Coupe du cœur humain" },
  height: 96,
  aliases: ["heart", "human-heart", "heart-section", "structure-of-the-heart", "mammalian-heart"],
  shapes: [
    // Vessels first, so the heart wall sits over where they join it.
    // Venae cavae bring deoxygenated blood into the right atrium.
    { type: "rect", x: 23, y: 4, w: 8, h: 34, r: 2, fill: "blue", stroke: "#1d4ed8" },
    { type: "path", d: "M 17 94 L 17 44 L 31 44 L 31 51 L 24 51 L 24 94 Z", fill: "blue", stroke: "#1d4ed8" },
    // Pulmonary veins bring oxygenated blood into the left atrium.
    { type: "rect", x: 70, y: 34, w: 22, h: 4.5, r: 1, fill: "red", stroke: "#b91c1c" },
    { type: "rect", x: 70, y: 41, w: 22, h: 4.5, r: 1, fill: "red", stroke: "#b91c1c" },
    // The heart wall; the band left between the two sides is the septum.
    { type: "path", d: "M 25 36 C 25 30 32 28 40 29 L 60 29 C 68 28 75 30 75 36 L 75 54 C 75 68 62 80 50 91 C 38 80 25 68 25 54 Z", fill: "#fca5a5", stroke: "#991b1b" },
    // Right side (on the left of the page, as if facing the person).
    { type: "rect", x: 29, y: 33, w: 17, h: 16, r: 3, fill: "lightblue", stroke: "#1d4ed8" },
    { type: "path", d: "M 29 53 L 46 53 L 46 83 C 38 76 30 66 29 53 Z", fill: "lightblue", stroke: "#1d4ed8" },
    // Left side, with the thicker ventricle wall.
    { type: "rect", x: 54, y: 33, w: 17, h: 16, r: 3, fill: "pink", stroke: "#b91c1c" },
    { type: "path", d: "M 54 53 L 69 53 C 68 66 61 75 54 81 Z", fill: "pink", stroke: "#b91c1c" },
    // Arteries leave the ventricles: the pulmonary artery to the lungs, the
    // aorta arching over to the body.
    { type: "path", d: "M 39 33 L 39 17 L 8 17 L 8 11 L 45 11 L 45 33 Z", fill: "blue", stroke: "#1d4ed8" },
    { type: "path", d: "M 55 33 L 55 15 C 55 5 75 5 78 14 L 80 24 L 74 24 L 72 16 C 70 11 62 11 61 16 L 61 33 Z", fill: "red", stroke: "#b91c1c" },
    // Atrioventricular valves.
    { type: "polygon", points: [[30.5, 50], [37.5, 55], [44.5, 50]], fill: "white", stroke: "#1f2937" },
    { type: "polygon", points: [[55.5, 50], [62.5, 55], [69.5, 50]], fill: "white", stroke: "#1f2937" },
    // Semilunar valves at the base of each artery.
    { type: "path", d: "M 39.5 31 C 41 29 43 29 44.5 31", stroke: "#1f2937" },
    { type: "path", d: "M 55.5 31 C 57 29 59 29 60.5 31", stroke: "#1f2937" },
    // Direction of blood flow through each side.
    { type: "arrow", from: [36, 58], to: [36, 72], stroke: "blue" },
    { type: "arrow", from: [61, 72], to: [61, 60], stroke: "red" },
  ],
  parts: {
    aorta: { point: [75, 12], en: "Aorta", fr: "Aorte" },
    pulmonary_artery: { point: [14, 14], en: "Pulmonary artery", fr: "Artère pulmonaire" },
    pulmonary_vein: { point: [88, 36], en: "Pulmonary vein", fr: "Veine pulmonaire" },
    vena_cava: { point: [27, 6], en: "Vena cava (superior)", fr: "Veine cave supérieure" },
    inferior_vena_cava: { point: [20.5, 88], en: "Vena cava (inferior)", fr: "Veine cave inférieure" },
    right_atrium: { point: [34, 41], en: "Right atrium", fr: "Oreillette droite" },
    left_atrium: { point: [66, 41], en: "Left atrium", fr: "Oreillette gauche" },
    right_ventricle: { point: [32, 64], en: "Right ventricle", fr: "Ventricule droit" },
    left_ventricle: { point: [64, 64], en: "Left ventricle", fr: "Ventricule gauche" },
    septum: { point: [50, 64], en: "Septum", fr: "Septum", side: "right" },
    tricuspid_valve: { point: [37.5, 53], en: "Tricuspid valve", fr: "Valvule tricuspide" },
    bicuspid_valve: { point: [62.5, 53], en: "Bicuspid (mitral) valve", fr: "Valvule mitrale" },
    semilunar_valve: { point: [42, 29.6], en: "Semilunar valve", fr: "Valvule sigmoïde" },
  },
};

const EYE: FigureTemplate = {
  title: { en: "Horizontal section of the human eye", fr: "Coupe horizontale de l'œil humain" },
  height: 76,
  aliases: ["eye", "human-eye", "eye-section", "structure-of-the-eye", "eyeball"],
  shapes: [
    { type: "rect", x: 76, y: 34, w: 22, h: 8, r: 2, fill: "yellow", stroke: "#a16207" },
    { type: "circle", cx: 54, cy: 38, r: 28, fill: "white", stroke: "#475569" },
    { type: "circle", cx: 54, cy: 38, r: 26, fill: "#44403c", stroke: "#292524" },
    { type: "circle", cx: 54, cy: 38, r: 24.6, fill: "#fecdd3", stroke: "#be185d" },
    { type: "circle", cx: 54, cy: 38, r: 23.4, fill: "#f0f9ff", stroke: "#bae6fd" },
    // front of the eye: cornea over the aqueous humour
    { type: "path", d: "M 31 24 C 20 30 20 46 31 52 L 34 48 C 30 44 30 32 34 28 Z", fill: "lightblue", stroke: "#0369a1" },
    { type: "path", d: "M 31 24 C 22 30 22 46 31 52", stroke: "#0369a1" },
    // iris and ciliary body
    { type: "rect", x: 32, y: 25.5, w: 3, h: 7.5, r: 1, fill: "brown", stroke: "#78350f" },
    { type: "rect", x: 32, y: 43, w: 3, h: 7.5, r: 1, fill: "brown", stroke: "#78350f" },
    { type: "ellipse", cx: 37, cy: 21.5, rx: 3, ry: 2, fill: "brown", stroke: "#78350f" },
    { type: "ellipse", cx: 37, cy: 54.5, rx: 3, ry: 2, fill: "brown", stroke: "#78350f" },
    // lens held by the suspensory ligaments
    { type: "ellipse", cx: 38.5, cy: 38, rx: 3.6, ry: 9, fill: "#fef9c3", stroke: "#a16207" },
    { type: "path", d: "M 37 23.5 L 38 29 M 37 52.5 L 38 47 M 38.5 23.5 L 40 29.5 M 38.5 52.5 L 40 46.5", stroke: "#78350f" },
    // fovea and blind spot on the retina
    { type: "circle", cx: 78.2, cy: 32, r: 1, fill: "yellow", stroke: "#a16207" },
    { type: "rect", x: 76.5, y: 35, w: 3, h: 6, fill: "black", stroke: "#111827" },
    // light entering
    { type: "arrow", from: [4, 38], to: [18, 38], stroke: "orange" },
  ],
  parts: {
    cornea: { point: [22, 32], en: "Cornea", fr: "Cornée" },
    aqueous_humour: { point: [29, 38], en: "Aqueous humour", fr: "Humeur aqueuse" },
    iris: { point: [33.5, 28], en: "Iris", fr: "Iris" },
    pupil: { point: [34, 38], en: "Pupil", fr: "Pupille" },
    lens: { point: [38.5, 38], en: "Lens", fr: "Cristallin" },
    ciliary_body: { point: [37, 54.5], en: "Ciliary body (muscle)", fr: "Corps ciliaire" },
    suspensory_ligament: { point: [38.8, 50], en: "Suspensory ligament", fr: "Ligament suspenseur" },
    vitreous_humour: { point: [58, 46], en: "Vitreous humour", fr: "Humeur vitrée" },
    retina: { point: [60, 14.2], en: "Retina", fr: "Rétine" },
    choroid: { point: [70, 17.8], en: "Choroid", fr: "Choroïde" },
    sclera: { point: [48, 10.4], en: "Sclera", fr: "Sclérotique" },
    fovea: { point: [78.2, 32], en: "Fovea (yellow spot)", fr: "Fovéa (tache jaune)" },
    blind_spot: { point: [78, 40], en: "Blind spot", fr: "Tache aveugle" },
    optic_nerve: { point: [92, 38], en: "Optic nerve", fr: "Nerf optique" },
  },
};

const NEURON: FigureTemplate = {
  title: { en: "Motor neurone", fr: "Neurone moteur" },
  height: 50,
  aliases: ["neuron", "neurone", "motor-neuron", "motor-neurone", "nerve-cell"],
  shapes: [
    // dendrites branching from the cell body
    { type: "path", d: "M 12 20 L 6 12 M 8 15 L 3 14 M 11 30 L 4 36 M 6 34 L 5 40 M 18 16 L 17 6 M 17 10 L 13 5 M 17 10 L 21 5 M 18 34 L 16 43 M 10 25 L 2 24", stroke: "#6d28d9" },
    { type: "circle", cx: 15, cy: 25, r: 7, fill: "purple" },
    { type: "circle", cx: 14, cy: 25, r: 2.4, fill: "darkgreen" },
    // axon wrapped in myelin, with nodes between the Schwann cells
    { type: "line", from: [22, 25], to: [86, 25], stroke: "#6d28d9" },
    ...Array.from({ length: 6 }, (_, i): FigureShape => ({ type: "rect", x: 25 + i * 10, y: 22.5, w: 8.4, h: 5, r: 2.5, fill: "yellow", stroke: "#a16207" })),
    { type: "circle", cx: 29.2, cy: 22.2, r: 0.9, fill: "orange", stroke: "#c2410c" },
    // axon terminals (motor end plates)
    { type: "path", d: "M 86 25 L 92 18 M 86 25 L 94 25 M 86 25 L 92 32", stroke: "#6d28d9" },
    ...([[92.5, 17.5], [94.5, 25], [92.5, 32.5]] as Point[]).map(([cx, cy]): FigureShape => ({ type: "ellipse", cx, cy, rx: 1.4, ry: 1, fill: "red" })),
    { type: "arrow", from: [34, 38], to: [66, 38], stroke: "blue" },
  ],
  parts: {
    dendrite: { point: [6, 12], en: "Dendrites", fr: "Dendrites" },
    cell_body: { point: [18, 22], en: "Cell body", fr: "Corps cellulaire" },
    nucleus: { point: [14, 25], en: "Nucleus", fr: "Noyau" },
    axon: { point: [23.5, 25], en: "Axon", fr: "Axone", side: "bottom" },
    myelin_sheath: { point: [50, 22.6], en: "Myelin sheath", fr: "Gaine de myéline", side: "top" },
    node_of_ranvier: { point: [64.2, 25], en: "Node of Ranvier", fr: "Nœud de Ranvier", side: "bottom" },
    schwann_cell: { point: [29.2, 22.2], en: "Schwann cell nucleus", fr: "Noyau de cellule de Schwann", side: "top" },
    axon_terminal: { point: [94.5, 25], en: "Motor end plates", fr: "Plaques motrices" },
    impulse: { point: [50, 38], en: "Direction of impulse", fr: "Sens de l'influx nerveux", side: "bottom" },
  },
};

export const FIGURE_TEMPLATES: Record<string, FigureTemplate> = {
  "animal-cell": ANIMAL_CELL,
  "plant-cell": PLANT_CELL,
  bacterium: BACTERIUM,
  flower: FLOWER,
  "leaf-section": LEAF_SECTION,
  heart: HEART,
  eye: EYE,
  neuron: NEURON,
};

/** The template a name refers to, whichever way the assistant wrote it. */
export function findTemplate(name: unknown): FigureTemplate | null {
  const key = String(name ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!key) return null;
  if (FIGURE_TEMPLATES[key]) return FIGURE_TEMPLATES[key];
  const spaced = key.replace(/-/g, " ");
  for (const template of Object.values(FIGURE_TEMPLATES)) {
    if (template.aliases.some((alias) => alias === key || alias === spaced)) return template;
  }
  return null;
}

/** A part a label names: by its key, or by its English or French name. */
export function findPart(template: FigureTemplate, name: unknown): TemplatePart | null {
  const key = String(name ?? "").trim().toLowerCase();
  if (!key) return null;
  const snake = key.replace(/[\s-]+/g, "_");
  if (template.parts[snake]) return template.parts[snake];
  for (const part of Object.values(template.parts)) {
    if (part.en.toLowerCase() === key || part.fr.toLowerCase() === key) return part;
  }
  return null;
}
