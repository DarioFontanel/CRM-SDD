// Si ferma con un messaggio chiaro se il Node in uso è più vecchio della 24 LTS.
const maggiore = Number(process.versions.node.split('.')[0]);
if (maggiore < 24) {
  console.error(
    `\nIl CRM richiede Node 24 LTS o successivo: qui sta girando Node ${process.versions.node}.\n` +
      'Installa Node 24 (per esempio con "brew install node@24") e riprova.\n',
  );
  process.exit(1);
}
