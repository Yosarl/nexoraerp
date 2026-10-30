import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { useAppSelector } from '../../store/hooks';
import { productApi } from '../../services/api';

interface UnitItem {
  _id: string;
  name: string;
  shortCode: string;
  isGlobal?: boolean;
  createdAt?: string;
}

type FilterScope = 'all' | 'global' | 'custom';

const AVATAR_PALETTE = [
  { tint: '#EEF2FF', ink: '#4338CA' }, // Indigo
  { tint: '#ECFDF5', ink: '#047857' }, // Emerald
  { tint: '#F0F9FF', ink: '#0369A1' }, // Sky
  { tint: '#FAF5FF', ink: '#7E22CE' }, // Purple
  { tint: '#FFF7ED', ink: '#C2410C' }, // Orange
  { tint: '#FEF2F2', ink: '#B91C1C' }, // Rose
  { tint: '#F0FDFA', ink: '#0F766E' }, // Teal
  { tint: '#FDF4FF', ink: '#A21CAF' }, // Fuchsia
];

function getAvatarColors(name: string) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

function getMonogram(name: string, code: string) {
  if (code && code.trim().length <= 3) {
    return code.trim().toUpperCase();
  }
  const words = (name || '').trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (code || name || 'UN').slice(0, 2).toUpperCase();
}

