import React from 'react';

interface ModeSelectorProps {
  selectedMode: string;
  onModeChange: (mode: string) => void;
  disabled?: boolean;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  selectedMode,
  onModeChange,
  disabled = false,
}) => {
  const modes = [
    { value: 'code', label: 'Code' },
    { value: 'chat', label: 'Chat' },
    { value: 'task', label: 'Task' },
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Mode:</span>
      <select
        value={selectedMode}
        onChange={(e) => onModeChange(e.target.value)}
        disabled={disabled}
        className="text-xs border border-input rounded bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring min-w-20"
      >
        {modes.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
    </div>
  );
};

