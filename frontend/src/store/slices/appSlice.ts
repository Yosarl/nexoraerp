import { createSlice } from '@reduxjs/toolkit';

const savedCompanyId = localStorage.getItem('selectedCompanyId');
const savedFinancialYearId = localStorage.getItem('selectedFinancialYearId');

interface AppState {
  selectedCompanyId: string | null;
  selectedFinancialYearId: string | null;
  drawerOpen: boolean;
}

const initialState: AppState = {
  selectedCompanyId: savedCompanyId,
  selectedFinancialYearId: savedFinancialYearId,
  drawerOpen: false,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setCompany: (state, action) => {
      state.selectedCompanyId = action.payload;
      if (action.payload) localStorage.setItem('selectedCompanyId', action.payload);
      else localStorage.removeItem('selectedCompanyId');
    },
    setFinancialYear: (state, action) => {
      state.selectedFinancialYearId = action.payload;
      if (action.payload) localStorage.setItem('selectedFinancialYearId', action.payload);
      else localStorage.removeItem('selectedFinancialYearId');
    },
    setDrawerOpen: (state, action) => {
      state.drawerOpen = action.payload;
    },
    toggleDrawer: (state) => {
      state.drawerOpen = !state.drawerOpen;
    },
  },
});

export const { setCompany, setFinancialYear, setDrawerOpen, toggleDrawer } = appSlice.actions;
export default appSlice.reducer;
