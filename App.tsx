import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ReferenceLine, Label, Brush
} from 'recharts';
import { FilterParams, ChartDataPoint, TimeRange, SectorDef } from './types';
import { fetchBreadthData, fetchVNIndexData } from './services/api';
import { formatDate } from './utils/formatters';
import SettingsPanel from './components/SettingsPanel';
import AiInsightPanel from './components/AiInsightPanel';
import { CustomTooltip } from './components/CustomTooltip';
import { RefreshCw, AlertCircle, Search, GitCommitHorizontal, Download } from 'lucide-react';
import clsx from 'clsx';

const VNINDEX_URLS: Record<string, string> = {
  '1M': 'https://api.alphastock.vn/charts_json/vnindex_1m.json',
  '3M': 'https://api.alphastock.vn/charts_json/vnindex_3m.json',
  '6M': 'https://api.alphastock.vn/charts_json/vnindex_6m.json',
  '1Y': 'https://api.alphastock.vn/charts_json/vnindex_1y.json',
  '3Y': 'https://api.alphastock.vn/charts_json/vnindex_3y.json',
  '5Y': 'https://api.alphastock.vn/charts_json/vnindex_5y.json',
  '7Y': 'https://api.alphastock.vn/charts_json/vnindex_5y.json', 
};

const CAP_INDICES = [
    { code: 'vnmid', name: 'MidCap (VNMID)' },
    { code: 'vnsml', name: 'SmallCap (VNSML)' },
];

const SECTORS: SectorDef[] = [
  { code: '500', name: 'Dầu khí' },
  { code: '8500', name: 'Bảo hiểm' },
  { code: '7500', name: 'Dịch vụ tiện ích' },
  { code: '6500', name: 'Viễn thông' },
  { code: '9500', name: 'Công nghệ' },
  { code: '1300', name: 'Hóa chất' },
  { code: '8600', name: 'Bất động sản' },
  { code: '8300', name: 'Ngân hàng' },
  { code: '5700', name: 'Du lịch & Giải trí' },
  { code: '4500', name: 'Y tế' },
  { code: '5300', name: 'Dịch vụ bán lẻ' },
  { code: '8700', name: 'Dịch vụ tài chính' },
  { code: '3500', name: 'Thực phẩm & Đồ uống' },
  { code: '3700', name: 'Đồ dùng cá nhân và đồ gia dụng' },
  { code: '2300', name: 'Xây dựng & Vật liệu' },
  { code: '2700', name: 'Hàng hóa và dịch vụ công nghiệp' },
  { code: '1700', name: 'Tài nguyên' },
  { code: '3300', name: 'Ôtô & linh kiện phụ tùng' },
  { code: '5500', name: 'Phương tiện truyền thông' },
];

// Cấu hình mặc định: 84 tháng (~7 năm), Default Sector: Banking (8300)
const DEFAULT_PARAMS: FilterParams = {
  t: 84, 
  floor: 'hnx,hose,upcom',
  min_adClose: 2,
  max_adClose: 500,
  min_MA20: 50,
  max_MA20: 200000,
  breadthUrl: 'https://api.alphastock.vn/api/stock/avg',
  vnIndexUrl: 'https://api.alphastock.vn/api/rrg/sector?code=8300&week=1', // Default Banking
  indexCode: '8300'
};

const RANGES: { key: TimeRange; label: string }[] = [
    { key: '1M', label: '1M' },
    { key: '3M', label: '3M' },
    { key: '6M', label: '6M' },
    { key: '1Y', label: '1Y' },
    { key: '3Y', label: '3Y' },
    { key: '5Y', label: '5Y' },
    { key: '7Y', label: '7Y (all)' },
];

