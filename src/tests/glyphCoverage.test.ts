import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import rawConfig from '../data/config.json';
import { PLAGES_POLICE, isCovered, uncoveredIn, renderableText } from '../utils/glyphCoverage';

/**
 * Ce fichier re-parse la police RÉELLE à chaque exécution.
 *
 * `glyphCoverage.ts` encode une table de 31 plages obtenue par mesure. Une table
 * copiée dans du code est une promesse : elle reste vraie jusqu'au jour où
 * quelqu'un change le fichier .woff — mise à jour d'@fontsource, passage à une
 * autre graisse, ajout d'un sous-ensemble. Ce jour-là, rien ne s'allumerait :
 * le prédicat continuerait de répondre « couvert » pour des points de code que
 * la nouvelle police ne dessine plus, et l'aperçu social afficherait des carrés
 * exactement là où le module existe pour les empêcher.
 *
 * D'où le parti pris, qui est celui du dépôt : valider l'artefact, pas la
 * promesse. On relit le WOFF, on décompresse le cmap, on marche les sous-tables
 * et on compare l'ensemble obtenu à la table écrite. Remplacer la police sans
 * mettre la table à jour fait échouer la suite.
 */

const CHEMIN_POLICE = path.join(process.cwd(), 'src/data/inter-latin-700-normal.woff');

/**
 * Extrait la table `cmap` du conteneur WOFF, décompressée.
 *
 * Format WOFF 1.0 : en-tête de 44 octets (`wOFF`, puis `numTables` en 12), suivi
 * d'un répertoire d'entrées de 20 octets — tag, offset, compLength, origLength,
 * origChecksum. Une table est compressée SI ET SEULEMENT SI `compLength <
 * origLength` ; c'est la règle du format, pas une heuristique.
 */
function tableCmap(): Buffer {
  const woff = fs.readFileSync(CHEMIN_POLICE);
  expect(woff.subarray(0, 4).toString('latin1')).toBe('wOFF');

  const nbTables = woff.readUInt16BE(12);
  for (let i = 0; i < nbTables; i++) {
    const entree = 44 + i * 20;
    if (woff.subarray(entree, entree + 4).toString('latin1') !== 'cmap') continue;

    const offset = woff.readUInt32BE(entree + 4);
    const compLength = woff.readUInt32BE(entree + 8);
    const origLength = woff.readUInt32BE(entree + 12);
    const brut = woff.subarray(offset, offset + compLength);
    const table = compLength < origLength ? zlib.inflateSync(brut) : brut;

    // Si la décompression rendait autre chose que la taille annoncée, tout ce
    // qui suit lirait des octets arbitraires en croyant lire un cmap.
    expect(table.length).toBe(origLength);
    return table;
  }
  throw new Error('table cmap absente du WOFF');
}

interface SousTable {
  platformID: number;
  encodingID: number;
  offset: number;
  format: number;
}

function sousTables(cmap: Buffer): SousTable[] {
  const nb = cmap.readUInt16BE(2);
  const liste: SousTable[] = [];
  for (let i = 0; i < nb; i++) {
    const enr = 4 + i * 8;
    const offset = cmap.readUInt32BE(enr + 4);
    liste.push({
      platformID: cmap.readUInt16BE(enr),
      encodingID: cmap.readUInt16BE(enr + 2),
      offset,
      format: cmap.readUInt16BE(offset),
    });
  }
  return liste;
}

/**
 * Les points de code réellement dessinés par une sous-table de format 4.
 *
 * Disposition : format, length, language, segCountX2, searchRange,
 * entrySelector, rangeShift, puis quatre tableaux parallèles de segCount
 * entrées — endCode, (padding), startCode, idDelta, idRangeOffset — et enfin
 * glyphIdArray.
 *
 * « Couvert » signifie ici : l'identifiant de glyphe obtenu n'est PAS 0. Un
 * point de code présent dans un segment mais résolu vers le glyphe 0 est
 * précisément le carré `.notdef` qu'on cherche à éviter — le compter comme
 * couvert inverserait le sens du test.
 */
