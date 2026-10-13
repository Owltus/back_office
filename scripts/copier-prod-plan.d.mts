// Types de scripts/copier-prod-plan.mjs (script node sans compilation).
export declare const REF_PROD: string
export declare const SCHEMAS: ReadonlyArray<string>
export declare const EXCLUES: ReadonlyArray<string>
export declare const COMPTES: ReadonlyArray<string>
export declare function lectureComptes(table: string): string
export declare function insertionComptes(
  table: string,
  json: string,
  etiquette?: string,
): string
export declare const BUCKETS: ReadonlyArray<string>
export declare function derniereMigration(
  versionsProd: ReadonlyArray<string>,
): string | null
export declare function arretAvantCopie(e: {
  baseLocaleJoignable: boolean
  mailpitBranche: boolean
  arbrePropre: boolean
}): string | null
export declare function argumentsDump(fichier: string): Array<string>
export declare function migrationsNonLivrees(
  fichiersLocaux: ReadonlyArray<string>,
  versionProd: string | null,
): Array<string>
