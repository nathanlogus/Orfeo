/** Android displays server covers through its same-origin image proxy. */
export function offlineArtworkUrl(art: string | null | undefined): string | null {
  if (!art) return null
  if (art.startsWith('/homeart?')) return new URLSearchParams(art.slice(art.indexOf('?') + 1)).get('u')
  return art
}
