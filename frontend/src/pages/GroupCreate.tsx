import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
} from '@mui/material';
import {
  Check as CheckIcon,
  Edit as EditIcon,
  Clear as ClearIcon,
  FormatListBulleted as ListIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { ledgerGroupApi } from '../services/api';

export const PRIMARY_HEAD_NAMES = [
  'Current Asset',
  'Fixed Asset',
  'Current Liability',
  'Fixed Liability',
  'Capital',
  'Direct Income',
  'Indirect Income',
  'Direct Expense',
  'Indirect Expense',
  'Duties and Taxes Receivable',
  'Duties and Taxes Payable',
];

export const PRIMARY_HEAD_CODES = [
  'FIXED_ASSET',
  'CURRENT_ASSET',
  'FIXED_LIAB',
  'CURRENT_LIAB',
  'CAPITAL',
  'DIR_INCOME',
  'INDIR_INCOME',
  'DIR_EXP',
  'INDIR_EXP',
  'DUTY_RECV',
  'DUTY_PAY',
  'ASSET',
  'LIAB',
  'EQUITY',
  'INCOME',
  'EXP',
];

export const isPrimaryHead = (g?: string | { name?: string; code?: string; parentGroupId?: unknown }) => {
  if (!g) return false;
  if (typeof g === 'string') {
    const s = g.trim().toLowerCase();
    return PRIMARY_HEAD_NAMES.some((h) => h.toLowerCase() === s);
  }
  const hasParent = Boolean(
    g.parentGroupId &&
      (typeof g.parentGroupId === 'string'
        ? g.parentGroupId.trim() !== ''
        : Boolean((g.parentGroupId as { _id?: string })._id))
  );
  if (!hasParent) return true;
  const gName = g.name ? g.name.trim().toLowerCase() : '';
  if (gName && PRIMARY_HEAD_NAMES.some((h) => h.toLowerCase() === gName)) return true;
  return false;
};

type GroupOption = {
  _id: string;
  name: string;
  code: string;
  type: string;
  parentGroupId?: string | { _id: string; name?: string };
};

const TYPE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  ASSET: { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  LIABILITY: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
  EQUITY: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  INCOME: { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
  EXPENSE: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  'DUTIES AND TAXES': { bg: '#ecfeff', color: '#0891b2', border: '#a5f3fc' },
};

export default function GroupCreate() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const navigate = useNavigate();

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('Asset');
  const [parentGroupId, setParentGroupId] = useState<string>('');

  // Selection state
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<GroupOption | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editedDialogOpen, setEditedDialogOpen] = useState(false);

  // Change Group Name Dialog
  const [changeNameDialogOpen, setChangeNameDialogOpen] = useState(false);
  const [changeNameCode, setChangeNameCode] = useState('');
  const [changeNameValue, setChangeNameValue] = useState('');
  const [changeNameSaving, setChangeNameSaving] = useState(false);

  // Groups state
  const [allGroups, setAllGroups] = useState<GroupOption[]>([]);

  // Filter operational groups vs parent heads
  const operationalGroupOptions = useMemo(
    () => allGroups.filter((g) => !isPrimaryHead(g.name)),
    [allGroups]
  );

  const parentHeadOptions = useMemo(
    () => allGroups.filter((g) => isPrimaryHead(g.name)),
    [allGroups]
  );

  // Load all groups for company
  const loadAllGroups = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await ledgerGroupApi.list(companyId);
      setAllGroups((res.data.data as GroupOption[]) ?? []);
    } catch {
      // ignore
    }
  }, [companyId]);

  useEffect(() => {
    loadAllGroups();
  }, [loadAllGroups]);

  // Load next code
  const loadNextCode = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await ledgerGroupApi.getNextCode(companyId);
      setCode(res.data.data.code);
    } catch {
      // ignore
    }
  }, [companyId]);

  // Load next code on mount
  useEffect(() => {
    loadNextCode();
  }, [loadNextCode]);

  // Load group into form
  const loadGroupIntoForm = useCallback((group: GroupOption) => {
    setEditingId(group._id);
    setSelectedGroup(group);
    setGroupSearch(group.name);
    setCode(group.code);
    setName(group.name);
    setType(group.type || 'Asset');
    const pId =
      typeof group.parentGroupId === 'object' && group.parentGroupId !== null
        ? (group.parentGroupId as { _id: string })._id
        : (group.parentGroupId as string) || '';
    setParentGroupId(pId);
  }, []);

  // Handle group selection from Group Name field
  const handleGroupSelect = (_: unknown, value: GroupOption | string | null) => {
    if (!value) {
      setSelectedGroup(null);
      setEditingId(null);
      setName('');
      setGroupSearch('');
      loadNextCode();
      return;
    }
    if (typeof value === 'string') {
      setSelectedGroup(null);
      setEditingId(null);
      setName(value);
      setGroupSearch(value);
      return;
    }
    // Load selected group
    loadGroupIntoForm(value);
  };

  // Handle parent selection (changes both parentGroupId and type automatically)
  const handleParentSelect = (_: unknown, val: GroupOption | null) => {
    const pId = val?._id || '';
    setParentGroupId(pId);
    if (val?.type) {
      setType(val.type);
    }
  };

  // Clear form
  const handleClear = async () => {
    setEditingId(null);
    setSelectedGroup(null);
    setGroupSearch('');
    setName('');
    setType('Asset');
    setParentGroupId('');
    setError(null);
    await loadNextCode();
  };

  // Save new group
  const handleSaveClick = () => {
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }
    if (!parentGroupId) {
      setError('Please select a parent head');
      return;
    }
    setSaveConfirmOpen(true);
  };

  const handleSaveConfirm = async () => {
    if (!companyId) return;
    setSaveConfirmOpen(false);
    setSaving(true);
    setError(null);
    try {
      await ledgerGroupApi.create({
        companyId,
        name: name.trim(),
        type,
        parentGroupId: parentGroupId || undefined,
      });
      setSavedDialogOpen(true);
      await loadAllGroups();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Edit existing group
  const handleEditClick = () => {
    if (!editingId) return;
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }
    if (!parentGroupId) {
      setError('Please select a parent head');
      return;
    }
    setEditConfirmOpen(true);
  };

  const handleEditConfirm = async () => {
    if (!companyId || !editingId) return;
    setEditConfirmOpen(false);
    setSaving(true);
    setError(null);
    try {
      await ledgerGroupApi.update(editingId, companyId, {
        name: name.trim(),
        type,
        parentGroupId: parentGroupId || undefined,
      });
      setEditedDialogOpen(true);
      await loadAllGroups();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  // Change Group Name handlers
  const handleOpenChangeName = () => {
    if (!selectedGroup) return;
    setChangeNameCode(selectedGroup.code);
    setChangeNameValue(selectedGroup.name);
    setChangeNameDialogOpen(true);
  };

  const handleChangeNameSave = async () => {
    if (!companyId || !selectedGroup || !changeNameValue.trim()) return;
    setChangeNameSaving(true);
    setError(null);
    try {
      await ledgerGroupApi.update(selectedGroup._id, companyId, {
        name: changeNameValue.trim(),
      });
      setName(changeNameValue.trim());
      setGroupSearch(changeNameValue.trim());
      setSelectedGroup({ ...selectedGroup, name: changeNameValue.trim() });
      setChangeNameDialogOpen(false);
      await loadAllGroups();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Failed to update name');
    } finally {
      setChangeNameSaving(false);
    }
  };

  if (!companyId) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        <Box
          sx={{
            p: 4,
            maxWidth: 500,
            width: '100%',
            bgcolor: '#ffffff',
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            textAlign: 'center',
          }}
        >
          <Typography color="error" variant="h6" fontWeight={600} gutterBottom>
            Select a company first
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Please choose an active company from the top navigation to view and register groups.
          </Typography>
        </Box>
      </Box>
    );
  }

  const currentTypeUpper = (type || 'ASSET').toUpperCase();
  const typeStyle = TYPE_STYLE[currentTypeUpper] || TYPE_STYLE.ASSET;

  return (
    <Box
      sx={{
        py: { xs: 2, sm: 3 },
        px: { xs: 1.5, sm: 2 },
        bgcolor: '#f8f9fb',
        minHeight: '100%',
      }}
    >
      <style>{`
        .group-reg-container {
          max-width: 700px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
          border: 1px solid #e2e8f0;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .group-reg-header {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          padding: 24px 32px;
          color: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .group-reg-header-left {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .group-reg-header h1 {
          font-size: 26px;
          font-weight: 600;
          letter-spacing: -0.5px;
          margin: 0;
          color: #ffffff;
          line-height: 1.2;
        }

        .group-reg-header-subtitle {
          font-size: 13px;
          color: #94a3b8;
          font-weight: 400;
        }

        .group-reg-header-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .group-reg-header-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #ffffff;
        }

        .group-reg-content {
          padding: 32px;
        }

        .group-reg-section {
          margin-bottom: 28px;
        }

        .group-reg-section:last-of-type {
          margin-bottom: 20px;
        }

        .group-reg-section-title {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          margin-bottom: 20px;
          padding-bottom: 10px;
          border-bottom: 2px solid #3b82f6;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .group-form-group {
          display: flex;
          flex-direction: column;
          margin-bottom: 20px;
        }

        .group-form-group:last-child {
          margin-bottom: 0;
        }

        .group-form-label {
          font-size: 13px;
          font-weight: 600;
          color: #1a2332;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .group-required {
          color: #ef4444;
          font-weight: 700;
        }

        .group-hint {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 6px;
          line-height: 1.4;
        }

        .group-hint.locked {
          color: #d97706;
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 500;
        }

        .group-input-with-button {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .group-input-with-button .MuiAutocomplete-root {
          flex: 1;
        }

        .group-btn-change {
          padding: 10px 18px;
          height: 42px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #64748b;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .group-btn-change:hover:not(:disabled) {
          background: #e2e8f0;
          color: #1a2332;
        }

        .group-btn-change:active:not(:disabled) {
          transform: scale(0.98);
        }

        .group-btn-change:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .group-code-field {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-weight: 600;
          color: #1a2332;
          font-family: 'Courier New', Courier, monospace;
          font-size: 14px;
          letter-spacing: 0.5px;
          min-height: 42px;
        }

        .group-code-label {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          letter-spacing: normal;
        }

        .group-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 28px 0;
        }

        .group-type-display {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          min-height: 42px;
        }

        .group-type-text {
          font-size: 14px;
          font-weight: 600;
          color: #1a2332;
          letter-spacing: 0.5px;
        }

        .group-actions {
          display: flex;
          gap: 14px;
          padding-top: 24px;
          border-top: 1px solid #e2e8f0;
          margin-top: 28px;
        }

        .group-btn {
          padding: 11px 22px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          white-space: nowrap;
          flex: 1;
        }

        .group-btn-primary {
          background: linear-gradient(135deg, #3b82f6 0%, #0284c7 100%);
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .group-btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 12px rgba(59, 130, 246, 0.3);
        }

        .group-btn-primary:active:not(:disabled) {
          transform: translateY(0);
        }

        .group-btn-primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .group-btn-secondary {
          background: #ffffff;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .group-btn-secondary:hover:not(:disabled) {
          background: #f8f9fb;
          color: #1a2332;
          border-color: #cbd5e1;
        }

        .group-btn-secondary:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          background: #f8fafc;
        }

        .group-btn-tertiary {
          background: #ffffff;
          color: #64748b;
          border: 1px solid #e2e8f0;
        }

        .group-btn-tertiary:hover:not(:disabled) {
          background: #f8f9fb;
          color: #1a2332;
          border-color: #cbd5e1;
        }

        .group-btn-tertiary:active:not(:disabled) {
          background: #e2e8f0;
        }

        @media (max-width: 640px) {
          .group-reg-header {
            padding: 20px;
            flex-direction: column;
            align-items: flex-start;
          }

          .group-reg-header h1 {
            font-size: 22px;
          }

          .group-reg-content {
            padding: 20px;
          }

          .group-input-with-button {
            flex-direction: column;
            align-items: stretch;
          }

          .group-btn-change {
            width: 100%;
          }

          .group-actions {
            flex-direction: column;
          }

          .group-btn {
            width: 100%;
          }
        }
      `}</style>

      <div className="group-reg-container">
        {/* Header */}
        <div className="group-reg-header">
          <div className="group-reg-header-left">
            <h1>Group Registration</h1>
            <div className="group-reg-header-subtitle">
              Configure accounting group heads & classifications
            </div>
          </div>
          <button
            type="button"
            className="group-reg-header-btn"
            onClick={() => navigate('/master/groups')}
            title="View group list"
          >
            <ListIcon sx={{ fontSize: 16 }} />
            <span>Group List</span>
          </button>
        </div>

        {/* Content */}
        <div className="group-reg-content">
          {error && (
            <Alert
              severity="error"
              onClose={() => setError(null)}
              sx={{ mb: 3, borderRadius: 2 }}
            >
              {error}
            </Alert>
          )}

          {/* Group Identification Section */}
          <div className="group-reg-section">
            <div className="group-reg-section-title">
              <span>Group Identification</span>
              {editingId && (
                <Chip
                  label="Editing Existing Group"
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    bgcolor: '#eff6ff',
                    color: '#2563eb',
                    border: '1px solid #bfdbfe',
                  }}
                />
              )}
            </div>

            {/* Group Name with Change Name Button */}
            <div className="group-form-group">
              <label className="group-form-label">
                Group Name <span className="group-required">*</span>
              </label>
              <div className="group-input-with-button">
                <Autocomplete
                  freeSolo
                  size="small"
                  disabled={!!selectedGroup}
                  options={
                    selectedGroup &&
                    !operationalGroupOptions.some((o) => o._id === selectedGroup._id)
                      ? [selectedGroup, ...operationalGroupOptions]
                      : operationalGroupOptions
                  }
                  getOptionLabel={(opt) =>
                    typeof opt === 'string' ? opt : opt?.name ?? ''
                  }
                  value={
                    selectedGroup != null
                      ? selectedGroup
                      : groupSearch.trim()
                      ? groupSearch
                      : null
                  }
                  inputValue={groupSearch}
                  onChange={handleGroupSelect}
                  onInputChange={(_, v) => {
                    setGroupSearch(v ?? '');
                    if (v?.trim()) setName(v.trim());
                    else if (selectedGroup == null) setName('');
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      placeholder="Enter group name (e.g. Bank, Customer, Supplier...)"
                      required
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '8px',
                          backgroundColor: '#ffffff',
                          fontSize: '14px',
                          '& fieldset': { borderColor: '#e2e8f0' },
                          '&:hover fieldset': { borderColor: '#cbd5e1' },
                          '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                        },
                      }}
                    />
                  )}
                  renderOption={(props, option) => {
                    const opt =
                      typeof option === 'string'
                        ? { _id: option, name: option, code: '', type: '' }
                        : option;
                    return (
                      <li
                        {...props}
                        key={opt._id}
                        style={{ padding: '8px 12px', minHeight: 40 }}
                      >
                        <Box sx={{ width: '100%' }}>
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            color="#1a2332"
                          >
                            {opt.name}
                          </Typography>
                          {opt.code ? (
                            <Typography variant="caption" color="#64748b">
                              {opt.code} • {opt.type}
                            </Typography>
                          ) : null}
                        </Box>
                      </li>
                    );
                  }}
                  sx={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="group-btn-change"
                  onClick={handleOpenChangeName}
                  disabled={!selectedGroup}
                  title={
                    selectedGroup
                      ? 'Rename this group'
                      : 'Select an existing group to rename'
                  }
                >
                  Change Name
                </button>
              </div>
            </div>

            {/* Group Code */}
            <div className="group-form-group">
              <label className="group-form-label">Group Code</label>
              <div className="group-code-field">
                <span className="group-code-label">Code:</span>
                <span>{code || 'GRP0001'}</span>
              </div>
              <div className="group-hint">Auto-generated</div>
            </div>
          </div>

          {/* Divider */}
          <div className="group-divider" />

          {/* Classification Section */}
          <div className="group-reg-section">
            <div className="group-reg-section-title">
              <span>Classification</span>
            </div>

            {/* Select Parent */}
            <div className="group-form-group">
              <label className="group-form-label">
                Select Parent <span className="group-required">*</span>
              </label>
              <Autocomplete
                size="small"
                options={parentHeadOptions}
                getOptionLabel={(opt) => `${opt.name} [${opt.type}]`}
                value={
                  parentHeadOptions.find((g) => g._id === parentGroupId) || null
                }
                onChange={handleParentSelect}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Choose parent group (e.g. Current Asset, Direct Expense...)"
                    required
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '8px',
                        backgroundColor: '#ffffff',
                        fontSize: '14px',
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1' },
                        '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                      },
                    }}
                  />
                )}
                renderOption={(props, opt) => (
                  <li {...props} key={opt._id} style={{ padding: '8px 12px' }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '100%',
                        alignItems: 'center',
                      }}
                    >
                      <Typography variant="body2" fontWeight={500} color="#1a2332">
                        {opt.name}
                      </Typography>
                      <Chip
                        label={opt.type}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          bgcolor: '#f1f5f9',
                          color: '#475569',
                        }}
                      />
                    </Box>
                  </li>
                )}
              />
              <div className="group-hint">
                Sub-type head under which this group is categorized
              </div>
            </div>

            {/* Type (Locked) */}
            <div className="group-form-group">
              <label className="group-form-label">Type</label>
              <div className="group-type-display">
                <span className="group-type-text">{currentTypeUpper}</span>
                <Chip
                  label={currentTypeUpper}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    bgcolor: typeStyle.bg,
                    color: typeStyle.color,
                    border: `1px solid ${typeStyle.border}`,
                  }}
                />
              </div>
              <div className="group-hint locked">
                <span>⚠</span> Locked. Automatically set based on parent selection
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="group-actions">
            <button
              type="button"
              className="group-btn group-btn-primary"
              onClick={handleSaveClick}
              disabled={saving}
            >
              <CheckIcon sx={{ fontSize: 18 }} />
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>

            <button
              type="button"
              className="group-btn group-btn-secondary"
              onClick={handleEditClick}
              disabled={!editingId || saving}
            >
              <EditIcon sx={{ fontSize: 18 }} />
              <span>Edit</span>
            </button>

            <button
              type="button"
              className="group-btn group-btn-tertiary"
              onClick={handleClear}
            >
              <ClearIcon sx={{ fontSize: 18 }} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      <Dialog
        open={saveConfirmOpen}
        onClose={() => setSaveConfirmOpen(false)}
        PaperProps={{ sx: { borderRadius: 2.5, p: 1, minWidth: 320 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '18px', color: '#1e293b' }}>
          Save Group
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="#64748b">
            Do you want to save this group?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setSaveConfirmOpen(false)}
            sx={{ color: '#64748b', textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveConfirm}
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 3,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Saved Dialog */}
      <Dialog
        open={savedDialogOpen}
        onClose={() => {
          setSavedDialogOpen(false);
          handleClear();
        }}
        PaperProps={{ sx: { borderRadius: 2.5, p: 1, minWidth: 320 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '18px', color: '#1e293b' }}>
          Saved Successfully
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="#64748b">
            Group has been saved successfully.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              setSavedDialogOpen(false);
              handleClear();
            }}
            autoFocus
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 3,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Confirmation Dialog */}
      <Dialog
        open={editConfirmOpen}
        onClose={() => setEditConfirmOpen(false)}
        PaperProps={{ sx: { borderRadius: 2.5, p: 1, minWidth: 320 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '18px', color: '#1e293b' }}>
          Edit Group
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="#64748b">
            Do you want to update this group?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setEditConfirmOpen(false)}
            sx={{ color: '#64748b', textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditConfirm}
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 3,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edited Dialog */}
      <Dialog
        open={editedDialogOpen}
        onClose={() => {
          setEditedDialogOpen(false);
          handleClear();
        }}
        PaperProps={{ sx: { borderRadius: 2.5, p: 1, minWidth: 320 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '18px', color: '#1e293b' }}>
          Updated Successfully
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="#64748b">
            Group has been updated successfully.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="contained"
            onClick={() => {
              setEditedDialogOpen(false);
              handleClear();
            }}
            autoFocus
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 3,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Group Name Dialog */}
      <Dialog
        open={changeNameDialogOpen}
        onClose={() => setChangeNameDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '18px', color: '#1e293b' }}>
          Change Group Name
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Group Code"
            value={changeNameCode}
            disabled
            margin="normal"
            InputLabelProps={{ shrink: true }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                bgcolor: '#f1f5f9',
              },
            }}
          />
          <TextField
            fullWidth
            size="small"
            label="Group Name"
            value={changeNameValue}
            onChange={(e) => setChangeNameValue(e.target.value)}
            margin="normal"
            required
            autoFocus
            InputLabelProps={{ shrink: true }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '8px',
                '& fieldset': { borderColor: '#e2e8f0' },
                '&:hover fieldset': { borderColor: '#cbd5e1' },
                '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setChangeNameDialogOpen(false)}
            sx={{ color: '#64748b', textTransform: 'none', fontWeight: 600 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleChangeNameSave}
            disabled={changeNameSaving || !changeNameValue.trim()}
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 3,
            }}
          >
            {changeNameSaving ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
