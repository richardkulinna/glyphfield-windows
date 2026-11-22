export {};

declare global {
  interface Window {
    glyphfieldDesktop?: {
      saveBrandBookPdf(): Promise<'saved' | 'cancelled'>;
    };
  }
}
