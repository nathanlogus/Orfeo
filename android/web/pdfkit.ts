// pdfkit's standalone build reads font paths from a virtual disk: hand it the bytes
// @ts-expect-error no types for the prebuilt bundle
import PDFDocument from '../../node_modules/pdfkit/js/pdfkit.standalone.js'
import { readFileSync } from './fs'

export default class extends PDFDocument {
  registerFont(name: string, src: any, family?: string) {
    return super.registerFont(name, typeof src === 'string' ? new Uint8Array(readFileSync(src)) : src, family)
  }
}
