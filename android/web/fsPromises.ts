import { readdirSync, statSync, writeFileSync } from './fs'

const B = (window as any).OrfeoBridge
export const mkdir = async (p: string, _o?: unknown) => B.mkdir(p)
export const access = async (p: string) => { statSync(p) }
export const copyFile = async (a: string, b: string) => B.copy(a, b)
export const readdir = async (p: string, o?: { withFileTypes?: boolean }) => readdirSync(p, o)
export const rename = async (a: string, b: string) => B.rename(a, b)
export const rmdir = async (p: string) => B.remove(p)
export const writeFile = async (p: string, d: string | Uint8Array) => writeFileSync(p, d)
