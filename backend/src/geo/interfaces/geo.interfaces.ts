export interface NormalizedLocation {
  /** 和风 Location ID,如 "101011600" */
  id: string;
  /** 地点名,直辖市反查出来是区级,如 "东城" */
  name: string;
  /** 省级行政区,如 "北京市" */
  adm1: string;
  /** 市级行政区,如 "北京"。地级市自身的 name 与 adm2 会重复(厦门/厦门) */
  adm2: string;
  /** 和风返回的是字符串,这里统一转成 number */
  lat: number;
  lon: number;
}
