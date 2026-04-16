/** GET /v1/dolares/oficial */
export interface DolarApiOficialVivo {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
}

/** GET /v1/historicos/dolares/oficial — cada elemento */
export interface DolarApiOficialHistoricoItem {
  fuente?: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fecha: string;
}
