// ── POSIX subset of Node's `path`: Android paths are always absolute ─────────
function normalize(p: string): string {
  const out: string[] = []
  for (const part of p.split('/')) {
    if (part === '..') out.pop()
    else if (part && part !== '.') out.push(part)
  }
  return '/' + out.join('/')
}
export const isAbsolute = (p: string) => p.startsWith('/')
export const join = (...parts: string[]) => normalize(parts.filter(Boolean).join('/'))
export function resolve(...parts: string[]): string {
  let i = parts.length - 1
  while (i > 0 && !isAbsolute(parts[i])) i--
  return join('/', ...parts.slice(i))
}
export function dirname(p: string): string {
  const i = p.replace(/\/+$/, '').lastIndexOf('/')
  return i <= 0 ? (isAbsolute(p) ? '/' : '.') : p.slice(0, i)
}
export function basename(p: string, ext?: string): string {
  const b = p.replace(/\/+$/, '').split('/').pop() ?? ''
  return ext && b.endsWith(ext) && b !== ext ? b.slice(0, -ext.length) : b
}
export function extname(p: string): string {
  const b = basename(p), i = b.lastIndexOf('.')
  return i <= 0 ? '' : b.slice(i)
}
export function relative(from: string, to: string): string {
  const a = resolve(from).split('/').filter(Boolean), b = resolve(to).split('/').filter(Boolean)
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/')
}
