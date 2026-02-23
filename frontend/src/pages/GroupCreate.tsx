import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  MenuItem,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useAppSelector } from '../store/hooks';
import { ledgerGroupApi } from '../services/api';

const GROUP_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'] as const;

type GroupOption = { _id: string; name: string; code: string; type: string };

export default function GroupCreate() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('Asset');

  // Selection state
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
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

  // Load groups for search
  useEffect(() => {
    if (!companyId) return;
    const search = groupSearch.trim() || undefined;
    ledgerGroupApi.list(companyId, search).then((res) => {
      setGroupOptions((res.data.data as GroupOption[]) ?? []);
    });
  }, [companyId, groupSearch]);

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
  }, []);

  // Handle group selection
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

  // Clear form
  const handleClear = async () => {
    setEditingId(null);
    setSelectedGroup(null);
    setGroupSearch('');
    setName('');
    setType('Asset');
    setError(null);
    await loadNextCode();
  };

  // Save new group
  const handleSaveClick = () => {
    if (!name.trim()) {
      setError('Group name is required');
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
      });
      setSavedDialogOpen(true);
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
      });
      setEditedDialogOpen(true);
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
    const groupId = selectedGroup._id;
    setChangeNameSaving(true);
    setError(null);
    try {
      await ledgerGroupApi.update(groupId, companyId, {
        name: changeNameValue.trim(),
        type: selectedGroup.type,
      });
      // Update the local state
      setGroupOptions((prev) =>
        prev.map((o) => (o._id === groupId ? { ...o, name: changeNameValue.trim() } : o))
      );
      setSelectedGroup((prev) => prev ? { ...prev, name: changeNameValue.trim() } : null);
      setGroupSearch(changeNameValue.trim());
      setName(changeNameValue.trim());
      setChangeNameDialogOpen(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? 'Failed to update name');
    } finally {
      setChangeNameSaving(false);
    }
  };

  if (!companyId) return <Typography color="error">Select a company first.</Typography>;

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Group Reg</Typography>
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
      
      <Paper sx={{ p: 3, maxWidth: 500 }}>
        {/* Group Name (Autocomplete) with Change Name Button */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 2 }}>
          <Autocomplete
            freeSolo
            size="small"
            disabled={!!selectedGroup}
            options={selectedGroup && !groupOptions.some((o) => o._id === selectedGroup._id) ? [selectedGroup, ...groupOptions] : groupOptions}
            getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt?.name ?? '')}
            value={selectedGroup != null ? selectedGroup : (groupSearch.trim() ? groupSearch : null)}
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
                label="Group Name"
                required
              />
            )}
            renderOption={(props, option) => (
              <li {...props} key={option._id} style={{ padding: '10px 14px', minHeight: 44 }}>
                <Box>
                  <Typography variant="body1" fontWeight={500}>{option.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {option.code} • {option.type}
                  </Typography>
                </Box>
              </li>
            )}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleOpenChangeName}
            disabled={!selectedGroup}
            sx={{ 
              minWidth: 'auto', 
              px: 1, 
              py: 1,
              fontSize: '0.7rem',
              whiteSpace: 'nowrap',
            }}
          >
            Change Name
          </Button>
        </Box>

        {/* Group Code (Auto-generated, read-only) */}
        <TextField
          fullWidth
          size="small"
          label="Group Code"
          value={code}
          margin="normal"
          disabled
          helperText="Auto-generated"
          InputLabelProps={{ shrink: true }}
        />

        {/* Group Type */}
        <TextField
          fullWidth
          select
          size="small"
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          margin="normal"
          required
        >
          {GROUP_TYPES.map((t) => (
            <MenuItem key={t} value={t}>{t}</MenuItem>
          ))}
        </TextField>

        {/* Buttons */}
        <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" onClick={handleSaveClick} disabled={saving}>
            Save
          </Button>
          <Button variant="outlined" onClick={handleEditClick} disabled={!editingId || saving}>
            Edit
          </Button>
          <Button variant="outlined" onClick={handleClear}>
            Clear
          </Button>
        </Box>
      </Paper>

      {/* Save Confirmation Dialog */}
      <Dialog open={saveConfirmOpen} onClose={() => setSaveConfirmOpen(false)}>
        <DialogTitle>Save Group</DialogTitle>
        <DialogContent>
          <Typography>Do you want to save this group?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveConfirm}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Saved Dialog */}
      <Dialog open={savedDialogOpen} onClose={() => { setSavedDialogOpen(false); handleClear(); }}>
        <DialogTitle>Saved</DialogTitle>
        <DialogContent>
          <Typography>Group has been saved successfully.</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => { setSavedDialogOpen(false); handleClear(); }} autoFocus>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Confirmation Dialog */}
      <Dialog open={editConfirmOpen} onClose={() => setEditConfirmOpen(false)}>
        <DialogTitle>Edit Group</DialogTitle>
        <DialogContent>
          <Typography>Do you want to update this group?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditConfirm}>OK</Button>
        </DialogActions>
      </Dialog>

      {/* Edited Dialog */}
      <Dialog open={editedDialogOpen} onClose={() => { setEditedDialogOpen(false); handleClear(); }}>
        <DialogTitle>Edited</DialogTitle>
        <DialogContent>
          <Typography>Group has been updated successfully.</Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => { setEditedDialogOpen(false); handleClear(); }} autoFocus>
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Group Name Dialog */}
      <Dialog open={changeNameDialogOpen} onClose={() => setChangeNameDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Change Group Name</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Group Code"
            value={changeNameCode}
            disabled
            margin="normal"
            InputLabelProps={{ shrink: true }}
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
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeNameDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleChangeNameSave}
            disabled={changeNameSaving || !changeNameValue.trim()}
          >
            {changeNameSaving ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
