
import { FilterParams, BreadthDataPoint, VNIndexDataPoint } from '../types';
import { parseVNIndexData } from '../utils/formatters';

const DEFAULT_BREADTH_URL = 'https://api.alphastock.vn/api/stock/avg';
const DEFAULT_VNINDEX_URL = 'https://api.alphastock.vn/charts_json/vnindex_5y.json';
// Bump version to invalidate old cache (V4 -> V5)
const CACHE_PREFIX = 'MBA_CACHE_V5_'; 
// Updated TTL to 4h
const VNINDEX_TTL = 4 * 60 * 60 * 1000; 
const BREADTH_MIN_FRESH = 5 * 60 * 1000; // 5 minutes

// --- Cache Helpers ---

const getCacheKey = (prefix: string, params: any) => {
  const paramString = JSON.stringify(params, Object.keys(params).sort());
  return `${CACHE_PREFIX}${prefix}_${paramString}`;
};

const saveToCache = (key: string, data: any) => {
  try {
    const payload = {
      timestamp: Date.now(),
      data: data
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn("LocalStorage quota exceeded or error:", e);
  }
};

const loadFromCache = <T>(key: string, ttl: number | null = null): { data: T; age: number } | null => {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;

    const payload = JSON.parse(item);
    if (!payload || !payload.data) return null;

    const age = Date.now() - payload.timestamp;
    
    if (ttl !== null && age > ttl) {
      return null;
    }

    return { data: payload.data as T, age };
  } catch (e) {
    return null;
  }
};

// --- Network Helpers ---

