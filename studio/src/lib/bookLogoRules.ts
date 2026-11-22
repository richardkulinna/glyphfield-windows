/** The first six entries retain the saved indices used by earlier books. */
export const BOOK_LOGO_RULES = [
  { label: 'Proportionen nicht verzerren', kind: 'dont', example: 'stretch' },
  { label: 'Logo nicht drehen', kind: 'dont', example: 'rotate' },
  { label: 'Keine Fremdfarbe einsetzen', kind: 'dont', example: 'recolour' },
  { label: 'Keinen Schatten hinzufügen', kind: 'dont', example: 'shadow' },
  { label: 'Keine Kontur ergänzen', kind: 'dont', example: 'outline' },
  { label: 'Unruhigen Hintergrund vermeiden', kind: 'dont', example: 'busy' },
  { label: 'Originalproportionen wahren', kind: 'do', example: 'original' },
  { label: 'Schutzraum einhalten', kind: 'do', example: 'margin' },
  { label: 'Dunkle Version auf heller Fläche', kind: 'do', example: 'light' },
  { label: 'Helle Version auf dunkler Fläche', kind: 'do', example: 'dark' },
  { label: 'Bildmarke im kleinen Format', kind: 'do', example: 'symbol' },
  { label: 'Wortmarke horizontal ausrichten', kind: 'do', example: 'baseline' },
] as const;
