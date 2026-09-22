/**
 * Returns the bytes of a one-page Letter PDF showing `lines` top to bottom in
 * Helvetica, with `title` in its info dictionary when given. The same
 * arguments give the same bytes. Fixture network responses and tests use it.
 */
export function minimalPdf({ title, lines }: { title?: string; lines: string[] }): Uint8Array {
  const escape = (text: string): string => text.replace(/[\\()]/g, (c) => `\\${c}`)
  const content = lines.map((line, at) => `BT /F1 12 Tf 72 ${720 - at * 18} Td (${escape(line)}) Tj ET`).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...(title === undefined ? [] : [`<< /Title (${escape(title)}) >>`]),
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, at) => {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${at + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${title === undefined ? '' : ` /Info ${objects.length} 0 R`} >>\n`
  out += `startxref\n${xref}\n%%EOF\n`
  return new Uint8Array(Buffer.from(out, 'latin1'))
}
