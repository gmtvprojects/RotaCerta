/** Status vistos no demo de referência; revisar ao modelar o backend. */
export type OrderStatus = 'draft' | 'awaiting' | 'ready' | 'queued' | 'loading' | 'released' | 'onroute' | 'delivered' | 'failed';
export type RouteStatus = 'loading' | 'released' | 'active' | 'finished';
export type PaperSheetStatus = 'captured' | 'imported';
export type BoxType = 'ambient' | 'cold' | 'frozen';