function pointsCouverts(cmap: Buffer, offsetSousTable: number): Set<number> {
  const segCount = cmap.readUInt16BE(offsetSousTable + 6) / 2;
  const baseFin = offsetSousTable + 14;
  const baseDebut = baseFin + segCount * 2 + 2; // +2 : le reservedPad
  const baseDelta = baseDebut + segCount * 2;
  const baseRangeOffset = baseDelta + segCount * 2;

  const couverts = new Set<number>();
  for (let s = 0; s < segCount; s++) {
    const fin = cmap.readUInt16BE(baseFin + s * 2);
    const debut = cmap.readUInt16BE(baseDebut + s * 2);
    const delta = cmap.readInt16BE(baseDelta + s * 2);
    const rangeOffset = cmap.readUInt16BE(baseRangeOffset + s * 2);

    // Segment sentinelle obligatoire du format 4 : il clôt la table, il ne
    // décrit aucun caractère.
    if (debut === 0xffff) continue;

    for (let c = debut; c <= fin; c++) {
      let glyphe: number;
      if (rangeOffset === 0) {
        glyphe = (c + delta) & 0xffff;
      } else {
        const adresse = baseRangeOffset + s * 2 + rangeOffset + (c - debut) * 2;
        if (adresse + 1 >= cmap.length) continue;
        glyphe = cmap.readUInt16BE(adresse);
        if (glyphe !== 0) glyphe = (glyphe + delta) & 0xffff;
      }
      if (glyphe !== 0) couverts.add(c);
    }
  }
  return couverts;
}

function enPlages(points: Set<number>): Array<[number, number]> {
  const plages: Array<[number, number]> = [];
  for (const cp of [...points].sort((a, b) => a - b)) {
    const derniere = plages[plages.length - 1];
    if (derniere && cp === derniere[1] + 1) derniere[1] = cp;
    else plages.push([cp, cp]);
  }
  return plages;
}

const CMAP = tableCmap();
const SOUS_TABLES = sousTables(CMAP);
const FORMAT_4 = SOUS_TABLES.filter((s) => s.format === 4);
const MESURE = pointsCouverts(CMAP, FORMAT_4[0].offset);