const App: React.FC = () => {
  const [params, setParams] = useState<FilterParams>(DEFAULT_PARAMS);
  const [range, setRange] = useState<TimeRange>('1Y');
  const [capType, setCapType] = useState('vnmid');

  // Chart 4 Mode State: 'sector' or 'stock'
  const [chart4Mode, setChart4Mode] = useState<'sector' | 'stock'>('sector');
  const [stockInput, setStockInput] = useState('');
  const [activeStock, setActiveStock] = useState('PVD');
  
  // States dữ liệu
  const [breadthData, setBreadthData] = useState<any[]>([]);
  const [vnIndexFixedData, setVnIndexFixedData] = useState<any[]>([]); // Data for Chart 2 (Always VNINDEX)
  const [capData, setCapData] = useState<any[]>([]); // Data for Chart 3 (Small/Mid Cap)
  const [sectorData, setSectorData] = useState<any[]>([]); // Data for Chart 4 (Selected Sector or Stock)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States UI
  const [isMounted, setIsMounted] = useState(false);
  const [visibleLines, setVisibleLines] = useState({ ma20: true, ma50: true, ma200: true });
  const [hoveredData, setHoveredData] = useState<ChartDataPoint | null>(null);
  const [showCrossovers, setShowCrossovers] = useState(false); // 20/50
  const [showCrossovers50200, setShowCrossovers50200] = useState(false); // 50/200
  
  // Zoom Domain State (timestamp start, timestamp end)
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);

  // Set mounted state once
  useEffect(() => { 
    setIsMounted(true); 
  }, []);

  // Fetch data callback
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // 1. Determine URL for Fixed VNINDEX (Chart 2) based on current Range
      const fixedVnIndexUrl = VNINDEX_URLS[range] || VNINDEX_URLS['5Y'];

      // 2. Determine URL for Cap Index (Chart 3)
      let timeSuffix = range.toLowerCase();
      if (timeSuffix === '7y') timeSuffix = '5y'; // Fallback
      const capUrl = `https://api.alphastock.vn/charts_json/${capType}_${timeSuffix}.json`;

      // 3. Determine URL for Chart 4 (Sector OR Stock)
      let chart4Url = params.vnIndexUrl;
      if (chart4Mode === 'stock' && activeStock) {
        chart4Url = `https://api.alphastock.vn/api/history?code=${activeStock.toLowerCase()}`;
      }

      const [breadth, vnIndexFixed, cap, sector] = await Promise.all([
        fetchBreadthData(params),
        fetchVNIndexData(fixedVnIndexUrl), // Always fetch standard VNINDEX
        fetchVNIndexData(capUrl),          // Fetch Cap Index
        fetchVNIndexData(chart4Url)        // Fetch Sector or Stock
      ]);

      if (!breadth.length && !vnIndexFixed.length) {
        setError("Không có dữ liệu. Vui lòng kiểm tra lại bộ lọc.");
      }
      setBreadthData(breadth);
      setVnIndexFixedData(vnIndexFixed);
      setCapData(cap);
      setSectorData(sector);
    } catch (err) {
      setError("Lỗi tải dữ liệu.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [params, range, capType, chart4Mode, activeStock]); 

  // Trigger fetch when params change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset zoom when range or data changes
  useEffect(() => {
    setZoomDomain(null);
  }, [range, params]);

  // --- Logic Xử lý Dữ liệu (Memoized) ---
  const chartData = useMemo(() => {
    if (!breadthData.length && !vnIndexFixedData.length) return [];

    // 1. Map dữ liệu theo Date Key (YYYY-MM-DD)
    const dataMap = new Map<string, ChartDataPoint>();
    const getDateKey = (ts: number) => new Date(ts).toISOString().split('T')[0];

    // Helper merge
    const getOrCreate = (ts: number, key: string) => {
        if (!dataMap.has(key)) {
            dataMap.set(key, {
                date: key, timestamp: ts, formattedDate: formatDate(ts),
                vnIndex: undefined,
                capVal: undefined,
                sectorVal: undefined
            });
        }
        return dataMap.get(key)!;
    };

    // Merge Breadth
    breadthData.forEach(b => {
        const item = getOrCreate(b.timestamp, getDateKey(b.timestamp));
        Object.assign(item, b); // Merge breadth props
    });

    // Merge Fixed VNINDEX (Chart 2)
    vnIndexFixedData.forEach(v => {
        const item = getOrCreate(v.timestamp, getDateKey(v.timestamp));
        if (v.close !== null && v.close !== undefined) {
             item.vnIndex = v.close;
        }
    });

    // Merge Cap Index (Chart 3)
    capData.forEach(v => {
        const item = getOrCreate(v.timestamp, getDateKey(v.timestamp));
        if (v.close !== null && v.close !== undefined) {
             item.capVal = v.close;
        }
    });

    // Merge Sector (Chart 4)
    sectorData.forEach(v => {
        const item = getOrCreate(v.timestamp, getDateKey(v.timestamp));
        if (v.close !== null && v.close !== undefined) {
             item.sectorVal = v.close;
        }
    });

    // 2. Sort ALL Data First
    let sorted = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    // 3. Filter Time Range
    if (params.fromDate || params.toDate) {
        const from = params.fromDate ? new Date(params.fromDate).getTime() : 0;
        const to = params.toDate ? new Date(params.toDate).getTime() + 86400000 : Infinity;
        sorted = sorted.filter(d => d.timestamp >= from && d.timestamp < to);
    } else {
        const ranges: Record<string, number> = {
            '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '3Y': 1095, '5Y': 1825, '7Y': 2555
        };
        // Use range filtering based on global range state
        if (ranges[range]) {
            const cutoff = Date.now() - (ranges[range] * 86400000);
            sorted = sorted.filter(d => d.timestamp >= cutoff);
        }
    }

    return sorted;
  }, [breadthData, vnIndexFixedData, capData, sectorData, range, params.fromDate, params.toDate]);

  // Calculate Crossovers
  const crossovers = useMemo(() => {
    if (!chartData || chartData.length < 2) return { cross20_50: [], cross50_200: [] };
    const cross20_50: { x: number; type: 'bull' | 'bear' }[] = [];
    const cross50_200: { x: number; type: 'bull' | 'bear' }[] = [];
    
    for (let i = 1; i < chartData.length; i++) {
        const prev = chartData[i - 1];
        const curr = chartData[i];
        
        // 20/50 Logic
        if (prev.ma20 !== undefined && prev.ma50 !== undefined && curr.ma20 !== undefined && curr.ma50 !== undefined) {
             if (prev.ma20 <= prev.ma50 && curr.ma20 > curr.ma50) {
                cross20_50.push({ x: curr.timestamp, type: 'bull' });
            } else if (prev.ma20 >= prev.ma50 && curr.ma20 < curr.ma50) {
                cross20_50.push({ x: curr.timestamp, type: 'bear' });
            }
        }

        // 50/200 Logic
        if (prev.ma50 !== undefined && prev.ma200 !== undefined && curr.ma50 !== undefined && curr.ma200 !== undefined) {
             if (prev.ma50 <= prev.ma200 && curr.ma50 > curr.ma200) {
                cross50_200.push({ x: curr.timestamp, type: 'bull' });
            } else if (prev.ma50 >= prev.ma200 && curr.ma50 < curr.ma200) {
                cross50_200.push({ x: curr.timestamp, type: 'bear' });
            }
        }
    }
    return { cross20_50, cross50_200 };
  }, [chartData]);

  // --- Cấu hình Trục X (Memoized) ---
  const xAxisConfig = useMemo(() => {
    return { 
        ticks: undefined, 
        formatter: (ts: number) => {
            const d = new Date(ts);
            const month = d.toLocaleString('en-US', { month: 'short' });
            const year = d.getFullYear().toString().slice(-2);
            return `${month}/${year}`;
        } 
    };
  }, []);

  const handleRangeChange = (r: TimeRange) => {
      setRange(r);
      // Only reset custom dates, sector URL persists from params
      setParams(p => ({ 
          ...p, 
          fromDate: undefined, 
          toDate: undefined
      }));
  };

  const handleIndexChange = (code: string) => {
    // Mode switches to Sector
    setChart4Mode('sector');
    setStockInput(''); // Clear stock input when switching back to sector
    
    // Always Sector API now since VNINDEX option is removed
    const url = `https://api.alphastock.vn/api/rrg/sector?code=${code}&week=1`;
    
    // Auto-switch to 1Y if currently on a long-term view (>1Y) as sector data is limited
    if (['3Y', '5Y', '7Y'].includes(range)) {
        setRange('1Y');
    }

    setParams(p => ({
        ...p,
        indexCode: code,
        vnIndexUrl: url,
        // Reset custom dates
        fromDate: undefined,
        toDate: undefined
    }));
  };

  const handleStockSubmit = () => {
    if (!stockInput) return;
    const uppercased = stockInput.toUpperCase();
    setActiveStock(uppercased);
    setChart4Mode('stock');
    setStockInput(uppercased); // Keep value in input to show active stock
  };

  const handleBrushChange = (e: any) => {
    if (e.startIndex !== undefined && e.endIndex !== undefined && chartData.length > 0) {
        const start = chartData[e.startIndex]?.timestamp;
        const end = chartData[e.endIndex]?.timestamp;
        if (start && end) {
            setZoomDomain([start, end]);
        }
    }
  };
  
  const handleChartMouseMove = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
        setHoveredData(state.activePayload[0].payload);
    } else {
        // Optional: Reset on leave or keep last
        // setHoveredData(null); 
    }
  };

  const handleChartMouseLeave = () => {
     setHoveredData(null);
  };

  // Determine label for the Sector/Stock chart
  const indexName = useMemo(() => {
      if (chart4Mode === 'stock') return `STOCK: ${activeStock}`;
      const s = SECTORS.find(s => s.code === params.indexCode);
      return s ? s.name : 'SECTOR';
  }, [params.indexCode, chart4Mode, activeStock]);

  // Determine label for Cap chart
  const capName = useMemo(() => {
      const c = CAP_INDICES.find(ci => ci.code === capType);
      return c ? c.name : 'CAP';
  }, [capType]);

  const handleExportCSV = () => {
    if (!chartData.length) return;

    // Build Header Row
    const headers = [
        'Date',
        'VNINDEX',
        '% > MA20',
        '% > MA50',
        '% > MA200',
        capName,
        indexName
    ];

    // Build Data Rows
    const rows = chartData.map(item => {
        return [
            item.date,
            item.vnIndex !== undefined ? item.vnIndex.toFixed(2) : '',
            item.ma20 !== undefined ? item.ma20.toFixed(2) : '',
            item.ma50 !== undefined ? item.ma50.toFixed(2) : '',
            item.ma200 !== undefined ? item.ma200.toFixed(2) : '',
            item.capVal !== undefined ? item.capVal.toFixed(2) : '',
            item.sectorVal !== undefined ? item.sectorVal.toFixed(2) : ''
        ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `market_data_${range}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="min-h-screen bg-[#0B0E14] text-gray-200 font-sans flex flex-col selection:bg-blue-500/30">
      {/* Header */}
      <header className="border-b border-gray-800 bg-[#0B0E14]/80 backdrop-blur sticky top-0 z-30 h-16 flex-none">
        <div className="max-w-[1920px] mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="bg-gradient-to-tr from-blue-600 to-cyan-500 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">M</div>
             <h1 className="font-bold text-lg text-gray-100 hidden sm:block">Market Breadth</h1>
          </div>
          <div className="flex items-center gap-3">
             {loading && <span className="text-xs text-blue-400 animate-pulse flex items-center gap-1"><RefreshCw size={12} className="animate-spin"/> Updating...</span>}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-grow p-4 lg:p-6 max-w-[1920px] mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
            
            {/* Left: Charts */}
            <div className="lg:col-span-3 flex flex-col gap-4 min-h-[500px]">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-4 bg-[#131722] p-2 rounded-lg border border-gray-800">
                    <div className="flex gap-1 bg-gray-900/50 p-1 rounded">
                        {RANGES.map((r) => (
                            <button key={r.key} onClick={() => handleRangeChange(r.key)}
                                className={clsx("px-3 py-1 text-xs font-medium rounded transition-all",
                                    range === r.key && !params.fromDate ? "bg-gray-700 text-white shadow" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                )}>
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-3 text-xs font-medium items-center">
                        {[
                            { k: 'ma20', color: '#F59E0B', label: '%Above MA20' },
                            { k: 'ma50', color: '#10B981', label: '%Above MA50' },
                            { k: 'ma200', color: '#EF4444', label: '%Above MA200' }
                        ].map((item) => (
                            <button key={item.k} onClick={() => setVisibleLines(prev => ({ ...prev, [item.k]: !prev[item.k as keyof typeof visibleLines] }))}
                                className={clsx("flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-opacity", 
                                    !visibleLines[item.k as keyof typeof visibleLines] && "opacity-40 grayscale"
                                )}>
                                <span className="w-2 h-2 rounded-full" style={{ background: item.color }}></span>
                                <span className="text-gray-300">{item.label}</span>
                            </button>
                        ))}
                        <div className="w-px h-4 bg-gray-700 mx-1"></div>
                        <button 
                            onClick={() => setShowCrossovers(!showCrossovers)}
                            className={clsx("flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-opacity", 
                                !showCrossovers ? "opacity-50 text-gray-500" : "text-purple-400 bg-purple-500/10"
                            )}
                        >
                            <GitCommitHorizontal size={14} />
                            <span>Cross (20/50)</span>
                        </button>
                        <button 
                            onClick={() => setShowCrossovers50200(!showCrossovers50200)}
                            className={clsx("flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-opacity", 
                                !showCrossovers50200 ? "opacity-50 text-gray-500" : "text-pink-400 bg-pink-500/10"
                            )}
                        >
                            <GitCommitHorizontal size={14} />
                            <span>Cross (50/200)</span>
                        </button>
                        <div className="w-px h-4 bg-gray-700 mx-1"></div>
                        <button 
                            onClick={handleExportCSV}
                            className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 transition-opacity text-blue-400 bg-blue-500/10"
                            title="Export CSV"
                        >
                            <Download size={14} />
                            <span>CSV</span>
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded flex items-center gap-2 text-sm">
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {/* Chart Container - Stack of 4 */}
                <div className="flex-grow bg-[#131722] border border-gray-800 rounded-xl shadow-xl overflow-hidden flex flex-col relative min-h-[900px]">
                    {loading && <div className="absolute inset-0 z-20 bg-black/20 backdrop-blur-[1px] flex items-center justify-center"><RefreshCw className="animate-spin text-blue-500" /></div>}
                    
                    {/* 1. Market Breadth Chart */}
                    <div className="flex-[1.3] relative w-full min-h-0 border-b border-gray-800/50">
                        <div className="absolute top-9 left-3 text-xs font-bold text-gray-200 uppercase tracking-widest z-10 pointer-events-none drop-shadow-md">Market Breadth %</div>
                        {isMounted && (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart 
                                    data={chartData} 
                                    syncId="sync" 
                                    margin={{ top: 35, right: 0, left: 40, bottom: 0 }}
                                    onMouseMove={handleChartMouseMove}
                                    onMouseLeave={handleChartMouseLeave}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2B2B43" vertical={false} />
                                    <XAxis 
                                        dataKey="timestamp" 
                                        type="number" 
                                        domain={zoomDomain || ['dataMin', 'dataMax']} 
                                        allowDataOverflow={true}
                                        padding={{ left: 0, right: 0 }}
                                        hide 
                                    />
                                    <YAxis 
                                        orientation="right" 
                                        domain={[0, 100]} 
                                        stroke="#9CA3AF" 
                                        tick={{fontSize: 11, fill: '#D1D5DB'}} 
                                        tickLine={false} 
                                        axisLine={false} 
                                    />
                                    <Tooltip content={<CustomTooltip type="breadth" />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                                    <ReferenceLine y={50} stroke="#EF4444" strokeDasharray="3 3" opacity={0.5} />
                                    
                                    {showCrossovers && crossovers.cross20_50.map((evt, idx) => (
                                        <ReferenceLine 
                                            key={`c2050-${idx}`} 
                                            x={evt.x} 
                                            stroke={evt.type === 'bull' ? '#10B981' : '#EF4444'} 
                                            strokeDasharray="3 3"
                                            strokeOpacity={0.6}
                                        >
                                            <Label 
                                                value={evt.type === 'bull' ? "▲" : "▼"} 
                                                position="insideTop" 
                                                offset={10} 
                                                fill={evt.type === 'bull' ? '#10B981' : '#EF4444'} 
                                                fontSize={12} 
                                                fontWeight="bold"
                                            />
                                        </ReferenceLine>
                                    ))}

                                    {showCrossovers50200 && crossovers.cross50_200.map((evt, idx) => (
                                        <ReferenceLine 
                                            key={`c50200-${idx}`} 
                                            x={evt.x} 
                                            stroke={evt.type === 'bull' ? '#10B981' : '#EF4444'} 
                                            strokeDasharray="5 5"
                                            strokeOpacity={0.8}
                                            strokeWidth={1.5}
                                        >
                                            <Label 
                                                value={evt.type === 'bull' ? "GOLD" : "BAD"} 
                                                position="insideBottom" 
                                                offset={5} 
                                                fill={evt.type === 'bull' ? '#10B981' : '#EF4444'} 
                                                fontSize={10} 
                                                fontWeight="bold"
                                            />
                                        </ReferenceLine>
                                    ))}

                                    <Line type="monotone" dataKey="ma20" hide={!visibleLines.ma20} stroke="#F59E0B" strokeWidth={2.5} dot={false} connectNulls animationDuration={300} isAnimationActive={false} />
                                    <Line type="monotone" dataKey="ma50" hide={!visibleLines.ma50} stroke="#10B981" strokeWidth={2.5} dot={false} connectNulls animationDuration={300} isAnimationActive={false} />
                                    <Line type="monotone" dataKey="ma200" hide={!visibleLines.ma200} stroke="#EF4444" strokeWidth={2.5} dot={false} connectNulls animationDuration={300} isAnimationActive={false} />
                                    
                                    <Brush 
                                        dataKey="timestamp" 
                                        height={16}
                                        y={0}
                                        stroke="#3B82F6"
                                        strokeWidth={1}
                                        fill="#131722"
                                        fillOpacity={1}
                                        tickFormatter={formatDate}
                                        onChange={handleBrushChange}
                                        alwaysShowText={true}
                                        className="text-[10px] font-normal"
                                        travellerWidth={10}
                                        key={range}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* 2. Fixed VNINDEX Chart */}
                    <div className="flex-1 relative w-full min-h-0 border-b border-gray-800/50">
                         <div className="absolute top-2 left-3 text-xs font-bold text-gray-200 uppercase tracking-widest z-10 pointer-events-none drop-shadow-md">VNINDEX</div>
                         {isMounted && (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart 
                                    data={chartData} 
                                    syncId="sync" 
                                    margin={{ top: 10, right: 0, left: 40, bottom: 5 }}
                                    onMouseMove={handleChartMouseMove}
                                    onMouseLeave={handleChartMouseLeave}
                                >
                                    <defs>
                                        <linearGradient id="gradVN" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.2}/>
                                            <stop offset="100%" stopColor="#10B981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2B2B43" vertical={false} />
                                    <XAxis 
                                        dataKey="timestamp" 
                                        type="number"
                                        domain={zoomDomain || ['dataMin', 'dataMax']}
                                        padding={{ left: 0, right: 0 }}
                                        hide
                                    />
                                    <YAxis 
                                        orientation="right" 
                                        domain={['auto', 'auto']} 
                                        stroke="#9CA3AF" 
                                        tick={{fontSize: 11, fill: '#D1D5DB'}} 
                                        tickLine={false} 
                                        axisLine={false} 
                                        tickFormatter={v => v.toLocaleString()} 
                                    />
                                    <Tooltip content={<CustomTooltip type="vnindex" />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                                    <Area type="monotone" dataKey="vnIndex" stroke="#10B981" fill="url(#gradVN)" strokeWidth={1.5} connectNulls animationDuration={300} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                         )}
                    </div>

                    {/* 3. Small/Mid Cap Chart (New) */}
                    <div className="flex-1 relative w-full min-h-0 border-b border-gray-800/50">
                         <div className="absolute top-2 left-3 z-20">
                             <select 
                                value={capType} 
                                onChange={(e) => setCapType(e.target.value)}
                                className="bg-[#1f2937]/90 text-[10px] font-bold text-purple-400 border border-purple-500/30 rounded px-2 py-0.5 outline-none hover:bg-[#374151] cursor-pointer backdrop-blur shadow-sm uppercase tracking-wide appearance-none"
                             >
                                {CAP_INDICES.map(c => (
                                    <option key={c.code} value={c.code} className="bg-gray-900 text-gray-300">{c.name}</option>
                                ))}
                             </select>
                         </div>
                         {isMounted && (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart 
                                    data={chartData} 
                                    syncId="sync" 
                                    margin={{ top: 10, right: 0, left: 40, bottom: 5 }}
                                    onMouseMove={handleChartMouseMove}
                                    onMouseLeave={handleChartMouseLeave}
                                >
                                    <defs>
                                        <linearGradient id="gradCap" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.2}/>
                                            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2B2B43" vertical={false} />
                                    <XAxis 
                                        dataKey="timestamp" 
                                        type="number"
                                        domain={zoomDomain || ['dataMin', 'dataMax']}
                                        padding={{ left: 0, right: 0 }}
                                        hide
                                    />
                                    <YAxis 
                                        orientation="right" 
                                        domain={['auto', 'auto']} 
                                        stroke="#9CA3AF" 
                                        tick={{fontSize: 11, fill: '#D1D5DB'}} 
                                        tickLine={false} 
                                        axisLine={false} 
                                        tickFormatter={v => v.toLocaleString()} 
                                    />
                                    <Tooltip content={<CustomTooltip type="cap" indexName={capName} />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                                    <Area type="monotone" dataKey="capVal" stroke="#8B5CF6" fill="url(#gradCap)" strokeWidth={1.5} connectNulls animationDuration={300} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                         )}
                    </div>

                    {/* 4. Sector / Selected Index Chart */}
                    <div className="flex-1 relative w-full min-h-0">
                         <div className="absolute top-2 left-3 z-20 flex items-center gap-2">
                             {/* Sector Selector */}
                             <select 
                                value={chart4Mode === 'sector' ? params.indexCode : ''} 
                                onChange={(e) => handleIndexChange(e.target.value)}
                                className={clsx(
                                    "bg-[#1f2937]/90 text-[10px] font-bold border rounded px-2 py-0.5 outline-none hover:bg-[#374151] cursor-pointer backdrop-blur shadow-sm uppercase tracking-wide appearance-none transition-colors",
                                    chart4Mode === 'sector' ? "text-blue-400 border-blue-500/30" : "text-gray-500 border-gray-700"
                                )}
                             >
                                <option value="" disabled className="bg-gray-900">SECTORS...</option>
                                {SECTORS.map(s => (
                                    <option key={s.code} value={s.code} className="bg-gray-900 text-gray-300">{s.name}</option>
                                ))}
                             </select>
                            
                             <span className="text-gray-600 text-[10px]">|</span>

                             {/* Stock Input */}
                             <div className="relative flex items-center">
                                <input 
                                    type="text" 
                                    placeholder="Mã CK"
                                    value={stockInput}
                                    onChange={(e) => setStockInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleStockSubmit()}
                                    className={clsx(
                                        "bg-[#1f2937]/90 text-[10px] font-bold rounded px-2 py-0.5 outline-none w-20 backdrop-blur shadow-sm uppercase placeholder-gray-600 transition-all border",
                                        chart4Mode === 'stock' ? "text-blue-400 border-blue-500/30 focus:border-blue-500" : "text-gray-400 border-gray-700 focus:border-gray-500"
                                    )}
                                />
                                <button 
                                    onClick={handleStockSubmit}
                                    className="absolute right-1 text-gray-500 hover:text-blue-400"
                                >
                                    <Search size={10} />
                                </button>
                             </div>
                         </div>
                         
                         {isMounted && (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart 
                                    data={chartData} 
                                    syncId="sync" 
                                    margin={{ top: 10, right: 0, left: 40, bottom: 5 }}
                                    onMouseMove={handleChartMouseMove}
                                    onMouseLeave={handleChartMouseLeave}
                                >
                                    <defs>
                                        <linearGradient id="gradSector" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2}/>
                                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2B2B43" vertical={false} />
                                    <XAxis 
                                        dataKey="timestamp" 
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        tickFormatter={xAxisConfig.formatter} 
                                        ticks={xAxisConfig.ticks} 
                                        stroke="#9CA3AF" 
                                        tick={{fontSize: 11, fill: '#D1D5DB'}} 
                                        tickLine={false} 
                                        axisLine={false} 
                                        minTickGap={30} 
                                        dy={5}
                                        padding={{ left: 0, right: 0 }}
                                    />
                                    <YAxis 
                                        orientation="right" 
                                        domain={['auto', 'auto']} 
                                        stroke="#9CA3AF" 
                                        tick={{fontSize: 11, fill: '#D1D5DB'}} 
                                        tickLine={false} 
                                        axisLine={false} 
                                        tickFormatter={v => v.toLocaleString()} 
                                    />
                                    <Tooltip content={<CustomTooltip type="sector" indexName={indexName} />} cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }} />
                                    <Area type="monotone" dataKey="sectorVal" stroke="#3B82F6" fill="url(#gradSector)" strokeWidth={1.5} connectNulls animationDuration={300} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                         )}
                    </div>
                </div>
            </div>

            {/* Right: Settings & AI */}
            <div className="lg:col-span-1 flex flex-col gap-6">
                <div className="sticky top-20 flex flex-col gap-6">
                     <SettingsPanel 
                        params={params} 
                        setParams={setParams} 
                        onRefresh={fetchData} 
                        isOpen={true} 
                        onClose={() => {}} 
                     />
                     <AiInsightPanel 
                        data={chartData} 
                        sectorName={indexName} 
                        capName={capName} 
                        sectors={SECTORS}
                     />
                </div>
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;