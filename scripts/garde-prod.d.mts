// Types de scripts/garde-prod.mjs (script node sans compilation).
export declare const MARQUEUR: string
export declare const REF_PROD: string
export declare const MOTIFS: ReadonlyArray<{
  re: RegExp
  raison: string
  saufLocal?: boolean
}>
export declare function normaliser(commande: string): string
export declare function verdict(
  commande: string,
):
  | { autorise: true; raisons?: undefined }
  | { autorise: false; raisons: Array<string> }
export declare function messageRefus(raisons: ReadonlyArray<string>): string
export declare function commandeDuHook(entree: string): string | null
