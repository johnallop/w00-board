/**
 * Diff pur entre deux états de config : quels panneaux méritent une diffusion ?
 *
 * Règles (anti-spam par construction) :
 *   - added   : id présent dans curr mais pas dans prev → nouveau message.
 *   - changed : même id mais `message` ou `author` différent → message réécrit.
 *   - tags / accentColor / date seuls modifiés → RIEN (cosmétique, pas un
 *     nouveau message).
 *   - suppression d'un panneau → RIEN.
 *   - réordonnancement du tableau → RIEN (comparaison par id, jamais par
 *     position — c'est ce qui tue le bug « on rediffuse billboards[0] »).
 *   - prev absent ou malformé → diff VIDE : on ne rediffuse jamais tout le
 *     mur sur un push dont on ignore ce qu'il change.
 *
 * Fonction pure, sans I/O — testée dans src/tests/diffBillboards.test.ts.
 */

/** @returns {Array<object> | null} les panneaux valides, ou null si la config est malformée */
function validBoards(config) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.billboards)) return null;
  return config.billboards.filter((b) => b && typeof b === 'object' && typeof b.id === 'string');
}

/**
 * @param {unknown} prev — config précédente (ou null/malformée)
 * @param {unknown} curr — config actuelle
 * @returns {{added: object[], changed: object[]}} panneaux de `curr` à diffuser
 */
export function diffBillboards(prev, curr) {
  const empty = { added: [], changed: [] };
  const currBoards = validBoards(curr);
  if (!currBoards) return empty;
  const prevBoards = validBoards(prev);
  if (!prevBoards) return empty;

  const prevById = new Map(prevBoards.map((b) => [b.id, b]));
  const added = [];
  const changed = [];
  for (const board of currBoards) {
    const before = prevById.get(board.id);
    if (!before) added.push(board);
    else if (before.message !== board.message || before.author !== board.author) changed.push(board);
  }
  return { added, changed };
}