export default function UnitList() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  const [units, setUnits] = useState<UnitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<FilterScope>('all');

  // Search input ref for Ctrl+K
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState<UnitItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  // Shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadUnits = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    productApi
      .getUnits(companyId)
      .then((res) => {
        const data = (res.data.data as UnitItem[]) ?? [];
        setUnits(data);
      })
      .catch((err) => {
        console.error('Failed to load units of measure:', err);
        setUnits([]);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  // Filtered units
  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter((u) => {
      const matchSearch =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.shortCode && u.shortCode.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (filterScope === 'global') {
        return u.isGlobal !== false;
      }
      if (filterScope === 'custom') {
        return u.isGlobal === false;
      }
      return true;
    });
  }, [units, search, filterScope]);

  // Scope counts
  const globalCount = useMemo(() => units.filter((u) => u.isGlobal !== false).length, [units]);
  const customCount = useMemo(() => units.filter((u) => u.isGlobal === false).length, [units]);

  // Open Create Dialog
  const handleOpenCreate = () => {
    setEditingUnit(null);
    setFormName('');
    setFormCode('');
    setFormError(null);
    setModalOpen(true);
  };

  // Open Edit Dialog
  const handleOpenEdit = (unit: UnitItem) => {
    setEditingUnit(unit);
    setFormName(unit.name || '');
    setFormCode(unit.shortCode || '');
    setFormError(null);
    setModalOpen(true);
  };

  // Save Unit (Create or Update)
  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    const trimmedName = formName.trim();
    const trimmedCode = formCode.trim().toUpperCase();

    if (!trimmedName) {
      setFormError('Unit name is required.');
      return;
    }
    if (!trimmedCode) {
      setFormError('Short code / symbol is required.');
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingUnit) {
        await productApi.updateUnit(editingUnit._id, {
          name: trimmedName,
          shortCode: trimmedCode,
        });
      } else {
        await productApi.createUnit(companyId, {
          name: trimmedName,
          shortCode: trimmedCode,
        });
      }
      setModalOpen(false);
      loadUnits();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to save unit of measure.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Open Delete Confirmation
  const handleOpenDelete = async (unit: UnitItem) => {
    setUnitToDelete(unit);
    setDeleteError(null);
    setDeleteWarning(null);
    setDeleteModalOpen(true);

    // Check if unit is in use in products
    if (companyId) {
      try {
        const usage = await productApi.checkFieldUsage(companyId, 'unit', unit._id);
        const data = usage.data as { inUse?: boolean; count?: number };
        if (data?.inUse && data.count && data.count > 0) {
          setDeleteWarning(
            `Notice: This unit is currently referenced by ${data.count} product${
              data.count > 1 ? 's' : ''
            }. Deleting it may cause reference issues.`
          );
        }
      } catch {
        // Usage check is non-blocking
      }
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!unitToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await productApi.deleteUnit(unitToDelete._id);
      setDeleteModalOpen(false);
      setUnitToDelete(null);
      loadUnits();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete unit of measure.';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (units.length === 0) return;
    const headers = ['Unit Name', 'Short Code / Symbol', 'Scope Type'];
    const rows = units.map((u) => [
      `"${(u.name || '').replace(/"/g, '""')}"`,
      `"${(u.shortCode || '').replace(/"/g, '""')}"`,
      u.isGlobal !== false ? 'Global Standard' : 'Custom Company',
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `units_of_measure_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!companyId) {
    return (
      <div className="unit-catalog-root">
        <style>{unitStyles}</style>
        <div className="empty-company-card">
          <div className="empty-company-icon">🏢</div>
          <h2>No Company Selected</h2>
          <p>Please select a company from the top navigation to view and manage units of measure.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="unit-catalog-root">
      <style>{unitStyles}</style>

      {/* 1. Header Section */}
      <div className="unit-header">
        <div className="header-text-group">
          <div className="header-title-line">
            <h1 className="unit-title">Units of Measure</h1>
            <span className="unit-badge">
              <span className="dot-pulse" />
              UAE Statutory Standard Verified
            </span>
          </div>
          <p className="unit-desc">
            Standard inventory measurement units, conversion short codes, and POS packaging definitions.
          </p>
        </div>

        <div className="header-actions-group">
          <button type="button" className="btn-export" onClick={handleExportCSV} title="Export units to CSV">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button type="button" className="btn-create" onClick={handleOpenCreate}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Unit
          </button>
        </div>
      </div>

      {/* 2. Main Data Card */}
      <div className="main-data-card">
        {/* Toolbar */}
        <div className="card-toolbar">
          <div className="search-box-wrapper">
            <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by unit name or symbol (e.g. PCS, KG, CTN)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="search-input-field"
            />
            {search ? (
              <button type="button" className="clear-search-btn" onClick={() => setSearch('')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : (
              <span className="kbd-badge">Ctrl+K</span>
            )}
          </div>

          <div className="filter-pill-cluster">
            <button
              type="button"
              className={`filter-pill ${filterScope === 'all' ? 'pill-active' : ''}`}
              onClick={() => setFilterScope('all')}
            >
              All Units ({units.length})
            </button>
            <button
              type="button"
              className={`filter-pill ${filterScope === 'global' ? 'pill-active' : ''}`}
              onClick={() => setFilterScope('global')}
            >
              Global Standard ({globalCount})
            </button>
            {customCount > 0 && (
              <button
                type="button"
                className={`filter-pill ${filterScope === 'custom' ? 'pill-active' : ''}`}
                onClick={() => setFilterScope('custom')}
              >
                Custom ({customCount})
              </button>
            )}
          </div>

          <div className="toolbar-right-btns">
            <button
              type="button"
              className="btn-refresh"
              onClick={loadUnits}
              title="Refresh Unit List"
            >
              <svg className={loading ? 'spin-icon' : ''} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Informational Hint Bar */}
        <div className="info-tip-bar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            Standard measurement units are assigned to master inventory items and utilized for <strong>multi-unit conversion tiers</strong> (Piece, Box, Carton) and POS sales transactions.
          </span>
        </div>

        {/* Table Container */}
        <div className="table-scroll-area">
          <table className="clean-table">
            <thead>
              <tr>
                <th style={{ width: '35%' }}>Unit Name</th>
                <th style={{ width: '22%' }}>Short Code / Symbol</th>
                <th style={{ width: '25%' }}>Scope</th>
                <th style={{ width: '18%' }} className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="td-loading">
                    <div className="loading-row">
                      <div className="spinner-circle" />
                      <span>Loading units of measure...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={4} className="td-empty">
                    <div className="empty-box">
                      <div className="empty-icon-wrap">⚖️</div>
                      <div className="empty-title-text">
                        {search ? 'No units found matching your search.' : 'No units registered yet.'}
                      </div>
                      <p className="empty-sub-text">
                        {search
                          ? 'Try searching with a different unit name or symbol.'
                          : 'Click the button below to register standard units of measure.'}
                      </p>
                      {!search && (
                        <button
                          type="button"
                          className="btn-create"
                          style={{ margin: '14px auto 0' }}
                          onClick={handleOpenCreate}
                        >
                          + Add Unit of Measure
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUnits.map((u) => {
                  const avatarColor = getAvatarColors(u.name);
                  const monogram = getMonogram(u.name, u.shortCode);
                  const isGlobal = u.isGlobal !== false;

                  return (
                    <tr key={u._id} className="table-row">
                      {/* Name Column with Monogram Avatar */}
                      <td>
                        <div className="unit-cell">
                          <div
                            className="unit-avatar"
                            style={{ backgroundColor: avatarColor.tint, color: avatarColor.ink }}
                          >
                            {monogram}
                          </div>
                          <div className="unit-details">
                            <div className="unit-name-title">{u.name}</div>
                            <div className="unit-subtext">Symbol: {u.shortCode}</div>
                          </div>
                        </div>
                      </td>

                      {/* Short Code Badge */}
                      <td>
                        <span className="badge-code text-mono">{u.shortCode}</span>
                      </td>

                      {/* Scope Badge */}
                      <td>
                        {isGlobal ? (
                          <span className="scope-badge scope-global">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="2" y1="12" x2="22" y2="12" />
                              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                            Global Standard
                          </span>
                        ) : (
                          <span className="scope-badge scope-custom">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                              <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                            Company Specific
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="text-center">
                        <div className="action-row">
                          <button
                            type="button"
                            className="btn-action btn-action-edit"
                            title="Edit Unit"
                            onClick={() => handleOpenEdit(u)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action-delete"
                            title="Delete Unit"
                            onClick={() => handleOpenDelete(u)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="card-footer">
          <div className="footer-summary">
            Showing <strong>{filteredUnits.length}</strong> of {units.length} registered units
            {search && <span className="filter-badge-text"> • Matching "{search}"</span>}
          </div>
          <div className="footer-stat-pills">
            <span className="footer-pill">
              <strong>{globalCount}</strong> Global Standard
            </span>
            {customCount > 0 && (
              <span className="footer-pill">
                <strong>{customCount}</strong> Custom
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Create / Edit Unit Dialog */}
      <Dialog
        open={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
            overflow: 'hidden',
          },
        }}
      >
        <form onSubmit={handleSaveUnit}>
          <DialogTitle sx={{ pb: 1.5, pt: 2.5, px: 3, borderBottom: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', fontFamily: "'DM Mono', monospace" }}>
                {editingUnit ? 'EDIT UNIT' : 'NEW UNIT'}
              </span>
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', margin: '4px 0 0 0' }}>
              {editingUnit ? `Edit Unit: ${editingUnit.name}` : 'Create Unit of Measure'}
            </h2>
            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
              Define standard measurement units for inventory stock tracking and POS conversion rules.
            </div>
          </DialogTitle>

          <DialogContent sx={{ px: 3, py: 2.5, backgroundColor: '#F8FAFC' }}>
            {formError && (
              <div style={{ marginBottom: '16px', padding: '10px 14px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#B91C1C', fontSize: '13px' }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Unit Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Unit Name <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Piece, Kilogram, Carton, Box, Liter"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (!editingUnit && !formCode) {
                      setFormCode(e.target.value.trim().slice(0, 5).toUpperCase());
                    }
                  }}
                  required
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13.5px',
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Short Code */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Short Code / Symbol <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="text"
                    placeholder="e.g. PCS, KG, CTN, BOX, LTR"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    required
                    style={{
                      flex: 1,
                      height: '40px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13.5px',
                      fontFamily: "'DM Mono', monospace",
                      fontWeight: 700,
                      backgroundColor: '#FFFFFF',
                      color: '#0F172A',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {formCode.trim() && (
                    <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: "'DM Mono', monospace", padding: '6px 12px', borderRadius: '6px', backgroundColor: '#F1F5F9', color: '#0F172A', border: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                      Preview: {formCode.trim().toUpperCase()}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', display: 'block' }}>
                  Compact symbol printed on invoices, shelf tags, and POS receipts.
                </span>
              </div>
            </div>
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 2, gap: 1, backgroundColor: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
            <Button
              onClick={() => setModalOpen(false)}
              disabled={saving}
              sx={{
                color: '#64748B',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '13px',
                borderRadius: '8px',
                px: 2,
                '&:hover': { backgroundColor: '#F1F5F9', color: '#0F172A' },
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              sx={{
                backgroundColor: '#2F54EB',
                '&:hover': { backgroundColor: '#1D39C4' },
                color: '#FFFFFF',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '13px',
                borderRadius: '8px',
                px: 2.5,
                boxShadow: '0 2px 4px rgba(47, 84, 235, 0.2)',
              }}
            >
              {saving ? 'Saving...' : editingUnit ? 'Update Unit' : 'Save Unit'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* 4. Delete Confirmation Dialog */}
      <Dialog
        open={deleteModalOpen}
        onClose={() => !deleting && setDeleteModalOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            border: '1px solid #FEE2E2',
            boxShadow: '0 20px 25px -5px rgba(239, 68, 68, 0.1)',
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2.5, px: 3, fontWeight: 700, fontSize: '17px', color: '#0F172A' }}>
          Delete Unit of Measure
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 1.5 }}>
          <p style={{ color: '#475569', fontSize: '13.5px', margin: 0, lineHeight: 1.5 }}>
            Are you sure you want to delete unit <strong>{unitToDelete?.name}</strong> (Symbol: {unitToDelete?.shortCode})?
          </p>
          {deleteWarning ? (
            <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '12px', color: '#B45309' }}>
              ⚠️ {deleteWarning}
            </div>
          ) : (
            <div style={{ marginTop: '12px', padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '12px', color: '#B91C1C' }}>
              ⚠️ This action cannot be reversed.
            </div>
          )}
          {deleteError && (
            <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: '6px', fontSize: '12.5px' }}>
              {deleteError}
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1, backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
          <Button
            onClick={() => setDeleteModalOpen(false)}
            disabled={deleting}
            sx={{
              color: '#64748B',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
              '&:hover': { backgroundColor: '#E2E8F0', color: '#0F172A' },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={deleting}
            onClick={handleConfirmDelete}
            sx={{
              backgroundColor: '#EF4444',
              '&:hover': { backgroundColor: '#DC2626' },
              color: '#FFFFFF',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
              boxShadow: 'none',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete Unit'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

const unitStyles = `
  .unit-catalog-root {
    --bg-page: #F4F5F8;
    --bg-surface: #FFFFFF;
    --border-color: #E2E8F0;
    --border-subtle: #F1F5F9;
    --primary: #2F54EB;
    --primary-hover: #1D39C4;
    --text-heading: #0F172A;
    --text-body: #334155;
    --text-muted: #64748B;
    --text-faint: #94A3B8;
    --emerald: #059669;
    --emerald-bg: #ECFDF5;
    --emerald-border: #A7F3D0;
    --shadow-card: 0 1px 3px rgba(15, 23, 42, 0.05), 0 6px 16px rgba(15, 23, 42, 0.03);

    background-color: var(--bg-page);
    color: var(--text-heading);
    font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
    font-size: 13.5px;
    line-height: 1.5;
    padding: 24px 32px 40px;
    min-height: 100vh;
    box-sizing: border-box;
  }

  .unit-catalog-root *,
  .unit-catalog-root *::before,
  .unit-catalog-root *::after {
    box-sizing: border-box;
  }

  .unit-catalog-root .text-mono {
    font-family: 'DM Mono', monospace !important;
  }

  /* Header */
  .unit-catalog-root .unit-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }

  .unit-catalog-root .header-title-line {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .unit-catalog-root .unit-title {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text-heading);
    margin: 0;
    line-height: 1.2;
  }

  .unit-catalog-root .unit-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 9999px;
    background-color: var(--emerald-bg);
    color: var(--emerald);
    border: 1px solid var(--emerald-border);
    font-size: 11.5px;
    font-weight: 600;
  }

  .unit-catalog-root .dot-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #10B981;
    box-shadow: 0 0 6px #10B981;
  }

  .unit-catalog-root .unit-desc {
    color: var(--text-muted);
    font-size: 14px;
    margin: 6px 0 0 0;
  }

  .unit-catalog-root .header-actions-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .unit-catalog-root .btn-export {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 42px;
    padding: 0 16px;
    background-color: var(--bg-surface);
    color: var(--text-heading);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 0.15s ease;
  }

  .unit-catalog-root .btn-export:hover {
    background-color: #F8FAFC;
    border-color: #CBD5E1;
  }

  .unit-catalog-root .btn-create {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 42px;
    padding: 0 18px;
    background-color: var(--primary);
    color: #FFFFFF;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(47, 84, 235, 0.2);
    transition: all 0.15s ease;
  }

  .unit-catalog-root .btn-create:hover {
    background-color: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(47, 84, 235, 0.3);
  }

  /* Main Card */
  .unit-catalog-root .main-data-card {
    background-color: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }

  /* Toolbar */
  .unit-catalog-root .card-toolbar {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .unit-catalog-root .search-box-wrapper {
    position: relative;
    flex: 1;
    min-width: 260px;
    max-width: 440px;
  }

  .unit-catalog-root .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #94A3B8;
    pointer-events: none;
  }

  .unit-catalog-root .search-input-field {
    width: 100%;
    height: 40px;
    padding: 0 65px 0 38px;
    background-color: #F8FAFC;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--text-heading);
    outline: none;
    transition: all 0.15s ease;
  }

  .unit-catalog-root .search-input-field:focus {
    background-color: #FFFFFF;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(47, 84, 235, 0.1);
  }

  .unit-catalog-root .kbd-badge {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    font-weight: 700;
    font-family: 'DM Mono', monospace;
    background-color: #E2E8F0;
    color: #64748B;
    padding: 2px 6px;
    border-radius: 4px;
    pointer-events: none;
  }

  .unit-catalog-root .clear-search-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    cursor: pointer;
    color: #94A3B8;
    padding: 4px;
    display: flex;
    align-items: center;
  }

  .unit-catalog-root .clear-search-btn:hover {
    color: #334155;
  }

  .unit-catalog-root .filter-pill-cluster {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
  }

  .unit-catalog-root .filter-pill {
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 12.5px;
    font-weight: 600;
    border: 1px solid var(--border-color);
    background-color: #F8FAFC;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .unit-catalog-root .filter-pill:hover {
    background-color: #F1F5F9;
    color: var(--text-heading);
  }

  .unit-catalog-root .filter-pill.pill-active {
    background-color: var(--primary);
    color: #FFFFFF;
    border-color: var(--primary);
    box-shadow: 0 1px 3px rgba(47, 84, 235, 0.2);
  }

  .unit-catalog-root .toolbar-right-btns {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .unit-catalog-root .btn-refresh {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background-color: var(--bg-surface);
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .unit-catalog-root .btn-refresh:hover {
    background-color: #F8FAFC;
    color: var(--text-heading);
  }

  /* Info Tip Bar */
  .unit-catalog-root .info-tip-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 20px;
    background-color: #EFF6FF;
    border-bottom: 1px solid #DBEAFE;
    font-size: 12.5px;
    color: #1E40AF;
  }

  /* Table Area */
  .unit-catalog-root .table-scroll-area {
    overflow-x: auto;
  }

  .unit-catalog-root .clean-table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }

  .unit-catalog-root .clean-table thead th {
    padding: 11px 18px;
    background-color: #F8FAFC;
    border-bottom: 1px solid var(--border-color);
    color: #64748B;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .unit-catalog-root .clean-table tbody td {
    padding: 12px 18px;
    border-bottom: 1px solid #F1F5F9;
    vertical-align: middle;
    font-size: 13.5px;
    color: var(--text-heading);
  }

  .unit-catalog-root .table-row {
    transition: background-color 0.12s ease;
  }

  .unit-catalog-root .table-row:hover {
    background-color: #F8FAFC;
  }

  /* Unit Name Cell */
  .unit-catalog-root .unit-cell {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .unit-catalog-root .unit-avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 800;
    font-family: 'DM Mono', monospace;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    letter-spacing: -0.01em;
  }

  .unit-catalog-root .unit-details {
    min-width: 0;
  }

  .unit-catalog-root .unit-name-title {
    font-weight: 700;
    color: var(--text-heading);
    font-size: 14px;
    line-height: 1.3;
  }

  .unit-catalog-root .unit-subtext {
    font-size: 11.5px;
    color: var(--text-muted);
    margin-top: 1px;
  }

  /* Code Badge */
  .unit-catalog-root .badge-code {
    font-weight: 700;
    font-size: 12.5px;
    color: #0F172A;
    background-color: #F1F5F9;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    letter-spacing: 0.02em;
  }

  /* Scope Badge */
  .unit-catalog-root .scope-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 9999px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .unit-catalog-root .scope-global {
    background-color: #F0FDF4;
    color: #166534;
    border: 1px solid #BBF7D0;
  }

  .unit-catalog-root .scope-custom {
    background-color: #EEF2FF;
    color: #3730A3;
    border: 1px solid #C7D2FE;
  }

  /* Actions */
  .unit-catalog-root .action-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .unit-catalog-root .btn-action {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    background-color: #FFFFFF;
    color: #64748B;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .unit-catalog-root .btn-action-edit:hover {
    background-color: #F0FDF4;
    color: #16A34A;
    border-color: #BBF7D0;
  }

  .unit-catalog-root .btn-action-delete:hover {
    background-color: #FEF2F2;
    color: #DC2626;
    border-color: #FECACA;
  }

  /* Empty & Loading States */
  .unit-catalog-root .td-loading,
  .unit-catalog-root .td-empty {
    text-align: center;
    padding: 56px 16px;
  }

  .unit-catalog-root .loading-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: #64748B;
    font-size: 13.5px;
    font-weight: 600;
  }

  .unit-catalog-root .spinner-circle {
    width: 18px;
    height: 18px;
    border: 2px solid #CBD5E1;
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .unit-catalog-root .spin-icon {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .unit-catalog-root .empty-box {
    text-align: center;
    color: #64748B;
  }

  .unit-catalog-root .empty-icon-wrap {
    font-size: 40px;
    margin-bottom: 8px;
    opacity: 0.7;
  }

  .unit-catalog-root .empty-title-text {
    font-size: 15px;
    font-weight: 700;
    color: #0F172A;
  }

  .unit-catalog-root .empty-sub-text {
    font-size: 13px;
    color: #64748B;
    margin: 4px 0 0 0;
  }

  /* Card Footer */
  .unit-catalog-root .card-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--border-color);
    background-color: #FCFDFE;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    color: var(--text-muted);
    flex-wrap: wrap;
    gap: 12px;
  }

  .unit-catalog-root .filter-badge-text {
    color: var(--primary);
    font-weight: 600;
  }

  .unit-catalog-root .footer-stat-pills {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .unit-catalog-root .footer-pill {
    padding: 3px 10px;
    background-color: #F1F5F9;
    border-radius: 6px;
    font-size: 12px;
    color: #475569;
  }

  /* Empty Company */
  .unit-catalog-root .empty-company-card {
    background-color: #FFFFFF;
    border-radius: 16px;
    padding: 48px;
    border: 1px solid #E2E8F0;
    text-align: center;
    max-width: 500px;
    margin: 40px auto;
  }

  .unit-catalog-root .empty-company-icon {
    font-size: 44px;
    margin-bottom: 12px;
  }

  @media (max-width: 768px) {
    .unit-catalog-root {
      padding: 16px;
    }

    .unit-catalog-root .unit-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .unit-catalog-root .header-actions-group {
      width: 100%;
    }

    .unit-catalog-root .btn-create,
    .unit-catalog-root .btn-export {
      flex: 1;
      justify-content: center;
    }

    .unit-catalog-root .search-box-wrapper {
      max-width: 100%;
    }
  }
`;
