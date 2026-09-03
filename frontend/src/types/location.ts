/** 与后端 backend/src/geo/interfaces/geo.interfaces.ts 保持一致,手动同步 */
export interface NormalizedLocation {
  id: string;
  name: string;
  /** 省级,如 "北京市" */
  adm1: string;
  /** 市级,如 "北京" */
  adm2: string;
  lat: number;
  lon: number;
}