const fetchWithFallback = async (url: string) => {
  // Add a cache buster parameter to ensure we get fresh data from the server, ignoring browser cache
  const urlWithCacheBuster = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;

  try {
    const response = await fetch(urlWithCacheBuster);
    if (!response.ok) throw new Error(`Direct fetch failed: ${response.statusText}`);
    return await response.json();
  } catch (directError) {
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(urlWithCacheBuster)}`;
      const proxyResponse = await fetch(proxyUrl);
      if (!proxyResponse.ok) throw new Error(`Proxy fetch failed: ${proxyResponse.statusText}`);
      return await proxyResponse.json();
    } catch (proxyError) {
      console.error(`Fetch failed for ${url}`, proxyError);
      throw proxyError;
    }
  }
};

// --- Main API Functions ---

export const fetchVNIndexData = async (url?: string): Promise<VNIndexDataPoint[]> => {
  const targetUrl = url || DEFAULT_VNINDEX_URL;
  const cacheKey = getCacheKey('VNINDEX', { url: targetUrl });

  // 1. Check Cache
  const cached = loadFromCache<VNIndexDataPoint[]>(cacheKey, VNINDEX_TTL);
  if (cached) {
    return cached.data;
  }

  try {
    const data = await fetchWithFallback(targetUrl);
    // Add extra validation logging
    if (!data) {
        throw new Error("Empty data received");
    }
    const parsed = parseVNIndexData(data);
    
    // Only cache if we actually parsed something
    if (parsed.length > 0) {
      saveToCache(cacheKey, parsed);
    } else {
        console.warn("Parsed VNIndex data is empty for URL:", targetUrl);
    }
    return parsed;
  } catch (error) {
    console.error("VNIndex Fetch Error:", error);
    // Fallback: Use stale cache if available, otherwise empty
    const staleCache = loadFromCache<VNIndexDataPoint[]>(cacheKey, null); 
    if (staleCache) return staleCache.data;
    return [];
  }
};

export const fetchBreadthData = async (params: FilterParams): Promise<BreadthDataPoint[]> => {
  const filterIdentity = {
    floor: params.floor,
    min_ad: params.min_adClose,
    max_ad: params.max_adClose,
    min_ma: params.min_MA20,
    max_ma: params.max_MA20,
    breadthUrl: params.breadthUrl || DEFAULT_BREADTH_URL
  };
  
  const cacheKey = getCacheKey('BREADTH', filterIdentity);
  let cachedData: BreadthDataPoint[] = [];
  let isCacheValid = false;
  let cacheAge = 999999999;

  const cachedResult = loadFromCache<BreadthDataPoint[]>(cacheKey, null);
  if (cachedResult && Array.isArray(cachedResult.data) && cachedResult.data.length > 0) {
    cachedData = cachedResult.data;
    isCacheValid = true;
    cacheAge = cachedResult.age;
  }

  if (isCacheValid && cacheAge < BREADTH_MIN_FRESH) {
    return cachedData;
  }

  try {
    const baseUrl = params.breadthUrl || DEFAULT_BREADTH_URL;
    const queryParams = new URLSearchParams({
      t: params.t.toString(),
      floor: params.floor,
      min_adClose: String(params.min_adClose),
      max_adClose: String(params.max_adClose),
      min_MA20: String(params.min_MA20),
      max_MA20: String(params.max_MA20),
    });

    const promises: Promise<any>[] = [];

    const latestQuery = new URLSearchParams(queryParams);
    latestQuery.append('latest', '1');
    const latestUrl = `${baseUrl}?${latestQuery.toString()}`;
    promises.push(fetchWithFallback(latestUrl).catch(() => []));

    const shouldFetchHistory = !isCacheValid || cachedData.length < 50;

    if (shouldFetchHistory) {
      const historyUrl = `${baseUrl}?${queryParams.toString()}`;
      promises.push(fetchWithFallback(historyUrl).catch(() => []));
    }

    const results = await Promise.all(promises);
    const latestRaw = results[0];
    const historyRaw = shouldFetchHistory ? results[1] : [];

    const processRaw = (data: any) => {
        if (!data) return [];
        const raw = (data.data && !Array.isArray(data.data) && typeof data.data === 'object') 
            ? mapComplexBreadthData(data.data) 
            : (Array.isArray(data) ? data : data.data || []);
        
        return Array.isArray(raw) ? (raw.length > 0 && 'ma20' in raw[0] ? raw : mapBreadthData(raw)) : [];
    };

    const latestPoints = processRaw(latestRaw);
    const historyPoints = processRaw(historyRaw);

    const mergedMap = new Map<number, BreadthDataPoint>();

    if (!shouldFetchHistory && isCacheValid) {
        cachedData.forEach(p => mergedMap.set(p.timestamp, p));
    }
    if (shouldFetchHistory) {
        historyPoints.forEach(p => mergedMap.set(p.timestamp, p));
    }
    latestPoints.forEach(p => mergedMap.set(p.timestamp, p));

    const finalResult = Array.from(mergedMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    if (finalResult.length > 0) {
        saveToCache(cacheKey, finalResult);
    }

    return finalResult;

  } catch (error) {
    console.error("Breadth Fetch Error:", error);
    if (isCacheValid) {
        return cachedData;
    }
    return [];
  }
};

const mapComplexBreadthData = (dataObj: any): BreadthDataPoint[] => {
    const merged = new Map<string, any>();
    const mergeSeries = (key: string, countProp: string) => {
        if (Array.isArray(dataObj[key])) {
            dataObj[key].forEach((item: any) => {
                const date = item.date;
                if (!merged.has(date)) merged.set(date, { date, total: 0 });
                const entry = merged.get(date);
                if (item.total) entry.total = Math.max(entry.total, Number(item.total));
                entry[countProp] = parseFloat(item.value);
            });
        }
    };
    mergeSeries('ma20', 'count20');
    mergeSeries('ma50', 'count50');
    mergeSeries('ma200', 'count200');

    return Array.from(merged.values()).map(item => {
        const t = item.total || 0;
        const calc = (c: number) => t > 0 ? (c / t) * 100 : 0;
        const ts = new Date(item.date).getTime();
        return {
            date: item.date,
            timestamp: isNaN(ts) ? 0 : ts,
            total: t,
            count20: item.count20 || 0,
            count50: item.count50 || 0,
            count200: item.count200 || 0,
            ma20: calc(item.count20 || 0),
            ma50: calc(item.count50 || 0),
            ma200: calc(item.count200 || 0),
        };
    });
};

const mapBreadthData = (data: any[]): BreadthDataPoint[] => {
  return data.map((item: any) => {
    const rawDate = item.date || item.Date || item.time || item.t;
    let timestamp = typeof rawDate === 'string' ? new Date(rawDate).getTime() : rawDate;
    if (typeof timestamp === 'number' && timestamp < 10000000000) timestamp *= 1000;

    const total = Number(item.total || 0);
    const c20 = Number(item.ma20 ?? item.avg_ma20 ?? item.pct_ma20 ?? 0);
    const c50 = Number(item.ma50 ?? item.avg_ma50 ?? item.pct_ma50 ?? 0);
    const c200 = Number(item.ma200 ?? item.avg_ma200 ?? item.pct_ma200 ?? 0);
    const calc = (c: number) => total > 0 ? (c / total) * 100 : 0;

    return {
      date: new Date(timestamp).toISOString().split('T')[0],
      timestamp,
      total,
      count20: c20, count50: c50, count200: c200,
      ma20: calc(c20), ma50: calc(c50), ma200: calc(c200),
    };
  }).filter(d => d.timestamp > 0);
};
