export function nowInSecondsBigint() {
  return BigInt(Math.floor(Date.now() / 1000))
}
