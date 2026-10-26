import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X, Layers } from 'lucide-react';
import { ConnectionType } from '../../types/sceneSpec';

interface TraceLegendProps {
  activeFilter: 'all' | ConnectionType;
  onSelectFilter: (filter: 'all' | ConnectionType) => void;
  counts: Record<ConnectionType, number>;
  onClose: () => void;
}

export const TraceLegend: React.FC<TraceLegendProps> = ({
  activeFilter,
  onSelectFilter,
  counts,
  onClose,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const items: Array<{
    type: ConnectionType;
    label: string;
    tokenColor: string;
  }> = [
    {
      type: 'power',
      label: 'Power Distribution',
      tokenColor: 'var(--sl-conn-power)',
    },
    {
      type: 'signal',
      label: 'Signal & Control',
      tokenColor: 'var(--sl-conn-signal)',
    },
    {
      type: 'data',
      label: 'Data Bus',
      tokenColor: 'var(--sl-conn-data)',
    },
    {
      type: 'mechanical',
      label: 'Mechanical Linkage',
      tokenColor: 'var(--sl-conn-mechanical)',
    },
    {
      type: 'thermal',
      label: 'Thermal Channel',
      tokenColor: 'var(--sl-conn-thermal)',
    },
  ];

  return (
    <div
      className="absolute bottom-20 left-4 z-20 rounded-xl border p-3 shadow-xl select-none w-72 text-xs backdrop-blur-xl transition-all"
      style={{
        backgroundColor: 'var(--sl-bg-surface)',
        borderColor: 'var(--sl-border)',
        color: 'var(--sl-text-primary)',
      }}
    >
      <div className="flex items-center justify-between mb-2 pb-1 border-b" style={{ borderColor: 'var(--sl-border-subtle)' }}>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1.5 font-bold text-xs cursor-pointer"
          style={{ color: 'var(--sl-text-primary)' }}
        >
          <Layers className="w-3.5 h-3.5" style={{ color: 'var(--sl-accent)' }} />
          <span>Connection Layer Filter</span>
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelectFilter('all')}
            className="text-xs font-semibold px-2 py-0.5 rounded border transition cursor-pointer"
            style={{
              backgroundColor: activeFilter === 'all' ? 'var(--sl-accent)' : 'var(--sl-bg-raised)',
              borderColor: activeFilter === 'all' ? 'var(--sl-accent)' : 'var(--sl-border)',
              color: activeFilter === 'all' ? '#ffffff' : 'var(--sl-text-secondary)',
            }}
          >
            All
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trace legend"
            className="p-1 rounded border transition cursor-pointer"
            style={{
              backgroundColor: 'var(--sl-bg-raised)',
              borderColor: 'var(--sl-border)',
              color: 'var(--sl-text-muted)',
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-1.5">
          {items.map((item) => {
            const count = counts[item.type] || 0;
            const isSelected = activeFilter === item.type;

            return (
              <button
                key={item.type}
                type="button"
                onClick={() => onSelectFilter(isSelected ? 'all' : item.type)}
                className="w-full flex items-center justify-between p-2 rounded-lg border text-left text-xs transition cursor-pointer"
                style={{
                  backgroundColor: isSelected ? 'var(--sl-bg-raised)' : 'transparent',
                  borderColor: isSelected ? item.tokenColor : 'var(--sl-border-subtle)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.tokenColor }}
                  />
                  <span className="font-medium" style={{ color: 'var(--sl-text-primary)' }}>
                    {item.label}
                  </span>
                </div>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--sl-text-muted)', backgroundColor: 'var(--sl-bg-base)' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
