import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

  // Field element refs for keyboard focus and Enter flow
  const groupNameInputRef = useRef<HTMLInputElement>(null);
  const parentSelectInputRef = useRef<HTMLInputElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('Asset');
  const [parentGroupId, setParentGroupId] = useState<string>('');

  // Dropdown open states for coordinating Enter key behavior
  const [groupNameOpen, setGroupNameOpen] = useState(false);
  const [parentSelectOpen, setParentSelectOpen] = useState(false);

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

  // Focus group name field helper
  const focusGroupName = useCallback(() => {
    setTimeout(() => {
      if (groupNameInputRef.current) {
        groupNameInputRef.current.focus();
        groupNameInputRef.current.select?.();
      }
    }, 60);
  }, []);

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

  // Focus group name when window opens or company changes
  useEffect(() => {
    if (companyId) {
      focusGroupName();
    }
  }, [companyId, focusGroupName]);

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
      focusGroupName();
      return;
    }
    if (typeof value === 'string') {
      setSelectedGroup(null);
      setEditingId(null);
      setName(value);
      setGroupSearch(value);
    } else {
      // Load selected group
      loadGroupIntoForm(value);
    }
    // Continue enter flow into Parent field
    setTimeout(() => {
      parentSelectInputRef.current?.focus();
    }, 100);
  };

  // Handle parent selection (changes both parentGroupId and type automatically)
  const handleParentSelect = (_: unknown, val: GroupOption | null) => {
    const pId = val?._id || '';
    setParentGroupId(pId);
    if (val?.type) {
      setType(val.type);
    }
    // Continue enter flow: focus Save or Edit button
    if (pId) {
      setTimeout(() => {
        if (editingId) {
          editBtnRef.current?.focus();
        } else {
          saveBtnRef.current?.focus();
        }
      }, 100);
    }
  };

  // Clear form & refocus group name field
  const handleClear = useCallback(async () => {
    setEditingId(null);
    setSelectedGroup(null);
    setGroupSearch('');
    setName('');
    setType('Asset');
    setParentGroupId('');
    setError(null);
    await loadNextCode();
    focusGroupName();
  }, [loadNextCode, focusGroupName]);

  // Save new group
  const handleSaveClick = () => {
    if (!name.trim()) {
      setError('Group name is required');
      focusGroupName();
      return;
    }
    if (!parentGroupId) {
      setError('Please select a parent head');
      setTimeout(() => parentSelectInputRef.current?.focus(), 60);
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
      focusGroupName();
    } finally {
      setSaving(false);
    }
  };

  // Edit existing group
  const handleEditClick = () => {
    if (!editingId) return;
    if (!name.trim()) {
      setError('Group name is required');
      focusGroupName();
      return;
    }
    if (!parentGroupId) {
      setError('Please select a parent head');
      setTimeout(() => parentSelectInputRef.current?.focus(), 60);
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
      focusGroupName();
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
      focusGroupName();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Failed to update name');
    } finally {
      setChangeNameSaving(false);
    }
  };

  if (!companyId) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <Box
          sx={{
            p: 3,
            maxWidth: 400,
            width: '100%',
            bgcolor: '#ffffff',
            borderRadius: 1.5,
            border: '1px solid #e2e8f0',
            textAlign: 'center',
          }}
        >
          <Typography color="error" variant="subtitle1" fontWeight={600} gutterBottom>
            Select a company first
          </Typography>
          <Typography variant="body2" sx={{ fontSize: '11.5px' }} color="text.secondary">
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
        py: { xs: 1.5, sm: 2 },
        px: { xs: 1, sm: 1.5 },
        bgcolor: '#f8f9fb',
        minHeight: '100%',
      }}
    >
      <style>{`
        /* Container reduced by 20% from 700px to 560px */
        .group-reg-container {
          max-width: 560px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 7px;
          box-shadow: 0 3px 5px rgba(0, 0, 0, 0.06);
          border: 1px solid #e2e8f0;
          overflow: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        /* Header reduced 20% in padding & typography */
        .group-reg-header {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          padding: 16px 24px;
          color: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .group-reg-header-left {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .group-reg-header h1 {
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.4px;
          margin: 0;
          color: #ffffff;
          line-height: 1.2;
        }

        .group-reg-header-subtitle {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 400;
        }

        .group-reg-header-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 11px;
          border-radius: 5px;
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .group-reg-header-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #ffffff;
        }

        /* Main content reduced 20% in padding */
        .group-reg-content {
          padding: 22px 24px;
        }

        .group-reg-section {
          margin-bottom: 20px;
        }

        .group-reg-section:last-of-type {
          margin-bottom: 14px;
        }

        .group-reg-section-title {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #64748b;
          margin-bottom: 14px;
          padding-bottom: 7px;
          border-bottom: 2px solid #3b82f6;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .group-form-group {
          display: flex;
          flex-direction: column;
          margin-bottom: 15px;
        }

        .group-form-group:last-child {
          margin-bottom: 0;
        }

        .group-form-label {
          font-size: 11px;
          font-weight: 600;
          color: #1a2332;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 3px;
        }

        .group-required {
          color: #ef4444;
          font-weight: 700;
        }

        .group-hint {
          font-size: 10px;
          color: #94a3b8;
          margin-top: 4px;
          line-height: 1.35;
        }

        .group-hint.locked {
          color: #d97706;
          display: flex;
          align-items: center;
          gap: 5px;
          font-weight: 500;
        }

        .group-input-with-button {
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }

        .group-input-with-button .MuiAutocomplete-root {
          flex: 1;
        }

        .group-btn-change {
          padding: 6px 14px;
          height: 33px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #64748b;
          border-radius: 6px;
          font-size: 11px;
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
          gap: 10px;
          padding: 6px 11px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-weight: 600;
          color: #1a2332;
          font-family: 'Courier New', Courier, monospace;
          font-size: 11.5px;
          letter-spacing: 0.5px;
          min-height: 33px;
        }

        .group-code-label {
          font-size: 10px;
          color: #94a3b8;
          font-weight: 500;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          letter-spacing: normal;
        }

        .group-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 20px 0;
        }

        .group-type-display {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 11px;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          min-height: 33px;
        }

        .group-type-text {
          font-size: 11.5px;
          font-weight: 600;
          color: #1a2332;
          letter-spacing: 0.5px;
        }

        .group-actions {
          display: flex;
          gap: 10px;
          padding-top: 18px;
          border-top: 1px solid #e2e8f0;
          margin-top: 20px;
        }

        .group-btn {
          padding: 7px 16px;
          min-height: 33px;
          border: none;
          border-radius: 6px;
          font-size: 11.5px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
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
          box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);
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
            padding: 14px 16px;
            flex-direction: column;
            align-items: flex-start;
          }

          .group-reg-header h1 {
            font-size: 18px;
          }

          .group-reg-content {
            padding: 16px;
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
              Configure accounting group heads &amp; classifications
            </div>
          </div>
          <button
            type="button"
            className="group-reg-header-btn"
            onClick={() => navigate('/master/groups')}
            title="View group list"
          >
            <ListIcon sx={{ fontSize: 14 }} />
            <span>Group List</span>
          </button>
        </div>

        {/* Content */}
        <div className="group-reg-content">
          {error && (
            <Alert
              severity="error"
              onClose={() => setError(null)}
              sx={{ mb: 2, borderRadius: 1.5, fontSize: '11.5px', py: 0.5 }}
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
                    height: 18,
                    fontSize: '0.62rem',
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
                  open={groupNameOpen}
                  onOpen={() => setGroupNameOpen(true)}
                  onClose={() => setGroupNameOpen(false)}
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
                      inputRef={groupNameInputRef}
                      placeholder="Enter group name (e.g. Bank, Customer, Supplier...)"
                      required
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          // If popup is closed, advance focus to parent selection
                          if (!groupNameOpen) {
                            e.preventDefault();
                            setTimeout(() => {
                              parentSelectInputRef.current?.focus();
                            }, 80);
                          }
                        }
                      }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          borderRadius: '6px',
                          backgroundColor: '#ffffff',
                          fontSize: '11.5px',
                          minHeight: '33px',
                          height: '33px',
                          '& fieldset': { borderColor: '#e2e8f0' },
                          '&:hover fieldset': { borderColor: '#cbd5e1' },
                          '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                          '& input': {
                            py: '4px !important',
                            fontSize: '11.5px',
                          },
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
                        style={{ padding: '5px 10px', minHeight: 32 }}
                      >
                        <Box sx={{ width: '100%' }}>
                          <Typography
                            sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a2332' }}
                          >
                            {opt.name}
                          </Typography>
                          {opt.code ? (
                            <Typography sx={{ fontSize: '0.68rem', color: '#64748b' }}>
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
                open={parentSelectOpen}
                onOpen={() => setParentSelectOpen(true)}
                onClose={() => setParentSelectOpen(false)}
                options={parentHeadOptions}
                getOptionLabel={(opt) => `${opt.name} [${opt.type}]`}
                value={
                  parentHeadOptions.find((g) => g._id === parentGroupId) || null
                }
                onChange={handleParentSelect}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    inputRef={parentSelectInputRef}
                    placeholder="Choose parent group (e.g. Current Asset, Direct Expense...)"
                    required
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (!parentSelectOpen) {
                          e.preventDefault();
                          if (parentGroupId) {
                            setTimeout(() => {
                              if (editingId) {
                                editBtnRef.current?.focus();
                              } else {
                                saveBtnRef.current?.focus();
                              }
                            }, 80);
                          } else {
                            setParentSelectOpen(true);
                          }
                        }
                      }
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        fontSize: '11.5px',
                        minHeight: '33px',
                        height: '33px',
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1' },
                        '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                        '& input': {
                          py: '4px !important',
                          fontSize: '11.5px',
                        },
                      },
                    }}
                  />
                )}
                renderOption={(props, opt) => (
                  <li {...props} key={opt._id} style={{ padding: '5px 10px', minHeight: 32 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        width: '100%',
                        alignItems: 'center',
                      }}
                    >
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: '#1a2332' }}>
                        {opt.name}
                      </Typography>
                      <Chip
                        label={opt.type}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.62rem',
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
                    height: 18,
                    fontSize: '0.62rem',
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
              ref={saveBtnRef}
              type="button"
              className="group-btn group-btn-primary"
              onClick={handleSaveClick}
              disabled={saving || !!editingId}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveClick();
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  if (editingId) {
                    editBtnRef.current?.focus();
                  } else {
                    clearBtnRef.current?.focus();
                  }
                }
              }}
            >
              <CheckIcon sx={{ fontSize: 15 }} />
              <span>{saving ? 'Saving...' : 'Save'}</span>
            </button>

            <button
              ref={editBtnRef}
              type="button"
              className="group-btn group-btn-secondary"
              onClick={handleEditClick}
              disabled={!editingId || saving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleEditClick();
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  saveBtnRef.current?.focus();
                } else if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  clearBtnRef.current?.focus();
                }
              }}
            >
              <EditIcon sx={{ fontSize: 15 }} />
              <span>Edit</span>
            </button>

            <button
              ref={clearBtnRef}
              type="button"
              className="group-btn group-btn-tertiary"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleClear();
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  if (editingId) {
                    editBtnRef.current?.focus();
                  } else {
                    saveBtnRef.current?.focus();
                  }
                }
              }}
            >
              <ClearIcon sx={{ fontSize: 15 }} />
              <span>Clear</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      <Dialog
        open={saveConfirmOpen}
        onClose={() => {
          setSaveConfirmOpen(false);
          setTimeout(() => saveBtnRef.current?.focus(), 50);
        }}
        PaperProps={{ sx: { borderRadius: 2, p: 0.5, minWidth: 280 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
          Save Group
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontSize: '12px' }} color="#64748b">
            Do you want to save this group?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button
            onClick={() => {
              setSaveConfirmOpen(false);
              setTimeout(() => saveBtnRef.current?.focus(), 50);
            }}
            sx={{ color: '#64748b', textTransform: 'none', fontWeight: 600, fontSize: '12px' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveConfirm}
            autoFocus
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 2.5,
              fontSize: '12px',
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
        TransitionProps={{
          onExited: () => {
            focusGroupName();
          },
        }}
        PaperProps={{ sx: { borderRadius: 2, p: 0.5, minWidth: 280 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
          Saved Successfully
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontSize: '12px' }} color="#64748b">
            Group has been saved successfully.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
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
              px: 2.5,
              fontSize: '12px',
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Confirmation Dialog */}
      <Dialog
        open={editConfirmOpen}
        onClose={() => {
          setEditConfirmOpen(false);
          setTimeout(() => editBtnRef.current?.focus(), 50);
        }}
        PaperProps={{ sx: { borderRadius: 2, p: 0.5, minWidth: 280 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
          Edit Group
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontSize: '12px' }} color="#64748b">
            Do you want to update this group?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button
            onClick={() => {
              setEditConfirmOpen(false);
              setTimeout(() => editBtnRef.current?.focus(), 50);
            }}
            sx={{ color: '#64748b', textTransform: 'none', fontWeight: 600, fontSize: '12px' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditConfirm}
            autoFocus
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 1.5,
              px: 2.5,
              fontSize: '12px',
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
        TransitionProps={{
          onExited: () => {
            focusGroupName();
          },
        }}
        PaperProps={{ sx: { borderRadius: 2, p: 0.5, minWidth: 280 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
          Updated Successfully
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontSize: '12px' }} color="#64748b">
            Group has been updated successfully.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
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
              px: 2.5,
              fontSize: '12px',
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Group Name Dialog */}
      <Dialog
        open={changeNameDialogOpen}
        onClose={() => {
          setChangeNameDialogOpen(false);
          focusGroupName();
        }}
        TransitionProps={{
          onExited: () => {
            focusGroupName();
          },
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, p: 0.5 } }}
      >
        <DialogTitle sx={{ fontWeight: 600, fontSize: '15px', color: '#1e293b' }}>
          Change Group Name
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Group Code"
            value={changeNameCode}
            disabled
            margin="dense"
            InputLabelProps={{ shrink: true, sx: { fontSize: '11.5px' } }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '6px',
                bgcolor: '#f1f5f9',
                fontSize: '11.5px',
                height: '33px',
              },
            }}
          />
          <TextField
            fullWidth
            size="small"
            label="Group Name"
            value={changeNameValue}
            onChange={(e) => setChangeNameValue(e.target.value)}
            margin="dense"
            required
            autoFocus
            InputLabelProps={{ shrink: true, sx: { fontSize: '11.5px' } }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!changeNameSaving && changeNameValue.trim()) {
                  handleChangeNameSave();
                }
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '6px',
                fontSize: '11.5px',
                height: '33px',
                '& fieldset': { borderColor: '#e2e8f0' },
                '&:hover fieldset': { borderColor: '#cbd5e1' },
                '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button
            onClick={() => {
              setChangeNameDialogOpen(false);
              focusGroupName();
            }}
            sx={{ color: '#64748b', textTransform: 'none', fontWeight: 600, fontSize: '12px' }}
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
              px: 2.5,
              fontSize: '12px',
            }}
          >
            {changeNameSaving ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
