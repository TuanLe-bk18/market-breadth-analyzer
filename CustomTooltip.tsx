
import React, { memo } from 'react';
import { formatNumber, formatFullDate } from '../utils/formatters';

interface Props {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  type?: 'breadth' | 'vnindex' | 'sector' | 'cap';
  indexName?: string;
}

export const CustomTooltip: React.FC<Props> = memo(({ active, payload, label, type, indexName = 'VNINDEX' }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  // Xử lý label: nếu là timestamp số thì format, nếu string thì giữ nguyên
  const dateStr = typeof label === 'number' ? formatFullDate(label) : (label || '');

  return (
    <div className="bg-[#1f2937] border border-gray-700 p-3 rounded shadow-2xl backdrop-blur-sm bg-opacity-95 text-xs z-50 min-w-[150px]">
      <div className="text-gray-400 mb-2 font-bold border-b border-gray-600 pb-1">{dateStr}</div>
      
      {type === 'breadth' && (
        <div className="space-y-1.5">
          {payload.map((entry: any) => {
            const name = entry.name;
            const val = entry.value;
            const countKey = name.replace('ma', 'count');
            const countVal = data[countKey];
            
            return (
              <div key={name} className="flex justify-between items-center gap-4">
                 <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                    <span className="text-gray-300 font-medium uppercase">{name}</span>
                 </div>
                 <div className="text-right">
                   <span className="text-white font-mono font-bold">{formatNumber(val, 1)}%</span>
                   {countVal !== undefined && (
                      <span className="text-gray-500 text-[10px] ml-1">({Math.round(countVal)})</span>
                   )}
                 </div>
              </div>
            );
          })}
           <div className="mt-2 pt-1 border-t border-gray-700 text-gray-500 text-[10px] text-right">
             Total: {data.total} tickers
          </div>
        </div>
      )}

      {type === 'vnindex' && (
        <div className="flex justify-between items-center gap-4">
           <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
               <span className="text-gray-300 font-medium">VNINDEX</span>
           </div>
           <span className="text-white font-mono font-bold text-sm">{formatNumber(payload[0].value, 2)}</span>
        </div>
      )}

      {type === 'cap' && (
        <div className="flex justify-between items-center gap-4">
           <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-[#8B5CF6]"></span>
               <span className="text-gray-300 font-medium">{indexName}</span>
           </div>
           <span className="text-white font-mono font-bold text-sm">{formatNumber(payload[0].value, 2)}</span>
        </div>
      )}

      {type === 'sector' && (
        <div className="flex justify-between items-center gap-4">
           <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-[#3B82F6]"></span>
               <span className="text-gray-300 font-medium">{indexName}</span>
           </div>
           <span className="text-white font-mono font-bold text-sm">{formatNumber(payload[0].value, 2)}</span>
        </div>
      )}
    </div>
  );
});
