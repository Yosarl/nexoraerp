import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { HashRouter } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import App from './App';
import { store } from './store';

const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#0d47a1' },
    background: { default: '#f5f5f5' },
  },
  typography: {
    fontFamily: '"Roboto","Helvetica","Arial",sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'input::-webkit-outer-spin-button, input::-webkit-inner-spin-button': {
          WebkitAppearance: 'none !important',
          margin: '0 !important',
        },
        'input[type=number]': {
          MozAppearance: 'textfield !important',
          appearance: 'textfield !important',
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </HashRouter>
    </Provider>
  </React.StrictMode>
);
