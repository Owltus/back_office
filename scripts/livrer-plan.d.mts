// Types de scripts/livrer-plan.mjs (script node sans compilation).
export declare const REF_PROD: string
export declare const SANS_VERIF_JWT: ReadonlySet<string>
export interface Etape {
  nom: string
  cmd: Array<string>
}
export declare function fonctionsModifiees(
  fichiers: ReadonlyArray<string>,
  toutes: ReadonlyArray<string>,
): Array<string>
export declare function lignesDestructrices(sql: string): Array<string>
export declare function normaliserSchema(sql: string): string
export declare function ecartSchema(
  attendu: string,
  reel: string,
): { absentes: Array<string>; ajoutees: Array<string> }
export declare function arretAvantProd(e: {
  branche: string
  arbrePropre: boolean
  enRetard: boolean
  etiquetteProd: boolean
  controles: ReadonlyArray<{ nom: string; ok: boolean }>
  migrationsNonJoueesEnLocal: ReadonlyArray<string>
}): string | null
export declare function planEnvoi(e: {
  reponse: string
  confirmationSuppression: string | null
  migrations: ReadonlyArray<{
    nom: string
    destructrices: ReadonlyArray<string>
  }>
  fonctions: ReadonlyArray<string>
  commits: number
}): { etapes: Array<Etape>; raison: string | null }
export declare function bilanEchec(
  etapes: ReadonlyArray<Etape>,
  i: number,
): {
  parti: Array<string>
  echoue: string | null
  pasParti: Array<string>
  peutEtreEnPartie: boolean
}
export declare function lignesJson(
  sortie: string,
): Array<Record<string, unknown>>
export declare function secretsManquants(
  attendus: ReadonlyArray<string>,
  presents: ReadonlyArray<string>,
): Array<string>
