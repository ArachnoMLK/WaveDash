// Rapporteur pour GitHub Actions : chaque test en échec devient une annotation (::error), lisible sur la page de l'exécution.
export default async function* ghReporter(source) {
  for await (const ev of source) {
    if (ev.type !== 'test:fail' || ev.data.details?.type === 'suite') continue
    const err = ev.data.details?.error, msg = String(err?.cause?.message ?? err?.message ?? err ?? 'échec').replace(/\r?\n/g, ' ').slice(0, 500)
    yield `::error title=Test en échec : ${ev.data.name.replace(/[\r\n:,]/g, ' ')}::${msg}\n`
  }
}
