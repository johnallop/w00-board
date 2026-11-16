import { describe, it, expect } from 'vitest';
import { EDITEUR, HEBERGEUR, STOCKAGE, estSirenValide } from '../data/editeur';

describe('estSirenValide', () => {
  it('accepte 9 chiffres dont la clé de Luhn est juste, espaces tolérés', () => {
    expect(estSirenValide('123456782')).toBe(true);
    expect(estSirenValide('123 456 782')).toBe(true);
  });

  it.each([
    ['clé fausse', '123456789'],
    ['8 chiffres', '12345678'],
    ['lettre', '12345678A'],
    ['vide', ''],
  ])('refuse : %s', (_, valeur) => {
    expect(estSirenValide(valeur)).toBe(false);
  });
});

// Article 1-1, I, de la loi n° 2004-575 : ce que la page doit pouvoir publier.
describe('mentions légales', () => {
  it('le SIREN, une fois renseigné, est un SIREN valide', () => {
    if (EDITEUR.siren !== null) expect(estSirenValide(EDITEUR.siren)).toBe(true);
  });

  it('l’hébergeur a un nom, une adresse et un téléphone', () => {
    expect(HEBERGEUR.nom).not.toBe('');
    expect(HEBERGEUR.adresse).not.toBe('');
    expect(HEBERGEUR.telephone).toBeTruthy();
  });

  it('chaque prestataire de stockage a un nom et une adresse', () => {
    for (const p of STOCKAGE) {
      expect(p.nom).not.toBe('');
      expect(p.adresse).not.toBe('');
    }
  });

  it('le lien téléphone correspond au numéro affiché', () => {
    const affiche = EDITEUR.telephone.replace(/\s/g, '').replace(/^0/, '+33');
    expect(EDITEUR.telephoneUri).toBe(`tel:${affiche}`);
  });
});
