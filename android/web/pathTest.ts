// @ts-nocheck node-only: node --experimental-strip-types android/web/pathTest.ts
import { strictEqual as eq } from 'node:assert'
import * as p from './path.ts'
eq(p.join('/a/b', '../c', 'd.mid'), '/a/c/d.mid')
eq(p.join('/a', '..', '..', 'b'), '/b')
eq(p.dirname('/a/b/c.mid'), '/a/b'); eq(p.dirname('/a'), '/'); eq(p.dirname('a'), '.')
eq(p.basename('/a/b.mid/'), 'b.mid'); eq(p.basename('/a/b.mid', '.mid'), 'b')
eq(p.extname('/a/b.tar.gz'), '.gz'); eq(p.extname('/a/.hidden'), ''); eq(p.extname('/a.b/c'), '')
eq(p.resolve('/a', 'b', '../c'), '/a/c'); eq(p.resolve('/a', '/x', 'y'), '/x/y')
eq(p.relative('/a/b', '/a/b/c/d'), 'c/d'); eq(p.relative('/a/b', '/a/x'), '../x'); eq(p.relative('/a', '/a'), '')
console.log('path shim ok')
