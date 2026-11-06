import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateUserData } from './migrateUserData'

export function runMigrateUserDataTest(): number {
  console.group('[migrateUserData] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const root = mkdtempSync(join(tmpdir(), 'pliage-migrate-'))
  const put = (path: string, text: string) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text) }
  const read = (path: string) => readFileSync(path, 'utf8')

  try {
    const oldDir = join(root, 'Orfeo'), newDir = join(root, 'Pliage')
    check(!migrateUserData(oldDir, newDir).migrated, 'no old folder: nothing to do')

    const soundfont = join(oldDir, 'soundfonts', 'Mine.sf2')
    put(join(oldDir, 'orfeo-prefs.json'), JSON.stringify({ soundfont, libraryFolder: 'D:\\Music' }))
    put(join(oldDir, 'orfeo-file-log.json'), JSON.stringify({ [join(oldDir, 'Demo', 'a.mid')]: [1] }))
    put(soundfont, 'bank')
    put(join(oldDir, 'Demo', 'Orfeo', 'a_ORFEO_v1.mid'), 'edit')
    put(join(oldDir, 'Local Storage', 'leveldb', '000003.log'), 'storage')
    put(join(oldDir, 'Local Storage', 'leveldb', 'LOCK'), '')
    put(join(oldDir, 'Cache', 'f_000001'), 'junk')
    put(join(oldDir, 'GPUCache', 'data_0'), 'junk')
    put(join(oldDir, 'lockfile'), '')

    const first = migrateUserData(oldDir, newDir)
    check(first.migrated && first.failed.length === 0, 'first start copies')
    const prefs = JSON.parse(read(join(newDir, 'pliage-prefs.json')))
    check(prefs.soundfont === join(newDir, 'soundfonts', 'Mine.sf2'), 'saved path follows the data')
    check(prefs.libraryFolder === 'D:\\Music', 'paths elsewhere are untouched')
    check(Object.keys(JSON.parse(read(join(newDir, 'pliage-file-log.json'))))[0] === join(newDir, 'Demo', 'a.mid'), 'file log keys follow too')
    check(read(join(newDir, 'soundfonts', 'Mine.sf2')) === 'bank', 'sound sets copied')
    check(read(join(newDir, 'Demo', 'Orfeo', 'a_ORFEO_v1.mid')) === 'edit', 'saved versions copied under their old names')
    check(read(join(newDir, 'Local Storage', 'leveldb', '000003.log')) === 'storage', 'localStorage copied')
    check(!existsSync(join(newDir, 'orfeo-prefs.json')), 'old prefs name not carried over')
    check(!existsSync(join(newDir, 'Cache')) && !existsSync(join(newDir, 'GPUCache')), 'caches left behind')
    check(!existsSync(join(newDir, 'lockfile')) && !existsSync(join(newDir, 'Local Storage', 'leveldb', 'LOCK')), 'lock files left behind')
    check(existsSync(join(oldDir, 'orfeo-prefs.json')) && read(soundfont) === 'bank', 'old folder untouched: a copy, never a move')

    writeFileSync(join(newDir, 'pliage-prefs.json'), '{"changed":true}')
    put(join(oldDir, 'soundfonts', 'Later.sf2'), 'late')
    check(!migrateUserData(oldDir, newDir).migrated, 'second start does nothing')
    check(read(join(newDir, 'pliage-prefs.json')) === '{"changed":true}', 'never overwrites the new prefs')
    check(!existsSync(join(newDir, 'soundfonts', 'Later.sf2')), 'one time only')

    const fresh = join(root, 'Fresh')
    put(join(fresh, 'pliage-prefs.json'), '{}')
    check(!migrateUserData(oldDir, fresh).migrated, 'a new folder with its own prefs is left alone')

    // Android: a backup restored into the new app, old file names, same folder
    const android = join(root, 'files', 'userData')
    const oldLibrary = '/data/user/0/com.squarebow.orfeo/files/Library/Music'
    put(join(android, 'orfeo-prefs.json'), JSON.stringify({ soundfont: join(android, 'soundfonts', 'x.sf2'), libraryFolder: oldLibrary }))
    put(join(android, 'orfeo-file-log.json'), '{}')
    put(join(android, 'soundfonts', 'x.sf2'), 'bank')
    check(migrateUserData(android, android, ['com.squarebow.orfeo', 'com.squarebow.pliage']).migrated, 'same folder: renamed files copied')
    check(existsSync(join(android, 'pliage-prefs.json')) && existsSync(join(android, 'pliage-file-log.json')), 'both files under their new names')
    check(JSON.parse(read(join(android, 'pliage-prefs.json'))).soundfont === join(android, 'soundfonts', 'x.sf2'), 'paths survive')
    check(JSON.parse(read(join(android, 'pliage-prefs.json'))).libraryFolder === '/data/user/0/com.squarebow.pliage/files/Library/Music', 'paths into the old package move to the new one')
    check(!migrateUserData(join(root, 'files', 'empty'), join(root, 'files', 'empty')).migrated, 'fresh install: nothing to do')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
