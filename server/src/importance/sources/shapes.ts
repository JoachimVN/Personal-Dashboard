/** Every shape a candidate can be seated in. Spread into `shapes` rather than shared by
 * reference so a candidate can't mutate the list other candidates read from. */
export const allShapes = ['hero', 'secondary', 'tile'] as const;
