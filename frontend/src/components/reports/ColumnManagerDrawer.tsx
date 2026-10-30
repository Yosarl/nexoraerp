import React, { useState, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Checkbox,
  TextField,
  Button,
  Divider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

export interface ColumnDefinition {
  id: string;
  label: string;
  defaultLabel: string;
  width: number;
  defaultWidth: number;
  visible: boolean;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
}

const LEGACY_COST_LABELS = /^(total purchase rate|t\.?\s*purchase rate|stock value)$/i;

export function mergeReportColumns(defaults: ColumnDefinition[], saved: ColumnDefinition[]): ColumnDefinition[] {
  const merged: ColumnDefinition[] = [];
  const seen = new Set<string>();

  for (const col of saved) {
    const def = defaults.find((d) => d.id === col.id);
    if (!def) continue;
    const savedLabel = (col.label || '').trim();
    const useDefaultLabel = !savedLabel || LEGACY_COST_LABELS.test(savedLabel);
    merged.push({
      ...def,
      label: useDefaultLabel ? def.defaultLabel : savedLabel,
      width: typeof col.width === 'number' && col.width >= 20 ? col.width : def.defaultWidth,
      visible: typeof col.visible === 'boolean' ? col.visible : def.visible,
    });
    seen.add(col.id);
  }

  for (const def of defaults) {
    if (seen.has(def.id)) continue;
    const defIndex = defaults.findIndex((d) => d.id === def.id);
    let insertAt = merged.length;
    for (let i = defIndex - 1; i >= 0; i--) {
      const prevIdx = merged.findIndex((c) => c.id === defaults[i].id);
      if (prevIdx !== -1) {
        insertAt = prevIdx + 1;
        break;
      }
    }
    merged.splice(insertAt, 0, def);
  }

  return merged;
}

interface ColumnManagerDrawerProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnDefinition[];
  onColumnsChange: (columns: ColumnDefinition[]) => void;
  onResetDefaults: () => void;
  storageKey?: string;
}

