export const MODULE_ID = "palisade";

export const log = (...args) => console.log("Palisade |", ...args);
export const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
export const setting = (key) => game.settings.get(MODULE_ID, key);

/** Distance d'accroche en unités de scène : le réglage est en pixels à l'écran, comme le pinceau. */
export const snapTolerance = () => setting("snapDistance") / (globalThis.canvas?.stage?.scale?.x || 1);
