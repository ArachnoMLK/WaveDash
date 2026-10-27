// Reporter for GitHub Actions: each failing test becomes an annotation (::error), readable on the run page.
export default async function* ghReporter(source) {
  for await (const ev of source) {
    if (ev.type !== 'test:fail' || ev.data.details?.type === 'suite') continue
    const err = ev.data.details?.error, msg = String(err?.cause?.message ?? err?.message ?? err ?? 'failure').replace(/\r?\n/g, ' ').slice(0, 500)
    yield `::error title=Failed test: ${ev.data.name.replace(/[\r\n:,]/g, ' ')}::${msg}\n`
  }
}