export default function ColumnManagerDrawer({
  open,
  onClose,
  columns,
  onColumnsChange,
  onResetDefaults,
  storageKey,
}: ColumnManagerDrawerProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Save to localStorage when columns change
  const handleUpdateColumns = useCallback(
    (newCols: ColumnDefinition[]) => {
      onColumnsChange(newCols);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(newCols));
        } catch {
          // ignore storage errors
        }
      }
    },
    [onColumnsChange, storageKey]
  );

  // Toggle visible
  const handleToggleVisible = (index: number) => {
    const updated = columns.map((col, idx) =>
      idx === index ? { ...col, visible: !col.visible } : col
    );
    handleUpdateColumns(updated);
  };

  // Change Label
  const handleLabelChange = (index: number, newLabel: string) => {
    const updated = columns.map((col, idx) =>
      idx === index ? { ...col, label: newLabel } : col
    );
    handleUpdateColumns(updated);
  };

  // Change Width
  const handleWidthChange = (index: number, newWidthStr: string) => {
    const num = parseInt(newWidthStr, 10);
    const validWidth = isNaN(num) || num < 20 ? 40 : num;
    const updated = columns.map((col, idx) =>
      idx === index ? { ...col, width: validWidth } : col
    );
    handleUpdateColumns(updated);
  };

  // Move Column Up / Down
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;
    const newCols = [...columns];
    const [moved] = newCols.splice(index, 1);
    newCols.splice(targetIndex, 0, moved);
    handleUpdateColumns(newCols);
  };

  // HTML5 Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newCols = [...columns];
    const [moved] = newCols.splice(draggedIndex, 1);
    newCols.splice(dropIndex, 0, moved);
    setDraggedIndex(null);
    setDragOverIndex(null);
    handleUpdateColumns(newCols);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleSelectAll = (selectAll: boolean) => {
    const updated = columns.map((col) => ({ ...col, visible: selectAll }));
    handleUpdateColumns(updated);
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 390 },
          maxWidth: '100vw',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          bgcolor: '#f8fafc',
        },
      }}
    >
      {/* Header Banner - Matches Image */}
      <Box
        sx={{
          bgcolor: '#0f766e',
          color: 'white',
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <ViewColumnIcon sx={{ fontSize: 24, color: 'white' }} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2, color: 'white' }}>
              Column Manager
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.85)', mt: 0.2 }}>
              Press F5 to show / hide this panel
            </Typography>
          </Box>
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
          }}
        >
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>

      {/* Legend / Instruction Subheader */}
      <Box
        sx={{
          bgcolor: '#e6fffa',
          color: '#0f766e',
          px: 1.8,
          py: 0.8,
          borderBottom: '1px solid #b2f5ea',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography sx={{ fontSize: '0.73rem', fontWeight: 600, letterSpacing: 0.1 }}>
          ☰ Drag to reorder · ☑ Check show/hide · ✎ Edit rename title · W width
        </Typography>
      </Box>

      {/* Quick Select Bar */}
      <Box
        sx={{
          px: 2,
          py: 0.6,
          bgcolor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
          {columns.filter((c) => c.visible).length} of {columns.length} columns active
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            onClick={() => handleSelectAll(true)}
            sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.2, px: 0.8, minWidth: 'auto', color: '#0f766e', fontWeight: 600 }}
          >
            Show All
          </Button>
          <Button
            size="small"
            onClick={() => handleSelectAll(false)}
            sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.2, px: 0.8, minWidth: 'auto', color: '#64748b', fontWeight: 600 }}
          >
            Hide All
          </Button>
        </Box>
      </Box>

      {/* Column Items List */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.8,
        }}
      >
        {columns.map((col, index) => {
          const isDragging = draggedIndex === index;
          const isOver = dragOverIndex === index;

          return (
            <Box
              key={col.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.8,
                p: 0.6,
                bgcolor: isOver ? '#ecfdf5' : '#ffffff',
                border: isOver ? '1.5px dashed #0f766e' : '1px solid #e2e8f0',
                borderRadius: 1.5,
                boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.03)',
                opacity: isDragging ? 0.4 : col.visible ? 1 : 0.6,
                transition: 'all 0.15s ease',
                '&:hover': {
                  borderColor: '#0f766e',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                },
              }}
            >
              {/* Drag Handle */}
              <Box
                sx={{
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#94a3b8',
                  '&:active': { cursor: 'grabbing' },
                  '&:hover': { color: '#0f766e' },
                }}
                title="Drag to reorder"
              >
                <DragIndicatorIcon sx={{ fontSize: 18 }} />
              </Box>

              {/* Checkbox */}
              <Checkbox
                checked={col.visible}
                onChange={() => handleToggleVisible(index)}
                size="small"
                sx={{
                  p: 0.2,
                  color: '#94a3b8',
                  '&.Mui-checked': {
                    color: '#0f766e',
                  },
                }}
                title={col.visible ? 'Hide Column' : 'Show Column'}
              />

              {/* Editable Label Input */}
              <TextField
                size="small"
                value={col.label}
                onChange={(e) => handleLabelChange(index, e.target.value)}
                placeholder="Column Name"
                sx={{
                  flex: 1,
                  '& .MuiInputBase-input': {
                    fontSize: '0.78rem',
                    py: 0.6,
                    px: 1,
                    fontWeight: 500,
                    color: '#1e293b',
                  },
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 1,
                    bgcolor: '#fafafa',
                    '&:hover': { bgcolor: '#ffffff' },
                    '&.Mui-focused': { bgcolor: '#ffffff' },
                  },
                }}
              />

              {/* Width Input */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                  W:
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  value={col.width}
                  onChange={(e) => handleWidthChange(index, e.target.value)}
                  inputProps={{ min: 25, max: 600, step: 5 }}
                  sx={{
                    width: 58,
                    '& .MuiInputBase-input': {
                      fontSize: '0.75rem',
                      py: 0.6,
                      px: 0.6,
                      textAlign: 'center',
                      fontWeight: 600,
                      color: '#0f766e',
                    },
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 1,
                      bgcolor: '#fafafa',
                      '&:hover': { bgcolor: '#ffffff' },
                      '&.Mui-focused': { bgcolor: '#ffffff' },
                    },
                  }}
                />
              </Box>

              {/* Up/Down Quick Shift Buttons */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1 }}>
                <IconButton
                  size="small"
                  disabled={index === 0}
                  onClick={() => handleMove(index, 'up')}
                  sx={{ p: 0.1, width: 16, height: 13, color: '#94a3b8', '&:hover': { color: '#0f766e' } }}
                  title="Move Up"
                >
                  <ArrowUpwardIcon sx={{ fontSize: 13 }} />
                </IconButton>
                <IconButton
                  size="small"
                  disabled={index === columns.length - 1}
                  onClick={() => handleMove(index, 'down')}
                  sx={{ p: 0.1, width: 16, height: 13, color: '#94a3b8', '&:hover': { color: '#0f766e' } }}
                  title="Move Down"
                >
                  <ArrowDownwardIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Footer Controls */}
      <Divider />
      <Box
        sx={{
          p: 1.8,
          bgcolor: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Button
          size="small"
          variant="outlined"
          startIcon={<RestartAltIcon sx={{ fontSize: 16 }} />}
          onClick={onResetDefaults}
          sx={{
            borderColor: '#cbd5e1',
            color: '#475569',
            textTransform: 'none',
            fontSize: '0.78rem',
            fontWeight: 600,
            py: 0.7,
            px: 1.5,
            borderRadius: 1.5,
            '&:hover': {
              bgcolor: '#f1f5f9',
              borderColor: '#94a3b8',
            },
          }}
        >
          Reset Defaults
        </Button>

        <Button
          size="small"
          variant="contained"
          onClick={onClose}
          sx={{
            bgcolor: '#0f766e',
            color: '#ffffff',
            textTransform: 'none',
            fontSize: '0.8rem',
            fontWeight: 700,
            py: 0.7,
            px: 2.2,
            borderRadius: 1.5,
            boxShadow: 'none',
            '&:hover': {
              bgcolor: '#115e59',
              boxShadow: 'none',
            },
          }}
        >
          Done
        </Button>
      </Box>
    </Drawer>
  );
}
