
import React, { memo, useState } from 'react';
import { FilterParams } from '../types';
import { SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  params: FilterParams;
  setParams: React.Dispatch<React.SetStateAction<FilterParams>>;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

const SettingsPanel: React.FC<Props> = memo(({ params, setParams, onRefresh }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleChange = (key: keyof FilterParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-gray-200 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none";
  const labelClass = "block text-[10px] text-gray-500 mb-1 uppercase font-semibold tracking-wider";

  // Helper component for input with suffix
  const NumberInput = ({ value, onChange, label }: { value: number, onChange: (val: number) => void, label: string }) => (
    <div className="relative group">
      <input 
        type="number" 
        value={value} 
        onChange={(e) => onChange(Number(e.target.value))} 
        className={`${inputClass} pr-10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`} 
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 group-focus-within:text-gray-400 font-medium uppercase pointer-events-none transition-colors">
        {label}
      </span>
    </div>
  );

  return (
    <div className="bg-[#131722] border border-gray-800 rounded-xl shadow-lg w-full transition-all duration-300">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/30 rounded-t-xl"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-blue-500" /> 
          <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wide">Cấu hình</h2>
        </div>
        <button className="text-gray-500 hover:text-white transition-colors" type="button">
          {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-5 pt-0 space-y-6 border-t border-gray-800/50">
          <div className="mt-4"></div> {/* Spacer */}
          
          {/* Date Range */}
          <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className={labelClass}>Từ ngày</label>
                      <input type="date" value={params.fromDate || ''} onChange={(e) => handleChange('fromDate', e.target.value)} className={inputClass} />
                  </div>
                  <div>
                      <label className={labelClass}>Đến ngày</label>
                      <input type="date" value={params.toDate || ''} onChange={(e) => handleChange('toDate', e.target.value)} className={inputClass} />
                  </div>
              </div>
          </div>

          {/* Exchange */}
          <div>
            <label className={labelClass}>Sàn giao dịch</label>
            <div className="flex gap-2">
              {['hose', 'hnx', 'upcom'].map((floor) => (
                <label key={floor} className="flex-1 flex items-center justify-center gap-2 cursor-pointer bg-gray-900 py-2 rounded border border-gray-800 hover:border-gray-600 transition-colors">
                  <input type="checkbox" checked={params.floor.includes(floor)}
                    onChange={(e) => {
                      const floors = params.floor.split(',').filter(f => f);
                      if (e.target.checked) floors.push(floor);
                      else { const idx = floors.indexOf(floor); if (idx > -1) floors.splice(idx, 1); }
                      handleChange('floor', floors.join(','));
                    }}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0"
                  />
                  <span className="text-gray-300 text-[10px] font-bold uppercase">{floor}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">Giá (K VND)</h3>
                  <NumberInput value={params.min_adClose} onChange={(v) => handleChange('min_adClose', v)} label="min" />
                  <NumberInput value={params.max_adClose} onChange={(v) => handleChange('max_adClose', v)} label="max" />
              </div>
              <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">Vol MA20 (K CP)</h3>
                  <NumberInput value={params.min_MA20} onChange={(v) => handleChange('min_MA20', v)} label="min" />
                  <NumberInput value={params.max_MA20} onChange={(v) => handleChange('max_MA20', v)} label="max" />
              </div>
          </div>

          <div className="flex flex-col gap-3 pt-2 border-t border-gray-800/50">
            <button 
                type="button"
                onClick={onRefresh} 
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] text-xs uppercase tracking-widest"
            >
                Áp dụng bộ lọc
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default SettingsPanel;
