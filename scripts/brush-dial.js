/**
 * Palisade — cadran du pinceau.
 *
 *   Centre        : bouton moleté, règle la précision (molette, glisser vers le haut ou le bas,
 *                   flèches du clavier). La valeur s'affiche dessus, l'index pointe la graduation.
 *   Anneau droit  : un segment par type de mur ; le segment choisi est hachuré et relié à son nom.
 *   Anneau gauche : graduation de précision, de 1 à 10 px.
 *   À droite      : les types en éventail, cliquables.
 *
 * Styles dans styles/palisade.css (#palisade-dial).
 */

const C = 130; // centre du cadran (px)
const DISC = 122;
const RING_IN = 66;
const RING_OUT = 110;
const LABEL_R = 128;
const SCALE_R = 88;
const DETAIL_MIN = 1;
const DETAIL_MAX = 10;
const DETAIL_STEP = 0.5;
const SCALE_FROM = 110; // angle (degrés, 0 = droite, sens horaire) de la valeur 1, en bas à gauche
const SCALE_SPAN = 140; // jusqu'à la valeur 10, en haut à gauche

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];
const clampDetail = (v) => Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Math.round(v / DETAIL_STEP) * DETAIL_STEP));
const scaleAngle = (v) => SCALE_FROM + ((v - DETAIL_MIN) / (DETAIL_MAX - DETAIL_MIN)) * SCALE_SPAN;
const fmt = (v) => `${String(v).replace(".", ",")} px`;

/** Chemin SVG d'un secteur d'anneau entre deux angles. */
function sector(r1, r2, a1, a2) {
  const [x1, y1] = polar(r2, a1);
  const [x2, y2] = polar(r2, a2);
  const [x3, y3] = polar(r1, a2);
  const [x4, y4] = polar(r1, a1);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M${x1} ${y1} A${r2} ${r2} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}

