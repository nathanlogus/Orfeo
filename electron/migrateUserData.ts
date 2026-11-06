// ── One-time move of the app's data from its old name ──────────────────────────
// The app used to be Orfeo, with its data in %APPDATA%\Orfeo. On the first start
// under the new name everything is copied across; the old folder is left as it
// was. Android restores a backup into the same folder, so there only the two
// renamed files need copying (oldDir === newDir), but their saved paths still
// name the old package.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const OLD_PREFS = 'orfeo-prefs.json'
const OLD_FILE_LOG = 'orfeo-file-log.json'
const NEW_PREFS = 'pliage-prefs.json'
const NEW_FILE_LOG = 'pliage-file-log.json'

// Chromium rebuilds these itself, and its lock files must never be carried over
const THROWAWAY = /cache$|^(blob_storage|Crashpad|lockfile|Singleton.*)$/i

function copyTree(from: string, to: string, top: boolean, failed: string[]) {
  mkdirSync(to, { recursive: true })
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (e.name === 'LOCK' || (top && (THROWAWAY.test(e.name) || e.name === OLD_PREFS || e.name === OLD_FILE_LOG))) continue
    const source = join(from, e.name), target = join(to, e.name)
    try {
      if (e.isDirectory()) copyTree(source, target, false, failed)
      else if (e.isFile() && !existsSync(target)) copyFileSync(source, target)
    } catch { failed.push(source) }  // a locked file must not stop the rest
  }
}

// Saved paths into the old folder (sound sets, Demo) have to follow it
function copyJson(from: string, to: string, [oldPath, newPath]: [string, string]) {
  if (!existsSync(from)) return
  const escaped = (dir: string) => JSON.stringify(dir).slice(1, -1)
  writeFileSync(to, readFileSync(from, 'utf8').split(escaped(oldPath)).join(escaped(newPath)))
}

/** Returns what was done, for the log. Safe to call on every start: the new prefs file ends it.
 *  paths: what saved paths change from and to, when that isn't simply the folder. */
export function migrateUserData(oldDir: string, newDir: string, paths: [string, string] = [oldDir, newDir]): { migrated: boolean; failed: string[] } {
  const failed: string[] = []
  const sameDir = oldDir === newDir
  if (existsSync(join(newDir, NEW_PREFS)) || !existsSync(sameDir ? join(oldDir, OLD_PREFS) : oldDir)) return { migrated: false, failed }
  if (!sameDir) copyTree(oldDir, newDir, true, failed)
  else mkdirSync(newDir, { recursive: true })
  copyJson(join(oldDir, OLD_FILE_LOG), join(newDir, NEW_FILE_LOG), paths)
  copyJson(join(oldDir, OLD_PREFS), join(newDir, NEW_PREFS), paths)  // last: it marks the move as done
  return { migrated: true, failed }
}
