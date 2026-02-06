
export const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
};

export const formatFullDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleDateString('vi-VN');
};

export const formatNumber = (num: number | undefined, fractionDigits: number = 2): string => {
  if (num === undefined) return '-';
  return new Intl.NumberFormat('vi-VN', { 
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits 
  }).format(num);
};

export const parseVNIndexData = (data: any): { timestamp: number; close: number }[] => {
  if (!data) return [];

  // Scenario 4: Specific AlphaStock wrapper (handle first to avoid array ambiguity)
  // Recursively unwrap { data: [...] } structure
  if (data.data && Array.isArray(data.data)) {
      return parseVNIndexData(data.data);
  }

  // Scenario 1: Array of arrays
  if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
    return data.map((item: any[]) => {
      let timestamp = item[0];
      const close = item.length >= 5 ? item[4] : item[1];
      if (typeof timestamp === 'number' && timestamp < 10000000000) timestamp *= 1000;
      return { timestamp, close: Number(close) };
    });
  }
  
  // Scenario 2: Array of objects
  if (Array.isArray(data)) {
    return data.map((item: any) => {
      // Keys based on user provided JSON: { "date": "...", "value": ... }
      const time = item.date || item.time || item.t || item.Date || item.Time || item.dt;
      // Added item.price, item.adClose, item.adjClose to support sector API and other formats
      const close = item.value || item.close || item.c || item.Close || item.Price || item.price || item.v || item.adClose || item.adjClose;
      
      if (time === undefined || close === undefined) return null;

      let timestamp = typeof time === 'string' ? new Date(time).getTime() : time;
      if (typeof timestamp === 'number' && timestamp < 10000000000) timestamp *= 1000;

      return { timestamp, close: Number(close) };
    }).filter((item): item is { timestamp: number; close: number } => item !== null);
  }
  
  // Scenario 3: TradingView format
  if (data && Array.isArray(data.t) && Array.isArray(data.c)) {
    return data.t.map((t: number, i: number) => {
      let timestamp = t;
      if (timestamp < 10000000000) timestamp *= 1000;
      return {
        timestamp,
        close: Number(data.c[i])
      };
    });
  }

  return [];
};
