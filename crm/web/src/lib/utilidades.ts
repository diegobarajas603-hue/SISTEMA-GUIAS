/**
 * Combina clases condicionalmente, sin dependencias (equivalente mínimo a `clsx`).
 * Acepta cualquier valor falsy en la posición de la condición (`x && 'clase'` puede
 * colapsar a `0` cuando `x` es un número), no solo `false | null | undefined`.
 */
export function cx(...clases: Array<string | boolean | number | null | undefined>): string {
  return clases.filter((c): c is string => typeof c === 'string' && c.length > 0).join(' ');
}
