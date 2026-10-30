import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import { useAppSelector } from '../store/hooks';
import { productApi } from '../services/api';
import ProductTransactionsModal from '../components/ProductTransactionsModal';

interface UnitInfo {
  _id: string;
  name?: string;
  shortCode?: string;
}

interface MultiUnitItem {
  multiUnitId?: string;
  imei?: string;
  conversion?: number;
  price?: number;
  totalPrice?: number;
  unitId?: UnitInfo | string;
  wholesale?: number;
  retail?: number;
  specialPrice1?: number;
  specialPrice2?: number;
}

interface ProductItem {
  _id: string;
  name: string;
  sku: string;
  code?: string;
  systemBarcode?: string;
  unitOfMeasureId?: UnitInfo | string;
  unit?: string;
  category?: string;
  sellingPrice: number;
  retailPrice?: number;
  purchasePrice: number;
  wholesalePrice?: number;
  imei?: string;
  multiUnits?: MultiUnitItem[];
}

type FilterType = 'all' | 'multi' | 'single';

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

function getInitials(name: string) {
  const words = (name || '').trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (name || '').slice(0, 2).toUpperCase() || 'PR';
}

export default function ProductList() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 50;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [hasScrollMore, setHasScrollMore] = useState(false);

  // Multi Unit Dialog state
  const [multiUnitDialogOpen, setMultiUnitDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [detailedProduct, setDetailedProduct] = useState<ProductItem | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Delete Dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<ProductItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Product Transactions Dialog state
  const [transactionsDialogOpen, setTransactionsDialogOpen] = useState(false);
  const [productForTransactions, setProductForTransactions] = useState<ProductItem | null>(null);

  const handleOpenTransactions = (p: ProductItem) => {
    setProductForTransactions(p);
    setTransactionsDialogOpen(true);
  };

  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  // Keyboard shortcut Ctrl+K / Cmd+K for search
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

  const checkScroll = useCallback(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    const hasScroll = el.scrollHeight > el.clientHeight;
    const isScrolledToBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    setHasScrollMore(hasScroll && !isScrolledToBottom);
  }, []);

  const loadProducts = useCallback(() => {
    if (!companyId) return;
    setLoading(true);
    productApi
      .list(companyId, {
        search: search.trim() || undefined,
        page,
        limit,
      })
      .then((res) => {
        const d = res.data.data as { products: ProductItem[]; total: number };
        setProducts(d?.products ?? []);
        setTotal(d?.total ?? 0);
      })
      .catch(() => {
        setProducts([]);
        setTotal(0);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [companyId, search, page, limit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadProducts]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/master/products' || p === '/report/product-list' || p === '/master/products/management') {
        loadProducts();
      }
    };
    const onDatabaseUpdated = () => {
      if (
        window.location.hash.includes('/products') ||
        window.location.pathname.includes('/products') ||
        window.location.hash.includes('/product-list') ||
        window.location.pathname.includes('/product-list')
      ) {
        loadProducts();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:products-updated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:products-updated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [loadProducts]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  useEffect(() => {
    const t = setTimeout(checkScroll, 120);
    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', checkScroll);
    };
  }, [products, checkScroll]);

  const handleOpenMultiUnit = useCallback(
    (p: ProductItem) => {
      setSelectedProduct(p);
      setDetailedProduct(p);
      setMultiUnitDialogOpen(true);

      if (companyId) {
        setLoadingDetails(true);
        productApi
          .get(p._id, companyId)
          .then((res) => {
            const data = res.data?.data as ProductItem;
            if (data) {
              setDetailedProduct(data);
            }
          })
          .catch((err) => {
            console.error('Failed to load full product details', err);
          })
          .finally(() => {
            setLoadingDetails(false);
          });
      }
    },
    [companyId]
  );

  const handleConfirmDelete = async () => {
    if (!companyId || !productToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await productApi.delete(productToDelete._id, companyId);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
      loadProducts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to delete product. It may be referenced in transactions.';
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  const getUnitDisplay = (p: ProductItem): string => {
    if (p.unitOfMeasureId && typeof p.unitOfMeasureId === 'object') {
      return p.unitOfMeasureId.shortCode || p.unitOfMeasureId.name || 'Pcs';
    }
    return p.unit || 'Pcs';
  };

  const getMultiUnitName = (u: MultiUnitItem): string => {
    if (u.unitId && typeof u.unitId === 'object') {
      return u.unitId.shortCode || u.unitId.name || 'Unit';
    }
    return String(u.unitId || 'Unit');
  };

  const filteredProducts = useMemo(() => {
    if (filterType === 'multi') {
      return products.filter((p) => p.multiUnits && p.multiUnits.length > 0);
    }
    if (filterType === 'single') {
      return products.filter((p) => !p.multiUnits || p.multiUnits.length === 0);
    }
    return products;
  }, [products, filterType]);

  const multiCount = useMemo(
    () => products.filter((p) => p.multiUnits && p.multiUnits.length > 0).length,
    [products]
  );
  const singleCount = Math.max(0, products.length - multiCount);

  const handleExportCSV = () => {
    if (products.length === 0) return;
    const headers = ['Product Name', 'SKU', 'GTIN / Barcode', 'Base Unit', 'Selling Price (AED)', 'Purchase Price (AED)', 'Multi Units Count'];
    const rows = products.map((p) => [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${p.sku || p.code || ''}"`,
      `"${p.imei || ''}"`,
      `"${getUnitDisplay(p)}"`,
      Number(p.sellingPrice ?? p.retailPrice ?? 0).toFixed(2),
      Number(p.purchasePrice ?? 0).toFixed(2),
      p.multiUnits?.length || 0,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `products_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!companyId) {
    return (
      <div className="product-catalog-root">
        <style>{clearStyles}</style>
        <div className="empty-company-card">
          <div className="empty-company-icon">🏢</div>
          <h2>No Company Selected</h2>
          <p>Please select a company from the top navigation to view and manage products.</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / limit) || 1;
  const activeProduct = detailedProduct || selectedProduct;
  const baseUnitLabel = activeProduct ? getUnitDisplay(activeProduct) : 'Pcs';
  const multiUnitsList = activeProduct?.multiUnits ?? [];

  return (
    <div className="product-catalog-root">
      <style>{clearStyles}</style>

      {/* 1. Header Section */}
      <div className="catalog-header">
        <div className="header-text-group">
          <div className="header-title-line">
            <h1 className="catalog-title">Product Catalog</h1>
            <span className="catalog-badge">
              <span className="dot-pulse" />
              UAE FTA Standard Verified
            </span>
          </div>
          <p className="catalog-desc">
            Manage multi-unit conversions, retail selling rates, purchase costs, and barcode inventory.
          </p>
        </div>

        <div className="header-actions-group">
          <button type="button" className="btn-export" onClick={handleExportCSV} title="Export current list to CSV">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button type="button" className="btn-create" onClick={() => navigate('/master/products/create')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Product
          </button>
        </div>
      </div>

      {/* Main Data Card */}
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
              placeholder="Search by product name, SKU, or GTIN / barcode..."
              value={search}
              onChange={handleSearchChange}
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
              className={`filter-pill ${filterType === 'all' ? 'pill-active' : ''}`}
              onClick={() => setFilterType('all')}
            >
              All Products ({total})
            </button>
            <button
              type="button"
              className={`filter-pill ${filterType === 'multi' ? 'pill-active' : ''}`}
              onClick={() => setFilterType('multi')}
            >
              Multi-Unit ({multiCount})
            </button>
            <button
              type="button"
              className={`filter-pill ${filterType === 'single' ? 'pill-active' : ''}`}
              onClick={() => setFilterType('single')}
            >
              Single Unit ({singleCount})
            </button>
          </div>

          <div className="toolbar-right-btns">
            <button
              type="button"
              className="btn-refresh"
              onClick={() => loadProducts()}
              title="Refresh Catalog Data"
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
            <strong>Pro Tip:</strong> Double-click any row to view all <strong>Transactions (Purchase, Sales, Stock Adj, Damage, etc.)</strong> with voucher details. Click the Multi-Unit badge to view rate matrix.
          </span>
        </div>

        {/* Table Container */}
        <div className="table-scroll-area" ref={tableScrollRef} onScroll={checkScroll}>
          <table className="clean-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Product Name</th>
                <th style={{ width: '15%' }}>SKU / Code</th>
                <th style={{ width: '15%' }}>GTIN / Barcode</th>
                <th style={{ width: '16%' }} className="text-center">Multi-Unit Status</th>
                <th style={{ width: '12%' }} className="text-right">Selling Rate</th>
                <th style={{ width: '11%' }} className="text-right">Cost Rate</th>
                <th style={{ width: '9%' }} className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="td-loading">
                    <div className="loading-row">
                      <div className="spinner-circle" />
                      <span>Loading products catalog...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="td-empty">
                    <div className="empty-box">
                      <div className="empty-icon-wrap">📦</div>
                      <div className="empty-title-text">
                        {search
                          ? 'No products found matching your search.'
                          : filterType !== 'all'
                          ? 'No products match the selected filter.'
                          : 'No products registered yet.'}
                      </div>
                      <p className="empty-sub-text">
                        {search
                          ? 'Try clearing the search term or switching filter tabs.'
                          : 'Get started by creating your first product item.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const colors = getAvatarColors(p.name);
                  const initials = getInitials(p.name);
                  const hasMultiUnits = p.multiUnits && p.multiUnits.length > 0;

                  return (
                    <tr
                      key={p._id}
                      className="data-row"
                      onDoubleClick={() => handleOpenTransactions(p)}
                      title="Double-click to view Product Transactions & Stock Ledger"
                    >
                      <td>
                        <div className="product-identity-wrap">
                          <div
                            className="avatar-circle"
                            style={{ backgroundColor: colors.tint, color: colors.ink }}
                          >
                            {initials}
                          </div>
                          <div className="product-details-wrap">
                            <div className="product-title-text" title={p.name}>
                              {p.name}
                            </div>
                            <div className="product-unit-text">
                              Main Unit: <strong>{getUnitDisplay(p)}</strong>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="sku-badge">{p.sku || p.code || '—'}</span>
                      </td>

                      <td>
                        <span className={p.imei ? 'imei-badge' : 'dash-text'}>
                          {p.imei || '—'}
                        </span>
                      </td>

                      <td className="text-center" onClick={(e) => hasMultiUnits && e.stopPropagation()}>
                        {hasMultiUnits ? (
                          <button
                            type="button"
                            className="multi-unit-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenMultiUnit(p);
                            }}
                            title="Click to view multi-unit price matrix"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                              <rect x="3" y="3" width="7" height="7"></rect>
                              <rect x="14" y="3" width="7" height="7"></rect>
                              <rect x="14" y="14" width="7" height="7"></rect>
                              <rect x="3" y="14" width="7" height="7"></rect>
                            </svg>
                            +{p.multiUnits!.length} Units
                          </button>
                        ) : (
                          <span className="single-unit-text">{getUnitDisplay(p)}</span>
                        )}
                      </td>

                      <td className="text-right">
                        <div className="price-selling-text">
                          {Number(p.sellingPrice ?? p.retailPrice ?? 0).toFixed(2)}
                        </div>
                        <div className="vat-text">AED (VAT incl.)</div>
                      </td>

                      <td className="text-right">
                        <div className="price-cost-text">
                          {Number(p.purchasePrice ?? 0).toFixed(2)} AED
                        </div>
                      </td>

                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="action-row">
                          <button
                            type="button"
                            className="btn-action btn-action-view"
                            title="View Product Transactions (or double-click row)"
                            onClick={() => handleOpenTransactions(p)}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              <line x1="16" y1="13" x2="8" y2="13"></line>
                              <line x1="16" y1="17" x2="8" y2="17"></line>
                              <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action-edit"
                            title="Edit Product"
                            onClick={() => navigate(`/master/products/create?edit=${p._id}`)}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="btn-action btn-action-delete"
                            title="Delete Product"
                            onClick={() => {
                              setProductToDelete(p);
                              setDeleteError(null);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
          <div className={`scroll-indicator-pill ${hasScrollMore ? 'show' : ''}`}>
            ↓ Scroll for more products
          </div>
        </div>

        {/* Card Footer */}
        <div className="card-footer">
          <div>
            Showing {products.length > 0 ? (page - 1) * limit + 1 : 0}
            {products.length > 1 ? `-${(page - 1) * limit + products.length}` : ''} of {total} products
            {filterType !== 'all' && (
              <span className="filter-badge-text">
                {' '}• Filtered by {filterType === 'multi' ? 'Multi-Unit' : 'Single Unit'}
              </span>
            )}
          </div>
          {totalPages > 1 && (
            <div className="pagination-wrap">
              <button
                className="btn-nav-page"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ‹ Prev
              </button>
              <span className="page-label">
                {page} / {totalPages}
              </span>
              <button
                className="btn-nav-page"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Product Transactions Modal */}
      <ProductTransactionsModal
        open={transactionsDialogOpen}
        onClose={() => {
          setTransactionsDialogOpen(false);
          setProductForTransactions(null);
        }}
        productId={productForTransactions?._id ?? null}
        productName={productForTransactions?.name}
        productCode={productForTransactions?.sku || productForTransactions?.code}
      />

      {/* Multi Unit Details Dialog */}
      <Dialog
        open={multiUnitDialogOpen}
        onClose={() => setMultiUnitDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '14px',
            padding: '4px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2, px: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>
                Multi Unit Price Matrix
              </div>
              <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <span>Product: <strong style={{ color: '#0F172A' }}>{activeProduct?.name}</strong></span>
                <span>SKU: <strong style={{ color: '#0F172A' }}>{activeProduct?.sku || activeProduct?.code || '—'}</strong></span>
                <span>Base Unit: <strong style={{ color: '#4F46E5' }}>{baseUnitLabel}</strong></span>
              </div>
            </div>
            {loadingDetails && (
              <span style={{ fontSize: '12px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="spinner-circle-sm" /> updating...
              </span>
            )}
          </div>
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 1 }}>
          {multiUnitsList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: '#F8FAFC', borderRadius: '10px', border: '1px dashed #E2E8F0' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                No Multi Units Configured
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748B' }}>
                This product only has its base unit (<strong>{baseUnitLabel}</strong>). Additional units can be defined in Product Registration.
              </div>
            </div>
          ) : (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>Unit Name</th>
                    <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>Conversion Factor</th>
                    <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: '#475569' }}>GTIN / Barcode</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Retail (AED)</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Wholesale (AED)</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Special 1</th>
                    <th style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>Special 2</th>
                  </tr>
                </thead>
                <tbody>
                  {multiUnitsList.map((u, idx) => (
                    <tr key={u.multiUnitId || idx} style={{ borderBottom: idx === multiUnitsList.length - 1 ? 'none' : '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                        {getMultiUnitName(u)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', color: '#475569', fontWeight: 600 }}>
                        {u.conversion ? `= ${u.conversion} ${baseUnitLabel}` : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: "'Courier New', monospace", fontWeight: 700, color: '#0369A1' }}>
                        {u.imei || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                        {u.retail !== undefined && u.retail !== null ? Number(u.retail).toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                        {u.wholesale !== undefined && u.wholesale !== null ? Number(u.wholesale).toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                        {u.specialPrice1 !== undefined && u.specialPrice1 !== null ? Number(u.specialPrice1).toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#475569' }}>
                        {u.specialPrice2 !== undefined && u.specialPrice2 !== null ? Number(u.specialPrice2).toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setMultiUnitDialogOpen(false)}
            sx={{
              color: '#64748B',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
              '&:hover': { background: '#F1F5F9' },
            }}
          >
            Close
          </Button>
          {activeProduct && (
            <Button
              variant="contained"
              onClick={() => {
                setMultiUnitDialogOpen(false);
                navigate(`/master/products/create?edit=${activeProduct._id}`);
              }}
              sx={{
                background: 'linear-gradient(135deg, #4F46E5 0%, #4338CA 100%)',
                color: '#fff',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '13px',
                borderRadius: '8px',
                boxShadow: 'none',
              }}
            >
              Edit Product
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '14px',
            padding: '4px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2, px: 3, fontWeight: 700, fontSize: '17px', color: '#0F172A' }}>
          Delete Product
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 1 }}>
          <p style={{ color: '#475569', fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
            Are you sure you want to delete <strong>{productToDelete?.name}</strong> (SKU: {productToDelete?.sku || productToDelete?.code || '—'})?
          </p>
          <p style={{ color: '#DC2626', fontSize: '12px', marginTop: '8px', marginBottom: 0 }}>
            ⚠️ This action cannot be undone.
          </p>
          {deleteError && (
            <div
              style={{
                marginTop: '12px',
                padding: '8px 12px',
                background: '#FEF2F2',
                color: '#B91C1C',
                border: '1px solid #FECACA',
                borderRadius: '6px',
                fontSize: '12.5px',
              }}
            >
              {deleteError}
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
            sx={{
              color: '#64748B',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
              '&:hover': { background: '#F1F5F9' },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={deleting}
            onClick={handleConfirmDelete}
            sx={{
              background: '#DC2626',
              '&:hover': { background: '#B91C1C' },
              color: '#fff',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
              boxShadow: 'none',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

const clearStyles = `
  .product-catalog-root {
    --primary: #4F46E5;
    --primary-light: #EEF2FF;
    --primary-hover: #4338CA;
    --text-heading: #0F172A;
    --text-body: #334155;
    --text-muted: #64748B;
    --border-color: #E2E8F0;
    --border-light: #F1F5F9;
    --bg-page: #F8FAFC;
    --bg-card: #FFFFFF;
    --radius-lg: 14px;
    --radius-md: 10px;
    --radius-sm: 6px;
    --shadow-card: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);

    background-color: var(--bg-page);
    min-height: 100%;
    padding: 24px 28px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-body);
    box-sizing: border-box;
  }

  .product-catalog-root *,
  .product-catalog-root *::before,
  .product-catalog-root *::after {
    box-sizing: border-box;
  }

  /* Header */
  .product-catalog-root .catalog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .product-catalog-root .header-title-line {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .product-catalog-root .catalog-title {
    font-size: 24px;
    font-weight: 800;
    color: var(--text-heading);
    letter-spacing: -0.02em;
    margin: 0;
  }

  .product-catalog-root .catalog-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background-color: #ECFDF5;
    color: #047857;
    border: 1px solid #A7F3D0;
    padding: 3px 10px;
    border-radius: 9999px;
    font-size: 11.5px;
    font-weight: 600;
  }

  .product-catalog-root .dot-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #10B981;
    display: inline-block;
  }

  .product-catalog-root .catalog-desc {
    margin: 4px 0 0 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  .product-catalog-root .header-actions-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .product-catalog-root .btn-export {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background-color: #FFFFFF;
    color: #334155;
    border: 1px solid var(--border-color);
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .product-catalog-root .btn-export:hover {
    background-color: #F8FAFC;
    border-color: #CBD5E1;
  }

  .product-catalog-root .btn-create {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: linear-gradient(135deg, #4F46E5 0%, #4338CA 100%);
    color: #FFFFFF;
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);
    transition: all 0.15s ease;
  }

  .product-catalog-root .btn-create:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
  }

  /* Main Card */
  .product-catalog-root .main-data-card {
    background-color: var(--bg-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }

  /* Toolbar */
  .product-catalog-root .card-toolbar {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    background-color: #FFFFFF;
  }

  .product-catalog-root .search-box-wrapper {
    position: relative;
    flex: 1;
    min-width: 260px;
    max-width: 380px;
  }

  .product-catalog-root .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #94A3B8;
    pointer-events: none;
  }

  .product-catalog-root .search-input-field {
    width: 100%;
    height: 38px;
    padding: 0 70px 0 38px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background-color: #F8FAFC;
    color: var(--text-heading);
    font-size: 13px;
    outline: none;
    transition: all 0.15s ease;
  }

  .product-catalog-root .search-input-field:focus {
    background-color: #FFFFFF;
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
  }

  .product-catalog-root .clear-search-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #94A3B8;
    cursor: pointer;
    display: flex;
    padding: 3px;
  }

  .product-catalog-root .kbd-badge {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 10.5px;
    font-weight: 700;
    background-color: #EDF2F7;
    color: #718096;
    border: 1px solid #E2E8F0;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .product-catalog-root .filter-pill-cluster {
    display: inline-flex;
    background-color: #F1F5F9;
    padding: 3px;
    border-radius: 8px;
    gap: 3px;
  }

  .product-catalog-root .filter-pill {
    border: none;
    background-color: transparent;
    color: #64748B;
    font-size: 12.5px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .product-catalog-root .filter-pill:hover {
    color: var(--text-heading);
  }

  .product-catalog-root .filter-pill.pill-active {
    background-color: #FFFFFF;
    color: var(--primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  .product-catalog-root .toolbar-right-btns {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .product-catalog-root .btn-refresh {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
    background-color: #FFFFFF;
    color: #64748B;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .product-catalog-root .btn-refresh:hover {
    background-color: #F8FAFC;
    color: var(--text-heading);
  }

  /* Info Tip Bar */
  .product-catalog-root .info-tip-bar {
    padding: 9px 20px;
    background-color: #F8FAFC;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: 12.5px;
    color: #475569;
  }

  /* Table */
  .product-catalog-root .table-scroll-area {
    max-height: clamp(300px, calc(100vh - 290px), 680px);
    overflow-y: auto;
    position: relative;
  }

  .product-catalog-root .clean-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    text-align: left;
  }

  .product-catalog-root .clean-table thead th {
    position: sticky;
    top: 0;
    z-index: 10;
    background-color: #F8FAFC;
    color: #475569;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 11px 18px;
    border-bottom: 1.5px solid var(--border-color);
  }

  .product-catalog-root .clean-table tbody tr {
    border-bottom: 1px solid #F1F5F9;
    transition: background-color 0.15s ease;
    cursor: pointer;
  }

  .product-catalog-root .clean-table tbody tr:hover {
    background-color: #F8FAFC;
  }

  .product-catalog-root .clean-table tbody td {
    padding: 12px 18px;
    vertical-align: middle;
  }

  .product-catalog-root .text-right {
    text-align: right;
  }

  .product-catalog-root .text-center {
    text-align: center;
  }

  /* Product identity */
  .product-catalog-root .product-identity-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .product-catalog-root .avatar-circle {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12.5px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .product-catalog-root .product-details-wrap {
    min-width: 0;
  }

  .product-catalog-root .product-title-text {
    font-weight: 700;
    color: var(--text-heading);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 320px;
    font-size: 13.5px;
  }

  .product-catalog-root .product-unit-text {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 1px;
  }

  /* Badges */
  .product-catalog-root .sku-badge {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 12px;
    font-weight: 600;
    color: #475569;
    background-color: #F1F5F9;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid #E2E8F0;
  }

  .product-catalog-root .imei-badge {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 11.5px;
    font-weight: 500;
    color: #0369A1;
    background-color: #F0F9FF;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid #BAE6FD;
  }

  .product-catalog-root .dash-text {
    color: #CBD5E1;
  }

  .product-catalog-root .multi-unit-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background-color: #EEF2FF;
    color: #4F46E5;
    border: 1px solid #C7D2FE;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .product-catalog-root .multi-unit-btn:hover {
    background-color: #4F46E5;
    color: #FFFFFF;
    border-color: #4F46E5;
  }

  .product-catalog-root .single-unit-text {
    font-size: 12px;
    color: #94A3B8;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  }

  /* Rates */
  .product-catalog-root .price-selling-text {
    font-weight: 700;
    font-size: 13.5px;
    color: #059669;
  }

  .product-catalog-root .vat-text {
    font-size: 10.5px;
    color: #94A3B8;
    margin-top: 1px;
  }

  .product-catalog-root .price-cost-text {
    font-size: 13.5px;
    color: #475569;
    font-weight: 500;
  }

  /* Actions */
  .product-catalog-root .action-row {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .product-catalog-root .btn-action {
    width: 30px;
    height: 30px;
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

  .product-catalog-root .btn-action-view:hover {
    background-color: #EEF2FF;
    color: #4F46E5;
    border-color: #C7D2FE;
  }

  .product-catalog-root .btn-action-edit:hover {
    background-color: #F0FDF4;
    color: #16A34A;
    border-color: #BBF7D0;
  }

  .product-catalog-root .btn-action-delete:hover {
    background-color: #FEF2F2;
    color: #DC2626;
    border-color: #FECACA;
  }

  /* Empty & Loading States */
  .product-catalog-root .td-loading,
  .product-catalog-root .td-empty {
    text-align: center;
    padding: 48px 16px;
  }

  .product-catalog-root .loading-row {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: #64748B;
    font-size: 13.5px;
    font-weight: 600;
  }

  .product-catalog-root .spinner-circle {
    width: 16px;
    height: 16px;
    border: 2px solid #CBD5E1;
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .product-catalog-root .spinner-circle-sm {
    width: 12px;
    height: 12px;
    border: 2px solid #CBD5E1;
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }

  .product-catalog-root .spin-icon {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .product-catalog-root .empty-box {
    text-align: center;
    color: #64748B;
  }

  .product-catalog-root .empty-icon-wrap {
    font-size: 38px;
    margin-bottom: 8px;
    opacity: 0.6;
  }

  .product-catalog-root .empty-title-text {
    font-size: 15px;
    font-weight: 700;
    color: #0F172A;
  }

  .product-catalog-root .empty-sub-text {
    font-size: 13px;
    color: #64748B;
    margin: 4px 0 0 0;
  }

  /* Card Footer */
  .product-catalog-root .card-footer {
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

  .product-catalog-root .filter-badge-text {
    color: var(--primary);
    font-weight: 600;
  }

  .product-catalog-root .pagination-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .product-catalog-root .btn-nav-page {
    border: 1px solid var(--border-color);
    background-color: #FFFFFF;
    color: var(--text-heading);
    padding: 5px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12.5px;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .product-catalog-root .btn-nav-page:hover:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }

  .product-catalog-root .btn-nav-page:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .product-catalog-root .page-label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
  }

  .product-catalog-root .scroll-indicator-pill {
    position: absolute;
    bottom: 12px;
    right: 16px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--primary);
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid var(--border-color);
    padding: 3px 10px;
    border-radius: 9999px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .product-catalog-root .scroll-indicator-pill.show {
    opacity: 1;
  }

  /* Empty Company */
  .product-catalog-root .empty-company-card {
    background-color: #FFFFFF;
    border-radius: 16px;
    padding: 48px;
    border: 1px solid #E2E8F0;
    text-align: center;
    max-width: 500px;
    margin: 40px auto;
  }

  .product-catalog-root .empty-company-icon {
    font-size: 44px;
    margin-bottom: 12px;
  }

  @media (max-width: 768px) {
    .product-catalog-root {
      padding: 16px;
    }

    .product-catalog-root .catalog-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .product-catalog-root .header-actions-group {
      width: 100%;
    }

    .product-catalog-root .btn-create,
    .product-catalog-root .btn-export {
      flex: 1;
      justify-content: center;
    }

    .product-catalog-root .search-box-wrapper {
      max-width: 100%;
    }
  }
`;