describe('la table codée décrit bien la police livrée', () => {
  it('le cmap ne contient que des sous-tables de format 4 — borne structurelle', () => {
    // Conséquence directe, et c'est elle qui compte : le format 4 n'adresse que
    // le plan multilingue de base. Aucun point de code au-dessus de U+FFFF ne
    // PEUT être couvert. L'absence d'emoji n'est pas un manque de sous-ensemble,
    // c'est une impossibilité du fichier.
    expect(SOUS_TABLES.length).toBeGreaterThan(0);
    expect(FORMAT_4.length).toBe(SOUS_TABLES.length);
  });

  it('toutes les sous-tables décrivent la même couverture', () => {
    // Deux sous-tables (pid 0/eid 3 et pid 3/eid 1) pour deux conventions de
    // plateforme, mais un seul jeu de glyphes. Si elles divergeaient, « couvert »
    // dépendrait du moteur qui lit la police — et la mesure ci-dessous serait
    // arbitraire.
    for (const st of FORMAT_4.slice(1)) {
      expect([...pointsCouverts(CMAP, st.offset)].sort((a, b) => a - b)).toEqual(
        [...MESURE].sort((a, b) => a - b)
      );
    }
  });

  it('PLAGES_POLICE est exactement ce que le fichier contient', () => {
    expect(enPlages(MESURE)).toEqual(PLAGES_POLICE.map(([a, b]) => [a, b]));
  });

  it('isCovered répond juste sur TOUT le plan multilingue de base', () => {
    // Comparaison plage par plage ci-dessus, point de code par point de code
    // ici : la première valide la forme de la table, la seconde le prédicat qui
    // la parcourt. Une erreur de borne (`<` au lieu de `<=`) passerait la
    // première et échouerait ici.
    for (let cp = 0; cp <= 0xffff; cp++) {
      if (isCovered(cp) !== MESURE.has(cp)) {
        throw new Error(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} : ` +
          `isCovered=${isCovered(cp)} mais la police dit ${MESURE.has(cp)}`);
      }
    }
    expect(MESURE.size).toBe(230);
  });

  it('rien au-dessus de U+FFFF ne peut être couvert', () => {
    for (const cp of [0x10000, 0x1f300, 0x1f64f, 0x1f9d1, 0x10ffff]) {
      expect(isCovered(cp)).toBe(false);
    }
  });
});

describe('ce que la police sait et ne sait pas dessiner', () => {
  it('couvre tous les accents français — ils ne sont PAS en cause', () => {
    expect(uncoveredIn('Où étés-vous ? Ça ira — cœur, naïveté, Noël, Ïambe, Œuvre')).toEqual([]);
  });

  it('couvre les deux caractères porteurs de config.json', () => {
    expect(isCovered(0x2019)).toBe(true); // ’ apostrophe typographique
    expect(isCovered(0x2014)).toBe(true); // — cadratin
  });

  it('ne couvre ni emoji, ni arabe, ni chinois', () => {
    expect(uncoveredIn('🔥').length).toBe(1);
    expect(uncoveredIn('السلام').length).toBe(6);
    expect(uncoveredIn('你好').length).toBe(2);
  });

  it('ne couvre pas ce que la plage déclarée annonce pourtant', () => {
    // Les quatre écarts qui justifient d'avoir mesuré plutôt que de faire
    // confiance à l'`unicode-range` publiée par @fontsource.
    expect(isCovered(0x00ad)).toBe(false); // trait d'union conditionnel
    expect(isCovered(0x2010)).toBe(false); // trait d'union, dans U+2000-206F « annoncé en entier »
    expect(isCovered(0x2074)).toBe(false);
    // Le plus parlant : un repli qui aurait émis « � » se serait affiché en carré.
    expect(isCovered(0xfffd)).toBe(false);
  });

  it('exempte les caractères de mise en page, absents du cmap', () => {
    // Le cmap saute de U+0000 à U+0020 : sans exemption explicite, un simple
    // retour à la ligne serait classé « non couvert » et TOUT message sur
    // plusieurs lignes basculerait sur la carte générique.
    expect(isCovered(0x000a)).toBe(false);
    expect(uncoveredIn('Ligne un\nLigne deux\tsuite')).toEqual([]);
  });
});

describe('renderableText — trois issues, jamais de carré', () => {
  const billboards = (rawConfig as { billboards: Array<{ id: string; message: string; author: string }> })
    .billboards;

  it.each(billboards.map((b) => [b.id, b.message] as const))(
    'panneau publié « %s » : aperçu fidèle, octets inchangés',
    (_id, message) => {
      // Tripwire assumé. Si ce test échoue, ce n'est pas un défaut du code :
      // c'est qu'un panneau vient d'être publié dans une écriture que la police
      // ne dessine pas, et que son aperçu social sera donc la carte générique.
      // Décision à prendre en connaissance de cause — soit on l'accepte et on
      // retire l'identifiant d'ici, soit on enregistre une police auprès de
      // Satori dans ogRender.ts.
      expect(uncoveredIn(message)).toEqual([]);
      // `toBe` et non `toEqual` : on exige l'IDENTITÉ, pas l'égalité. Une
      // normalisation au passage changerait les octets du PNG OpenGraph, donc
      // le CID IPFS, pour un contenu qui n'a aucun défaut.
      expect(renderableText(message)).toBe(message);
    }
  );

  it('conserve ce que la police sait écrire quand l’essentiel survit', () => {
    // Un emoji au milieu d'une phrase française n'est pas un changement de
    // script : basculer sur la carte générique perdrait « JESUS T’AIME », que
    // la police dessine parfaitement.
    expect(renderableText('🔥✨ JESUS T’AIME ✨🔥 💙💜')).toBe('JESUS T’AIME');
    expect(renderableText('La paix 🕊️ pour tous 🌍 sans exception ✨🙏')).toBe(
      'La paix pour tous sans exception'
    );
  });

  it('recolle les espaces laissés par les caractères retirés', () => {
    // Sans le recollage, la carte afficherait des trous là où le message n'en a
    // pas — un défaut visible que le retrait aurait lui-même créé.
    const rendu = renderableText('Paix 🕊️ 🌍 pour tous')!;
    expect(rendu).toBe('Paix pour tous');
    expect(rendu).not.toMatch(/ {2}/);
  });

  it('renonce quand il ne reste rien du message', () => {
    expect(renderableText('السلام عليكم ورحمة الله')).toBeNull();
    expect(renderableText('你好世界，和平与爱永存')).toBeNull();
  });

  it('renonce quand le résidu ne vaut plus le message', () => {
    // « Oui » seul fait une carte plus pauvre que la carte générique, qui au
    // moins annonce honnêtement qu'il faut ouvrir le panneau.
    expect(renderableText('🔥🔥🔥 Oui 🔥🔥🔥')).toBeNull();
  });

  it('GARANTIE DURE : ce qui sort est toujours entièrement dessinable', () => {
    // La propriété qui justifie l'existence du module. Elle vaut pour toute
    // entrée, y compris celles auxquelles personne n'a pensé — c'est pour cela
    // qu'elle est formulée comme une propriété et non comme une liste de cas.
    const entrees = [
      'JESUS T’AIME',
      '🔥✨ JESUS T’AIME ✨🔥 💙💜',
      'السلام عليكم',
      '你好世界',
      'Où étés-vous ? Ça ira — cœur',
      'Ligne un\nLigne deux',
      'Mixte 你好 avec du français et 🙏 des emoji au milieu du texte',
      '',
      '   ',
      '­‐�',
    ];
    for (const entree of entrees) {
      const rendu = renderableText(entree);
      if (rendu !== null) expect(uncoveredIn(rendu)).toEqual([]);
    }
  });
});