/** Arc SVG (sans remplissage) de rayon r entre deux angles, sens horaire. */
function arc(r, a1, a2) {
  const [x1, y1] = polar(r, a1);
  const [x2, y2] = polar(r, a2);
  return `M${x1} ${y1} A${r} ${r} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/**
 * @param {object} o
 * @param {{key: string, label: string, icon: string, hint?: string}[]} o.types
 * @param {() => number} o.getDetail
 * @param {(v: number) => void} o.onDetail  appelé à chaque cran (à temporiser côté appelant)
 * @param {() => string} o.getType
 * @param {(key: string) => void} o.onType
 * @param {string} o.caption  légende du bouton (« Précision »)
 * @param {string} o.knobTitle
 * @param {string} o.hint      ligne d'aide sous le cadran
 * @returns {{element: HTMLElement, sync: () => void}}
 */
export function createDial(o) {
  const n = o.types.length;
  const span = 180 / n;
  const centers = o.types.map((_, i) => -90 + span * (i + 0.5));
  const svgNS = "http://www.w3.org/2000/svg";

  const root = document.createElement("div");
  root.id = "palisade-dial";

  // --- face : disque, segments, graduation, liaison
  const face = document.createElement("div");
  face.className = "pal-face";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 260 260");
  svg.setAttribute("width", "260");
  svg.setAttribute("height", "260");
  let ticks = "";
  for (let v = DETAIL_MIN; v <= DETAIL_MAX + 1e-9; v += DETAIL_STEP) {
    const a = scaleAngle(v);
    const major = Number.isInteger(v);
    const [x1, y1] = polar(SCALE_R - (major ? 9 : 6), a);
    const [x2, y2] = polar(SCALE_R + (major ? 9 : 6), a);
    ticks += `<line class="pal-tick${major ? " major" : ""}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  const scaleLabels = [1, 5, 10]
    .map((v) => {
      const [x, y] = polar(SCALE_R + 22, scaleAngle(v));
      return `<text class="pal-scale-label" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${v}</text>`;
    })
    .join("");
  svg.innerHTML =
    `<defs><pattern id="pal-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="6" height="6" fill="#3a3e47"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.16)" stroke-width="2"/>` +
    `</pattern></defs>` +
    `<circle class="pal-disc" cx="${C}" cy="${C}" r="${DISC}"/>` +
    `<path class="pal-scale-track" d="${arc(SCALE_R, SCALE_FROM, SCALE_FROM + SCALE_SPAN)}"/>` +
    `<path class="pal-scale-fill" d=""/>` +
    ticks +
    scaleLabels +
    o.types
      .map(
        (t, i) =>
          `<path class="pal-segment" data-key="${t.key}" tabindex="0" role="button" aria-label="${t.label}" ` +
          `d="${sector(RING_IN, RING_OUT, centers[i] - span / 2 + 1.5, centers[i] + span / 2 - 1.5)}"/>`
      )
      .join("") +
    `<path class="pal-connector" d=""/>`;
  face.append(svg);

  for (const [i, t] of o.types.entries()) {
    const [x, y] = polar((RING_IN + RING_OUT) / 2, centers[i]);
    const icon = document.createElement("i");
    icon.className = `pal-icon ${t.icon}`;
    icon.dataset.key = t.key;
    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;
    face.append(icon);
  }

  // --- bouton moleté
  const knob = document.createElement("div");
  knob.className = "pal-knob";
  knob.tabIndex = 0;
  knob.setAttribute("role", "slider");
  knob.setAttribute("aria-valuemin", String(DETAIL_MIN));
  knob.setAttribute("aria-valuemax", String(DETAIL_MAX));
  knob.title = o.knobTitle;
  knob.innerHTML =
    `<div class="pal-rot" style="position:absolute;inset:0"><div class="pal-knurl"></div><div class="pal-pointer"></div></div>` +
    `<div class="pal-knob-face"><div class="pal-knob-value"></div><div class="pal-knob-caption">${o.caption}</div></div>`;
  face.append(knob);
  root.append(face);

  // --- liste en éventail
  const labels = o.types.map((t, i) => {
    const el = document.createElement("div");
    el.className = "pal-label";
    el.dataset.key = t.key;
    el.innerHTML = `<i class="${t.icon}"></i><span>${t.label}</span>${t.hint ? `<small>${t.hint}</small>` : ""}`;
    const [ax, ay] = polar(LABEL_R, centers[i]);
    el.style.left = `${ax + 16}px`;
    el.style.top = `${ay - 17}px`;
    el.style.transform = `rotate(${centers[i] * 0.22}deg)`;
    root.append(el);
    return el;
  });

  const hint = document.createElement("div");
  hint.className = "pal-hint";
  hint.textContent = o.hint;
  root.append(hint);

  // --- état
  let detail = clampDetail(o.getDetail());

  function renderDetail() {
    const a = scaleAngle(detail);
    svg.querySelector(".pal-scale-fill").setAttribute("d", arc(SCALE_R, SCALE_FROM, Math.max(SCALE_FROM + 0.01, a)));
    knob.querySelector(".pal-rot").style.transform = `rotate(${a - 270}deg)`;
    knob.querySelector(".pal-knob-value").textContent = fmt(detail);
    knob.setAttribute("aria-valuenow", String(detail));
    knob.setAttribute("aria-valuetext", fmt(detail));
  }

  function renderType() {
    const key = o.getType();
    const i = Math.max(0, o.types.findIndex((t) => t.key === key));
    for (const el of root.querySelectorAll("[data-key]")) el.classList.toggle("active", el.dataset.key === o.types[i].key);
    for (const [j, el] of labels.entries()) el.style.opacity = j === i ? "1" : String(Math.max(0.6, 0.9 - 0.12 * Math.abs(j - i)));
    const [x1, y1] = polar(RING_OUT, centers[i]);
    const [x2, y2] = polar(LABEL_R, centers[i]);
    svg.querySelector(".pal-connector").setAttribute("d", `M${x1} ${y1} L${x2} ${y2} L${x2 + 16} ${y2}`);
  }

  function setDetail(v) {
    const next = clampDetail(v);
    if (next === detail) return;
    detail = next;
    renderDetail();
    o.onDetail(detail);
  }

  // --- interactions
  const choose = (key) => {
    o.onType(key);
    renderType();
  };
  for (const el of root.querySelectorAll(".pal-segment, .pal-label")) {
    el.addEventListener("click", () => choose(el.dataset.key));
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      e.stopPropagation();
      choose(el.dataset.key);
    });
  }

  knob.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDetail(detail + (e.deltaY < 0 ? DETAIL_STEP : -DETAIL_STEP));
    },
    { passive: false }
  );
  let drag = null;
  knob.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    knob.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, v: detail };
  });
  knob.addEventListener("pointermove", (e) => {
    // 12 px de glissé = un cran
    if (drag) setDetail(drag.v + ((drag.y - e.clientY) / 12) * DETAIL_STEP);
  });
  const endDrag = () => (drag = null);
  knob.addEventListener("pointerup", endDrag);
  knob.addEventListener("pointercancel", endDrag);
  knob.addEventListener("keydown", (e) => {
    const step = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    setDetail(detail + step * DETAIL_STEP);
  });

  const sync = () => {
    detail = clampDetail(o.getDetail());
    renderDetail();
    renderType();
  };
  sync();
  return { element: root, sync };
}
