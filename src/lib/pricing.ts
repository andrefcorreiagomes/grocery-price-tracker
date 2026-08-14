/** Price per Product.unit (e.g. €/L, €/kg), for fair comparison across stores selling different package sizes. */
export function unitPrice(price: number, packageSize: number): number {
  return packageSize > 0 ? price / packageSize : price;
}
