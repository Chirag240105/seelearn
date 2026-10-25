import React from 'react';
import { ConnectionType } from '../../types/sceneSpec';

interface TraceLegendProps {
  activeFilter: 'all' | ConnectionType;
  onSelectFilter: (filter: 'all' | ConnectionType) => void;
  counts: Record<ConnectionType, number>;
}

export const TraceLegend: React.FC<TraceLegendProps> = ({
  activeFilter,
  onSelectFilter,
  counts,
}) => {
  const items: Array<{
    type: ConnectionType;
    label: string;
    dotColor: string;
    bgActive: string;
    borderActive: string;
    textActive: string;
  }> = [
    {
      type: 'power',
      label: 'Power Distribution',
      dotColor: 'bg-amber-400',
      bgActive: 'bg-amber-500/15',
      borderActive: 'border-amber-500/50',
      textActive: 'text-amber-200',
    },
    {
      type: 'signal',
      label: 'Signal & Control',
      dotColor: 'bg-cyan-400',
      bgActive: 'bg-cyan-500/15',
      borderActive: 'border-cyan-500/50',
      textActive: 'text-cyan-200',
    },
    {
      type: 'data',
      label: 'High-Speed Data Bus',
      dotColor: 'bg-violet-400',
      bgActive: 'bg-violet-500/15',
      borderActive: 'border-violet-500/50',
      textActive: 'text-violet-200',
    },
    {
      type: 'mechanical',
      label: 'Mechanical Linkage',
      dotColor: 'bg-sky-300',
      bgActive: 'bg-sky-500/15',
      borderActive: 'border-sky-500/50',
      textActive: 'text-sky-200',
    },
    {
      type: 'thermal',
      label: 'Thermal Dissipation',
      dotColor: 'bg-rose-400',
      bgActive: 'bg-rose-500/15',
      borderActive: 'border-rose-500/50',
      textActive: 'text-rose-200',
    },
  ];

  return (
    <div className="absolute top-16 right-6 md:right-[25rem] z-20 bg-[#0F172A]/90 backdrop-blur-md border border-slate-800 rounded-xl p-3 shadow-xl select-none max-w-xs w-full text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-white uppercase tracking-wider text-[10px] font-['Outfit']">
          Trace Network Layer
        </span>
        <button
          type="button"
          onClick={() => onSelectFilter('all')}
          className={`text-[10px] font-medium px-2 py-0.5 rounded cursor-pointer ${
            activeFilter === 'all'
              ? 'bg-sky-500 text-slate-950 font-bold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Show All
        </button>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => {
          const count = counts[item.type] || 0;
          if (count === 0 && activeFilter !== item.type) return null;
          const isSelected = activeFilter === item.type;

          return (
            <button
              key={item.type}
              type="button"
              onClick={() => onSelectFilter(isSelected ? 'all' : item.type)}
              className={`w-full flex items-center justify-between p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                isSelected
                  ? `${item.bgActive} ${item.borderActive} ${item.textActive}`
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${item.dotColor}`} />
                <span className="font-semibold text-xs">{item.label}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {count} {count === 1 ? 'trace' : 'traces'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
