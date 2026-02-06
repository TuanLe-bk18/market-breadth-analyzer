
export interface BreadthDataPoint {
  date: string; // YYYY-MM-DD
  timestamp: number;
  ma20: number; // Percentage > MA20
  ma50: number; // Percentage > MA50
  ma200: number; // Percentage > MA200
  total: number; // Total stocks counted
  count20: number; // Count > MA20
  count50: number; // Count > MA50
  count200: number; // Count > MA200
}

export interface VNIndexDataPoint {
  timestamp: number; // Unix timestamp (seconds or milliseconds)
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface FilterParams {
  t: number; // Lookback period (days) for fetching
  floor: string; // hnx,hose,upcom
  min_adClose: number;
  max_adClose: number;
  min_MA20: number;
  max_MA20: number;
  fromDate?: string; // YYYY-MM-DD
  toDate?: string;   // YYYY-MM-DD
  breadthUrl?: string; // Configurable API URL for Breadth
  vnIndexUrl?: string; // Configurable API URL for the Selected Index (Chart 3)
  indexCode?: string; // 'VNINDEX' or Sector Code (e.g. '8300')
}

export type TimeRange = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | '7Y';

export interface ChartDataPoint {
  date: string;
  timestamp: number;
  ma20?: number;
  ma50?: number;
  ma200?: number;
  vnIndex?: number;    // For Chart 2 (Fixed VNINDEX)
  capVal?: number;     // For Chart 3 (Small/Mid Cap)
  sectorVal?: number;  // For Chart 4 (Selected Sector/Index)
  formattedDate: string;
}

export interface SectorDef {
  code: string;
  name: string;
}
